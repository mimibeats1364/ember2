import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Flag, Pencil, Plus, Target, Trash, Diamond, RotateCcw } from 'lucide-react';
import type { Goal, GoalHorizon, Milestone } from '@core/types';
import { goalProgress, projectHealth, type GoalProgress } from '@core/progress';
import { computeStreak, indexLogs } from '@core/habits';
import { diffDays, endOfYear, localDateOf, startOfYear, addMonths, ymd } from '@core/dates';
import { createEntity, updateEntity, useData, useEntity, useList, usePrefs, deleteEntity } from '@/data/store';
import { useToday } from '@/data/selectors';
import { milestoneFields } from '@/data/defaults';
import { formatDate, formatDuration, formatNumber, formatPercent, t, type TKey } from '@/i18n';
import { Bar, Chips, cx, Empty, IconTile, Ring } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { navigate, openGoalEditor, openProjectEditor, openHabitEditor, useUi } from '@/app/ui';
import { TaskRow } from '@/features/tasks/TaskRow';
import { InlineAdd } from '@/features/tasks/InlineAdd';
import './goals.css';

type Tab = GoalHorizon | 'life';

function useGoalProgress() {
  const c = useData((s) => s.c);
  const today = useToday();
  return useMemo(() => {
    const ctx = {
      milestones: Object.values(c.milestones),
      tasks: Object.values(c.tasks),
      projects: Object.values(c.projects),
      sessions: Object.values(c.focusSessions),
      entries: Object.values(c.timeEntries),
    };
    return (g: Goal) => goalProgress(g, ctx, today);
  }, [c.milestones, c.tasks, c.projects, c.focusSessions, c.timeEntries, today]);
}

export default function GoalsScreen() {
  const id = useUi((s) => s.route.id);
  if (id) return <GoalDetail id={id} />;
  return <GoalsList />;
}

function GoalsList() {
  const goals = useList('goals');
  const [tab, setTab] = useState<Tab>('year');
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');
  const progressOf = useGoalProgress();
  const visible = useMemo(
    () => goals.filter((g) => tab === 'life' || g.horizon === tab).filter((g) => filter === 'all' || (filter === 'done' ? g.status === 'done' : g.status === 'active' || g.status === 'paused')).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [goals, tab, filter],
  );
  const counts = useMemo(() => Object.fromEntries((['year', 'quarter', 'month', 'week'] as GoalHorizon[]).map((h) => [h, goals.filter((g) => g.horizon === h && g.status === 'active').length])), [goals]);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('goals.title')}</h1>
          <p className="page-subtitle">{t('goals.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => openGoalEditor(null, tab !== 'life' ? { horizon: tab } : undefined)}><Plus />{t('goals.newGoal')}</button>
        </div>
      </header>
      <div className="row-flex gap-3 wrap" style={{ justifyContent: 'space-between' }}>
        <Chips value={tab} onChange={setTab} options={[...(['year', 'quarter', 'month', 'week'] as GoalHorizon[]).map((h) => ({ value: h as Tab, label: t(`goals.horizons.${h}` as TKey), count: counts[h] })), { value: 'life' as Tab, label: t('goals.lifeTimeline') }]} />
        {tab !== 'life' && <Chips value={filter} onChange={setFilter} options={(['active', 'done', 'all'] as const).map((f) => ({ value: f, label: t(`goals.filters.${f}`) }))} />}
      </div>
      {tab === 'life' ? (
        <LifeTimeline />
      ) : visible.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <Empty icon={<Target />} title={t('goals.empty')} body={t('goals.emptyHint')} action={<button className="btn btn-primary btn-sm" onClick={() => openGoalEditor(null, { horizon: tab })}><Plus />{t('goals.createFirst')}</button>} />
        </div>
      ) : (
        <div className="goal-grid">
          {visible.map((g, i) => <GoalCard key={g.id} goal={g} progress={progressOf(g)} index={i} />)}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, progress, index }: { goal: Goal; progress: GoalProgress; index: number }) {
  const area = useEntity('areas', goal.areaId);
  const color = colorValue(goal.color);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal.current ?? 0));
  return (
    <article className={cx('card goal-card card-hover reveal', `reveal-${Math.min(6, index + 1)}`, goal.status === 'done' && 'achieved')} style={{ '--gc': color } as CSSProperties} onClick={() => navigate('goals', { id: goal.id })}>
      <div className="goal-cover">
        <span className="goal-emoji">{goal.icon}</span>
        <span className="goal-cover-glow" />
        {area && <span className="tag goal-area">{area.icon} {area.name}</span>}
        <span className="goal-pct num">{Math.round(progress.ratio * 100)}%</span>
      </div>
      <div className="goal-body">
        <h3 className="goal-title">{goal.title}</h3>
        <div className="row-flex gap-2" style={{ marginTop: 10 }}>
          <div className="grow"><Bar value={progress.ratio} marker={goal.status === 'done' ? undefined : progress.timeElapsed} color={color} /></div>
        </div>
        {goal.progressMode === 'numeric' && (
          <div className="num goal-numeric">
            {formatNumber(goal.current ?? 0)} {goal.unit}<span className="faint"> / {formatNumber(goal.target ?? 0)} {goal.unit}</span>
          </div>
        )}
        <div className="goal-meta faint xs">
          {progress.tasks.total > 0 && <span>{progress.tasks.done}/{progress.tasks.total} {t('goals.tasks').toLowerCase()}</span>}
          {progress.milestones.total > 0 && <span>{progress.milestones.done}/{progress.milestones.total} {t('goals.milestones').toLowerCase()}</span>}
          {progress.minutesInvested > 0 && <span>{formatDuration(progress.minutesInvested)}</span>}
          <span>{formatDate(goal.periodEnd, 'medium')}</span>
        </div>
        <div className="row-flex gap-2" style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
          <span className={cx('tag', progress.pace === 'done' && 'success', progress.pace === 'ahead' && 'info')}>{t(`goals.pace.${progress.pace}` as TKey)}</span>
          <span className="spacer" />
          {goal.progressMode === 'numeric' && goal.status !== 'done' && (
            editing ? (
              <input
                className="input num"
                style={{ width: 110, height: 30 }}
                autoFocus
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => { updateEntity('goals', goal.id, { current: Number(value) || 0 }); setEditing(false); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <button className="btn btn-sm btn-subtle" onClick={() => { setValue(String(goal.current ?? 0)); setEditing(true); }}>{t('goals.updateProgress')}</button>
            )
          )}
        </div>
      </div>
    </article>
  );
}

