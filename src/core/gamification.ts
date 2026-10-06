/**
 * Gamificación opcional (desactivable): XP, niveles y logros derivados de los datos.
 * No se guarda nada aparte: todo se recalcula, así que no puede "perderse" ni hacer trampas.
 * Los logros celebran constancia, nunca castigan.
 */
import { computeStreak, indexLogs } from './habits';
import type { FocusSession, Habit, HabitLog, LocalDate, Preferences, Project, Task, WeeklyReview } from './types';

export interface XpInput {
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  sessions: FocusSession[];
  projects: Project[];
  reviews: WeeklyReview[];
}

const TASK_XP: Record<number, number> = { 1: 25, 2: 18, 3: 12, 4: 8 };

export function totalXp(d: XpInput): number {
  let xp = 0;
  for (const t of d.tasks) if (!t.deletedAt && t.status === 'done') xp += TASK_XP[t.priority] ?? 8;
  const difficulty = new Map(d.habits.map((h) => [h.id, h.difficulty]));
  for (const l of d.habitLogs) if (!l.deletedAt && l.status === 'done') xp += 6 * (difficulty.get(l.habitId) ?? 1);
  for (const s of d.sessions) if (!s.deletedAt) xp += Math.floor(s.focusSec / 60);
  for (const p of d.projects) if (!p.deletedAt && p.status === 'done') xp += 150;
  for (const r of d.reviews) if (!r.deletedAt && r.completedAt) xp += 60;
  return xp;
}

/** Nivel n requiere 100·n·(n−1)/2·1.5 XP acumulados (curva suave). */
export function levelFor(xp: number): { level: number; current: number; next: number; progress: number } {
  const need = (n: number) => Math.round(75 * n * (n - 1));
  let level = 1;
  while (xp >= need(level + 1)) level++;
  const current = need(level);
  const next = need(level + 1);
  return { level, current, next, progress: (xp - current) / (next - current) };
}

export interface Achievement {
  id: string;
  icon: string;
  category: 'habits' | 'tasks' | 'focus' | 'projects' | 'reflection';
  target: number;
  value: number;
  unlocked: boolean;
}

export function achievements(d: XpInput, today: LocalDate, vacations: Preferences['vacations']): Achievement[] {
  const doneTasks = d.tasks.filter((t) => !t.deletedAt && t.status === 'done').length;
  const sessions = d.sessions.filter((s) => !s.deletedAt);
  const focusHours = sessions.reduce((a, s) => a + s.focusSec, 0) / 3600;
  const longest = sessions.reduce((a, s) => Math.max(a, s.focusSec), 0) / 60;
  const logsByHabit = new Map<string, HabitLog[]>();
  for (const l of d.habitLogs) {
    const list = logsByHabit.get(l.habitId) ?? [];
    list.push(l);
    logsByHabit.set(l.habitId, list);
  }
  let bestStreak = 0;
  for (const h of d.habits) {
    if (h.deletedAt || h.frequency.kind === 'times_per_week') continue;
    const s = computeStreak(h, indexLogs(logsByHabit.get(h.id) ?? []), today, vacations);
    bestStreak = Math.max(bestStreak, s.best);
  }
  const projectsDone = d.projects.filter((p) => !p.deletedAt && p.status === 'done').length;
  const reviews = d.reviews.filter((r) => !r.deletedAt && r.completedAt).length;
  const list: Omit<Achievement, 'unlocked'>[] = [
    { id: 'first_task', icon: '✓', category: 'tasks', target: 1, value: doneTasks },
    { id: 'tasks_100', icon: '💯', category: 'tasks', target: 100, value: doneTasks },
    { id: 'streak_7', icon: '🔥', category: 'habits', target: 7, value: bestStreak },
    { id: 'streak_30', icon: '🌋', category: 'habits', target: 30, value: bestStreak },
    { id: 'focus_first', icon: '◎', category: 'focus', target: 1, value: sessions.length },
    { id: 'focus_100', icon: '🎯', category: 'focus', target: 100, value: sessions.length },
    { id: 'focus_hours_50', icon: '⏳', category: 'focus', target: 50, value: Math.floor(focusHours) },
    { id: 'deep_90', icon: '🌊', category: 'focus', target: 90, value: Math.floor(longest) },
    { id: 'project_done', icon: '🚀', category: 'projects', target: 1, value: projectsDone },
    { id: 'reviews_4', icon: '🪞', category: 'reflection', target: 4, value: reviews },
  ];
  return list.map((a) => ({ ...a, value: Math.min(a.value, a.target), unlocked: a.value >= a.target }));
}
