import { useCallback, useMemo, useState } from 'react';
import { CircleCheck, Grid2x2, List, ListFilter, X } from 'lucide-react';
import type { Priority, Quadrant, Task } from '@core/types';
import { addDays } from '@core/dates';
import { applyFilter, compareTasks, inView, quadrantOf, type SmartView, type TaskFilter } from '@core/tasks';
import { useList } from '@/data/store';
import { useToday } from '@/data/selectors';
import { updateTask } from '@/data/actions';
import { relativeDay, t, type TKey } from '@/i18n';
import { Chips, cx, Empty, Popover, Segmented } from '@/ui/components/primitives';
import { useDropTarget, useDragState, type DragPayload } from '@/ui/components/dnd';
import { colorValue } from '@/ui/theme/palette';
import { openCapture, useUi } from '@/app/ui';
import { TaskRow } from './TaskRow';
import { InlineAdd } from './InlineAdd';
import './tasks.css';

const VIEWS: SmartView[] = ['my_day', 'inbox', 'next7', 'upcoming', 'overdue', 'someday', 'focus', 'completed'];

export default function TasksScreen() {
  const routeTab = useUi((s) => s.route.tab) as SmartView | undefined;
  const [view, setView] = useState<SmartView>(routeTab && VIEWS.includes(routeTab) ? routeTab : 'my_day');
  const [layout, setLayout] = useState<'list' | 'matrix'>('list');
  const [filter, setFilter] = useState<TaskFilter>({});
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);
  const tasks = useList('tasks');
  const today = useToday();

  const counts = useMemo(() => {
    const c: Partial<Record<SmartView, number>> = {};
    for (const v of VIEWS) if (v !== 'completed') c[v] = tasks.filter((x) => inView(v, x, today)).length;
    return c;
  }, [tasks, today]);

  const visible = useMemo(() => {
    const base = applyFilter(tasks.filter((x) => inView(view, x, today)), filter);
    if (view === 'completed') return base.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 200);
    return base.sort(compareTasks);
  }, [tasks, view, today, filter]);

  const filterCount = (filter.priorities?.length ?? 0) + (filter.projectIds?.length ?? 0) + (filter.areaIds?.length ?? 0) + (filter.tagIds?.length ?? 0);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('tasks.title')}</h1>
          <p className="page-subtitle">{t('tasks.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className={cx('btn btn-sm', filterCount > 0 && 'btn-subtle')} onClick={(e) => setFilterAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}>
            <ListFilter /> {t('tasks.filters.title')} {filterCount > 0 && `· ${filterCount}`}
          </button>
          <Segmented value={layout} onChange={setLayout} options={[{ value: 'list', label: <><List />{t('tasks.layout.list')}</> }, { value: 'matrix', label: <><Grid2x2 />{t('tasks.layout.matrix')}</> }]} />
        </div>
      </header>

      {layout === 'list' && (
        <>
          <Chips scroll value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v, label: t(`tasks.views.${v}` as TKey), count: counts[v] }))} label={t('tasks.title')} />
          <div className="card card-pad" style={{ marginTop: 16 }}>
            {view !== 'completed' && (
              <InlineAdd
                defaults={view === 'my_day' ? { date: today } : view === 'inbox' ? { inbox: true } : view === 'next7' ? { date: addDays(today, 1) } : {}}
              />
            )}
            <TaskGroups tasks={visible} view={view} today={today} />
            {visible.length === 0 && (
              <Empty
                icon={<CircleCheck />}
                title={t(`tasks.empty.${view}` as TKey)}
                action={tasks.length === 0 ? <button className="btn btn-primary btn-sm" onClick={() => openCapture('task')}>{t('tasks.createFirst')}</button> : undefined}
              />
            )}
          </div>
        </>
      )}
      {layout === 'matrix' && <Matrix tasks={applyFilter(tasks.filter((x) => inView('all', x, today)), filter)} today={today} />}
      {filterAnchor && <FilterPopover anchor={filterAnchor} filter={filter} onChange={setFilter} onClose={() => setFilterAnchor(null)} />}
    </div>
  );
}

