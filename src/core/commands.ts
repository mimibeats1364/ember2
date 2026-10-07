/**
 * Comandos de Ember: frases cortas en español (o inglés) que la paleta ⌘K entiende sin IA y sin
 * conexión. Este módulo solo INTERPRETA el texto; ejecutar o responder lo hace la app, y las
 * acciones que cambian datos siempre se confirman con Intro y se pueden deshacer.
 *
 *   "qué tengo mañana"             → agenda de mañana
 *   "mueve las atrasadas a mañana" → reprogramar (con vista previa)
 *   "empieza focus 50 min en informe"
 *   "racha de meditar", "tema océano", "abre hábitos"…
 */
import { addDays } from './dates';
import { normalizeText, parseInput } from './nlp';
import type { LocalDate, ThemeId } from './types';

export type CommandScreen =
  | 'today'
  | 'inbox'
  | 'tasks'
  | 'calendar'
  | 'habits'
  | 'routines'
  | 'focus'
  | 'goals'
  | 'projects'
  | 'notes'
  | 'insights'
  | 'review'
  | 'learn'
  | 'settings';

export type CommandIntent =
  | { type: 'help' }
  | { type: 'go'; screen: CommandScreen }
  | { type: 'theme'; theme: ThemeId }
  | { type: 'focusStart'; minutes: number | null; deep: boolean; task: string | null }
  | { type: 'focusPause' }
  | { type: 'focusResume' }
  | { type: 'focusStop' }
  | { type: 'routine'; query: string }
  | { type: 'moveOverdue'; date: LocalDate }
  | { type: 'planDay'; date: LocalDate }
  | { type: 'overdue' }
  | { type: 'free'; date: LocalDate }
  | { type: 'focusStats'; period: 'today' | 'week' | 'month' }
  | { type: 'streak'; habit: string }
  | { type: 'next' }
  | { type: 'agendaWeek' }
  | { type: 'agenda'; date: LocalDate }
  | { type: 'complete'; query: string; prefer: 'task' | 'habit' | null };

export type CommandType = CommandIntent['type'];

const SCREENS: [RegExp, CommandScreen][] = [
  [/^(hoy|today|inicio|home)$/, 'today'],
  [/^(bandeja|bandeja de entrada|inbox)$/, 'inbox'],
  [/^(tareas|lista de tareas|tasks|todo|to-do)$/, 'tasks'],
  [/^(calendario|agenda|calendar)$/, 'calendar'],
  [/^(habitos|habits)$/, 'habits'],
  [/^(rutinas|routines)$/, 'routines'],
  [/^(focus|foco|concentracion|pomodoro|temporizador|timer)$/, 'focus'],
  [/^(objetivos|metas|goals)$/, 'goals'],
  [/^(proyectos|projects)$/, 'projects'],
  [/^(notas|notes|ideas)$/, 'notes'],
  [/^(estadisticas|stats|insights|analiticas|progreso)$/, 'insights'],
  [/^(revision|revision semanal|reflexion|diario|review|journal)$/, 'review'],
  [/^(aprende|tutorial|guia|ayuda de ember|learn|guide)$/, 'learn'],
  [/^(ajustes|configuracion|preferencias|settings|preferences)$/, 'settings'],
];

const THEMES: [RegExp, ThemeId][] = [
  [/^(ember|brasa|brasas|naranja|por defecto|default)$/, 'ember'],
  [/^(midnight|medianoche|azul|noche)$/, 'midnight'],
  [/^(cosmic|cosmico|cosmos|violeta|morado)$/, 'cosmic'],
  [/^(forest|bosque|verde)$/, 'forest'],
  [/^(ocean|oceano|mar|cian)$/, 'ocean'],
  [/^(minimal|minimalista|minimo|sobrio)$/, 'minimal'],
  [/^(light|claro|blanco|dia)$/, 'light'],
  [/^(oled|negro|negro puro|black)$/, 'oled'],
  [/^(oscuro|dark)$/, 'ember'],
];

const ART = String.raw`(?:el|la|los|las|un|una|mi|mis|al|del|the|my|a)`;

