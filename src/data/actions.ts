/**
 * Operaciones de dominio de alto nivel. La UI llama a estas funciones; nunca escribe
 * entidades "a mano" para que las reglas (recurrencia, rachas, bandeja…) vivan en un sitio.
 */
import { addDays, instantOf, localTimeZone, today as todayFn, toLocalDate, weekdayOf } from '@core/dates';
import { habitLogId } from '@core/habits';
import { shortId, uuidv7 } from '@core/ids';
import type { ParsedInput } from '@core/nlp';
import { nextRecurringFields } from '@core/tasks';
import type { PlannedBlock } from '@core/scheduler';
import type {
  CalendarEvent,
  DayLog,
  FocusMode,
  Habit,
  HabitLogStatus,
  ID,
  LocalDate,
  Note,
  Task,
  TimeEntry,
  WeeklyReview,
} from '@core/types';
import {
  createEntity,
  deleteEntity,
  getEntity,
  getPrefs,
  transaction,
  updateEntity,
  upsertEntity,
  useData,
} from './store';
import {
  dayLogFields,
  dayLogId,
  eventFields,
  habitFields,
  noteFields,
  reviewId,
  tagFields,
  taskFields,
} from './defaults';
import { t } from '@/i18n';

type Fields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

// ── Tareas ─────────────────────────────────────────────────────────────────────────────

export function createTask(over: Partial<Fields<Task>> = {}): Task {
  return transaction(t('tasks.newTask'), () => createEntity('tasks', taskFields(over)));
}

export function updateTask(id: ID, patch: Partial<Task>): Task | undefined {
  return transaction(t('common.edit'), () => updateEntity('tasks', id, patch));
}

/** Completa una tarea. Si se repite, crea la siguiente instancia. Devuelve la siguiente (si hay). */
export function completeTask(id: ID): Task | null {
  return transaction(t('tasks.completedToast'), () => {
    const task = getEntity('tasks', id);
    if (!task || task.status === 'done') return null;
    const now = new Date().toISOString();
    updateEntity('tasks', id, { status: 'done', completedAt: now, inbox: false });
    stopTimerFor(id);
    const next = nextRecurringFields(task, todayFn());
    if (!next) return null;
    const seriesId = task.seriesId ?? task.id;
    updateEntity('tasks', id, { seriesId, recurrence: null });
    return createEntity('tasks', taskFields({ ...task, ...next, seriesId, recurrence: task.recurrence, order: task.order }));
  });
}

export function reopenTask(id: ID): void {
  transaction(t('common.restore'), () => updateEntity('tasks', id, { status: 'todo', completedAt: null }));
}

export function toggleTask(id: ID): Task | null {
  const task = getEntity('tasks', id);
  if (!task) return null;
  if (task.status === 'done') {
    reopenTask(id);
    return null;
  }
  return completeTask(id);
}

export function rescheduleTask(id: ID, date: LocalDate | null, time: string | null = null): void {
  transaction(t('tasks.movedToast'), () => updateEntity('tasks', id, { date, time, inbox: false }));
}

export function dropTask(id: ID): void {
  transaction(t('tasks.droppedToast'), () => updateEntity('tasks', id, { status: 'dropped' }));
}

export function deleteTask(id: ID): void {
  transaction(t('tasks.deletedToast'), () => {
    deleteEntity('tasks', id);
    for (const sub of Object.values(useData.getState().c.tasks)) if (sub.parentId === id && !sub.deletedAt) deleteEntity('tasks', sub.id);
  });
}

export function setTaskSlot(id: ID, date: LocalDate, time: string | null, durationMin?: number | null): void {
  transaction(t('tasks.movedToast'), () =>
    updateEntity('tasks', id, (task) => ({ date, time, durationMin: durationMin ?? task.durationMin ?? 30, inbox: false })),
  );
}

export function ensureTags(names: string[]): ID[] {
  const tags = Object.values(useData.getState().c.tags).filter((x) => !x.deletedAt);
  return names.map((name) => {
    const existing = tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const palette = ['violet', 'cyan', 'coral', 'amber', 'mint', 'magenta'];
    return createEntity('tags', tagFields({ name, color: palette[tags.length % palette.length] })).id;
  });
}

// ── Hábitos ────────────────────────────────────────────────────────────────────────────

