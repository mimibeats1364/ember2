import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, FolderKanban, Layers, List, Pencil, Plus, Sparkles, SquareKanban, ChartGantt, CalendarDays, Heart } from 'lucide-react';
import type { Project, Task, TaskStatus } from '@core/types';
import { projectHealth, trackedMinutes, type ProjectHealth } from '@core/progress';
import { addDays, diffDays, localDateOf, startOfMonth, ymd, daysInMonth, startOfWeek } from '@core/dates';
import { compareTasks, isOpen } from '@core/tasks';
import { createEntity, updateEntity, useEntity, useList, usePrefs, transaction } from '@/data/store';
import { useToday, useActiveHabits } from '@/data/selectors';
import { taskFields } from '@/data/defaults';
import { updateTask } from '@/data/actions';
import { formatDate, formatDuration, formatNumber, relativeDay, t, type TKey } from '@/i18n';
import { Bar, cx, Empty, IconTile, Modal, Ring, Segmented } from '@/ui/components/primitives';
import { useDropTargets, useDragState, type DragPayload, type DropInfo } from '@/ui/components/dnd';
import { colorValue } from '@/ui/theme/palette';
import { navigate, openAreaEditor, openProjectEditor, openTask, toast, useUi } from '@/app/ui';
import { TaskRow } from '@/features/tasks/TaskRow';
import { InlineAdd } from '@/features/tasks/InlineAdd';
import { suggestPhases } from '@core/phases';
import './projects.css';

export default function ProjectsScreen() {
  const route = useUi((s) => s.route);
  if (route.id) return <ProjectDetail id={route.id} />;
  return <ProjectsOverview initialTab={route.tab === 'life' ? 'life' : 'projects'} />;
}

export function healthReason(h: ProjectHealth): string {
  switch (h.status) {
    case 'overdue':
      return t('projects.healthReason.overdue', { days: Math.abs(h.daysLeft ?? 0), remaining: h.remaining });
    case 'at_risk':
      return h.idleDays !== null && h.idleDays >= 14 && (h.neededPerWeek ?? 0) <= h.pacePerWeek
        ? t('projects.healthReason.idle', { idle: h.idleDays })
        : t('projects.healthReason.at_risk', { remaining: h.remaining, days: h.daysLeft ?? 0, needed: formatNumber(h.neededPerWeek ?? 0, 1), pace: formatNumber(h.pacePerWeek, 1) });
    case 'on_track':
      return h.daysLeft !== null ? t('projects.healthReason.on_track', { remaining: h.remaining, days: h.daysLeft }) : t('projects.healthReason.no_deadline', { remaining: h.remaining });
    case 'no_deadline':
      return t('projects.healthReason.no_deadline', { remaining: h.remaining });
    case 'done':
      return t('projects.healthReason.done');
    case 'empty':
      return t('projects.healthReason.empty');
  }
}

function HealthTag({ h }: { h: ProjectHealth }) {
  return <span className={cx('tag', h.status === 'on_track' && 'success', (h.status === 'at_risk' || h.status === 'overdue') && 'warn', h.status === 'done' && 'success')} title={healthReason(h)}>{t(`projects.health.${h.status}` as TKey)}</span>;
}

// ── Vista general ──────────────────────────────────────────────────────────────────────

