import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SPRING } from '@/ui/motion/springs';
import { ArrowRight, CalendarDays, Check, CircleCheck, Flame, Moon, Play, Plus, Sparkles, Sunrise, Target, Timer, Clock, Zap } from 'lucide-react';
import { nowNext } from '@core/now';
import { addDays, localDateOf } from '@core/dates';
import { compareTasks, isOverdue } from '@core/tasks';
import { habitsForDay, isComplete, dayState } from '@core/habits';
import { goalProgress } from '@core/progress';
import { sessionsInRange } from '@core/analytics';
import type { TimelineItem } from '@core/calendar';
import type { Habit, HabitLog, Task } from '@core/types';
import { useData, useEntity, useList, usePrefs } from '@/data/store';
import { useActiveHabits, useHabitLogIndex, useNow, useStreaks, useTimeline, useToday } from '@/data/selectors';
import { rescheduleTask, saveCheckin, saveDayLog, toggleHabit, incrementHabit } from '@/data/actions';
import { dayLogId } from '@/data/defaults';
import { formatDate, formatDuration, formatRange, t, tp, type TKey } from '@/i18n';
import { Bar, cx, Empty, HabitCell, IconTile, RatingInput, Ring } from '@/ui/components/primitives';
import { CATEGORY_COLORS, colorValue } from '@/ui/theme/palette';
import { navigate, openCapture, openEventEditor, openHabitEditor, openPlanDay, openTask, toast } from '@/app/ui';
import { TaskRow, completeWithFeedback, startFocusOnTask } from '@/features/tasks/TaskRow';
import { InlineAdd } from '@/features/tasks/InlineAdd';
import { startFocusSession, useFocus } from '@/app/focusStore';
import { deepWorkConfig } from '@core/focus';
import { getPrefs } from '@/data/store';
import { RoutineNow } from './RoutineNow';
import './today.css';

function greetingKey(h: number): TKey {
  if (h >= 5 && h < 12) return 'greeting.morning';
  if (h >= 12 && h < 20) return 'greeting.afternoon';
  return 'greeting.night';
}

export function TodayScreen() {
  const prefs = usePrefs();
  const now = useNow();
  const today = useToday();
  const hour = now.getHours();
  const dayLog = useEntity('dayLogs', dayLogId(today));
  const tasks = useList('tasks');
  const timeline = useTimeline(today, today);
  const evening = hour >= 19 || hour < 4;
  const showMorning = hour >= 4 && hour < 12 && !dayLog?.morningAt;

  const todayTasks = useMemo(
    () => tasks.filter((x) => !x.parentId && ((x.date === today || x.deadline === today) || (x.status === 'done' && x.completedAt && localDateOf(x.completedAt) === today && (x.date === today || x.deadline === today)))),
    [tasks, today],
  );
  const overdue = useMemo(() => tasks.filter((x) => !x.parentId && isOverdue(x, today)).sort(compareTasks), [tasks, today]);

  return (
    <div className="page today">
      <header className="today-head reveal">
        <div className="eyebrow">{formatDate(today, 'long')}</div>
        <h1 className="today-greeting">
          {t(greetingKey(hour))}
          {prefs.name ? <span className="name">, {prefs.name}</span> : null}
        </h1>
        {dayLog?.intention && !showMorning && (
          <p className="today-intention">
            <Target /> {dayLog.intention}
          </p>
        )}
      </header>

      {showMorning && <MorningCheckin today={today} />}
      {evening && <DayComplete today={today} todayTasks={todayTasks} />}

      <div className="reveal reveal-1">
        <NowCard timeline={timeline} now={now} tasks={tasks} today={today} />
      </div>

      <div className="reveal reveal-2">
        <DayStats today={today} todayTasks={todayTasks} />
      </div>

      <RoutineNow hour={hour} />

      <div className="today-grid">
        <div className="stack gap-5">
          <section className="card card-pad reveal reveal-3" aria-labelledby="sched">
            <div className="card-header">
              <h2 className="card-title" id="sched">
                {t('today.schedule')}
              </h2>
              <div className="row-flex gap-2">
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('calendar')}>
                  <CalendarDays />
                  <span className="hide-mobile">{t('today.viewCalendar')}</span>
                </button>
                <button className="btn btn-sm btn-subtle" onClick={() => openPlanDay(today)} data-tour="plan-day">
                  <Sparkles />
                  {t('today.planMyDay')}
                </button>
              </div>
            </div>
            <Schedule items={timeline} now={now} />
          </section>
          <HabitsToday today={today} />
        </div>
        <div className="stack gap-5">
          <section className="card card-pad reveal reveal-3" aria-labelledby="tt" data-tour="today-tasks">
            <div className="card-header">
              <h2 className="card-title" id="tt">
                {t('today.todayTasks')}
              </h2>
              <span className="faint xs num">
                {todayTasks.filter((x) => x.status === 'done').length}/{todayTasks.filter((x) => x.status !== 'dropped').length}
              </span>
            </div>
            <InlineAdd defaults={{ date: today }} placeholder={t('tasks.addPlaceholder')} />
            <div className="list" style={{ marginTop: 8 }}>
              <AnimatePresence initial={false}>
                {todayTasks
                  .filter((x) => x.status !== 'dropped')
                  .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || compareTasks(a, b))
                  .map((x) => (
                    // Al completarse, la tarea baja a su sitio con un muelle en vez de saltar.
                    <motion.div key={x.id} layout="position" transition={SPRING.smooth} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, transition: { duration: 0.22 } }}>
                      <TaskRow task={x} showProject draggable />
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
            {todayTasks.length === 0 && overdue.length === 0 && (
              <Empty compact icon={<CircleCheck />} title={t('today.emptyTasks')} action={<button className="btn btn-sm" onClick={() => openCapture('task')}><Plus />{t('today.emptyTasksCta')}</button>} />
            )}
            {overdue.length > 0 && <OverdueBlock tasks={overdue} today={today} />}
          </section>
          <MainGoal today={today} />
        </div>
      </div>
    </div>
  );
}

