import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Check, ChevronLeft, ChevronRight, Inbox, Sparkles, Sun, Sunrise, Ban, CircleCheck, Pause, Pencil, Archive } from 'lucide-react';
import { addDays, endOfWeek, localDateOf, startOfWeek } from '@core/dates';
import { completionStats } from '@core/habits';
import { isOpen, isOverdue, compareTasks } from '@core/tasks';
import { goalProgress, projectHealth } from '@core/progress';
import { periodSummary, sessionsInRange } from '@core/analytics';
import { updateEntity, useData, useEntity, useList, usePrefs } from '@/data/store';
import { useActiveHabits, useHabitLogIndex, useToday, useTimeline } from '@/data/selectors';
import { completeTask, dropTask, rescheduleTask, saveDayLog, saveReview, updateTask } from '@/data/actions';
import { dayLogId, reviewId } from '@/data/defaults';
import { formatDate, formatDuration, formatPercent, t, type TKey } from '@/i18n';
import { Bar, Chips, cx, Empty, Field, IconTile, RatingInput } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { navigate, openHabitEditor, toast, useUi } from '@/app/ui';
import { healthReason } from '@/features/projects/ProjectsScreen';
import './review.css';

type Tab = 'daily' | 'weekly' | 'reset' | 'journal';

export default function ReviewScreen() {
  const routeTab = useUi((s) => s.route.tab) as Tab | undefined;
  const [tab, setTab] = useState<Tab>(routeTab ?? 'daily');
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('review.title')}</h1>
          <p className="page-subtitle">{t('review.subtitle')}</p>
        </div>
      </header>
      <Chips value={tab} onChange={setTab} options={(['daily', 'weekly', 'reset', 'journal'] as Tab[]).map((x) => ({ value: x, label: t(`review.tabs.${x}` as TKey) }))} />
      <div style={{ marginTop: 18 }}>
        {tab === 'daily' && <Daily />}
        {tab === 'weekly' && <Weekly />}
        {tab === 'reset' && <Reset />}
        {tab === 'journal' && <Journal />}
      </div>
    </div>
  );
}

// ── Reflexión diaria ───────────────────────────────────────────────────────────────────

function Daily() {
  const today = useToday();
  const [date, setDate] = useState(today);
  return <DailyForm key={date} date={date} today={today} onDate={setDate} />;
}

