/**
 * Estado de la sesión de Focus en curso (persistido en el dispositivo, no se sincroniza).
 * La lógica pura vive en @core/focus; aquí solo se orquesta y persiste.
 */
import { create } from 'zustand';
import * as F from '@core/focus';
import { getMeta, setMeta } from '@/data/store';
import { saveFocusSession, completeTask } from '@/data/actions';
import { playAmbient, stopAmbient, playUiSound, type AmbientKind } from '@/platform/sound';

interface FocusUi {
  state: F.FocusState | null;
  /** Resumen de la última sesión terminada (pantalla de celebración). */
  finished: { focusSec: number; taskId: string | null; label: string; completed: boolean } | null;
  sound: AmbientKind;
  volume: number;
}

export const useFocus = create<FocusUi>(() => ({ state: null, finished: null, sound: 'none', volume: 0.5 }));

const KEY = 'focus_state_v1';

function persist() {
  const { state, sound, volume } = useFocus.getState();
  void setMeta(KEY, JSON.stringify({ state, sound, volume }));
}

export async function restoreFocus() {
  try {
    const raw = await getMeta(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { state: F.FocusState | null; sound: AmbientKind; volume: number };
    useFocus.setState({ state: saved.state, sound: saved.sound ?? 'none', volume: saved.volume ?? 0.5 });
    if (saved.state && saved.state.status === 'running' && saved.sound !== 'none') playAmbient(saved.sound, saved.volume);
  } catch {
    /* estado ilegible: se descarta */
  }
}

export function startFocusSession(config: F.FocusConfig, taskId: string | null, label: string, sound: AmbientKind, volume: number) {
  const state = F.startFocus(config, Date.now(), taskId, label);
  useFocus.setState({ state, finished: null, sound, volume });
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

/** Termina y guarda la sesión. `note` = motivo opcional de interrupción. */
export function endFocusSession(note = '') {
  const { state } = useFocus.getState();
  if (!state) return;
  const summary = F.stop(state, Date.now());
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
  stopAmbient();
  useFocus.setState({ state: null, finished: { focusSec: summary.focusSec, taskId: state.taskId, label: state.label, completed: summary.completed } });
  persist();
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
