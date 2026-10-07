/**
 * Ejecuta los enlaces ember:// (Atajos de Apple, Siri, Raycast…). Ver @core/deeplink.
 */
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { parseDeepLink } from '@core/deeplink';
import { parseInput } from '@core/nlp';
import { today as todayFn } from '@core/dates';
import { useData } from '@/data/store';
import type { CaptureKind } from '@/data/actions';
import { notify, showMainWindow } from '@/platform/native';
import { isTauri } from '@/platform/env';
import { t } from '@/i18n';
import { navigate, openPalette } from './ui';
import { performCapture } from './QuickCapture';
import { previewCommand } from './commandRunner';
import { useFocus } from './focusStore';

const handled = new Set<string>();

export function runDeepLink(url: string): boolean {
  const today = todayFn();
  const action = parseDeepLink(url, today);
  if (!action) return false;
  switch (action.type) {
    case 'capture': {
      const projects = Object.values(useData.getState().c.projects).filter((p) => !p.deletedAt).map((p) => p.name);
      const parsed = parseInput(action.text, { today, projects });
      const kind: CaptureKind = action.kind ?? (parsed.kind === 'note' ? 'note' : parsed.kind === 'idea' ? 'idea' : parsed.kind === 'habit' ? 'habit' : parsed.kind === 'event' ? 'event' : 'task');
      const ok = performCapture(action.text, kind, parsed);
      // Desde Atajos no se ve la ventana: una notificación confirma que se ha guardado.
      if (ok) void notify('Ember', t('deeplink.captured', { text: parsed.title || action.text }));
      return ok;
    }
    case 'open':
      void showMainWindow();
      navigate(action.screen);
      return true;
    case 'command':
      void showMainWindow();
      openPalette(true, action.q);
      return true;
    case 'focusStart': {
      const preview = previewCommand({ type: 'focusStart', minutes: action.minutes, deep: action.deep, task: action.task });
      if (!preview.disabled) preview.run();
      return true;
    }
    case 'focus': {
      const type = action.action === 'pause' ? 'focusPause' : action.action === 'resume' ? 'focusResume' : 'focusStop';
      // Sin sesión en curso no hay nada que pausar: no se hace nada.
      if (!useFocus.getState().state) return false;
      const preview = previewCommand({ type });
      if (!preview.disabled) preview.run();
      return true;
    }
  }
}

/** Escucha los enlaces mientras la app está abierta y procesa el que la abrió. */
export async function listenDeepLinks(): Promise<() => void> {
  if (!isTauri()) return () => {};
  const handle = (urls: string[] | null) => {
    for (const u of urls ?? []) {
      if (handled.has(u)) continue;
      handled.add(u);
      runDeepLink(u);
    }
  };
  try {
    handle(await getCurrent());
  } catch {
    /* sin enlace inicial */
  }
  return onOpenUrl(handle);
}