function DailyForm({ date, today, onDate }: { date: string; today: string; onDate: (d: string) => void }) {
  const log = useEntity('dayLogs', dayLogId(date));
  const tasks = useList('tasks');
  const sessions = useList('focusSessions');
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const [f, setF] = useState(() => ({
    rating: log?.rating ?? null,
    energy: log?.energy ?? null,
    focus: log?.focus ?? null,
    mood: log?.mood ?? null,
    productivity: log?.productivity ?? null,
    highlight: log?.highlight ?? '',
    improve: log?.improve ?? '',
    journal: log?.journal ?? '',
  }));
  const done = tasks.filter((x) => x.status === 'done' && x.completedAt && localDateOf(x.completedAt) === date).length;
  const focusMin = sessionsInRange(sessions, date, date).reduce((a, s) => a + s.focusSec, 0) / 60;
  const habitsDone = habits.filter((h) => index.get(h.id)?.get(date)?.status === 'done').length;
  const save = () => {
    saveDayLog(date, { ...f, eveningAt: new Date().toISOString() });
    toast(t('review.reflectionSaved'));
  };
  return (
    <div className="review-grid">
      <section className="card card-pad stack gap-5">
        <div className="row-flex gap-2">
          <button className="btn btn-icon btn-sm" aria-label={t('a11y.previous')} onClick={() => onDate(addDays(date, -1))}><ChevronLeft /></button>
          <h2 className="card-title grow">{t('review.howWasDay')} <span className="faint">· {formatDate(date, 'long')}</span></h2>
          <button className="btn btn-icon btn-sm" aria-label={t('a11y.next')} disabled={date >= today} onClick={() => onDate(addDays(date, 1))}><ChevronRight /></button>
        </div>
        <div className="rating-rows">
          {(['rating', 'energy', 'focus', 'mood', 'productivity'] as const).map((k) => (
            <div key={k} className="field-row">
              <span className="small">{t(`review.${k}` as TKey)}</span>
              <RatingInput value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} label={t(`review.${k}` as TKey)} />
            </div>
          ))}
        </div>
        <Field label={t('review.highlight')}><textarea className="textarea" rows={2} value={f.highlight} onChange={(e) => setF({ ...f, highlight: e.target.value })} /></Field>
        <Field label={t('review.improve')}><textarea className="textarea" rows={2} value={f.improve} onChange={(e) => setF({ ...f, improve: e.target.value })} /></Field>
        <Field label={t('review.journal')}><textarea className="textarea" rows={5} value={f.journal} onChange={(e) => setF({ ...f, journal: e.target.value })} placeholder={t('review.journalPlaceholder')} /></Field>
        <div className="row-flex gap-2">
          <button className="btn btn-primary" onClick={save}><Check />{t('review.saveReflection')}</button>
          {date === today && <button className="btn" onClick={() => useUi.setState({ planDay: addDays(today, 1) })}><Sunrise />{t('today.planTomorrow')}</button>}
        </div>
      </section>
      <aside className="card card-pad facts">
        <div className="eyebrow">{t('review.todayFacts')}</div>
        <div className="fact"><span className="num">{done}</span><span className="faint small">{t('insights.tasksCompleted')}</span></div>
        <div className="fact"><span className="num">{formatDuration(focusMin)}</span><span className="faint small">{t('insights.focusHours')}</span></div>
        <div className="fact"><span className="num">{habitsDone}/{habits.length}</span><span className="faint small">{t('insights.habitsCompleted')}</span></div>
        {log?.intention && <div className="fact-quote">“{log.intention}”</div>}
      </aside>
    </div>
  );
}

// ── Revisión semanal ───────────────────────────────────────────────────────────────────

function Weekly() {
  const prefs = usePrefs();
  const today = useToday();
  const [weekStart, setWeekStart] = useState(startOfWeek(today, 1));
  return <WeeklyForm key={weekStart} weekStart={weekStart} weekStartsOn={prefs.weekStartsOn} today={today} onWeek={setWeekStart} />;
}