// ── Ahora / Siguiente ──────────────────────────────────────────────────────────────────

function NowCard({ timeline, now, tasks, today }: { timeline: TimelineItem[]; now: Date; tasks: Task[]; today: string }) {
  const nn = useMemo(() => nowNext(timeline, now, tasks, today), [timeline, now, tasks, today]);
  const cur = nn.current;
  const color = cur ? colorValue(cur.color ?? CATEGORY_COLORS[cur.category as keyof typeof CATEGORY_COLORS]) : undefined;
  const elapsed = cur ? (now.getTime() - cur.start.getTime()) / (cur.end.getTime() - cur.start.getTime()) : 0;
  const minsLeft = cur ? Math.max(1, Math.round((cur.end.getTime() - now.getTime()) / 60_000)) : 0;

  const focusActive = useFocus((s) => !!s.state);
  const startFocus = () => {
    if (cur?.kind === 'task') {
      const task = tasks.find((x) => x.id === cur.id);
      if (task) startFocusOnTask(task);
    } else if (cur) {
      const p = getPrefs().focus;
      startFocusSession(deepWorkConfig(Math.max(10, minsLeft)), null, cur.title, p.sound as never, p.volume);
      navigate('focus');
    } else if (nn.suggestion) startFocusOnTask(nn.suggestion);
  };

  return (
    <section className="card card-glow now-card tilt" data-tilt="2.5" aria-label={t('today.now')} data-tour="now">
      <div className="now-main">
        <div className="eyebrow accent row-flex gap-2">
          <i className="live-dot" /> {t('today.now')}
          {cur && <span className="faint num">{formatRange(cur.start, cur.end)}</span>}
        </div>
        {cur ? (
          <>
            <h2 className="now-title">{cur.title}</h2>
            <div className="row-flex gap-3 wrap" style={{ marginTop: 10 }}>
              <span className="tag" style={{ color }}>
                <i className="dot" />
                {t(`categories.${cur.category}` as TKey)}
              </span>
              <span className="muted small">{t('today.endsIn', { duration: formatDuration(minsLeft) })}</span>
            </div>
            <div style={{ marginTop: 14, maxWidth: 420 }}>
              <Bar value={elapsed} thin />
            </div>
          </>
        ) : nn.suggestion ? (
          <>
            <p className="muted small" style={{ marginTop: 6 }}>
              {nn.freeUntil ? t('today.freeUntil', { time: nn.freeUntil.toTimeString().slice(0, 5) }) : t('today.freeRestOfDay')} · {t('today.suggestion')}
            </p>
            <h2 className="now-title" onClick={() => openTask(nn.suggestion!.id)} role="button" tabIndex={0}>
              {nn.suggestion.title}
            </h2>
            {nn.suggestion.durationMin && <p className="muted small" style={{ marginTop: 6 }}>{formatDuration(nn.suggestion.durationMin)}</p>}
          </>
        ) : (
          <>
            <h2 className="now-title muted-title">{nn.freeUntil ? t('today.freeUntil', { time: nn.freeUntil.toTimeString().slice(0, 5) }) : t('today.freeRestOfDay')}</h2>
            <p className="muted small" style={{ marginTop: 6 }}>{t('today.nothingPlanned')}</p>
          </>
        )}
      </div>
      <div className="now-actions">
        {focusActive ? (
          <button className="btn btn-primary btn-lg magnetic" onClick={() => navigate('focus')}>
            <Timer />
            {t('today.backToFocus')}
          </button>
        ) : (
          (cur || nn.suggestion) && (
            <button className="btn btn-primary btn-lg magnetic" onClick={startFocus}>
              <Play />
              {t('today.startFocus')}
            </button>
          )
        )}
        {cur?.kind === 'task' && (
          <button className="btn btn-lg" onClick={() => { const task = tasks.find((x) => x.id === cur.id); if (task) completeWithFeedback(task); }}>
            <Check />
            {t('today.markDone')}
          </button>
        )}
        {cur?.kind === 'habit' && (
          <button className="btn btn-lg" onClick={() => toggleHabit(cur.id, today)}>
            <Check />
            {t('today.markDone')}
          </button>
        )}
        {!cur && nn.suggestion && (
          <button className="btn btn-lg" onClick={() => completeWithFeedback(nn.suggestion!)}>
            <Check />
            {t('today.markDone')}
          </button>
        )}
        {!cur && !nn.suggestion && (
          <button className="btn btn-lg" onClick={() => openPlanDay(today)}>
            <Sparkles />
            {t('today.planMyDay')}
          </button>
        )}
      </div>
      {nn.next && (
        <div className="now-next">
          <span className="eyebrow">{t('today.next')}</span>
          <span className="num faint">{formatRange(nn.next.start, nn.next.end)}</span>
          <span className="ellipsis" style={{ fontWeight: 600 }}>{nn.next.title}</span>
          <span className="faint xs hide-mobile">{t('today.startsIn', { duration: formatDuration(Math.round((nn.next.start.getTime() - now.getTime()) / 60_000)) })}</span>
          <ArrowRight className="faint" />
        </div>
      )}
    </section>
  );
}

