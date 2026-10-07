/**
 * Orbit · habilidades. Funciones puras: reciben datos y devuelven propuestas explicables.
 * Nada aquí escribe en la base de datos ni depende de la interfaz.
 */
import type { PeriodSummary } from '../analytics';
import { addDays, diffDays, localDateTime, minutesOfDay, parseTime, toLocalDate } from '../dates';
import { normalizeText } from '../nlp';
import { suggestPhases } from '../phases';
import { awakeWindow, freeSlots, mergeIntervals, planDay, urgencyScore, type DayPlan, type Interval, type SchedulePrefs } from '../scheduler';
import { isOpen } from '../tasks';
import type { ID, LocalDate, Project, Task } from '../types';
import type { PlanConstraints } from './intent';
import type { ProposedChange } from './types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dur = (t: Task) => t.durationMin ?? 30;

// ── Buscar por nombre ──────────────────────────────────────────────────────────────────

const STOP = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'mi', 'mis', 'un', 'una', 'the', 'my', 'a', 'of', 'en', 'y', 'and', 'con', 'para']);
const tokens = (s: string) =>
  normalizeText(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/** Puntuación 0..1 de cuánto se parece una consulta a un nombre. */
export function nameScore(query: string, name: string): number {
  const q = normalizeText(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const n = normalizeText(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!q || !n) return 0;
  if (q === n) return 1;
  const qt = tokens(query);
  const nt = tokens(name);
  if (qt.length === 0 || nt.length === 0) return 0;
  const hits = qt.filter((w) => nt.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))))).length;
  if (hits === 0) return n.includes(q) ? 0.6 : 0;
  return Math.min(0.95, (hits / qt.length) * 0.75 + (hits / nt.length) * 0.2);
}

export function bestMatch<T>(query: string, items: T[], name: (x: T) => string, min = 0.45): T | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = nameScore(query, name(item));
    if (score >= min && (!best || score > best.score)) best = { item, score };
  }
  return best?.item ?? null;
}

// ── Planificar el día con restricciones ────────────────────────────────────────────────

export interface PlanInput {
  date: LocalDate;
  now: Date;
  tasks: Task[];
  /** Ocupado ese día (eventos, hábitos con hora, tareas con hora). */
  busy: Interval[];
  prefs: SchedulePrefs;
  constraints: PlanConstraints;
  projectNames?: Record<ID, string>;
  isBlocked?: (t: Task) => boolean;
}

export interface PlanProposal extends DayPlan {
  changes: ProposedChange[];
  /** Palabras de "prioriza…" que encontraron alguna tarea. */
  matchedFocus: string[];
  missedFocus: string[];
  budgetMin: number | null;
  freeMinutes: number;
}

function matchesFocus(t: Task, focus: string[], projectNames: Record<ID, string>): boolean {
  if (focus.length === 0) return false;
  const hay = `${t.title} ${t.projectId ? (projectNames[t.projectId] ?? '') : ''}`;
  return focus.some((f) => nameScore(f, hay) >= 0.45);
}

export function planWithConstraints(input: PlanInput): PlanProposal {
  const { date, constraints: c, now } = input;
  const prefs: SchedulePrefs = { ...input.prefs, bufferMin: c.breakMin ?? input.prefs.bufferMin };
  const isToday = toLocalDate(now) === date;
  const win = awakeWindow(date, prefs);
  const busy = [...input.busy];
  // Tus límites son exactos: se descuenta el margen que el planificador añade a lo ocupado.
  const margin = prefs.bufferMin * MIN;
  if (c.start) busy.push({ start: win.start - DAY, end: localDateTime(date, c.start).getTime() - margin });
  if (c.end) {
    const endMs = localDateTime(date, c.end).getTime();
    // "hasta las 2" de madrugada cae al día siguiente.
    busy.push({ start: (endMs < win.start ? endMs + DAY : endMs) + margin, end: win.end + DAY });
  }
  const names = input.projectNames ?? {};
  const matched = new Set<string>();
  const tasks = input.tasks.map((t) => {
    if (!isOpen(t) || t.time || t.parentId || !matchesFocus(t, c.focus, names)) return t;
    for (const f of c.focus) if (nameScore(f, `${t.title} ${t.projectId ? (names[t.projectId] ?? '') : ''}`) >= 0.45) matched.add(f);
    // Lo que pides priorizar entra en el día aunque no tuviera fecha.
    return { ...t, priority: 1 as const, date: t.date && t.date <= date ? t.date : date };
  });
  const freeMinutes = Math.round(freeSlots(date, busy, prefs, isToday ? now.getTime() : undefined).reduce((a, s) => a + (s.end - s.start) / MIN, 0));
  const budgetMin = c.budgetMin ?? (c.light ? Math.max(30, Math.round(freeMinutes * 0.5)) : null);
  const plan = planDay({ date, now, tasks, busy, prefs, strategy: c.strategy ?? 'balanced', isBlocked: input.isBlocked, maxMinutes: budgetMin });
  const changes: ProposedChange[] = plan.blocks.map((b) => ({
    kind: 'schedule_task',
    taskId: b.taskId,
    title: b.title,
    date: toLocalDate(new Date(b.start)),
    time: hhmm(b.start),
    durationMin: Math.round((b.end - b.start) / MIN),
  }));
  // Las tareas "sin colocar" vuelven con sus datos originales (sin la prioridad temporal).
  const original = new Map(input.tasks.map((t) => [t.id, t]));
  return {
    ...plan,
    unplaced: plan.unplaced.map((t) => original.get(t.id) ?? t),
    changes,
    matchedFocus: c.focus.filter((f) => matched.has(f)),
    missedFocus: c.focus.filter((f) => !matched.has(f)),
    budgetMin,
    freeMinutes,
  };
}

