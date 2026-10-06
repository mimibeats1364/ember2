import { useMemo, useState, type CSSProperties } from 'react';
import { CircleCheck, Flame, Timer, Waypoints, Trophy, Lightbulb, ChartColumn } from 'lucide-react';
import { bestWindow, computeInsights, dailySeries, focusByHour, periodSummary, sessionsInRange, type HeatMetric, type Insight } from '@core/analytics';
import { addDays, addMonths, endOfMonth, endOfWeek, endOfYear, localDateOf, startOfMonth, startOfWeek, startOfYear, ymd, eachDay } from '@core/dates';
import { completionStats } from '@core/habits';
import { trackedMinutes } from '@core/progress';
import { achievements, levelFor, totalXp } from '@core/gamification';
import { useCollection, useList, usePrefs } from '@/data/store';
import { useActiveHabits, useHabitLogIndex, useToday } from '@/data/selectors';
import { formatDate, formatDuration, formatPercent, hourLabel, t, weekdayInitial, weekdayName, type TKey } from '@/i18n';
import { Bar, cx, Empty, IconTile, Segmented } from '@/ui/components/primitives';
import { BarChart, Heatmap } from '@/ui/components/charts';
import { colorValue } from '@/ui/theme/palette';
import { useUi } from '@/app/ui';
import './insights.css';

type Period = 'week' | 'month' | 'year';

