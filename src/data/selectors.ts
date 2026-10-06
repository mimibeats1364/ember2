/**
 * Hooks derivados (memoizados) sobre el store de datos.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { buildTimeline, type TimelineItem } from '@core/calendar';
import { addDays, startOfWeek, toLocalDate } from '@core/dates';
import { computeStreak, indexLogs, isComplete, isScheduled, type StreakInfo } from '@core/habits';
import type { Habit, HabitLog, ID, LocalDate } from '@core/types';
import { usePrefs, useList, useCollection } from './store';
import { colorValue } from '@/ui/theme/palette';

// ── Reloj ──────────────────────────────────────────────────────────────────────────────

export const useClock = create<{ now: number }>(() => ({ now: Date.now() }));
if (typeof window !== 'undefined') {
  const tickClock = () => useClock.setState({ now: Date.now() });
  setInterval(tickClock, 15_000);
  document.addEventListener('visibilitychange', tickClock);
}

/** Fecha local de hoy (cambia sola a medianoche). */
export function useToday(): LocalDate {
  return useClock((s) => toLocalDate(new Date(s.now)));
}

export function useNow(): Date {
  const now = useClock((s) => s.now);
  return useMemo(() => new Date(now), [now]);
}

// ── Hábitos ────────────────────────────────────────────────────────────────────────────

export function useHabitLogIndex(): Map<ID, Map<LocalDate, HabitLog>> {
  const logs = useList('habitLogs');
  return useMemo(() => {
    const byHabit = new Map<ID, HabitLog[]>();
    for (const l of logs) {
      const list = byHabit.get(l.habitId) ?? [];
      list.push(l);
      byHabit.set(l.habitId, list);
    }
    return new Map([...byHabit.entries()].map(([k, v]) => [k, indexLogs(v)]));
  }, [logs]);
}

export function useActiveHabits(): Habit[] {
  const habits = useList('habits');
  return useMemo(() => habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order), [habits]);
}

export function useStreaks(): Map<ID, StreakInfo> {
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const today = useToday();
  const prefs = usePrefs();
  return useMemo(() => {
    const out = new Map<ID, StreakInfo>();
    for (const h of habits) out.set(h.id, computeStreak(h, index.get(h.id) ?? new Map(), today, prefs.vacations));
    return out;
  }, [habits, index, today, prefs.vacations]);
}

// ── Línea de tiempo ────────────────────────────────────────────────────────────────────

export function useTimeline(from: LocalDate, to: LocalDate): TimelineItem[] {
  const events = useList('events');
  const tasks = useList('tasks');
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const projects = useCollection('projects');
  return useMemo(
    () =>
      buildTimeline(
        {
          events,
          tasks,
          habits,
          habitDone: (id, d) => {
            const h = habits.find((x) => x.id === id);
            return !!h && isComplete(h, index.get(id)?.get(d));
          },
          habitScheduled: isScheduled,
          projectColor: (pid) => (pid && projects[pid] ? colorValue(projects[pid].color) : null),
        },
        from,
        to,
      ),
    [events, tasks, habits, index, projects, from, to],
  );
}

export function useWeekDays(anchor: LocalDate, weekStartsOn: 0 | 1): LocalDate[] {
  return useMemo(() => {
    const start = startOfWeek(anchor, weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, weekStartsOn]);
}
