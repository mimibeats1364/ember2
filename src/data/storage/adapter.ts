/**
 * Contrato de almacenamiento local. La app nunca habla con una base de datos concreta:
 * SQLite (Tauri), IndexedDB (navegador) y memoria (tests) implementan esta interfaz.
 */
import type { AnyEntity, EntityType } from '@core/types';

export interface StoredRecord {
  type: EntityType;
  entity: AnyEntity;
}

export interface OutboxKey {
  type: EntityType;
  id: string;
  updatedAt: string;
}

export interface StorageAdapter {
  readonly kind: 'sqlite' | 'indexeddb' | 'memory';
  init(): Promise<void>;
  loadAll(): Promise<StoredRecord[]>;
  /** Escribe entidades y, si `track`, las añade a la cola de sincronización. */
  write(records: StoredRecord[], track: boolean): Promise<void>;
  outbox(): Promise<OutboxKey[]>;
  clearOutbox(keys: OutboxKey[]): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  wipe(): Promise<void>;
  /** Ruta legible del almacenamiento (para Ajustes → Privacidad). */
  location(): Promise<string>;
}

export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'memory' as const;
  private rows = new Map<string, StoredRecord>();
  private out = new Map<string, OutboxKey>();
  private meta = new Map<string, string>();

  async init() {}
  async loadAll() {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
  async write(records: StoredRecord[], track: boolean) {
    for (const r of records) {
      const key = `${r.type}:${r.entity.id}`;
      this.rows.set(key, structuredClone(r));
      if (track) this.out.set(key, { type: r.type, id: r.entity.id, updatedAt: r.entity.updatedAt });
    }
  }
  async outbox() {
    return [...this.out.values()];
  }
  async clearOutbox(keys: OutboxKey[]) {
    for (const k of keys) {
      const key = `${k.type}:${k.id}`;
      if (this.out.get(key)?.updatedAt === k.updatedAt) this.out.delete(key);
    }
  }
  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }
  async wipe() {
    this.rows.clear();
    this.out.clear();
    this.meta.clear();
  }
  async location() {
    return 'memoria';
  }
}