function ProjectsOverview({ initialTab }: { initialTab: 'projects' | 'life' }) {
  const [tab, setTab] = useState<'projects' | 'life'>(initialTab);
  const projects = useList('projects');
  const areas = useList('areas').filter((a) => !a.archived);
  const tasks = useList('tasks');
  const today = useToday();
  const [showDone, setShowDone] = useState(false);
  const visible = projects.filter((p) => (showDone ? true : p.status === 'active' || p.status === 'paused')).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const groups = [...areas.map((a) => ({ area: a, items: visible.filter((p) => p.areaId === a.id) })), { area: null, items: visible.filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId)) }].filter((g) => g.items.length > 0);
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('projects.title')}</h1>
          <p className="page-subtitle">{t('projects.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'projects', label: <><FolderKanban />{t('projects.title')}</> }, { value: 'life', label: <><Heart />{t('projects.lifeDashboard')}</> }]} />
          <button className="btn btn-sm" onClick={() => openAreaEditor(null)}><Layers />{t('projects.newArea')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => openProjectEditor(null)}><Plus />{t('projects.newProject')}</button>
        </div>
      </header>
      {tab === 'life' ? (
        <LifeDashboard />
      ) : projects.length === 0 ? (
        <div className="card"><Empty icon={<FolderKanban />} title={t('projects.empty')} body={t('projects.emptyHint')} action={<button className="btn btn-primary btn-sm" onClick={() => openProjectEditor(null)}><Plus />{t('projects.createFirst')}</button>} /></div>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.area?.id ?? 'none'} className="section">
              <div className="section-head">
                <h2 className="section-title row-flex gap-2">
                  {g.area ? <><IconTile icon={g.area.icon} color={g.area.color} size="sm" />{g.area.name}</> : <span className="faint">{t('task.noArea')}</span>}
                </h2>
                {g.area && <button className="btn btn-ghost btn-sm" onClick={() => openAreaEditor(g.area!.id)}><Pencil /></button>}
              </div>
              <div className="project-grid">
                {g.items.map((p) => <ProjectCard key={p.id} project={p} health={projectHealth(p, tasks, today)} />)}
              </div>
            </section>
          ))}
          <button className="link-btn" style={{ marginTop: 20 }} onClick={() => setShowDone(!showDone)}>{showDone ? t('projects.status.active') : `${t('projects.status.done')} / ${t('projects.status.archived')}`}</button>
        </>
      )}
    </div>
  );
}

function ProjectCard({ project, health }: { project: Project; health: ProjectHealth }) {
  const color = colorValue(project.color);
  const today = useToday();
  return (
    <button className="card card-hover project-card" style={{ '--pc': color } as CSSProperties} onClick={() => navigate('projects', { id: project.id })}>
      <div className="row-flex gap-3">
        <IconTile icon={project.icon} color={project.color} />
        <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <div className="project-name ellipsis">{project.name}</div>
          <div className="faint xs">{project.deadline ? `${t('projects.deadline')} · ${relativeDay(project.deadline, today)}` : t('projects.health.no_deadline')}</div>
        </div>
        <Ring value={health.progress} size={40} stroke={4} color={color}><span className="num" style={{ fontSize: 10, fontWeight: 700 }}>{Math.round(health.progress * 100)}</span></Ring>
      </div>
      <div className="row-flex gap-2" style={{ marginTop: 14 }}>
        <HealthTag h={health} />
        <span className="faint xs grow" style={{ textAlign: 'left' }}>{t('projects.remaining', { count: health.remaining })}</span>
        {project.status === 'paused' && <span className="tag">{t('projects.status.paused')}</span>}
      </div>
      <p className="faint xs project-reason">{healthReason(health)}</p>
    </button>
  );
}

// ── Vida (áreas) ───────────────────────────────────────────────────────────────────────

