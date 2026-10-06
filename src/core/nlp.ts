/**
 * Entrada inteligente en español e inglés.
 *
 *   "Estudiar derecho mañana 90 minutos"          → tarea · mañana · 90 min
 *   "Gimnasio lunes, miércoles y viernes a las 18" → hábito · L-X-V · 18:00
 *   "Estudiar marketing 2 horas antes del viernes" → tarea · 2 h · límite viernes · buscar hueco
 *   "entrenar 3 veces por semana"                  → hábito flexible 3×/semana
 *
 * Se trabaja sobre una copia normalizada (minúsculas, sin tildes) de la MISMA longitud, de modo
 * que las posiciones de cada token sirven para resaltar y recortar el texto original.
 */
import { addDays, addMonths, daysInMonth, endOfMonth, isValidLocalDate, makeDate, weekdayOf, ymd } from './dates';
import type { LocalDate, LocalTime, Priority, Recurrence, Weekday } from './types';

export type InputKind = 'task' | 'habit' | 'event' | 'note' | 'idea';
export type TokenType = 'date' | 'time' | 'duration' | 'deadline' | 'recurrence' | 'priority' | 'tag' | 'project' | 'kind';

export interface InputToken {
  start: number;
  end: number;
  type: TokenType;
}

export interface ParsedInput {
  kind: InputKind;
  kindExplicit: boolean;
  title: string;
  date: LocalDate | null;
  time: LocalTime | null;
  durationMin: number | null;
  deadline: LocalDate | null;
  recurrence: Recurrence | null;
  timesPerWeek: number | null;
  priority: Priority | null;
  tags: string[];
  project: string | null;
  /** Hay duración y fecha límite pero no hora: conviene buscar hueco automáticamente. */
  autoSchedule: boolean;
  tokens: InputToken[];
}

export interface ParseOptions {
  today: LocalDate;
  projects?: string[];
}

const normalizeChar = (c: string) => {
  const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return n.length === 1 ? n : c.toLowerCase().length === 1 ? c.toLowerCase() : c;
};

export function normalizeText(s: string): string {
  let out = '';
  for (const ch of s) out += normalizeChar(ch);
  return out.length === s.length ? out : s.toLowerCase();
}

const WEEKDAYS: Record<string, Weekday> = {
  domingo: 0, domingos: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, sabados: 6,
  sunday: 0, sundays: 0, monday: 1, mondays: 1, tuesday: 2, tuesdays: 2, wednesday: 3, wednesdays: 3,
  thursday: 4, thursdays: 4, friday: 5, fridays: 5, saturday: 6, saturdays: 6,
};
const WEEKDAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
  octubre: 10, noviembre: 11, diciembre: 12, ene: 1, abr: 4, ago: 8, dic: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10,
  november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10,
  nov: 11, dec: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
};
const toNumber = (s: string) => (NUMBER_WORDS[s] ?? parseFloat(s.replace(',', '.')));

const HABIT_WORDS =
  /\b(gym|gimnasio|entrenar|entreno|entrenamiento|correr|running|leer|lectura|meditar|meditacion|yoga|estirar|caminar|beber agua|agua|dormir|practicar|journal|diario|workout|train|training|run|read|reading|meditate|stretch|walk|drink water|sleep|practice|estudiar|study)\b/;
const EVENT_WORDS =
  /\b(reunion|cita|llamada|entrevista|cumpleanos|boda|cena con|comida con|dentista|medico|doctor|meeting|call|interview|birthday|appointment|dinner with|lunch with)\b/;
const DEADLINE_PREFIX = /(antes del?|para el|para|hasta el|hasta|by|before|due|until|no mas tarde del?|fecha limite)\s+$/;

interface Span {
  start: number;
  end: number;
}

class Scanner {
  readonly n: string;
  private consumed: boolean[];
  tokens: InputToken[] = [];

  constructor(readonly original: string) {
    this.n = normalizeText(original);
    this.consumed = new Array(this.n.length).fill(false);
  }

