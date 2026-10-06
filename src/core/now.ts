/**
 * "¿Qué debería hacer ahora?": bloque actual, siguiente y una sugerencia cuando hay hueco.
 */
import type { TimelineItem } from './calendar';
import { compareTasks, isOpen } from './tasks';
import type { LocalDate, Task } from './types';

export interface NowNext {
  current: TimelineItem | null;
  next: TimelineItem | null;
  /** Tarea sugerida si ahora no hay nada planificado. */
  suggestion: Task | null;
  /** Hasta cuándo está libre el hueco actual. */
  freeUntil: Date | null;
}

const kindWeight = (i: TimelineItem) => (i.kind === 'habit' ? 1 : 0);

export function nowNext(timeline: TimelineItem[], now: Date, todayTasks: Task[], today: LocalDate): NowNext {
  const timed = timeline.filter((i) => !i.allDay && !i.done);
  const current =
    timed
      .filter((i) => i.start <= now && i.end > now)
      .sort((a, b) => kindWeight(a) - kindWeight(b) || b.start.getTime() - a.start.getTime())[0] ?? null;
  const next = timed.filter((i) => i.start > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
  let suggestion: Task | null = null;
  if (!current) {
    const candidates = todayTasks
      .filter((t) => isOpen(t) && !t.time && !t.parentId && ((t.date !== null && t.date <= today) || (t.deadline !== null && t.deadline <= today)))
      .sort(compareTasks);
    const minutesFree = next ? (next.start.getTime() - now.getTime()) / 60_000 : Infinity;
    suggestion = candidates.find((t) => (t.durationMin ?? 30) <= minutesFree) ?? candidates[0] ?? null;
  }
  return { current, next, suggestion, freeUntil: current ? null : (next?.start ?? null) };
}
