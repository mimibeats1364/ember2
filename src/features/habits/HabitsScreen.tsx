import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowDown, Check, ChevronLeft, ChevronRight, Flame, Minus, Pencil, Plus, TreePalm, Ban, Trash, CircleDot } from 'lucide-react';
import type { Habit, HabitLog } from '@core/types';
import { addDays, addMonths, daysInMonth, endOfMonth, eachDay, startOfMonth, startOfWeek, ymd, startOfYear, endOfWeek } from '@core/dates';
import { completionStats, dayState, habitChains, isComplete, isOnVacation, isScheduled, type HabitDayState } from '@core/habits';
import { usePrefs } from '@/data/store';
import { useActiveHabits, useHabitLogIndex, useStreaks, useToday } from '@/data/selectors';
import { incrementHabit, setHabitLog, setVacation, toggleHabit } from '@/data/actions';
import { formatDate, formatPercent, t, tp, weekdayInitial, type TKey } from '@/i18n';
import { describeFrequency } from '@/ui/format';
import { Bar, Chips, cx, Empty, HabitCell, IconTile, openContextMenu, Segmented, type MenuEntry } from '@/ui/components/primitives';
import { AreaChart, BarChart, Heatmap } from '@/ui/components/charts';
import { colorValue } from '@/ui/theme/palette';
import { openHabitEditor, useUi } from '@/app/ui';
import { dailySeries } from '@core/analytics';
import './habits.css';

type Tab = 'today' | 'month' | 'stats' | 'chains';

export default function HabitsScreen() {
  const routeTab = useUi((s) => s.route.tab) as Tab | undefined;
  const [tab, setTab] = useState<Tab>(routeTab ?? 'today');
  const habits = useActiveHabits();
  const prefs = usePrefs();
  const today = useToday();
  const onVacation = isOnVacation(today, prefs.vacations);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('habits.title')}</h1>
          <p className="page-subtitle">{t('habits.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className={cx('btn btn-sm', onVacation && 'btn-subtle')} onClick={() => setVacation(!onVacation)}>
            <TreePalm /> {onVacation ? t('habits.vacationEnd') : t('habits.vacationStart')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => openHabitEditor(null)}>
            <Plus /> {t('habits.newHabit')}
          </button>
        </div>
      </header>
      {onVacation && <div className="banner info" style={{ marginBottom: 16 }}><TreePalm />{t('habits.vacationOn')}</div>}
      <Chips value={tab} onChange={setTab} options={(['today', 'month', 'stats', 'chains'] as Tab[]).map((x) => ({ value: x, label: t(`habits.tabs.${x}` as TKey) }))} />
      <div style={{ marginTop: 18 }}>
        {habits.length === 0 ? (
          <div className="card">
            <Empty icon={<Flame />} title={t('habits.empty')} body={t('habits.emptyHint')} action={<button className="btn btn-primary btn-sm" onClick={() => openHabitEditor(null)}><Plus />{t('habits.createFirst')}</button>} />
          </div>
        ) : tab === 'today' ? (
          <TodayCards habits={habits} today={today} />
        ) : tab === 'month' ? (
          <MonthGrid habits={habits} today={today} />
        ) : tab === 'stats' ? (
          <Stats habits={habits} today={today} />
        ) : (
          <Chains habits={habits} today={today} />
        )}
      </div>
    </div>
  );
}

export function habitMenu(habit: Habit, date: string, log: HabitLog | undefined): MenuEntry[] {
  return [
    { label: t('habits.actions.markDone'), icon: <Check />, onSelect: () => setHabitLog(habit.id, date, 'done', habit.target) },
    { label: t('habits.actions.skip'), icon: <Ban />, onSelect: () => setHabitLog(habit.id, date, 'skipped', 0) },
    ...(habit.target > 1
      ? [{ label: t('habits.actions.partial'), icon: <CircleDot />, onSelect: () => setHabitLog(habit.id, date, 'partial', Math.max(1, Math.floor(habit.target / 2))) }]
      : []),
    ...(log ? [{ separator: true }, { label: t('habits.actions.clear'), icon: <Trash />, danger: true, onSelect: () => setHabitLog(habit.id, date, null) }] : []),
    { separator: true },
    { label: t('common.edit'), icon: <Pencil />, onSelect: () => openHabitEditor(habit.id) },
  ];
}

function cellState(s: HabitDayState): string {
  return s === 'pending' ? 'missed' : s;
}

