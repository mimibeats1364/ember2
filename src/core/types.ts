/**
 * Modelo de dominio de Ember.
 *
 * Convenciones:
 * - `LocalDate` ('YYYY-MM-DD') es una fecha "flotante": no tiene zona horaria. Una tarea
 *   planificada para el martes sigue siendo del martes aunque viajes.
 * - `LocalTime` ('HH:mm') es una hora de reloj de pared.
 * - `Instant` es un instante absoluto ISO-8601 en UTC. Lo usan los eventos de calendario
 *   (junto a `tz`, la zona en la que se crearon) y los registros de tiempo.
 * - `updatedAt` es un reloj lógico híbrido (HLC) ordenable lexicográficamente; es la base
 *   de la resolución de conflictos de sincronización.
 * - Nada se borra físicamente: `deletedAt` actúa como lápida para que la sincronización
 *   propague borrados sin perder datos.
 */

export type ID = string;
export type LocalDate = string;
export type LocalTime = string;
export type Instant = string;
export type HLC = string;

export interface BaseEntity {
  id: ID;
  createdAt: Instant;
  updatedAt: HLC;
  deletedAt: Instant | null;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo, como Date#getDay

export type Priority = 1 | 2 | 3 | 4;
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'dropped';
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'delete';

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** Solo semanal: días concretos. Vacío = mismo día que el ancla. */
  byWeekday?: Weekday[];
  /** Solo mensual: día del mes (se ajusta al último día si el mes es más corto). */
  byMonthDay?: number;
  until?: LocalDate | null;
}

export interface Reminder {
  id: ID;
  /** Minutos antes del inicio (0 = a la hora). */
  offsetMin: number;
}

export interface ChecklistItem {
  id: ID;
  text: string;
  done: boolean;
}

export interface Task extends BaseEntity {
  title: string;
  notes: string;
  status: TaskStatus;
  /** Capturada rápidamente y todavía sin organizar. */
  inbox: boolean;
  priority: Priority;
  /** Día en el que planeas hacerla. */
  date: LocalDate | null;
  /** Hora de inicio: convierte la tarea en un bloque de tiempo. */
  time: LocalTime | null;
  /** Duración estimada en minutos. */
  durationMin: number | null;
  /** Fecha límite (distinta del día planificado). */
  deadline: LocalDate | null;
  projectId: ID | null;
  areaId: ID | null;
  goalId: ID | null;
  parentId: ID | null;
  tagIds: ID[];
  checklist: ChecklistItem[];
  dependsOn: ID[];
  recurrence: Recurrence | null;
  /** Agrupa las instancias de una tarea recurrente. */
  seriesId: ID | null;
  reminders: Reminder[];
  links: string[];
  /** Cuadrante Eisenhower elegido por el usuario (si no, se calcula). */
  quadrant: Quadrant | null;
  delegatedTo: string;
  order: number;
  completedAt: Instant | null;
}

export type EventCategory =
  | 'event'
  | 'meeting'
  | 'work'
  | 'study'
  | 'training'
  | 'meal'
  | 'rest'
  | 'leisure'
  | 'commute'
  | 'personal'
  | 'focus';

export interface CalendarEvent extends BaseEntity {
  title: string;
  notes: string;
  category: EventCategory;
  allDay: boolean;
  /** Para eventos con hora. */
  start: Instant;
  end: Instant;
  /** Para eventos de día completo (inclusive). */
  date: LocalDate | null;
  endDate: LocalDate | null;
  /** Zona IANA en la que se creó: las repeticiones conservan la hora de pared en esa zona. */
  tz: string;
  location: string;
  recurrence: Recurrence | null;
  /** Ocurrencias excluidas (fecha local de la ocurrencia en `tz`). */
  exdates: LocalDate[];
  reminders: Reminder[];
  projectId: ID | null;
  areaId: ID | null;
  /** Bloques protegidos: el planificador nunca los mueve. */
  protected: boolean;
  source: 'local' | 'ics';
  externalId: string | null;
}

export interface Project extends BaseEntity {
  name: string;
  icon: string;
  color: string;
  description: string;
  areaId: ID | null;
  goalId: ID | null;
  startDate: LocalDate | null;
  deadline: LocalDate | null;
  status: 'active' | 'paused' | 'done' | 'archived';
  view: 'list' | 'board' | 'timeline' | 'calendar';
  order: number;
  completedAt: Instant | null;
}

