/**
 * Orbit · extraer tareas de texto libre.
 *
 * Dos usos:
 * - "Vaciar la cabeza": "tengo que llamar al banco, comprar pan mañana y enviar el informe
 *   antes del viernes" → tres tareas, cada una con su fecha, duración o prioridad.
 * - Notas → tareas: casillas sin marcar, viñetas y líneas que empiezan por un verbo.
 *
 * Es deliberadamente conservador: "comprar pan, leche y huevos" es UNA tarea. Solo se corta
 * por comas o "y" cuando lo que sigue empieza por un verbo.
 */
import { normalizeText, parseInput, type ParsedInput } from '../nlp';
import type { LocalDate } from '../types';

/** Verbos frecuentes en imperativo o que no acaban en -ar/-er/-ir. */
const VERBS_ES = new Set(
  'llama compra envia manda escribe revisa prepara reserva paga lee estudia termina acaba haz pide busca mira contesta responde sube graba practica ve organiza limpia arregla actualiza recoge lleva trae devuelve renueva pregunta confirma cancela imprime firma entrega repasa apunta habla queda saca pon ordena descarga instala elige decide planifica investiga diseña disena crea publica comparte'.split(' '),
);
const NOT_VERBS_ES = new Set('lugar hogar mujer ayer azucar altar collar dolar militar familiar popular regular singular particular similar alfiler taller cancer caracter placer poder deber ser mar bar par por'.split(' '));
const VERBS_EN = new Set(
  'call buy send email write review prepare book pay read study finish do make get pick go ask check clean fix schedule plan order return renew confirm cancel print sign submit practice practise record upload download install choose decide research design create publish share text reply answer meet visit water walk feed organize organise update tidy wash cook bring take'.split(' '),
);
const LEADS = /^(?:tengo que|tengo pendiente|necesito|hay que|debo|deberia|recuerdame|recuerda|apunta|anota|apuntame|anotame|no olvides|no te olvides de|i need to|i have to|i must|remind me to|don t forget to|note down|add)\s+/;

function firstWord(s: string): string {
  return normalizeText(s.trim()).replace(/^[^\p{L}]+/u, '').split(/\s+/)[0] ?? '';
}

/** ¿Empieza por un verbo? (infinitivo español con o sin pronombre, imperativo común o verbo inglés) */
export function startsWithVerb(s: string): boolean {
  const w = firstWord(s);
  if (w.length < 2) return false;
  if (VERBS_ES.has(w) || VERBS_EN.has(w)) return true;
  if (NOT_VERBS_ES.has(w)) return false;
  return /^\p{L}{2,}(?:ar|er|ir)(?:me|te|se|lo|la|le|los|las|les|nos)?$/u.test(w);
}

/** Quita "tengo que", "recuérdame"… del principio (respetando tildes y mayúsculas). */
function stripLead(s: string): string {
  const t = s.trim();
  const m = LEADS.exec(normalizeText(t));
  return m ? t.slice(m[0].length) : t;
}

/** Corta una frase en acciones independientes. */
export function splitActions(line: string): string[] {
  const text = stripLead(line.trim().replace(/[.;]+$/, ''));
  const n = normalizeText(text);
  const parts: string[] = [];
  // Separadores candidatos: ";", ",", " y ", " e ", " and ", " luego ", " después ", " también ".
  const sep = /\s*;\s*|\s*,\s*(?:y\s+|and\s+|luego\s+|then\s+)?|\s+(?:y luego|y despues|y tambien|luego|despues|ademas|tambien|and then|then|also)\s+|\s+(?:y|e|and)\s+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = sep.exec(n))) {
    // Solo se corta si lo siguiente es otra acción (empieza por verbo).
    if (!startsWithVerb(stripLead(text.slice(m.index + m[0].length)))) continue;
    parts.push(text.slice(last, m.index));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.map((p) => stripLead(p)).filter((p) => p.length >= 2);
}

/** Heurística para frases de una línea que parecen una lista de cosas por hacer. */
export function looksLikeList(line: string): boolean {
  const pieces = splitActions(line);
  return pieces.length >= 3 || (pieces.length === 2 && pieces.every(startsWithVerb));
}

const BULLET = /^\s*(?:[-*•–]|\d+[.)]|[a-z][.)])\s+/i;
const CHECK_OPEN = /^\s*(?:[-*]\s+)?\[\s\]\s+/;
const CHECK_DONE = /^\s*(?:[-*]\s+)?\[[xX✓]\]\s+/;
const TODO = /^\s*(?:todo|to-do|pendiente|por hacer|accion|acción|action|next)\s*[:\-–]\s*/i;

export interface ExtractedItem {
  text: string;
  parsed: ParsedInput;
}

/**
 * Extrae acciones de un texto. `mode: 'note'` es más estricto (solo casillas, TODO: o líneas
 * con verbo); `mode: 'dump'` trata cada línea o fragmento como algo por hacer.
 */
export function extractActions(body: string, opts: { today: LocalDate; projects?: string[]; mode: 'note' | 'dump' }): ExtractedItem[] {
  const raw = body.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  let inCode = false;
  const hasChecks = raw.some((l) => CHECK_OPEN.test(l));
  for (const l of raw) {
    if (/^\s*```/.test(l)) {
      inCode = !inCode;
      continue;
    }
    if (inCode || !l.trim()) continue;
    if (/^\s*#/.test(l) || /^\s*>/.test(l) || CHECK_DONE.test(l)) continue;
    if (/^\s*(https?:\/\/\S+)\s*$/.test(l)) continue;
    if (CHECK_OPEN.test(l)) {
      lines.push(l.replace(CHECK_OPEN, ''));
      continue;
    }
    // En una nota con casillas, las casillas son las tareas; el resto es contexto.
    if (opts.mode === 'note' && hasChecks) continue;
    if (TODO.test(l)) {
      lines.push(l.replace(TODO, ''));
      continue;
    }
    const content = l.replace(BULLET, '').trim();
    if (/:\s*$/.test(content)) continue;
    if (opts.mode === 'note' && !startsWithVerb(stripLead(content))) continue;
    lines.push(content);
  }
  const items: ExtractedItem[] = [];
  const seen = new Set<string>();
  const one = lines.length === 1;
  for (const line of lines) {
    const pieces = one || opts.mode === 'dump' ? splitActions(line) : [line];
    for (const piece of pieces) {
      const clean = piece.replace(/\*\*|__|`/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1').trim();
      if (clean.length < 2 || clean.length > 200) continue;
      const parsed = parseInput(clean, { today: opts.today, projects: opts.projects });
      const title = capitalize((parsed.title || clean).replace(/\s+/g, ' ').trim());
      const key = normalizeText(title);
      if (!title || seen.has(key)) continue;
      seen.add(key);
      items.push({ text: clean, parsed: { ...parsed, title } });
    }
  }
  return items.slice(0, 30);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
