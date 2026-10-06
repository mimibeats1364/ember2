/**
 * Store de datos local-first.
 *
 * - Todas las entidades viven en memoria (respuesta instantánea) y se persisten en lote
 *   en el adaptador (SQLite en la app nativa).
 * - Cada escritura recibe una marca HLC y entra en la cola de sincronización.
 * - `transaction()` agrupa cambios para poder deshacerlos con ⌘Z.
 */
import { create } from 'zustand';
import { useMemo } from 'react';
import { HybridClock } from '@core/hlc';
import { uuidv7 } from '@core/ids';
import { ENTITY_TYPES, type AnyEntity, type Collections, type EntityMap, type EntityType, type Preferences } from '@core/types';
import type { StorageAdapter, StoredRecord } from './storage/adapter';
import { MemoryAdapter } from './storage/adapter';
import { defaultPreferences, PREFS_ID } from './defaults';
import { isTauri } from '@/platform/env';

export const emptyCollections = (): Collections =>
  Object.fromEntries(ENTITY_TYPES.map((t) => [t, {}])) as unknown as Collections;

interface DataState {
  ready: boolean;
  storageKind: StorageAdapter['kind'];
  storageError: 'none' | 'fallback' | 'write';
  c: Collections;
}

export const useData = create<DataState>(() => ({
  ready: false,
  storageKind: 'memory',
  storageError: 'none',
  c: emptyCollections(),
}));

let adapter: StorageAdapter = new MemoryAdapter();
let clock = new HybridClock('local');
const queue = new Map<string, StoredRecord>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let initPromise: Promise<void> | null = null;

/** Idempotente: React (modo estricto) puede montar dos veces. */
export function initData(): Promise<void> {
  initPromise ??= doInit();
  return initPromise;
}

async function doInit(): Promise<void> {
  try {
    if (isTauri()) {
      const { SqliteAdapter } = await import('./storage/sqlite');
      adapter = new SqliteAdapter();
    } else {
      const { IndexedDbAdapter } = await import('./storage/indexeddb');
      adapter = new IndexedDbAdapter();
    }
    await adapter.init();
  } catch (err) {
    console.error('[ember] almacenamiento no disponible, modo temporal', err);
    adapter = new MemoryAdapter();
    await adapter.init();
    useData.setState({ storageError: 'fallback' });
  }
  let deviceId = await adapter.getMeta('device_id');
  if (!deviceId) {
    deviceId = uuidv7();
    await adapter.setMeta('device_id', deviceId);
  }
  clock = new HybridClock(deviceId.slice(-12));
  const records = await adapter.loadAll();
  const c = emptyCollections();
  let maxHlc = '';
  for (const r of records) {
    if (!ENTITY_TYPES.includes(r.type)) continue;
    (c[r.type] as Record<string, AnyEntity>)[r.entity.id] = r.entity;
    if (r.entity.updatedAt > maxHlc) maxHlc = r.entity.updatedAt;
  }
  if (maxHlc) clock.receive(maxHlc);
  useData.setState({ c, ready: true, storageKind: adapter.kind });
  if (!c.prefs[PREFS_ID]) {
    const now = new Date().toISOString();
    commit([{ type: 'prefs', entity: { id: PREFS_ID, createdAt: now, updatedAt: clock.now(), deletedAt: null, ...defaultPreferences() } }]);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  }
}

export function getAdapter(): StorageAdapter {
  return adapter;
}

export const getMeta = (key: string) => adapter.getMeta(key);
export const setMeta = (key: string, value: string) => adapter.setMeta(key, value);

// ── Escritura ──────────────────────────────────────────────────────────────────────────

interface Change {
  type: EntityType;
  entity: AnyEntity;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 180);
}

export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.size === 0) return;
  const batch = [...queue.values()];
  queue.clear();
  try {
    await adapter.write(batch, true);
    if (useData.getState().storageError === 'write') useData.setState({ storageError: 'none' });
  } catch (err) {
    console.error('[ember] error al guardar', err);
    for (const r of batch) {
      const key = `${r.type}:${r.entity.id}`;
      if (!queue.has(key)) queue.set(key, r);
    }
    useData.setState({ storageError: 'write' });
    setTimeout(scheduleFlush, 3000);
  }
}

function commit(changes: Change[]) {
  if (changes.length === 0) return;
  useData.setState((s) => {
    const c = { ...s.c };
    const touched = new Set<EntityType>();
    for (const ch of changes) {
      if (!touched.has(ch.type)) {
        (c as Record<EntityType, unknown>)[ch.type] = { ...c[ch.type] };
        touched.add(ch.type);
      }
      (c[ch.type] as Record<string, AnyEntity>)[ch.entity.id] = ch.entity;
    }
    return { c };
  });
  for (const ch of changes) queue.set(`${ch.type}:${ch.entity.id}`, { type: ch.type, entity: ch.entity });
  scheduleFlush();
}

// ── Deshacer ───────────────────────────────────────────────────────────────────────────

interface UndoEntry {
  label: string;
  before: { type: EntityType; id: string; entity: AnyEntity | null }[];
}

const undoStack: UndoEntry[] = [];
let activeTx: UndoEntry | null = null;

function recordBefore(type: EntityType, id: string) {
  if (!activeTx) return;
  if (activeTx.before.some((b) => b.type === type && b.id === id)) return;
  const prev = (useData.getState().c[type] as Record<string, AnyEntity>)[id];
  activeTx.before.push({ type, id, entity: prev ? structuredClone(prev) : null });
}

