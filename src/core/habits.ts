/**
 * Hábitos: programación, estado diario y rachas.
 *
 * Filosofía "no castigar":
 * - `skipped` (saltado a propósito) y los días de vacaciones son neutrales.
 * - Un progreso parcial mantiene la racha viva aunque no la incremente.
 * - Cada semana hay `graceDays` fallos perdonados.
 * - Hoy nunca rompe la racha: todavía estás a tiempo.
 */
import { diffDays, eachDay, isoWeekKey, startOfWeek, addDays, weekdayOf, maxDate } from './dates';
import type { Habit, HabitLog, LocalDate, Preferences } from './types';

export type Vacation = Preferences['vacations'][number];
export type HabitDayState =
  | 'done'
  | 'partial'
  | 'skipped'
  | 'missed'
  | 'pending'
  | 'vacation'
  | 'not_scheduled'
  | 'future';

export const habitLogId = (habitId: string, date: LocalDate) => `${habitId}_${date}`;

export function isOnVacation(date: LocalDate, vacations: Vacation[]): boolean {
  return vacations.some((v) => date >= v.start && (v.end === null || date <= v.end));
}

export function isScheduled(habit: Habit, date: LocalDate): boolean {
  if (date < habit.startDate) return false;
  const f = habit.frequency;
  switch (f.kind) {
    case 'daily':
    case 'times_per_week':
      return true;
    case 'weekdays':
      return f.days.includes(weekdayOf(date));
    case 'interval':
      return diffDays(date, habit.startDate) % Math.max(1, f.every) === 0;
  }
}

export function isComplete(habit: Habit, log: HabitLog | undefined): boolean {
  if (!log || log.deletedAt) return false;
  if (log.status === 'done') return true;
  return log.status === 'partial' && log.value >= habit.target;
}

export function dayState(
  habit: Habit,
  log: HabitLog | undefined,
  date: LocalDate,
  today: LocalDate,
  vacations: Vacation[],
): HabitDayState {
  if (date > today) return 'future';
  if (isComplete(habit, log)) return 'done';
  if (log && !log.deletedAt && log.status === 'skipped') return 'skipped';
  if (!isScheduled(habit, date)) return 'not_scheduled';
  if (isOnVacation(date, vacations)) return 'vacation';
  if (log && !log.deletedAt && log.status === 'partial' && log.value > 0) return 'partial';
  return date === today ? 'pending' : 'missed';
}

export interface StreakInfo {
  current: number;
  best: number;
  unit: 'days' | 'weeks';
  /** Fallos perdonados por días de gracia en la semana actual. */
  graceUsedThisWeek: number;
  /** Hoy está pendiente y la racha depende de él (para mensajes amables, no alarmas). */
  todayPending: boolean;
}

type LogIndex = Map<LocalDate, HabitLog>;

export function indexLogs(logs: HabitLog[]): LogIndex {
  const map: LogIndex = new Map();
  for (const l of logs) if (!l.deletedAt) map.set(l.date, l);
  return map;
}

export function computeStreak(
  habit: Habit,
  logs: LogIndex,
  today: LocalDate,
  vacations: Vacation[],
): StreakInfo {
  if (habit.frequency.kind === 'times_per_week') return weeklyStreak(habit, logs, today, vacations);
  let run = 0;
  let best = 0;
  const graceUsed = new Map<string, number>();
  let todayPending = false;
  if (habit.startDate > today) return { current: 0, best: 0, unit: 'days', graceUsedThisWeek: 0, todayPending: false };
  for (const date of eachDay(habit.startDate, today)) {
    const state = dayState(habit, logs.get(date), date, today, vacations);
    switch (state) {
      case 'done':
        run++;
        best = Math.max(best, run);
        break;
      case 'pending':
        todayPending = run > 0;
        break;
      case 'missed': {
        const week = isoWeekKey(date);
        const used = graceUsed.get(week) ?? 0;
        if (used < habit.graceDays) graceUsed.set(week, used + 1);
        else run = 0;
        break;
      }
      default:
        break; // skipped, partial, vacation, not_scheduled: neutrales
    }
  }
  return {
    current: run,
    best,
    unit: 'days',
    graceUsedThisWeek: graceUsed.get(isoWeekKey(today)) ?? 0,
    todayPending,
  };
}

