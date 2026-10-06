/**
 * iCalendar (RFC 5545): exporta eventos (con RRULE) y tareas con fecha (VTODO);
 * importa VEVENT con DTSTART en UTC, con TZID o de día completo, y RRULE básicas.
 */
import { addDays, isValidLocalDate, localTimeZone, makeDate, zonedParts, zonedToDate } from '../dates';
import type { CalendarEvent, LocalDate, Recurrence, Task, Weekday } from '../types';

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unescapeText = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Pliega líneas a 75 octetos como exige el estándar. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 74) {
      out.push(current);
      current = ' ' + ch;
      bytes = 1 + b;
    } else {
      current += ch;
      bytes += b;
    }
  }
  out.push(current);
  return out.join('\r\n');
}

const utcStamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateValue = (d: LocalDate) => d.replace(/-/g, '');

function rrule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.byWeekday?.length) parts.push(`BYDAY=${r.byWeekday.map((d) => DAY_CODES[d]).join(',')}`);
  if (r.freq === 'monthly' && r.byMonthDay) parts.push(`BYMONTHDAY=${r.byMonthDay}`);
  if (r.until) parts.push(`UNTIL=${dateValue(r.until)}`);
  return parts.join(';');
}

export function toIcs(events: CalendarEvent[], tasks: Task[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ember//Personal OS//ES', 'CALSCALE:GREGORIAN'];
  const stamp = utcStamp(now.toISOString());
  for (const e of events) {
    if (e.deletedAt) continue;
    lines.push('BEGIN:VEVENT', `UID:${e.id}@ember`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(e.title)}`);
    if (e.allDay && e.date) {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(e.date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(e.endDate ?? e.date, 1))}`);
    } else {
      lines.push(`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`);
    }
    if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.recurrence) lines.push(`RRULE:${rrule(e.recurrence)}`);
    for (const ex of e.exdates) {
      if (e.allDay) lines.push(`EXDATE;VALUE=DATE:${dateValue(ex)}`);
      else {
        const tz = e.tz || localTimeZone();
        const at = zonedToDate(ex, zonedParts(new Date(e.start), tz).minutes, tz);
        lines.push(`EXDATE:${utcStamp(at.toISOString())}`);
      }
    }
    lines.push(`CATEGORIES:${e.category.toUpperCase()}`, 'END:VEVENT');
  }
  for (const t of tasks) {
    if (t.deletedAt || (!t.date && !t.deadline)) continue;
    lines.push('BEGIN:VTODO', `UID:${t.id}@ember`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(t.title)}`);
    if (t.date) lines.push(`DTSTART;VALUE=DATE:${dateValue(t.date)}`);
    if (t.deadline) lines.push(`DUE;VALUE=DATE:${dateValue(t.deadline)}`);
    lines.push(`PRIORITY:${[0, 1, 3, 5, 9][t.priority]}`, `STATUS:${t.status === 'done' ? 'COMPLETED' : 'NEEDS-ACTION'}`);
    if (t.notes) lines.push(`DESCRIPTION:${escapeText(t.notes)}`);
    lines.push('END:VTODO');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean);
}

function parseLine(line: string): Prop | null {
  const idx = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  if (idx < 0) return null;
  const [name, ...rawParams] = line.slice(0, idx).split(';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const [k, v] = p.split('=');
    if (k) params[k.toUpperCase()] = (v ?? '').replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(idx + 1) };
}

function parseDateProp(p: Prop): { allDay: true; date: LocalDate } | { allDay: false; at: Date } | null {
  const v = p.value.trim();
  const dm = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dm || p.params.VALUE === 'DATE') {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const date = makeDate(+m[1], +m[2], +m[3]);
    return isValidLocalDate(date) ? { allDay: true, date } : null;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const date = makeDate(+m[1], +m[2], +m[3]);
  const minutes = +m[4] * 60 + +m[5];
  if (m[7]) return { allDay: false, at: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))) };
  const tz = p.params.TZID;
  if (tz) {
    try {
      return { allDay: false, at: zonedToDate(date, minutes, tz) };
    } catch {
      /* zona desconocida: se interpreta como hora local */
    }
  }
  return { allDay: false, at: zonedToDate(date, minutes, localTimeZone()) };
}

function parseRrule(value: string): Recurrence | null {
  const map = Object.fromEntries(value.split(';').map((kv) => kv.split('=') as [string, string]));
  const freq = (map.FREQ ?? '').toLowerCase();
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) return null;
  const r: Recurrence = { freq: freq as Recurrence['freq'], interval: Math.max(1, parseInt(map.INTERVAL ?? '1', 10) || 1) };
  if (map.BYDAY) {
    const days = map.BYDAY.split(',').map((d) => DAY_CODES.indexOf(d.slice(-2))).filter((d) => d >= 0) as Weekday[];
    if (days.length) r.byWeekday = days;
  }
  if (map.BYMONTHDAY && /^\d+$/.test(map.BYMONTHDAY)) r.byMonthDay = +map.BYMONTHDAY;
  if (map.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(map.UNTIL);
    if (m) r.until = makeDate(+m[1], +m[2], +m[3]);
  }
  return r;
}

export interface IcsEvent {
  uid: string;
  title: string;
  notes: string;
  location: string;
  allDay: boolean;
  start: string;
  end: string;
  date: LocalDate | null;
  endDate: LocalDate | null;
  recurrence: Recurrence | null;
  exdates: LocalDate[];
}

export function parseIcs(text: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  let current: Prop[] | null = null;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') current = [];
    else if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT' && current) {
      const ev = buildEvent(current);
      if (ev) out.push(ev);
      current = null;
    } else if (current) current.push(p);
  }
  return out;
}

function buildEvent(props: Prop[]): IcsEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const dtstart = get('DTSTART');
  if (!dtstart) return null;
  const start = parseDateProp(dtstart);
  if (!start) return null;
  const dtend = get('DTEND');
  const end = dtend ? parseDateProp(dtend) : null;
  const rr = get('RRULE');
  const exdates = props
    .filter((p) => p.name === 'EXDATE')
    .flatMap((p) => p.value.split(',').map((v) => parseDateProp({ ...p, value: v })))
    .map((d) => (d ? (d.allDay ? d.date : makeDate(d.at.getFullYear(), d.at.getMonth() + 1, d.at.getDate())) : null))
    .filter((d): d is LocalDate => !!d);
  const base = {
    uid: get('UID')?.value ?? '',
    title: unescapeText(get('SUMMARY')?.value ?? '(sin título)'),
    notes: unescapeText(get('DESCRIPTION')?.value ?? ''),
    location: unescapeText(get('LOCATION')?.value ?? ''),
    recurrence: rr ? parseRrule(rr.value) : null,
    exdates,
  };
  if (start.allDay) {
    const endDate = end && end.allDay ? addDays(end.date, -1) : start.date;
    return { ...base, allDay: true, start: '', end: '', date: start.date, endDate: endDate < start.date ? start.date : endDate };
  }
  const endAt = end && !end.allDay ? end.at : new Date(start.at.getTime() + 60 * 60_000);
  return { ...base, allDay: false, start: start.at.toISOString(), end: endAt.toISOString(), date: null, endDate: null };
}
