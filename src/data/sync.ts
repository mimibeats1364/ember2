/**
 * Sincronización de la app: conecta el store local con el motor (@core/sync/engine) y el
 * transporte HTTP cifrado de extremo a extremo (@core/sync/http).
 *
 * - Opcional y desactivada por defecto. Sin configurar, Ember sigue siendo 100 % local.
 * - Lo único que se guarda es la dirección del servidor y el código, en la base local.
 * - Al conectar un dispositivo se sube TODO lo que tiene (se fusiona, nunca se borra nada) y a
 *   partir de ahí solo los cambios pendientes de la cola (`outbox`).
 */
import { create } from 'zustand';
import { deriveSyncKeys, formatSyncCode, generateSyncCode, normalizeSyncCode, type SyncKeys } from '@core/sync/crypto';
import { syncOnce, type ChangeRecord, type LocalReplica, type SyncResult } from '@core/sync/engine';
import { HttpTransport, normalizeServerUrl, SyncHttpError } from '@core/sync/http';
import type { AnyEntity, Conflict, EntityType } from '@core/types';
import { ENTITY_TYPES } from '@core/types';
import type { OutboxKey } from './storage/adapter';
import { applyRemoteEntities, flush, getAdapter, getEntity, getMeta, nextClock, receiveClock, setMeta, transaction, updateEntity, useData } from './store';
import { t } from '@/i18n';

export type SyncErrorCode = 'unauthorized' | 'no_space' | 'server' | 'network' | 'too_large' | 'bad_response' | 'invalid_code' | 'invalid_server' | 'unknown';

interface SyncState {
  configured: boolean;
  server: string;
  status: 'off' | 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;
  error: SyncErrorCode | null;
  last: SyncResult | null;
}

export const useSync = create<SyncState>(() => ({ configured: false, server: '', status: 'off', lastSyncAt: null, error: null, last: null }));

/** Invitación abierta desde el QR (`/?join=…`): solo rellena el formulario, nunca une sola. */
export const useJoinInvite = create<{ server: string; code: string } | { server: null; code: null }>(() => ({ server: null, code: null }));

/** ¿Tu servidor sirve también la app web? (entonces el QR abre Ember directamente) */
export async function serverServesApp(): Promise<boolean> {
  const [server, code] = await Promise.all([getMeta(META.server), getMeta(META.code)]);
  if (!server || !code) return false;
  try {
    return (await new HttpTransport(server, await keysFor(code)).health()).app;
  } catch {
    return false;
  }
}

/** Enlace que, abierto en otro dispositivo, rellena el formulario para unirse. */
export async function joinLink(): Promise<string | null> {
  const [server, code] = await Promise.all([getMeta(META.server), getMeta(META.code)]);
  return server && code ? `${server}/?join=${formatSyncCode(code)}` : null;
}

const META = { server: 'sync_server', code: 'sync_code', cursor: 'sync_cursor', full: 'sync_full', last: 'sync_last', create: 'sync_create' } as const;
/** Tipos que no viajan: los conflictos son de cada dispositivo. */
const LOCAL_ONLY = new Set<EntityType>(['conflicts']);

let keysCache: { code: string; keys: SyncKeys } | null = null;

async function keysFor(code: string): Promise<SyncKeys> {
  if (keysCache?.code === code) return keysCache.keys;
  const keys = await deriveSyncKeys(code);
  keysCache = { code, keys };
  return keys;
}

export async function loadSyncConfig(): Promise<void> {
  const [server, code, last] = await Promise.all([getMeta(META.server), getMeta(META.code), getMeta(META.last)]);
  const configured = !!(server && code);
  useSync.setState({ configured, server: server ?? '', status: configured ? 'idle' : 'off', lastSyncAt: last || null, error: null });
}

export async function getSyncCode(): Promise<string | null> {
  const code = await getMeta(META.code);
  return code ? formatSyncCode(code) : null;
}

export { generateSyncCode };

function errorCode(err: unknown): SyncErrorCode {
  if (err instanceof SyncHttpError) return err.code;
  if (err instanceof Error && err.message === 'invalid_sync_code') return 'invalid_code';
  return 'unknown';
}