function WeeklyForm({ weekStart, today, onWeek }: { weekStart: string; weekStartsOn: 0 | 1; today: string; onWeek: (w: string) => void }) {
  const review = useEntity('reviews', reviewId(weekStart));
  const c = useData((s) => s.c);
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const prefs = usePrefs();
  const weekEnd = endOfWeek(weekStart, 1);
  const [f, setF] = useState(() => ({
    accomplished: review?.accomplished ?? '',
    wentWell: review?.wentWell ?? '',
    didntGoWell: review?.didntGoWell ?? '',
    change: review?.change ?? '',
    priorities: review?.priorities ?? '',
    summary: review?.summary ?? '',
  }));
  const data = useMemo(() => {
    let scheduled = 0;
    let done = 0;
    for (const h of habits) {
      const st = completionStats(h, index.get(h.id) ?? new Map(), weekStart, weekEnd, today, prefs.vacations);
      scheduled += st.scheduled;
      done += st.done;
    }
    const sum = periodSummary(weekStart, weekEnd, { tasks: Object.values(c.tasks), sessions: Object.values(c.focusSessions), entries: Object.values(c.timeEntries), habitLogs: Object.values(c.habitLogs), habitScheduled: scheduled });
    const goals = Object.values(c.goals).filter((g) => !g.deletedAt && g.status === 'active').map((g) => ({ goal: g, p: goalProgress(g, { milestones: Object.values(c.milestones), tasks: Object.values(c.tasks), projects: Object.values(c.projects), sessions: Object.values(c.focusSessions), entries: Object.values(c.timeEntries) }, today) }));
    const overdue = Object.values(c.tasks).filter((x) => isOverdue(x, today)).length;
    return { sum, habitDone: done, habitScheduled: scheduled, goals, overdue };
  }, [c, habits, index, weekStart, weekEnd, today, prefs.vacations]);

  /** Resumen generado SOLO a partir de los datos registrados (nunca inventa). */
  const generate = () => {
    const s = data.sum;
    const parts = [t('review.summaryText.tasks', { count: s.tasksCompleted })];
    parts.push(s.focus.sessions > 0 ? t('review.summaryText.focus', { duration: formatDuration(s.focus.totalSec / 60), sessions: s.focus.sessions }) : t('review.summaryText.noFocus'));
    if (s.bestDay && s.bestDay.minutes > 0) parts.push(t('review.summaryText.bestDay', { day: formatDate(s.bestDay.date, 'weekday').toLowerCase(), duration: formatDuration(s.bestDay.minutes) }));
    const top = s.topProjects[0];
    if (top) parts.push(t('review.summaryText.topProject', { project: top.projectId ? c.projects[top.projectId]?.name ?? '—' : t('insights.noProject'), duration: formatDuration(top.minutes) }));
    if (data.habitScheduled > 0) parts.push(t('review.summaryText.habits', { done: data.habitDone, scheduled: data.habitScheduled }));
    if (data.overdue > 0) parts.push(t('review.summaryText.overdue', { count: data.overdue }));
    const next = Object.values(c.tasks).filter((x) => isOpen(x) && x.priority <= 2 && (x.deadline ?? x.date ?? '9999') <= addDays(weekEnd, 7)).sort(compareTasks).slice(0, 3).map((x) => x.title);
    if (next.length) parts.push(t('review.summaryText.next', { items: next.join(', ') }));
    setF({ ...f, summary: parts.join(' ') });
  };
  const save = () => {
    saveReview(weekStart, { ...f, completedAt: new Date().toISOString() });
    toast(t('review.reviewSaved'));
  };
  return (
    <div className="review-grid">
      <section className="card card-pad stack gap-4">
        <div className="row-flex gap-2">
          <button className="btn btn-icon btn-sm" aria-label={t('a11y.previous')} onClick={() => onWeek(addDays(weekStart, -7))}><ChevronLeft /></button>
          <h2 className="card-title grow">{t('review.weekOf', { from: formatDate(weekStart, 'dayMonth'), to: formatDate(weekEnd, 'dayMonth') })}</h2>
          <button className="btn btn-icon btn-sm" aria-label={t('a11y.next')} disabled={weekEnd >= today} onClick={() => onWeek(addDays(weekStart, 7))}><ChevronRight /></button>
          {review?.completedAt && <span className="tag success"><Check size={11} /> {t('common.done')}</span>}
        </div>
        {(['accomplished', 'wentWell', 'didntGoWell', 'change', 'priorities'] as const).map((k) => (
          <Field key={k} label={t(`review.${k}` as TKey)}><textarea className="textarea" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
        <div className="summary-box">
          <div className="row-flex gap-2" style={{ justifyContent: 'space-between' }}>
            <span className="eyebrow">{t('review.summaryLabel')}</span>
            <button className="btn btn-sm btn-subtle" onClick={generate}><Sparkles />{t('review.generateSummary')}</button>
          </div>
          <textarea className="textarea" rows={4} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          <p className="faint xs">{t('review.summaryHint')}</p>
        </div>
        <div><button className="btn btn-primary" onClick={save}><Check />{t('review.saveReview')}</button></div>
      </section>
      <aside className="card card-pad facts">
        <div className="eyebrow">{t('review.weekData')}</div>
        <div className="fact"><span className="num">{data.sum.tasksCompleted}</span><span className="faint small">{t('insights.tasksCompleted')}</span></div>
        <div className="fact"><span className="num">{formatDuration(data.sum.focus.totalSec / 60)}</span><span className="faint small">{t('insights.focusHours')}</span></div>
        <div className="fact"><span className="num">{data.habitScheduled ? formatPercent(data.habitDone / data.habitScheduled) : '—'}</span><span className="faint small">{t('review.habitRate')}</span></div>
        <div className="eyebrow" style={{ marginTop: 16 }}>{t('review.goalsProgress')}</div>
        {data.goals.slice(0, 6).map(({ goal, p }) => (
          <div key={goal.id} className="stack gap-1" style={{ marginTop: 8 }}>
            <div className="row-flex gap-2 small"><span className="grow ellipsis">{goal.icon} {goal.title}</span><span className="num faint">{Math.round(p.ratio * 100)}%</span></div>
            <Bar value={p.ratio} thin color={colorValue(goal.color)} />
          </div>
        ))}
      </aside>
    </div>
  );
}

// ── Reset semanal ──────────────────────────────────────────────────────────────────────

function Reset() {
  const today = useToday();
  const tasks = useList('tasks');
  const notes = useList('notes');
  const projects = useList('projects');
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const prefs = usePrefs();
  const [done, setDone] = useState<Set<string>>(new Set());
  const nextWeek = addDays(startOfWeek(today, 1), 7);
  const upcoming = useTimeline(nextWeek, addDays(nextWeek, 6));
  const inboxCount = tasks.filter((x) => isOpen(x) && x.inbox).length + notes.filter((n) => n.inbox && !n.archived).length;
  const overdue = tasks.filter((x) => isOverdue(x, today)).sort(compareTasks);
  const active = projects.filter((p) => p.status === 'active');
  const mark = (k: string) => {
    const n = new Set(done);
    n.add(k);
    setDone(n);
    toast(t('review.resetDone'));
  };
  return (
    <div className="stack gap-4">
      <div><h2 className="section-title">{t('review.resetTitle')}</h2><p className="faint small">{t('review.resetHint')}</p></div>
      <Step done={done} onDone={mark} id="inbox" n={1} title={`${t('review.resetSteps.inbox')} · ${inboxCount}`}>
        {inboxCount === 0 ? <p className="faint small">{t('review.resetInboxEmpty')}</p> : <button className="btn btn-sm" onClick={() => navigate('inbox')}><Inbox />{t('common.open')}</button>}
      </Step>
      <Step done={done} onDone={mark} id="overdue" n={2} title={`${t('review.resetSteps.overdue')} · ${overdue.length}`}>
        {overdue.length === 0 && <p className="faint small">{t('review.resetOverdueEmpty')}</p>}
        {overdue.slice(0, 12).map((x) => (
          <div key={x.id} className="reset-row">
            <span className="grow ellipsis small">{x.title}</span>
            <button className="btn btn-sm btn-ghost" title={t('common.complete')} onClick={() => completeTask(x.id)}><CircleCheck /></button>
            <button className="btn btn-sm btn-ghost" onClick={() => rescheduleTask(x.id, today)}><Sun />{t('common.today')}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => rescheduleTask(x.id, nextWeek)}>{t('common.reschedule')}</button>
            <button className="btn btn-sm btn-ghost" title={t('common.delegate')} onClick={() => updateTask(x.id, { quadrant: 'delegate' })}>{t('common.delegate')}</button>
            <button className="btn btn-sm btn-ghost" title={t('common.drop')} onClick={() => dropTask(x.id)}><Ban /></button>
          </div>
        ))}
      </Step>
      <Step done={done} onDone={mark} id="projects" n={3} title={`${t('review.resetSteps.projects')} · ${active.length}`}>
        {active.map((p) => {
          const h = projectHealth(p, tasks, today);
          return (
            <div key={p.id} className="reset-row">
              <IconTile icon={p.icon} color={p.color} size="sm" />
              <button className="grow ellipsis small" style={{ textAlign: 'left' }} onClick={() => navigate('projects', { id: p.id })}><b>{p.name}</b> <span className="faint">· {healthReason(h)}</span></button>
              <button className="btn btn-sm btn-ghost" title={t('projects.status.paused')} onClick={() => updateEntity('projects', p.id, { status: 'paused' })}><Pause /></button>
              <button className="btn btn-sm btn-ghost" title={t('projects.markDone')} onClick={() => updateEntity('projects', p.id, { status: 'done', completedAt: new Date().toISOString() })}><Check /></button>
            </div>
          );
        })}
      </Step>
      <Step done={done} onDone={mark} id="habits" n={4} title={t('review.resetSteps.habits')}>
        {habits.map((h) => {
          const st = completionStats(h, index.get(h.id) ?? new Map(), addDays(today, -13), today, today, prefs.vacations);
          return (
            <div key={h.id} className="reset-row">
              <span className="small grow">{h.icon} {h.name}</span>
              <span className="num xs faint" style={{ width: 60 }}>{formatPercent(st.rate)}</span>
              <div style={{ width: 120 }}><Bar value={st.rate} thin color={colorValue(h.color)} /></div>
              <button className="btn btn-sm btn-ghost" onClick={() => openHabitEditor(h.id)}><Pencil /></button>
              <button className="btn btn-sm btn-ghost" title={t('habits.archive')} onClick={() => updateEntity('habits', h.id, { archived: true })}><Archive /></button>
            </div>
          );
        })}
      </Step>
      <Step done={done} onDone={mark} id="calendar" n={5} title={`${t('review.resetSteps.calendar')} · ${upcoming.filter((i) => i.kind !== 'habit').length}`}>
        <button className="btn btn-sm" onClick={() => navigate('calendar')}>{t('nav.calendar')}</button>
      </Step>
    </div>
  );
}

function Step({ id, n, title, children, done, onDone }: { id: string; n: number; title: string; children: ReactNode; done: Set<string>; onDone: (id: string) => void }) {
  const isDone = done.has(id);
  return (
    <section className={cx('card card-pad reset-step', isDone && 'done')}>
      <div className="row-flex gap-3">
        <span className="step-n num">{isDone ? <Check size={14} /> : n}</span>
        <h3 className="card-title grow">{title}</h3>
        {!isDone && <button className="btn btn-sm btn-ghost" onClick={() => onDone(id)}><Check />{t('review.resetDone')}</button>}
      </div>
      {!isDone && <div style={{ marginTop: 12 }}>{children}</div>}
    </section>
  );
}

// ── Diario ─────────────────────────────────────────────────────────────────────────────

function Journal() {
  const logs = useList('dayLogs');
  const entries = logs.filter((l) => l.journal || l.highlight || l.improve || l.intention).sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length === 0) return <div className="card"><Empty icon={<BookOpen />} title={t('review.journalEmpty')} /></div>;
  return (
    <div className="stack gap-3">
      {entries.map((l) => (
        <article key={l.id} className="card card-pad journal-entry">
          <div className="row-flex gap-3">
            <h3 className="card-title grow">{formatDate(l.date, 'long')}</h3>
            {l.rating && <span className="tag accent">★ {l.rating}</span>}
            {l.mood && <span className="tag">{t('review.mood')} {l.mood}</span>}
            {l.energy && <span className="tag">{t('review.energy')} {l.energy}</span>}
          </div>
          {l.intention && <p className="small" style={{ marginTop: 8 }}><span className="faint">{t('today.intentionTitle')} </span>{l.intention}</p>}
          {l.highlight && <p className="small" style={{ marginTop: 6 }}><span className="faint">{t('review.highlight')} </span>{l.highlight}</p>}
          {l.improve && <p className="small" style={{ marginTop: 6 }}><span className="faint">{t('review.improve')} </span>{l.improve}</p>}
          {l.journal && <p className="muted small selectable" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{l.journal}</p>}
        </article>
      ))}
    </div>
  );
}
