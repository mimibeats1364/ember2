/**
 * Sincronización de la app de punta a punta: dos "dispositivos" (dos copias independientes de
 * los módulos de datos, cada uno con su almacenamiento en memoria) contra el servidor real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createSyncServer } from '../../server/sync-server.mjs';
import type { Task } from '@core/types';

type StoreMod = typeof import('./store');
type SyncMod = typeof import('./sync');
type ActionsMod = typeof import('./actions');
interface Device {
  store: StoreMod;
  sync: SyncMod;
  actions: ActionsMod;
}

/** Carga una copia nueva de los módulos: es como abrir Ember en otro dispositivo. */
async function device(): Promise<Device> {
  vi.resetModules();
  const store = await import('./store');
  await store.initData();
  return { store, sync: await import('./sync'), actions: await import('./actions') };
}

const tasks = (d: Device) => Object.values(d.store.useData.getState().c.tasks).filter((x: Task) => !x.deletedAt);

let dir: string;
let server: Server;
let url: string;

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  dir = await mkdtemp(join(tmpdir(), 'ember-app-sync-'));
  server = createSyncServer({ dataDir: dir });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => server.close(() => ok()));
  await rm(dir, { recursive: true, force: true });
});

describe('sincronización entre dispositivos (app)', () => {
  it('crear espacio, unirse, adoptar ajustes, propagar cambios y resolver conflictos', async () => {
    // Mac: ya tiene datos y un nombre.
    const mac = await device();
    mac.store.updatePrefs({ name: 'Jymmy', theme: 'ocean', onboarded: true });
    const t1 = mac.actions.createTask({ title: 'Grabar voces', date: '2026-10-07' });
    const code = mac.sync.generateSyncCode();
    expect(await mac.sync.connectSync('ftp://servidor', code, 'create')).toEqual({ ok: false, error: 'invalid_server' });
    expect(await mac.sync.connectSync('http://127.0.0.1:1', code, 'create')).toEqual({ ok: false, error: 'network' });
    expect(await mac.sync.connectSync(url, 'mal', 'create')).toEqual({ ok: false, error: 'invalid_code' });
    expect(await mac.sync.connectSync(url, code, 'create')).toEqual({ ok: true });
    await mac.sync.syncNow();
    expect(mac.sync.useSync.getState()).toMatchObject({ configured: true, status: 'idle', error: null });

    // iPhone: recién instalado, con sus propios ajustes por defecto (más nuevos).
    const phone = await device();
    phone.store.updatePrefs({ name: '', theme: 'ember', onboarded: true });
    expect(await phone.sync.connectSync(url, phone.sync.generateSyncCode(), 'join')).toEqual({ ok: false, error: 'no_space' });
    expect(await phone.sync.connectSync(url, code.toLowerCase(), 'join')).toEqual({ ok: true });
    await phone.sync.syncNow();
    // Al unirse adopta los ajustes del espacio y recibe los datos.
    expect(phone.store.getPrefs()).toMatchObject({ name: 'Jymmy', theme: 'ocean' });
    expect(tasks(phone).map((x) => x.title)).toContain('Grabar voces');

    // Lo que se crea en el móvil llega al Mac, y el Mac conserva su nombre.
    phone.actions.createTask({ title: 'Comprar cuerdas' });
    await phone.sync.syncNow();
    await mac.sync.syncNow();
    expect(tasks(mac).map((x) => x.title).sort()).toEqual(['Comprar cuerdas', 'Grabar voces']);
    expect(mac.store.getPrefs().name).toBe('Jymmy');

    // Conflicto: los dos editan la misma tarea sin conexión.
    mac.actions.updateTask(t1.id, { title: 'Grabar voces (Mac)' });
    await new Promise((r) => setTimeout(r, 5));
    phone.actions.updateTask(t1.id, { title: 'Grabar voces (móvil)' });
    await phone.sync.syncNow();
    await mac.sync.syncNow();
    expect(mac.store.getEntity('tasks', t1.id)?.title).toBe('Grabar voces (móvil)');
    const conflicts = Object.values(mac.store.useData.getState().c.conflicts).filter((c) => !c.resolvedAt);
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0].local as Task).title).toBe('Grabar voces (Mac)');

    // "Conservar la descartada" la recupera en todos los dispositivos.
    await mac.sync.keepDiscardedVersion(conflicts[0]);
    await mac.sync.syncNow();
    await phone.sync.syncNow();
    expect(mac.store.getEntity('tasks', t1.id)?.title).toBe('Grabar voces (Mac)');
    expect(phone.store.getEntity('tasks', t1.id)?.title).toBe('Grabar voces (Mac)');
    expect(Object.values(mac.store.useData.getState().c.conflicts).every((c) => c.resolvedAt)).toBe(true);
    // Los conflictos son de cada dispositivo: no viajan.
    expect(Object.keys(phone.store.useData.getState().c.conflicts)).toHaveLength(0);

    // Borrar en un lado borra en el otro (lápida), y desconectar no toca los datos.
    phone.actions.deleteTask(t1.id);
    await phone.sync.syncNow();
    await mac.sync.syncNow();
    expect(mac.store.getEntity('tasks', t1.id)?.deletedAt).toBeTruthy();
    await phone.sync.disconnectSync();
    expect(phone.sync.useSync.getState().configured).toBe(false);
    expect(tasks(phone).map((x) => x.title)).toEqual(['Comprar cuerdas']);
  }, 30_000);
});
