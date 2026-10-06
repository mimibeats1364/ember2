/**
 * Progreso de objetivos y salud de proyectos, siempre basados en datos visibles.
 */
import { diffDays, localDateOf } from './dates';
import { isDone, isOpen } from './tasks';
import type { FocusSession, Goal, ID, Instant, LocalDate, Milestone, Project, Task, TimeEntry } from './types';

export interface GoalProgress {
  ratio: number;
  milestones: { done: number; total: number };
  tasks: { done: number; total: number };
  minutesInvested: number;
  /** Fracción del periodo ya transcurrida (para comparar ritmo, sin juicios). */
  timeElapsed: number;
  pace: 'ahead' | 'on_pace' | 'behind' | 'not_started' | 'done';
}

export interface GoalContext {
  milestones: Milestone[];
  tasks: Task[];
  projects: Project[];
  sessions: FocusSession[];
  entries: TimeEntry[];
}

export function goalTaskSet(goal: Goal, ctx: GoalContext): { tasks: Task[]; projectIds: Set<ID> } {
  const projectIds = new Set(ctx.projects.filter((p) => !p.deletedAt && p.goalId === goal.id).map((p) => p.id));
  const tasks = ctx.tasks.filter(
    (t) => !t.deletedAt && t.status !== 'dropped' && (t.goalId === goal.id || (t.projectId !== null && projectIds.has(t.projectId))),
  );
  return { tasks, projectIds };
}

export function trackedMinutes(
  sessions: FocusSession[],
  entries: TimeEntry[],
  match: (taskId: ID | null, projectId: ID | null) => boolean,
): number {
  let sec = 0;
  for (const s of sessions) if (!s.deletedAt && match(s.taskId, s.projectId)) sec += s.focusSec;
  for (const e of entries) {
    if (e.deletedAt || !e.end || !match(e.taskId, e.projectId)) continue;
    sec += Math.max(0, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000);
  }
  return Math.round(sec / 60);
}

export function goalProgress(goal: Goal, ctx: GoalContext, today: LocalDate): GoalProgress {
  const ms = ctx.milestones.filter((m) => !m.deletedAt && m.goalId === goal.id);
  const { tasks, projectIds } = goalTaskSet(goal, ctx);
  const taskIds = new Set(tasks.map((t) => t.id));
  const milestones = { done: ms.filter((m) => m.done).length, total: ms.length };
  const taskCounts = { done: tasks.filter(isDone).length, total: tasks.length };
  let ratio = 0;
  switch (goal.progressMode) {
    case 'milestones':
      ratio = milestones.total ? milestones.done / milestones.total : 0;
      break;
    case 'tasks':
      ratio = taskCounts.total ? taskCounts.done / taskCounts.total : 0;
      break;
    case 'numeric':
      ratio = goal.target ? (goal.current ?? 0) / goal.target : 0;
      break;
    case 'manual':
      ratio = (goal.manualProgress ?? 0) / 100;
      break;
  }
  ratio = Math.max(0, Math.min(1, ratio));
  if (goal.status === 'done') ratio = 1;
  const span = Math.max(1, diffDays(goal.periodEnd, goal.periodStart) + 1);
  const timeElapsed = Math.max(0, Math.min(1, (diffDays(today, goal.periodStart) + 1) / span));
  let pace: GoalProgress['pace'];
  if (goal.status === 'done' || ratio >= 1) pace = 'done';
  else if (today < goal.periodStart) pace = 'not_started';
  else if (ratio >= timeElapsed + 0.1) pace = 'ahead';
  else if (ratio >= timeElapsed - 0.15) pace = 'on_pace';
  else pace = 'behind';
  const minutesInvested = trackedMinutes(ctx.sessions, ctx.entries, (tid, pid) => (tid !== null && taskIds.has(tid)) || (pid !== null && projectIds.has(pid)));
  return { ratio, milestones, tasks: taskCounts, minutesInvested, timeElapsed, pace };
}

export type HealthStatus = 'on_track' | 'at_risk' | 'overdue' | 'no_deadline' | 'done' | 'empty';

export interface ProjectHealth {
  status: HealthStatus;
  progress: number;
  total: number;
  done: number;
  remaining: number;
  daysLeft: number | null;
  lastActivity: Instant | null;
  /** Tareas completadas por semana (últimas 3 semanas). */
  pacePerWeek: number;
  /** Tareas por semana necesarias para llegar a tiempo. */
  neededPerWeek: number | null;
  idleDays: number | null;
}

export function projectHealth(project: Project, allTasks: Task[], today: LocalDate): ProjectHealth {
  const tasks = allTasks.filter((t) => !t.deletedAt && t.projectId === project.id && t.status !== 'dropped');
  const done = tasks.filter(isDone).length;
  const remaining = tasks.filter(isOpen).length;
  const total = tasks.length;
  const progress = total ? done / total : 0;
  let lastActivity: Instant | null = null;
  for (const t of tasks) {
    const ts = t.completedAt ?? t.createdAt;
    if (!lastActivity || ts > lastActivity) lastActivity = ts;
  }
  const idleDays = lastActivity ? diffDays(today, localDateOf(lastActivity)) : null;
  const recentDone = tasks.filter((t) => t.completedAt && diffDays(today, localDateOf(t.completedAt)) <= 21).length;
  const pacePerWeek = Math.round((recentDone / 3) * 10) / 10;
  const daysLeft = project.deadline ? diffDays(project.deadline, today) : null;
  const neededPerWeek = daysLeft !== null && daysLeft >= 0 ? Math.round((remaining / Math.max(1, daysLeft / 7)) * 10) / 10 : null;
  let status: HealthStatus;
  if (project.status === 'done') status = 'done';
  else if (total === 0) status = 'empty';
  else if (remaining === 0) status = 'on_track';
  else if (daysLeft === null) status = 'no_deadline';
  else if (daysLeft < 0) status = 'overdue';
  else if (
    // Solo es "riesgo" si el ritmo necesario es significativo (>0,8 tareas/semana) y el
    // reciente no llega, si queda menos de una semana con trabajo pendiente, o si lleva
    // dos semanas parado con la fecha cerca. Pocas tareas con mucho margen no alarman.
    (neededPerWeek !== null && neededPerWeek > 0.8 && pacePerWeek < neededPerWeek * 0.8 && daysLeft <= 60) ||
    (daysLeft <= 7 && remaining > Math.max(1, pacePerWeek)) ||
    (idleDays !== null && idleDays >= 14 && daysLeft <= 30)
  )
    status = 'at_risk';
  else status = 'on_track';
  return { status, progress, total, done, remaining, daysLeft, lastActivity, pacePerWeek, neededPerWeek, idleDays };
}
