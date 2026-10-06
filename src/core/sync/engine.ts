/**
 * Motor de sincronización (independiente del backend).
 *
 *   Base de datos local ⇄ Motor de sync ⇄ Transporte (HTTP, WebSocket… intercambiable)
 *
 * Reglas:
 * - Cada entidad es un registro con `updatedAt` HLC; gana el cambio más reciente (LWW).
 * - Si la misma entidad cambió en local (sin subir) y en remoto, es un CONFLICTO: se aplica
 *   el ganador y la versión perdedora se guarda en `conflicts` para revisarla. Nunca se
 *   borra nada en silencio.
 * - Los borrados son lápidas (`deletedAt`), así se propagan sin perder historial.
 * - Los ids son UUIDv7 (o deterministas, p. ej. registros de hábito `habitId_fecha`), por lo
 *   que dos dispositivos que crean "lo mismo" no duplican datos.
 */
import type { AnyEntity, EntityType, ID } from '../types';

export interface ChangeRecord {
  type: EntityType;
  id: ID;
  entity: AnyEntity;
}

export interface PullResult {
  changes: ChangeRecord[];
  cursor: string;
}

export interface Transport {
  pull(cursor: string | null): Promise<PullResult>;
  push(changes: ChangeRecord[]): Promise<void>;
}

export interface LocalReplica {
  get(type: EntityType, id: ID): AnyEntity | undefined;
  /** Aplica un cambio remoto sin volver a encolarlo para subir. */
  applyRemote(type: EntityType, entity: AnyEntity): void;
  /** Cambios locales pendientes de subir. */
  pending(): ChangeRecord[];
  /** Marca como subidos (solo si no se modificaron después). */
  acknowledge(records: ChangeRecord[]): void;
  recordConflict(type: EntityType, id: ID, local: AnyEntity, remote: AnyEntity): void;
  receiveClock(hlc: string): void;
  getCursor(): string | null;
  setCursor(cursor: string): void;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: number;
}

/** Campos que no cuentan como "contenido" al decidir si dos versiones difieren. */
const META = new Set(['updatedAt', 'createdAt']);

export function sameContent(a: AnyEntity, b: AnyEntity): boolean {
  const ka = Object.keys(a).filter((k) => !META.has(k));
  const kb = Object.keys(b).filter((k) => !META.has(k));
  if (ka.length !== kb.length) return false;
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  return ka.every((k) => JSON.stringify(ra[k]) === JSON.stringify(rb[k]));
}

export async function syncOnce(replica: LocalReplica, transport: Transport): Promise<SyncResult> {
  const pendingKeys = new Set(replica.pending().map((c) => `${c.type}:${c.id}`));
  const { changes, cursor } = await transport.pull(replica.getCursor());
  let conflicts = 0;
  for (const remote of changes) {
    replica.receiveClock(remote.entity.updatedAt);
    const local = replica.get(remote.type, remote.id);
    if (!local) {
      replica.applyRemote(remote.type, remote.entity);
      continue;
    }
    if (local.updatedAt === remote.entity.updatedAt) continue;
    const localPending = pendingKeys.has(`${remote.type}:${remote.id}`);
    const remoteWins = remote.entity.updatedAt > local.updatedAt;
    if (localPending && !sameContent(local, remote.entity)) {
      conflicts++;
      if (remoteWins) replica.recordConflict(remote.type, remote.id, local, remote.entity);
      else replica.recordConflict(remote.type, remote.id, remote.entity, local);
    }
    if (remoteWins) replica.applyRemote(remote.type, remote.entity);
  }
  replica.setCursor(cursor);
  const outgoing = replica.pending();
  if (outgoing.length > 0) {
    await transport.push(outgoing);
    replica.acknowledge(outgoing);
  }
  return { pulled: changes.length, pushed: outgoing.length, conflicts };
}

/**
 * Servidor en memoria con la misma semántica que el backend real (LWW por entidad y
 * registro de cambios con cursor). Sirve para tests y para desarrollar sin red.
 */
export class MemorySyncServer {
  private store = new Map<string, ChangeRecord>();
  private log: { seq: number; key: string }[] = [];
  private seq = 0;

  transport(): Transport {
    return {
      pull: async (cursor) => {
        const from = cursor ? Number(cursor) : 0;
        const keys = new Set(this.log.filter((l) => l.seq > from).map((l) => l.key));
        return { changes: [...keys].map((k) => structuredClone(this.store.get(k)!)), cursor: String(this.seq) };
      },
      push: async (changes) => {
        for (const c of changes) {
          const key = `${c.type}:${c.id}`;
          const existing = this.store.get(key);
          if (!existing || c.entity.updatedAt > existing.entity.updatedAt) {
            this.store.set(key, structuredClone(c));
            this.log.push({ seq: ++this.seq, key });
          }
        }
      },
    };
  }

  snapshot(): ChangeRecord[] {
    return [...this.store.values()];
  }
}
