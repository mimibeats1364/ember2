/**
 * Estado de la sesión de Focus en curso (persistido en el dispositivo, no se sincroniza).
 * La lógica pura vive en @core/focus; aquí solo se orquesta y persiste.
 */
import { create } from 'zustand';
import * as F from '@core/focus';
import { getMeta, setMeta } from '@/data/store';
import { saveFocusSession, completeTask, createTask } from '@/data/actions';
import { playAmbient, stopAmbient, playUiSound, type AmbientKind } from '@/platform/sound';

interface FocusUi {
  state: F.FocusState | null;
  /** Resumen de la última sesión terminada (pantalla de celebración). */
  finished: { focusSec: number; taskId: string | null; label: string; completed: boolean; parked: number } | null;
  sound: AmbientKind;
  volume: number;
  /** Pensamientos aparcados en la bandeja durante la sesión (sin salir de Focus). */
  parked: string[];
}

export const useFocus = create<FocusUi>(() => ({ state: null, finished: null, sound: 'none', volume: 0.5, parked: [] }));

const KEY = 'focus_state_v1';

function persist() {
  const { state, sound, volume, parked } = useFocus.getState();
  void setMeta(KEY, JSON.stringify({ state, sound, volume, parked }));
}

export async function restoreFocus() {
  try {
    const raw = await getMeta(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { state: F.FocusState | null; sound: AmbientKind; volume: number; parked?: string[] };
    useFocus.setState({ state: saved.state, sound: saved.sound ?? 'none', volume: saved.volume ?? 0.5, parked: saved.parked ?? [] });
    if (saved.state && saved.state.status === 'running' && saved.sound !== 'none') playAmbient(saved.sound, saved.volume);
  } catch {
    /* estado ilegible: se descarta */
  }
}

export function startFocusSession(config: F.FocusConfig, taskId: string | null, label: string, sound: AmbientKind, volume: number) {
  // Si ya había una sesión, se guarda antes de empezar la nueva: nunca se pierde tiempo registrado.
  const prev = useFocus.getState().state;
  if (prev) saveSummary(prev, F.stop(prev, Date.now()), '');
  const state = F.startFocus(config, Date.now(), taskId, label);
  useFocus.setState({ state, finished: null, sound, volume, parked: [] });
  playUiSound('start');
  if (sound !== 'none') playAmbient(sound, volume);
  persist();
}

export function togglePauseFocus() {
  const { state } = useFocus.getState();
  if (!state) return;
  if (state.status === 'awaiting') {
    useFocus.setState({ state: F.continuePhase(state, Date.now()) });
  } else {
    const next = F.togglePause(state, Date.now());
    useFocus.setState({ state: next });
    const { sound, volume } = useFocus.getState();
    if (next.status === 'paused') stopAmbient();
    else if (sound !== 'none' && next.phase === 'focus') playAmbient(sound, volume);
  }
  persist();
}

export function continueFocus() {
  const { state, sound, volume } = useFocus.getState();
  if (!state) return;
  useFocus.setState({ state: F.continuePhase(state, Date.now()) });
  if (state.phase === 'focus' && sound !== 'none') playAmbient(sound, volume);
  persist();
}

export function skipFocusPhase() {
  const { state } = useFocus.getState();
  if (!state) return;
  useFocus.setState({ state: F.skipPhase(state, Date.now()) });
  persist();
}

export function setFocusSound(sound: AmbientKind, volume: number) {
  useFocus.setState({ sound, volume });
  const { state } = useFocus.getState();
  if (state && state.status === 'running' && state.phase === 'focus') playAmbient(sound, volume);
  else if (sound === 'none') stopAmbient();
  persist();
}

function saveSummary(state: F.FocusState, summary: ReturnType<typeof F.stop>, note: string) {
  saveFocusSession({
    taskId: state.taskId,
    label: state.label,
    mode: state.config.mode,
    plannedMin: summary.plannedMin,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    focusSec: summary.focusSec,
    completed: summary.completed,
    interrupted: summary.interrupted,
    note,
  });
}

/** Termina y guarda la sesión. `note` = motivo opcional de interrupción. */
export function endFocusSession(note = '') {
  const { state } = useFocus.getState();
  if (!state) return;
  const summary = F.stop(state, Date.now());
  saveSummary(state, summary, note);
  stopAmbient();
  useFocus.setState({ state: null, finished: { focusSec: summary.focusSec, taskId: state.taskId, label: state.label, completed: summary.completed, parked: useFocus.getState().parked.length }, parked: [] });
  persist();
}

/** Aparca un pensamiento en la bandeja sin interrumpir la sesión. */
export function parkThought(text: string): boolean {
  const title = text.trim();
  if (!title) return false;
  createTask({ title, inbox: true });
  useFocus.setState((s) => ({ parked: [...s.parked, title] }));
  persist();
  return true;
}

export function dismissFinished(markTaskDone = false) {
  const { finished } = useFocus.getState();
  if (markTaskDone && finished?.taskId) completeTask(finished.taskId);
  useFocus.setState({ finished: null });
}

/** Avance del reloj: devuelve eventos para que el motor notifique. */
export function tickFocus(): F.FocusEvent[] {
  const { state } = useFocus.getState();
  if (!state || state.status !== 'running') return [];
  const { state: next, events } = F.tick(state, Date.now());
  if (events.length === 0) return [];
  useFocus.setState({ state: next });
  const last = events[events.length - 1];
  if (last.type === 'focus_block_done') {
    stopAmbient();
    playUiSound('break');
  } else if (last.type === 'break_done') {
    playUiSound('start');
  } else if (last.type === 'session_done') {
    playUiSound('focusDone');
    endFocusSession();
    return events;
  }
  persist();
  return events;
}
