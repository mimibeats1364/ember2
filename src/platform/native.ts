/**
 * Puente con la plataforma. En la app nativa (Tauri) usa APIs del sistema; en el navegador
 * cae a equivalentes web. El resto de la app no sabe en qué plataforma corre.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, emit, emitTo, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow, Effect, EffectState } from '@tauri-apps/api/window';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { register, unregister, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isMac, isTauri } from './env';

// ── Ventana ────────────────────────────────────────────────────────────────────────────

export function windowLabel(): string {
  if (!isTauri()) return new URLSearchParams(location.search).get('window') ?? 'main';
  try {
    return getCurrentWindow().label;
  } catch {
    return 'main';
  }
}

export async function hideCaptureWindow() {
  if (isTauri()) await invoke('hide_capture').catch(() => {});
}

export async function showMainWindow() {
  if (isTauri()) await invoke('show_main_window').catch(() => {});
}

// ── Vidrio nativo de macOS ─────────────────────────────────────────────────────────────

export function supportsWindowGlass(): boolean {
  return isTauri() && isMac;
}

/**
 * Pone (o quita) el vidrio del sistema detrás de la ventana: Liquid Glass (NSGlassEffectView)
 * en macOS 26 o posterior y, en versiones anteriores, el material translúcido clásico.
 */
export async function setWindowGlass(on: boolean): Promise<boolean> {
  if (!supportsWindowGlass()) return false;
  const w = getCurrentWindow();
  try {
    if (on) {
      await w.setEffects({ effects: [Effect.LiquidGlassRegular, Effect.UnderWindowBackground], state: EffectState.FollowsWindowActiveState });
      return true;
    }
    await w.clearEffects();
  } catch (e) {
    console.warn('[ember] vidrio de ventana', e);
  }
  return false;
}

/** Apariencia de la ventana (semáforos y vidrio) a juego con el tema de Ember. */
export async function setWindowTheme(theme: 'light' | 'dark') {
  if (!isTauri()) return;
  await getCurrentWindow().setTheme(theme).catch(() => {});
}

/** Número en el icono del Dock (0 lo quita). */
export async function setDockBadge(count: number) {
  if (!isTauri()) return;
  await getCurrentWindow().setBadgeCount(count > 0 ? count : undefined).catch(() => {});
}

// ── Notificaciones ─────────────────────────────────────────────────────────────────────

export type NotifyPermission = 'granted' | 'denied' | 'default';

export async function notificationPermission(): Promise<NotifyPermission> {
  if (isTauri()) return (await isPermissionGranted()) ? 'granted' : 'default';
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/** Pide permiso solo cuando hace falta (al activar notificaciones o al primer aviso). */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (isTauri()) {
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string): Promise<boolean> {
  try {
    if (isTauri()) {
      if (!(await isPermissionGranted())) return false;
      sendNotification({ title, body });
      return true;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png', silent: false });
      return true;
    }
  } catch {
    /* ignorado */
  }
  return false;
}

// ── Barra de menús / bandeja ───────────────────────────────────────────────────────────

export interface TrayState {
  tasks: { id: string; title: string; time: string | null }[];
  focusRunning: boolean;
  focusLabel: string | null;
}

let lastTray = '';
export async function updateTray(state: TrayState) {
  if (!isTauri()) return;
  const key = JSON.stringify(state);
  if (key === lastTray) return;
  lastTray = key;
  await invoke('update_tray', { state }).catch((e) => console.warn('[ember] tray', e));
}

let lastTitle: string | null = '';
export async function setTrayTitle(title: string | null) {
  if (!isTauri() || title === lastTitle) return;
  lastTitle = title;
  await invoke('set_tray_title', { title }).catch(() => {});
}

// ── Eventos nativos ────────────────────────────────────────────────────────────────────

export interface NativeAction {
  action: string;
  id: string | null;
}

export async function onNativeAction(cb: (a: NativeAction) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<NativeAction>('ember://native', (e) => cb(e.payload));
}

/** La ventana de captura envía lo capturado a la principal (que es la dueña de los datos). */
export interface CapturePayload {
  text: string;
  kind: string;
}

export async function sendCapture(payload: CapturePayload) {
  if (isTauri()) await emit('ember://capture', payload);
}

export async function onCapture(cb: (p: CapturePayload) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<CapturePayload>('ember://capture', (e) => cb(e.payload));
}

export async function onCaptureShown(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen('ember://capture-shown', () => cb());
}

// ── Isla de Focus (ventana flotante) ───────────────────────────────────────────────────

export interface IslandPayload {
  state: unknown;
  theme: string;
  glass: boolean;
}

let islandVisible: boolean | null = null;
export async function setIslandVisible(visible: boolean) {
  if (!isTauri() || islandVisible === visible) return;
  islandVisible = visible;
  await invoke('set_island', { visible }).catch((e) => console.warn('[ember] isla', e));
}

export async function sendIslandState(payload: IslandPayload) {
  if (isTauri()) await emitTo('island', 'ember://island-state', payload).catch(() => {});
}

export async function onIslandState(cb: (p: IslandPayload) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<IslandPayload>('ember://island-state', (e) => cb(e.payload));
}

export async function sendIslandCommand(cmd: string) {
  if (isTauri()) await emit('ember://island-cmd', { cmd });
}

export async function onIslandCommand(cb: (cmd: string) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<{ cmd: string }>('ember://island-cmd', (e) => cb(e.payload.cmd));
}

export async function announceIslandReady() {
  if (isTauri()) await emit('ember://island-ready');
}

export async function onIslandReady(cb: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen('ember://island-ready', () => cb());
}

/** Avisa cuando la ventana principal gana o pierde el foco. */
export async function onMainFocusChange(cb: (focused: boolean) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  const w = getCurrentWindow();
  cb(await w.isFocused().catch(() => true));
  return w.onFocusChanged(({ payload }) => cb(payload));
}

// ── Atajo global ───────────────────────────────────────────────────────────────────────

let registeredShortcut: string | null = null;

export async function registerCaptureShortcut(accelerator: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    if (registeredShortcut && registeredShortcut !== accelerator && (await isRegistered(registeredShortcut))) await unregister(registeredShortcut);
    if (await isRegistered(accelerator)) await unregister(accelerator);
    await register(accelerator, (e) => {
      if (e.state === 'Pressed') void invoke('toggle_capture');
    });
    registeredShortcut = accelerator;
    return true;
  } catch (err) {
    console.warn('[ember] atajo global', err);
    return false;
  }
}

// ── Archivos ───────────────────────────────────────────────────────────────────────────

export async function saveTextFile(defaultName: string, content: string, ext: string, label: string): Promise<boolean> {
  if (isTauri()) {
    const path = await saveDialog({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }
  const mime = { json: 'application/json', csv: 'text/csv', ics: 'text/calendar', md: 'text/markdown' }[ext] ?? 'text/plain';
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export async function openTextFile(exts: string[], label: string): Promise<{ name: string; text: string } | null> {
  if (isTauri()) {
    const path = await openDialog({ multiple: false, directory: false, filters: [{ name: label, extensions: exts }] });
    if (!path || Array.isArray(path)) return null;
    return { name: String(path).split('/').pop() ?? '', text: await readTextFile(String(path)) };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = exts.map((e) => `.${e}`).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : null);
    };
    input.click();
  });
}

// ── Enlaces externos ───────────────────────────────────────────────────────────────────

/** Abre un enlace http(s) en el navegador del sistema (nunca dentro de la app). */
export async function openExternal(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri()) await openUrl(url).catch(() => {});
  else window.open(url, '_blank', 'noopener,noreferrer');
}
