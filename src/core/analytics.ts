/**
 * Estadísticas descriptivas. Nunca puntuamos el valor de una persona: solo describimos
 * cómo usó su tiempo. Las correlaciones exigen muestra mínima y se expresan como sugerencias.
 */
import { addDays, eachDay, localDateOf, weekdayOf, parseTime } from './dates';
import type { DayLog, FocusSession, HabitLog, ID, LocalDate, Task, TimeEntry, Weekday, Checkin } from './types';

export interface FocusStats {
  sessions: number;
  totalSec: number;
  avgSec: number;
  longestSec: number;
  interrupted: number;
  completed: number;
  deepSessions: number;
}

export function sessionsInRange(sessions: FocusSession[], from: LocalDate, to: LocalDate): FocusSession[] {
  return sessions.filter((s) => {
    if (s.deletedAt) return false;
    const d = localDateOf(s.startedAt);
    return d >= from && d <= to;
  });
}

export function focusStats(sessions: FocusSession[]): FocusStats {
  const totalSec = sessions.reduce((a, s) => a + s.focusSec, 0);
  return {
    sessions: sessions.length,
    totalSec,
    avgSec: sessions.length ? Math.round(totalSec / sessions.length) : 0,
    longestSec: sessions.reduce((a, s) => Math.max(a, s.focusSec), 0),
    interrupted: sessions.filter((s) => s.interrupted).length,
    completed: sessions.filter((s) => s.completed).length,
    deepSessions: sessions.filter((s) => s.focusSec >= 50 * 60).length,
  };
}

export type HeatMetric = 'focus' | 'tasks' | 'habits';

export interface DayValue {
  date: LocalDate;
  value: number;
}