export interface Area extends BaseEntity {
  name: string;
  icon: string;
  color: string;
  order: number;
  archived: boolean;
}

export type GoalHorizon = 'year' | 'quarter' | 'month' | 'week';

export interface Goal extends BaseEntity {
  title: string;
  icon: string;
  color: string;
  description: string;
  horizon: GoalHorizon;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  areaId: ID | null;
  parentId: ID | null;
  progressMode: 'milestones' | 'tasks' | 'numeric' | 'manual';
  target: number | null;
  current: number | null;
  unit: string;
  manualProgress: number | null;
  status: 'active' | 'done' | 'paused' | 'dropped';
  completedAt: Instant | null;
  order: number;
}

export interface Milestone extends BaseEntity {
  goalId: ID;
  title: string;
  dueDate: LocalDate | null;
  done: boolean;
  doneAt: Instant | null;
  order: number;
}

export type HabitFrequency =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: Weekday[] }
  | { kind: 'times_per_week'; times: number }
  | { kind: 'interval'; every: number };

export interface Habit extends BaseEntity {
  name: string;
  icon: string;
  color: string;
  description: string;
  frequency: HabitFrequency;
  /** Objetivo diario (p. ej. 8 vasos). 1 = hecho/no hecho. */
  target: number;
  unit: string;
  preferredTime: LocalTime | null;
  durationMin: number | null;
  reminder: boolean;
  difficulty: 1 | 2 | 3;
  areaId: ID | null;
  goalId: ID | null;
  startDate: LocalDate;
  /** Días de gracia por semana: un fallo cubierto no rompe la racha. */
  graceDays: number;
  /** Apilamiento de hábitos: se hace después de este otro hábito. */
  stackAfter: ID | null;
  archived: boolean;
  order: number;
}

/** done = hecho · skipped = saltado a propósito (neutral) · partial = progreso parcial */
export type HabitLogStatus = 'done' | 'skipped' | 'partial';

export interface HabitLog extends BaseEntity {
  habitId: ID;
  date: LocalDate;
  status: HabitLogStatus;
  value: number;
  note: string;
}

export interface RoutineStep {
  id: ID;
  title: string;
  durationMin: number | null;
  habitId: ID | null;
}

export interface Routine extends BaseEntity {
  name: string;
  icon: string;
  color: string;
  timeOfDay: 'morning' | 'work' | 'study' | 'night' | 'custom';
  steps: RoutineStep[];
  order: number;
  archived: boolean;
}

export interface RoutineRun extends BaseEntity {
  routineId: ID;
  date: LocalDate;
  doneStepIds: ID[];
  completedAt: Instant | null;
}

export interface Note extends BaseEntity {
  title: string;
  body: string;
  kind: 'note' | 'idea';
  tagIds: ID[];
  pinned: boolean;
  inbox: boolean;
  archived: boolean;
  projectId: ID | null;
  taskId: ID | null;
  goalId: ID | null;
  areaId: ID | null;
}

export interface Tag extends BaseEntity {
  name: string;
  color: string;
}

export type FocusMode = 'pomodoro' | 'deep' | 'custom';

export interface FocusSession extends BaseEntity {
  taskId: ID | null;
  projectId: ID | null;
  label: string;
  mode: FocusMode;
  plannedMin: number;
  startedAt: Instant;
  endedAt: Instant | null;
  /** Segundos efectivos de concentración (sin pausas ni descansos). */
  focusSec: number;
  completed: boolean;
  interrupted: boolean;
  interruptionNote: string;
}

export interface TimeEntry extends BaseEntity {
  taskId: ID | null;
  projectId: ID | null;
  start: Instant;
  end: Instant | null;
  note: string;
  source: 'manual' | 'timer';
}

/** Registro del día: sueño, energía, reflexión y diario. id = `day_<fecha>`. */
export interface DayLog extends BaseEntity {
  date: LocalDate;
  sleepBed: LocalTime | null;
  sleepWake: LocalTime | null;
  energy: number | null;
  focus: number | null;
  mood: number | null;
  productivity: number | null;
  rating: number | null;
  highlight: string;
  improve: string;
  journal: string;
  /** "¿Qué importa más hoy?" */
  intention: string;
  morningAt: Instant | null;
  eveningAt: Instant | null;
}

