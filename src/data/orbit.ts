/**
 * Puente entre Orbit (@core/orbit, puro) y los datos de la app: reúne el contexto que cada
 * habilidad necesita y aplica las propuestas aceptadas en una sola operación deshacible.
 */
import { focusByHour, bestWindow, periodSummary } from '@core/analytics';
import { addDays, endOfWeek, startOfWeek, today as todayFn } from '@core/dates';
import { completionStats, computeStreak, indexLogs, type StreakInfo } from '@core/habits';
import { extractActions } from '@core/orbit/extract';
import { parseOrbit, type OrbitIntent } from '@core/orbit/intent';
import {
  bestMatch,
  breakDownProject,
  lightenDay,
  planWithConstraints,
  summarizeWeek,
  whatNow,
  type BreakdownProposal,
  type LightenProposal,
  type PlanProposal,
  type WeekNote,
  type WeekTip,
  type WeekTrend,
  type WhatNowResult,
} from '@core/orbit/skills';
import type { ProposedChange } from '@core/orbit/types';
import { goalProgress, projectHealth, type GoalProgress, type ProjectHealth } from '@core/progress';
import { blockers, isOverdue } from '@core/tasks';
import type { CommandIntent } from '@core/commands';
import type { Goal, Habit, ID, LocalDate, Note, Project, Task } from '@core/types';
import { createEntity, getEntity, getPrefs, transaction, updateEntity, useData } from './store';
import { habitFields, projectFields, taskFields } from './defaults';
import { ensureTags } from './actions';
import { busyForDate, schedulePrefs } from './schedule';
import { t } from '@/i18n';

export type OrbitAnswer =
  | { kind: 'help' }
  | { kind: 'plan'; proposal: PlanProposal; intent: Extract<OrbitIntent, { type: 'plan' }> }
  | { kind: 'lighten'; proposal: LightenProposal }
  | { kind: 'breakdown'; proposal: BreakdownProposal }
  | { kind: 'extract'; note: Pick<Note, 'id' | 'title'> | null; changes: ProposedChange[] }
  | { kind: 'noteNotFound'; query: string; notes: Pick<Note, 'id' | 'title'>[] }
  | { kind: 'week'; from: LocalDate; to: LocalDate; notes: WeekNote[]; tips: WeekTip[]; trend: WeekTrend }
  | { kind: 'goalStatus'; goal: Goal; progress: GoalProgress; next: Task[] }
  | { kind: 'projectStatus'; project: Project; health: ProjectHealth; next: Task[] }
  | { kind: 'habitStatus'; habit: Habit; streak: StreakInfo }
  | { kind: 'notFound'; query: string }
  | { kind: 'whatNow'; result: WhatNowResult }
  | { kind: 'command'; intent: CommandIntent }
  | { kind: 'unknown'; text: string };

function live() {
  const { c } = useData.getState();
  return {
    c,
    tasks: Object.values(c.tasks).filter((x) => !x.deletedAt),
    projects: Object.values(c.projects).filter((x) => !x.deletedAt),
    goals: Object.values(c.goals).filter((x) => !x.deletedAt),
    habits: Object.values(c.habits).filter((x) => !x.deletedAt && !x.archived),
    notes: Object.values(c.notes).filter((x) => !x.deletedAt),
  };
}

const nextOpen = (tasks: Task[]) =>
  tasks
    .filter((x) => x.status !== 'done' && x.status !== 'dropped')
    .sort((a, b) => (a.date ?? a.deadline ?? '9999').localeCompare(b.date ?? b.deadline ?? '9999') || a.priority - b.priority)
    .slice(0, 3);

