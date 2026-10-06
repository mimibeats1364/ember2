/**
 * Temporizador de Focus como máquina de estados pura.
 *
 * El tiempo se deriva de marcas absolutas (nunca de "ticks" acumulados), así que el
 * temporizador es exacto aunque la app se suspenda, el Mac duerma o se recargue la ventana.
 */
import type { FocusMode, ID } from './types';

export type FocusPhase = 'focus' | 'break' | 'long_break';

export interface FocusConfig {
  mode: FocusMode;
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  /** Cada cuántos bloques toca descanso largo (pomodoro). */
  longBreakEvery: number;
  /** Número de bloques de foco planificados (deep work = 1). */
  cycles: number;
  autoStartBreaks: boolean;
}

export interface FocusState {
  status: 'running' | 'paused' | 'awaiting' | 'finished';
  phase: FocusPhase;
  /** Bloque de foco actual (1-based). */
  cycle: number;
  config: FocusConfig;
  taskId: ID | null;
  label: string;
  sessionStartedAt: number;
  phaseStartedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  /** Segundos de foco acumulados en bloques ya terminados. */
  focusSecDone: number;
}

export const PRESETS = {
  '25/5': { focusMin: 25, breakMin: 5, longBreakMin: 15 },
  '50/10': { focusMin: 50, breakMin: 10, longBreakMin: 20 },
  '90/20': { focusMin: 90, breakMin: 20, longBreakMin: 30 },
} as const;

export const DEEP_WORK_MINUTES = [30, 60, 90, 120] as const;

export function pomodoroConfig(focusMin: number, breakMin: number, longBreakMin = breakMin * 3, cycles = 4, autoStartBreaks = true): FocusConfig {
  return { mode: 'pomodoro', focusMin, breakMin, longBreakMin, longBreakEvery: 4, cycles, autoStartBreaks };
}

export function deepWorkConfig(minutes: number): FocusConfig {
  return { mode: 'deep', focusMin: minutes, breakMin: 0, longBreakMin: 0, longBreakEvery: 0, cycles: 1, autoStartBreaks: false };
}

export function startFocus(config: FocusConfig, now: number, taskId: ID | null, label: string): FocusState {
  return {
    status: 'running',
    phase: 'focus',
    cycle: 1,
    config,
    taskId,
    label,
    sessionStartedAt: now,
    phaseStartedAt: now,
    pausedAt: null,
    pausedMs: 0,
    focusSecDone: 0,
  };
}

export function phaseDurationMs(s: FocusState): number {
  const c = s.config;
  const min = s.phase === 'focus' ? c.focusMin : s.phase === 'long_break' ? c.longBreakMin : c.breakMin;
  return min * 60_000;
}

export function elapsedMs(s: FocusState, now: number): number {
  const end = s.pausedAt ?? now;
  return Math.max(0, end - s.phaseStartedAt - s.pausedMs);
}

export function remainingMs(s: FocusState, now: number): number {
  return Math.max(0, phaseDurationMs(s) - elapsedMs(s, now));
}

/** Segundos de foco efectivo hasta ahora (incluye el bloque en curso). */
export function focusSeconds(s: FocusState, now: number): number {
  const current = s.phase === 'focus' && s.status !== 'awaiting' && s.status !== 'finished' ? Math.min(elapsedMs(s, now), phaseDurationMs(s)) : 0;
  return Math.floor(s.focusSecDone + current / 1000);
}

export function pause(s: FocusState, now: number): FocusState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', pausedAt: now };
}

export function resume(s: FocusState, now: number): FocusState {
  if (s.status !== 'paused' || s.pausedAt === null) return s;
  return { ...s, status: 'running', pausedMs: s.pausedMs + (now - s.pausedAt), pausedAt: null };
}

export function togglePause(s: FocusState, now: number): FocusState {
  return s.status === 'paused' ? resume(s, now) : pause(s, now);
}

export type FocusEvent =
  | { type: 'focus_block_done'; cycle: number }
  | { type: 'break_done'; cycle: number }
  | { type: 'session_done' };

function nextPhase(s: FocusState, at: number): { state: FocusState; event: FocusEvent } {
  const c = s.config;
  if (s.phase === 'focus') {
    const focusSecDone = s.focusSecDone + Math.round(phaseDurationMs(s) / 1000);
    if (s.cycle >= c.cycles || c.breakMin === 0) {
      return { state: { ...s, status: 'finished', focusSecDone, pausedAt: null }, event: { type: 'session_done' } };
    }
    const long = c.longBreakEvery > 0 && s.cycle % c.longBreakEvery === 0;
    return {
      state: {
        ...s,
        phase: long ? 'long_break' : 'break',
        status: c.autoStartBreaks ? 'running' : 'awaiting',
        phaseStartedAt: at,
        pausedAt: null,
        pausedMs: 0,
        focusSecDone,
      },
      event: { type: 'focus_block_done', cycle: s.cycle },
    };
  }
  return {
    state: { ...s, phase: 'focus', cycle: s.cycle + 1, status: 'awaiting', phaseStartedAt: at, pausedAt: null, pausedMs: 0 },
    event: { type: 'break_done', cycle: s.cycle },
  };
}

/** Avanza las fases vencidas. Devuelve los eventos ocurridos (para notificar y sonar). */
export function tick(s: FocusState, now: number): { state: FocusState; events: FocusEvent[] } {
  const events: FocusEvent[] = [];
  let state = s;
  for (let guard = 0; guard < 50 && state.status === 'running' && remainingMs(state, now) <= 0; guard++) {
    const phaseEnd = state.phaseStartedAt + state.pausedMs + phaseDurationMs(state);
    const r = nextPhase(state, phaseEnd);
    state = r.state;
    events.push(r.event);
  }
  return { state, events };
}

/** Empieza la fase pendiente (tras un descanso o si no hay inicio automático). */
export function continuePhase(s: FocusState, now: number): FocusState {
  if (s.status !== 'awaiting') return s;
  return { ...s, status: 'running', phaseStartedAt: now, pausedAt: null, pausedMs: 0 };
}

/** Salta la fase actual (p. ej. terminar el descanso antes). */
export function skipPhase(s: FocusState, now: number): FocusState {
  if (s.status === 'finished') return s;
  if (s.phase === 'focus') {
    const credited = Math.floor(Math.min(elapsedMs(s, now), phaseDurationMs(s)) / 1000);
    const done = { ...s, focusSecDone: s.focusSecDone + credited - Math.round(phaseDurationMs(s) / 1000) };
    return nextPhase(done, now).state;
  }
  return continuePhase(nextPhase(s, now).state, now);
}

export interface FocusSummary {
  focusSec: number;
  plannedMin: number;
  completed: boolean;
  interrupted: boolean;
  startedAt: number;
  endedAt: number;
}

/** Cierra la sesión. Detenerla antes de tiempo se registra como interrupción, sin penalizar. */
export function stop(s: FocusState, now: number): FocusSummary {
  const completed = s.status === 'finished';
  return {
    focusSec: focusSeconds(s, now),
    plannedMin: s.config.focusMin * s.config.cycles,
    completed,
    interrupted: !completed && !(s.phase !== 'focus' && s.cycle >= s.config.cycles),
    startedAt: s.sessionStartedAt,
    endedAt: now,
  };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
