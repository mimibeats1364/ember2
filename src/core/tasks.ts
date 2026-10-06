/**
 * Reglas de tareas: vistas inteligentes, retrasos, matriz de Eisenhower y recurrencia.
 */
import { addDays, diffDays, maxDate } from './dates';
import { nextOccurrence } from './recurrence';
import type { ID, LocalDate, Priority, Quadrant, Task } from './types';

export type SmartView = 'my_day' | 'inbox' | 'next7' | 'upcoming' | 'overdue' | 'someday' | 'completed' | 'focus' | 'all';

export const isOpen = (t: Task) => !t.deletedAt && t.status !== 'done' && t.status !== 'dropped';
export const isDone = (t: Task) => !t.deletedAt && t.status === 'done';

/** Nunca escondemos lo atrasado: si su día o su fecha límite ya pasó, se muestra como tal. */
export function isOverdue(t: Task, today: LocalDate): boolean {
  if (!isOpen(t)) return false;
  return (t.deadline !== null && t.deadline < today) || (t.date !== null && t.date < today);
}

export function overdueDays(t: Task, today: LocalDate): number {
  const ref = t.deadline && t.deadline < today ? t.deadline : t.date;
  return ref ? Math.max(0, diffDays(today, ref)) : 0;
}

export function isImportant(t: Task): boolean {
  return t.priority <= 2;
}

export function isUrgent(t: Task, today: LocalDate): boolean {
  if (t.deadline && diffDays(t.deadline, today) <= 2) return true;
  return t.date !== null && t.date <= today && t.priority === 1;
}

/** El usuario decide: si eligió cuadrante, se respeta; si no, se sugiere uno. */
export function quadrantOf(t: Task, today: LocalDate): Quadrant {
  if (t.quadrant) return t.quadrant;
  const imp = isImportant(t);
  const urg = isUrgent(t, today);
  if (imp && urg) return 'do';
  if (imp) return 'schedule';
  if (urg) return 'delegate';
  return 'delete';
}

export function inView(view: SmartView, t: Task, today: LocalDate): boolean {
  if (t.deletedAt) return false;
  if (view === 'completed') return t.status === 'done';
  if (!isOpen(t)) return false;
  if (t.parentId) return false;
  switch (view) {
    case 'my_day':
      return (t.date !== null && t.date <= today) || (t.deadline !== null && t.deadline <= today);
    case 'inbox':
      return t.inbox;
    case 'next7': {
      const end = addDays(today, 6);
      return (t.date !== null && t.date >= today && t.date <= end) || (t.deadline !== null && t.deadline >= today && t.deadline <= end);
    }
    case 'upcoming':
      return (t.date !== null && t.date > today) || (t.date === null && t.deadline !== null && t.deadline > today);
    case 'overdue':
      return isOverdue(t, today);
    case 'someday':
      return !t.inbox && t.date === null && t.deadline === null;
    case 'focus':
      return t.priority <= 2 && ((t.date !== null && t.date <= addDays(today, 1)) || (t.deadline !== null && t.deadline <= addDays(today, 3)));
    case 'all':
      return true;
  }
}

/** Orden natural: lo que tiene hora primero (por hora), luego prioridad, fecha límite y orden manual. */
export function compareTasks(a: Task, b: Task): number {
  if (a.time && b.time && a.date === b.date) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  const da = a.deadline ?? '9999-12-31';
  const db = b.deadline ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  const pa = a.date ?? '9999-12-31';
  const pb = b.date ?? '9999-12-31';
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.order - b.order;
}

export interface TaskFilter {
  priorities?: Priority[];
  projectIds?: ID[];
  areaIds?: ID[];
  tagIds?: ID[];
}

export function applyFilter(tasks: Task[], f: TaskFilter): Task[] {
  return tasks.filter(
    (t) =>
      (!f.priorities?.length || f.priorities.includes(t.priority)) &&
      (!f.projectIds?.length || (t.projectId !== null && f.projectIds.includes(t.projectId))) &&
      (!f.areaIds?.length || (t.areaId !== null && f.areaIds.includes(t.areaId))) &&
      (!f.tagIds?.length || t.tagIds.some((id) => f.tagIds!.includes(id))),
  );
}

/** Dependencias que aún no están hechas. */
export function blockers(t: Task, byId: Record<ID, Task>): Task[] {
  return t.dependsOn.map((id) => byId[id]).filter((d): d is Task => !!d && isOpen(d));
}

/**
 * Al completar una tarea recurrente se crea la siguiente instancia. La fecha se calcula a
 * partir de la serie (no de "hoy + intervalo") y nunca cae en el pasado.
 */
export function nextRecurringFields(
  t: Task,
  today: LocalDate,
): Pick<Task, 'date' | 'deadline' | 'checklist' | 'status' | 'completedAt'> | null {
  if (!t.recurrence) return null;
  const anchor = t.date ?? t.deadline ?? today;
  const after = maxDate(anchor, today);
  const next = nextOccurrence(t.recurrence, anchor, after);
  if (!next) return null;
  const shift = diffDays(next, anchor);
  return {
    date: t.date || !t.deadline ? next : null,
    deadline: t.deadline ? addDays(t.deadline, shift) : null,
    checklist: t.checklist.map((c) => ({ ...c, done: false })),
    status: 'todo',
    completedAt: null,
  };
}

/** Progreso de subtareas/checklist (0..1) o null si no hay nada que medir. */
export function checklistProgress(t: Task, subtasks: Task[] = []): number | null {
  const total = t.checklist.length + subtasks.length;
  if (total === 0) return null;
  const done = t.checklist.filter((c) => c.done).length + subtasks.filter(isDone).length;
  return done / total;
}
