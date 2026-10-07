/**
 * Ejecutor de comandos: convierte la intención interpretada por @core/commands en una vista
 * previa (respuesta o acción) calculada con los datos locales. Nada se ejecuta hasta que el
 * usuario pulsa Intro, y lo que cambia datos se puede deshacer.
 */
import {
  ArrowRight,
  CalendarDays,
  CalendarClock,
  CircleCheck,
  Clock,
  Flame,
  GraduationCap,
  ListChecks,
  MoveRight,
  Palette,
  Pause,
  Play,
  Sparkles,
  Square,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { CommandIntent, CommandScreen } from '@core/commands';
import { COMMAND_EXAMPLES } from '@core/commands';
import { buildTimeline, type TimelineItem } from '@core/calendar';
import { addDays, endOfMonth, startOfMonth, startOfWeek, today as todayFn } from '@core/dates';
import { computeStreak, indexLogs, isComplete, isScheduled } from '@core/habits';
import { compareTasks, isOpen, isOverdue } from '@core/tasks';
import { freeSlots } from '@core/scheduler';
import { sessionsInRange } from '@core/analytics';
import { nowNext } from '@core/now';
import { SearchIndex } from '@core/search';
import { normalizeText } from '@core/nlp';
import { routineForNow } from '@core/routines';
import { deepWorkConfig, pomodoroConfig } from '@core/focus';
import type { Habit, Routine, Task, ThemeId } from '@core/types';
import { getPrefs, undo, updatePrefs, useData } from '@/data/store';
import { busyForDate } from '@/data/schedule';
import { rescheduleMany, toggleHabit } from '@/data/actions';
import { formatDuration, formatRange, relativeDay, t, tp, type TKey } from '@/i18n';
import { colorValue } from '@/ui/theme/palette';
import { endFocusSession, startFocusSession, togglePauseFocus, useFocus } from './focusStore';
import { navigate, openPlanDay, runRoutine, toast } from './ui';
import { completeWithFeedback } from '@/features/tasks/TaskRow';

export interface PreviewLine {
  left?: string;
  text: string;
  sub?: string;
  color?: string;
  done?: boolean;
}

export interface CommandPreview {
  icon: LucideIcon;
  title: string;
  lines: PreviewLine[];
  note?: string;
  actionLabel: string;
  run: () => void;
  /** Sin nada que hacer (por ejemplo, no hay coincidencias): no se ejecuta con Intro. */
  disabled?: boolean;
}

const SCREEN_KEYS: Record<CommandScreen, TKey> = {
  today: 'nav.today',
  inbox: 'nav.inbox',
  tasks: 'nav.tasks',
  calendar: 'nav.calendar',
  habits: 'nav.habits',
  routines: 'nav.routines',
  focus: 'nav.focus',
  goals: 'nav.goals',
  projects: 'nav.projects',
  notes: 'nav.notes',
  insights: 'nav.insights',
  review: 'nav.review',
  learn: 'nav.learn',
  settings: 'nav.settings',
};

function data() {
  const { c } = useData.getState();
  return {
    c,
    tasks: Object.values(c.tasks).filter((x) => !x.deletedAt),
    habits: Object.values(c.habits).filter((h) => !h.deletedAt && !h.archived),
    logs: Object.values(c.habitLogs).filter((l) => !l.deletedAt),
    routines: Object.values(c.routines).filter((r) => !r.deletedAt && !r.archived),
  };
}

function dayLabel(date: string, today: string): string {
  const rel = relativeDay(date, today);
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

function timelineFor(from: string, to: string): TimelineItem[] {
  const { c, tasks, habits, logs } = data();
  return buildTimeline(
    {
      events: Object.values(c.events),
      tasks,
      habits,
      habitDone: (id, d) => {
        const h = c.habits[id];
        return !!h && isComplete(h, indexLogs(logs.filter((l) => l.habitId === id)).get(d));
      },
      habitScheduled: isScheduled,
    },
    from,
    to,
  ).sort((a, b) => a.start.getTime() - b.start.getTime());
}

function itemLine(it: TimelineItem): PreviewLine {
  return {
    left: it.allDay ? t('today.allDay') : formatRange(it.start, it.end),
    text: it.title,
    sub: t(`cmd.kinds.${it.kind}` as TKey),
    color: it.color ? colorValue(it.color) : undefined,
    done: it.done,
  };
}

function bestTask(query: string, tasks: Task[]): Task | null {
  const open = tasks.filter(isOpen);
  const hits = new SearchIndex(open.map((x) => ({ type: 'task' as const, id: x.id, title: x.title, updated: x.updatedAt }))).search(query, 1);
  return hits[0] ? (open.find((x) => x.id === hits[0].doc.id) ?? null) : null;
}

function bestHabit(query: string, habits: Habit[]): Habit | null {
  const hits = new SearchIndex(habits.map((h) => ({ type: 'habit' as const, id: h.id, title: h.name, body: h.description, updated: h.updatedAt }))).search(query, 1);
  return hits[0] ? (habits.find((h) => h.id === hits[0].doc.id) ?? null) : null;
}

const ROUTINE_TIMES: [RegExp, Routine['timeOfDay']][] = [
  [/^(manana|morning|despertar)$/, 'morning'],
  [/^(trabajo|work|oficina|arranque)$/, 'work'],
  [/^(estudio|estudiar|study)$/, 'study'],
  [/^(noche|night|dormir|acostarme)$/, 'night'],
];

function findRoutine(query: string, routines: Routine[]): Routine | null {
  const sorted = [...routines].sort((a, b) => a.order - b.order);
  if (!query) {
    const today = todayFn();
    const runs = new Map(Object.values(useData.getState().c.routineRuns).filter((r) => r.date === today && !r.deletedAt).map((r) => [r.routineId, r]));
    return routineForNow(sorted, runs, new Date().getHours()) ?? sorted.find((r) => r.steps.length > 0) ?? null;
  }
  const q = normalizeText(query);
  const byName = sorted.find((r) => normalizeText(r.name).includes(q));
  if (byName) return byName;
  for (const [re, time] of ROUTINE_TIMES) if (re.test(q)) return sorted.find((r) => r.timeOfDay === time) ?? null;
  const hits = new SearchIndex(sorted.map((r) => ({ type: 'note' as const, id: r.id, title: r.name, updated: r.updatedAt }))).search(query, 1);
  return hits[0] ? (sorted.find((r) => r.id === hits[0].doc.id) ?? null) : null;
}

export function previewCommand(intent: CommandIntent): CommandPreview {
  const today = todayFn();
  const prefs = getPrefs();
  switch (intent.type) {
    case 'help':
      return {
        icon: GraduationCap,
        title: t('cmd.help.title'),
        lines: [...COMMAND_EXAMPLES.agenda.slice(1, 2), ...COMMAND_EXAMPLES.focusStart.slice(1, 2), ...COMMAND_EXAMPLES.moveOverdue.slice(0, 1), ...COMMAND_EXAMPLES.streak.slice(0, 1), ...COMMAND_EXAMPLES.routine.slice(0, 1)].map((ex) => ({ text: `“${ex}”` })),
        actionLabel: t('cmd.help.action'),
        run: () => navigate('learn', { tab: 'commands' }),
      };

    case 'go':
      return { icon: ArrowRight, title: t('cmd.go', { screen: t(SCREEN_KEYS[intent.screen]) }), lines: [], actionLabel: t('common.open'), run: () => navigate(intent.screen) };

    case 'theme': {
      const prev = prefs.theme;
      const name = t(`settings.themes.${intent.theme}` as TKey);
      return {
        icon: Palette,
        title: t('cmd.theme', { theme: name }),
        lines: [],
        actionLabel: t('cmd.apply'),
        disabled: prev === intent.theme,
        note: prev === intent.theme ? t('cmd.themeAlready') : undefined,
        run: () => {
          updatePrefs({ theme: intent.theme as ThemeId });
          toast(`${t('settings.theme')}: ${name}`, { action: { label: t('common.undo'), run: () => updatePrefs({ theme: prev }) } });
        },
      };
    }

    case 'focusStart': {
      const running = useFocus.getState().state;
      if (running) return { icon: Timer, title: t('cmd.focus.already'), lines: [{ text: running.label || t('focus.noTask') }], actionLabel: t('cmd.focus.open'), run: () => navigate('focus') };
      const { tasks } = data();
      const task = intent.task ? bestTask(intent.task, tasks) : null;
      const p = prefs.focus;
      const cfg = intent.deep
        ? deepWorkConfig(intent.minutes ?? 90)
        : intent.minutes
          ? pomodoroConfig(intent.minutes, Math.max(3, Math.round(intent.minutes / 5)), Math.max(10, Math.round(intent.minutes / 5) * 3), p.longBreakEvery, p.autoStartBreaks)
          : pomodoroConfig(p.focusMin, p.breakMin, p.longBreakMin, p.longBreakEvery, p.autoStartBreaks);
      const label = task?.title ?? intent.task ?? '';
      return {
        icon: Timer,
        title: intent.deep ? t('cmd.focus.deep', { duration: formatDuration(cfg.focusMin) }) : t('cmd.focus.pomodoro', { duration: formatDuration(cfg.focusMin), brk: formatDuration(cfg.breakMin) }),
        lines: label ? [{ left: task ? t('cmd.focus.task') : t('cmd.focus.label'), text: label }] : [],
        note: intent.task && !task ? t('cmd.focus.noTaskMatch', { q: intent.task }) : undefined,
        actionLabel: t('focus.start'),
        run: () => {
          startFocusSession(cfg, task?.id ?? null, label, p.sound as never, p.volume);
          navigate('focus');
        },
      };
    }

    case 'focusPause':
    case 'focusResume':
    case 'focusStop': {
      const s = useFocus.getState().state;
      if (!s) return { icon: Timer, title: t('cmd.focus.none'), lines: [], actionLabel: t('cmd.focus.open'), run: () => navigate('focus') };
      if (intent.type === 'focusStop')
        return { icon: Square, title: t('cmd.focus.stop'), lines: [{ text: s.label || t('focus.noTask') }], note: t('cmd.focus.stopNote'), actionLabel: t('common.stop'), run: () => endFocusSession('') };
      const wantPause = intent.type === 'focusPause';
      const isPaused = s.status === 'paused';
      if (wantPause === isPaused) return { icon: wantPause ? Pause : Play, title: wantPause ? t('cmd.focus.alreadyPaused') : t('cmd.focus.alreadyRunning'), lines: [], actionLabel: t('cmd.focus.open'), run: () => navigate('focus') };
      return { icon: wantPause ? Pause : Play, title: wantPause ? t('cmd.focus.pause') : t('cmd.focus.resume'), lines: [{ text: s.label || t('focus.noTask') }], actionLabel: wantPause ? t('common.pause') : t('common.resume'), run: togglePauseFocus };
    }

    case 'routine': {
      const { routines } = data();
      const r = findRoutine(intent.query, routines);
      if (!r) return { icon: ListChecks, title: routines.length ? t('cmd.routine.noMatch', { q: intent.query }) : t('cmd.routine.none'), lines: [], actionLabel: t('cmd.routine.open'), run: () => navigate('routines') };
      return {
        icon: ListChecks,
        title: t('cmd.routine.start', { name: r.name }),
        lines: r.steps.slice(0, 5).map((st, i) => ({ left: String(i + 1), text: st.title, sub: st.durationMin ? `${st.durationMin}′` : undefined })),
        actionLabel: t('routines.start'),
        run: () => runRoutine(r.id),
      };
    }

    case 'moveOverdue': {
      const { tasks } = data();
      const overdue = tasks.filter((x) => !x.parentId && isOverdue(x, today) && (x.date ?? '') < intent.date).sort(compareTasks);
      const day = dayLabel(intent.date, today);
      if (overdue.length === 0) return { icon: MoveRight, title: t('cmd.overdue.none'), lines: [], actionLabel: t('nav.tasks'), disabled: true, run: () => {} };
      return {
        icon: MoveRight,
        title: tp('cmd.move.title', overdue.length, { day: day.toLowerCase() }),
        lines: overdue.slice(0, 6).map((x) => ({ left: x.date ? dayLabel(x.date, today) : '', text: x.title })),
        note: overdue.length > 6 ? t('cmd.andMore', { n: overdue.length - 6 }) : t('cmd.undoable'),
        actionLabel: tp('cmd.move.action', overdue.length),
        run: () => {
          const n = rescheduleMany(overdue.map((x) => x.id), intent.date);
          toast(tp('cmd.move.done', n, { day: day.toLowerCase() }), { action: { label: t('common.undo'), run: () => undo() } });
        },
      };
    }

    case 'planDay':
      return {
        icon: Sparkles,
        title: t('cmd.plan.title', { day: dayLabel(intent.date, today).toLowerCase() }),
        lines: [],
        note: t('cmd.plan.note'),
        actionLabel: t('cmd.plan.action'),
        run: () => openPlanDay(intent.date),
      };

    case 'overdue': {
      const { tasks } = data();
      const overdue = tasks.filter((x) => !x.parentId && isOverdue(x, today)).sort(compareTasks);
      return {
        icon: TriangleAlert,
        title: overdue.length ? tp('cmd.overdue.title', overdue.length) : t('cmd.overdue.none'),
        lines: overdue.slice(0, 6).map((x) => ({ left: x.date ? dayLabel(x.date, today) : x.deadline ? dayLabel(x.deadline, today) : '', text: x.title })),
        note: overdue.length ? t('cmd.overdue.note') : undefined,
        actionLabel: t('cmd.overdue.action'),
        run: () => navigate('tasks', { tab: 'overdue' }),
      };
    }

    case 'free': {
      const now = Date.now();
      const busy = busyForDate(intent.date);
      const slots = freeSlots(intent.date, busy, { sleep: prefs.sleep, bufferMin: prefs.bufferMin, focusPeak: prefs.focusPeak === 'auto' ? 'morning' : prefs.focusPeak }, intent.date === today ? now : undefined).filter((s) => s.end - s.start >= 15 * 60_000);
      const total = slots.reduce((a, s) => a + (s.end - s.start), 0) / 60_000;
      return {
        icon: Clock,
        title: slots.length ? t('cmd.free.title', { day: dayLabel(intent.date, today), duration: formatDuration(total) }) : t('cmd.free.none', { day: dayLabel(intent.date, today) }),
        lines: slots.slice(0, 6).map((s) => ({ left: formatRange(new Date(s.start), new Date(s.end)), text: formatDuration((s.end - s.start) / 60_000) })),
        note: t('cmd.free.note'),
        actionLabel: t('cmd.plan.action'),
        run: () => openPlanDay(intent.date),
      };
    }

    case 'focusStats': {
      const { c } = data();
      const sessions = Object.values(c.focusSessions);
      const from = intent.period === 'today' ? today : intent.period === 'week' ? startOfWeek(today, prefs.weekStartsOn) : startOfMonth(today);
      const to = intent.period === 'month' ? endOfMonth(today) : today;
      const list = sessionsInRange(sessions, from, to);
      const total = list.reduce((a, s) => a + s.focusSec, 0) / 60;
      const longest = list.reduce((a, s) => Math.max(a, s.focusSec), 0) / 60;
      const period = t(`cmd.periods.${intent.period}` as TKey);
      return {
        icon: Timer,
        title: list.length ? t('cmd.stats.title', { period, duration: formatDuration(total) }) : t('cmd.stats.none', { period }),
        lines: list.length
          ? [
              { left: t('cmd.stats.sessions'), text: String(list.length) },
              { left: t('cmd.stats.longest'), text: formatDuration(longest) },
              { left: t('cmd.stats.interrupted'), text: String(list.filter((s) => s.interrupted).length) },
            ]
          : [],
        actionLabel: t('cmd.stats.action'),
        run: () => navigate('insights'),
      };
    }

    case 'streak': {
      const { habits, logs } = data();
      const index = (h: Habit) => indexLogs(logs.filter((l) => l.habitId === h.id));
      if (intent.habit) {
        const h = bestHabit(intent.habit, habits);
        if (!h) return { icon: Flame, title: t('cmd.streak.noMatch', { q: intent.habit }), lines: [], actionLabel: t('nav.habits'), run: () => navigate('habits') };
        const st = computeStreak(h, index(h), today, prefs.vacations);
        return {
          icon: Flame,
          title: t('cmd.streak.one', { name: `${h.icon} ${h.name}`, count: st.current }),
          lines: [
            { left: t('cmd.streak.current'), text: tp('cmd.streak.days', st.current) },
            { left: t('cmd.streak.best'), text: tp('cmd.streak.days', st.best) },
          ],
          actionLabel: t('nav.habits'),
          run: () => navigate('habits'),
        };
      }
      const rows = habits
        .map((h) => ({ h, st: computeStreak(h, index(h), today, prefs.vacations) }))
        .sort((a, b) => b.st.current - a.st.current)
        .slice(0, 6);
      return {
        icon: Flame,
        title: rows.length ? t('cmd.streak.all') : t('cmd.streak.noHabits'),
        lines: rows.map(({ h, st }) => ({ left: `${h.icon}`, text: h.name, sub: tp('cmd.streak.days', st.current), color: colorValue(h.color) })),
        actionLabel: t('nav.habits'),
        run: () => navigate('habits'),
      };
    }

    case 'next': {
      const { tasks } = data();
      const nn = nowNext(timelineFor(today, today), new Date(), tasks, today);
      const lines: PreviewLine[] = [];
      if (nn.current) lines.push({ ...itemLine(nn.current), sub: t('today.now') });
      if (nn.next) lines.push({ ...itemLine(nn.next), sub: t('today.next') });
      if (!nn.current && nn.suggestion) lines.push({ left: t('today.suggestion'), text: nn.suggestion.title });
      return {
        icon: CalendarClock,
        title: nn.next ? t('cmd.next.title', { title: nn.next.title, time: formatRange(nn.next.start, nn.next.end) }) : t('cmd.next.none'),
        lines,
        actionLabel: t('nav.today'),
        run: () => navigate('today'),
      };
    }

    case 'agendaWeek': {
      const { tasks } = data();
      const lines: PreviewLine[] = [];
      let events = 0;
      let taskCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        const items = timelineFor(d, d).filter((x) => x.kind !== 'habit');
        const dueTasks = tasks.filter((x) => isOpen(x) && !x.parentId && (x.date === d || x.deadline === d) && !x.time).length;
        const ev = items.filter((x) => x.kind === 'event').length;
        const tk = items.filter((x) => x.kind === 'task').length + dueTasks;
        events += ev;
        taskCount += tk;
        lines.push({ left: dayLabel(d, today), text: [ev ? tp('cmd.nEvents', ev) : '', tk ? tp('cmd.nTasks', tk) : ''].filter(Boolean).join(' · ') || t('cmd.nothing') });
      }
      return {
        icon: CalendarDays,
        title: t('cmd.week.title', { events: tp('cmd.nEvents', events), tasks: tp('cmd.nTasks', taskCount) }),
        lines,
        actionLabel: t('cmd.week.action'),
        run: () => navigate('calendar', { tab: 'week' }),
      };
    }

    case 'agenda': {
      const { tasks } = data();
      const items = timelineFor(intent.date, intent.date);
      const untimed = tasks.filter((x) => isOpen(x) && !x.parentId && !x.time && (x.date === intent.date || x.deadline === intent.date)).sort(compareTasks);
      const ev = items.filter((x) => x.kind === 'event').length;
      const tk = items.filter((x) => x.kind === 'task').length + untimed.length;
      const day = dayLabel(intent.date, today);
      const lines = [...items.map(itemLine), ...untimed.map((x) => ({ left: x.deadline === intent.date ? t('cmd.deadline') : '—', text: x.title, sub: t('cmd.kinds.task') }))];
      return {
        icon: CalendarDays,
        title: ev + tk ? t('cmd.agenda.title', { day, events: tp('cmd.nEvents', ev), tasks: tp('cmd.nTasks', tk) }) : t('cmd.agenda.empty', { day }),
        lines: lines.slice(0, 7),
        note: lines.length > 7 ? t('cmd.andMore', { n: lines.length - 7 }) : undefined,
        actionLabel: intent.date === today ? t('nav.today') : t('cmd.agenda.open'),
        run: () => (intent.date === today ? navigate('today') : navigate('calendar', { tab: 'day', id: intent.date })),
      };
    }

    case 'complete': {
      const { tasks, habits, logs } = data();
      const task = bestTask(intent.query, tasks);
      const habit = bestHabit(intent.query.replace(/^(el|la|mi)\s+/, ''), habits.filter((h) => isScheduled(h, today) && !isComplete(h, indexLogs(logs.filter((l) => l.habitId === h.id)).get(today))));
      const pickHabit = habit && (intent.prefer === 'habit' || !task);
      if (pickHabit && habit) {
        return {
          icon: Flame,
          title: t('cmd.complete.habit', { name: `${habit.icon} ${habit.name}` }),
          lines: [],
          note: t('cmd.undoable'),
          actionLabel: t('cmd.complete.log'),
          run: () => {
            toggleHabit(habit.id, today);
            toast(t('habits.loggedToast', { name: habit.name }), { action: { label: t('common.undo'), run: () => undo() } });
          },
        };
      }
      if (task) {
        return {
          icon: CircleCheck,
          title: t('cmd.complete.task', { title: task.title }),
          lines: task.date ? [{ left: t('task.date'), text: dayLabel(task.date, today) }] : [],
          note: t('cmd.undoable'),
          actionLabel: t('cmd.complete.action'),
          run: () => completeWithFeedback(task),
        };
      }
      return { icon: CircleCheck, title: t('cmd.complete.noMatch', { q: intent.query }), lines: [], actionLabel: t('nav.tasks'), disabled: true, run: () => {} };
    }
  }
}