export function createHabit(fields: Partial<Fields<Habit>>): Habit {
  return transaction(t('habits.newHabit'), () => createEntity('habits', habitFields({ graceDays: getPrefs().graceDaysDefault, ...fields })));
}

export function setHabitLog(habitId: ID, date: LocalDate, status: HabitLogStatus | null, value?: number, note?: string): void {
  const habit = getEntity('habits', habitId);
  if (!habit) return;
  transaction(t('habits.loggedToast', { name: habit.name }), () => {
    const id = habitLogId(habitId, date);
    if (status === null) {
      if (getEntity('habitLogs', id)) deleteEntity('habitLogs', id);
      return;
    }
    upsertEntity('habitLogs', id, { status, value: value ?? (status === 'done' ? habit.target : 0), ...(note !== undefined ? { note } : {}) }, () => ({
      habitId,
      date,
      status,
      value: value ?? habit.target,
      note: note ?? '',
    }));
  });
}

/** Clic principal: hecho ⇄ sin registro (los hábitos con meta >1 suman de uno en uno). */
export function toggleHabit(habitId: ID, date: LocalDate): 'done' | 'partial' | 'cleared' {
  const habit = getEntity('habits', habitId);
  if (!habit) return 'cleared';
  const log = getEntity('habitLogs', habitLogId(habitId, date));
  const live = log && !log.deletedAt ? log : undefined;
  if (habit.target > 1) return incrementHabit(habitId, date, 1);
  if (live && (live.status === 'done' || live.status === 'skipped')) {
    setHabitLog(habitId, date, null);
    return 'cleared';
  }
  setHabitLog(habitId, date, 'done', habit.target);
  return 'done';
}

export function incrementHabit(habitId: ID, date: LocalDate, delta: number): 'done' | 'partial' | 'cleared' {
  const habit = getEntity('habits', habitId);
  if (!habit) return 'cleared';
  const log = getEntity('habitLogs', habitLogId(habitId, date));
  const current = log && !log.deletedAt && log.status !== 'skipped' ? log.value : 0;
  const value = Math.max(0, current + delta);
  if (value === 0) {
    setHabitLog(habitId, date, null);
    return 'cleared';
  }
  const status = value >= habit.target ? 'done' : 'partial';
  setHabitLog(habitId, date, status, value);
  return status;
}

export function setVacation(on: boolean): void {
  const prefs = getPrefs();
  const d = todayFn();
  const vacations = [...prefs.vacations];
  if (on) vacations.push({ start: d, end: null });
  else {
    const open = vacations.findIndex((v) => v.end === null);
    if (open >= 0) vacations[open] = { ...vacations[open], end: addDays(d, -1) < vacations[open].start ? vacations[open].start : addDays(d, -1) };
  }
  transaction(t('habits.vacation'), () => updateEntity('prefs', 'prefs', { vacations }));
}

// ── Eventos ────────────────────────────────────────────────────────────────────────────

export function createEvent(over: Partial<Fields<CalendarEvent>>): CalendarEvent {
  return transaction(t('calendar.newEvent'), () => createEntity('events', eventFields(over)));
}

/** Mueve un evento (o solo una ocurrencia de una serie, separándola). */
export function moveEvent(id: ID, occurrence: LocalDate, start: Date, end: Date, onlyThis: boolean): void {
  const ev = getEntity('events', id);
  if (!ev) return;
  transaction(t('tasks.movedToast'), () => {
    if (ev.recurrence && onlyThis) {
      updateEntity('events', id, { exdates: [...ev.exdates, occurrence] });
      createEntity('events', eventFields({ ...ev, recurrence: null, exdates: [], start: start.toISOString(), end: end.toISOString() }));
    } else if (ev.recurrence) {
      const shift = start.getTime() - new Date(occurrenceStart(ev, occurrence)).getTime();
      const len = end.getTime() - start.getTime();
      const s = new Date(new Date(ev.start).getTime() + shift);
      updateEntity('events', id, { start: s.toISOString(), end: new Date(s.getTime() + len).toISOString() });
    } else {
      updateEntity('events', id, { start: start.toISOString(), end: end.toISOString() });
    }
  });
}

function occurrenceStart(ev: CalendarEvent, occurrence: LocalDate): string {
  const s = new Date(ev.start);
  return instantOf(occurrence, s.getHours() * 60 + s.getMinutes());
}