export function dailySeries(
  metric: HeatMetric,
  from: LocalDate,
  to: LocalDate,
  data: { sessions: FocusSession[]; tasks: Task[]; habitLogs: HabitLog[] },
): DayValue[] {
  const map = new Map<LocalDate, number>();
  if (metric === 'focus') {
    for (const s of data.sessions) if (!s.deletedAt) {
      const d = localDateOf(s.startedAt);
      map.set(d, (map.get(d) ?? 0) + s.focusSec / 60);
    }
  } else if (metric === 'tasks') {
    for (const t of data.tasks) if (!t.deletedAt && t.status === 'done' && t.completedAt) {
      const d = localDateOf(t.completedAt);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
  } else {
    for (const l of data.habitLogs) if (!l.deletedAt && l.status === 'done') map.set(l.date, (map.get(l.date) ?? 0) + 1);
  }
  return eachDay(from, to).map((date) => ({ date, value: Math.round(map.get(date) ?? 0) }));
}

/** Nivel 0-4 relativo al propio máximo (no a un estándar externo). */
export function heatLevels(series: DayValue[]): number[] {
  const max = Math.max(0, ...series.map((s) => s.value));
  if (max === 0) return series.map(() => 0);
  return series.map((s) => (s.value === 0 ? 0 : Math.min(4, Math.ceil((s.value / max) * 4))));
}

/** Minutos de foco por hora del día (las sesiones que cruzan horas se reparten). */
export function focusByHour(sessions: FocusSession[]): number[] {
  const hours = new Array(24).fill(0);
  for (const s of sessions) {
    if (s.deletedAt || s.focusSec <= 0) continue;
    let t = new Date(s.startedAt).getTime();
    let remaining = s.focusSec * 1000;
    while (remaining > 0) {
      const d = new Date(t);
      const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const chunk = Math.min(remaining, nextHour - t);
      hours[d.getHours()] += chunk / 60_000;
      remaining -= chunk;
      t += chunk;
    }
  }
  return hours.map((m) => Math.round(m));
}

export function focusByWeekday(sessions: FocusSession[]): number[] {
  const days = new Array(7).fill(0);
  for (const s of sessions) if (!s.deletedAt) days[weekdayOf(localDateOf(s.startedAt))] += s.focusSec / 60;
  return days.map((m) => Math.round(m));
}

/** Mejor ventana contigua de `width` horas según minutos de foco. */
export function bestWindow(hours: number[], width = 3): { start: number; end: number; minutes: number } | null {
  let best: { start: number; end: number; minutes: number } | null = null;
  for (let h = 0; h + width <= 24; h++) {
    const minutes = hours.slice(h, h + width).reduce((a, b) => a + b, 0);
    if (!best || minutes > best.minutes) best = { start: h, end: h + width, minutes };
  }
  return best && best.minutes > 0 ? best : null;
}

export function minutesByProject(sessions: FocusSession[], entries: TimeEntry[], tasksById: Record<ID, Task>): Map<ID | null, number> {
  const out = new Map<ID | null, number>();
  const add = (pid: ID | null, min: number) => out.set(pid, (out.get(pid) ?? 0) + min);
  for (const s of sessions) if (!s.deletedAt) add(s.projectId ?? (s.taskId ? tasksById[s.taskId]?.projectId ?? null : null), s.focusSec / 60);
  for (const e of entries) {
    if (e.deletedAt || !e.end) continue;
    const pid = e.projectId ?? (e.taskId ? tasksById[e.taskId]?.projectId ?? null : null);
    add(pid, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000);
  }
  for (const [k, v] of out) out.set(k, Math.round(v));
  return out;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function sleepMinutes(log: DayLog): number | null {
  if (!log.sleepBed || !log.sleepWake) return null;
  const bed = parseTime(log.sleepBed);
  const wake = parseTime(log.sleepWake);
  return (wake - bed + 1440) % 1440 || null;
}

export type Insight =
  | { kind: 'best_hours'; start: number; end: number; minutes: number; sessions: number }
  | { kind: 'best_weekday'; weekday: Weekday; minutes: number }
  | { kind: 'sleep_focus'; threshold: number; withMore: number; withLess: number; days: number }
  | { kind: 'energy_hours'; start: number; end: number; avg: number; samples: number }
  | { kind: 'estimate_bias'; ratio: number; samples: number }
  | { kind: 'interruptions'; rate: number; sessions: number };

export const MIN_SAMPLES = { sessions: 8, days: 10, checkins: 12, estimates: 5 };

/** Patrones observados. Si no hay datos suficientes, devuelve menos (o ninguno). */
export function computeInsights(input: {
  sessions: FocusSession[];
  dayLogs: DayLog[];
  checkins: Checkin[];
  doneTasksWithEstimate: { estimateMin: number; actualMin: number }[];
}): Insight[] {
  const out: Insight[] = [];
  const sessions = input.sessions.filter((s) => !s.deletedAt && s.focusSec > 0);
  if (sessions.length >= MIN_SAMPLES.sessions) {
    const w = bestWindow(focusByHour(sessions), 3);
    if (w) out.push({ kind: 'best_hours', start: w.start, end: w.end, minutes: w.minutes, sessions: sessions.length });
    const byDay = focusByWeekday(sessions);
    const max = Math.max(...byDay);
    if (max > 0) out.push({ kind: 'best_weekday', weekday: byDay.indexOf(max) as Weekday, minutes: max });
    const interrupted = sessions.filter((s) => s.interrupted).length;
    out.push({ kind: 'interruptions', rate: interrupted / sessions.length, sessions: sessions.length });
  }
  // Sueño ↔ foco: compara días con más/menos de 7 h de sueño.
  const focusPerDay = new Map<LocalDate, number>();
  for (const s of sessions) {
    const d = localDateOf(s.startedAt);
    focusPerDay.set(d, (focusPerDay.get(d) ?? 0) + s.focusSec / 60);
  }
  const sleepDays = input.dayLogs.filter((l) => !l.deletedAt && sleepMinutes(l) !== null);
  if (sleepDays.length >= MIN_SAMPLES.days) {
    const more: number[] = [];
    const less: number[] = [];
    for (const l of sleepDays) (sleepMinutes(l)! >= 420 ? more : less).push(focusPerDay.get(l.date) ?? 0);
    if (more.length >= 4 && less.length >= 4) {
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      out.push({ kind: 'sleep_focus', threshold: 7, withMore: Math.round(avg(more)), withLess: Math.round(avg(less)), days: sleepDays.length });
    }
  }
  const checks = input.checkins.filter((c) => !c.deletedAt && c.energy !== null);
  if (checks.length >= MIN_SAMPLES.checkins) {
    const sum = new Array(24).fill(0);
    const cnt = new Array(24).fill(0);
    for (const c of checks) {
      const h = new Date(c.at).getHours();
      sum[h] += c.energy!;
      cnt[h]++;
    }
    let best: { start: number; avg: number; samples: number } | null = null;
    for (let h = 0; h < 22; h++) {
      const n = cnt[h] + cnt[h + 1] + cnt[h + 2];
      if (n < 3) continue;
      const avg = (sum[h] + sum[h + 1] + sum[h + 2]) / n;
      if (!best || avg > best.avg) best = { start: h, avg, samples: n };
    }
    if (best) out.push({ kind: 'energy_hours', start: best.start, end: best.start + 3, avg: Math.round(best.avg * 10) / 10, samples: best.samples });
  }
  const est = input.doneTasksWithEstimate.filter((e) => e.estimateMin > 0 && e.actualMin > 0);
  if (est.length >= MIN_SAMPLES.estimates) {
    const ratio = est.reduce((a, e) => a + e.actualMin / e.estimateMin, 0) / est.length;
    if (Math.abs(ratio - 1) >= 0.15) out.push({ kind: 'estimate_bias', ratio: Math.round(ratio * 100) / 100, samples: est.length });
  }
  return out;
}

export interface PeriodSummary {
  from: LocalDate;
  to: LocalDate;
  tasksCompleted: number;
  focus: FocusStats;
  habitDone: number;
  habitScheduled: number;
  bestDay: { date: LocalDate; minutes: number } | null;
  topProjects: { projectId: ID | null; minutes: number }[];
  tasksCreated: number;
}

export function periodSummary(
  from: LocalDate,
  to: LocalDate,
  data: { tasks: Task[]; sessions: FocusSession[]; entries: TimeEntry[]; habitLogs: HabitLog[]; habitScheduled: number },
): PeriodSummary {
  const sessions = sessionsInRange(data.sessions, from, to);
  const tasksById = Object.fromEntries(data.tasks.map((t) => [t.id, t]));
  const completed = data.tasks.filter((t) => !t.deletedAt && t.status === 'done' && t.completedAt && localDateOf(t.completedAt) >= from && localDateOf(t.completedAt) <= to);
  const created = data.tasks.filter((t) => !t.deletedAt && localDateOf(t.createdAt) >= from && localDateOf(t.createdAt) <= to);
  const habitDone = data.habitLogs.filter((l) => !l.deletedAt && l.status === 'done' && l.date >= from && l.date <= to).length;
  const series = dailySeries('focus', from, to, { sessions, tasks: [], habitLogs: [] });
  const best = series.reduce<DayValue | null>((a, d) => (d.value > (a?.value ?? 0) ? d : a), null);
  const entries = data.entries.filter((e) => !e.deletedAt && localDateOf(e.start) >= from && localDateOf(e.start) <= to);
  const byProject = [...minutesByProject(sessions, entries, tasksById).entries()]
    .map(([projectId, minutes]) => ({ projectId, minutes }))
    .filter((p) => p.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);
  return {
    from,
    to,
    tasksCompleted: completed.length,
    focus: focusStats(sessions),
    habitDone,
    habitScheduled: data.habitScheduled,
    bestDay: best ? { date: best.date, minutes: best.value } : null,
    topProjects: byProject,
    tasksCreated: created.length,
  };
}

/** Semanas con más foco del año (para "Mi año"). */
export function bestWeeks(sessions: FocusSession[], year: number, count = 3): { weekStart: LocalDate; minutes: number }[] {
  const weeks = new Map<LocalDate, number>();
  for (const s of sessions) {
    if (s.deletedAt) continue;
    const d = localDateOf(s.startedAt);
    if (Number(d.slice(0, 4)) !== year) continue;
    const wd = (weekdayOf(d) + 6) % 7;
    const ws = addDays(d, -wd);
    weeks.set(ws, (weeks.get(ws) ?? 0) + s.focusSec / 60);
  }
  return [...weeks.entries()]
    .map(([weekStart, m]) => ({ weekStart, minutes: Math.round(m) }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, count);
}
