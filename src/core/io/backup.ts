/**
 * Copia de seguridad completa en JSON (formato documentado en docs/FORMATOS.md).
 * Importar FUSIONA con "gana el más reciente": nunca borra lo que ya tienes.
 */
import { ENTITY_TYPES, type AnyEntity, type Collections, type EntityType } from '../types';

export const BACKUP_FORMAT = 'ember-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  data: Partial<Record<EntityType, AnyEntity[]>>;
}

export function createBackup(collections: Collections, appVersion: string, now = new Date()): BackupFile {
  const data: BackupFile['data'] = {};
  for (const type of ENTITY_TYPES) {
    if (type === 'conflicts') continue;
    data[type] = Object.values(collections[type]) as AnyEntity[];
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), app: `Ember ${appVersion}`, data };
}

export class BackupError extends Error {}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('not_json');
  }
  const b = raw as Partial<BackupFile>;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.version !== 'number' || typeof b.data !== 'object' || !b.data) {
    throw new BackupError('not_ember');
  }
  if (b.version > BACKUP_VERSION) throw new BackupError('newer_version');
  for (const [type, list] of Object.entries(b.data)) {
    if (!ENTITY_TYPES.includes(type as EntityType)) throw new BackupError('unknown_type');
    if (!Array.isArray(list)) throw new BackupError('corrupt');
    for (const e of list) {
      if (!e || typeof e !== 'object' || typeof (e as AnyEntity).id !== 'string' || typeof (e as AnyEntity).updatedAt !== 'string') {
        throw new BackupError('corrupt');
      }
    }
  }
  return b as BackupFile;
}

export interface MergePlan {
  upserts: { type: EntityType; entity: AnyEntity }[];
  added: number;
  updated: number;
  skipped: number;
}

/** Qué cambiaría al importar: entidades nuevas o más recientes que las locales. */
export function planMerge(current: Collections, backup: BackupFile): MergePlan {
  const plan: MergePlan = { upserts: [], added: 0, updated: 0, skipped: 0 };
  for (const [type, list] of Object.entries(backup.data) as [EntityType, AnyEntity[]][]) {
    for (const entity of list) {
      const existing = (current[type] as Record<string, AnyEntity>)[entity.id];
      if (!existing) {
        plan.upserts.push({ type, entity });
        plan.added++;
      } else if (entity.updatedAt > existing.updatedAt) {
        plan.upserts.push({ type, entity });
        plan.updated++;
      } else plan.skipped++;
    }
  }
  return plan;
}