// ── Aligerar el día ────────────────────────────────────────────────────────────────────

export interface LightenInput {
  date: LocalDate;
  now: Date;
  tasks: Task[];
  /** Ocupado SIN contar tareas (eventos y hábitos): las tareas son la carga. */
  fixedBusyFor: (d: LocalDate) => Interval[];
  prefs: SchedulePrefs;
  horizonDays?: number;
}

export interface LightenProposal {
  date: LocalDate;
  loadMin: number;
  capacityMin: number;
  fits: boolean;
  /** Minutos que siguen sobrando después de mover lo movible. */
  stillOverMin: number;
  changes: ProposedChange[];
}

const USABLE = 0.85;

function capacity(date: LocalDate, input: LightenInput): number {
  const isToday = toLocalDate(input.now) === date;
  const free = freeSlots(date, input.fixedBusyFor(date), input.prefs, isToday ? input.now.getTime() : undefined);
  return Math.floor(free.reduce((a, s) => a + (s.end - s.start) / MIN, 0) * USABLE);
}

/**
 * Propone pasar a otros días lo menos urgente hasta que lo de hoy quepa en el tiempo libre
 * real. Nunca mueve prioridad 1, lo que vence ese día o lo que ya está en curso.
 */
export function lightenDay(input: LightenInput): LightenProposal {
  const { date } = input;
  const isToday = toLocalDate(input.now) === date;
  const open = input.tasks.filter((t) => isOpen(t) && !t.parentId);
  const dayTasks = open.filter((t) => t.date === date || (isToday && t.date !== null && t.date < date));
  const loadMin = dayTasks.reduce((a, t) => a + dur(t), 0);
  const capacityMin = capacity(date, input);
  if (loadMin <= capacityMin) return { date, loadMin, capacityMin, fits: true, stillOverMin: 0, changes: [] };
  const horizon = input.horizonDays ?? 7;
  const loads = new Map<LocalDate, number>();
  const caps = new Map<LocalDate, number>();
  const loadOf = (d: LocalDate) => {
    if (!loads.has(d)) loads.set(d, open.filter((t) => t.date === d).reduce((a, t) => a + dur(t), 0));
    return loads.get(d)!;
  };
  const capOf = (d: LocalDate) => {
    if (!caps.has(d)) caps.set(d, capacity(d, input));
    return caps.get(d)!;
  };
  const movable = dayTasks
    .filter((t) => t.priority !== 1 && t.status !== 'in_progress' && !(t.deadline && t.deadline <= date))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        Number(!!a.deadline) - Number(!!b.deadline) ||
        (b.deadline ?? '').localeCompare(a.deadline ?? '') ||
        dur(b) - dur(a),
    );
  let over = loadMin - capacityMin;
  const changes: ProposedChange[] = [];
  for (const t of movable) {
    if (over <= 0) break;
    for (let i = 1; i <= horizon; i++) {
      const d = addDays(date, i);
      if (t.deadline && d > t.deadline) break;
      if (loadOf(d) + dur(t) > capOf(d)) continue;
      loads.set(d, loadOf(d) + dur(t));
      changes.push({ kind: 'reschedule_task', taskId: t.id, title: t.title, from: t.date, date: d, durationMin: t.durationMin });
      over -= dur(t);
      break;
    }
  }
  return { date, loadMin, capacityMin, fits: false, stillOverMin: Math.max(0, over), changes };
}

