/**
 * Orbit · intérprete de peticiones.
 *
 * Orbit es el asistente de Ember y funciona en local, sin conexión y sin modelos en la nube:
 * entiende frases habituales en español e inglés y las convierte en una intención. Este
 * módulo solo INTERPRETA; las habilidades (`skills.ts`) calculan propuestas y la app las
 * enseña para que el usuario las acepte, las edite o las descarte.
 *
 *   "planifica mi día, nada después de las 20 y prioriza marketing" → plan con restricciones
 *   "estoy saturado"                                                 → aligerar el día
 *   "desglosa la mudanza para el 30 de noviembre"                    → fases con fechas
 *   "convierte la nota Ideas para Ceniza en tareas"                  → notas → tareas
 *   "tengo que llamar al banco, comprar pan mañana y enviar el informe" → varias tareas
 *   "resume mi semana", "¿cómo voy con el EP?", "¿qué hago ahora?"
 */
import { cleanCommand, parseCommand, type CommandIntent } from '../commands';
import { addDays } from '../dates';
import { normalizeText, parseInput } from '../nlp';
import type { PlanStrategy } from '../scheduler';
import type { LocalDate, LocalTime } from '../types';
import { looksLikeList } from './extract';

export interface PlanConstraints {
  /** No empezar antes de esta hora. */
  start: LocalTime | null;
  /** No acabar después de esta hora. */
  end: LocalTime | null;
  /** Tope de minutos de tareas ("solo tengo 3 horas"). */
  budgetMin: number | null;
  strategy: PlanStrategy | null;
  /** Palabras que priorizar ("prioriza marketing", "sobre todo el EP"). */
  focus: string[];
  /** Margen entre bloques ("con descansos de 10 min"). */
  breakMin: number | null;
  /** Día tranquilo: llenar como mucho la mitad del tiempo libre. */
  light: boolean;
}

export type OrbitIntent =
  | { type: 'help' }
  | { type: 'plan'; date: LocalDate; constraints: PlanConstraints }
  | { type: 'lighten'; date: LocalDate }
  | { type: 'breakdown'; subject: string; deadline: LocalDate | null }
  | { type: 'noteTasks'; query: string }
  | { type: 'dump'; text: string }
  | { type: 'week'; offset: 0 | -1 }
  | { type: 'status'; query: string }
  | { type: 'whatNow' }
  | { type: 'command'; intent: CommandIntent }
  | { type: 'unknown'; text: string };

export const emptyConstraints = (): PlanConstraints => ({ start: null, end: null, budgetMin: null, strategy: null, focus: [], breakMin: null, light: false });

const hhmm = (h: number, m = 0): LocalTime => `${String(Math.max(0, Math.min(23, h))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, m))).padStart(2, '0')}`;

/** "las 8", "las 20:30", "8 de la tarde", "8pm", "mediodía". */
function timeAt(raw: string): LocalTime | null {
  const s = raw.trim();
  if (/^(mediodia|noon)\b/.test(s)) return '12:00';
  if (/^(medianoche|midnight)\b/.test(s)) return '00:00';
  const m = /^(?:las?\s+|the\s+)?(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche|h)?\b/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 24 || min > 59) return null;
  const suffix = m[3] ?? '';
  if ((suffix === 'pm' || suffix === 'de la tarde' || suffix === 'de la noche') && h < 12) h += 12;
  if ((suffix === 'am' || suffix === 'de la manana') && h === 12) h = 0;
  // "nada después de las 8" casi siempre es por la tarde-noche si no hay más pistas.
  return hhmm(h === 24 ? 0 : h, min);
}

const NUMBER_WORDS: Record<string, string> = { un: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };

function minutesOf(text: string): number | null {
  const raw = text.replace(/\b(una?|dos|tres|cuatro|cinco|seis|one|two|three|four|five|six)\s+(?=(?:h|horas?|hours?)\b)/g, (_, w: string) => `${NUMBER_WORDS[w]} `);
  if (/^\s*1\s+hora y media\b/.test(raw)) return 90;
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h|horas?|hours?|hrs?)\b/.exec(raw);
  if (h) return Math.round(parseFloat(h[1].replace(',', '.')) * 60) + (/\by\s+media\b|\band a half\b/.test(raw) ? 30 : 0);
  if (/\bhora y media\b|\ban hour and a half\b/.test(raw)) return 90;
  if (/\bmedia hora\b|\bhalf an hour\b/.test(raw)) return 30;
  if (/\buna hora\b|\ban hour\b|\bone hour\b/.test(raw)) return 60;
  const m = /(\d+)\s*(?:m|min|mins|minutos?|minutes?)\b/.exec(raw);
  return m ? +m[1] : null;
}

