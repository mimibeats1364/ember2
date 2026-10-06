/**
 * Calendario unificado: eventos (con repetición por zona horaria), tareas con hora y hábitos
 * con hora preferida conviven en una única línea de tiempo.
 */
import {
  addDays,
  diffDays,
  endOfLocalDay,
  localDateTime,
  localTimeZone,
  parseTime,
  startOfLocalDay,
  zonedParts,
  zonedToDate,
} from './dates';
import { occurrencesBetween } from './recurrence';
import type { CalendarEvent, EventCategory, Habit, ID, LocalDate, Task } from './types';

export type TimelineKind = 'event' | 'task' | 'habit';

export interface TimelineItem {
  key: string;
  kind: TimelineKind;
  id: ID;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  category: EventCategory | 'task' | 'habit';
  color: string | null;
  /** Fecha de la ocurrencia (para eventos recurrentes). */
  occurrence: LocalDate;
  done: boolean;
  protected: boolean;
  priority?: number;
}

export interface EventOccurrence {
  event: CalendarEvent;
  occurrence: LocalDate;
  start: Date;
  end: Date;
}

/** Expande un evento (recurrente o no) a sus ocurrencias que se solapan con [from, to]. */
export function expandEvent(ev: CalendarEvent, from: LocalDate, to: LocalDate): EventOccurrence[] {
  if (ev.deletedAt) return [];
  if (ev.allDay) {
    const date = ev.date ?? from;
    const endDate = ev.endDate ?? date;
    const spanDays = diffDays(endDate, date);
    const dates = ev.recurrence
      ? occurrencesBetween(ev.recurrence, date, addDays(from, -spanDays), to)
      : [date];
    return dates
      .filter((d) => !ev.exdates.includes(d) && addDays(d, spanDays) >= from && d <= to)
      .map((d) => ({
        event: ev,
        occurrence: d,
        start: startOfLocalDay(d),
        end: endOfLocalDay(addDays(d, spanDays)),
      }));
  }
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  if (!ev.recurrence) {
    if (end <= startOfLocalDay(from) || start >= endOfLocalDay(to)) return [];
    return [{ event: ev, occurrence: zonedParts(start, ev.tz || localTimeZone()).date, start, end }];
  }
  // La hora de pared se conserva en la zona del evento aunque cambie el horario de verano.
  const tz = ev.tz || localTimeZone();
  const anchor = zonedParts(start, tz);
  const spanDays = Math.ceil(durationMs / 86_400_000);
  return occurrencesBetween(ev.recurrence, anchor.date, addDays(from, -spanDays - 1), addDays(to, 1))
    .filter((d) => !ev.exdates.includes(d))
    .map((d) => {
      const s = zonedToDate(d, anchor.minutes, tz);
      return { event: ev, occurrence: d, start: s, end: new Date(s.getTime() + durationMs) };
    })
    .filter((o) => o.end > startOfLocalDay(from) && o.start < endOfLocalDay(to));
}

export function taskInterval(t: Task): { start: Date; end: Date } | null {
  if (!t.date || !t.time) return null;
  const start = localDateTime(t.date, t.time);
  const end = new Date(start.getTime() + (t.durationMin ?? 30) * 60_000);
  return { start, end };
}

export interface TimelineInput {
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  habitDone: (habitId: ID, date: LocalDate) => boolean;
  habitScheduled: (habit: Habit, date: LocalDate) => boolean;
  projectColor?: (projectId: ID | null) => string | null;
}

/** Línea de tiempo de un rango de días, ordenada por inicio. */
export function buildTimeline(input: TimelineInput, from: LocalDate, to: LocalDate): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const ev of input.events) {
    for (const o of expandEvent(ev, from, to)) {
      items.push({
        key: `e:${ev.id}:${o.occurrence}`,
        kind: 'event',
        id: ev.id,
        title: ev.title,
        start: o.start,
        end: o.end,
        allDay: ev.allDay,
        category: ev.category,
        color: null,
        occurrence: o.occurrence,
        done: false,
        protected: ev.protected,
      });
    }
  }
  for (const t of input.tasks) {
    if (t.deletedAt || t.status === 'dropped' || !t.date || t.date < from || t.date > to) continue;
    const iv = taskInterval(t);
    if (!iv) continue;
    items.push({
      key: `t:${t.id}`,
      kind: 'task',
      id: t.id,
      title: t.title,
      start: iv.start,
      end: iv.end,
      allDay: false,
      category: 'task',
      color: input.projectColor?.(t.projectId) ?? null,
      occurrence: t.date,
      done: t.status === 'done',
      protected: false,
      priority: t.priority,
    });
  }
  for (const h of input.habits) {
    if (h.archived || h.deletedAt || !h.preferredTime) continue;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!input.habitScheduled(h, d)) continue;
      const start = localDateTime(d, h.preferredTime);
      items.push({
        key: `h:${h.id}:${d}`,
        kind: 'habit',
        id: h.id,
        title: h.name,
        start,
        end: new Date(start.getTime() + (h.durationMin ?? 15) * 60_000),
        allDay: false,
        category: 'habit',
        color: h.color,
        occurrence: d,
        done: input.habitDone(h.id, d),
        protected: false,
      });
    }
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
}

/** Conflictos: pares de elementos con hora que se solapan. */
export function findConflicts(items: TimelineItem[]): [TimelineItem, TimelineItem][] {
  const timed = items.filter((i) => !i.allDay && !i.done).sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: [TimelineItem, TimelineItem][] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j].start < timed[i].end; j++) {
      if (timed[i].kind === 'habit' && timed[j].kind === 'habit') continue;
      out.push([timed[i], timed[j]]);
    }
  }
  return out;
}

/** Distribución en columnas para elementos solapados (vista día/semana). */
export function layoutColumns<T extends { start: Date; end: Date }>(items: T[]): { item: T; col: number; cols: number }[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: { item: T; col: number; cols: number }[] = [];
  let cluster: { item: T; col: number; cols: number }[] = [];
  let clusterEnd = 0;
  const colEnds: number[] = [];
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) c.cols = cols;
    out.push(...cluster);
    cluster = [];
    colEnds.length = 0;
  };
  for (const item of sorted) {
    const s = item.start.getTime();
    if (cluster.length && s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) col = colEnds.length;
    colEnds[col] = item.end.getTime();
    cluster.push({ item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}

export const minutesFromMidnight = (d: Date, day: LocalDate) =>
  Math.round((d.getTime() - startOfLocalDay(day).getTime()) / 60_000);

export { parseTime };