// ── Desglosar un proyecto ──────────────────────────────────────────────────────────────

export interface BreakdownInput {
  subject: string;
  deadline: LocalDate | null;
  today: LocalDate;
  lang: 'es' | 'en';
  projects: Project[];
  tasks: Task[];
}

export interface BreakdownProposal {
  projectId: ID | null;
  name: string;
  deadline: LocalDate | null;
  changes: ProposedChange[];
  /** Fases que ya existían como tareas del proyecto y no se repiten. */
  skipped: string[];
}

/**
 * Fases típicas según el tipo de proyecto, repartidas hasta la fecha límite. La primera
 * fase queda para hoy: lo difícil de un proyecto suele ser empezar.
 */
export function breakDownProject(input: BreakdownInput): BreakdownProposal {
  const live = input.projects.filter((p) => !p.deletedAt && p.status !== 'archived');
  const project = bestMatch(input.subject, live, (p) => p.name, 0.6);
  const name = project?.name ?? capitalize(input.subject.trim());
  const deadline = input.deadline ?? project?.deadline ?? null;
  const existing = project ? input.tasks.filter((t) => !t.deletedAt && t.projectId === project.id).map((t) => t.title) : [];
  const phases = suggestPhases(`${input.subject} ${project?.name ?? ''}`, input.lang);
  const skipped = phases.filter((p) => existing.some((e) => nameScore(p, e) >= 0.7));
  const todo = phases.filter((p) => !skipped.includes(p));
  const span = deadline ? Math.max(0, diffDays(deadline, input.today)) : 0;
  const changes: ProposedChange[] = [];
  const ref = 'new-project';
  if (!project) changes.push({ kind: 'create_project', ref, name, deadline });
  todo.forEach((title, i) => {
    const due = deadline && span > 0 ? (i === todo.length - 1 ? deadline : addDays(input.today, Math.max(1, Math.round(((i + 1) * span) / todo.length)))) : null;
    changes.push({
      kind: 'create_task',
      title,
      date: i === 0 ? input.today : null,
      deadline: due,
      priority: i === 0 ? 2 : 3,
      ...(project ? { projectId: project.id } : { projectRef: ref }),
    });
  });
  return { projectId: project?.id ?? null, name, deadline, changes, skipped };
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ── ¿Qué hago ahora? ───────────────────────────────────────────────────────────────────

export interface WhatNowInput {
  now: Date;
  tasks: Task[];
  busy: Interval[];
  prefs: SchedulePrefs;
  isBlocked?: (t: Task) => boolean;
}

export interface WhatNowResult {
  /** Minutos libres desde ahora hasta lo siguiente (null: ahora mismo estás ocupado). */
  freeMin: number | null;
  /** Hora a la que acaba el hueco. */
  until: number | null;
  /** Si ahora estás ocupado, cuándo acaba lo planificado. */
  busyUntil: number | null;
  pick: Task | null;
  alternatives: Task[];
}

export function whatNow(input: WhatNowInput): WhatNowResult {
  const { now } = input;
  const today = toLocalDate(now);
  const t = now.getTime();
  const slots = freeSlots(today, input.busy, { ...input.prefs, bufferMin: 0 }, t);
  const slot = slots.find((s) => s.start <= t + 10 * MIN && s.end > t) ?? null;
  const freeMin = slot ? Math.round((slot.end - Math.max(t, slot.start)) / MIN) : null;
  const busyNow = slot ? null : mergeIntervals(input.busy).find((b) => b.start <= t && b.end > t);
  const horizon = addDays(today, 2);
  const candidates = input.tasks
    .filter((x) => isOpen(x) && !x.parentId && !(input.isBlocked?.(x) ?? false))
    .filter((x) => (x.date !== null && x.date <= today) || (x.deadline !== null && x.deadline <= horizon))
    // Lo que tiene hora más tarde ya tiene su sitio; lo que empieza en breve o ya pasó, cuenta.
    .filter((x) => !x.time || (x.date ?? today) < today || minutesOfDay(now) >= parseTime(x.time) - 15)
    .sort((a, b) => urgencyScore(b, today) - urgencyScore(a, today) || Number(b.status === 'in_progress') - Number(a.status === 'in_progress') || dur(a) - dur(b));
  const fitting = freeMin === null ? candidates : candidates.filter((x) => dur(x) <= freeMin + 5);
  const pool = fitting.length ? fitting : candidates;
  return { freeMin, until: slot ? slot.end : null, busyUntil: busyNow?.end ?? null, pick: pool[0] ?? null, alternatives: pool.slice(1, 3) };
}

// ── Resumen de la semana ───────────────────────────────────────────────────────────────

export type WeekNote =
  | { kind: 'tasks'; count: number; prev: number }
  | { kind: 'focus'; minutes: number; sessions: number; prevMinutes: number }
  | { kind: 'bestDay'; date: LocalDate; minutes: number }
  | { kind: 'topProject'; projectId: ID | null; minutes: number }
  | { kind: 'habits'; done: number; scheduled: number }
  | { kind: 'quiet' };

export type WeekTip =
  | { kind: 'protectPeak'; start: number; end: number }
  | { kind: 'overdue'; count: number }
  | { kind: 'habitsLow'; rate: number }
  | { kind: 'inflow'; created: number; completed: number }
  | { kind: 'interruptions'; count: number; sessions: number }
  | { kind: 'celebrate' }
  | { kind: 'restart' };

export interface WeekInput {
  cur: PeriodSummary;
  prev: PeriodSummary;
  peak: { start: number; end: number; minutes: number } | null;
  overdue: number;
}

export type WeekTrend = 'up' | 'steady' | 'down' | 'quiet';

/** Hechos y, como mucho, tres sugerencias concretas. Describe; no juzga. */
export function summarizeWeek(input: WeekInput): { notes: WeekNote[]; tips: WeekTip[]; trend: WeekTrend } {
  const { cur, prev } = input;
  const focusMin = Math.round(cur.focus.totalSec / 60);
  const prevFocus = Math.round(prev.focus.totalSec / 60);
  const quiet = cur.tasksCompleted === 0 && focusMin === 0 && cur.habitDone === 0;
  const notes: WeekNote[] = [];
  if (quiet) notes.push({ kind: 'quiet' });
  else {
    notes.push({ kind: 'tasks', count: cur.tasksCompleted, prev: prev.tasksCompleted });
    if (focusMin > 0) notes.push({ kind: 'focus', minutes: focusMin, sessions: cur.focus.sessions, prevMinutes: prevFocus });
    if (cur.bestDay && cur.bestDay.minutes >= 20) notes.push({ kind: 'bestDay', date: cur.bestDay.date, minutes: Math.round(cur.bestDay.minutes) });
    if (cur.topProjects[0]) notes.push({ kind: 'topProject', projectId: cur.topProjects[0].projectId, minutes: Math.round(cur.topProjects[0].minutes) });
    if (cur.habitScheduled > 0) notes.push({ kind: 'habits', done: cur.habitDone, scheduled: cur.habitScheduled });
  }
  const score = (s: PeriodSummary) => s.tasksCompleted * 30 + s.focus.totalSec / 60 + s.habitDone * 10;
  const a = score(cur);
  const b = score(prev);
  const trend: WeekTrend = quiet ? 'quiet' : b === 0 ? 'up' : a >= b * 1.15 ? 'up' : a <= b * 0.8 ? 'down' : 'steady';
  const tips: WeekTip[] = [];
  if (quiet) tips.push({ kind: 'restart' });
  if (trend === 'up' && b > 0) tips.push({ kind: 'celebrate' });
  if (input.peak && input.peak.minutes >= 60) tips.push({ kind: 'protectPeak', start: input.peak.start, end: input.peak.end });
  if (input.overdue >= 3) tips.push({ kind: 'overdue', count: input.overdue });
  if (cur.tasksCreated >= cur.tasksCompleted + 5) tips.push({ kind: 'inflow', created: cur.tasksCreated, completed: cur.tasksCompleted });
  if (cur.habitScheduled >= 5 && cur.habitDone / cur.habitScheduled < 0.5) tips.push({ kind: 'habitsLow', rate: cur.habitDone / cur.habitScheduled });
  if (cur.focus.sessions >= 4 && cur.focus.interrupted / cur.focus.sessions >= 0.4) tips.push({ kind: 'interruptions', count: cur.focus.interrupted, sessions: cur.focus.sessions });
  return { notes, tips: tips.slice(0, 3), trend };
}