function LifeDashboard() {
  const areas = useList('areas').filter((a) => !a.archived);
  const tasks = useList('tasks');
  const sessions = useList('focusSessions');
  const entries = useList('timeEntries');
  const habits = useActiveHabits();
  const projects = useList('projects');
  const today = useToday();
  const monthStart = startOfMonth(today);
  const data = useMemo(() => {
    const projectArea = new Map(projects.map((p) => [p.id, p.areaId]));
    const taskArea = new Map(tasks.map((x) => [x.id, x.areaId ?? (x.projectId ? projectArea.get(x.projectId) ?? null : null)]));
    const recentSessions = sessions.filter((s) => localDateOf(s.startedAt) >= monthStart);
    return areas.map((a) => {
      const minutes = trackedMinutes(recentSessions, entries.filter((e) => localDateOf(e.start) >= monthStart), (tid, pid) => (tid !== null && taskArea.get(tid) === a.id) || (pid !== null && projectArea.get(pid) === a.id));
      const open = tasks.filter((x) => isOpen(x) && taskArea.get(x.id) === a.id).length;
      const done = tasks.filter((x) => x.status === 'done' && taskArea.get(x.id) === a.id && x.completedAt && localDateOf(x.completedAt) >= monthStart).length;
      return { area: a, minutes, open, done, habits: habits.filter((h) => h.areaId === a.id).length, projects: projects.filter((p) => p.areaId === a.id && p.status === 'active') };
    });
  }, [areas, tasks, sessions, entries, habits, projects, monthStart]);
  const maxMin = Math.max(1, ...data.map((d) => d.minutes));
  return (
    <div className="stack gap-4">
      <p className="faint small">{t('projects.lifeHint')}</p>
      <div className="life-grid">
        {data.map((d) => (
          <div key={d.area.id} className="card card-pad life-area" style={{ '--pc': colorValue(d.area.color) } as CSSProperties}>
            <div className="row-flex gap-3">
              <IconTile icon={d.area.icon} color={d.area.color} size="lg" />
              <div className="grow">
                <div className="project-name">{d.area.name}</div>
                <div className="faint xs">{t('projects.areaStats', { tasks: d.open, hours: formatDuration(d.minutes), habits: d.habits })}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}><Bar value={d.minutes / maxMin} color={colorValue(d.area.color)} /></div>
            <div className="row-flex gap-2 wrap" style={{ marginTop: 12 }}>
              {d.projects.map((p) => <button key={p.id} className="tag" onClick={() => navigate('projects', { id: p.id })}>{p.icon} {p.name}</button>)}
              {d.done > 0 && <span className="tag success"><Check size={11} /> {d.done}</span>}
            </div>
          </div>
        ))}
      </div>
      {areas.length === 0 && <div className="card"><Empty icon={<Layers />} title={t('projects.areasHint')} action={<button className="btn btn-sm" onClick={() => openAreaEditor(null)}><Plus />{t('projects.newArea')}</button>} /></div>}
    </div>
  );
}

// ── Detalle de proyecto ────────────────────────────────────────────────────────────────

