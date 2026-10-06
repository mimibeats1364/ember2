/**
 * Internacionalización. Las claves salen del diccionario español (fuente de verdad) y se
 * comprueban en tiempo de compilación. Formatos de fecha/hora/duración vía Intl.
 */
import { es, type Dictionary } from './es';
import { en } from './en';
import { diffDays, localDateTime, weekdayOf } from '@core/dates';
import type { LocalDate } from '@core/types';

export type Locale = 'es' | 'en';
const dictionaries: Record<Locale, Dictionary> = { es, en };

type Leaves<T, P extends string = ''> = T extends string
  ? P
  : T extends readonly string[]
    ? P
    : { [K in keyof T & (string | number)]: Leaves<T[K], P extends '' ? `${K}` : `${P}.${K}`> }[keyof T & (string | number)];

export type TKey = Leaves<Dictionary>;
type Params = Record<string, string | number>;

let current: Locale = 'es';
const intlLocale = () => (current === 'es' ? 'es-ES' : 'en-GB');

export function setLocale(l: Locale) {
  current = l;
  document.documentElement.lang = l;
}

export function getLocale(): Locale {
  return current;
}

function lookup(key: string): unknown {
  let node: unknown = dictionaries[current];
  for (const part of key.split('.')) node = (node as Record<string, unknown>)?.[part];
  if (node === undefined && current !== 'es') {
    node = es;
    for (const part of key.split('.')) node = (node as Record<string, unknown>)?.[part];
  }
  return node;
}

export function t(key: TKey, params?: Params): string {
  const raw = lookup(key);
  if (typeof raw !== 'string') return key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? `{${p}}`)) : raw;
}

/** Plural simple: usa `<key>_one` o `<key>_other`. */
export function tp(base: string, count: number, params?: Params): string {
  const key = `${base}_${count === 1 ? 'one' : 'other'}` as TKey;
  return t(key, { count, ...params });
}

export function tList(key: TKey): readonly string[] {
  const raw = lookup(key);
  return Array.isArray(raw) ? raw : [];
}

// ── Formatos ───────────────────────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = intlLocale() + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(), opts);
    fmtCache.set(key, f);
  }
  return f;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function formatDate(date: LocalDate, style: 'long' | 'medium' | 'short' | 'weekday' | 'weekdayShort' | 'monthYear' | 'month' | 'dayMonth' = 'medium'): string {
  const d = localDateTime(date, 12 * 60);
  switch (style) {
    case 'long':
      return cap(dtf({ weekday: 'long', day: 'numeric', month: 'long' }).format(d));
    case 'medium':
      return dtf({ day: 'numeric', month: 'short' }).format(d).replace('.', '');
    case 'short':
      return dtf({ day: '2-digit', month: '2-digit' }).format(d);
    case 'weekday':
      return cap(dtf({ weekday: 'long' }).format(d));
    case 'weekdayShort':
      return cap(dtf({ weekday: 'short' }).format(d).replace('.', ''));
    case 'monthYear':
      return cap(dtf({ month: 'long', year: 'numeric' }).format(d));
    case 'month':
      return dtf({ month: 'long' }).format(d);
    case 'dayMonth':
      return dtf({ day: 'numeric', month: 'long' }).format(d);
  }
}

/** "Hoy", "Mañana", "Ayer", "Jueves", o "12 oct". */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  const diff = diffDays(date, today);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.tomorrow');
  if (diff === -1) return t('common.yesterday');
  if (diff > 1 && diff < 7) return formatDate(date, 'weekday');
  return formatDate(date, 'medium');
}

export function formatClockTime(d: Date): string {
  return dtf({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function formatRange(start: Date, end: Date): string {
  return `${formatClockTime(start)}–${formatClockTime(end)}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m <= 0) return t('time.zero');
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return t('time.minutes', { m: r });
  if (r === 0) return t('time.hours', { h });
  return t('time.hoursMinutes', { h, m: r });
}

export function weekdayName(wd: number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  // 2026-10-04 es domingo
  const base = new Date(2026, 9, 4 + wd, 12);
  return cap(dtf({ weekday: style }).format(base).replace('.', ''));
}

export function weekdayInitial(date: LocalDate): string {
  return weekdayName(weekdayOf(date), 'narrow');
}

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits }).format(n);
}

export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
