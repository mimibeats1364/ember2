/**
 * Contenido del tutorial "Aprende Ember" (en español).
 *
 * Este archivo es solo datos: lo usa la pantalla Aprende, lo verifican los tests (cada frase de
 * ejemplo se pasa por el analizador real) y lo convierte en docs/TUTORIAL.md el script
 * `npm run docs:tutorial`. Por eso no importa nada en tiempo de ejecución.
 *
 * Formato del texto: **negrita** y `tecla` (se muestra como tecla).
 */
import type { InputKind } from '../../core/nlp';
import type { CommandType } from '../../core/commands';

export type ModuleId = 'start' | 'capture' | 'plan' | 'focus' | 'habits' | 'organize' | 'reflect' | 'power' | 'mac';

export const MODULES: { id: ModuleId; title: string; icon: string }[] = [
  { id: 'start', title: 'Primeros pasos', icon: '🧭' },
  { id: 'capture', title: 'Capturar', icon: '⚡' },
  { id: 'plan', title: 'Planificar', icon: '🗓️' },
  { id: 'focus', title: 'Enfocarte', icon: '🎯' },
  { id: 'habits', title: 'Hábitos y rutinas', icon: '🔥' },
  { id: 'organize', title: 'Organizar', icon: '🗂️' },
  { id: 'reflect', title: 'Reflexionar', icon: '🌙' },
  { id: 'power', title: 'Comandos y atajos', icon: '⌨️' },
  { id: 'mac', title: 'Ember en tu Mac', icon: '💻' },
];

/** Atajo configurable: `pref` es la clave en Ajustes → Atajos y `keys` su valor por defecto. */
export interface LessonShortcut {
  keys: string;
  label: string;
  pref?: 'newTask' | 'focus' | 'habits' | 'calendar' | 'goals' | 'projects' | 'search' | 'toggleFocus' | 'today' | 'tasks';
}

export interface CaptureExample {
  text: string;
  /** Qué detecta Ember (se muestra en el tutorial). */
  result: string;
  kind: InputKind;
  /** Comprobaciones que hacen los tests con el analizador real. */
  check: {
    title?: string;
    /** Días desde hoy (0 = hoy, 1 = mañana). */
    dateIn?: number;
    time?: string;
    durationMin?: number;
    priority?: number;
    timesPerWeek?: number;
    weekdays?: number[];
    daily?: boolean;
    hasDeadline?: boolean;
    tags?: string[];
  };
}

export interface CommandExample {
  text: string;
  type: CommandType;
  result: string;
}

export interface LinkExample {
  url: string;
  type: 'capture' | 'open' | 'command' | 'focusStart' | 'focus';
  result: string;
}

export interface LessonStep {
  title: string;
  body: string;
}

export type LessonScreen = 'today' | 'inbox' | 'tasks' | 'calendar' | 'habits' | 'routines' | 'focus' | 'goals' | 'projects' | 'notes' | 'insights' | 'review' | 'settings' | 'learn';

export interface Lesson {
  id: string;
  module: ModuleId;
  icon: string;
  title: string;
  summary: string;
  minutes: number;
  steps: LessonStep[];
  shortcuts?: LessonShortcut[];
  capture?: CaptureExample[];
  commands?: CommandExample[];
  links?: LinkExample[];
  goTo?: { screen: LessonScreen; tab?: string; label: string };
  tour?: string;
}