function TaskGroups({ tasks, view, today }: { tasks: Task[]; view: SmartView; today: string }) {
  const groups = useMemo(() => {
    if (view !== 'next7' && view !== 'upcoming') return [{ key: 'all', label: null as string | null, items: tasks }];
    const map = new Map<string, Task[]>();
    for (const x of tasks) {
      const key = x.date ?? x.deadline ?? 'none';
      map.set(key, [...(map.get(key) ?? []), x]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, label: key === 'none' ? t('tasks.groups.noDate') : relativeDay(key, today), items }));
  }, [tasks, view, today]);
  return (
    <div className="list" style={{ marginTop: 8 }}>
      {groups.map((g) => (
        <div key={g.key}>
          {g.label && <div className="group-label eyebrow">{g.label}</div>}
          {g.items.map((x) => (
            <TaskRow key={x.id} task={x} showDate={view !== 'my_day'} draggable />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Matriz de Eisenhower ───────────────────────────────────────────────────────────────

const QUADS: Quadrant[] = ['do', 'schedule', 'delegate', 'delete'];

function Matrix({ tasks, today }: { tasks: Task[]; today: string }) {
  const byQuad = useMemo(() => {
    const m: Record<Quadrant, Task[]> = { do: [], schedule: [], delegate: [], delete: [] };
    for (const x of tasks) if (!x.parentId) m[quadrantOf(x, today)].push(x);
    for (const q of QUADS) m[q].sort(compareTasks);
    return m;
  }, [tasks, today]);
  return (
    <>
      <p className="faint small" style={{ marginBottom: 12 }}>{t('tasks.quadrants.suggested')}</p>
      <div className="matrix">
        {QUADS.map((q) => (
          <QuadrantBox key={q} quadrant={q} tasks={byQuad[q]} />
        ))}
      </div>
    </>
  );
}

function QuadrantBox({ quadrant, tasks }: { quadrant: Quadrant; tasks: Task[] }) {
  const over = useDragState((s) => s.over === `quad:${quadrant}`);
  const onDrop = useCallback((p: DragPayload) => {
    if (p.kind === 'task') updateTask(p.id, { quadrant });
  }, [quadrant]);
  useDropTarget(`quad:${quadrant}`, onDrop);
  return (
    <section className={cx('card quad', `quad-${quadrant}`, over && 'drop-over')} data-drop={`quad:${quadrant}`}>
      <header className="quad-head">
        <div>
          <h2 className="card-title">{t(`tasks.quadrants.${quadrant}` as TKey)}</h2>
          <p className="faint xs">{t(`tasks.quadrants.${quadrant}Hint` as TKey)}</p>
        </div>
        <span className="num faint">{tasks.length}</span>
      </header>
      <div className="list quad-list">
        {tasks.map((x) => <TaskRow key={x.id} task={x} showDate draggable />)}
      </div>
    </section>
  );
}

// ── Filtros ────────────────────────────────────────────────────────────────────────────

function FilterPopover({ anchor, filter, onChange, onClose }: { anchor: DOMRect; filter: TaskFilter; onChange: (f: TaskFilter) => void; onClose: () => void }) {
  const projects = useList('projects');
  const areas = useList('areas');
  const tags = useList('tags');
  const toggle = <K extends keyof TaskFilter>(key: K, value: NonNullable<TaskFilter[K]>[number]) => {
    const cur = (filter[key] ?? []) as unknown[];
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    onChange({ ...filter, [key]: next });
  };
  return (
    <Popover anchor={anchor} onClose={onClose} width={320}>
      <div style={{ padding: 8 }}>
        <div className="menu-label">{t('tasks.filters.priority')}</div>
        <div className="chips" style={{ padding: '0 6px 8px' }}>
          {([1, 2, 3, 4] as Priority[]).map((p) => (
            <button key={p} className={cx('chip', filter.priorities?.includes(p) && 'active')} onClick={() => toggle('priorities', p)}>P{p}</button>
          ))}
        </div>
        {projects.length > 0 && (
          <>
            <div className="menu-label">{t('tasks.filters.project')}</div>
            <div className="chips" style={{ padding: '0 6px 8px' }}>
              {projects.filter((p) => p.status !== 'archived').map((p) => (
                <button key={p.id} className={cx('chip', filter.projectIds?.includes(p.id) && 'active')} onClick={() => toggle('projectIds', p.id)}>
                  <span className="dot" style={{ color: colorValue(p.color), width: 6, height: 6 }} />{p.name}
                </button>
              ))}
            </div>
          </>
        )}
        {areas.length > 0 && (
          <>
            <div className="menu-label">{t('tasks.filters.area')}</div>
            <div className="chips" style={{ padding: '0 6px 8px' }}>
              {areas.map((a) => <button key={a.id} className={cx('chip', filter.areaIds?.includes(a.id) && 'active')} onClick={() => toggle('areaIds', a.id)}>{a.icon} {a.name}</button>)}
            </div>
          </>
        )}
        {tags.length > 0 && (
          <>
            <div className="menu-label">{t('tasks.filters.tag')}</div>
            <div className="chips" style={{ padding: '0 6px 8px' }}>
              {tags.map((tg) => <button key={tg.id} className={cx('chip', filter.tagIds?.includes(tg.id) && 'active')} onClick={() => toggle('tagIds', tg.id)}>#{tg.name}</button>)}
            </div>
          </>
        )}
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => { onChange({}); onClose(); }}><X />{t('tasks.filters.clear')}</button>
      </div>
    </Popover>
  );
}