export function deleteEventOccurrence(id: ID, occurrence: LocalDate): void {
  const ev = getEntity('events', id);
  if (!ev) return;
  transaction(t('calendar.deleteEvent'), () => updateEntity('events', id, { exdates: [...ev.exdates, occurrence] }));
}

export function deleteEvent(id: ID): void {
  transaction(t('calendar.deleteEvent'), () => deleteEntity('events', id));
}

// ── Captura ────────────────────────────────────────────────────────────────────────────

export type CaptureKind = 'task' | 'note' | 'idea' | 'habit' | 'event';

export interface CaptureResult {
  kind: CaptureKind;
  id: ID;
  toInbox: boolean;
  messageKey: 'capture.savedTask' | 'capture.savedInbox' | 'capture.savedNote' | 'capture.savedHabit' | 'capture.savedEvent';
}

export function captureParsed(parsed: ParsedInput, kind: CaptureKind, rawText: string): CaptureResult | { error: 'needsTime' } {
  const projects = Object.values(useData.getState().c.projects).filter((p) => !p.deletedAt);
  const project = parsed.project ? projects.find((p) => p.name.toLowerCase() === parsed.project!.toLowerCase()) : undefined;
  const title = parsed.title || rawText.trim();
  return transaction(t('nav.capture'), () => {
    const tagIds = parsed.tags.length ? ensureTags(parsed.tags) : [];
    switch (kind) {
      case 'note':
      case 'idea': {
        const note = createEntity('notes', noteFields({ title, body: '', kind: kind === 'idea' ? 'idea' : 'note', inbox: !project, projectId: project?.id ?? null, tagIds }));
        return { kind, id: note.id, toInbox: note.inbox, messageKey: 'capture.savedNote' };
      }
      case 'habit': {
        const frequency: Habit['frequency'] = parsed.timesPerWeek
          ? { kind: 'times_per_week', times: parsed.timesPerWeek }
          : parsed.recurrence?.freq === 'weekly' && parsed.recurrence.byWeekday?.length
            ? { kind: 'weekdays', days: parsed.recurrence.byWeekday }
            : parsed.recurrence?.freq === 'daily' && parsed.recurrence.interval > 1
              ? { kind: 'interval', every: parsed.recurrence.interval }
              : { kind: 'daily' };
        const palette = ['coral', 'magenta', 'violet', 'cyan', 'mint', 'amber', 'orange', 'green'];
        const count = Object.values(useData.getState().c.habits).filter((h) => !h.deletedAt).length;
        const habit = createEntity(
          'habits',
          habitFields({ name: title, frequency, preferredTime: parsed.time, durationMin: parsed.durationMin, reminder: !!parsed.time, color: palette[count % palette.length], graceDays: getPrefs().graceDaysDefault }),
        );
        return { kind, id: habit.id, toInbox: false, messageKey: 'capture.savedHabit' };
      }
      case 'event': {
        if (!parsed.time) return { error: 'needsTime' as const };
        const date = parsed.date ?? todayFn();
        const start = instantOf(date, parsed.time);
        const end = new Date(new Date(start).getTime() + (parsed.durationMin ?? 60) * 60_000).toISOString();
        const ev = createEntity('events', eventFields({ title, start, end, recurrence: parsed.recurrence, projectId: project?.id ?? null, tz: localTimeZone() }));
        return { kind, id: ev.id, toInbox: false, messageKey: 'capture.savedEvent' };
      }
      default: {
        const organized = !!(parsed.date || parsed.deadline || project || parsed.time);
        const task = createEntity(
          'tasks',
          taskFields({
            title,
            date: parsed.date ?? (parsed.time ? todayFn() : null),
            time: parsed.time,
            durationMin: parsed.durationMin,
            deadline: parsed.deadline,
            priority: parsed.priority ?? 4,
            recurrence: parsed.recurrence,
            projectId: project?.id ?? null,
            areaId: project?.areaId ?? null,
            tagIds,
            inbox: !organized,
          }),
        );
        return { kind: 'task', id: task.id, toInbox: task.inbox, messageKey: organized ? 'capture.savedTask' : 'capture.savedInbox' };
      }
    }
  });
}

// ── Bandeja ────────────────────────────────────────────────────────────────────────────

