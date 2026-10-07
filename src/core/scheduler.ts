/**
 * Planificación automática (determinista, local, explicable).
 *
 * - Busca huecos respetando sueño, eventos, bloques (trabajo, clase, trayectos…), hábitos con
 *   hora y tareas ya planificadas, dejando un margen (`bufferMin`) entre bloques.
 * - Nunca mueve nada: solo propone. El usuario acepta, edita o regenera.
 */
import { addDays, diffDays, localDateTime, parseTime, toLocalDate } from './dates';
import type { TimelineItem } from './calendar';
import { isOpen } from './tasks';
import type { ID, LocalDate, Preferences, Task } from './types';

export interface Interval {
  start: number;
  end: number;
}

export type SchedulePrefs = Pick<Preferences, 'sleep' | 'bufferMin' | 'focusPeak'>;

const MIN = 60_000;
const SLOT_STEP_MIN = 15;

/** Ventana en la que estás despierto ese día (de despertar a acostarte). */
export function awakeWindow(date: LocalDate, prefs: SchedulePrefs): Interval {
  const wake = parseTime(prefs.sleep.wake);
  const bed = parseTime(prefs.sleep.bed);
  const start = localDateTime(date, wake).getTime();
  const end = bed > wake ? localDateTime(date, bed).getTime() : localDateTime(addDays(date, 1), bed).getTime();
  return { start, end };
}

/** Intervalos ocupados a partir de la línea de tiempo (sin eventos de día completo). */
export function busyFromTimeline(items: TimelineItem[], ignore?: (i: TimelineItem) => boolean): Interval[] {
  return items
    .filter((i) => !i.allDay && !(ignore?.(i) ?? false))
    .map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }));
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

const roundUp = (ms: number, stepMin: number) => Math.ceil(ms / (stepMin * MIN)) * stepMin * MIN;

/** Huecos libres de un día, con margen alrededor de lo ocupado. */
export function freeSlots(date: LocalDate, busy: Interval[], prefs: SchedulePrefs, notBefore?: number): Interval[] {
  const win = awakeWindow(date, prefs);
  const buffer = prefs.bufferMin * MIN;
  const blocked = mergeIntervals(busy.map((b) => ({ start: b.start - buffer, end: b.end + buffer })));
  let cursor = Math.max(win.start, notBefore !== undefined ? roundUp(notBefore, SLOT_STEP_MIN) : win.start);
  const out: Interval[] = [];
  for (const b of blocked) {
    if (b.end <= cursor) continue;
    if (b.start >= win.end) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, win.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < win.end) out.push({ start: cursor, end: win.end });
  return out.filter((s) => s.end - s.start >= 10 * MIN);
}

const PEAKS: Record<Exclude<SchedulePrefs['focusPeak'], 'auto'>, [number, number]> = {
  morning: [8, 12],
  afternoon: [13, 18],
  evening: [18, 22],
};

/** Puntuación de una franja: antes es mejor, la franja de foco suma y la noche tardía resta. */
function scoreSlot(start: number, durationMin: number, dayIndex: number, prefs: SchedulePrefs, peakHours?: number[]): number {
  const d = new Date(start);
  const hour = d.getHours() + d.getMinutes() / 60;
  let score = 100 - dayIndex * 6;
  const peak = prefs.focusPeak === 'auto' ? null : PEAKS[prefs.focusPeak];
  if (peak && hour >= peak[0] && hour + durationMin / 60 <= peak[1] + 0.5) score += durationMin >= 45 ? 14 : 6;
  if (peakHours?.includes(Math.floor(hour))) score += 10;
  if (hour >= 21) score -= 12;
  if (hour < 7.5) score -= 8;
  return score;
}

export interface SlotSuggestion {
  date: LocalDate;
  parts: Interval[];
  score: number;
  reason: 'peak' | 'earliest' | 'split';
}

export interface SuggestOptions {
  durationMin: number;
  now: Date;
  /** Último día posible (inclusive). Por defecto, 7 días. */
  until?: LocalDate | null;
  busyFor: (date: LocalDate) => Interval[];
  prefs: SchedulePrefs;
  max?: number;
  peakHours?: number[];
  minChunkMin?: number;
}

/**
 * Propone hasta `max` huecos (en días distintos) para una duración dada. Si ningún hueco
 * continuo es suficiente, propone repartirlo en bloques de al menos `minChunkMin`.
 */
export function suggestSlots(opts: SuggestOptions): SlotSuggestion[] {
  const { durationMin, now, prefs } = opts;
  const today = toLocalDate(now);
  const last = opts.until && opts.until >= today ? opts.until : addDays(today, 6);
  const days = Math.min(60, diffDays(last, today));
  const candidates: SlotSuggestion[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const slots = freeSlots(date, opts.busyFor(date), prefs, i === 0 ? now.getTime() : undefined);
    let best: SlotSuggestion | null = null;
    for (const s of slots) {
      for (let start = s.start; start + durationMin * MIN <= s.end; start += SLOT_STEP_MIN * MIN) {
        const score = scoreSlot(start, durationMin, i, prefs, opts.peakHours);
        if (!best || score > best.score) {
          best = { date, parts: [{ start, end: start + durationMin * MIN }], score, reason: score > 100 - i * 6 ? 'peak' : 'earliest' };
        }
      }
    }
    if (best) candidates.push(best);
  }
  if (candidates.length === 0) {
    const split = splitAcrossDays(opts, today, days);
    return split ? [split] : [];
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, opts.max ?? 3);
}

