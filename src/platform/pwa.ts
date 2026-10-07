/**
 * Versión web instalable (PWA): service worker, aviso de instalación y accesos directos.
 * En la app nativa (Tauri) no hace nada.
 */
import { create } from 'zustand';
import { isTauri } from './env';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Chrome/Edge/Android ofrecen instalar: guardamos el aviso para lanzarlo con un botón. */
  canPrompt: boolean;
  installed: boolean;
}

export const usePwa = create<PwaState>(() => ({ canPrompt: false, installed: false }));

let deferred: InstallPromptEvent | null = null;

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone/iPad en Safari: se instala con Compartir → Añadir a pantalla de inicio. */
export const isIosSafari = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

export function setupPwa(): void {
  if (typeof window === 'undefined' || isTauri()) return;
  usePwa.setState({ installed: isStandalone() });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    usePwa.setState({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    usePwa.setState({ canPrompt: false, installed: true });
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[ember] service worker', err));
    });
  }
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  usePwa.setState({ canPrompt: false });
  return outcome === 'accepted';
}

export type LaunchAction = { capture: 'task' | 'note' | 'idea' } | { screen: string } | { orbit: true } | { join: string } | null;

/**
 * Accesos directos del icono instalado (`/?capture=task`, `/?screen=focus`, `/?orbit=1`) y el
 * enlace del QR para unir un dispositivo (`/?join=CÓDIGO`, servido por tu servidor de Ember).
 */
export function takeLaunchAction(): LaunchAction {
  if (typeof window === 'undefined' || !window.location.search) return null;
  const q = new URLSearchParams(window.location.search);
  let action: LaunchAction = null;
  const capture = q.get('capture');
  if (capture === 'task' || capture === 'note' || capture === 'idea') action = { capture };
  else if (q.get('join')) action = { join: q.get('join')! };
  else if (q.get('orbit')) action = { orbit: true };
  else if (q.get('screen')) action = { screen: q.get('screen')! };
  if (action) window.history.replaceState(null, '', window.location.pathname);
  return action;
}