// ── Detalle ────────────────────────────────────────────────────────────────────────────

function GoalDetail({ id }: { id: string }) {
  const goal = useEntity('goals', id);
  const progressOf = useGoalProgress();
  const milestones = useList('milestones');
  const projects = useList('projects');
  const tasks = useList('tasks');
  const habits = useList('habits');
  const logs = useList('habitLogs');
  const goals = useList('goals');
  const prefs = usePrefs();
  const today = useToday();
  const [msInput, setMsInput] = useState('');
  if (!goal || goal.deletedAt) return <div className="page"><Empty icon={<Target />} title={t('common.notAvailable')} /></div>;
  const p = progressOf(goal);
  const color = colorValue(goal.color);
  const ms = milestones.filter((m) => m.goalId === goal.id).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.order - b.order);
  const linkedProjects = projects.filter((x) => x.goalId === goal.id);
  const directTasks = tasks.filter((x) => x.goalId === goal.id && !x.parentId && x.status !== 'dropped');
  const linkedHabits = habits.filter((h) => h.goalId === goal.id && !h.archived);
  const children = goals.filter((g) => g.parentId === goal.id);
  return (
    <div className="page goal-detail" style={{ '--gc': color } as CSSProperties}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('goals')} style={{ marginBottom: 14 }}><ArrowLeft />{t('goals.title')}</button>
      <header className="goal-hero card card-pad">
        <div className="row-flex gap-4 wrap">
          <Ring value={p.ratio} size={110} stroke={7} color={color}>
            <span className="num" style={{ fontWeight: 800, fontSize: 22 }}>{Math.round(p.ratio * 100)}%</span>
          </Ring>
          <div className="grow" style={{ minWidth: 220 }}>
            <div className="eyebrow">{t(`goals.horizons.${goal.horizon}` as TKey)} · {formatDate(goal.periodStart, 'medium')} – {formatDate(goal.periodEnd, 'medium')}</div>
            <h1 className="page-title" style={{ marginTop: 6 }}>{goal.icon} {goal.title}</h1>
            {goal.description && <p className="muted" style={{ marginTop: 6 }}>{goal.description}</p>}
            <p className="faint small" style={{ marginTop: 8 }}>{t('goals.paceHint', { elapsed: formatPercent(p.timeElapsed), progress: formatPercent(p.ratio) })}</p>
          </div>
          <div className="row-flex gap-2">
            <button className="btn btn-sm" onClick={() => openGoalEditor(goal.id)}><Pencil />{t('common.edit')}</button>
            {goal.status === 'done' ? (
              <button className="btn btn-sm" onClick={() => updateEntity('goals', goal.id, { status: 'active', completedAt: null })}><RotateCcw />{t('goals.reopen')}</button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => updateEntity('goals', goal.id, { status: 'done', completedAt: new Date().toISOString() })}><Check />{t('goals.markDone')}</button>
            )}
          </div>
        </div>
        <div className="grid-4" style={{ marginTop: 20 }}>
          <div className="stat card"><div className="label">{t('goals.tasks')}</div><div className="value">{p.tasks.done}<span className="faint">/{p.tasks.total}</span></div></div>
          <div className="stat card"><div className="label">{t('goals.milestones')}</div><div className="value">{p.milestones.done}<span className="faint">/{p.milestones.total}</span></div></div>
          <div className="stat card"><div className="label">{t('goals.hours')}</div><div className="value">{formatDuration(p.minutesInvested)}</div></div>
          <div className="stat card"><div className="label">{t('today.streak')}</div><div className="value">🔥 {Math.max(0, ...linkedHabits.map((h) => computeStreak(h, indexLogs(logs.filter((l) => l.habitId === h.id)), today, prefs.vacations).current))}</div></div>
        </div>
        <p className="faint xs" style={{ marginTop: 14 }}>{t('goals.breakdown')}</p>
      </header>

      <section className="section">
        <div className="section-head"><h2 className="section-title"><Flag size={15} /> {t('goals.milestones')}</h2></div>
        <div className="card card-pad">
          {ms.length > 0 && <MilestoneTimeline goal={goal} milestones={ms} today={today} />}
          {ms.map((m) => (
            <div key={m.id} className={cx('check-item', m.done && 'done')}>
              <button className={cx('mini-check', m.done && 'on')} aria-label={m.title} onClick={() => updateEntity('milestones', m.id, { done: !m.done, doneAt: m.done ? null : new Date().toISOString() })}>{m.done && <Check strokeWidth={3} />}</button>
              <input type="text" value={m.title} onChange={(e) => updateEntity('milestones', m.id, { title: e.target.value })} />
              <input type="date" className="input" style={{ width: 150, height: 30 }} value={m.dueDate ?? ''} onChange={(e) => updateEntity('milestones', m.id, { dueDate: e.target.value || null })} />
              <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.delete')} onClick={() => deleteEntity('milestones', m.id)}><Trash /></button>
            </div>
          ))}
          <div className="check-item">
            <Plus size={14} className="faint" />
            <input type="text" value={msInput} placeholder={t('goals.addMilestone')} onChange={(e) => setMsInput(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && msInput.trim()) {
                createEntity('milestones', milestoneFields({ goalId: goal.id, title: msInput.trim(), order: ms.length }));
                setMsInput('');
              }
            }} />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t('goals.linkedProjects')}</h2>
          <button className="btn btn-sm btn-ghost" onClick={() => openProjectEditor(null, { goalId: goal.id, areaId: goal.areaId, color: goal.color })}><Plus />{t('projects.newProject')}</button>
        </div>
        <div className="grid-auto">
          {linkedProjects.map((pr) => {
            const h = projectHealth(pr, tasks, today);
            return (
              <button key={pr.id} className="card card-pad-sm card-hover" style={{ textAlign: 'left' }} onClick={() => navigate('projects', { id: pr.id })}>
                <div className="row-flex gap-2"><IconTile icon={pr.icon} color={pr.color} size="sm" /><b className="grow ellipsis">{pr.name}</b><span className={cx('tag', h.status === 'at_risk' && 'warn', h.status === 'on_track' && 'success')}>{t(`projects.health.${h.status}` as TKey)}</span></div>
                <div style={{ marginTop: 10 }}><Bar value={h.progress} color={colorValue(pr.color)} thin /></div>
                <div className="faint xs" style={{ marginTop: 6 }}>{h.done}/{h.total}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="section-title">{t('goals.linkedTasks')}</h2></div>
        <div className="card card-pad">
          <InlineAdd defaults={{ goalId: goal.id, areaId: goal.areaId }} />
          <div className="list" style={{ marginTop: 6 }}>{directTasks.map((x) => <TaskRow key={x.id} task={x} showDate />)}</div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">{t('goals.linkedHabits')}</h2>
          <button className="btn btn-sm btn-ghost" onClick={() => openHabitEditor(null, { goalId: goal.id, color: goal.color })}><Plus />{t('habits.newHabit')}</button>
        </div>
        <div className="row-flex gap-2 wrap">
          {linkedHabits.map((h) => <button key={h.id} className="tag" style={{ height: 30, padding: '0 12px' }} onClick={() => openHabitEditor(h.id)}>{h.icon} {h.name}</button>)}
          {linkedHabits.length === 0 && <span className="faint small">—</span>}
        </div>
      </section>

      {children.length > 0 && (
        <section className="section">
          <div className="section-head"><h2 className="section-title">{t('goals.horizons.quarter')} / {t('goals.horizons.month')}</h2></div>
          <div className="goal-grid">{children.map((g, i) => <GoalCard key={g.id} goal={g} progress={progressOf(g)} index={i} />)}</div>
        </section>
      )}
    </div>
  );
}

function MilestoneTimeline({ goal, milestones, today }: { goal: Goal; milestones: Milestone[]; today: string }) {
  const span = Math.max(1, diffDays(goal.periodEnd, goal.periodStart));
  const pos = (d: string) => Math.max(0, Math.min(100, (diffDays(d, goal.periodStart) / span) * 100));
  return (
    <div className="ms-timeline" aria-label={t('goals.timeline')}>
      <div className="ms-track" />
      <div className="ms-progress" style={{ width: `${pos(today)}%` }} />
      <div className="ms-today" style={{ left: `${pos(today)}%` }} />
      {milestones.filter((m) => m.dueDate).map((m) => (
        <div key={m.id} className={cx('ms-point', m.done && 'done')} style={{ left: `${pos(m.dueDate!)}%` }} title={`${m.title} · ${formatDate(m.dueDate!, 'medium')}`}>
          <Diamond />
          <span className="ms-label">{m.title}</span>
        </div>
      ))}
    </div>
  );
}

// ── Línea de la vida ───────────────────────────────────────────────────────────────────

function LifeTimeline() {
  const today = useToday();
  const goals = useList('goals');
  const projects = useList('projects');
  const milestones = useList('milestones');
  const events = useList('events');
  const from = startOfYear(today);
  const to = endOfYear(today);
  const span = diffDays(to, from) + 1;
  const pos = (d: string) => Math.max(0, Math.min(100, (diffDays(d, from) / span) * 100));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(from, i));
  const lanes = [
    ...goals.filter((g) => g.periodEnd >= from && g.periodStart <= to).map((g) => ({ key: g.id, label: `${g.icon} ${g.title}`, start: g.periodStart < from ? from : g.periodStart, end: g.periodEnd > to ? to : g.periodEnd, color: colorValue(g.color), kind: 'goal' as const, onClick: () => navigate('goals', { id: g.id }) })),
    ...projects.filter((p) => p.status !== 'archived').map((p) => {
      const start = p.startDate ?? localDateOf(p.createdAt);
      const end = p.deadline ?? (p.completedAt ? localDateOf(p.completedAt) : today);
      return { key: p.id, label: `${p.icon} ${p.name}`, start: start < from ? from : start, end: end > to ? to : end < start ? start : end, color: colorValue(p.color), kind: 'project' as const, onClick: () => navigate('projects', { id: p.id }) };
    }).filter((l) => l.end >= from && l.start <= to),
  ];
  const points = [
    ...milestones.filter((m) => m.dueDate && m.dueDate >= from && m.dueDate <= to).map((m) => ({ key: m.id, date: m.dueDate!, label: m.title, done: m.done })),
    ...events.filter((e) => e.allDay && !e.recurrence && e.date && e.date >= from && e.date <= to).map((e) => ({ key: e.id, date: e.date!, label: e.title, done: e.date! < today })),
  ];
  return (
    <section className="card card-pad life" style={{ marginTop: 18 }}>
      <p className="faint small">{t('goals.lifeTimelineHint')}</p>
      <div className="life-scroll">
        <div className="life-inner">
          <div className="life-months">
            {months.map((m) => <span key={m} style={{ left: `${pos(m)}%` }}>{formatDate(m, 'month').slice(0, 3)}</span>)}
          </div>
          <div className="life-today" style={{ left: `${pos(today)}%` }} />
          {lanes.map((l) => (
            <div key={l.key} className="life-lane">
              <button className={cx('life-bar', l.kind)} style={{ left: `${pos(l.start)}%`, width: `${Math.max(1.5, pos(l.end) - pos(l.start))}%`, '--c': l.color } as CSSProperties} onClick={l.onClick} title={`${formatDate(l.start, 'medium')} – ${formatDate(l.end, 'medium')}`}>
                <span className="ellipsis">{l.label}</span>
              </button>
            </div>
          ))}
          <div className="life-points">
            {points.map((p) => (
              <div key={p.key} className={cx('life-point', p.done && 'done')} style={{ left: `${pos(p.date)}%` }} title={`${p.label} · ${formatDate(p.date, 'medium')}`}>
                <Diamond />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="faint xs" style={{ marginTop: 8 }}>{ymd(today)[0]}</div>
    </section>
  );
}
