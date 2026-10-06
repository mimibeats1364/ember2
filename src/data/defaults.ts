/**
 * Valores por defecto y fábricas de entidades (rellenan todos los campos obligatorios).
 */
import { localTimeZone, today } from '@core/dates';
import type {
  Area,
  CalendarEvent,
  DayLog,
  Goal,
  Habit,
  Milestone,
  Note,
  Preferences,
  Project,
  Routine,
  Tag,
  Task,
} from '@core/types';

type Fields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const DEFAULT_SHORTCUTS: Preferences['shortcuts'] = {
  newTask: 'n',
  focus: 'f',
  habits: 'h',
  calendar: 'c',
  goals: 'g',
  projects: 'p',
  search: '/',
  toggleFocus: ' ',
  today: 't',
  tasks: 'l',
};

export function defaultPreferences(): Fields<Preferences> {
  const lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
  return {
    name: '',
    locale: lang,
    theme: 'ember',
    reducedMotion: 'system',
    reducedTransparency: false,
    textScale: 1,
    ambient: true,
    uiSounds: true,
    gamification: false,
    weekStartsOn: 1,
    workDays: [1, 2, 3, 4, 5],
    sleep: { bed: '23:30', wake: '07:30' },
    bufferMin: 10,
    focusPeak: 'morning',
    focus: { focusMin: 25, breakMin: 5, longBreakMin: 15, longBreakEvery: 4, autoStartBreaks: true, sound: 'none', volume: 0.5 },
    graceDaysDefault: 1,
    vacations: [],
    notifications: {
      enabled: true,
      tasks: true,
      habits: true,
      calendar: true,
      focus: true,
      goals: true,
      digest: true,
      eventLeadMin: 10,
      quietStart: '22:30',
      quietEnd: '07:30',
    },
    captureShortcut: 'Control+Shift+Space',
    shortcuts: { ...DEFAULT_SHORTCUTS },
    assistantName: 'Orbit',
    onboarded: false,
    userType: 'both',
    mainGoals: [],
  };
}

export function taskFields(over: Partial<Fields<Task>> = {}): Fields<Task> {
  return {
    title: '',
    notes: '',
    status: 'todo',
    inbox: false,
    priority: 4,
    date: null,
    time: null,
    durationMin: null,
    deadline: null,
    projectId: null,
    areaId: null,
    goalId: null,
    parentId: null,
    tagIds: [],
    checklist: [],
    dependsOn: [],
    recurrence: null,
    seriesId: null,
    reminders: [],
    links: [],
    quadrant: null,
    delegatedTo: '',
    order: Date.now(),
    completedAt: null,
    ...over,
  };
}

export function eventFields(over: Partial<Fields<CalendarEvent>> = {}): Fields<CalendarEvent> {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return {
    title: '',
    notes: '',
    category: 'event',
    allDay: false,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    date: null,
    endDate: null,
    tz: localTimeZone(),
    location: '',
    recurrence: null,
    exdates: [],
    reminders: [{ id: 'r10', offsetMin: 10 }],
    projectId: null,
    areaId: null,
    protected: false,
    source: 'local',
    externalId: null,
    ...over,
  };
}

export function projectFields(over: Partial<Fields<Project>> = {}): Fields<Project> {
  return {
    name: '',
    icon: '◆',
    color: 'ember',
    description: '',
    areaId: null,
    goalId: null,
    startDate: null,
    deadline: null,
    status: 'active',
    view: 'list',
    order: Date.now(),
    completedAt: null,
    ...over,
  };
}

export function areaFields(over: Partial<Fields<Area>> = {}): Fields<Area> {
  return { name: '', icon: '●', color: 'cyan', order: Date.now(), archived: false, ...over };
}

export function goalFields(over: Partial<Fields<Goal>> = {}): Fields<Goal> {
  const t = today();
  return {
    title: '',
    icon: '🎯',
    color: 'ember',
    description: '',
    horizon: 'year',
    periodStart: `${t.slice(0, 4)}-01-01`,
    periodEnd: `${t.slice(0, 4)}-12-31`,
    areaId: null,
    parentId: null,
    progressMode: 'tasks',
    target: null,
    current: null,
    unit: '',
    manualProgress: null,
    status: 'active',
    completedAt: null,
    order: Date.now(),
    ...over,
  };
}

export function milestoneFields(over: Partial<Fields<Milestone>> & { goalId: string }): Fields<Milestone> {
  return { title: '', dueDate: null, done: false, doneAt: null, order: Date.now(), ...over };
}

export function habitFields(over: Partial<Fields<Habit>> = {}): Fields<Habit> {
  return {
    name: '',
    icon: '✦',
    color: 'mint',
    description: '',
    frequency: { kind: 'daily' },
    target: 1,
    unit: '',
    preferredTime: null,
    durationMin: null,
    reminder: false,
    difficulty: 1,
    areaId: null,
    goalId: null,
    startDate: today(),
    graceDays: 1,
    stackAfter: null,
    archived: false,
    order: Date.now(),
    ...over,
  };
}

export function noteFields(over: Partial<Fields<Note>> = {}): Fields<Note> {
  return {
    title: '',
    body: '',
    kind: 'note',
    tagIds: [],
    pinned: false,
    inbox: false,
    archived: false,
    projectId: null,
    taskId: null,
    goalId: null,
    areaId: null,
    ...over,
  };
}

export function tagFields(over: Partial<Fields<Tag>> = {}): Fields<Tag> {
  return { name: '', color: 'violet', ...over };
}

export function routineFields(over: Partial<Fields<Routine>> = {}): Fields<Routine> {
  return { name: '', icon: '☀', color: 'amber', timeOfDay: 'morning', steps: [], order: Date.now(), archived: false, ...over };
}

export function dayLogFields(date: string): Fields<DayLog> {
  return {
    date,
    sleepBed: null,
    sleepWake: null,
    energy: null,
    focus: null,
    mood: null,
    productivity: null,
    rating: null,
    highlight: '',
    improve: '',
    journal: '',
    intention: '',
    morningAt: null,
    eveningAt: null,
  };
}

export const dayLogId = (date: string) => `day_${date}`;
export const reviewId = (weekStart: string) => `week_${weekStart}`;
export const routineRunId = (routineId: string, date: string) => `${routineId}_${date}`;
export const PREFS_ID = 'prefs';