// ── Estadísticas del día ───────────────────────────────────────────────────────────────

function DayStats({ today, todayTasks }: { today: string; todayTasks: Task[] }) {
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const streaks = useStreaks();
  const sessions = useList('focusSessions');
  const due = habitsForDay(habits, index, today);
  const habitsDone = due.filter((h) => isComplete(h, index.get(h.id)?.get(today))).length;
  const tasksTotal = todayTasks.filter((x) => x.status !== 'dropped').length;
  const tasksDone = todayTasks.filter((x) => x.status === 'done').length;
  const focusMin = Math.round(sessionsInRange(sessions, today, today).reduce((a, s) => a + s.focusSec, 0) / 60);
  const bestStreak = Math.max(0, ...[...streaks.values()].filter((s) => s.unit === 'days').map((s) => s.current));
  return (
    <div className="day-stats" role="group" aria-label={t('today.progress')}>
      <div className="card stat-tile">
        <Ring value={tasksTotal ? tasksDone / tasksTotal : 0} size={46} stroke={4.5}>
          <CircleCheck size={16} className="faint" />
        </Ring>
        <div>
          <div className="stat-label">{t('today.tasksDone')}</div>
          <div className="stat-value num">
            {tasksDone}<span className="faint">/{tasksTotal}</span>
          </div>
        </div>
      </div>
      <div className="card stat-tile">
        <Ring value={due.length ? habitsDone / due.length : 0} size={46} stroke={4.5} color="#6DE78C">
          <Flame size={16} className="faint" />
        </Ring>
        <div>
          <div className="stat-label">{t('today.habitsDone')}</div>
          <div className="stat-value num">
            {habitsDone}<span className="faint">/{due.length}</span>
          </div>
        </div>
      </div>
      <div className="card stat-tile">
        <span className="stat-icon"><Timer /></span>
        <div>
          <div className="stat-label">{t('today.focusTime')}</div>
          <div className="stat-value num">{formatDuration(focusMin)}</div>
        </div>
      </div>
      <div className="card stat-tile">
        <span className="stat-icon flame"><Zap /></span>
        <div>
          <div className="stat-label">{t('today.streak')}</div>
          <div className="stat-value num">🔥 {t('today.streakDays', { count: bestStreak })}</div>
        </div>
      </div>
    </div>
  );
}

