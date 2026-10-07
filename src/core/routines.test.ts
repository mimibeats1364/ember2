import { describe, expect, it } from 'vitest';
import { completedInLast, nextStepIndex, routineForNow, routineMinutes, runProgress } from './routines';
import type { Routine, RoutineRun } from './types';

const base = { createdAt: '', updatedAt: '', deletedAt: null };
const routine = (id: string, timeOfDay: Routine['timeOfDay'], order = 0): Routine => ({
  ...base,
  id,
  name: id,
  icon: '☀',
  color: 'amber',
  timeOfDay,
  order,
  archived: false,
  steps: [
    { id: 'a', title: 'Agua', durationMin: 1, habitId: null },
    { id: 'b', title: 'Estirar', durationMin: 5, habitId: null },
    { id: 'c', title: 'Plan', durationMin: null, habitId: null },
  ],
});
const run = (routineId: string, date: string, done: string[], completed = false): RoutineRun => ({ ...base, id: `${routineId}_${date}`, routineId, date, doneStepIds: done, completedAt: completed ? '2026-10-07T08:00:00Z' : null });

describe('rutinas', () => {
  it('duración y progreso (ignora pasos que ya no existen)', () => {
    const r = routine('m', 'morning');
    expect(routineMinutes(r)).toBe(6);
    expect(runProgress(r, run('m', '2026-10-07', ['a', 'zz']))).toEqual({ done: 1, total: 3, ratio: 1 / 3, complete: false });
    expect(runProgress(r, run('m', '2026-10-07', ['a', 'b', 'c'])).complete).toBe(true);
    expect(runProgress(r, null).done).toBe(0);
  });

  it('siguiente paso pendiente', () => {
    const r = routine('m', 'morning');
    expect(nextStepIndex(r, run('m', 'd', ['a']))).toBe(1);
    expect(nextStepIndex(r, run('m', 'd', ['a', 'c']))).toBe(1);
    expect(nextStepIndex(r, run('m', 'd', ['a', 'b', 'c']))).toBeNull();
  });

  it('rutina para ahora según la hora y sin repetir las completadas', () => {
    const morning = routine('m', 'morning');
    const night = routine('n', 'night');
    const runs = new Map<string, RoutineRun>();
    expect(routineForNow([morning, night], runs, 7)?.id).toBe('m');
    expect(routineForNow([morning, night], runs, 22)?.id).toBe('n');
    expect(routineForNow([morning, night], runs, 1)?.id).toBe('n'); // la noche sigue pasada la medianoche
    expect(routineForNow([morning, night], runs, 15)).toBeNull();
    runs.set('m', run('m', 'd', ['a', 'b', 'c'], true));
    expect(routineForNow([morning, night], runs, 7)).toBeNull();
  });

  it('constancia de los últimos 7 días', () => {
    const runs = [run('m', '2026-10-07', ['a'], true), run('m', '2026-10-01', ['a'], true), run('m', '2026-09-30', ['a'], true), run('m', '2026-10-06', ['a'], false)];
    expect(completedInLast(runs, 'm', '2026-10-07', 7)).toBe(2);
  });
});
