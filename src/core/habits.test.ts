import { describe, expect, it } from 'vitest';
import { completionStats, computeStreak, dayState, habitChains, habitsForDay, indexLogs } from './habits';
import { addDays } from './dates';
import type { Habit, HabitLog, HabitLogStatus } from './types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1', createdAt: '', updatedAt: '', deletedAt: null, name: 'Leer', icon: '📚', color: 'mint', description: '',
  frequency: { kind: 'daily' }, target: 1, unit: '', preferredTime: null, durationMin: null, reminder: false,
  difficulty: 1, areaId: null, goalId: null, startDate: '2026-09-01', graceDays: 0, stackAfter: null, archived: false,
  order: 0, ...over,
});

const logs = (entries: [string, HabitLogStatus, number?][]): Map<string, HabitLog> =>
  indexLogs(
    entries.map(([date, status, value]) => ({
      id: `h1_${date}`, createdAt: '', updatedAt: '', deletedAt: null, habitId: 'h1', date, status, value: value ?? 1, note: '',
    })),
  );

const run = (from: string, days: number, status: HabitLogStatus = 'done'): [string, HabitLogStatus][] =>
  Array.from({ length: days }, (_, i) => [addDays(from, i), status]);

describe('rachas', () => {
  it('cuenta días seguidos y hoy no rompe la racha', () => {
    const s = computeStreak(habit(), logs(run('2026-09-25', 11)), '2026-10-06', []);
    expect(s.current).toBe(11);
    expect(s.todayPending).toBe(true);
  });

  it('un fallo sin días de gracia reinicia, pero la mejor racha se conserva', () => {
    const l = logs([...run('2026-09-20', 10), ...run('2026-10-01', 5)]);
    const s = computeStreak(habit(), l, '2026-10-06', []);
    expect(s.current).toBe(5);
    expect(s.best).toBe(10);
  });

  it('los días de gracia perdonan fallos sin castigar', () => {
    const l = logs([...run('2026-09-20', 10), ...run('2026-10-01', 5)]);
    const s = computeStreak(habit({ graceDays: 1 }), l, '2026-10-06', []);
    expect(s.current).toBe(15);
  });

  it('saltar a propósito y las vacaciones son neutrales', () => {
    const l = logs([...run('2026-09-28', 3), ['2026-10-01', 'skipped'], ...run('2026-10-02', 2)]);
    expect(computeStreak(habit(), l, '2026-10-06', [{ start: '2026-10-04', end: '2026-10-05' }]).current).toBe(5);
  });

  it('el progreso parcial mantiene la racha viva', () => {
    const l = logs([...run('2026-10-01', 2), ['2026-10-03', 'partial', 3], ...run('2026-10-04', 2)]);
    const h = habit({ target: 8, startDate: '2026-10-01' });
    expect(computeStreak(h, l, '2026-10-06', []).current).toBe(4);
    expect(dayState(h, l.get('2026-10-03'), '2026-10-03', '2026-10-06', [])).toBe('partial');
  });

  it('solo cuentan los días programados', () => {
    const h = habit({ frequency: { kind: 'weekdays', days: [1, 3, 5] }, startDate: '2026-09-28' });
    const l = logs([['2026-09-28', 'done'], ['2026-09-30', 'done'], ['2026-10-02', 'done'], ['2026-10-05', 'done']]);
    expect(computeStreak(h, l, '2026-10-06', []).current).toBe(4);
  });

  it('hábitos flexibles cuentan semanas', () => {
    const h = habit({ frequency: { kind: 'times_per_week', times: 3 }, startDate: '2026-09-21' });
    const l = logs([
      ['2026-09-21', 'done'], ['2026-09-23', 'done'], ['2026-09-25', 'done'],
      ['2026-09-28', 'done'], ['2026-09-29', 'done'], ['2026-10-03', 'done'],
      ['2026-10-05', 'done'],
    ]);
    const s = computeStreak(h, l, '2026-10-06', []);
    expect(s.unit).toBe('weeks');
    expect(s.current).toBe(2);
  });
});

describe('estadísticas y vista diaria', () => {
  it('la tasa de cumplimiento excluye días saltados', () => {
    const l = logs([['2026-10-01', 'done'], ['2026-10-02', 'skipped'], ['2026-10-03', 'done']]);
    const st = completionStats(habit({ startDate: '2026-10-01' }), l, '2026-10-01', '2026-10-04', '2026-10-05', []);
    expect(st).toEqual({ scheduled: 3, done: 2, rate: 2 / 3 });
  });

  it('un hábito 3×/semana desaparece de hoy al cumplir la semana', () => {
    const h = habit({ frequency: { kind: 'times_per_week', times: 2 }, startDate: '2026-09-01' });
    const l = logs([['2026-10-05', 'done'], ['2026-10-06', 'done']]);
    expect(habitsForDay([h], new Map([['h1', l]]), '2026-10-07')).toHaveLength(0);
    expect(habitsForDay([h], new Map([['h1', l]]), '2026-10-06')).toHaveLength(1);
  });

  it('construye cadenas de hábitos apilados', () => {
    const a = habit({ id: 'a', name: 'Despertar' });
    const b = habit({ id: 'b', name: 'Agua', stackAfter: 'a' });
    const c = habit({ id: 'c', name: 'Leer', stackAfter: 'b' });
    expect(habitChains([c, a, b]).map((ch) => ch.map((h) => h.id))).toEqual([['a', 'b', 'c']]);
  });
});
