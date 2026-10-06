import { describe, expect, it } from 'vitest';
import { HybridClock } from '../hlc';
import { MemorySyncServer, syncOnce, type ChangeRecord, type LocalReplica } from './engine';
import type { AnyEntity, EntityType, Note } from '../types';

/** Réplica mínima en memoria que simula un dispositivo (con modo sin conexión). */
class Device implements LocalReplica {
  store = new Map<string, AnyEntity>();
  outbox = new Map<string, ChangeRecord>();
  conflicts: { local: AnyEntity; remote: AnyEntity }[] = [];
  cursor: string | null = null;
  clock: HybridClock;

  constructor(node: string, time: () => number) {
    this.clock = new HybridClock(node, time);
  }

  write(type: EntityType, entity: Omit<AnyEntity, 'updatedAt'>) {
    const e = { ...entity, updatedAt: this.clock.now() } as AnyEntity;
    this.store.set(`${type}:${e.id}`, e);
    this.outbox.set(`${type}:${e.id}`, { type, id: e.id, entity: e });
    return e;
  }

  get(type: EntityType, id: string) {
    return this.store.get(`${type}:${id}`);
  }
  applyRemote(type: EntityType, entity: AnyEntity) {
    this.store.set(`${type}:${entity.id}`, entity);
  }
  pending() {
    return [...this.outbox.values()];
  }
  acknowledge(records: ChangeRecord[]) {
    for (const r of records) {
      const key = `${r.type}:${r.id}`;
      if (this.outbox.get(key)?.entity.updatedAt === r.entity.updatedAt) this.outbox.delete(key);
    }
  }
  recordConflict(_t: EntityType, _id: string, local: AnyEntity, remote: AnyEntity) {
    this.conflicts.push({ local, remote });
  }
  receiveClock(h: string) {
    this.clock.receive(h);
  }
  getCursor() {
    return this.cursor;
  }
  setCursor(c: string) {
    this.cursor = c;
  }
}

const note = (id: string, title: string, deletedAt: string | null = null): Omit<Note, 'updatedAt'> => ({
  id, createdAt: '2026-10-06T10:00:00.000Z', deletedAt, title, body: '', kind: 'note', tagIds: [], pinned: false,
  inbox: false, archived: false, projectId: null, taskId: null, goalId: null, areaId: null,
});

describe('sincronización entre dispositivos', () => {
  it('los cambios hechos sin conexión convergen en todos los dispositivos', async () => {
    let t = 1_000;
    const server = new MemorySyncServer();
    const mac = new Device('mac', () => t);
    const phone = new Device('phone', () => t);
    mac.write('notes', note('n1', 'Desde el Mac'));
    t += 10;
    phone.write('notes', note('n2', 'Desde el móvil (offline)'));
    await syncOnce(mac, server.transport());
    await syncOnce(phone, server.transport());
    await syncOnce(mac, server.transport());
    expect((mac.get('notes', 'n2') as Note).title).toBe('Desde el móvil (offline)');
    expect((phone.get('notes', 'n1') as Note).title).toBe('Desde el Mac');
    expect(mac.pending()).toHaveLength(0);
  });

  it('un conflicto aplica el cambio más reciente y conserva el otro para revisarlo', async () => {
    let t = 1_000;
    const server = new MemorySyncServer();
    const mac = new Device('mac', () => t);
    const phone = new Device('phone', () => t);
    mac.write('notes', note('n1', 'Original'));
    await syncOnce(mac, server.transport());
    await syncOnce(phone, server.transport());
    t += 100;
    mac.write('notes', note('n1', 'Versión Mac'));
    t += 100;
    phone.write('notes', note('n1', 'Versión móvil'));
    await syncOnce(phone, server.transport());
    const r = await syncOnce(mac, server.transport());
    expect(r.conflicts).toBe(1);
    expect((mac.get('notes', 'n1') as Note).title).toBe('Versión móvil');
    expect((mac.conflicts[0].local as Note).title).toBe('Versión Mac');
    await syncOnce(phone, server.transport());
    expect((phone.get('notes', 'n1') as Note).title).toBe('Versión móvil');
  });

  it('el reloj híbrido ordena bien aunque un dispositivo vaya atrasado', async () => {
    let tMac = 10_000;
    const tPhone = 1_000; // reloj del móvil muy atrasado
    const server = new MemorySyncServer();
    const mac = new Device('mac', () => tMac);
    const phone = new Device('phone', () => tPhone);
    mac.write('notes', note('n1', 'A'));
    await syncOnce(mac, server.transport());
    await syncOnce(phone, server.transport());
    phone.write('notes', note('n1', 'B (después, con reloj atrasado)'));
    await syncOnce(phone, server.transport());
    tMac += 1;
    await syncOnce(mac, server.transport());
    expect((mac.get('notes', 'n1') as Note).title).toBe('B (después, con reloj atrasado)');
  });

  it('los borrados se propagan como lápidas', async () => {
    const t = 1_000;
    const server = new MemorySyncServer();
    const a = new Device('a', () => t);
    const b = new Device('b', () => t);
    a.write('notes', note('n1', 'X'));
    await syncOnce(a, server.transport());
    await syncOnce(b, server.transport());
    a.write('notes', note('n1', 'X', '2026-10-06T12:00:00.000Z'));
    await syncOnce(a, server.transport());
    await syncOnce(b, server.transport());
    expect(b.get('notes', 'n1')?.deletedAt).toBe('2026-10-06T12:00:00.000Z');
  });

  it('ids deterministas evitan duplicados (mismo hábito marcado en dos dispositivos)', async () => {
    const t = 1_000;
    const server = new MemorySyncServer();
    const a = new Device('a', () => t);
    const b = new Device('b', () => t);
    const log = { id: 'h1_2026-10-06', createdAt: '', deletedAt: null, habitId: 'h1', date: '2026-10-06', status: 'done', value: 1, note: '' };
    a.write('habitLogs', log as never);
    b.write('habitLogs', log as never);
    await syncOnce(a, server.transport());
    const r = await syncOnce(b, server.transport());
    expect(r.conflicts).toBe(0);
    expect(server.snapshot().filter((c) => c.type === 'habitLogs')).toHaveLength(1);
  });
});
