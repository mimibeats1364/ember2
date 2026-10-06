/**
 * Reglas de repetición sobre fechas locales (inmunes a DST).
 * El "ancla" es la primera ocurrencia de la serie.
 */
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  monthsBetween,
  startOfWeek,
  weekdayOf,
  ymd,
} from './dates';
import type { LocalDate, Recurrence, Weekday } from './types';

function weeklyDays(rule: Recurrence, anchor: LocalDate): Weekday[] {
  return rule.byWeekday && rule.byWeekday.length > 0 ? rule.byWeekday : [weekdayOf(anchor)];
}

export function occursOn(rule: Recurrence, anchor: LocalDate, date: LocalDate): boolean {
  if (date < anchor) return false;
  if (rule.until && date > rule.until) return false;
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case 'daily':
      return diffDays(date, anchor) % interval === 0;
    case 'weekly': {
      // Las semanas se cuentan de lunes a lunes para que "cada 2 semanas" sea estable.
      const weeks = diffDays(startOfWeek(date, 1), startOfWeek(anchor, 1)) / 7;
      return weeks % interval === 0 && weeklyDays(rule, anchor).includes(weekdayOf(date));
    }
    case 'monthly': {
      const months = monthsBetween(anchor, date);
      if (months % interval !== 0) return false;
      const [y, m, d] = ymd(date);
      const wanted = rule.byMonthDay ?? ymd(anchor)[2];
      return d === Math.min(wanted, daysInMonth(y, m));
    }
    case 'yearly': {
      const [ay, am, ad] = ymd(anchor);
      const [y, m, d] = ymd(date);
      if ((y - ay) % interval !== 0 || m !== am) return false;
      return d === Math.min(ad, daysInMonth(y, m));
    }
  }
}

/** Siguiente ocurrencia estrictamente posterior a `after`. */
export function nextOccurrence(rule: Recurrence, anchor: LocalDate, after: LocalDate): LocalDate | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  let cursor = after < anchor ? addDays(anchor, -1) : after;
  // Saltos rápidos para reglas mensuales/anuales; el resto avanza día a día con un tope.
  if (rule.freq === 'monthly' || rule.freq === 'yearly') {
    const step = rule.freq === 'monthly' ? interval : interval * 12;
    const anchorDay = rule.freq === 'monthly' ? (rule.byMonthDay ?? ymd(anchor)[2]) : ymd(anchor)[2];
    let k = Math.max(0, Math.floor(monthsBetween(anchor, cursor) / step) - 1);
    for (let i = 0; i < 400; i++, k++) {
      const base = addMonths(anchor, k * step);
      const [y, m] = ymd(base);
      if (rule.freq === 'yearly' && m !== ymd(anchor)[1]) continue;
      const candidate = `${base.slice(0, 8)}${String(Math.min(anchorDay, daysInMonth(y, m))).padStart(2, '0')}`;
      if (candidate > cursor && candidate >= anchor) {
        if (rule.until && candidate > rule.until) return null;
        return candidate;
      }
    }
    return null;
  }
  for (let i = 0; i < 366 * 2 * interval; i++) {
    cursor = addDays(cursor, 1);
    if (rule.until && cursor > rule.until) return null;
    if (occursOn(rule, anchor, cursor)) return cursor;
  }
  return null;
}

export function occurrencesBetween(
  rule: Recurrence,
  anchor: LocalDate,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  const out: LocalDate[] = [];
  if (to < anchor) return out;
  let cursor: LocalDate | null = from <= anchor ? anchor : from;
  if (!occursOn(rule, anchor, cursor)) cursor = nextOccurrence(rule, anchor, cursor);
  while (cursor && cursor <= to && out.length < 1000) {
    out.push(cursor);
    cursor = nextOccurrence(rule, anchor, cursor);
  }
  return out;
}