// ── Hoy ────────────────────────────────────────────────────────────────────────────────

function TodayCards({ habits, today }: { habits: Habit[]; today: string }) {
  const index = useHabitLogIndex();
  const streaks = useStreaks();
  const prefs = usePrefs();
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today, prefs.weekStartsOn), i)), [today, prefs.weekStartsOn]);
  return (
    <div className="habit-cards">
      {habits.map((h, i) => {
        const logs = index.get(h.id) ?? new Map();
        const log = logs.get(today);
        const st = dayState(h, log, today, today, prefs.vacations);
        const streak = streaks.get(h.id);
        const value = log && log.status !== 'skipped' ? log.value : 0;
        const scheduledToday = isScheduled(h, today);
        return (
          <article key={h.id} className={cx('card habit-card reveal', `reveal-${Math.min(6, i + 1)}`, st === 'done' && 'done')} style={{ '--hc': colorValue(h.color) } as CSSProperties}>
            <div className="row-flex gap-3">
              <IconTile icon={h.icon} color={h.color} />
              <div className="grow" style={{ minWidth: 0 }}>
                <button className="habit-title ellipsis" onClick={() => openHabitEditor(h.id)}>{h.name}</button>
                <div className="faint xs">{describeFrequency(h.frequency)}{h.preferredTime ? ` · ${h.preferredTime}` : ''}</div>
              </div>
              <HabitCell
                color={h.color}
                state={cellState(st)}
                fill={h.target > 1 ? value / h.target : undefined}
                size="lg"
                label={t('a11y.toggleHabit', { name: h.name, state: t(`habits.states.${st}` as TKey) })}
                onClick={() => toggleHabit(h.id, today)}
                onContextMenu={(e) => openContextMenu(e, habitMenu(h, today, log))}
              />
            </div>
            {h.target > 1 && (
              <div className="row-flex gap-2" style={{ marginTop: 12 }}>
                <button className="btn btn-icon btn-sm" aria-label={t('habits.decrement')} onClick={() => incrementHabit(h.id, today, -1)} disabled={value === 0}><Minus /></button>
                <div className="grow"><Bar value={value / h.target} color={colorValue(h.color)} /></div>
                <span className="num small">{value}/{h.target} {h.unit}</span>
                <button className="btn btn-icon btn-sm" aria-label={t('habits.increment')} onClick={() => incrementHabit(h.id, today, 1)}><Plus /></button>
              </div>
            )}
            <div className="habit-week">
              {week.map((d) => {
                const s = dayState(h, logs.get(d), d, today, prefs.vacations);
                return (
                  <div key={d} className="habit-week-day">
                    <span className={cx('wd', d === today && 'today')}>{weekdayInitial(d)}</span>
                    <HabitCell
                      color={h.color}
                      state={cellState(s)}
                      fill={h.target > 1 ? (logs.get(d)?.value ?? 0) / h.target : undefined}
                      size="sm"
                      today={d === today}
                      label={`${formatDate(d, 'weekday')}: ${t(`habits.states.${s}` as TKey)}`}
                      onClick={d <= today ? () => toggleHabit(h.id, d) : undefined}
                      onContextMenu={(e) => openContextMenu(e, habitMenu(h, d, logs.get(d)))}
                    />
                  </div>
                );
              })}
            </div>
            <div className="habit-foot">
              <span className="streak">
                🔥 <b className="num">{streak ? (streak.unit === 'weeks' ? tp('habits.weeks', streak.current) : tp('habits.days', streak.current)) : '—'}</b>
              </span>
              <span className="faint xs">{t('habits.best')}: {streak ? (streak.unit === 'weeks' ? tp('habits.weeks', streak.best) : tp('habits.days', streak.best)) : '—'}</span>
              {streak && streak.graceUsedThisWeek > 0 && <span className="tag" title={t('habits.graceHint')}>{t('habits.graceUsed')}</span>}
              {streak && streak.current === 0 && streak.best > 0 && scheduledToday && st !== 'done' && <span className="faint xs">{t('habits.recovery')}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ── Mes (rejilla del Reel) ─────────────────────────────────────────────────────────────

function MonthGrid({ habits, today }: { habits: Habit[]; today: string }) {
  const [month, setMonth] = useState(startOfMonth(today));
  const index = useHabitLogIndex();
  const prefs = usePrefs();
  const [y, m] = ymd(month);
  const days = Array.from({ length: daysInMonth(y, m) }, (_, i) => addDays(month, i));
  const series = useMemo(
    () =>
      days.map((d) => {
        let scheduled = 0;
        let done = 0;
        for (const h of habits) {
          const s = dayState(h, index.get(h.id)?.get(d), d, today, prefs.vacations);
          if (s === 'done') {
            scheduled++;
            done++;
          } else if (s === 'missed' || s === 'partial' || s === 'pending') scheduled++;
        }
        return { date: d, rate: d > today ? null : scheduled ? done / scheduled : 0, done, scheduled };
      }),
    [days.join(), habits, index, today, prefs.vacations],
  );
  const past = series.filter((s) => s.rate !== null);
  const totalDone = past.reduce((a, s) => a + s.done, 0);
  const totalSched = past.reduce((a, s) => a + s.scheduled, 0);
  const rate = totalSched ? totalDone / totalSched : 0;
  return (
    <div className="stack gap-5">
      <section className="card card-pad month-chart">
        <div className="card-header">
          <div className="row-flex gap-2">
            <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('a11y.previous')} onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></button>
            <h2 className="card-title">{t('habits.monthProgress', { month: formatDate(month, 'monthYear') })}</h2>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('a11y.next')} onClick={() => setMonth(addMonths(month, 1))} disabled={month >= startOfMonth(today)}><ChevronRight /></button>
          </div>
          <div className="big-rate">
            <span className="num">{formatPercent(rate)}</span>
            <span className="faint xs">{t('habits.monthRate')} · {totalDone}/{totalSched}</span>
          </div>
        </div>
        <AreaChart
          data={series.map((s) => ({ label: String(ymd(s.date)[2]), value: s.rate === null ? 0 : Math.round(s.rate * 100), tip: s.rate === null ? formatDate(s.date, 'dayMonth') : `${formatDate(s.date, 'dayMonth')} · ${s.done}/${s.scheduled}` })).slice(0, Math.max(1, past.length))}
          max={100}
          height={170}
          yTicks={[0, 25, 50, 75, 100]}
          formatY={(v) => `${v}%`}
          highlightLast
        />
      </section>
      <section className="card card-pad habit-grid-card">
        <div className="habit-grid" style={{ gridTemplateColumns: `minmax(160px, 220px) repeat(${days.length}, 26px)` }}>
          <div className="hg-corner eyebrow">{t('habits.title')}</div>
          {days.map((d) => (
            <div key={d} className={cx('hg-day num', d === today && 'today', (new Date(d + 'T12:00').getDay() === 0) && 'sunday')}>{ymd(d)[2]}</div>
          ))}
          {habits.map((h) => {
            const logs = index.get(h.id) ?? new Map();
            return [
              <button key={h.id} className="hg-name" onClick={() => openHabitEditor(h.id)}>
                <IconTile icon={h.icon} color={h.color} size="sm" />
                <span className="ellipsis">{h.name}</span>
              </button>,
              ...days.map((d) => {
                const log = logs.get(d);
                const s = dayState(h, log, d, today, prefs.vacations);
                return (
                  <div key={h.id + d} className="hg-cell">
                    <HabitCell
                      color={h.color}
                      state={cellState(s)}
                      fill={h.target > 1 ? (log?.value ?? 0) / h.target : undefined}
                      today={d === today}
                      label={`${h.name} · ${formatDate(d, 'dayMonth')}: ${t(`habits.states.${s}` as TKey)}`}
                      onClick={d <= today ? () => toggleHabit(h.id, d) : undefined}
                      onContextMenu={(e) => openContextMenu(e, habitMenu(h, d, log))}
                    />
                  </div>
                );
              }),
            ];
          })}
        </div>
      </section>
    </div>
  );
}

// ── Estadísticas ───────────────────────────────────────────────────────────────────────

function Stats({ habits, today }: { habits: Habit[]; today: string }) {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const index = useHabitLogIndex();
  const streaks = useStreaks();
  const prefs = usePrefs();
  const from = period === 'week' ? startOfWeek(today, prefs.weekStartsOn) : period === 'month' ? startOfMonth(today) : startOfYear(today);
  const to = period === 'week' ? endOfWeek(today, prefs.weekStartsOn) : period === 'month' ? endOfMonth(today) : today;
  const yearFrom = addDays(today, -364);
  return (
    <div className="stack gap-4">
      <Segmented value={period} onChange={setPeriod} options={(['week', 'month', 'year'] as const).map((p) => ({ value: p, label: t(`habits.${p}`) }))} />
      <div className="habit-stats">
        {habits.map((h) => {
          const logs = index.get(h.id) ?? new Map();
          const st = completionStats(h, logs, from, to, today, prefs.vacations);
          const streak = streaks.get(h.id);
          const bars = period === 'year'
            ? Array.from({ length: 12 }, (_, i) => {
                const ms = addMonths(startOfYear(today), i);
                const r = completionStats(h, logs, ms, endOfMonth(ms), today, prefs.vacations);
                return { label: formatDate(ms, 'month').slice(0, 1).toUpperCase(), value: Math.round(r.rate * 100), tip: `${formatDate(ms, 'monthYear')} · ${formatPercent(r.rate)}` };
              })
            : eachDay(from, to).map((d) => ({ label: period === 'week' ? weekdayInitial(d) : String(ymd(d)[2]), value: isComplete(h, logs.get(d)) ? 100 : 0, tip: formatDate(d, 'dayMonth') }));
          const series = dailySeries('habits', yearFrom, today, { sessions: [], tasks: [], habitLogs: [...logs.values()].filter((l) => l.status === 'done') });
          return (
            <article key={h.id} className="card card-pad habit-stat" style={{ '--hc': colorValue(h.color) } as CSSProperties}>
              <div className="row-flex gap-3">
                <IconTile icon={h.icon} color={h.color} />
                <div className="grow">
                  <div className="habit-title">{h.name}</div>
                  <div className="faint xs">{describeFrequency(h.frequency)}</div>
                </div>
                <div className="center">
                  <div className="num big-num" style={{ color: colorValue(h.color) }}>{formatPercent(st.rate)}</div>
                  <div className="faint xs">{t('habits.completion')} · {st.done}/{st.scheduled}</div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <BarChart data={bars} height={90} color={colorValue(h.color)} xEvery={period === 'month' ? 5 : 1} formatValue={(v) => `${v}%`} />
              </div>
              <div className="row-flex gap-4" style={{ marginTop: 10 }}>
                <span className="small">🔥 <b className="num">{streak ? (streak.unit === 'weeks' ? tp('habits.weeks', streak.current) : tp('habits.days', streak.current)) : '—'}</b></span>
                <span className="faint xs">{t('habits.best')}: {streak ? (streak.unit === 'weeks' ? tp('habits.weeks', streak.best) : tp('habits.days', streak.best)) : '—'}</span>
              </div>
              <div className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>{t('habits.heatmap')}</div>
              <Heatmap series={series} weekStartsOn={prefs.weekStartsOn} formatTip={(d) => `${formatDate(d.date, 'dayMonth')}: ${d.value ? '✓' : '—'}`} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ── Cadenas ────────────────────────────────────────────────────────────────────────────

function Chains({ habits, today }: { habits: Habit[]; today: string }) {
  const chains = useMemo(() => habitChains(habits), [habits]);
  const index = useHabitLogIndex();
  const prefs = usePrefs();
  return (
    <div className="stack gap-4">
      <div>
        <h2 className="section-title">{t('habits.chainsTitle')}</h2>
        <p className="faint small">{t('habits.chainsHint')}</p>
      </div>
      {chains.length === 0 && <div className="card"><Empty icon={<ArrowDown />} title={t('habits.chainsEmpty')} /></div>}
      {chains.map((chain) => {
        const done = chain.filter((h) => isComplete(h, index.get(h.id)?.get(today))).length;
        return (
          <section key={chain[0].id} className="card card-pad">
            <div className="row-flex gap-3" style={{ marginBottom: 14 }}>
              <span className="num faint small">{done}/{chain.length}</span>
              <div className="grow"><Bar value={done / chain.length} thin /></div>
            </div>
            <div className="chain">
              {chain.map((h, i) => {
                const st = dayState(h, index.get(h.id)?.get(today), today, today, prefs.vacations);
                return (
                  <div key={h.id} className="chain-node-wrap">
                    {i > 0 && <span className={cx('chain-link', st === 'done' && 'on')} style={{ '--hc': colorValue(h.color) } as CSSProperties} />}
                    <div className={cx('chain-node', st === 'done' && 'done')} style={{ '--hc': colorValue(h.color) } as CSSProperties}>
                      <HabitCell color={h.color} state={cellState(st)} label={h.name} onClick={() => toggleHabit(h.id, today)} />
                      <span className="small" style={{ fontWeight: 600 }}>{h.icon} {h.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
