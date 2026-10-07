#!/usr/bin/env node
/**
 * Servidor de sincronización de Ember: autoalojable, sin dependencias, Node 18+.
 *
 * Solo guarda registros CIFRADOS `{ k, v, d }` agrupados por "espacio". No puede leer nada de lo
 * que escribes: las claves se derivan del código de sincronización en tus dispositivos y nunca
 * llegan aquí. Para cada clave se queda con la versión de marca HLC mayor (gana la más reciente).
 *
 *   GET  /v1/health
 *   GET  /v1/spaces/:space/pull?cursor=N&limit=500  → { records, cursor, more }
 *   POST /v1/spaces/:space/push   { records }       → { accepted, cursor }
 *
 * Autorización: `Authorization: Bearer <token>`. La primera SUBIDA a un espacio lo reclama con
 * ese token (se guarda solo su SHA-256); las siguientes peticiones tienen que traer el mismo.
 * Leer un espacio que no existe da 404 `no_space` (así un código mal escrito no crea uno vacío).
 *
 * Si STATIC_DIR apunta a la app web compilada (`npm run build` → dist/), también la sirve: con
 * un solo despliegue tienes la versión instalable para el móvil y la sincronización.
 *
 * Variables: PORT (8787), HOST (0.0.0.0), DATA_DIR (./ember-sync-data), MAX_SPACE_MB (200),
 * STATIC_DIR (sin valor: no sirve la app).
 */
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 1;
const SPACE_RE = /^[0-9a-f]{32}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const MAX_BODY = 8 * 1024 * 1024;
const MAX_RECORDS_PER_PUSH = 1000;
const MAX_RECORD_BYTES = 1024 * 1024;
const NEW_SPACES_PER_HOUR = 20;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function sameHash(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @param {{ dataDir?: string, staticDir?: string | null, maxSpaceBytes?: number, log?: (msg: string) => void }} [opts]
 */
export function createSyncServer(opts = {}) {
  const dataDir = resolve(opts.dataDir ?? process.env.DATA_DIR ?? './ember-sync-data');
  const staticRaw = opts.staticDir !== undefined ? opts.staticDir : process.env.STATIC_DIR;
  const staticDir = staticRaw ? resolve(staticRaw) : null;
  const maxSpaceBytes = opts.maxSpaceBytes ?? Number(process.env.MAX_SPACE_MB ?? 200) * 1024 * 1024;
  const log = opts.log ?? (() => {});
  /** @type {Map<string, Promise<Space>>} */
  const spaces = new Map();
  /** @type {Map<string, number[]>} */
  const creations = new Map();
  const ready = mkdir(join(dataDir, 'spaces'), { recursive: true });

  /**
   * @typedef {{ s: number, v: string, d: string }} Entry
   * @typedef {{ id: string, auth: string | null, seq: number, bytes: number, lines: number, byKey: Map<string, Entry>, queue: Promise<void> }} Space
   */

  /** @returns {Promise<Space>} */
  function loadSpace(id) {
    let p = spaces.get(id);
    if (!p) {
      p = (async () => {
        await ready;
        const space = { id, auth: null, seq: 0, bytes: 0, lines: 0, byKey: new Map(), queue: Promise.resolve() };
        try {
          space.auth = (await readFile(join(dataDir, 'spaces', `${id}.auth`), 'utf8')).trim() || null;
        } catch {}
        try {
          const raw = await readFile(join(dataDir, 'spaces', `${id}.jsonl`), 'utf8');
          for (const line of raw.split('\n')) {
            if (!line) continue;
            try {
              const e = JSON.parse(line);
              space.lines++;
              const prev = space.byKey.get(e.k);
              if (!prev || e.v > prev.v) {
                if (prev) space.bytes -= prev.d.length;
                space.byKey.set(e.k, { s: e.s, v: e.v, d: e.d });
                space.bytes += e.d.length;
              }
              if (e.s > space.seq) space.seq = e.s;
            } catch {
              // Línea a medio escribir tras un corte: se ignora.
            }
          }
        } catch {}
        return space;
      })();
      spaces.set(id, p);
    }
    return p;
  }

  /** Serializa las escrituras de un espacio. */
  function exclusive(space, fn) {
    const run = space.queue.then(fn, fn);
    space.queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  async function compactIfNeeded(space) {
    if (space.lines < 2000 || space.lines < space.byKey.size * 3) return;
    const entries = [...space.byKey.entries()].sort((a, b) => a[1].s - b[1].s);
    const body = entries.map(([k, e]) => JSON.stringify({ s: e.s, k, v: e.v, d: e.d })).join('\n') + '\n';
    const file = join(dataDir, 'spaces', `${space.id}.jsonl`);
    await writeFile(`${file}.tmp`, body);
    await rename(`${file}.tmp`, file);
    space.lines = entries.length;
    log(`compactado ${space.id.slice(0, 8)}… (${entries.length} registros)`);
  }

  function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-max-age': '86400',
    });
    res.end(json);
  }

  function readBody(req) {
    return new Promise((ok, fail) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          fail(Object.assign(new Error('too_large'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
      req.on('error', fail);
    });
  }

  function allowCreation(ip) {
    const now = Date.now();
    const list = (creations.get(ip) ?? []).filter((t) => now - t < 3_600_000);
    if (list.length >= NEW_SPACES_PER_HOUR) return false;
    list.push(now);
    creations.set(ip, list);
    return true;
  }

  async function authorize(req, space) {
    const m = /^Bearer\s+([0-9a-f]+)$/i.exec(req.headers.authorization ?? '');
    if (!m || !TOKEN_RE.test(m[1].toLowerCase())) return false;
    const hash = sha256(m[1].toLowerCase());
    if (space.auth) return sameHash(space.auth, hash);
    // Primer uso: el espacio queda reclamado por este token.
    return exclusive(space, async () => {
      if (space.auth) return sameHash(space.auth, hash);
      if (!allowCreation(req.socket.remoteAddress ?? '?')) return false;
      await writeFile(join(dataDir, 'spaces', `${space.id}.auth`), hash);
      space.auth = hash;
      log(`espacio nuevo ${space.id.slice(0, 8)}…`);
      return true;
    });
  }

  /** Sirve la app web. Las rutas desconocidas devuelven index.html (la app decide qué mostrar). */
  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    let rel;
    try {
      rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    } catch {
      return send(res, 400, { error: 'bad_path' });
    }
    let file = resolve(staticDir, rel || 'index.html');
    // Nunca fuera de la carpeta de la app.
    if (file !== staticDir && !file.startsWith(staticDir + sep)) return send(res, 404, { error: 'not_found' });
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info && !extname(rel)) {
      file = join(staticDir, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info) return send(res, 404, { error: 'not_found' });
    const body = await readFile(file);
    const name = file.slice(staticDir.length + 1);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      // Los archivos con hash no cambian nunca; la página y el service worker, siempre frescos.
      'cache-control': name.startsWith('assets' + sep) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (url.pathname === '/v1/health' || (url.pathname === '/' && !staticDir)) return send(res, 200, { ok: true, service: 'ember-sync', version: VERSION, app: !!staticDir });
    if (staticDir && !url.pathname.startsWith('/v1/')) return serveStatic(req, res, url.pathname);
    const m = /^\/v1\/spaces\/([^/]+)\/(pull|push)$/.exec(url.pathname);
    if (!m) return send(res, 404, { error: 'not_found' });
    const [, id, action] = m;
    if (!SPACE_RE.test(id)) return send(res, 400, { error: 'bad_space' });
    const space = await loadSpace(id);
    if (action === 'pull' && !space.auth) return send(res, 404, { error: 'no_space' });
    if (!(await authorize(req, space))) return send(res, 401, { error: 'unauthorized' });

    if (action === 'pull') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method' });
      const cursor = Math.max(0, Number(url.searchParams.get('cursor') ?? 0) || 0);
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 500) || 500));
      const pending = [];
      for (const [k, e] of space.byKey) if (e.s > cursor) pending.push({ k, ...e });
      pending.sort((a, b) => a.s - b.s);
      const page = pending.slice(0, limit);
      const more = pending.length > page.length;
      const next = more ? page[page.length - 1].s : space.seq;
      return send(res, 200, { records: page.map((e) => ({ k: e.k, v: e.v, d: e.d })), cursor: String(next), more });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, err?.status ?? 400, { error: err?.status === 413 ? 'too_large' : 'bad_json' });
    }
    const records = body?.records;
    if (!Array.isArray(records) || records.length > MAX_RECORDS_PER_PUSH) return send(res, 400, { error: 'bad_records' });
    for (const r of records) {
      if (typeof r?.k !== 'string' || r.k.length > 64 || typeof r.v !== 'string' || r.v.length > 64 || typeof r.d !== 'string' || r.d.length > MAX_RECORD_BYTES) {
        return send(res, 400, { error: 'bad_record' });
      }
    }
    const result = await exclusive(space, async () => {
      // Primero se decide qué entra (sin tocar nada) para que un "espacio lleno" no deje
      // el estado a medias.
      const accepted = [];
      const latest = new Map();
      let added = 0;
      for (const r of records) {
        const prev = latest.get(r.k) ?? space.byKey.get(r.k);
        if (prev && r.v <= prev.v) continue;
        added += r.d.length - (prev?.d.length ?? 0);
        latest.set(r.k, r);
        accepted.push(r);
      }
      if (added > 0 && space.bytes + added > maxSpaceBytes) return { error: true };
      const lines = accepted.map((r) => {
        const entry = { s: ++space.seq, v: r.v, d: r.d };
        space.byKey.set(r.k, entry);
        return JSON.stringify({ s: entry.s, k: r.k, v: r.v, d: r.d });
      });
      space.bytes += added;
      if (lines.length) {
        await appendFile(join(dataDir, 'spaces', `${space.id}.jsonl`), lines.join('\n') + '\n');
        space.lines += lines.length;
        await compactIfNeeded(space);
      }
      return { accepted: lines.length };
    });
    if (result.error) return send(res, 413, { error: 'space_full' });
    return send(res, 200, { accepted: result.accepted, cursor: String(space.seq) });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      log(`error: ${err?.message ?? err}`);
      if (!res.headersSent) send(res, 500, { error: 'internal' });
    });
  });
  return server;
}

// Ejecución directa: `node server/sync-server.mjs`
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = createSyncServer({ log: (m) => console.log(`[ember-sync] ${m}`) });
  server.listen(port, host, () =>
    console.log(`[ember-sync] escuchando en http://${host}:${port} · datos en ${resolve(process.env.DATA_DIR ?? './ember-sync-data')}${process.env.STATIC_DIR ? ` · app web desde ${resolve(process.env.STATIC_DIR)}` : ''}`),
  );
}