/**
 * Conecta este dispositivo. `create`: espacio nuevo con un código recién generado. `join`: el
 * espacio tiene que existir (si el código está mal escrito, no se crea uno vacío).
 */
export async function connectSync(serverInput: string, codeInput: string, mode: 'create' | 'join'): Promise<{ ok: true } | { ok: false; error: SyncErrorCode }> {
  const server = normalizeServerUrl(serverInput);
  if (!server) return { ok: false, error: 'invalid_server' };
  const code = normalizeSyncCode(codeInput);
  if (!code) return { ok: false, error: 'invalid_code' };
  try {
    const keys = await keysFor(code);
    const transport = new HttpTransport(server, keys);
    await transport.health();
    if (mode === 'join') await transport.check();
  } catch (err) {
    return { ok: false, error: errorCode(err) };
  }
  await setMeta(META.server, server);
  await setMeta(META.code, code);
  await setMeta(META.cursor, '');
  await setMeta(META.full, '1');
  await setMeta(META.create, mode === 'create' ? '1' : '');
  useSync.setState({ configured: true, server, status: 'idle', error: null });
  void syncNow();
  return { ok: true };
}

/** Desconecta este dispositivo. Los datos locales se quedan tal cual. */
export async function disconnectSync(): Promise<void> {
  for (const key of Object.values(META)) await setMeta(key, '');
  keysCache = null;
  useSync.setState({ configured: false, server: '', status: 'off', lastSyncAt: null, error: null, last: null });
}

/** Vuelve a subir todo (por ejemplo, si el servidor perdió los datos). */
export async function reuploadAll(): Promise<void> {
  await setMeta(META.full, '1');
  await setMeta(META.create, '1');
  await setMeta(META.cursor, '');
  void syncNow();
}

// ── Réplica sobre el store ─────────────────────────────────────────────────────────────

class StoreReplica implements LocalReplica {
  private out = new Map<string, ChangeRecord>();
  readonly incoming: { type: EntityType; entity: AnyEntity }[] = [];
  readonly acked: OutboxKey[] = [];
  readonly conflicts: { type: EntityType; id: string; lost: AnyEntity; kept: AnyEntity }[] = [];
  private incomingIdx = new Map<string, AnyEntity>();

  constructor(
    pendingKeys: OutboxKey[] | 'all',
    private cursor: string | null,
    /** Tipos en los que manda lo que ya hay en el espacio (al unirse: los ajustes). */
    private adopt: Set<EntityType> = new Set(),
  ) {
    const { c } = useData.getState();
    if (pendingKeys === 'all') {
      for (const type of ENTITY_TYPES) {
        if (LOCAL_ONLY.has(type) || adopt.has(type)) continue;
        for (const entity of Object.values(c[type] as Record<string, AnyEntity>)) this.out.set(`${type}:${entity.id}`, { type, id: entity.id, entity });
      }
    } else {
      for (const k of pendingKeys) {
        if (LOCAL_ONLY.has(k.type)) continue;
        const entity = (c[k.type] as Record<string, AnyEntity> | undefined)?.[k.id];
        if (entity) this.out.set(`${k.type}:${k.id}`, { type: k.type, id: k.id, entity });
      }
    }
  }

  get(type: EntityType, id: string) {
    const incoming = this.incomingIdx.get(`${type}:${id}`);
    if (incoming || this.adopt.has(type)) return incoming;
    return getEntity(type, id);
  }
  applyRemote(type: EntityType, entity: AnyEntity) {
    const key = `${type}:${entity.id}`;
    this.incoming.push({ type, entity });
    this.incomingIdx.set(key, entity);
    // Lo remoto ganó: la versión local ya no hay que subirla.
    const mine = this.out.get(key);
    if (mine) {
      this.out.delete(key);
      this.acked.push({ type, id: entity.id, updatedAt: mine.entity.updatedAt });
    }
  }
  pending() {
    return [...this.out.values()];
  }
  acknowledge(records: ChangeRecord[]) {
    for (const r of records) this.acked.push({ type: r.type, id: r.id, updatedAt: r.entity.updatedAt });
  }
  recordConflict(type: EntityType, id: string, lost: AnyEntity, kept: AnyEntity) {
    if (!LOCAL_ONLY.has(type)) this.conflicts.push({ type, id, lost, kept });
  }
  receiveClock(hlc: string) {
    receiveClock(hlc);
  }
  getCursor() {
    return this.cursor;
  }
  setCursor(c: string) {
    this.cursor = c;
  }
}