export const LESSONS: Lesson[] = [
  // ── Primeros pasos ───────────────────────────────────────────────────────────────────
  {
    id: 'welcome',
    module: 'start',
    icon: '👋',
    title: 'Cómo funciona Ember',
    summary: 'Un ciclo sencillo: capturar, planificar, enfocarte, hacer y reflexionar.',
    minutes: 2,
    steps: [
      { title: 'Captura sin pensar', body: 'Todo lo que se te ocurra va a Ember en segundos: pulsa `N` o `⌘N`, escribe como hablas y pulsa `↵`. Si no tiene fecha, queda en la **Bandeja** para decidir después.' },
      { title: 'Planifica el día', body: 'En **Hoy** ves lo que toca: agenda, tareas, hábitos y tu objetivo principal. El botón **Planificar mi día** propone huecos para tus tareas; nada cambia hasta que aceptas.' },
      { title: 'Enfócate', body: 'Elige una tarea y empieza una sesión de **Focus** (pomodoro o trabajo profundo). El orbe de líquido se vacía como un reloj de arena y su anillo marca el progreso.' },
      { title: 'Haz y marca', body: 'Completa tareas con un clic en el círculo, registra hábitos tocando su celda y sigue tus **Rutinas** paso a paso.' },
      { title: 'Reflexiona', body: 'Por la noche, **Revisión** te ayuda a cerrar el día y, los domingos, a revisar la semana con tus propios datos. Sin puntuaciones ni culpa.' },
    ],
    shortcuts: [
      { keys: 'N', label: 'Nueva tarea', pref: 'newTask' },
      { keys: '⌘K', label: 'Buscar o ejecutar cualquier cosa' },
      { keys: '?', label: 'Ver todos los atajos' },
    ],
    goTo: { screen: 'today', label: 'Ir a Hoy' },
    tour: 'welcome',
  },
  {
    id: 'palette',
    module: 'start',
    icon: '🔎',
    title: 'La paleta ⌘K',
    summary: 'Busca cualquier cosa, ejecuta acciones y habla con Ember desde un único sitio.',
    minutes: 2,
    steps: [
      { title: 'Ábrela desde cualquier pantalla', body: 'Pulsa `⌘K` (o `/`). Escribe y aparecen al instante tareas, notas, hábitos, proyectos, objetivos y eventos. No importan las tildes ni las erratas pequeñas.' },
      { title: 'Muévete con el teclado', body: 'Usa `↑` y `↓` para elegir, `↵` para abrir y `esc` para cerrar.' },
      { title: 'Acciones rápidas', body: 'Escribe "nueva rutina", "planificar mañana", "tema" o "exportar" y ejecuta la acción sin buscarla en los menús.' },
      { title: 'Ember entiende frases', body: 'Si escribes algo como "qué tengo mañana" o "mueve las atrasadas a mañana", aparece una tarjeta **Ember entiende** con la respuesta o con lo que va a hacer. Solo se ejecuta si pulsas `↵`, y se puede deshacer con `⌘Z`.' },
      { title: 'Y si no existe, créalo', body: 'Si no hay resultados, `↵` crea una tarea con ese texto, con fecha y hora si las escribiste.' },
    ],
    shortcuts: [
      { keys: '⌘K', label: 'Abrir o cerrar la paleta' },
      { keys: '/', label: 'Abrir la paleta', pref: 'search' },
      { keys: '↑ ↓', label: 'Elegir resultado' },
      { keys: '↵', label: 'Abrir o ejecutar' },
    ],
    commands: [
      { text: 'qué tengo mañana', type: 'agenda', result: 'Tu agenda de mañana: eventos y tareas' },
      { text: 'abre hábitos', type: 'go', result: 'Te lleva a Hábitos' },
    ],
  },

  // ── Capturar ─────────────────────────────────────────────────────────────────────────
  {
    id: 'capture',
    module: 'capture',
    icon: '⚡',
    title: 'Captura en lenguaje natural',
    summary: 'Escribe como hablas: Ember detecta fechas, horas, duraciones, repeticiones y prioridades.',
    minutes: 3,
    steps: [
      { title: 'Abre la captura', body: 'Pulsa `N` (o `⌘N`). En el móvil, el botón **+** flotante.' },
      { title: 'Escribe la frase completa', body: 'Por ejemplo "Estudiar derecho mañana 90 minutos". Debajo verás lo que Ember ha entendido: fecha, hora, duración…' },
      { title: 'Elige el tipo', body: 'Ember sugiere si es tarea, nota, idea, hábito o evento. Pulsa `Tab` para cambiarlo (o `⇧Tab` para ir hacia atrás).' },
      { title: 'Guarda', body: 'Pulsa `↵`. Si no tiene fecha, va a la Bandeja. Un evento necesita hora; si falta, Ember te lo dice.' },
      { title: 'Trucos', body: '**p1** a **p4** marcan la prioridad. **#nombre** asigna un proyecto si existe, o una etiqueta si no. Empieza con "idea:" o "nota:" para forzar el tipo.' },
    ],
    shortcuts: [
      { keys: 'N', label: 'Captura rápida', pref: 'newTask' },
      { keys: '⌘N', label: 'Captura rápida (también desde el menú Archivo)' },
      { keys: 'Tab', label: 'Cambiar el tipo' },
      { keys: '↵', label: 'Guardar' },
    ],
    capture: [
      { text: 'Estudiar derecho mañana 90 minutos', result: 'Tarea · mañana · 90 min', kind: 'task', check: { title: 'Estudiar derecho', dateIn: 1, durationMin: 90 } },
      { text: 'Llamar al banco hoy a las 5 p1', result: 'Tarea · hoy · 17:00 · prioridad 1', kind: 'task', check: { title: 'Llamar al banco', dateIn: 0, time: '17:00', priority: 1 } },
      { text: 'Estudiar marketing 2 horas antes del viernes', result: 'Tarea · 2 h · fecha límite el viernes (Ember busca hueco)', kind: 'task', check: { title: 'Estudiar marketing', durationMin: 120, hasDeadline: true } },
      { text: 'Gimnasio lunes, miércoles y viernes a las 18:00', result: 'Hábito · L, X, V · 18:00', kind: 'habit', check: { title: 'Gimnasio', time: '18:00', weekdays: [1, 3, 5] } },
      { text: 'Leer 30 min todos los días', result: 'Hábito diario · 30 min', kind: 'habit', check: { title: 'Leer', durationMin: 30, daily: true } },
      { text: 'Entrenar 3 veces por semana', result: 'Hábito flexible · 3 veces por semana', kind: 'habit', check: { title: 'Entrenar', timesPerWeek: 3 } },
      { text: 'Reunión con Ana mañana de 10 a 11:30', result: 'Evento · mañana · 10:00–11:30', kind: 'event', check: { title: 'Reunión con Ana', dateIn: 1, time: '10:00', durationMin: 90 } },
      { text: 'Idea para la canción', result: 'Idea (se guarda como nota)', kind: 'idea', check: {} },
      { text: 'Comprar zapatillas #compras', result: 'Tarea sin fecha · etiqueta compras → Bandeja', kind: 'task', check: { title: 'Comprar zapatillas', tags: ['compras'] } },
    ],
    goTo: { screen: 'inbox', label: 'Abrir la Bandeja' },
  },
  {
    id: 'inbox',
    module: 'capture',
    icon: '📥',
    title: 'La Bandeja',
    summary: 'El sitio donde aterriza lo capturado sin fecha, para decidir con calma qué es.',
    minutes: 2,
    steps: [
      { title: 'Qué llega aquí', body: 'Tareas sin fecha, notas e ideas recién capturadas, y lo que aparcas durante una sesión de Focus.' },
      { title: 'Procesa cada elemento', body: 'Con los botones de cada fila: **Hoy**, **Mañana**, programar, convertir en **nota**, en **hábito** o en **evento**. Las notas se pueden convertir en tarea.' },
      { title: 'Sin presión', body: 'La bandeja no caduca ni te riñe. Vacíala cuando tengas cinco minutos, por ejemplo durante la revisión semanal.' },
    ],
    goTo: { screen: 'inbox', label: 'Abrir la Bandeja' },
  },
  {
    id: 'globalCapture',
    module: 'capture',
    icon: '🌐',
    title: 'Captura desde cualquier app',
    summary: 'Un atajo global abre una ventanita de vidrio sobre lo que estés haciendo.',
    minutes: 1,
    steps: [
      { title: 'El atajo', body: 'En el Mac, pulsa `⌃⇧Espacio` (Control + Mayúsculas + Espacio) desde cualquier app, aunque Ember esté en segundo plano.' },
      { title: 'Escribe y vuelve a lo tuyo', body: 'Funciona igual que la captura normal: lenguaje natural, `Tab` para el tipo y `↵` para guardar. La ventana se oculta sola.' },
      { title: 'Cámbialo si choca con otro', body: 'En **Ajustes → Atajos** puedes elegir otra combinación.' },
    ],
    shortcuts: [{ keys: '⌃⇧Espacio', label: 'Captura global (app de Mac)' }],
    goTo: { screen: 'settings', tab: 'shortcuts', label: 'Ajustes → Atajos' },
  },

  // ── Planificar ───────────────────────────────────────────────────────────────────────
  {
    id: 'tasks',
    module: 'plan',
    icon: '✅',
    title: 'Tareas a fondo',
    summary: 'Prioridades, vistas inteligentes, matriz de Eisenhower, subtareas y repeticiones.',
    minutes: 3,
    steps: [
      { title: 'Vistas inteligentes', body: 'En **Tareas** elige entre Mi día, Bandeja, Próximos 7 días, Próximamente, Atrasadas, Algún día, Para focus, Completadas y Todas. Filtra por prioridad, proyecto, área o etiqueta.' },
      { title: 'Abre el detalle', body: 'Haz clic en una tarea para ver su panel: notas, checklist, subtareas, recordatorios, repetición, estimación de tiempo y bloqueos.' },
      { title: 'Clic derecho', body: 'Sobre cualquier tarea: moverla a hoy, a mañana o al lunes que viene, quitarle la fecha, cambiar su prioridad, empezar Focus en ella, devolverla a la Bandeja, descartarla o eliminarla (con deshacer).' },
      { title: 'Matriz de Eisenhower', body: 'Cambia de **Lista** a **Matriz** para ver urgente / importante. Ember la propone según prioridad y fechas, y respeta lo que tú elijas.' },
      { title: 'Arrastra al calendario', body: 'Arrastra una tarea desde Hoy o desde la lista "Sin programar" del calendario a una hora concreta para reservarle un bloque.' },
    ],
    shortcuts: [
      { keys: 'L', label: 'Ir a Tareas', pref: 'tasks' },
      { keys: '⌘Z', label: 'Deshacer el último cambio' },
    ],
    goTo: { screen: 'tasks', label: 'Abrir Tareas' },
  },
  {
    id: 'planDay',
    module: 'plan',
    icon: '✨',
    title: 'Planifica tu día en 10 segundos',
    summary: 'Ember encaja tus tareas en tus huecos libres. Tú decides si aceptas.',
    minutes: 2,
    steps: [
      { title: 'Pulsa Planificar mi día', body: 'Está en **Hoy** (y en la paleta: "planificar mañana"). Ember mira prioridades, fechas límite, duraciones, eventos, tu horario de sueño y el margen entre bloques.' },
      { title: 'Elige estrategia', body: '**Equilibrada**, **primero trabajo profundo** o **primero victorias rápidas**. Puedes pedir otra propuesta.' },
      { title: 'Acepta o descarta', body: 'Al aceptar, las tareas reciben hora. Lo que no cabe se queda sin hora, con la opción de moverlo a mañana sin culpa.' },
    ],
    commands: [
      { text: 'planifica mi día', type: 'planDay', result: 'Abre la propuesta para hoy' },
      { text: 'planifica mañana', type: 'planDay', result: 'Abre la propuesta para mañana' },
      { text: 'cuánto tiempo libre tengo hoy', type: 'free', result: 'Tus huecos libres y cuánto suman' },
    ],
    goTo: { screen: 'today', label: 'Ir a Hoy' },
    tour: 'today',
  },
  {
    id: 'calendar',
    module: 'plan',
    icon: '🗓️',
    title: 'Calendario y bloques de tiempo',
    summary: 'Mes, semana, día y agenda. Arrastra para crear, mover y redimensionar.',
    minutes: 3,
    steps: [
      { title: 'Cambia de vista', body: 'Arriba eliges **Mes**, **Semana**, **Día** o **Agenda**. Las flechas cambian de periodo y **Hoy** vuelve al presente.' },
      { title: 'Crea arrastrando', body: 'En la vista de semana o día, arrastra sobre una franja vacía: aparece un menú para crear una tarea, un evento o un bloque de Focus de esa duración.' },
      { title: 'Mueve y estira', body: 'Arrastra un bloque para moverlo (también a otro día) y tira de su borde inferior para cambiar su duración. Si el evento se repite, arrastrarlo cambia solo esa vez; para cambiar toda la serie, ábrelo y edítalo.' },
      { title: 'Importa tu calendario', body: 'En **Ajustes → Integraciones** importa un archivo **.ics** (Google, Apple, Outlook) sin dar acceso a tu cuenta.' },
    ],
    shortcuts: [{ keys: 'C', label: 'Ir al Calendario', pref: 'calendar' }],
    goTo: { screen: 'calendar', label: 'Abrir el Calendario' },
  },

  // ── Enfocarte ────────────────────────────────────────────────────────────────────────
  {
    id: 'focus',
    module: 'focus',
    icon: '🎯',
    title: 'Focus: pomodoro y trabajo profundo',
    summary: 'Sesiones con orbe líquido, sonidos ambientales y modo inmersivo.',
    minutes: 3,
    steps: [
      { title: 'Prepara la sesión', body: 'En **Focus** elige pomodoro (25/5, 50/10, 90/20 o personalizado) o trabajo profundo, la tarea y un sonido: lluvia, océano, bosque, café, ruido marrón o blanco, espacio o lo-fi. Todos se generan en tu Mac, sin internet.' },
      { title: 'Empieza', body: 'Pulsa **Empezar** o haz clic en el orbe. La pantalla pasa a modo inmersivo: el líquido baja como un reloj de arena y el anillo marca lo que llevas.' },
      { title: 'Controla sin ratón', body: '`Espacio` pausa y reanuda. Clic en el orbe también. `esc` vuelve a Hoy sin detener la sesión.' },
      { title: 'Descansos', body: 'Al terminar cada bloque llega el descanso (el orbe se vuelve azul). Puedes saltarlo o, si desactivas "descansos automáticos", decidir cuándo empezar.' },
      { title: 'Al terminar', body: 'Ember guarda el tiempo real concentrado. Si cortas antes, te pregunta el motivo (opcional) para que tus estadísticas sean honestas.' },
    ],
    shortcuts: [
      { keys: 'F', label: 'Ir a Focus', pref: 'focus' },
      { keys: 'Espacio', label: 'Pausar o reanudar', pref: 'toggleFocus' },
    ],
    commands: [
      { text: 'empieza focus 50 min en informe', type: 'focusStart', result: 'Pomodoro de 50 min vinculado a la tarea que más se parezca a "informe"' },
      { text: 'trabajo profundo 90 minutos', type: 'focusStart', result: 'Bloque de 90 min sin descansos' },
      { text: 'pausa el focus', type: 'focusPause', result: 'Pausa la sesión en curso' },
      { text: 'cuánto he enfocado esta semana', type: 'focusStats', result: 'Total, sesiones y la más larga' },
    ],
    goTo: { screen: 'focus', label: 'Abrir Focus' },
    tour: 'focus',
  },
  {
    id: 'park',
    module: 'focus',
    icon: '🅿️',
    title: 'Aparca las distracciones',
    summary: 'Apunta lo que te viene a la cabeza sin salir de la sesión.',
    minutes: 1,
    steps: [
      { title: 'Pulsa D', body: 'Durante un bloque de Focus, pulsa `D` (o haz clic en la caja de debajo del orbe) y escribe lo que te distrae: "contestar a Marta", "mirar vuelos"…' },
      { title: 'Intro y sigue', body: 'Con `↵` se guarda en la **Bandeja** y vuelves a lo tuyo. El contador te dice cuántos llevas.' },
      { title: 'Al final', body: 'El resumen de la sesión te recuerda cuántos pensamientos aparcaste y te lleva a la Bandeja para decidir qué hacer con ellos.' },
    ],
    shortcuts: [{ keys: 'D', label: 'Aparcar una distracción (en Focus)' }],
  },
  {
    id: 'island',
    module: 'focus',
    icon: '🏝️',
    title: 'La isla de Focus',
    summary: 'Tu temporizador siempre a la vista, en una píldora de vidrio que puedes arrastrar.',
    minutes: 1,
    steps: [
      { title: 'Dentro de Ember', body: 'Si sales de la pantalla de Focus con una sesión en marcha, aparece arriba una isla con el tiempo. Pasa el cursor para ver los botones: pausar, saltar y abrir.' },
      { title: 'Arrástrala', body: 'Llévala a donde quieras: se mueve con inercia y rebota en los bordes. Doble clic la devuelve a su sitio.' },
      { title: 'Fuera de Ember (Mac)', body: 'Si cambias a otra app, la isla flota sobre todas las ventanas sin robarte el foco. En la barra de menús verás además la cuenta atrás. Puedes desactivarla en **Ajustes → Focus**.' },
    ],
    goTo: { screen: 'settings', tab: 'focus', label: 'Ajustes → Focus' },
  },

  // ── Hábitos y rutinas ────────────────────────────────────────────────────────────────
  {
    id: 'habits',
    module: 'habits',
    icon: '🔥',
    title: 'Hábitos sin culpa',
    summary: 'Rachas que perdonan, días de gracia, vacaciones y la rejilla de colores del mes.',
    minutes: 3,
    steps: [
      { title: 'Crea un hábito', body: 'Con **Nuevo hábito** o con la captura: "Gimnasio lunes, miércoles y viernes a las 18:00" o "Leer 30 min todos los días". Elige icono, color, meta (por ejemplo, 8 vasos) y recordatorio.' },
      { title: 'Regístralo', body: 'Toca su celda para marcarlo hecho. Si tiene meta mayor que 1, cada toque suma uno. **Clic derecho** para saltar a propósito, registrar progreso parcial o borrar el registro.' },
      { title: 'Rachas que no castigan', body: 'Los **días de gracia** permiten fallar sin perder la racha, saltar a propósito no la rompe y el **modo vacaciones** la congela.' },
      { title: 'Mira el mes', body: 'La pestaña **Mes** muestra la rejilla de colores; **Estadísticas** y **Cadenas** enseñan constancia y hábitos que se encadenan.' },
    ],
    shortcuts: [{ keys: 'H', label: 'Ir a Hábitos', pref: 'habits' }],
    commands: [
      { text: 'marca meditar', type: 'complete', result: 'Registra "Meditar" como hecho hoy' },
      { text: 'racha de leer', type: 'streak', result: 'Tu racha actual y la mejor' },
    ],
    capture: [
      { text: 'Meditar 10 min todos los días a las 7:30', result: 'Hábito diario · 07:30 · 10 min', kind: 'habit', check: { title: 'Meditar', time: '07:30', durationMin: 10, daily: true } },
    ],
    goTo: { screen: 'habits', label: 'Abrir Hábitos' },
  },
  {
    id: 'routines',
    module: 'habits',
    icon: '📋',
    title: 'Rutinas guiadas',
    summary: 'Secuencias paso a paso con temporizador, gestos y hábitos vinculados.',
    minutes: 3,
    steps: [
      { title: 'Empieza con una plantilla', body: 'En **Rutinas** elige Mañana con calma, Arranque de trabajo, Cierre de la jornada, Noche para descansar o Sesión de estudio. Un clic la crea y luego la adaptas.' },
      { title: 'Edítala', body: 'Añade pasos escribiendo "Estirar 5 min" (los minutos le dan temporizador), **arrastra el asa** para reordenarlos y vincula un paso a un hábito para registrarlo a la vez.' },
      { title: 'Síguela', body: 'Pulsa **Empezar**: verás un paso cada vez. `↵` lo marca hecho, `→` lo salta, `←` vuelve atrás y `Espacio` pausa su temporizador.' },
      { title: 'Con gestos', body: 'Arrastra la tarjeta del paso hacia la **derecha** para completarlo o hacia la **izquierda** para saltarlo. También puedes tachar pasos directamente en la tarjeta de la rutina.' },
      { title: 'Rutina para ahora', body: 'Hoy te sugiere la rutina que encaja con la hora. Con la paleta: "empieza la rutina de mañana".' },
    ],
    shortcuts: [
      { keys: '↵', label: 'Paso hecho (en una rutina)' },
      { keys: '→', label: 'Saltar paso' },
      { keys: '←', label: 'Paso anterior' },
    ],
    commands: [
      { text: 'empieza la rutina de mañana', type: 'routine', result: 'Abre tu rutina de mañana paso a paso' },
      { text: 'rutina de noche', type: 'routine', result: 'Abre tu rutina de noche' },
    ],
    goTo: { screen: 'routines', label: 'Abrir Rutinas' },
  },

  // ── Organizar ────────────────────────────────────────────────────────────────────────
  {
    id: 'goals',
    module: 'organize',
    icon: '🎯',
    title: 'Objetivos y proyectos',
    summary: 'Del "quiero" al "esta semana hago": horizonte, progreso y salud del proyecto.',
    minutes: 3,
    steps: [
      { title: 'Objetivos con horizonte', body: 'En **Objetivos** crea metas anuales, trimestrales, mensuales o semanales. El progreso puede salir de tareas, hitos, un número o tu propia valoración. La pestaña **La línea de tu vida** las ordena en el tiempo.' },
      { title: 'Proyectos', body: 'Un proyecto agrupa tareas con fecha límite. Ábrelo para verlo como **lista**, **tablero** (arrastra entre columnas), **línea de tiempo** o **calendario**.' },
      { title: 'Salud honesta', body: 'Ember marca un proyecto **en riesgo** solo si el ritmo, el plazo o la inactividad lo justifican, y te explica por qué.' },
      { title: 'Vida', body: 'En **Proyectos**, la pestaña **Vida** reparte tus proyectos por áreas (salud, trabajo, estudios…) para ver el equilibrio de un vistazo.' },
    ],
    shortcuts: [
      { keys: 'G', label: 'Ir a Objetivos', pref: 'goals' },
      { keys: 'P', label: 'Ir a Proyectos', pref: 'projects' },
    ],
    goTo: { screen: 'projects', label: 'Abrir Proyectos' },
  },
  {
    id: 'notes',
    module: 'organize',
    icon: '📝',
    title: 'Notas y segundo cerebro',
    summary: 'Markdown, enlaces entre notas y casillas que se convierten en tareas.',
    minutes: 2,
    steps: [
      { title: 'Escribe en Markdown', body: 'Títulos con #, listas, **negritas** y casillas con "- [ ]". Marca las casillas directamente en la vista previa.' },
      { title: 'Enlaza ideas', body: 'Escribe [[Título de otra nota]] para enlazarla. En cada nota verás qué otras la mencionan (enlaces de vuelta).' },
      { title: 'De la nota a la acción', body: 'Las casillas pendientes de una nota se pueden convertir en tareas de un clic.' },
    ],
    goTo: { screen: 'notes', label: 'Abrir Notas' },
  },

  // ── Reflexionar ──────────────────────────────────────────────────────────────────────
  {
    id: 'review',
    module: 'reflect',
    icon: '🌙',
    title: 'Revisión diaria y semanal',
    summary: 'Cierra el día en dos minutos y revisa la semana con tus datos, sin juicio.',
    minutes: 2,
    steps: [
      { title: 'Por la mañana', body: 'En **Hoy** aparece un check-in: cómo dormiste, energía, foco, ánimo y tu intención del día.' },
      { title: 'Por la noche', body: 'La tarjeta **Día completado** resume lo hecho y te lleva a **Revisión → Diaria**: lo mejor del día, qué mejorar y un diario libre.' },
      { title: 'Cada semana', body: '**Revisión → Semanal** te enseña tareas, hábitos y Focus de la semana, para elegir prioridades de la siguiente. **Reset** sirve para ordenar todo cuando te sientes desbordado.' },
    ],
    goTo: { screen: 'review', label: 'Abrir Revisión' },
  },
  {
    id: 'insights',
    module: 'reflect',
    icon: '📊',
    title: 'Estadísticas que explican',
    summary: 'Cuándo te concentras mejor, cómo van tus hábitos y tu año en un resumen.',
    minutes: 2,
    steps: [
      { title: 'Patrones con muestra suficiente', body: 'Ember solo sugiere patrones ("tus mejores horas de foco son…") cuando hay datos suficientes, y siempre como sugerencia.' },
      { title: 'Mapa de calor y gráficos', body: 'Foco por hora y por día, tareas completadas, constancia de hábitos y semanas destacadas.' },
      { title: 'Tu año', body: 'Abre la paleta y escribe "mi año": una historia visual de tu año con tus propios números.' },
    ],
    commands: [{ text: 'cuántos pomodoros llevo hoy', type: 'focusStats', result: 'Tus sesiones de hoy' }],
    goTo: { screen: 'insights', label: 'Abrir Estadísticas' },
  },

  // ── Comandos y atajos ────────────────────────────────────────────────────────────────
  {
    id: 'commands',
    module: 'power',
    icon: '💬',
    title: 'Habla con Ember',
    summary: 'Frases que la paleta ⌘K entiende sin IA y sin conexión. Todas probadas.',
    minutes: 4,
    steps: [
      { title: 'Dónde se escriben', body: 'Abre la paleta con `⌘K` y escribe la frase. No hace falta ser exacto: "¿qué tengo mañana?", "que tengo manana" y "Oye Ember, qué tengo mañana" funcionan igual.' },
      { title: 'Preguntas', body: 'Agenda de un día o de la semana, lo atrasado, tus huecos libres, lo siguiente que toca, tus rachas y tu tiempo de Focus.' },
      { title: 'Acciones', body: 'Empezar, pausar o terminar Focus, abrir una rutina, mover lo atrasado, planificar un día, completar una tarea, registrar un hábito, cambiar el tema o ir a cualquier pantalla.' },
      { title: 'Siempre con vista previa', body: 'La tarjeta **Ember entiende** enseña qué va a pasar. Solo con `↵` se ejecuta, y los cambios se deshacen con `⌘Z`.' },
    ],
    commands: [
      { text: 'qué tengo hoy', type: 'agenda', result: 'Agenda de hoy con horas' },
      { text: 'qué hay el viernes', type: 'agenda', result: 'Agenda del próximo viernes' },
      { text: 'qué tengo esta semana', type: 'agendaWeek', result: 'Resumen de los próximos 7 días' },
      { text: 'qué viene ahora', type: 'next', result: 'Lo que estás haciendo y lo siguiente' },
      { text: 'qué tengo atrasado', type: 'overdue', result: 'Tareas de días anteriores' },
      { text: 'mueve las atrasadas a mañana', type: 'moveOverdue', result: 'Reprograma todas (se puede deshacer)' },
      { text: 'huecos libres mañana', type: 'free', result: 'Franjas libres y total' },
      { text: 'planifica mañana', type: 'planDay', result: 'Propuesta de plan para mañana' },
      { text: 'empieza focus 25 min', type: 'focusStart', result: 'Pomodoro de 25 min' },
      { text: 'detén el focus', type: 'focusStop', result: 'Termina y guarda la sesión' },
      { text: 'cómo van mis rachas', type: 'streak', result: 'Rachas de todos tus hábitos' },
      { text: 'completa comprar pan', type: 'complete', result: 'Completa la tarea que más se parezca' },
      { text: 'hice ejercicio', type: 'complete', result: 'Registra el hábito que más se parezca' },
      { text: 'empieza mi rutina', type: 'routine', result: 'La rutina que toca a esta hora' },
      { text: 'tema océano', type: 'theme', result: 'Cambia el tema (también "modo claro")' },
      { text: 've al calendario', type: 'go', result: 'Navega a cualquier pantalla' },
      { text: 'ayuda', type: 'help', result: 'Ejemplos y acceso a este tutorial' },
    ],
  },
  {
    id: 'shortcuts',
    module: 'power',
    icon: '⌨️',
    title: 'Atajos de teclado',
    summary: 'Todo Ember sin tocar el ratón. Pulsa ? en cualquier momento para verlos.',
    minutes: 2,
    steps: [
      { title: 'Teclas sueltas', body: 'Fuera de los campos de texto: `T` Hoy, `L` Tareas, `C` Calendario, `H` Hábitos, `F` Focus, `G` Objetivos, `P` Proyectos, `N` captura y `/` paleta.' },
      { title: 'Con ⌘', body: '`⌘K` paleta, `⌘N` nueva tarea, `⌘Z` deshacer, `⌘,` ajustes y, en la app de Mac, `⌘1` a `⌘5` para Hoy, Tareas, Calendario, Hábitos y Focus.' },
      { title: 'Personalízalos', body: 'En **Ajustes → Atajos** cambia cualquier tecla suelta y el atajo global de captura.' },
    ],
    shortcuts: [
      { keys: 'T', label: 'Hoy', pref: 'today' },
      { keys: 'L', label: 'Tareas', pref: 'tasks' },
      { keys: 'C', label: 'Calendario', pref: 'calendar' },
      { keys: 'H', label: 'Hábitos', pref: 'habits' },
      { keys: 'F', label: 'Focus', pref: 'focus' },
      { keys: 'G', label: 'Objetivos', pref: 'goals' },
      { keys: 'P', label: 'Proyectos', pref: 'projects' },
      { keys: '?', label: 'Chuleta de atajos' },
    ],
    goTo: { screen: 'settings', tab: 'shortcuts', label: 'Ajustes → Atajos' },
  },

  // ── Ember en tu Mac ──────────────────────────────────────────────────────────────────
  {
    id: 'mac',
    module: 'mac',
    icon: '💻',
    title: 'Ember en tu Mac',
    summary: 'Barra de menús, Dock, notificaciones y por qué cerrar no es salir.',
    minutes: 2,
    steps: [
      { title: 'Barra de menús', body: 'El icono de Ember muestra tus tareas de hoy, la captura rápida e iniciar o pausar Focus. Durante una sesión verás la cuenta atrás junto al icono.' },
      { title: 'Insignia del Dock', body: 'El icono del Dock muestra cuántas tareas te quedan hoy (incluidas las atrasadas). Se desactiva en **Ajustes → Apariencia**.' },
      { title: 'Cerrar no es salir', body: 'Cerrar la ventana la oculta: Ember sigue en la barra de menús para avisarte y para la captura global. Para salir del todo, `⌘Q`.' },
      { title: 'Notificaciones', body: 'Ember pide permiso la primera vez que hace falta. Respeta tus horas de silencio y nunca te avisa de algo antiguo al abrir.' },
    ],
    shortcuts: [{ keys: '⌘Q', label: 'Salir de Ember' }],
  },
  {
    id: 'glass',
    module: 'mac',
    icon: '💧',
    title: 'Vidrio líquido y animaciones',
    summary: 'Materiales de vidrio, luz que sigue al cursor y movimiento con física real.',
    minutes: 2,
    steps: [
      { title: 'Vidrio nativo', body: 'En macOS 26 o posterior, la ventana usa el **Liquid Glass** del sistema: el escritorio se ve difuminado detrás. Actívalo o desactívalo en **Ajustes → Apariencia → Vidrio de macOS**.' },
      { title: 'Intensidad', body: 'Elige **Intenso**, **Sutil** o **Apagado**. Con Apagado las superficies son sólidas, lo más legible y lo que menos consume.' },
      { title: 'Juega con la interfaz', body: 'Pasa el cursor sobre las tarjetas para ver el borde de luz, **mantén pulsado y desliza** sobre los selectores segmentados, arrastra la isla de Focus o haz clic en el orbe líquido.' },
      { title: 'Accesibilidad', body: '**Reducir movimiento** quita animaciones y **Reducir transparencia** vuelve todo sólido. Ember también respeta lo que tengas en los ajustes de accesibilidad de macOS.' },
    ],
    goTo: { screen: 'settings', tab: 'appearance', label: 'Ajustes → Apariencia' },
  },
  {
    id: 'automation',
    module: 'mac',
    icon: '🪄',
    title: 'Atajos de Apple, Siri y Raycast',
    summary: 'Enlaces ember:// para capturar, preguntar o empezar Focus desde cualquier sitio.',
    minutes: 3,
    steps: [
      { title: 'Qué son', body: 'Ember entiende enlaces que empiezan por **ember://**. Cualquier app que abra enlaces (Atajos, Raycast, Alfred, un recordatorio…) puede usarlos para hablar con Ember.' },
      { title: 'Captura con Siri', body: 'En la app **Atajos** crea un atajo con tres acciones: **Solicitar entrada** (texto), **Codificar URL** y **Abrir URL** con `ember://capture?text=` seguido del texto codificado. Llámalo "Apunta en Ember" y di: "Oye Siri, apunta en Ember".' },
      { title: 'Focus con un clic', body: 'Un atajo o un comando de Raycast con `ember://focus?minutes=50&task=informe` empieza una sesión vinculada a esa tarea. Para pausar: `ember://focus?action=pause`.' },
      { title: 'Preguntas que confirmas tú', body: '`ember://command?q=qué tengo mañana` abre la paleta con la frase escrita. Lo que cambie datos solo se ejecuta cuando pulsas `↵`.' },
      { title: 'Seguro por diseño', body: 'Los enlaces funcionan con **Ember.app** instalada en tu Mac. Ninguno borra datos, los textos se recortan y Ember te confirma cada captura con una notificación.' },
    ],
    links: [
      { url: 'ember://capture?text=Comprar%20pan%20ma%C3%B1ana', type: 'capture', result: 'Crea la tarea "Comprar pan" para mañana' },
      { url: 'ember://capture?text=Canci%C3%B3n%20sobre%20el%20mar&kind=idea', type: 'capture', result: 'Guarda una idea' },
      { url: 'ember://open/habitos', type: 'open', result: 'Abre Hábitos' },
      { url: 'ember://command?q=qu%C3%A9%20tengo%20ma%C3%B1ana', type: 'command', result: 'Abre ⌘K con la pregunta' },
      { url: 'ember://focus?minutes=50&task=informe', type: 'focusStart', result: 'Empieza 50 min de Focus en "informe"' },
      { url: 'ember://focus?minutes=90&mode=deep', type: 'focusStart', result: 'Trabajo profundo de 90 min' },
      { url: 'ember://focus?action=pause', type: 'focus', result: 'Pausa la sesión en curso' },
    ],
  },
  {
    id: 'data',
    module: 'mac',
    icon: '🔒',
    title: 'Tus datos y tu privacidad',
    summary: 'Todo se guarda en tu Mac. Exporta, importa y deshaz cuando quieras.',
    minutes: 2,
    steps: [
      { title: 'Local primero', body: 'Ember guarda todo en una base de datos en tu Mac y funciona sin conexión. No hay cuentas, anuncios ni rastreo.' },
      { title: 'Exporta e importa', body: 'En **Ajustes → Datos**: copia completa en JSON, tareas en CSV, calendario en ICS y notas en Markdown. Importar fusiona sin borrar nada.' },
      { title: 'Deshacer', body: '`⌘Z` deshace el último cambio (completar, mover, borrar…). Los avisos de "Deshacer" también aparecen tras acciones importantes.' },
    ],
    shortcuts: [{ keys: '⌘Z', label: 'Deshacer' }],
    goTo: { screen: 'settings', tab: 'data', label: 'Ajustes → Datos' },
  },
];

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
