/**
 * Almacenamiento IndexedDB para la versión web / desarrollo en navegador.
 */
import type { EntityType } from '@core/types';
import type { OutboxKey, StorageAdapter, StoredRecord } from './adapter';

const DB_NAME = 'ember';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IndexedDbAdapter implements StorageAdapter {
  readonly kind = 'indexeddb' as const;
  private db!: IDBDatabase;

  async init() {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities', { keyPath: ['type', 'id'] });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: ['type', 'id'] });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    this.db = await req(open);
  }

  async loadAll(): Promise<StoredRecord[]> {
    const tx = this.db.transaction('entities', 'readonly');
    const rows = await req(tx.objectStore('entities').getAll());
    return rows.map((r: { type: EntityType; data: StoredRecord['entity'] }) => ({ type: r.type, entity: r.data }));
  }

  async write(records: StoredRecord[], track: boolean) {
    const tx = this.db.transaction(['entities', 'outbox'], 'readwrite');
    const ent = tx.objectStore('entities');
    const out = tx.objectStore('outbox');
    for (const r of records) {
      ent.put({ type: r.type, id: r.entity.id, data: r.entity });
      if (track) out.put({ type: r.type, id: r.entity.id, updatedAt: r.entity.updatedAt });
    }
    await done(tx);
  }

  async outbox(): Promise<OutboxKey[]> {
    const tx = this.db.transaction('outbox', 'readonly');
    return req(tx.objectStore('outbox').getAll());
  }

  async clearOutbox(keys: OutboxKey[]) {
    const tx = this.db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    for (const k of keys) {
      const existing = (await req(store.get([k.type, k.id]))) as OutboxKey | undefined;
      if (existing?.updatedAt === k.updatedAt) store.delete([k.type, k.id]);
    }
    await done(tx);
  }

  async getMeta(key: string) {
    const tx = this.db.transaction('meta', 'readonly');
    const row = (await req(tx.objectStore('meta').get(key))) as { value: string } | undefined;
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await done(tx);
  }

  async wipe() {
    const tx = this.db.transaction(['entities', 'outbox'], 'readwrite');
    tx.objectStore('entities').clear();
    tx.objectStore('outbox').clear();
    await done(tx);
  }

  async location() {
    return 'IndexedDB (navegador)';
  }
}