/** Racha en semanas para hábitos flexibles ("3 veces por semana"). */
function weeklyStreak(habit: Habit, logs: LogIndex, today: LocalDate, vacations: Vacation[]): StreakInfo {
  const times = habit.frequency.kind === 'times_per_week' ? habit.frequency.times : 1;
  let run = 0;
  let best = 0;
  let todayPending = false;
  const firstWeek = startOfWeek(habit.startDate, 1);
  const currentWeek = startOfWeek(today, 1);
  for (let week = firstWeek; week <= currentWeek; week = addDays(week, 7)) {
    let done = 0;
    let excused = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i);
      if (date < habit.startDate) {
        excused++;
        continue;
      }
      const log = logs.get(date);
      if (isComplete(habit, log)) done++;
      else if ((log && log.status === 'skipped') || isOnVacation(date, vacations)) excused++;
    }
    const required = Math.max(0, Math.min(times, Math.ceil((times * (7 - excused)) / 7)));
    if (week === currentWeek) {
      if (done >= required && required > 0) {
        run++;
        best = Math.max(best, run);
      } else todayPending = run > 0;
    } else if (required === 0) {
      continue;
    } else if (done >= required) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return { current: run, best, unit: 'weeks', graceUsedThisWeek: 0, todayPending };
}

export interface CompletionStats {
  scheduled: number;
  done: number;
  rate: number; // 0..1
}

export function completionStats(
  habit: Habit,
  logs: LogIndex,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  vacations: Vacation[],
): CompletionStats {
  const start = maxDate(from, habit.startDate);
  if (start > to) return { scheduled: 0, done: 0, rate: 0 };
  if (habit.frequency.kind === 'times_per_week') {
    const days = eachDay(start, to < today ? to : today);
    const done = days.filter((d) => isComplete(habit, logs.get(d))).length;
    const scheduled = Math.max(1, Math.round((habit.frequency.times * days.length) / 7));
    return { scheduled, done, rate: Math.min(1, done / scheduled) };
  }
  let scheduled = 0;
  let done = 0;
  for (const date of eachDay(start, to < today ? to : today)) {
    const state = dayState(habit, logs.get(date), date, today, vacations);
    if (state === 'done') {
      scheduled++;
      done++;
    } else if (state === 'missed' || state === 'partial') scheduled++;
  }
  return { scheduled, done, rate: scheduled === 0 ? 0 : done / scheduled };
}

/** Hábitos que tiene sentido mostrar hoy. */
export function habitsForDay(habits: Habit[], logsByHabit: Map<string, LogIndex>, date: LocalDate): Habit[] {
  return habits.filter((h) => {
    if (h.archived || h.deletedAt || date < h.startDate) return false;
    if (h.frequency.kind !== 'times_per_week') return isScheduled(h, date);
    const logs = logsByHabit.get(h.id) ?? new Map();
    if (isComplete(h, logs.get(date))) return true;
    const week = startOfWeek(date, 1);
    let done = 0;
    for (let i = 0; i < 7; i++) if (isComplete(h, logs.get(addDays(week, i)))) done++;
    return done < h.frequency.times;
  });
}

/** Ordena una cadena de hábitos apilados (A → B → C) a partir de `stackAfter`. */
export function habitChains(habits: Habit[]): Habit[][] {
  const active = habits.filter((h) => !h.archived && !h.deletedAt);
  const byId = new Map(active.map((h) => [h.id, h]));
  const children = new Map<string, Habit[]>();
  for (const h of active) {
    if (h.stackAfter && byId.has(h.stackAfter)) {
      const list = children.get(h.stackAfter) ?? [];
      list.push(h);
      children.set(h.stackAfter, list);
    }
  }
  const chains: Habit[][] = [];
  for (const root of active) {
    if (root.stackAfter && byId.has(root.stackAfter)) continue;
    if (!children.has(root.id)) continue;
    const chain: Habit[] = [root];
    const seen = new Set([root.id]);
    let cursor = root;
    for (;;) {
      const next = (children.get(cursor.id) ?? []).sort((a, b) => a.order - b.order)[0];
      if (!next || seen.has(next.id)) break;
      chain.push(next);
      seen.add(next.id);
      cursor = next;
    }
    chains.push(chain);
  }
  return chains;
}
