/**
 * Rutinas: secuencias de pasos que se repiten (mañana, arranque de trabajo, cierre del día…).
 * Lógica pura: progreso, duración, constancia y cuál toca ahora.
 */
import { addDays } from './dates';
import type { LocalDate, Routine, RoutineRun } from './types';

export function routineMinutes(r: Pick<Routine, 'steps'>): number {
  return r.steps.reduce((a, s) => a + (s.durationMin ?? 0), 0);
}

export interface RunProgress {
  done: number;
  total: number;
  ratio: number;
  complete: boolean;
}

/** Progreso de una ejecución. Ignora pasos que ya no existen en la rutina. */
export function runProgress(r: Pick<Routine, 'steps'>, run: Pick<RoutineRun, 'doneStepIds'> | null | undefined): RunProgress {
  const ids = new Set(r.steps.map((s) => s.id));
  const done = run ? run.doneStepIds.filter((id) => ids.has(id)).length : 0;
  const total = r.steps.length;
  return { done, total, ratio: total ? done / total : 0, complete: total > 0 && done >= total };
}

/** Primer paso pendiente (o null si está todo hecho). */
export function nextStepIndex(r: Pick<Routine, 'steps'>, run: Pick<RoutineRun, 'doneStepIds'> | null | undefined): number | null {
  const done = new Set(run?.doneStepIds ?? []);
  const i = r.steps.findIndex((s) => !done.has(s.id));
  return i === -1 ? null : i;
}

/** Días completados en los últimos `days` días (incluido hoy). Descriptivo, sin castigo. */
export function completedInLast(runs: RoutineRun[], routineId: string, today: LocalDate, days = 7): number {
  const from = addDays(today, -(days - 1));
  return runs.filter((x) => !x.deletedAt && x.routineId === routineId && x.completedAt && x.date >= from && x.date <= today).length;
}

const HOURS: Record<Routine['timeOfDay'], [number, number]> = {
  morning: [4, 12],
  work: [8, 18],
  study: [9, 22],
  night: [19, 28],
  custom: [0, 24],
};

/** La rutina que encaja con esta hora y aún no se ha completado hoy. */
export function routineForNow(routines: Routine[], runs: Map<string, RoutineRun>, hour: number): Routine | null {
  const h = hour < 4 ? hour + 24 : hour;
  const candidates = routines
    .filter((r) => !r.deletedAt && !r.archived && r.steps.length > 0 && r.timeOfDay !== 'custom')
    .filter((r) => {
      const [a, b] = HOURS[r.timeOfDay];
      return h >= a && h < b;
    })
    .filter((r) => !runProgress(r, runs.get(r.id)).complete)
    .sort((a, b) => a.order - b.order);
  return candidates[0] ?? null;
}