/** Agrupa cambios en una operación deshacible. */
export function transaction<R>(label: string, fn: () => R): R {
  if (activeTx) return fn();
  activeTx = { label, before: [] };
  try {
    return fn();
  } finally {
    if (activeTx.before.length) {
      undoStack.push(activeTx);
      if (undoStack.length > 50) undoStack.shift();
    }
    activeTx = null;
  }
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

/** Restaura el estado previo a la última transacción. Devuelve su etiqueta. */
export function undo(): string | null {
  const entry = undoStack.pop();
  if (!entry) return null;
  const now = new Date().toISOString();
  const changes: Change[] = [];
  for (const b of entry.before) {
    const current = (useData.getState().c[b.type] as Record<string, AnyEntity>)[b.id];
    if (b.entity) changes.push({ type: b.type, entity: { ...b.entity, updatedAt: clock.now() } });
    else if (current) changes.push({ type: b.type, entity: { ...current, deletedAt: now, updatedAt: clock.now() } });
  }
  commit(changes);
  return entry.label;
}

// ── API de entidades ───────────────────────────────────────────────────────────────────

type Fields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export function createEntity<T extends EntityType>(type: T, fields: Fields<EntityMap[T]>, id: string = uuidv7()): EntityMap[T] {
  recordBefore(type, id);
  const entity = { ...fields, id, createdAt: new Date().toISOString(), updatedAt: clock.now(), deletedAt: null } as unknown as EntityMap[T];
  commit([{ type, entity: entity as AnyEntity }]);
  return entity;
}

/** Crea o, si ya existe (id determinista), actualiza. */
export function upsertEntity<T extends EntityType>(type: T, id: string, fields: Partial<Fields<EntityMap[T]>>, defaults: () => Fields<EntityMap[T]>): EntityMap[T] {
  const existing = getEntity(type, id);
  if (existing && !existing.deletedAt) return updateEntity(type, id, fields as Partial<EntityMap[T]>)!;
  recordBefore(type, id);
  const entity = {
    ...defaults(),
    ...fields,
    id,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: clock.now(),
    deletedAt: null,
  } as unknown as EntityMap[T];
  commit([{ type, entity: entity as AnyEntity }]);
  return entity;
}

export function getEntity<T extends EntityType>(type: T, id: string | null | undefined): EntityMap[T] | undefined {
  if (!id) return undefined;
  return (useData.getState().c[type] as Record<string, EntityMap[T]>)[id];
}

export function updateEntity<T extends EntityType>(
  type: T,
  id: string,
  patch: Partial<EntityMap[T]> | ((e: EntityMap[T]) => Partial<EntityMap[T]>),
): EntityMap[T] | undefined {
  const prev = getEntity(type, id);
  if (!prev) return undefined;
  recordBefore(type, id);
  const p = typeof patch === 'function' ? patch(prev) : patch;
  const entity = { ...prev, ...p, id, updatedAt: clock.now() } as EntityMap[T];
  commit([{ type, entity: entity as AnyEntity }]);
  return entity;
}

/** Borrado lógico (lápida): se sincroniza y se puede deshacer. */
export function deleteEntity(type: EntityType, id: string): void {
  updateEntity(type, id, { deletedAt: new Date().toISOString() } as never);
}

/** Inserta entidades externas (importación) respetando sus marcas para LWW. */
export function importEntities(items: { type: EntityType; entity: AnyEntity }[]): void {
  for (const it of items) clock.receive(it.entity.updatedAt);
  commit(items.map((it) => ({ type: it.type, entity: it.entity })));
}

export async function wipeAll(): Promise<void> {
  queue.clear();
  await adapter.wipe();
  undoStack.length = 0;
  useData.setState({ c: emptyCollections() });
  const now = new Date().toISOString();
  commit([{ type: 'prefs', entity: { id: PREFS_ID, createdAt: now, updatedAt: clock.now(), deletedAt: null, ...defaultPreferences(), onboarded: false } }]);
  await flush();
}

// ── Hooks de lectura ───────────────────────────────────────────────────────────────────

export function useCollection<T extends EntityType>(type: T): Record<string, EntityMap[T]> {
  return useData((s) => s.c[type] as Record<string, EntityMap[T]>);
}

/** Lista de entidades vivas (sin lápidas), memoizada por identidad de la colección. */
export function useList<T extends EntityType>(type: T): EntityMap[T][] {
  const rec = useCollection(type);
  return useMemo(() => Object.values(rec).filter((e) => !e.deletedAt), [rec]);
}

export function useEntity<T extends EntityType>(type: T, id: string | null | undefined): EntityMap[T] | undefined {
  return useData((s) => (id ? (s.c[type] as Record<string, EntityMap[T]>)[id] : undefined));
}

/** Fusiona con los valores por defecto para que versiones nuevas no rompan datos antiguos. */
function withDefaults(p: Preferences | undefined): Preferences {
  const d = defaultPreferences();
  const base = p ?? ({ id: PREFS_ID, createdAt: '', updatedAt: '', deletedAt: null, ...d } as Preferences);
  return {
    ...d,
    ...base,
    sleep: { ...d.sleep, ...base.sleep },
    focus: { ...d.focus, ...base.focus },
    notifications: { ...d.notifications, ...base.notifications },
    shortcuts: { ...d.shortcuts, ...base.shortcuts },
  };
}

export function usePrefs(): Preferences {
  const p = useData((s) => s.c.prefs[PREFS_ID]);
  return useMemo(() => withDefaults(p), [p]);
}

export function getPrefs(): Preferences {
  return withDefaults(useData.getState().c.prefs[PREFS_ID]);
}

export function updatePrefs(patch: Partial<Preferences>): void {
  updateEntity('prefs', PREFS_ID, patch);
}