/** Limpia saludos, signos y cortesías: "¿Oye Ember, qué tengo mañana?" → "que tengo manana". */
export function cleanCommand(text: string): string {
  return normalizeText(text)
    .replace(/[¿?¡!.,;'’]+/g, ' ')
    .replace(/^\s*(oye|hey|ember|ok|vale|porfa|por favor|please)\b[\s,]*/g, '')
    .replace(/^\s*(ember)\b[\s,]*/g, '')
    .replace(/\s+(por favor|porfa|please)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fecha mencionada en un trozo de texto ("mañana", "el viernes", "3 de mayo"…). */
function dateIn(fragment: string, today: LocalDate): LocalDate | null {
  if (!fragment.trim()) return null;
  if (/\b(pasado manana|day after tomorrow)\b/.test(fragment)) return addDays(today, 2);
  return parseInput(fragment, { today }).date;
}

function minutesIn(s: string): number | null {
  const h = /(\d+(?:[.,]\d+)?)\s*(h|hora|horas|hour|hours|hr|hrs)\b/.exec(s);
  const m = /(\d+)\s*(m|min|mins|minuto|minutos|minute|minutes)?\b/.exec(s);
  if (h) return Math.round(parseFloat(h[1].replace(',', '.')) * 60) + (/\by\s+(media|30)\b/.test(s) ? 30 : 0);
  if (/\bhora y media\b/.test(s)) return 90;
  if (/\bmedia hora\b|\bhalf an hour\b/.test(s)) return 30;
  if (/\buna hora\b|\ban hour\b/.test(s)) return 60;
  if (m) return Math.max(1, Math.min(360, parseInt(m[1], 10)));
  return null;
}

export function parseCommand(text: string, opts: { today: LocalDate }): CommandIntent | null {
  const { today } = opts;
  const s = cleanCommand(text);
  if (!s || s.length > 120) return null;
  let m: RegExpExecArray | null;

  // Ayuda
  if (/^(ayuda|help|comandos|commands|que (puedo|se puede) (decir|hacer|escribir|pedir)( aqui)?|what can i (say|do|type))$/.test(s)) return { type: 'help' };

  // Tema
  if ((m = new RegExp(String.raw`^(?:pon|poner|cambia|cambiar|usa|usar|activa|switch to|use|set)?\s*(?:${ART}\s+)?(?:tema|theme|modo|mode)\s+(?:a\s+|to\s+)?(.+)$`).exec(s))) {
    const name = m[1].trim();
    for (const [re, theme] of THEMES) if (re.test(name)) return { type: 'theme', theme };
  }

  // Focus: pausa / reanuda / detén
  if (/^(pausa|pausar|pause)(\s+(el\s+)?(focus|foco|pomodoro|temporizador|timer|sesion))?$/.test(s)) return { type: 'focusPause' };
  if (/^(reanuda|reanudar|continua|continuar|sigue|seguir|resume|continue)(\s+(el\s+)?(focus|foco|pomodoro|temporizador|timer|sesion))$/.test(s) || /^(reanuda|reanudar|resume)$/.test(s)) return { type: 'focusResume' };
  if (/^(para|parar|deten|detener|termina|terminar|acaba|acabar|finaliza|finalizar|stop|end|finish)\s+(el\s+|la\s+)?(focus|foco|pomodoro|temporizador|timer|sesion( de focus)?)$/.test(s)) return { type: 'focusStop' };

  // Focus: empezar
  const focusWord = String.raw`(?:sesion de (?:focus|foco)|bloque de (?:focus|foco)|focus|foco|pomodoro|trabajo profundo|deep work|concentracion)`;
  if (
    (m = new RegExp(String.raw`^(?:empieza|empezar|empezemos|inicia|iniciar|arranca|arrancar|comienza|comenzar|haz|hacer|pon|poner|start|begin|do)\s+(?:${ART}\s+)?(${focusWord})(.*)$`).exec(s)) ||
    (m = new RegExp(String.raw`^(${focusWord})(\s+(?:de\s+)?\d.*|\s+(?:en|con|para|sobre|on|for)\s+.*)$`).exec(s))
  ) {
    const kind = m[1];
    let rest = (m[2] ?? '').trim();
    let task: string | null = null;
    const tm = /(?:^|\s)(?:en|con|para|sobre|on|for)\s+(?:la tarea\s+|the task\s+)?(.+)$/.exec(rest);
    if (tm) {
      task = tm[1].trim();
      rest = rest.slice(0, tm.index).trim();
    }
    const deep = /profundo|deep/.test(kind) || /profundo|deep/.test(rest);
    return { type: 'focusStart', minutes: minutesIn(rest), deep, task: task || null };
  }

  // Rutinas
  if ((m = new RegExp(String.raw`^(?:empieza|empezar|inicia|iniciar|arranca|arrancar|comienza|comenzar|haz|hacer|abre|abrir|start|run|open|do)\s+(?:${ART}\s+)?rutina(?:\s+(?:de|del|de la|para)\s+|\s+)?(.*)$`).exec(s)) || (m = /^rutina(?:\s+(?:de|del|de la|para)\s+|\s+)?(.*)$/.exec(s)) || (m = /^(?:start|run)\s+(?:my\s+|the\s+)?(.*?)\s*routine$/.exec(s))) {
    return { type: 'routine', query: m[1].trim() };
  }

  // Navegación
  if ((m = new RegExp(String.raw`^(?:abre|abrir|ve|ir|vete|vamos|llevame|muestra|muestrame|ensename|open|go|show|take me)(?:\s+(?:a|al|a la|to))?(?:\s+${ART})?\s+(.+)$`).exec(s))) {
    const target = m[1].trim();
    for (const [re, screen] of SCREENS) if (re.test(target)) return { type: 'go', screen };
  }
  for (const [re, screen] of SCREENS) if (re.test(s)) return { type: 'go', screen };

  // Mover atrasadas
  if ((m = /^(?:mueve|mover|pasa|pasar|lleva|llevar|reprograma|reprogramar|move|reschedule|push)\s+(?:todas\s+|todo\s+|all\s+)?(?:las\s+|mis\s+|lo\s+|my\s+|the\s+)?(?:tareas\s+)?(?:atrasadas|atrasado|vencidas|pendientes atrasadas|overdue)(?:\s+tasks)?(?:\s+(?:a|al|para|hasta|to)\s+(.+))?$/.exec(s))) {
    return { type: 'moveOverdue', date: dateIn(m[1] ?? '', today) ?? today };
  }

  // Planificar
  if ((m = /^(?:planifica|planificar|planea|planear|organiza|organizar|plan|planifiquemos|organicemos)(?:me)?(?:\s+(?:mi|el|my|the))?(?:\s+(?:dia|jornada|day))?(?:\s+(?:de|del|for))?(?:\s+(.+))?$/.exec(s))) {
    const rest = (m[1] ?? '').trim();
    const date = dateIn(rest, today);
    // "planifica la fiesta de Ana" es una tarea, no un comando.
    if (rest && !date) return null;
    return { type: 'planDay', date: date ?? today };
  }

  // Atrasadas
  if (/\b(atrasad[ao]s?|vencid[ao]s?|overdue|se me ha pasado|se me paso|llego tarde)\b/.test(s)) return { type: 'overdue' };

  // Tiempo libre
  if (/\b(tiempo libre|huecos?(\s+libres?)?|hueco libre|estoy libre|tengo libre|free time|free slots?|am i free|when am i free)\b/.test(s)) {
    return { type: 'free', date: dateIn(s.replace(/\b(tiempo libre|huecos?|libres?|tengo|cuanto|cuando|estoy|que)\b/g, ' '), today) ?? today };
  }

  // Estadísticas de focus
  if (/\b(cuanto|cuantas|cuantos|how much|how many)\b.*\b(focus|foco|enfocad[oa]|concentrad[oa]|concentracion|pomodoros?|horas de trabajo profundo|focused)\b/.test(s) || /^(?:mi\s+|my\s+)?(?:tiempo de |horas de )?(?:focus|foco)\s+(?:de\s+)?(hoy|esta semana|este mes|today|this week|this month)$/.test(s)) {
    const period = /\b(mes|month)\b/.test(s) ? 'month' : /\b(semana|week)\b/.test(s) ? 'week' : 'today';
    return { type: 'focusStats', period };
  }

  // Rachas
  if ((m = /^(?:como (?:va|van)\s+)?(?:mi|mis|my)?\s*(?:rachas|racha|streaks|streak)(?:\s+(?:de|del|en|con|of|for))?\s*(.*)$/.exec(s))) {
    return { type: 'streak', habit: m[1].trim() };
  }

  // Lo siguiente
  if (/^(que (viene|toca|sigue|tengo)( ahora| despues| luego| a continuacion)?|que es lo siguiente|lo siguiente|siguiente|proximo|proxima|proximo evento|proxima reunion|siguiente evento|siguiente tarea|whats next|what s next|next|next event|up next)$/.test(s) && !/que tengo$/.test(s)) {
    return { type: 'next' };
  }

  // Agenda
  const agenda = /^(?:que|what)\s+(?:tengo|hay|me toca|me queda|tengo que hacer|tengo pendiente|do i have|is on|s on)\b(.*)$|^(?:mi\s+|my\s+)?(?:agenda|dia|plan|schedule|day)\b(.*)$|^como (?:es|sera|va|viene) (?:mi|el) dia\b(.*)$/.exec(s);
  if (agenda) {
    const rest = (agenda[1] ?? agenda[2] ?? agenda[3] ?? '').trim();
    if (/\b(semana|week)\b/.test(rest)) return { type: 'agendaWeek' };
    return { type: 'agenda', date: dateIn(rest, today) ?? today };
  }

  // Completar tarea o registrar hábito
  if ((m = /^(?:completa|completar|termina|terminar|acaba|acabar|cierra|tacha|marca como hecha|marca como hecho|he terminado|he acabado|ya termine|ya acabe|done|complete|finish|finished|check off)\s+(?:la tarea\s+|el habito\s+|the task\s+)?(.+)$/.exec(s))) {
    return { type: 'complete', query: m[1].trim(), prefer: 'task' };
  }
  if ((m = /^(?:marca|marcar|registra|registrar|hice|he hecho|ya hice|apunta que hice|log|track)\s+(?:el habito\s+|mi habito\s+|the habit\s+)?(.+)$/.exec(s))) {
    return { type: 'complete', query: m[1].trim(), prefer: 'habit' };
  }

  return null;
}

/** Frases de ejemplo por tipo (las usa el tutorial y las prueban los tests). */
export const COMMAND_EXAMPLES: Record<CommandType, string[]> = {
  help: ['ayuda', 'qué puedo decir'],
  go: ['abre hábitos', 've al calendario', 'ajustes'],
  theme: ['tema océano', 'modo claro', 'pon el tema bosque'],
  focusStart: ['empieza focus', 'empieza focus 50 min en informe', 'trabajo profundo 90 minutos', 'pomodoro 25'],
  focusPause: ['pausa', 'pausa el focus'],
  focusResume: ['reanuda el focus'],
  focusStop: ['detén el focus', 'termina la sesión'],
  routine: ['empieza la rutina de mañana', 'rutina de noche'],
  moveOverdue: ['mueve las atrasadas a mañana', 'pasa las tareas atrasadas a hoy'],
  planDay: ['planifica mi día', 'planifica mañana'],
  overdue: ['qué tengo atrasado', 'tareas vencidas'],
  free: ['cuánto tiempo libre tengo hoy', 'huecos libres mañana'],
  focusStats: ['cuánto he enfocado esta semana', 'cuántos pomodoros llevo hoy'],
  streak: ['racha de meditar', 'cómo van mis rachas'],
  next: ['qué viene ahora', 'próximo evento'],
  agendaWeek: ['qué tengo esta semana'],
  agenda: ['qué tengo hoy', 'qué tengo mañana', 'qué hay el viernes', 'mi agenda'],
  complete: ['completa comprar pan', 'marca meditar', 'hice ejercicio'],
};
