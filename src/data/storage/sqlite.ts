/**
 * Almacenamiento SQLite mediante tauri-plugin-sql (archivo `ember.db` en la carpeta de datos
 * de la app). Un registro por entidad (JSON) + cola de sincronización + metadatos.
 */
import Database from '@tauri-apps/plugin-sql';
import { appConfigDir } from '@tauri-apps/api/path';
import type { EntityType } from '@core/types';
import type { OutboxKey, StorageAdapter, StoredRecord } from './adapter';

const SCHEMA_VERSION = 1;
const CHUNK = 150;

export class SqliteAdapter implements StorageAdapter {
  readonly kind = 'sqlite' as const;
  private db!: Database;

  async init() {
    this.db = await Database.load('sqlite:ember.db');
    await this.db.execute('PRAGMA journal_mode = WAL');
    await this.db.execute(`CREATE TABLE IF NOT EXISTS entities (
      type TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (type, id))`);
    await this.db.execute(`CREATE TABLE IF NOT EXISTS outbox (
      type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (type, id))`);
    await this.db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const v = await this.getMeta('schema_version');
    if (v === null) await this.setMeta('schema_version', String(SCHEMA_VERSION));
  }

  async loadAll(): Promise<StoredRecord[]> {
    const rows = await this.db.select<{ type: string; data: string }[]>('SELECT type, data FROM entities');
    const out: StoredRecord[] = [];
    for (const r of rows) {
      try {
        out.push({ type: r.type as EntityType, entity: JSON.parse(r.data) });
      } catch {
        // Un registro dañado no debe impedir abrir la app: se omite y se conserva en disco.
      }
    }
    return out;
  }

  async write(records: StoredRecord[], track: boolean) {
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const rows = chunk.map((r, j) => {
        values.push(r.type, r.entity.id, JSON.stringify(r.entity), r.entity.updatedAt, r.entity.deletedAt ? 1 : 0);
        const b = j * 5;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
      });
      await this.db.execute(
        `INSERT INTO entities (type, id, data, updated_at, deleted) VALUES ${rows.join(', ')}
         ON CONFLICT(type, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted`,
        values,
      );
      if (track) {
        const ov: unknown[] = [];
        const orows = chunk.map((r, j) => {
          ov.push(r.type, r.entity.id, r.entity.updatedAt);
          const b = j * 3;
          return `($${b + 1}, $${b + 2}, $${b + 3})`;
        });
        await this.db.execute(
          `INSERT INTO outbox (type, id, updated_at) VALUES ${orows.join(', ')}
           ON CONFLICT(type, id) DO UPDATE SET updated_at = excluded.updated_at`,
          ov,
        );
      }
    }
  }

  async outbox(): Promise<OutboxKey[]> {
    const rows = await this.db.select<{ type: string; id: string; updated_at: string }[]>('SELECT type, id, updated_at FROM outbox');
    return rows.map((r) => ({ type: r.type as EntityType, id: r.id, updatedAt: r.updated_at }));
  }

  async clearOutbox(keys: OutboxKey[]) {
    for (const k of keys) {
      await this.db.execute('DELETE FROM outbox WHERE type = $1 AND id = $2 AND updated_at = $3', [k.type, k.id, k.updatedAt]);
    }
  }

  async getMeta(key: string) {
    const rows = await this.db.select<{ value: string }[]>('SELECT value FROM meta WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.db.execute('INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  async wipe() {
    await this.db.execute('DELETE FROM entities');
    await this.db.execute('DELETE FROM outbox');
    await this.db.execute("DELETE FROM meta WHERE key NOT IN ('device_id', 'schema_version')");
  }

  async location() {
    try {
      return `${await appConfigDir()}/ember.db`;
    } catch {
      return 'ember.db';
    }
  }
}
