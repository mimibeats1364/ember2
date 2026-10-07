/**
 * Transporte HTTP cifrado para el motor de sincronización.
 *
 *   GET  {server}/v1/spaces/{space}/pull?cursor=N  → { records: SealedRecord[], cursor, more }
 *   POST {server}/v1/spaces/{space}/push           ← { records: SealedRecord[] }
 *
 * Con `Authorization: Bearer <token>`. El servidor (ver `server/`) solo guarda blobs opacos y se
 * queda con la versión de marca HLC mayor para cada clave. Cifrar y descifrar ocurre aquí.
 */
import { openRecord, sealRecord, type SealedRecord, type SyncKeys } from './crypto';
import type { ChangeRecord, PullResult, Transport } from './engine';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class SyncHttpError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'no_space' | 'server' | 'network' | 'too_large' | 'bad_response',
    readonly status = 0,
  ) {
    super(`sync_${code}`);
  }
}

const PUSH_CHUNK = 400;

export function normalizeServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = `${/^(localhost|127\.|\[::1\])/.test(s) ? 'http' : 'https'}://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    // HTTP sin cifrar solo en este mismo equipo (desarrollo o un servidor local); fuera, HTTPS.
    if (u.protocol === 'http:' && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(u.hostname)) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export class HttpTransport implements Transport {
  /** Registros que no se pudieron descifrar (otra clave o datos corruptos): se ignoran. */
  skipped = 0;

  constructor(
    private server: string,
    private keys: SyncKeys,
    private opts: { fetch?: FetchLike; timeoutMs?: number; /** Si el espacio no existe, se crea al subir. */ create?: boolean } = {},
  ) {}

  private async call(path: string, init: { method?: string; body?: string; root?: boolean } = {}): Promise<unknown> {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20_000) : null;
    const fetchFn: FetchLike = this.opts.fetch ?? ((url, init) => fetch(url, init));
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchFn(init.root ? `${this.server}${path}` : `${this.server}/v1/spaces/${this.keys.space}${path}`, {
        method: init.method ?? 'GET',
        headers: { authorization: `Bearer ${this.keys.token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
        body: init.body,
        signal: ctrl?.signal,
      });
    } catch {
      throw new SyncHttpError('network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new SyncHttpError('unauthorized', res.status);
    if (res.status === 404) throw new SyncHttpError('no_space', res.status);
    if (res.status === 413) throw new SyncHttpError('too_large', res.status);
    if (!res.ok) throw new SyncHttpError('server', res.status);
    try {
      return await res.json();
    } catch {
      throw new SyncHttpError('bad_response', res.status);
    }
  }

  async pull(cursor: string | null): Promise<PullResult> {
    const changes: ChangeRecord[] = [];
    let cur = cursor ?? '0';
    for (let page = 0; page < 200; page++) {
      let raw: unknown;
      try {
        raw = await this.call(`/pull?cursor=${encodeURIComponent(cur)}`);
      } catch (err) {
        // Espacio nuevo: aún no hay nada que bajar; la subida lo creará.
        if (this.opts.create && err instanceof SyncHttpError && err.code === 'no_space' && page === 0) return { changes, cursor: '0' };
        throw err;
      }
      const body = raw as { records?: SealedRecord[]; cursor?: string; more?: boolean };
      if (!Array.isArray(body.records) || typeof body.cursor !== 'string') throw new SyncHttpError('bad_response');
      for (const rec of body.records) {
        try {
          const { type, entity } = await openRecord(this.keys, rec);
          changes.push({ type, id: entity.id, entity });
        } catch {
          this.skipped++;
        }
      }
      cur = body.cursor;
      if (!body.more) break;
    }
    return { changes, cursor: cur };
  }

  async push(changes: ChangeRecord[]): Promise<void> {
    for (let i = 0; i < changes.length; i += PUSH_CHUNK) {
      const records = await Promise.all(changes.slice(i, i + PUSH_CHUNK).map((c) => sealRecord(this.keys, c.type, c.entity)));
      await this.call('/push', { method: 'POST', body: JSON.stringify({ records }) });
    }
  }

  /** ¿Responde un servidor de sincronización de Ember en esa dirección? */
  async health(): Promise<void> {
    const body = (await this.call('/v1/health', { root: true })) as { service?: string } | null;
    if (body?.service !== 'ember-sync') throw new SyncHttpError('bad_response');
  }

  /** Comprueba que el servidor responde y que el espacio de este código existe y es tuyo. */
  async check(): Promise<void> {
    await this.call('/pull?cursor=0&limit=1');
  }
}