/** Lee las restricciones de una petición de planificación. */
export function parseConstraints(text: string): PlanConstraints {
  const s = normalizeText(text);
  const c = emptyConstraints();
  let m: RegExpExecArray | null;
  const T = String.raw`(?:las?\s+)?\d{1,2}(?:[:.h]\d{2})?\s*(?:am|pm|de la manana|de la tarde|de la noche|h)?|mediodia|noon`;
  if ((m = new RegExp(String.raw`\b(?:nada|no (?:quiero )?(?:nada|trabajar|hacer nada))\s+(?:despues|mas tarde|a partir)\s+de\s+(${T})`).exec(s))) c.end = timeAt(m[1]);
  else if ((m = new RegExp(String.raw`\b(?:hasta|antes de|termin(?:o|ar|a) a|acab(?:o|ar|a) a|salgo a|until|before|nothing after|done by|finish by)\s+(?:the\s+)?(${T})`).exec(s))) c.end = timeAt(m[1]);
  if ((m = new RegExp(String.raw`\b(?:empiez[oa]|empezar|empezando|empecemos|desde|a partir de|despues de|no antes de|arranco|arrancar|from|after|not before|start(?:ing)? at)\s+(?:a\s+|at\s+)?(${T})`).exec(s))) {
    // "nada después de las 20" ya es un límite final, no un inicio.
    if (!/\b(nada|nothing)\s+(despues|after)\b/.test(s.slice(Math.max(0, m.index - 12), m.index + m[0].length))) c.start = timeAt(m[1]);
  }
  if ((m = /\b(?:solo tengo|tengo solo|tengo|maximo|como mucho|no mas de|un maximo de|only have|i have|max(?:imum)?|at most|no more than)\s+((?:\d+(?:[.,]\d+)?\s*(?:h|horas?|hours?|hrs?|m|min|mins|minutos?|minutes?)(?:\s+y\s+media)?)|(?:una\s+)?hora(?: y media)?|(?:dos|tres|cuatro|cinco|seis|two|three|four|five|six)\s+(?:horas|hours)|media hora|an hour(?: and a half)?|half an hour)\b/.exec(s))) c.budgetMin = minutesOf(m[1]);
  if (/\b(primero lo (dificil|duro|importante|largo|gordo)|lo (dificil|duro) primero|trabajo profundo primero|deep (work )?first|hardest first|eat the frog|cometer?me la rana)\b/.test(s)) c.strategy = 'deep_first';
  else if (/\b(victorias rapidas|lo (facil|rapido|corto) primero|primero lo (facil|rapido|corto)|cosas rapidas|tareas rapidas|quick wins|easy first)\b/.test(s)) c.strategy = 'quick_wins';
  if ((m = /\b(?:descansos?|pausas?|margen|respiro|breaks?|buffer)\s+(?:de\s+|of\s+)?(\d+)\s*(?:m|min|mins|minutos?|minutes?)\b/.exec(s)) || (m = /\b(?:deja|dejar|leave)\s+(\d+)\s*(?:m|min|mins|minutos?|minutes?)\s+(?:entre|between)\b/.exec(s))) c.breakMin = Math.min(60, +m[1]);
  else if (/\bcon (descansos|pausas)\b|\bwith breaks\b/.test(s)) c.breakMin = 10;
  if (/\b(tranquilo|suave|ligero|relajado|sin agobios|con calma|light|easy day|chill)\b/.test(s)) c.light = true;
  const focusRe = /\b(?:prioriza(?:ndo)?|priorizar|centrad[oa] en|centrame en|centrarme en|sobre todo|enfocad[oa] en|me centro en|prioritize|focus on|mostly)\s+(?:en\s+|el\s+|la\s+|los\s+|las\s+|lo de\s+|mi\s+|the\s+|my\s+)*([\p{L}\p{N} '"-]+?)(?=\s*(?:,|;|\by\b|\band\b|\bnada\b|\bhasta\b|\bantes\b|\bdesde\b|\bcon\b|$))/gu;
  while ((m = focusRe.exec(s))) {
    const word = m[1].trim();
    if (word && !/^(lo (dificil|facil|importante)|primero)$/.test(word)) c.focus.push(word);
  }
  return c;
}

const PLAN_VERB = String.raw`(?:planifica|planificar|planificame|planea|planear|organiza|organizar|organizame|ordena|ordename|ordenar|monta|montame|arma|armame|prepara|preparame|plan|schedule|organize)`;
const DAY_WORD = String.raw`(?:dia|jornada|hoy|manana|pasado manana|tarde|day|today|tomorrow|afternoon|lunes|martes|miercoles|jueves|viernes|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;

/** Fecha mencionada: "mañana", "pasado mañana", "el viernes"… */
function dateMention(s: string, today: LocalDate): LocalDate | null {
  if (/\b(pasado manana|day after tomorrow)\b/.test(s)) return addDays(today, 2);
  if (/\b(hoy|today|esta tarde|this afternoon)\b/.test(s)) return today;
  return parseInput(s.replace(/\b(nada|hasta|antes|despues|desde|a partir)\b.*$/, ''), { today }).date;
}

/** Recupera un fragmento con sus tildes y mayúsculas originales ("japon" → "Japón"). */
function original(raw: string, fragment: string): string {
  const i = normalizeText(raw).indexOf(fragment);
  return i >= 0 ? raw.slice(i, i + fragment.length) : fragment;
}

function stripLead(s: string): string {
  return s.replace(/^(?:el|la|los|las|mi|mis|un|una|del|de la|el proyecto|mi proyecto|proyecto|the|my|a|project)\s+/g, '').replace(/^(?:proyecto|project)\s+/, '').trim();
}

export interface OrbitParseContext {
  today: LocalDate;
  /** Nombre del asistente (por si el usuario lo usa como saludo: "Orbit, …"). */
  name?: string;
}

export function parseOrbit(raw: string, ctx: OrbitParseContext): OrbitIntent {
  const { today } = ctx;
  const text = raw.trim();
  if (!text) return { type: 'unknown', text };
  const nameRe = ctx.name ? new RegExp(`^\\s*(?:${normalizeText(ctx.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|orbit)\\b[\\s,:]*`) : /^\s*orbit\b[\s,:]*/;
  const firstLine = text.split('\n')[0];
  const s = cleanCommand(firstLine).replace(nameRe, '').trim();
  let m: RegExpExecArray | null;

  // Varias líneas: es una lista que vaciar en tareas (salvo que la primera línea sea una orden).
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length >= 2 && !/^(convierte|pasa|saca|extrae|resume|desglosa|divide|planifica|organiza|convert|extract|summari[sz]e|break)/.test(s)) return { type: 'dump', text };

  if (!s) return { type: 'help' };
  if (/^(ayuda|help|hola|buenas|hey|hi|hello|que (puedes|sabes) hacer|que haces|como funcionas|que eres|quien eres|what can you do|who are you)$/.test(s)) return { type: 'help' };

  // Aligerar el día
  if (/\b(aligera|aligerar|alivia|aliviar|descarga|descargar|desahoga|vacia|liberame|libera mi|estoy (muy )?(saturad[oa]|agobiad[oa]|desbordad[oa]|estresad[oa]|a tope|reventad[oa]|quemad[oa])|tengo demasiad[oa]s?|demasiadas cosas|demasiado para|no llego|no me da (la vida|tiempo)|no me va a dar tiempo|lighten|overwhelmed|too much (on|for)|i can t do it all)\b/.test(s)) {
    return { type: 'lighten', date: dateMention(s, today) ?? today };
  }

  // Resumen de la semana
  if (/\b(resume|resumen|resumeme|resumir|repasa|balance|como (fue|ha ido|va|me fue|me ha ido|llevo)|que tal (fue|ha ido|va))\b.*\b(semana|week)\b|\b(summari[sz]e|recap|how was|how is|how s)\b.*\bweek\b|^(mi semana|semana|weekly recap|my week)$/.test(s)) {
    return { type: 'week', offset: /\b(pasada|anterior|last|previous)\b/.test(s) ? -1 : 0 };
  }

  // Notas → tareas
  if ((m = /\b(?:convierte|convertir|pasa|pasar|saca|sacar|extrae|extraer|transforma|transformar|haz tareas|crea tareas|convert|turn|extract|make tasks)\b.*?\b(?:nota|apuntes|note|notes)\b\s*(.*)$/.exec(s))) {
    const q = m[1]
      .replace(/^(?:de|llamada|titulada|que se llama|sobre|:|called|named|titled)\s+/g, '')
      .replace(/\s+(?:en|a|into|to)\s+(?:tareas|tasks)$/, '')
      .replace(/^["'«]|["'»]$/g, '')
      .trim();
    return { type: 'noteTasks', query: q };
  }

  // Planificar el día (con o sin restricciones)
  if ((m = new RegExp(String.raw`^(?:ayudame a |puedes |podrias |quiero |vamos a |help me )?${PLAN_VERB}(?:me|nos)?(?:\s+(?:mi|el|la|my|the|this))?\s*(.*)$`).exec(s))) {
    const rest = m[1].trim();
    // Aún no hay planificación semanal: "organiza mi semana" empieza por hoy.
    if (/^(?:la\s+|esta\s+)?(?:semana|week)\b/.test(rest)) return { type: 'plan', date: today, constraints: parseConstraints(rest) };
    const restNoDay = rest.replace(new RegExp(String.raw`^(?:(?:de\s+)?${DAY_WORD}\s*)+`), '').replace(/^[,:;]\s*/, '');
    const hasDay = new RegExp(String.raw`^(?:de\s+)?${DAY_WORD}\b`).test(rest) || rest === '';
    const constraints = parseConstraints(rest);
    const anyConstraint = constraints.start || constraints.end || constraints.budgetMin || constraints.strategy || constraints.focus.length || constraints.breakMin || constraints.light;
    if (hasDay || anyConstraint) return { type: 'plan', date: dateMention(rest, today) ?? today, constraints };
    // "organiza la mudanza" → desglosar un proyecto
    const subject = stripLead(restNoDay);
    if (subject) {
      const p = parseInput(original(text, subject), { today });
      return { type: 'breakdown', subject: p.title || subject, deadline: p.deadline ?? p.date };
    }
  }

  // Desglosar un proyecto
  if ((m = /^(?:desglosa|desglosar|desglosame|divide|dividir|divideme|trocea|trocear|descompon|descomponer|parte|partir|ayudame (?:a empezar|con)|como (?:empiezo|ataco|abordo|arranco)(?: con)?|por donde empiezo con|haz(?:me)? un plan (?:para|de)|crea un plan (?:para|de)|break down|split up|split|plan out|help me (?:start|with)|how do i start)\s+(.+)$/.exec(s))) {
    const subject = stripLead(m[1].replace(/\s+en\s+(?:fases|pasos|tareas)\b/, ''));
    const p = parseInput(original(text, subject), { today });
    return { type: 'breakdown', subject: p.title || subject, deadline: p.deadline ?? p.date };
  }

  // ¿Qué hago ahora?
  if (/^(que (hago|deberia hacer|me toca|puedo hacer)( ahora)?( mismo)?|por donde (empiezo|sigo)|en que me (centro|pongo)|que es lo mas importante( ahora)?|what should i (do|work on)( now| next)?|where do i start)$/.test(s)) return { type: 'whatNow' };

  // ¿Cómo voy con…?
  if ((m = /^(?:como|que tal)\s+(?:voy|vamos|va|van|llevo|lo llevo)\s+(?:con\s+|en\s+)?(?!(?:mis?\s+|la\s+|las\s+)?rachas?\b)(?:el\s+|la\s+|los\s+|las\s+|mi\s+|mis\s+)?(.+)$/.exec(s)) || (m = /^(?:how am i doing|how s it going|how is it going|progress)\s+(?:with|on)\s+(?:the\s+|my\s+)?(.+)$/.exec(s))) {
    return { type: 'status', query: stripLead(m[1]) };
  }

  // Comandos de la paleta (navegar, focus, agenda, rachas…)
  const command = parseCommand(firstLine, { today });
  if (command) return { type: 'command', intent: command };

  // "tengo que…", "recuérdame…" o una lista separada por comas → tareas
  if (/^(tengo que|tengo pendiente|necesito|hay que|debo|deberia|recuerdame|apunta|anota|apuntame|anotame|no olvides|i need to|i have to|i must|remind me to|note down|add)\b/.test(s) || looksLikeList(firstLine)) return { type: 'dump', text };

  return { type: 'unknown', text };
}