export function askOrbit(text: string, now = new Date()): OrbitAnswer {
  const prefs = getPrefs();
  const today = todayFn(now);
  const intent = parseOrbit(text, { today, name: prefs.assistantName });
  const d = live();
  switch (intent.type) {
    case 'help':
      return { kind: 'help' };
    case 'plan': {
      const projectNames = Object.fromEntries(d.projects.map((p) => [p.id, p.name]));
      const proposal = planWithConstraints({
        date: intent.date,
        now,
        tasks: d.tasks,
        busy: busyForDate(intent.date),
        prefs: schedulePrefs(),
        constraints: intent.constraints,
        projectNames,
        isBlocked: (x) => blockers(x, d.c.tasks).length > 0,
      });
      return { kind: 'plan', proposal, intent };
    }
    case 'lighten':
      return { kind: 'lighten', proposal: lightenDay({ date: intent.date, now, tasks: d.tasks, fixedBusyFor: (x) => busyForDate(x, undefined, { withTasks: false }), prefs: schedulePrefs() }) };
    case 'breakdown':
      return { kind: 'breakdown', proposal: breakDownProject({ subject: intent.subject, deadline: intent.deadline, today, lang: prefs.locale, projects: d.projects, tasks: d.tasks }) };
    case 'noteTasks': {
      const notes = d.notes.filter((n) => !n.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const note = intent.query ? bestMatch(intent.query, notes, (n) => n.title || n.body.slice(0, 60)) : null;
      if (!note) return { kind: 'noteNotFound', query: intent.query, notes: notes.slice(0, 4).map((n) => ({ id: n.id, title: n.title })) };
      return extractFromNote(note.id) ?? { kind: 'noteNotFound', query: intent.query, notes: [] };
    }
    case 'dump':
      return { kind: 'extract', note: null, changes: tasksFromText(intent.text, today, 'dump') };
    case 'week':
      return weekAnswer(intent.offset, today);
    case 'status':
      return statusAnswer(intent.query, today);
    case 'whatNow':
      return { kind: 'whatNow', result: whatNow({ now, tasks: d.tasks, busy: busyForDate(today), prefs: schedulePrefs(), isBlocked: (x) => blockers(x, d.c.tasks).length > 0 }) };
    case 'command':
      return { kind: 'command', intent: intent.intent };
    default:
      return { kind: 'unknown', text: intent.text };
  }
}

function tasksFromText(text: string, today: LocalDate, mode: 'note' | 'dump', note?: Note): ProposedChange[] {
  const projects = live().projects.filter((p) => p.status !== 'archived');
  const items = extractActions(text, { today, mode, projects: projects.map((p) => p.name) });
  return items.map(({ parsed }) => {
    const project = parsed.project ? projects.find((p) => p.name.toLowerCase() === parsed.project!.toLowerCase()) : undefined;
    if (parsed.kind === 'habit' || parsed.timesPerWeek) {
      return {
        kind: 'create_habit' as const,
        name: parsed.title,
        preferredTime: parsed.time,
        durationMin: parsed.durationMin,
        frequency: parsed.timesPerWeek
          ? { kind: 'times_per_week' as const, times: parsed.timesPerWeek }
          : parsed.recurrence?.freq === 'weekly' && parsed.recurrence.byWeekday?.length
            ? { kind: 'weekdays' as const, days: parsed.recurrence.byWeekday }
            : { kind: 'daily' as const },
      };
    }
    return {
      kind: 'create_task' as const,
      title: parsed.title,
      date: parsed.date ?? (parsed.time ? today : null),
      time: parsed.time,
      durationMin: parsed.durationMin,
      deadline: parsed.deadline,
      priority: parsed.priority,
      recurrence: parsed.recurrence,
      tags: parsed.tags,
      projectId: project?.id ?? note?.projectId ?? null,
    };
  });
}

/** Tareas de una nota concreta (también se usa desde la pantalla de Notas). */
export function extractFromNote(noteId: ID, body?: string): Extract<OrbitAnswer, { kind: 'extract' }> | null {
  const note = getEntity('notes', noteId);
  if (!note || note.deletedAt) return null;
  return { kind: 'extract', note: { id: note.id, title: note.title }, changes: tasksFromText(body ?? note.body, todayFn(), 'note', note) };
}

function weekAnswer(offset: 0 | -1, today: LocalDate): OrbitAnswer {
  const prefs = getPrefs();
  const { c } = useData.getState();
  const from = addDays(startOfWeek(today, prefs.weekStartsOn), offset * 7);
  const to = endOfWeek(from, prefs.weekStartsOn);
  const habits = Object.values(c.habits).filter((h) => !h.deletedAt && !h.archived);
  const logs = Object.values(c.habitLogs).filter((l) => !l.deletedAt);
  const summary = (a: LocalDate, b: LocalDate) => {
    let scheduled = 0;
    let done = 0;
    for (const h of habits) {
      const st = completionStats(h, indexLogs(logs.filter((l) => l.habitId === h.id)), a, b, today, prefs.vacations);
      scheduled += st.scheduled;
      done += st.done;
    }
    const s = periodSummary(a, b, { tasks: Object.values(c.tasks), sessions: Object.values(c.focusSessions), entries: Object.values(c.timeEntries), habitLogs: logs, habitScheduled: scheduled });
    return { ...s, habitDone: done };
  };
  const cur = summary(from, to);
  const prev = summary(addDays(from, -7), addDays(from, -1));
  const recent = Object.values(c.focusSessions).filter((s) => !s.deletedAt && s.startedAt >= new Date(Date.now() - 28 * 86_400_000).toISOString());
  const peak = recent.length >= 4 ? bestWindow(focusByHour(recent), 2) : null;
  const overdue = Object.values(c.tasks).filter((x) => isOverdue(x, today)).length;
  return { kind: 'week', from, to, ...summarizeWeek({ cur, prev, peak, overdue }) };
}

function statusAnswer(query: string, today: LocalDate): OrbitAnswer {
  const d = live();
  const prefs = getPrefs();
  const project = bestMatch(query, d.projects.filter((p) => p.status !== 'archived'), (p) => p.name);
  const goal = bestMatch(query, d.goals.filter((g) => g.status !== 'dropped'), (g) => g.title);
  const habit = bestMatch(query, d.habits, (h) => h.name);
  if (project && (!goal || project.name.length <= goal.title.length)) {
    return { kind: 'projectStatus', project, health: projectHealth(project, d.tasks, today), next: nextOpen(d.tasks.filter((x) => x.projectId === project.id)) };
  }
  if (goal) {
    const ctx = { milestones: Object.values(d.c.milestones), tasks: d.tasks, projects: d.projects, sessions: Object.values(d.c.focusSessions), entries: Object.values(d.c.timeEntries) };
    const projectIds = new Set(d.projects.filter((p) => p.goalId === goal.id).map((p) => p.id));
    return { kind: 'goalStatus', goal, progress: goalProgress(goal, ctx, today), next: nextOpen(d.tasks.filter((x) => x.goalId === goal.id || (x.projectId && projectIds.has(x.projectId)))) };
  }
  if (habit) {
    const logs = Object.values(d.c.habitLogs).filter((l) => !l.deletedAt && l.habitId === habit.id);
    return { kind: 'habitStatus', habit, streak: computeStreak(habit, indexLogs(logs), today, prefs.vacations) };
  }
  return { kind: 'notFound', query };
}

// ── Aplicar ────────────────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['ember', 'violet', 'cyan', 'mint', 'amber', 'magenta', 'indigo', 'coral'];

/** Aplica los cambios aceptados en una sola transacción (⌘Z lo deshace entero). */
export function applyProposal(changes: ProposedChange[]): { applied: number; projectId: ID | null } {
  if (changes.length === 0) return { applied: 0, projectId: null };
  let projectId: ID | null = null;
  transaction(t('orbit.appliedLabel'), () => {
    const refs = new Map<string, ID>();
    const today = todayFn();
    for (const ch of changes) {
      switch (ch.kind) {
        case 'schedule_task':
          updateEntity('tasks', ch.taskId, { date: ch.date, time: ch.time, durationMin: ch.durationMin, inbox: false });
          break;
        case 'reschedule_task':
          updateEntity('tasks', ch.taskId, { date: ch.date, time: null, inbox: false });
          break;
        case 'create_project': {
          const count = live().projects.length;
          const p = createEntity('projects', projectFields({ name: ch.name, deadline: ch.deadline, startDate: today, color: PROJECT_COLORS[count % PROJECT_COLORS.length] }));
          refs.set(ch.ref, p.id);
          projectId = p.id;
          break;
        }
        case 'create_task': {
          const pid = ch.projectRef ? (refs.get(ch.projectRef) ?? null) : (ch.projectId ?? null);
          const project = pid ? getEntity('projects', pid) : undefined;
          if (pid) projectId ??= pid;
          createEntity(
            'tasks',
            taskFields({
              title: ch.title,
              date: ch.date ?? null,
              time: ch.time ?? null,
              durationMin: ch.durationMin ?? null,
              deadline: ch.deadline ?? null,
              priority: ch.priority ?? 4,
              recurrence: ch.recurrence ?? null,
              projectId: pid,
              areaId: project?.areaId ?? null,
              tagIds: ch.tags?.length ? ensureTags(ch.tags) : [],
              inbox: !(ch.date || ch.deadline || pid || ch.time),
            }),
          );
          break;
        }
        case 'create_habit':
          createEntity('habits', habitFields({ name: ch.name, preferredTime: ch.preferredTime ?? null, durationMin: ch.durationMin ?? null, frequency: ch.frequency ?? { kind: 'daily' }, reminder: !!ch.preferredTime, graceDays: getPrefs().graceDaysDefault }));
          break;
      }
    }
  });
  return { applied: changes.length, projectId };
}