let running: Promise<SyncResult | null> | null = null;
/** Mientras se aplican cambios remotos, el motor automático no debe volver a disparar. */
let applyingRemote = false;
export const isApplyingRemote = () => applyingRemote;

export function syncNow(): Promise<SyncResult | null> {
  running ??= doSync().finally(() => {
    running = null;
  });
  return running;
}

async function doSync(): Promise<SyncResult | null> {
  const [server, code] = await Promise.all([getMeta(META.server), getMeta(META.code)]);
  if (!server || !code) return null;
  useSync.setState({ status: 'syncing' });
  try {
    await flush();
    const keys = await keysFor(code);
    const adapter = getAdapter();
    const full = (await getMeta(META.full)) === '1';
    const create = (await getMeta(META.create)) === '1';
    // Al unirse a un espacio que ya existe, este dispositivo adopta sus ajustes (nombre, tema…)
    // en vez de imponer los recién creados en el onboarding.
    const joining = full && !create;
    const replica = new StoreReplica(full ? 'all' : await adapter.outbox(), (await getMeta(META.cursor)) || null, new Set(joining ? (['prefs'] as EntityType[]) : []));
    const transport = new HttpTransport(server, keys, { create });
    const result = await syncOnce(replica, transport);
    applyingRemote = true;
    try {
      await applyRemoteEntities(replica.incoming);
      if (replica.conflicts.length) await applyRemoteEntities(replica.conflicts.map(conflictRecord), { localOnly: true });
    } finally {
      applyingRemote = false;
    }
    if (replica.acked.length) await adapter.clearOutbox(replica.acked);
    const cursor = replica.getCursor();
    if (cursor) await setMeta(META.cursor, cursor);
    if (full) await setMeta(META.full, '');
    if (create) await setMeta(META.create, '');
    const now = new Date().toISOString();
    await setMeta(META.last, now);
    useSync.setState({ status: 'idle', lastSyncAt: now, error: null, last: result });
    return result;
  } catch (err) {
    console.warn('[ember] sincronización', err);
    useSync.setState({ status: 'error', error: errorCode(err) });
    return null;
  }
}

/** Un conflicto por entidad: si vuelve a pasar, se actualiza el mismo registro. */
function conflictRecord(c: { type: EntityType; id: string; lost: AnyEntity; kept: AnyEntity }): { type: 'conflicts'; entity: Conflict } {
  const id = `conflict_${c.type}_${c.id}`;
  const prev = getEntity('conflicts', id);
  return {
    type: 'conflicts',
    entity: {
      id,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      updatedAt: nextClock(),
      deletedAt: null,
      entityType: c.type,
      entityId: c.id,
      // `local` = la versión que NO se aplicó; `remote` = la que quedó.
      local: c.lost,
      remote: c.kept,
      resolvedAt: null,
    },
  };
}

// ── Conflictos ─────────────────────────────────────────────────────────────────────────

async function markResolved(conflict: Conflict): Promise<void> {
  await applyRemoteEntities([{ type: 'conflicts', entity: { ...conflict, resolvedAt: new Date().toISOString(), updatedAt: nextClock() } }], { localOnly: true });
}

/** "Conservar esta versión": la versión descartada vuelve como un cambio nuevo (gana en todos). */
export async function keepDiscardedVersion(conflict: Conflict): Promise<void> {
  const fields: Record<string, unknown> = { ...(conflict.local as Record<string, unknown>) };
  delete fields.id;
  delete fields.createdAt;
  delete fields.updatedAt;
  if (getEntity(conflict.entityType, conflict.entityId)) {
    transaction(t('sync.keptVersion'), () => updateEntity(conflict.entityType, conflict.entityId, fields as Partial<AnyEntity> as never));
  }
  await markResolved(conflict);
  void syncNow();
}

export async function keepCurrentVersion(conflict: Conflict): Promise<void> {
  await markResolved(conflict);
}
