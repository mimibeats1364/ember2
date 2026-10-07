import { useEffect, useState } from 'react';
import type { FocusState } from '@core/focus';
import { announceIslandReady, onIslandState, sendIslandCommand, type IslandPayload } from '@/platform/native';
import { IslandPill } from './LiveIsland';
import { isTauri } from '@/platform/env';

/**
 * Ventana flotante de la isla de Focus (macOS). No toca datos: recibe el estado de la
 * ventana principal y le devuelve órdenes (pausar, saltar, abrir).
 */
export function IslandWindow() {
  const [payload, setPayload] = useState<IslandPayload | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('island-window');
    if (isTauri()) root.setAttribute('data-window-glass', '');
    document.getElementById('splash')?.remove();
    let un: (() => void) | undefined;
    void onIslandState((p) => {
      setPayload(p);
      root.dataset.theme = p.theme;
    }).then((u) => {
      un = u;
      void announceIslandReady();
    });
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => {
      un?.();
      clearInterval(id);
    };
  }, []);
  const state = payload?.state as FocusState | null | undefined;
  if (!state) return <div className="island-native" data-tauri-drag-region />;
  return (
    <div className="island-native" data-tauri-drag-region>
      <IslandPill state={state} now={now} expanded native onCommand={(c) => void sendIslandCommand(c)} />
    </div>
  );
}
