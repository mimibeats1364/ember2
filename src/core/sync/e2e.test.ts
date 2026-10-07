import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createSyncServer } from '../../../server/sync-server.mjs';
import { HybridClock } from '../hlc';
import { deriveSyncKeys, formatSyncCode, generateSyncCode, normalizeSyncCode, openRecord, sealRecord } from './crypto';
import { syncOnce, type ChangeRecord, type LocalReplica } from './engine';
import { HttpTransport, normalizeServerUrl, SyncHttpError } from './http';
import type { AnyEntity, EntityType, Note } from '../types';

const FAST = 1000; // iteraciones PBKDF2 reducidas solo para los tests

class Device implements LocalReplica {
  store = new Map<string, AnyEntity>();
  outbox = new Map<string, ChangeRecord>();
  conflicts: { local: AnyEntity; remote: AnyEntity }[] = [];
  cursor: string | null = null;
  clock: HybridClock;
  constructor(node: string, time: () => number = () => Date.now()) {
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

const note = (id: string, title: string, body = ''): Omit<Note, 'updatedAt'> => ({
  id, createdAt: '2026-10-07T10:00:00.000Z', deletedAt: null, title, body, kind: 'note', tagIds: [], pinned: false,
  inbox: false, archived: false, projectId: null, taskId: null, goalId: null, areaId: null,
});

describe('código y cifrado', () => {
  it('genera códigos legibles y acepta variaciones al escribirlos', () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^([2-9A-HJKMNP-Z]{4}-){4}[2-9A-HJKMNP-Z]{4}$/);
    expect(normalizeSyncCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code.replace(/-/g, ''));
    expect(normalizeSyncCode('demasiado-corto')).toBeNull();
    expect(normalizeSyncCode('OOOO-IIII-LLLL-1111-0000')).toBeNull();
    expect(formatSyncCode('ABCDEFGHJK')).toBe('ABCD-EFGH-JK');
    expect(new Set(Array.from({ length: 50 }, generateSyncCode)).size).toBe(50);
  });

  it('el mismo código da las mismas claves en cualquier dispositivo; otro código, otras', async () => {
    const code = generateSyncCode();
    const a = await deriveSyncKeys(code, FAST);
    const b = await deriveSyncKeys(code.toLowerCase(), FAST);
    const c = await deriveSyncKeys(generateSyncCode(), FAST);
    expect(a.space).toMatch(/^[0-9a-f]{32}$/);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect([b.space, b.token]).toEqual([a.space, a.token]);
    expect(c.space).not.toBe(a.space);
    await expect(deriveSyncKeys('no-vale', FAST)).rejects.toThrow('invalid_sync_code');
  });

  it('cifra y descifra; con otra clave o cambiando la clave del registro falla', async () => {
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    const other = await deriveSyncKeys(generateSyncCode(), FAST);
    const entity = { ...note('n1', 'Diario privado', 'Hoy me siento…'), updatedAt: '0000001-0000-x' } as AnyEntity;
    const sealed = await sealRecord(keys, 'notes', entity);
    expect(sealed.d).not.toContain('Diario');
    expect(sealed.k).not.toContain('n1');
    expect(await openRecord(keys, sealed)).toEqual({ type: 'notes', entity });
    await expect(openRecord(other, sealed)).rejects.toThrow();
    const moved = { ...sealed, k: (await sealRecord(keys, 'notes', { ...entity, id: 'n2' })).k };
    await expect(openRecord(keys, moved)).rejects.toThrow();
  });
});