function ProjectDetail({ id }: { id: string }) {
  const project = useEntity('projects', id);
  const tasks = useList('tasks');
  const area = useEntity('areas', project?.areaId);
  const goal = useEntity('goals', project?.goalId);
  const today = useToday();
  const prefs = usePrefs();
  const [phases, setPhases] = useState<string[] | null>(null);
  if (!project || project.deletedAt) return <div className="page"><Empty icon={<FolderKanban />} title={t('common.notAvailable')} /></div>;
  const projectTasks = tasks.filter((x) => x.projectId === project.id && !x.parentId && x.status !== 'dropped');
  const health = projectHealth(project, tasks, today);
  const setView = (view: Project['view']) => updateEntity('projects', project.id, { view });
  return (
    <div className="page wide project-detail" style={{ '--pc': colorValue(project.color) } as CSSProperties}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('projects')} style={{ marginBottom: 14 }}><ArrowLeft />{t('projects.title')}</button>
      <header className="card card-pad project-hero">
        <div className="row-flex gap-4 wrap">
          <Ring value={health.progress} size={84} stroke={6} color={colorValue(project.color)}><span className="num" style={{ fontWeight: 800 }}>{Math.round(health.progress * 100)}%</span></Ring>
          <div className="grow" style={{ minWidth: 220 }}>
            <div className="eyebrow">{area ? `${area.icon} ${area.name}` : t('task.noArea')}{goal ? ` · ${goal.icon} ${goal.title}` : ''}</div>
            <h1 className="page-title" style={{ marginTop: 6 }}>{project.icon} {project.name}</h1>
            <div className="row-flex gap-2 wrap" style={{ marginTop: 8 }}>
              <HealthTag h={health} />
              <span className="faint small">{healthReason(health)}</span>
            </div>
          </div>
          <div className="row-flex gap-2 wrap">
            <button className="btn btn-sm" onClick={() => setPhases(suggestPhases(project.name, prefs.locale))}><Sparkles />{t('projects.breakdownSuggest')}</button>
            <button className="btn btn-sm" onClick={() => openProjectEditor(project.id)}><Pencil />{t('common.edit')}</button>
            {project.status !== 'done' && <button className="btn btn-sm btn-primary" onClick={() => { updateEntity('projects', project.id, { status: 'done', completedAt: new Date().toISOString() }); toast(t('projects.health.done')); }}><Check />{t('projects.markDone')}</button>}
          </div>
        </div>
        {project.description && <p className="muted small" style={{ marginTop: 14 }}>{project.description}</p>}
        <div className="faint xs" style={{ marginTop: 10 }}>
          {project.deadline && `${t('projects.deadline')}: ${formatDate(project.deadline, 'long')} · `}
          {health.lastActivity && t('projects.lastActivity', { date: relativeDay(localDateOf(health.lastActivity), today) })}
        </div>
      </header>

      <div className="row-flex gap-3 wrap" style={{ margin: '20px 0 14px', justifyContent: 'space-between' }}>
        <Segmented value={project.view} onChange={setView} options={[
          { value: 'list', label: <><List />{t('projects.views.list')}</> },
          { value: 'board', label: <><SquareKanban />{t('projects.views.board')}</> },
          { value: 'timeline', label: <><ChartGantt />{t('projects.views.timeline')}</> },
          { value: 'calendar', label: <><CalendarDays />{t('projects.views.calendar')}</> },
        ]} />
      </div>

      {project.view === 'list' && (
        <div className="card card-pad">
          <InlineAdd defaults={{ projectId: project.id, areaId: project.areaId }} placeholder={t('projects.addTask')} />
          <div className="list" style={{ marginTop: 8 }}>
            {[...projectTasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || compareTasks(a, b)).map((x) => <TaskRow key={x.id} task={x} showDate showProject={false} />)}
          </div>
        </div>
      )}
      {project.view === 'board' && <Board project={project} tasks={projectTasks} />}
      {project.view === 'timeline' && <Timeline tasks={projectTasks} today={today} />}
      {project.view === 'calendar' && <ProjectMonth tasks={projectTasks} today={today} weekStartsOn={prefs.weekStartsOn} />}

      {phases && (
        <PhasesModal phases={phases} onClose={() => setPhases(null)} onCreate={(list) => {
          transaction(t('projects.breakdownTitle'), () => list.forEach((title, i) => createEntity('tasks', taskFields({ title, projectId: project.id, areaId: project.areaId, status: 'backlog', order: Date.now() + i }))));
          toast(t('notes.tasksCreated', { count: list.length }));
          setPhases(null);
        }} />
      )}
    </div>
  );
}

function PhasesModal({ phases, onClose, onCreate }: { phases: string[]; onClose: () => void; onCreate: (list: string[]) => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set(phases.map((_, i) => i)));
  return (
    <Modal title={t('projects.breakdownTitle')} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={picked.size === 0} onClick={() => onCreate(phases.filter((_, i) => picked.has(i)))}>{t('projects.breakdownAdd', { count: picked.size })}</button></>}>
      <p className="faint small" style={{ marginBottom: 10 }}>{t('projects.breakdownHint')}</p>
      {phases.map((p, i) => (
        <label key={i} className="check-item" style={{ cursor: 'pointer' }}>
          <button className={cx('mini-check', picked.has(i) && 'on')} onClick={() => { const n = new Set(picked); if (n.has(i)) n.delete(i); else n.add(i); setPicked(n); }}>{picked.has(i) && <Check strokeWidth={3} />}</button>
          <span className="small">{i + 1}. {p}</span>
        </label>
      ))}
    </Modal>
  );
}

const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'done'];