export function inboxTaskToNote(taskId: ID): Note | undefined {
  const task = getEntity('tasks', taskId);
  if (!task) return undefined;
  return transaction(t('inbox.organized'), () => {
    deleteEntity('tasks', taskId);
    return createEntity('notes', noteFields({ title: task.title, body: task.notes, tagIds: task.tagIds, projectId: task.projectId }));
  });
}

export function inboxNoteToTask(noteId: ID): Task | undefined {
  const note = getEntity('notes', noteId);
  if (!note) return undefined;
  return transaction(t('inbox.organized'), () => {
    deleteEntity('notes', noteId);
    return createEntity('tasks', taskFields({ title: note.title, notes: note.body, tagIds: note.tagIds, projectId: note.projectId, inbox: false }));
  });
}

// ── Planificación ──────────────────────────────────────────────────────────────────────

export function applyPlan(blocks: PlannedBlock[]): void {
  transaction(t('plan.accept'), () => {
    for (const b of blocks) {
      const start = new Date(b.start);
      const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      updateEntity('tasks', b.taskId, { date: toLocalDate(start), time, durationMin: Math.round((b.end - b.start) / 60_000), inbox: false });
    }
  });
}

// ── Tiempo ─────────────────────────────────────────────────────────────────────────────

export function runningTimer(): TimeEntry | undefined {
  return Object.values(useData.getState().c.timeEntries).find((e) => !e.deletedAt && e.end === null);
}

export function startTimer(taskId: ID | null): TimeEntry {
  return transaction(t('task.startTimer'), () => {
    const running = runningTimer();
    if (running) updateEntity('timeEntries', running.id, { end: new Date().toISOString() });
    const task = taskId ? getEntity('tasks', taskId) : undefined;
    return createEntity('timeEntries', { taskId, projectId: task?.projectId ?? null, start: new Date().toISOString(), end: null, note: '', source: 'timer' });
  });
}

export function stopTimerFor(taskId: ID | null): void {
  const running = runningTimer();
  if (running && (taskId === null || running.taskId === taskId)) updateEntity('timeEntries', running.id, { end: new Date().toISOString() });
}

export function addManualTime(taskId: ID, minutes: number): void {
  const task = getEntity('tasks', taskId);
  const end = new Date();
  transaction(t('task.addManualTime'), () =>
    createEntity('timeEntries', { taskId, projectId: task?.projectId ?? null, start: new Date(end.getTime() - minutes * 60_000).toISOString(), end: end.toISOString(), note: '', source: 'manual' }),
  );
}

export function saveFocusSession(s: {
  taskId: ID | null;
  label: string;
  mode: FocusMode;
  plannedMin: number;
  startedAt: number;
  endedAt: number;
  focusSec: number;
  completed: boolean;
  interrupted: boolean;
  note: string;
}): void {
  if (s.focusSec < 30) return;
  const task = s.taskId ? getEntity('tasks', s.taskId) : undefined;
  createEntity('focusSessions', {
    taskId: s.taskId,
    projectId: task?.projectId ?? null,
    label: s.label,
    mode: s.mode,
    plannedMin: s.plannedMin,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(s.endedAt).toISOString(),
    focusSec: s.focusSec,
    completed: s.completed,
    interrupted: s.interrupted,
    interruptionNote: s.note,
  });
}

// ── Reflexión ──────────────────────────────────────────────────────────────────────────

export function saveDayLog(date: LocalDate, patch: Partial<DayLog>): DayLog {
  return upsertEntity('dayLogs', dayLogId(date), patch, () => dayLogFields(date));
}

export function saveCheckin(energy: number | null, focus: number | null, mood: number | null): void {
  createEntity('checkins', { at: new Date().toISOString(), energy, focus, mood });
}

export function saveReview(weekStart: LocalDate, patch: Partial<WeeklyReview>): WeeklyReview {
  return upsertEntity('reviews', reviewId(weekStart), patch, () => ({
    weekStart,
    accomplished: '',
    wentWell: '',
    didntGoWell: '',
    change: '',
    priorities: '',
    summary: '',
    completedAt: null,
  }));
}

// ── Utilidades ─────────────────────────────────────────────────────────────────────────

export function newChecklistItem(text: string) {
  return { id: shortId(), text, done: false };
}

export function newReminder(offsetMin: number) {
  return { id: shortId(), offsetMin };
}

export function freshId(): ID {
  return uuidv7();
}

export function isWorkday(date: LocalDate): boolean {
  return getPrefs().workDays.includes(weekdayOf(date));
}