function splitAcrossDays(opts: SuggestOptions, today: LocalDate, days: number): SlotSuggestion | null {
  const minChunk = (opts.minChunkMin ?? 30) * MIN;
  let remaining = opts.durationMin * MIN;
  const parts: Interval[] = [];
  for (let i = 0; i <= days && remaining > 0; i++) {
    const date = addDays(today, i);
    for (const s of freeSlots(date, opts.busyFor(date), opts.prefs, i === 0 ? opts.now.getTime() : undefined)) {
      const len = Math.min(remaining, s.end - s.start);
      if (len < minChunk && len < remaining) continue;
      parts.push({ start: s.start, end: s.start + len });
      remaining -= len;
      if (remaining <= 0) break;
    }
  }
  if (remaining > 0 || parts.length === 0) return null;
  return { date: toLocalDate(new Date(parts[0].start)), parts, score: 0, reason: 'split' };
}

// ── Planificar el día ─────────────────────────────────────────────────────────────────

export type PlanStrategy = 'balanced' | 'deep_first' | 'quick_wins';

export interface PlannedBlock {
  taskId: ID;
  title: string;
  start: number;
  end: number;
}

export interface DayPlan {
  date: LocalDate;
  blocks: PlannedBlock[];
  /** Tareas que no caben hoy (para reprogramar, no para acumular culpa). */
  unplaced: Task[];
  freeMinutesLeft: number;
}

export interface PlanDayOptions {
  date: LocalDate;
  now: Date;
  tasks: Task[];
  busy: Interval[];
  prefs: SchedulePrefs;
  strategy?: PlanStrategy;
  isBlocked?: (t: Task) => boolean;
  defaultDurationMin?: number;
  /** Tope de minutos de tareas que planificar ese día ("solo tengo 3 horas"). */
  maxMinutes?: number | null;
}

/** Cuánto aprieta una tarea ese día: prioridad, retraso, fecha límite cercana y si suma a algo. */
export function urgencyScore(t: Task, date: LocalDate): number {
  let s = { 1: 40, 2: 25, 3: 10, 4: 0 }[t.priority];
  if (t.date && t.date < date) s += 18;
  if (t.deadline) s += Math.max(0, 24 - Math.max(0, diffDays(t.deadline, date)) * 4);
  if (t.goalId || t.projectId) s += 4;
  return s;
}

/** Candidatas para planificar un día: abiertas, sin hora y que tocan ese día o antes. */
export function planCandidates(tasks: Task[], date: LocalDate): Task[] {
  return tasks.filter(
    (t) =>
      isOpen(t) &&
      !t.time &&
      !t.parentId &&
      ((t.date !== null && t.date <= date) || (t.deadline !== null && t.deadline <= addDays(date, 2))),
  );
}

export function planDay(opts: PlanDayOptions): DayPlan {
  const { date, prefs } = opts;
  const strategy = opts.strategy ?? 'balanced';
  const fallback = opts.defaultDurationMin ?? 30;
  const isToday = toLocalDate(opts.now) === date;
  const busy = [...opts.busy];
  const dur = (t: Task) => t.durationMin ?? fallback;
  const candidates = planCandidates(opts.tasks, date).filter((t) => !(opts.isBlocked?.(t) ?? false));
  candidates.sort((a, b) => {
    const base = urgencyScore(b, date) - urgencyScore(a, date);
    if (strategy === 'deep_first') return dur(b) - dur(a) || base;
    if (strategy === 'quick_wins') return dur(a) - dur(b) || base;
    return base || a.order - b.order;
  });
  const blocks: PlannedBlock[] = [];
  const unplaced: Task[] = [];
  const peak = prefs.focusPeak === 'auto' ? null : PEAKS[prefs.focusPeak];
  let planned = 0;
  for (const t of candidates) {
    const minutes = dur(t);
    if (opts.maxMinutes != null && planned + minutes > opts.maxMinutes) {
      unplaced.push(t);
      continue;
    }
    const slots = freeSlots(date, busy, prefs, isToday ? opts.now.getTime() : undefined);
    const fits = slots.filter((s) => s.end - s.start >= minutes * MIN);
    if (fits.length === 0) {
      unplaced.push(t);
      continue;
    }
    // El trabajo profundo busca tu franja de foco; lo corto rellena huecos.
    let chosen = fits[0];
    if (peak && minutes >= 45) {
      const inPeak = fits.find((s) => {
        const h = new Date(s.start).getHours();
        return h >= peak[0] && h < peak[1];
      });
      if (inPeak) chosen = inPeak;
    } else if (minutes < 45) {
      chosen = [...fits].sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start)[0];
    }
    const start = chosen.start;
    blocks.push({ taskId: t.id, title: t.title, start, end: start + minutes * MIN });
    planned += minutes;
    busy.push({ start, end: start + minutes * MIN });
  }
  const freeLeft = freeSlots(date, busy, prefs, isToday ? opts.now.getTime() : undefined).reduce((acc, s) => acc + (s.end - s.start) / MIN, 0);
  return { date, blocks: blocks.sort((a, b) => a.start - b.start), unplaced, freeMinutesLeft: Math.round(freeLeft) };
}