/** Registro puntual de energía/foco/ánimo para correlaciones por hora del día. */
export interface Checkin extends BaseEntity {
  at: Instant;
  energy: number | null;
  focus: number | null;
  mood: number | null;
}

/** id = `week_<lunes>` */
export interface WeeklyReview extends BaseEntity {
  weekStart: LocalDate;
  accomplished: string;
  wentWell: string;
  didntGoWell: string;
  change: string;
  priorities: string;
  summary: string;
  completedAt: Instant | null;
}

export interface Conflict extends BaseEntity {
  entityType: EntityType;
  entityId: ID;
  local: unknown;
  remote: unknown;
  resolvedAt: Instant | null;
}

export type ThemeId = 'ember' | 'midnight' | 'cosmic' | 'forest' | 'ocean' | 'minimal' | 'light' | 'oled';

export interface ShortcutMap {
  newTask: string;
  focus: string;
  habits: string;
  calendar: string;
  goals: string;
  projects: string;
  search: string;
  toggleFocus: string;
  today: string;
  tasks: string;
}

export interface Preferences extends BaseEntity {
  name: string;
  locale: 'es' | 'en';
  theme: ThemeId;
  reducedMotion: 'system' | 'on' | 'off';
  reducedTransparency: boolean;
  textScale: number;
  ambient: boolean;
  uiSounds: boolean;
  gamification: boolean;
  weekStartsOn: 0 | 1;
  workDays: Weekday[];
  sleep: { bed: LocalTime; wake: LocalTime };
  /** Margen automático entre bloques al planificar. */
  bufferMin: number;
  /** Franja preferida para trabajo profundo. */
  focusPeak: 'morning' | 'afternoon' | 'evening' | 'auto';
  focus: {
    focusMin: number;
    breakMin: number;
    longBreakMin: number;
    longBreakEvery: number;
    autoStartBreaks: boolean;
    sound: string;
    volume: number;
  };
  graceDaysDefault: number;
  vacations: { start: LocalDate; end: LocalDate | null }[];
  notifications: {
    enabled: boolean;
    tasks: boolean;
    habits: boolean;
    calendar: boolean;
    focus: boolean;
    goals: boolean;
    digest: boolean;
    eventLeadMin: number;
    quietStart: LocalTime;
    quietEnd: LocalTime;
  };
  captureShortcut: string;
  shortcuts: ShortcutMap;
  assistantName: string;
  onboarded: boolean;
  userType: 'work' | 'study' | 'both' | 'other';
  mainGoals: string[];
  /** Intensidad del vidrio líquido en la interfaz. */
  glass: 'off' | 'subtle' | 'vivid';
  /** Vidrio nativo de macOS detrás de la ventana (NSGlassEffectView). */
  windowGlass: boolean;
  /** Isla flotante con el temporizador de Focus cuando Ember no está delante. */
  focusIsland: boolean;
  /** Número de tareas de hoy en el icono del Dock. */
  dockBadge: boolean;
  /** Lecciones del tutorial completadas. */
  learned: string[];
  /** Última versión cuyas novedades se mostraron. */
  seenWhatsNew: string;
}

export interface EntityMap {
  tasks: Task;
  events: CalendarEvent;
  projects: Project;
  areas: Area;
  goals: Goal;
  milestones: Milestone;
  habits: Habit;
  habitLogs: HabitLog;
  routines: Routine;
  routineRuns: RoutineRun;
  notes: Note;
  tags: Tag;
  focusSessions: FocusSession;
  timeEntries: TimeEntry;
  dayLogs: DayLog;
  checkins: Checkin;
  reviews: WeeklyReview;
  conflicts: Conflict;
  prefs: Preferences;
}

export type EntityType = keyof EntityMap;
export type AnyEntity = EntityMap[EntityType];

export const ENTITY_TYPES: EntityType[] = [
  'tasks',
  'events',
  'projects',
  'areas',
  'goals',
  'milestones',
  'habits',
  'habitLogs',
  'routines',
  'routineRuns',
  'notes',
  'tags',
  'focusSessions',
  'timeEntries',
  'dayLogs',
  'checkins',
  'reviews',
  'conflicts',
  'prefs',
];

export type Collections = { [K in EntityType]: Record<ID, EntityMap[K]> };