function Board({ project, tasks }: { project: Project; tasks: Task[] }) {
  const over = useDragState((s) => s.over);
  const onDrop = useCallback((p: DragPayload, info: DropInfo) => {
    const status = info.target.closest<HTMLElement>('[data-col]')?.dataset.col as TaskStatus | undefined;
    if (p.kind !== 'task' || !status) return;
    updateTask(p.id, { status, completedAt: status === 'done' ? new Date().toISOString() : null });
  }, []);
  useDropTargets(COLUMNS.map((c) => `board:${c}`), onDrop);
  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const items = tasks.filter((x) => x.status === col).sort(compareTasks);
        return (
          <section key={col} className={cx('board-col', over === `board:${col}` && 'drop-over')} data-drop={`board:${col}`} data-col={col}>
            <header className="board-head">
              <span className={cx('board-dot', col)} />
              <b>{t(`projects.board.${col}` as TKey)}</b>
              <span className="faint num">{items.length}</span>
            </header>
            <div className="board-list">
              {items.map((x) => (
                <div key={x.id} className="board-card card">
                  <TaskRow task={x} draggable showDate showProject={false} />
                </div>
              ))}
            </div>
            {col !== 'done' && <InlineAdd defaults={{ projectId: project.id, areaId: project.areaId, status: col }} placeholder={t('common.add')} />}
          </section>
        );
      })}
    </div>
  );
}

function Timeline({ tasks, today }: { tasks: Task[]; today: string }) {
  const dated = tasks.filter((x) => x.date || x.deadline);
  if (dated.length === 0) return <div className="card"><Empty icon={<ChartGantt />} title={t('projects.timelineEmpty')} /></div>;
  const starts = dated.map((x) => x.date ?? x.deadline!);
  const ends = dated.map((x) => x.deadline ?? x.date!);
  const from = addDays([...starts, today].sort()[0], -2);
  const to = addDays([...ends, today].sort().at(-1)!, 3);
  const span = Math.max(7, diffDays(to, from) + 1);
  const pos = (d: string) => (diffDays(d, from) / span) * 100;
  const days = Array.from({ length: span }, (_, i) => addDays(from, i));
  return (
    <div className="card card-pad timeline">
      <div className="timeline-inner" style={{ minWidth: Math.max(720, span * 28) }}>
        <div className="timeline-days">
          {days.map((d) => <span key={d} className={cx(d === today && 'today', ymd(d)[2] === 1 && 'month')} style={{ left: `${pos(d)}%`, width: `${100 / span}%` }}>{ymd(d)[2]}</span>)}
        </div>
        <div className="timeline-today" style={{ left: `${pos(today) + 50 / span}%` }} />
        {dated.sort((a, b) => (a.date ?? a.deadline!).localeCompare(b.date ?? b.deadline!)).map((x) => {
          const s = x.date ?? x.deadline!;
          const e = x.deadline && x.deadline >= s ? x.deadline : s;
          return (
            <div key={x.id} className="timeline-row">
              <button className={cx('timeline-bar', x.status === 'done' && 'done', x.deadline && x.deadline < today && isOpen(x) && 'late')} style={{ left: `${pos(s)}%`, width: `${((diffDays(e, s) + 1) / span) * 100}%` }} onClick={() => openTask(x.id)} title={x.title}>
                <span className="ellipsis">{x.title}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectMonth({ tasks, today, weekStartsOn }: { tasks: Task[]; today: string; weekStartsOn: 0 | 1 }) {
  const [month] = useState(startOfMonth(today));
  const first = startOfWeek(month, weekStartsOn);
  const [y, m] = ymd(month);
  const cells = Array.from({ length: Math.ceil((diffDays(month, first) + daysInMonth(y, m)) / 7) * 7 }, (_, i) => addDays(first, i));
  return (
    <div className="card card-pad">
      <div className="pm-grid">
        {cells.map((d) => (
          <div key={d} className={cx('pm-cell', d.slice(0, 7) !== month.slice(0, 7) && 'other', d === today && 'today')}>
            <span className="num xs faint">{ymd(d)[2]}</span>
            {tasks.filter((x) => x.date === d || (!x.date && x.deadline === d)).map((x) => (
              <button key={x.id} className={cx('pm-item', x.status === 'done' && 'done')} onClick={() => openTask(x.id)}>{x.title}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