describe('servidor de sincronización + transporte HTTP', () => {
  let dir: string;
  let server: Server;
  let base: string;

  const start = async () => {
    server = createSyncServer({ dataDir: dir });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const stop = () => new Promise<void>((ok) => server.close(() => ok()));

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ember-sync-'));
    await start();
  });
  afterAll(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('dos dispositivos convergen y el servidor no ve nada en claro', async () => {
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    const mac = new Device('mac');
    const phone = new Device('phone');
    mac.write('notes', note('n1', 'Ideas para el EP', 'secreto'));
    phone.write('notes', note('n2', 'Lista de la compra'));
    await syncOnce(mac, new HttpTransport(base, keys, { create: true }));
    await syncOnce(phone, new HttpTransport(base, keys, { create: true }));
    await syncOnce(mac, new HttpTransport(base, keys, { create: true }));
    expect((mac.get('notes', 'n2') as Note).title).toBe('Lista de la compra');
    expect((phone.get('notes', 'n1') as Note).title).toBe('Ideas para el EP');
    const raw = await readFile(join(dir, 'spaces', `${keys.space}.jsonl`), 'utf8');
    expect(raw).not.toContain('Ideas');
    expect(raw).not.toContain('secreto');
    expect(raw).not.toContain('notes');
    const auth = await readFile(join(dir, 'spaces', `${keys.space}.auth`), 'utf8');
    expect(auth).not.toContain(keys.token);
  });

  it('un conflicto se resuelve por la versión más reciente y conserva la otra', async () => {
    let t = 1_000_000;
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    const mac = new Device('mac', () => t);
    const phone = new Device('phone', () => t);
    mac.write('notes', note('n1', 'Original'));
    await syncOnce(mac, new HttpTransport(base, keys, { create: true }));
    await syncOnce(phone, new HttpTransport(base, keys, { create: true }));
    t += 1000;
    mac.write('notes', note('n1', 'Editado en el Mac'));
    t += 1000;
    phone.write('notes', note('n1', 'Editado en el móvil'));
    await syncOnce(phone, new HttpTransport(base, keys, { create: true }));
    const r = await syncOnce(mac, new HttpTransport(base, keys, { create: true }));
    expect(r.conflicts).toBe(1);
    expect((mac.get('notes', 'n1') as Note).title).toBe('Editado en el móvil');
    expect((mac.conflicts[0].local as Note).title).toBe('Editado en el Mac');
  });

  it('un código que no existe no crea un espacio vacío al comprobarlo', async () => {
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    await expect(new HttpTransport(base, keys).check()).rejects.toMatchObject({ code: 'no_space' });
    await expect(new HttpTransport(base, keys).pull(null)).rejects.toMatchObject({ code: 'no_space' });
    const dev = new Device('a');
    dev.write('notes', note('n1', 'x'));
    await syncOnce(dev, new HttpTransport(base, keys, { create: true }));
    await expect(new HttpTransport(base, keys).check()).resolves.toBeUndefined();
  });

  it('otro token no puede leer ni escribir un espacio ajeno', async () => {
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    const owner = new Device('owner');
    owner.write('notes', note('n0', 'mío'));
    await syncOnce(owner, new HttpTransport(base, keys, { create: true }));
    const thief = { ...(await deriveSyncKeys(generateSyncCode(), FAST)), space: keys.space };
    await expect(new HttpTransport(base, thief).pull(null)).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(new HttpTransport(base, thief).push([])).resolves.toBeUndefined();
    const dev = new Device('x');
    dev.write('notes', note('n9', 'x'));
    await expect(new HttpTransport(base, thief).push(dev.pending())).rejects.toBeInstanceOf(SyncHttpError);
  });

  it('pagina, conserva los datos al reiniciar y no duplica', async () => {
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    const mac = new Device('mac');
    for (let i = 0; i < 1203; i++) mac.write('notes', note(`n${i}`, `Nota ${i}`));
    await syncOnce(mac, new HttpTransport(base, keys, { create: true }));
    await stop();
    await start();
    const fresh = new Device('ipad');
    const r = await syncOnce(fresh, new HttpTransport(base, keys, { create: true }));
    expect(r.pulled).toBe(1203);
    expect(fresh.store.size).toBe(1203);
    const again = await syncOnce(fresh, new HttpTransport(base, keys, { create: true }));
    expect(again.pulled).toBe(0);
  });

  it('sin servidor da un error de red claro', async () => {
    const keys = await deriveSyncKeys(generateSyncCode(), FAST);
    await expect(new HttpTransport('http://127.0.0.1:1', keys).pull(null)).rejects.toMatchObject({ code: 'network' });
  });
});

describe('direcciones de servidor', () => {
  it('añade https, quita barras y solo permite http en la red local', () => {
    expect(normalizeServerUrl('sync.ejemplo.com/')).toBe('https://sync.ejemplo.com');
    expect(normalizeServerUrl('localhost:8787')).toBe('http://localhost:8787');
    expect(normalizeServerUrl('https://casa.tailnet.ts.net/ember/')).toBe('https://casa.tailnet.ts.net/ember');
    expect(normalizeServerUrl('http://192.168.1.20:8787')).toBeNull();
    expect(normalizeServerUrl('http://sync.ejemplo.com')).toBeNull();
    expect(normalizeServerUrl('ftp://x')).toBeNull();
    expect(normalizeServerUrl('')).toBeNull();
  });
});

describe('el servidor también sirve la app web (un solo despliegue)', () => {
  it('sirve la app, cae en index.html para rutas de la app y nunca sale de su carpeta', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'ember-static-'));
    const app = join(root, 'dist');
    await mkdir(join(app, 'assets'), { recursive: true });
    await writeFile(join(app, 'index.html'), '<!doctype html><title>Ember</title>');
    await writeFile(join(app, 'assets', 'app-123.js'), 'console.log(1)');
    await writeFile(join(root, 'secreto.txt'), 'no');
    const srv = createSyncServer({ dataDir: join(root, 'data'), staticDir: app });
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const home = await fetch(`${base}/`);
      expect(home.headers.get('content-type')).toContain('text/html');
      expect(await home.text()).toContain('<title>Ember</title>');
      const js = await fetch(`${base}/assets/app-123.js`);
      expect(js.headers.get('cache-control')).toContain('immutable');
      expect((await fetch(`${base}/?join=ABCD`)).status).toBe(200);
      expect(await (await fetch(`${base}/settings/sync`)).text()).toContain('Ember');
      expect((await fetch(`${base}/assets/no-existe.js`)).status).toBe(404);
      for (const evil of ['/../secreto.txt', '/%2e%2e/secreto.txt', '/..%2fsecreto.txt', '/assets/..%2f..%2fsecreto.txt']) {
        const res = await fetch(`${base}${evil}`);
        expect(await res.text(), evil).not.toBe('no');
      }
      const health = await (await fetch(`${base}/v1/health`)).json();
      expect(health).toMatchObject({ service: 'ember-sync', app: true });
    } finally {
      await new Promise<void>((ok) => srv.close(() => ok()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