export default function InsightsScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<HeatMetric>('focus');
  const today = useToday();
  const prefs = usePrefs();
  const tasks = useList('tasks');
  const sessionsAll = useList('focusSessions');
  const entries = useList('timeEntries');
  const habitLogs = useList('habitLogs');
  const dayLogs = useList('dayLogs');
  const checkins = useList('checkins');
  const projects = useCollection('projects');
  const habits = useActiveHabits();
  const index = useHabitLogIndex();
  const reviews = useList('reviews');
  const projectsList = useList('projects');

  const from = period === 'week' ? startOfWeek(today, prefs.weekStartsOn) : period === 'month' ? startOfMonth(today) : startOfYear(today);
  const to = period === 'week' ? endOfWeek(today, prefs.weekStartsOn) : period === 'month' ? endOfMonth(today) : endOfYear(today);
  const summary = useMemo(() => {
    let scheduled = 0;
    let done = 0;
    for (const h of habits) {
      const st = completionStats(h, index.get(h.id) ?? new Map(), from, to, today, prefs.vacations);
      scheduled += st.scheduled;
      done += st.done;
    }
    return { ...periodSummary(from, to, { tasks, sessions: sessionsAll, entries, habitLogs, habitScheduled: scheduled }), habitDoneSched: done };
  }, [from, to, tasks, sessionsAll, entries, habitLogs, habits, index, today, prefs.vacations]);

  const sessions = useMemo(() => sessionsInRange(sessionsAll, from, to), [sessionsAll, from, to]);
  const byDay = useMemo(() => {
    if (period === 'year') {
      return Array.from({ length: 12 }, (_, i) => {
        const ms = addMonths(from, i);
        const minutes = sessionsInRange(sessionsAll, ms, endOfMonth(ms)).reduce((a, s) => a + s.focusSec, 0) / 60;
        return { label: formatDate(ms, 'month').slice(0, 1).toUpperCase(), value: Math.round(minutes), tip: `${formatDate(ms, 'monthYear')} · ${formatDuration(minutes)}` };
      });
    }
    return eachDay(from, to).map((d) => {
      const minutes = sessionsInRange(sessionsAll, d, d).reduce((a, s) => a + s.focusSec, 0) / 60;
      return { label: period === 'week' ? weekdayInitial(d) : String(ymd(d)[2]), value: Math.round(minutes), tip: `${formatDate(d, 'dayMonth')} · ${formatDuration(minutes)}` };
    });
  }, [period, from, to, sessionsAll]);
  const hours = useMemo(() => focusByHour(sessions), [sessions]);
  const window = bestWindow(hours, 3);
  const heat = useMemo(() => dailySeries(metric, addDays(today, -364), today, { sessions: sessionsAll, tasks, habitLogs }), [metric, today, sessionsAll, tasks, habitLogs]);
  const estimate = useMemo(() => {
    const done = tasks.filter((x) => x.status === 'done' && x.durationMin && x.completedAt && localDateOf(x.completedAt) >= from && localDateOf(x.completedAt) <= to);
    const rows = done.map((x) => ({ task: x, estimateMin: x.durationMin!, actualMin: trackedMinutes(sessionsAll, entries, (tid) => tid === x.id) })).filter((r) => r.actualMin > 0);
    return { rows, planned: rows.reduce((a, r) => a + r.estimateMin, 0), actual: rows.reduce((a, r) => a + r.actualMin, 0) };
  }, [tasks, sessionsAll, entries, from, to]);
  const insights = useMemo(
    () =>
      computeInsights({
        sessions: sessionsAll,
        dayLogs,
        checkins,
        doneTasksWithEstimate: tasks.filter((x) => x.status === 'done' && x.durationMin).map((x) => ({ estimateMin: x.durationMin!, actualMin: trackedMinutes(sessionsAll, entries, (tid) => tid === x.id) })),
      }),
    [sessionsAll, dayLogs, checkins, tasks, entries],
  );
  const maxProject = Math.max(1, ...summary.topProjects.map((p) => p.minutes));
  const empty = summary.tasksCompleted === 0 && summary.focus.sessions === 0 && summary.habitDone === 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('insights.title')}</h1>
          <p className="page-subtitle">{t('insights.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Segmented value={period} onChange={setPeriod} options={(['week', 'month', 'year'] as Period[]).map((p) => ({ value: p, label: t(`insights.periods.${p}` as TKey) }))} />
          <button className="btn btn-sm btn-primary" onClick={() => useUi.setState({ yearReview: true })}><Trophy />{t('insights.yearInReview')}</button>
        </div>
      </header>

      {empty && <div className="card" style={{ marginBottom: 18 }}><Empty icon={<ChartColumn />} title={t('insights.emptyState')} /></div>}

      <p className="insights-summary">
        {t('insights.summary', { period: t(`insights.periods.${period}` as TKey).toLowerCase(), focus: formatDuration(summary.focus.totalSec / 60), tasks: summary.tasksCompleted })}
      </p>

      <div className="grid-4">
        <div className="card stat"><div className="label"><Timer />{t('insights.focusHours')}</div><div className="value">{formatDuration(summary.focus.totalSec / 60)}</div><div className="sub">{summary.focus.sessions} {t('insights.sessions').toLowerCase()}</div></div>
        <div className="card stat"><div className="label"><CircleCheck />{t('insights.tasksCompleted')}</div><div className="value">{summary.tasksCompleted}</div><div className="sub">{t('insights.created', { count: summary.tasksCreated })}</div></div>
        <div className="card stat"><div className="label"><Flame />{t('insights.habitsCompleted')}</div><div className="value">{summary.habitDone}</div><div className="sub">{summary.habitScheduled ? formatPercent(summary.habitDoneSched / summary.habitScheduled) : '—'}</div></div>
        <div className="card stat"><div className="label"><Waypoints />{t('insights.deepWork')}</div><div className="value">{summary.focus.deepSessions}</div><div className="sub">≥ 50 min</div></div>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <section className="card card-pad">
          <div className="card-header"><h2 className="card-title">{t('insights.focusByDay')}</h2>{summary.bestDay && summary.bestDay.minutes > 0 && <span className="faint xs">{t('insights.mostProductiveDay')}: {formatDate(summary.bestDay.date, 'weekday')}</span>}</div>
          <BarChart data={byDay} height={170} highlight={byDay.reduce((bi, d, i, arr) => (d.value > arr[bi].value ? i : bi), 0)} xEvery={period === 'month' ? 5 : 1} formatValue={(v) => formatDuration(v)} />
        </section>
        <section className="card card-pad">
          <div className="card-header"><h2 className="card-title">{t('insights.focusByHour')}</h2>{window && <span className="faint xs">{t('insights.mostProductiveHours')}: {hourLabel(window.start)}–{hourLabel(window.end)}</span>}</div>
          <BarChart data={hours.map((m, h) => ({ label: String(h), value: m, tip: `${hourLabel(h)} · ${formatDuration(m)}` }))} height={170} xEvery={3} highlight={window ? hours.indexOf(Math.max(...hours.slice(window.start, window.end))) : undefined} formatValue={(v) => formatDuration(v)} />
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2 className="card-title">{t('insights.heatmap')}</h2>
          <Segmented value={metric} onChange={setMetric} options={(['focus', 'tasks', 'habits'] as HeatMetric[]).map((m) => ({ value: m, label: t(`insights.heatMetric.${m}` as TKey) }))} />
        </div>
        <Heatmap series={heat} weekStartsOn={prefs.weekStartsOn} formatTip={(d) => `${formatDate(d.date, 'dayMonth')}: ${metric === 'focus' ? formatDuration(d.value) : d.value}`} />
      </section>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <section className="card card-pad">
          <div className="card-header"><h2 className="card-title">{t('insights.byProject')}</h2></div>
          {summary.topProjects.length === 0 && <p className="faint small">—</p>}
          {summary.topProjects.map((p) => {
            const pr = p.projectId ? projects[p.projectId] : undefined;
            return (
              <div key={p.projectId ?? 'none'} className="proj-bar">
                <span className="ellipsis small" style={{ fontWeight: 600 }}>{pr ? `${pr.icon} ${pr.name}` : t('insights.noProject')}</span>
                <Bar value={p.minutes / maxProject} color={pr ? colorValue(pr.color) : undefined} />
                <span className="num xs faint">{formatDuration(p.minutes)}</span>
              </div>
            );
          })}
        </section>
        <section className="card card-pad">
          <div className="card-header"><h2 className="card-title">{t('insights.focusStats')}</h2></div>
          <div className="focus-stat-grid">
            <div><div className="faint xs">{t('insights.sessions')}</div><div className="num big">{summary.focus.sessions}</div></div>
            <div><div className="faint xs">{t('insights.total')}</div><div className="num big">{formatDuration(summary.focus.totalSec / 60)}</div></div>
            <div><div className="faint xs">{t('insights.average')}</div><div className="num big">{formatDuration(summary.focus.avgSec / 60)}</div></div>
            <div><div className="faint xs">{t('insights.longest')}</div><div className="num big">{formatDuration(summary.focus.longestSec / 60)}</div></div>
            <div><div className="faint xs">{t('insights.interrupted')}</div><div className="num big">{summary.focus.interrupted}</div></div>
          </div>
        </section>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <section className="card card-pad">
          <div className="card-header"><h2 className="card-title"><Lightbulb size={15} /> {t('insights.patterns')}</h2></div>
          <p className="faint xs" style={{ marginBottom: 10 }}>{t('insights.patternsHint')}</p>
          {insights.length === 0 ? <p className="muted small">{t('insights.notEnoughData')}</p> : (
            <ul className="insight-list">{insights.map((ins, i) => <li key={i}>{insightText(ins)}</li>)}</ul>
          )}
        </section>
        <section className="card card-pad">
          <div className="card-header"><h2 className="card-title">{t('insights.estimates')}</h2></div>
          <p className="faint xs" style={{ marginBottom: 10 }}>{t('insights.estimatesHint')}</p>
          {estimate.rows.length === 0 ? <p className="faint small">—</p> : (
            <>
              <div className="row-flex gap-4">
                <div><div className="faint xs">{t('insights.plannedTotal')}</div><div className="num big">{formatDuration(estimate.planned)}</div></div>
                <div><div className="faint xs">{t('insights.actualTotal')}</div><div className="num big" style={{ color: estimate.actual > estimate.planned * 1.15 ? 'var(--warning)' : undefined }}>{formatDuration(estimate.actual)}</div></div>
              </div>
              <div style={{ marginTop: 10 }}>
                {estimate.rows.slice(0, 6).map((r) => (
                  <div key={r.task.id} className="row-flex gap-2 xs" style={{ padding: '4px 0' }}>
                    <span className="grow ellipsis">{r.task.title}</span>
                    <span className="num faint">{formatDuration(r.estimateMin)} → {formatDuration(r.actualMin)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {prefs.gamification && <Achievements tasks={tasks} habits={habits} habitLogs={habitLogs} sessions={sessionsAll} projects={projectsList} reviews={reviews} today={today} vacations={prefs.vacations} />}
    </div>
  );
}

export function insightText(i: Insight): string {
  switch (i.kind) {
    case 'best_hours':
      return t('insights.insight.best_hours', { start: hourLabel(i.start), end: hourLabel(i.end), sessions: i.sessions });
    case 'best_weekday':
      return t('insights.insight.best_weekday', { weekday: weekdayName(i.weekday).toLowerCase() });
    case 'sleep_focus':
      return t('insights.insight.sleep_focus', { more: formatDuration(i.withMore), less: formatDuration(i.withLess), days: i.days });
    case 'energy_hours':
      return t('insights.insight.energy_hours', { start: hourLabel(i.start), end: hourLabel(i.end) });
    case 'estimate_bias':
      return i.ratio > 1 ? t('insights.insight.estimate_bias_over', { pct: Math.round((i.ratio - 1) * 100), samples: i.samples }) : t('insights.insight.estimate_bias_under', { pct: Math.round((1 - i.ratio) * 100), samples: i.samples });
    case 'interruptions':
      return t('insights.insight.interruptions', { pct: Math.round((1 - i.rate) * 100) });
  }
}

function Achievements(props: Parameters<typeof totalXp>[0] & { today: string; vacations: { start: string; end: string | null }[] }) {
  const xp = totalXp(props);
  const lvl = levelFor(xp);
  const list = achievements(props, props.today, props.vacations);
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title"><Trophy size={15} /> {t('insights.achievements')}</h2>
        <span className="faint small">{t('insights.level', { level: lvl.level })} · {t('insights.xp', { xp })}</span>
      </div>
      <div style={{ marginBottom: 14 }}><Bar value={lvl.progress} /></div>
      <div className="ach-grid">
        {list.map((a) => (
          <div key={a.id} className={cx('card ach', a.unlocked && 'unlocked')} style={{ '--ac': a.unlocked ? 'var(--accent)' : 'var(--text-3)' } as CSSProperties}>
            <IconTile icon={a.icon} color={a.unlocked ? 'ember' : 'slate'} />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{t(`achievements.${a.id}.title` as TKey)}</div>
              <div className="faint xs">{t(`achievements.${a.id}.body` as TKey)}</div>
              <div className="row-flex gap-2" style={{ marginTop: 8 }}><div className="grow"><Bar value={a.value / a.target} thin /></div><span className="num xs faint">{a.value}/{a.target}</span></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