  /** Copia normalizada con las zonas ya consumidas en blanco. */
  get free(): string {
    let s = '';
    for (let i = 0; i < this.n.length; i++) s += this.consumed[i] ? ' ' : this.n[i];
    return s;
  }

  isFree(span: Span): boolean {
    for (let i = span.start; i < span.end; i++) if (this.consumed[i]) return false;
    return true;
  }

  take(span: Span, type: TokenType) {
    for (let i = span.start; i < span.end; i++) this.consumed[i] = true;
    this.tokens.push({ ...span, type });
  }

  *matches(re: RegExp): Generator<RegExpExecArray> {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const g = new RegExp(re.source, flags);
    const text = this.free;
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      if (m[0].length === 0) {
        g.lastIndex++;
        continue;
      }
      yield m;
    }
  }

  remainder(): string {
    let s = '';
    for (let i = 0; i < this.original.length; i++) s += this.consumed[i] ? ' ' : this.original[i];
    return s;
  }
}

// ── Fechas ─────────────────────────────────────────────────────────────────────────────

function nextWeekday(today: LocalDate, wd: Weekday, includeToday: boolean): LocalDate {
  const delta = (wd - weekdayOf(today) + 7) % 7;
  return addDays(today, delta === 0 && !includeToday ? 7 : delta);
}

function resolveDayMonth(today: LocalDate, day: number, month: number, year?: number): LocalDate | null {
  const [ty] = ymd(today);
  let y = year ?? ty;
  if (y < 100) y += 2000;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(y, month)) return null;
  let date = makeDate(y, month, day);
  if (year === undefined && date < today) date = makeDate(y + 1, month, Math.min(day, daysInMonth(y + 1, month)));
  return date;
}

interface DateMatch extends Span {
  date: LocalDate;
}

function scanDates(sc: Scanner, today: LocalDate): DateMatch[] {
  const out: DateMatch[] = [];
  const push = (start: number, end: number, date: LocalDate | null) => {
    if (date && isValidLocalDate(date) && sc.isFree({ start, end }) && !out.some((o) => start < o.end && end > o.start)) {
      out.push({ start, end, date });
    }
  };
  const run = (re: RegExp, fn: (m: RegExpExecArray) => LocalDate | null) => {
    for (const m of sc.matches(re)) push(m.index, m.index + m[0].length, fn(m));
  };
  run(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => makeDate(+m[1], +m[2], +m[3]));
  run(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/, (m) => resolveDayMonth(today, +m[1], +m[2], m[3] ? +m[3] : undefined));
  run(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_RE})\\b\\.?(?:\\s+(?:de\\s+)?(\\d{4}))?`), (m) =>
    resolveDayMonth(today, +m[1], MONTHS[m[2]], m[3] ? +m[3] : undefined),
  );
  run(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`), (m) =>
    resolveDayMonth(today, +m[2], MONTHS[m[1]], m[3] ? +m[3] : undefined),
  );
  run(/\b(pasado manana|day after tomorrow)\b/, () => addDays(today, 2));
  run(/\b(esta noche|tonight|hoy|today)\b/, () => today);
  run(/\b(manana|tomorrow)\b/, () => addDays(today, 1));
  run(/\b(?:en|in)\s+(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|a|one|two|three)\s+(dias?|days?|semanas?|weeks?|mes(?:es)?|months?)\b/, (m) => {
    const n = toNumber(m[1]);
    if (/^(sem|week)/.test(m[2])) return addDays(today, n * 7);
    if (/^(mes|month)/.test(m[2])) return addMonths(today, n);
    return addDays(today, n);
  });
  run(/\b(la semana que viene|la proxima semana|proxima semana|semana que viene|next week)\b/, () => nextWeekday(today, 1, false));
  run(/\b(este fin de semana|el fin de semana|fin de semana|this weekend|the weekend|weekend)\b/, () => nextWeekday(today, 6, true));
  run(/\b(fin de mes|final de mes|end of (?:the )?month)\b/, () => endOfMonth(today));
  run(new RegExp(`\\b(?:(el|este|esta|this|on|next|proximo|el proximo|la proxima)\\s+)?(${WEEKDAY_RE})\\b`), (m) => {
    // "este viernes" incluye hoy; "el viernes" / "próximo viernes" es el siguiente.
    const prefix = m[1] ?? '';
    return nextWeekday(today, WEEKDAYS[m[2]], /^(este|esta|this)$/.test(prefix));
  });
  run(/\b(?:el|el dia|on the)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*(?::|h\b|am|pm|min|hora|de la|veces))/, (m) => {
    const day = +m[1];
    const [y, mo, d] = ymd(today);
    if (day < 1 || day > 31) return null;
    if (day >= d && day <= daysInMonth(y, mo)) return makeDate(y, mo, day);
    const next = addMonths(makeDate(y, mo, 1), 1);
    const [ny, nm] = ymd(next);
    return day <= daysInMonth(ny, nm) ? makeDate(ny, nm, day) : null;
  });
  return out.sort((a, b) => a.start - b.start);
}

