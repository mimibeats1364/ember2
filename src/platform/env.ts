/** Detección de plataforma. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Etiqueta del modificador principal: ⌘ en Mac, Ctrl en el resto. */
export const MOD = isMac ? '⌘' : 'Ctrl';

export const APP_VERSION = '0.2.0';