// ── Agenda ─────────────────────────────────────────────────────────────────────────────

function Schedule({ items, now }: { items: TimelineItem[]; now: Date }) {
  const today = useToday();
  if (items.length === 0) {
    return <Empty compact icon={<Clock />} title={t('today.emptySchedule')} action={<button className="btn btn-sm btn-subtle" onClick={() => openPlanDay(today)}><Sparkles />{t('today.emptyScheduleCta')}</button>} />;
  }
  return (
    <ol className="schedule">
      {items.map((it) => {
        const color = colorValue(it.color ?? CATEGORY_COLORS[it.category as keyof typeof CATEGORY_COLORS]);
        const past = it.end <= now;
        const live = !it.allDay && it.start <= now && it.end > now;
        return (
          <li
            key={it.key}
            className={cx('sched-item', past && 'past', live && 'live', it.done && 'done')}
            style={{ '--c': color } as CSSProperties}
            onClick={() => {
              if (it.kind === 'task') openTask(it.id);
              else if (it.kind === 'event') openEventEditor(it.id, undefined, it.occurrence);
              else toggleHabit(it.id, it.occurrence);
            }}
          >
            <span className="sched-time num">{it.allDay ? t('today.allDay') : it.start.toTimeString().slice(0, 5)}</span>
            <span className="sched-bar" />
            <span className="sched-body">
              <span className="sched-title">{it.title}</span>
              <span className="sched-meta">
                {!it.allDay && formatRange(it.start, it.end)} · {t(`categories.${it.category}` as TKey)}
              </span>
            </span>
            {it.done && <Check className="sched-check" />}
            {live && <span className="tag accent">{t('today.inProgress')}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Hábitos ────────────────────────────────────────────────────────────────────────────

function HabitsToday({ today }: { today: string }) {
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const streaks = useStreaks();
  const prefs = usePrefs();
  const due = habitsForDay(habits, index, today);
  return (
    <section className="card card-pad reveal reveal-4" aria-labelledby="hab" data-tour="today-habits">
      <div className="card-header">
        <h2 className="card-title" id="hab">
          {t('today.habits')}
        </h2>
        <button className="btn btn-sm btn-ghost" onClick={() => navigate('habits')}>
          {t('common.open')} <ArrowRight />
        </button>
      </div>
      {due.length === 0 ? (
        <Empty compact icon={<Flame />} title={t('today.emptyHabits')} action={<button className="btn btn-sm" onClick={() => openHabitEditor(null)}><Plus />{t('today.emptyHabitsCta')}</button>} />
      ) : (
        <div className="habit-today-grid">
          {due.map((h) => (
            <HabitToday key={h.id} habit={h} today={today} log={index.get(h.id)?.get(today)} streak={streaks.get(h.id)?.current ?? 0} vacations={prefs.vacations} />
          ))}
        </div>
      )}
    </section>
  );
}

function HabitToday({ habit, today, log, streak, vacations }: { habit: Habit; today: string; log: HabitLog | undefined; streak: number; vacations: { start: string; end: string | null }[] }) {
  const state = dayState(habit, log, today, today, vacations);
  const value = log && log.status !== 'skipped' ? log.value : 0;
  return (
    <div className={cx('habit-today', state === 'done' && 'done')} style={{ '--hc': colorValue(habit.color) } as CSSProperties}>
      <HabitCell
        color={habit.color}
        state={state === 'pending' ? 'missed' : state}
        fill={habit.target > 1 ? value / habit.target : undefined}
        size="lg"
        label={t('a11y.toggleHabit', { name: habit.name, state: t(`habits.states.${state}` as TKey) })}
        onClick={() => toggleHabit(habit.id, today)}
      />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="habit-name ellipsis">
          {habit.icon} {habit.name}
        </div>
        <div className="habit-sub">
          {habit.target > 1 ? (
            <span className="num">
              {value}/{habit.target} {habit.unit}
            </span>
          ) : habit.preferredTime ? (
            <span className="num">{habit.preferredTime}</span>
          ) : null}
          {streak > 0 && <span className="num">🔥 {streak}</span>}
        </div>
      </div>
      {habit.target > 1 && state !== 'done' && (
        <button className="btn btn-icon btn-sm btn-ghost" aria-label={t('habits.increment')} onClick={() => incrementHabit(habit.id, today, 1)}>
          <Plus />
        </button>
      )}
    </div>
  );
}

// ── Objetivo principal ─────────────────────────────────────────────────────────────────

function MainGoal({ today }: { today: string }) {
  const goals = useList('goals');
  const c = useData((s) => s.c);
  const goal = useMemo(() => {
    const order = { year: 0, quarter: 1, month: 2, week: 3 } as const;
    return goals.filter((g) => g.status === 'active' && g.periodStart <= today && g.periodEnd >= today).sort((a, b) => order[a.horizon] - order[b.horizon] || a.order - b.order)[0];
  }, [goals, today]);
  const gp = useMemo(
    () =>
      goal
        ? goalProgress(goal, {
            milestones: Object.values(c.milestones),
            tasks: Object.values(c.tasks),
            projects: Object.values(c.projects),
            sessions: Object.values(c.focusSessions),
            entries: Object.values(c.timeEntries),
          }, today)
        : null,
    [goal, c, today],
  );
  if (!goal || !gp) {
    return (
      <section className="card card-pad reveal reveal-5">
        <div className="card-header">
          <h2 className="card-title">{t('today.mainGoal')}</h2>
        </div>
        <Empty compact icon={<Target />} title={t('goals.emptyHint')} action={<button className="btn btn-sm" onClick={() => navigate('goals')}><Plus />{t('goals.createFirst')}</button>} />
      </section>
    );
  }
  return (
    <section className="card card-pad card-hover reveal reveal-5" onClick={() => navigate('goals', { id: goal.id })}>
      <div className="card-header">
        <h2 className="card-title">{t('today.mainGoal')}</h2>
        <span className="tag">{t(`goals.pace.${gp.pace}` as TKey)}</span>
      </div>
      <div className="row-flex gap-3">
        <IconTile icon={goal.icon} color={goal.color} size="lg" />
        <div className="grow">
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)' }}>{goal.title}</div>
          <div className="row-flex gap-3" style={{ marginTop: 8 }}>
            <div className="grow">
              <Bar value={gp.ratio} marker={gp.timeElapsed} color={colorValue(goal.color)} />
            </div>
            <span className="num" style={{ fontWeight: 700 }}>{Math.round(gp.ratio * 100)}%</span>
          </div>
          <div className="faint xs" style={{ marginTop: 6 }}>
            {gp.tasks.total > 0 && `${gp.tasks.done}/${gp.tasks.total} ${t('goals.tasks').toLowerCase()} · `}
            {gp.milestones.total > 0 && `${gp.milestones.done}/${gp.milestones.total} ${t('goals.milestones').toLowerCase()} · `}
            {formatDuration(gp.minutesInvested)}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Atrasadas ──────────────────────────────────────────────────────────────────────────

function OverdueBlock({ tasks, today }: { tasks: Task[]; today: string }) {
  return (
    <div className="overdue-block">
      <div className="row-flex gap-2 wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--warning)' }}>
            {t('today.fromBefore')} · {tasks.length}
          </div>
          <div className="faint xs" style={{ marginTop: 2 }}>{t('today.fromBeforeHint')}</div>
        </div>
        <div className="row-flex gap-2">
          <button className="btn btn-sm" onClick={() => { tasks.forEach((x) => rescheduleTask(x.id, today, x.time)); toast(t('tasks.movedToast')); }}>
            {t('common.today')}
          </button>
          <button className="btn btn-sm" onClick={() => { tasks.forEach((x) => rescheduleTask(x.id, addDays(today, 1), x.time)); toast(t('tasks.movedToast')); }}>
            {t('common.tomorrow')}
          </button>
        </div>
      </div>
      <div className="list" style={{ marginTop: 6 }}>
        {tasks.slice(0, 8).map((x) => (
          <TaskRow key={x.id} task={x} showDate showProject />
        ))}
      </div>
      {tasks.length > 8 && (
        <button className="link-btn" style={{ padding: '6px 12px' }} onClick={() => navigate('tasks', { tab: 'overdue' })}>
          +{tasks.length - 8}
        </button>
      )}
    </div>
  );
}

// ── Mañana: check-in ───────────────────────────────────────────────────────────────────

function MorningCheckin({ today }: { today: string }) {
  const prefs = usePrefs();
  const [intention, setIntention] = useState('');
  const [bed, setBed] = useState(prefs.sleep.bed);
  const [wake, setWake] = useState(prefs.sleep.wake);
  const [energy, setEnergy] = useState<number | null>(null);
  const save = () => {
    saveDayLog(today, { intention: intention.trim(), sleepBed: bed, sleepWake: wake, energy, morningAt: new Date().toISOString() });
    if (energy) saveCheckin(energy, null, null);
  };
  return (
    <section className="card card-pad morning reveal" aria-labelledby="morning">
      <div className="row-flex gap-3" style={{ marginBottom: 14 }}>
        <span className="stat-icon"><Sunrise /></span>
        <h2 className="card-title" id="morning">{t('today.morningCheck')}</h2>
      </div>
      <label className="field">
        <span className="field-label">{t('today.intentionTitle')}</span>
        <input className="input intention-input" value={intention} onChange={(e) => setIntention(e.target.value)} placeholder={t('today.intentionPlaceholder')} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
      <div className="morning-row">
        <div className="field">
          <span className="field-label">{t('today.sleep')}</span>
          <div className="row-flex gap-2">
            <input type="time" className="input" value={bed} onChange={(e) => setBed(e.target.value)} aria-label={t('today.bedTime')} />
            <ArrowRight size={14} className="faint" />
            <input type="time" className="input" value={wake} onChange={(e) => setWake(e.target.value)} aria-label={t('today.wakeTime')} />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t('today.energy')}</span>
          <RatingInput value={energy} onChange={setEnergy} label={t('today.energy')} />
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={save}>
          {t('today.saveCheckin')}
        </button>
      </div>
    </section>
  );
}

// ── Noche: día completado ──────────────────────────────────────────────────────────────

function DayComplete({ today, todayTasks }: { today: string; todayTasks: Task[] }) {
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const sessions = useList('focusSessions');
  const dayLog = useEntity('dayLogs', dayLogId(today));
  const done = todayTasks.filter((x) => x.status === 'done').length;
  const hDone = habits.filter((h) => isComplete(h, index.get(h.id)?.get(today))).length;
  const focus = sessionsInRange(sessions, today, today).reduce((a, s) => a + s.focusSec, 0) / 60;
  return (
    <section className="card card-pad day-complete reveal">
      <div className="row-flex gap-3 wrap">
        <span className="stat-icon"><Moon /></span>
        <div className="grow">
          <h2 className="card-title">{t('today.dayComplete')}</h2>
          <p className="muted small" style={{ marginTop: 2 }}>{t('today.dayCompleteBody', { tasks: tp('today.nTasks', done), habits: tp('today.nHabits', hDone), focus: formatDuration(focus) })}</p>
        </div>
        <div className="row-flex gap-2">
          {!dayLog?.eveningAt && (
            <button className="btn" onClick={() => navigate('review', { tab: 'daily' })}>
              {t('today.reflect')}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => openPlanDay(addDays(today, 1))}>
            <Sunrise />
            {t('today.planTomorrow')}
          </button>
        </div>
      </div>
    </section>
  );
}