// ── Horas y duraciones ─────────────────────────────────────────────────────────────────

const MERIDIEM = String.raw`(?:\s*(am|pm|a\.?\s?m\.?|p\.?\s?m\.?|de la manana|de la tarde|de la noche|por la manana|por la tarde|por la noche|h|hs|horas)\b)?`;

function toTime(hStr: string, mStr: string | undefined, mer: string | undefined, contextual: boolean): LocalTime | null {
  let h = +hStr;
  const m = mStr ? +mStr : 0;
  if (h > 24 || m > 59) return null;
  const meridiem = (mer ?? '').replace(/[\s.]/g, '');
  if (/^(pm|delatarde|delanoche|porlatarde|porlanoche)$/.test(meridiem) && h < 12) h += 12;
  else if (/^(am|delamanana|porlamanana)$/.test(meridiem) && h === 12) h = 0;
  else if (!meridiem && contextual && h >= 1 && h <= 6 && !mStr) h += 12; // "a las 6" → 18:00
  if (h === 24) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const minutesOf = (t: LocalTime) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

// ── Parser ─────────────────────────────────────────────────────────────────────────────

export function parseInput(text: string, opts: ParseOptions): ParsedInput {
  const sc = new Scanner(text);
  const { today } = opts;
  const result: ParsedInput = {
    kind: 'task',
    kindExplicit: false,
    title: '',
    date: null,
    time: null,
    durationMin: null,
    deadline: null,
    recurrence: null,
    timesPerWeek: null,
    priority: null,
    tags: [],
    project: null,
    autoSchedule: false,
    tokens: [],
  };

  // Tipo explícito: "idea: …", "nota: …", "hábito: …"
  const kindMatch = /^\s*(idea|nota|note|tarea|task|habito|habit|evento|event)\s*[:\-–]\s*/.exec(sc.n);
  if (kindMatch) {
    const k = kindMatch[1];
    result.kind = k === 'idea' ? 'idea' : k === 'nota' || k === 'note' ? 'note' : k === 'habito' || k === 'habit' ? 'habit' : k === 'evento' || k === 'event' ? 'event' : 'task';
    result.kindExplicit = true;
    sc.take({ start: kindMatch.index, end: kindMatch.index + kindMatch[0].length }, 'kind');
  } else if (/^\s*(idea|ocurrencia)\b/.test(sc.n)) {
    result.kind = 'idea';
  }

  // Prioridad
  for (const m of sc.matches(/(^|\s)(p[1-4]|!{2,3})(?=\s|$)/)) {
    const raw = m[2];
    result.priority = (raw.startsWith('p') ? +raw[1] : raw.length === 3 ? 1 : 2) as Priority;
    sc.take({ start: m.index + m[1].length, end: m.index + m[0].length }, 'priority');
  }

  // Etiquetas y proyectos (#nombre)
  const projectNames = new Map((opts.projects ?? []).map((p) => [normalizeText(p).replace(/\s+/g, ''), p]));
  for (const m of sc.matches(/(^|\s)#([\p{L}\p{N}_-]+)/u)) {
    const start = m.index + m[1].length;
    const end = m.index + m[0].length;
    const raw = text.slice(start + 1, end);
    const proj = projectNames.get(normalizeText(raw));
    if (proj && !result.project) {
      result.project = proj;
      sc.take({ start, end }, 'project');
    } else {
      result.tags.push(raw);
      sc.take({ start, end }, 'tag');
    }
  }

  // N veces por semana → hábito flexible
  for (const m of sc.matches(/\b(\d+|una|dos|tres|cuatro|cinco|seis|siete|one|two|three|four|five|six|seven)\s*(?:veces|vez|times|x)\s*(?:(?:por|a la|al|per|a|every|each|\/)\s*)?(semana|week)\b/)) {
    result.timesPerWeek = Math.min(7, Math.max(1, toNumber(m[1])));
    sc.take({ start: m.index, end: m.index + m[0].length }, 'recurrence');
    break;
  }

  // Repeticiones con nombre
  const recurrencePatterns: [RegExp, (m: RegExpExecArray) => Recurrence][] = [
    [/\b(todos los dias|todas los dias|cada dia|a diario|diariamente|diario|every day|everyday|daily)\b/, () => ({ freq: 'daily', interval: 1 })],
    [/\b(entre semana|de lunes a viernes|dias laborables|laborables|weekdays|every weekday)\b/, () => ({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] })],
    [/\b(los fines de semana|fines de semana|cada fin de semana|on weekends|weekends|every weekend)\b/, () => ({ freq: 'weekly', interval: 1, byWeekday: [6, 0] })],
    [/\b(?:cada|every)\s+(\d+)\s+(dias|days)\b/, (m) => ({ freq: 'daily', interval: +m[1] })],
    [/\b(?:cada|every)\s+(\d+)\s+(semanas|weeks)\b/, (m) => ({ freq: 'weekly', interval: +m[1] })],
    [/\b(?:cada|every)\s+(\d+)\s+(meses|months)\b/, (m) => ({ freq: 'monthly', interval: +m[1] })],
    [/\b(cada semana|todas las semanas|semanalmente|semanal|every week|weekly)\b/, () => ({ freq: 'weekly', interval: 1 })],
    [/\b(cada mes|todos los meses|mensualmente|mensual|every month|monthly)\b/, () => ({ freq: 'monthly', interval: 1 })],
    [/\b(cada ano|todos los anos|anualmente|anual|every year|yearly|annually)\b/, () => ({ freq: 'yearly', interval: 1 })],
  ];
  for (const [re, build] of recurrencePatterns) {
    if (result.recurrence) break;
    for (const m of sc.matches(re)) {
      result.recurrence = build(m);
      sc.take({ start: m.index, end: m.index + m[0].length }, 'recurrence');
      break;
    }
  }

  // Listas de días ("lunes, miércoles y viernes", "cada martes", "every monday and thursday")
  if (!result.recurrence) {
    const dayRe = new RegExp(`\\b(${WEEKDAY_RE})\\b`, 'g');
    const free = sc.free;
    const hits: { start: number; end: number; wd: Weekday }[] = [];
    let m: RegExpExecArray | null;
    while ((m = dayRe.exec(free))) hits.push({ start: m.index, end: m.index + m[0].length, wd: WEEKDAYS[m[1]] });
    const groups: (typeof hits)[] = [];
    for (const h of hits) {
      const last = groups[groups.length - 1];
      const gap = last ? free.slice(last[last.length - 1].end, h.start) : '';
      if (last && /^\s*(,|y|e|and|&|\/)?\s*$/.test(gap)) last.push(h);
      else groups.push([h]);
    }
    for (const g of groups) {
      const before = free.slice(Math.max(0, g[0].start - 16), g[0].start);
      const prefix = /(todos los|todas las|cada|every|los|on)\s+$/.exec(before);
      const plural = /s$/.test(sc.n.slice(g[0].start, g[0].end)) && !/^(lunes|martes|miercoles|jueves|viernes)$/.test(sc.n.slice(g[0].start, g[0].end));
      if (g.length >= 2 || (prefix && prefix[1] !== 'on') || plural) {
        result.recurrence = { freq: 'weekly', interval: 1, byWeekday: [...new Set(g.map((h) => h.wd))].sort() as Weekday[] };
        sc.take({ start: prefix ? g[0].start - prefix[0].length : g[0].start, end: g[g.length - 1].end }, 'recurrence');
        break;
      }
    }
  }

  // Rangos horarios: "de 10 a 11:30", "10:00-12:00", "from 2pm to 4pm"
  for (const m of sc.matches(new RegExp(String.raw`\b(?:de|from|entre)\s+(?:las\s+)?(\d{1,2})(?::(\d{2}))?${MERIDIEM}\s*(?:a|to|-|–|hasta|y)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?${MERIDIEM}`))) {
    const endT = toTime(m[4], m[5], m[6], true);
    const startT = toTime(m[1], m[2], m[3] ?? (m[6] && /pm|tarde|noche/.test(m[6]) && +m[1] < +m[4] ? m[6] : undefined), true);
    if (startT && endT) {
      let dur = minutesOf(endT) - minutesOf(startT);
      if (dur <= 0) dur += 1440;
      result.time = startT;
      result.durationMin = dur;
      sc.take({ start: m.index, end: m.index + m[0].length }, 'time');
      break;
    }
  }
  if (!result.time) {
    for (const m of sc.matches(/\b(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\b/)) {
      const s = toTime(m[1], m[2], undefined, false);
      const e = toTime(m[3], m[4], undefined, false);
      if (s && e) {
        result.time = s;
        result.durationMin = (minutesOf(e) - minutesOf(s) + 1440) % 1440 || 1440;
        sc.take({ start: m.index, end: m.index + m[0].length }, 'time');
        break;
      }
    }
  }

  // Hora suelta
  if (!result.time) {
    const timePatterns: [RegExp, boolean][] = [
      [new RegExp(String.raw`\b(?:a las|a la|alas|sobre las|hacia las|at|around|@)\s*(\d{1,2})(?::(\d{2}))?${MERIDIEM}`), true],
      [new RegExp(String.raw`\b(\d{1,2}):(\d{2})${MERIDIEM}`), false],
      [/\b(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/, false],
    ];
    for (const [re, contextual] of timePatterns) {
      if (result.time) break;
      for (const m of sc.matches(re)) {
        const mer = m[3]?.trim();
        if (mer && /^(h|hs|horas)$/.test(mer) && !contextual && !m[2]) continue;
        const t = toTime(m[1], m[2], mer && /^(h|hs|horas)$/.test(mer) ? undefined : mer, contextual);
        if (t) {
          result.time = t;
          sc.take({ start: m.index, end: m.index + m[0].length }, 'time');
          break;
        }
      }
    }
  }
  // "18h" sin contexto: hora si es ≥ 7 (las cifras pequeñas son duraciones: "2h")
  if (!result.time) {
    for (const m of sc.matches(/\b(\d{1,2})h\b(?!\s*\d)/)) {
      const before = sc.free.slice(Math.max(0, m.index - 10), m.index);
      if (+m[1] >= 7 && +m[1] <= 23 && !/(durante|por|for)\s+$/.test(before)) {
        result.time = toTime(m[1], undefined, undefined, false);
        sc.take({ start: m.index, end: m.index + m[0].length }, 'time');
      }
      break;
    }
  }
  // Partes del día
  for (const [re, time] of [
    [/\b(al mediodia|a mediodia|mediodia|at noon|noon)\b/, '12:00'],
    [/\b(por la manana|en la manana|in the morning|this morning)\b/, '09:00'],
    [/\b(por la tarde|en la tarde|in the afternoon|this afternoon)\b/, '16:00'],
    [/\b(por la noche|en la noche|in the evening|this evening)\b/, '20:00'],
  ] as [RegExp, LocalTime][]) {
    for (const m of sc.matches(re)) {
      if (!result.time) result.time = time;
      sc.take({ start: m.index, end: m.index + m[0].length }, 'time');
      break;
    }
  }
  if (!result.time && /\b(esta noche|tonight)\b/.test(sc.free)) result.time = '20:00';

  // Duraciones
  if (result.durationMin === null) {
    const durPatterns: [RegExp, (m: RegExpExecArray) => number][] = [
      [/\b(?:(?:durante|por|for)\s+)?(hora y media|an hour and a half|one and a half hours?)\b/, () => 90],
      [/\b(?:(?:durante|por|for)\s+)?(\d{1,2})h(\d{2})\b/, (m) => +m[1] * 60 + +m[2]],
      [/\b(?:(?:durante|por|for)\s+)?(media hora|half an hour|half hour)\b/, () => 30],
      [/\b(?:(?:durante|por|for)\s+)?(\d+(?:[.,]\d+)?)\s*(?:horas|hora|hrs|hr|h|hours|hour)\b(?:\s*(?:y\s+)?(\d{1,2})\s*(?:minutos|min|mins|m|minutes)?\b)?/, (m) => Math.round(toNumber(m[1]) * 60 + (m[2] ? +m[2] : 0))],
      [/\b(?:(?:durante|por|for)\s+)?(\d+)\s*(?:minutos|minuto|mins|min|m|minutes|minute)\b/, (m) => +m[1]],
      [/\b(?:(?:durante|por|for)\s+)?(una|un|one|an|a)\s+(?:hora|hour)\b/, () => 60],
    ];
    for (const [re, fn] of durPatterns) {
      if (result.durationMin !== null) break;
      for (const m of sc.matches(re)) {
        const v = fn(m);
        if (v > 0 && v <= 24 * 60) {
          result.durationMin = v;
          sc.take({ start: m.index, end: m.index + m[0].length }, 'duration');
        }
        break;
      }
    }
  }

  // Fechas y fechas límite
  for (const d of scanDates(sc, today)) {
    const before = sc.free.slice(Math.max(0, d.start - 24), d.start);
    const dl = DEADLINE_PREFIX.exec(before);
    if (dl && !result.deadline) {
      result.deadline = d.date;
      sc.take({ start: d.start - dl[0].length, end: d.end }, 'deadline');
    } else if (!result.date) {
      result.date = d.date;
      sc.take(d, 'date');
    }
  }

  // Tipo inferido
  if (!result.kindExplicit && result.kind === 'task') {
    if (result.timesPerWeek !== null) result.kind = 'habit';
    else if (result.recurrence && HABIT_WORDS.test(sc.n)) result.kind = 'habit';
    else if (result.time && EVENT_WORDS.test(sc.n)) result.kind = 'event';
  }
  if (result.kind === 'habit' && result.timesPerWeek === null && !result.recurrence) result.recurrence = { freq: 'daily', interval: 1 };
  if (result.recurrence?.freq === 'weekly' && !result.recurrence.byWeekday?.length) {
    result.recurrence.byWeekday = [weekdayOf(result.date ?? today)];
  }
  if (result.recurrence && !result.date && result.kind !== 'habit') {
    // La primera ocurrencia de una tarea recurrente es la próxima fecha que cumple la regla.
    const days = result.recurrence.byWeekday;
    result.date = days?.length
      ? [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)).find((d) => days.includes(weekdayOf(d))) ?? today
      : today;
  }
  result.autoSchedule = result.durationMin !== null && result.deadline !== null && result.time === null && result.kind === 'task';

  result.title = cleanTitle(sc.remainder()) || text.trim();
  result.tokens = sc.tokens.sort((a, b) => a.start - b.start);
  return result;
}

const EDGE_WORDS = '(?:el|la|los|las|a|al|de|del|para|y|e|en|on|at|the|by|for|to|a las|durante|por|con|-|–|,|:)';

function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim();
  const lead = new RegExp(`^${EDGE_WORDS}\\s+`, 'i');
  const trail = new RegExp(`\\s+${EDGE_WORDS}$`, 'i');
  for (let i = 0; i < 4; i++) t = t.replace(lead, '').replace(trail, '').replace(/[,;:\-–\s]+$/, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}
