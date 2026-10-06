/**
 * Puente entre el planificador puro (@core/scheduler) y los datos actuales.
 */
import { buildTimeline } from '@core/calendar';
import { indexLogs, isComplete, isScheduled } from '@core/habits';
import { blockers } from '@core/tasks';
import { focusByHour } from '@core/analytics';
import { busyFromTimeline, planDay, suggestSlots, type Interval, type PlanStrategy, type SlotSuggestion } from '@core/scheduler';
import type { ID, LocalDate } from '@core/types';
import { getPrefs, useData } from './store';

export function busyForDate(date: LocalDate, excludeTaskId?: ID): Interval[] {
  const { c } = useData.getState();
  const habits = Object.values(c.habits).filter((h) => !h.deletedAt && !h.archived);
  const logs = Object.values(c.habitLogs);
  const items = buildTimeline(
    {
      events: Object.values(c.events),
      tasks: Object.values(c.tasks).filter((t) => t.id !== excludeTaskId && t.status !== 'done'),
      habits,
      habitDone: (id, d) => {
        const h = c.habits[id];
        return !!h && isComplete(h, indexLogs(logs.filter((l) => l.habitId === id)).get(d));
      },
      habitScheduled: isScheduled,
    },
    date,
    date,
  );
  return busyFromTimeline(items);
}

/** Horas con más foco registradas (para la preferencia "aprender de mis datos"). */
function learnedPeakHours(): number[] | undefined {
  const prefs = getPrefs();
  if (prefs.focusPeak !== 'auto') return undefined;
  const sessions = Object.values(useData.getState().c.focusSessions).filter((s) => !s.deletedAt);
  if (sessions.length < 8) return undefined;
  const hours = focusByHour(sessions);
  return hours
    .map((m, h) => ({ m, h }))
    .sort((a, b) => b.m - a.m)
    .slice(0, 4)
    .map((x) => x.h);
}

export function findSlotsForTask(taskId: ID, now = new Date()): SlotSuggestion[] {
  const { c } = useData.getState();
  const task = c.tasks[taskId];
  if (!task) return [];
  const prefs = getPrefs();
  return suggestSlots({
    durationMin: task.durationMin ?? 30,
    now,
    until: task.deadline,
    busyFor: (d) => busyForDate(d, taskId),
    prefs: { sleep: prefs.sleep, bufferMin: prefs.bufferMin, focusPeak: prefs.focusPeak === 'auto' ? 'morning' : prefs.focusPeak },
    peakHours: learnedPeakHours(),
  });
}

export function proposeDay(date: LocalDate, strategy: PlanStrategy, now = new Date()) {
  const { c } = useData.getState();
  const prefs = getPrefs();
  const tasks = Object.values(c.tasks).filter((t) => !t.deletedAt);
  return planDay({
    date,
    now,
    tasks,
    busy: busyForDate(date),
    prefs: { sleep: prefs.sleep, bufferMin: prefs.bufferMin, focusPeak: prefs.focusPeak === 'auto' ? 'morning' : prefs.focusPeak },
    strategy,
    isBlocked: (t) => blockers(t, c.tasks).length > 0,
  });
}
