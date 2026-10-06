/**
 * Arrastrar y soltar basado en Pointer Events: funciona igual con ratón, trackpad y táctil
 * (y con WebKit/WebView2), a diferencia del DnD HTML5.
 */
import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';

export interface DragPayload {
  kind: 'task' | 'event' | 'habit';
  id: string;
  title: string;
  durationMin?: number;
}

export interface DropInfo {
  x: number;
  y: number;
  target: HTMLElement;
}

interface DragState {
  payload: DragPayload | null;
  x: number;
  y: number;
  over: string | null;
}

export const useDragState = create<DragState>(() => ({ payload: null, x: 0, y: 0, over: null }));

const handlers = new Map<string, (p: DragPayload, info: DropInfo) => void>();

/** Registra un destino: el elemento debe llevar `data-drop={id}`. */
export function useDropTarget(id: string, onDrop: (p: DragPayload, info: DropInfo) => void) {
  useEffect(() => {
    handlers.set(id, onDrop);
    return () => {
      if (handlers.get(id) === onDrop) handlers.delete(id);
    };
  }, [id, onDrop]);
}

/** Varios destinos con el mismo manejador (nº variable de ids sin romper las reglas de hooks). */
export function useDropTargets(ids: string[], onDrop: (p: DragPayload, info: DropInfo) => void) {
  const key = ids.join('|');
  useEffect(() => {
    for (const id of ids) handlers.set(id, onDrop);
    return () => {
      for (const id of ids) if (handlers.get(id) === onDrop) handlers.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onDrop]);
}

function dropTargetAt(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  return el?.closest<HTMLElement>('[data-drop]') ?? null;
}

/** Llama desde onPointerDown. Solo empieza a arrastrar tras moverse unos píxeles. */
export function beginDrag(e: ReactPointerEvent, payload: DragPayload) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;
  const move = (ev: PointerEvent) => {
    if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
    if (!active) {
      active = true;
      document.body.style.cursor = 'grabbing';
    }
    ev.preventDefault();
    const target = dropTargetAt(ev.clientX, ev.clientY);
    useDragState.setState({ payload, x: ev.clientX, y: ev.clientY, over: target?.dataset.drop ?? null });
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.style.cursor = '';
    if (!active) return;
    // Evita que el clic que sigue al arrastre abra el elemento.
    const swallow = (ce: MouseEvent) => {
      ce.stopPropagation();
      ce.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 50);
    const target = dropTargetAt(ev.clientX, ev.clientY);
    useDragState.setState({ payload: null, over: null });
    const id = target?.dataset.drop;
    if (id && target) handlers.get(id)?.(payload, { x: ev.clientX, y: ev.clientY, target });
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

export function DragGhost() {
  const { payload, x, y } = useDragState();
  if (!payload) return null;
  return (
    <div className="drag-ghost" style={{ left: x, top: y }}>
      {payload.title}
    </div>
  );
}
