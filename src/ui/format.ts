/** Textos derivados del dominio (repeticiones, frecuencias, tokens detectados). */
import type { Habit, Recurrence, LocalDate } from '@core/types';
import type { ParsedInput, InputToken } from '@core/nlp';
import { formatDate, formatDuration, relativeDay, t, weekdayName } from '@/i18n';

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return t('recurrence.none');
  const n = r.interval || 1;
  let base: string;
  switch (r.freq) {
    case 'daily':
      base = n === 1 ? t('recurrence.daily') : t('recurrence.everyNDays', { n });
      break;
    case 'weekly': {
      const days = [...(r.byWeekday ?? [])].sort();
      if (n === 1 && days.join() === '1,2,3,4,5') base = t('recurrence.weekdays');
      else if (n === 1 && days.join() === '0,6') base = t('recurrence.weekends');
      else {
        const head = n === 1 ? t('recurrence.weekly') : t('recurrence.everyNWeeks', { n });
        const order = [1, 2, 3, 4, 5, 6, 0];
        base = days.length ? `${head} · ${days.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => weekdayName(d, 'short')).join(', ')}` : head;
      }
      break;
    }
    case 'monthly':
      base = n === 1 ? t('recurrence.monthly') : t('recurrence.everyNMonths', { n });
      break;
    case 'yearly':
      base = t('recurrence.yearly');
      break;
  }
  return r.until ? `${base} · ${t('recurrence.until', { date: formatDate(r.until, 'medium') })}` : base;
}

export function describeFrequency(f: Habit['frequency']): string {
  switch (f.kind) {
    case 'daily':
      return t('habits.freq.daily');
    case 'weekdays': {
      const order = [1, 2, 3, 4, 5, 6, 0];
      return [...f.days].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => weekdayName(d, 'short')).join(' · ');
    }
    case 'times_per_week':
      return t('habits.timesPerWeek', { n: f.times });
    case 'interval':
      return t('habits.everyNDays', { n: f.every });
  }
}

export function tokenLabel(tok: InputToken, p: ParsedInput, today: LocalDate): string | null {
  switch (tok.type) {
    case 'date':
      return p.date ? relativeDay(p.date, today) : null;
    case 'time':
      return p.time ? (p.durationMin ? `${p.time} · ${formatDuration(p.durationMin)}` : p.time) : null;
    case 'duration':
      return p.durationMin ? formatDuration(p.durationMin) : null;
    case 'deadline':
      return p.deadline ? t('tasks.deadline', { date: relativeDay(p.deadline, today) }) : null;
    case 'recurrence':
      return p.timesPerWeek ? t('habits.timesPerWeek', { n: p.timesPerWeek }) : describeRecurrence(p.recurrence);
    case 'priority':
      return p.priority ? `P${p.priority}` : null;
    case 'project':
      return p.project ? `# ${p.project}` : null;
    case 'tag':
      return null;
    case 'kind':
      return null;
  }
}

export function minutesLabel(min: number | null | undefined): string {
  return min ? formatDuration(min) : '—';
}
