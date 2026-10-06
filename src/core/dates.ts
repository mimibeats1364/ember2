/**
 * Utilidades de fecha y hora.
 *
 * Regla de oro: la aritmética de días se hace sobre números de día UTC (nunca sumando
 * 24 h a un instante local), así los cambios de horario (DST) no desplazan fechas.
 * Las conversiones fecha+hora → instante usan la zona del sistema o una zona IANA explícita.
 */
import type { Instant, LocalDate, LocalTime, Weekday } from './types';

const DAY_MS = 86_400_000;
const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export function ymd(s: LocalDate): [number, number, number] {
  return [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))];
}

export function makeDate(y: number, m: number, d: number): LocalDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function isValidLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = ymd(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Fecha local (zona del sistema) de un Date. */
export function toLocalDate(d: Date): LocalDate {
  return makeDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function today(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

export function dayNumber(s: LocalDate): number {
  const [y, m, d] = ymd(s);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): LocalDate {
  const d = new Date(n * DAY_MS);
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(s: LocalDate, n: number): LocalDate {
  return fromDayNumber(dayNumber(s) + n);
}

/** a − b en días. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return dayNumber(a) - dayNumber(b);
}

export function weekdayOf(s: LocalDate): Weekday {
  // 1970-01-01 fue jueves (4).
  return (((dayNumber(s) % 7) + 7 + 4) % 7) as Weekday;
}

export function startOfWeek(s: LocalDate, weekStartsOn: 0 | 1 = 1): LocalDate {
  const wd = weekdayOf(s);
  const delta = (wd - weekStartsOn + 7) % 7;
  return addDays(s, -delta);
}

export function endOfWeek(s: LocalDate, weekStartsOn: 0 | 1 = 1): LocalDate {
  return addDays(startOfWeek(s, weekStartsOn), 6);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function startOfMonth(s: LocalDate): LocalDate {
  const [y, m] = ymd(s);
  return makeDate(y, m, 1);
}

export function endOfMonth(s: LocalDate): LocalDate {
  const [y, m] = ymd(s);
  return makeDate(y, m, daysInMonth(y, m));
}

/** Suma meses ajustando el día al último del mes si hace falta (31 ene + 1 mes = 28/29 feb). */
export function addMonths(s: LocalDate, n: number): LocalDate {
  const [y, m, d] = ymd(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function monthsBetween(from: LocalDate, to: LocalDate): number {
  const [ya, ma] = ymd(from);
  const [yb, mb] = ymd(to);
  return (yb - ya) * 12 + (mb - ma);
}

export function startOfQuarter(s: LocalDate): LocalDate {
  const [y, m] = ymd(s);
  return makeDate(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
}

export function endOfQuarter(s: LocalDate): LocalDate {
  return addDays(addMonths(startOfQuarter(s), 3), -1);
}

export function startOfYear(s: LocalDate): LocalDate {
  return makeDate(ymd(s)[0], 1, 1);
}

export function endOfYear(s: LocalDate): LocalDate {
  return makeDate(ymd(s)[0], 12, 31);
}

/** Clave de semana ISO-8601, p. ej. '2026-W41'. */
export function isoWeekKey(s: LocalDate): string {
  const wd = (weekdayOf(s) + 6) % 7; // lunes = 0
  const thursday = addDays(s, 3 - wd);
  const [ty] = ymd(thursday);
  const week = Math.floor(diffDays(thursday, makeDate(ty, 1, 1)) / 7) + 1;
  return `${ty}-W${pad(week)}`;
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let n = dayNumber(from), end = dayNumber(to); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

export const minDate = (a: LocalDate, b: LocalDate) => (a < b ? a : b);
export const maxDate = (a: LocalDate, b: LocalDate) => (a > b ? a : b);

// ── Horas ──────────────────────────────────────────────────────────────────────────────

export function isValidTime(t: unknown): t is LocalTime {
  if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) return false;
  const h = Number(t.slice(0, 2));
  const m = Number(t.slice(3, 5));
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** 'HH:mm' → minutos desde medianoche. */
export function parseTime(t: LocalTime): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** Minutos → 'HH:mm' (envuelve a 24 h). */
export function formatTime(min: number): LocalTime {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// ── Instantes en la zona del sistema ──────────────────────────────────────────────────

/** Fecha + hora de pared local → Date. Las horas inexistentes (salto DST) avanzan. */
export function localDateTime(date: LocalDate, time: LocalTime | number = 0): Date {
  const [y, m, d] = ymd(date);
  const minutes = typeof time === 'number' ? time : parseTime(time);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

export function instantOf(date: LocalDate, time: LocalTime | number = 0): Instant {
  return localDateTime(date, time).toISOString();
}

export function localDateOf(value: Instant | Date): LocalDate {
  return toLocalDate(typeof value === 'string' ? new Date(value) : value);
}

export function minutesOfDay(value: Instant | Date): number {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.getHours() * 60 + d.getMinutes();
}

export function startOfLocalDay(date: LocalDate): Date {
  return localDateTime(date, 0);
}

/** Inicio del día siguiente: los días con cambio de hora duran 23 o 25 h. */
export function endOfLocalDay(date: LocalDate): Date {
  return localDateTime(addDays(date, 1), 0);
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ── Instantes en una zona IANA arbitraria ─────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();

function zonedFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Partes de reloj de pared de un instante en la zona `tz`. */
export function zonedParts(at: Date, tz: string): { date: LocalDate; minutes: number } {
  const parts = zonedFormatter(tz).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') % 24;
  return { date: makeDate(get('year'), get('month'), get('day')), minutes: hour * 60 + get('minute') };
}

function zoneOffsetMs(ms: number, tz: string): number {
  const at = new Date(ms);
  const parts = zonedFormatter(tz).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Fecha + hora de pared en la zona `tz` → instante absoluto. */
export function zonedToDate(date: LocalDate, time: LocalTime | number, tz: string): Date {
  if (tz === localTimeZone()) return localDateTime(date, time);
  const [y, m, d] = ymd(date);
  const minutes = typeof time === 'number' ? time : parseTime(time);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const off1 = zoneOffsetMs(guess, tz);
  let candidate = guess - off1;
  const off2 = zoneOffsetMs(candidate, tz);
  if (off2 !== off1) candidate = guess - off2;
  return new Date(candidate);
}

export function addMinutes(iso: Instant, min: number): Instant {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString();
}

export function minutesBetween(a: Instant | Date, b: Instant | Date): number {
  const ta = typeof a === 'string' ? new Date(a).getTime() : a.getTime();
  const tb = typeof b === 'string' ? new Date(b).getTime() : b.getTime();
  return Math.round((tb - ta) / 60_000);
}
