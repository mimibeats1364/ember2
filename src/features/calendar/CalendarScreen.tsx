import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, Plus, Timer, Upload } from 'lucide-react';
import { layoutColumns, type TimelineItem } from '@core/calendar';
import { addDays, addMonths, endOfLocalDay, formatTime, instantOf, isoWeekKey, localDateTime, startOfLocalDay, startOfMonth, startOfWeek, ymd } from '@core/dates';
import { isOpen } from '@core/tasks';
import type { Task } from '@core/types';
import { useList, usePrefs, getEntity } from '@/data/store';
import { useTimeline, useToday, useNow } from '@/data/selectors';
import { createTask, moveEvent, setTaskSlot, toggleHabit, createEvent, rescheduleTask } from '@/data/actions';
import { formatDate, formatRange, t, weekdayName, type TKey } from '@/i18n';
import { cx, Popover, MenuList, Segmented } from '@/ui/components/primitives';
import { useDropTarget, useDropTargets, useDragState, type DragPayload, type DropInfo } from '@/ui/components/dnd';
import { CATEGORY_COLORS, colorValue } from '@/ui/theme/palette';
import { navigate, openEventEditor, openTask, toast } from '@/app/ui';
import { TaskRow } from '@/features/tasks/TaskRow';
import { importIcsFile } from '@/features/settings/dataIO';
import './calendar.css';

type View = 'month' | 'week' | 'day' | 'agenda';
const PPM = 0.9; // píxeles por minuto
const SNAP = 15;

const itemColor = (it: TimelineItem) => colorValue(it.color ?? CATEGORY_COLORS[it.category as keyof typeof CATEGORY_COLORS]);

export default function CalendarScreen() {
  const today = useToday();
  const prefs = usePrefs();
  const [view, setView] = useState<View>(() => (window.innerWidth < 720 ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(today);
  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, prefs.weekStartsOn), i));
    return [];
  }, [view, anchor, prefs.weekStartsOn]);

  const step = (dir: 1 | -1) => {
    if (view === 'month') setAnchor(addMonths(startOfMonth(anchor), dir));
    else if (view === 'week') setAnchor(addDays(anchor, 7 * dir));
    else if (view === 'day') setAnchor(addDays(anchor, dir));
    else setAnchor(addDays(anchor, 14 * dir));
  };
  const title =
    view === 'month' ? formatDate(startOfMonth(anchor), 'monthYear')
    : view === 'day' ? formatDate(anchor, 'long')
    : view === 'week' ? `${formatDate(days[0], 'monthYear')} · ${t('calendar.week', { n: Number(isoWeekKey(days[0]).slice(-2)) })}`
    : formatDate(anchor, 'monthYear');

  return (
    <div className="page full calendar-page">
      <header className="cal-header">
        <div className="row-flex gap-2">
          <h1 className="page-title cal-title">{title}</h1>
        </div>
        <div className="page-actions">
          <div className="row-flex gap-1">
            <button className="btn btn-icon btn-sm" aria-label={t('a11y.previous')} onClick={() => step(-1)}><ChevronLeft /></button>
            <button className="btn btn-sm" onClick={() => setAnchor(today)}>{t('calendar.today')}</button>
            <button className="btn btn-icon btn-sm" aria-label={t('a11y.next')} onClick={() => step(1)}><ChevronRight /></button>
          </div>
          <Segmented value={view} onChange={setView} options={(['month', 'week', 'day', 'agenda'] as View[]).map((v) => ({ value: v, label: t(`calendar.views.${v}` as TKey) }))} />
          <button className="btn btn-sm btn-ghost hide-mobile" title={t('calendar.integrationsPending')} onClick={() => void importIcsFile()}><Upload />{t('calendar.importIcs')}</button>
          <button className="btn btn-primary btn-sm" onClick={() => openEventEditor(null, { start: instantOf(anchor, 9 * 60), end: instantOf(anchor, 10 * 60) })}>
            <Plus /> {t('calendar.newEvent')}
          </button>
        </div>
      </header>
      <div className="cal-body">
        {view === 'month' && <MonthView anchor={anchor} today={today} onPick={(d) => { setAnchor(d); setView('day'); }} />}
        {(view === 'week' || view === 'day') && (
          <>
            <TimeGrid days={days} today={today} />
            <Unscheduled days={days} today={today} />
          </>
        )}
        {view === 'agenda' && <Agenda from={anchor < today ? anchor : today} />}
      </div>
    </div>
  );
}

// ── Rejilla horaria (semana / día) ─────────────────────────────────────────────────────

interface DragOp {
  mode: 'move' | 'resize' | 'create';
  item?: TimelineItem;
  originDay: string;
  day: string;
  startMin: number;
  endMin: number;
  active: boolean;
}

function minutesOn(d: Date, day: string): number {
  if (d <= startOfLocalDay(day)) return 0;
  if (d >= endOfLocalDay(day)) return 1440;
  return d.getHours() * 60 + d.getMinutes();
}

function TimeGrid({ days, today }: { days: string[]; today: string }) {
  const items = useTimeline(days[0], days[days.length - 1]);
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [op, setOp] = useState<DragOp | null>(null);
  const opRef = useRef<DragOp | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; day: string; startMin: number; endMin: number } | null>(null);
  const externalOver = useDragState((s) => (s.over?.startsWith('cal:') ? s.over : null));

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, (Math.min(now.getHours(), 18) - 1.5) * 60 * PPM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  const allDay = items.filter((i) => i.allDay);
  const timed = items.filter((i) => !i.allDay);

  const minuteAt = (clientY: number, col: HTMLElement) => {
    const rect = col.getBoundingClientRect();
    return Math.max(0, Math.min(1440, Math.round((clientY - rect.top) / PPM / SNAP) * SNAP));
  };
  const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-day]');

  const startOp = (e: RPointerEvent, mode: DragOp['mode'], day: string, item?: TimelineItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const col = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day]')!;
    const y0 = e.clientY;
    const startMin = item ? minutesOn(item.start, day) : minuteAt(e.clientY, col);
    const endMin = item ? minutesOn(item.end, day) : startMin + SNAP * 2;
    opRef.current = { mode, item, originDay: day, day, startMin, endMin, active: false };
    const move = (ev: PointerEvent) => {
      const cur = opRef.current;
      if (!cur) return;
      const dyMin = Math.round((ev.clientY - y0) / PPM / SNAP) * SNAP;
      if (!cur.active && Math.abs(ev.clientY - y0) < 4) return;
      const next = { ...cur, active: true };
      if (mode === 'move' && item) {
        const len = endMin - startMin;
        const s = Math.max(0, Math.min(1440 - SNAP, startMin + dyMin));
        next.startMin = s;
        next.endMin = Math.min(1440, s + len);
        const overCol = dayAt(ev.clientX, ev.clientY);
        if (overCol?.dataset.day) next.day = overCol.dataset.day;
      } else if (mode === 'resize') {
        next.endMin = Math.max(startMin + SNAP, Math.min(1440, endMin + dyMin));
      } else {
        const m = minuteAt(ev.clientY, col);
        next.startMin = Math.min(startMin, m);
        next.endMin = Math.max(startMin + SNAP, m);
      }
      opRef.current = next;
      setOp(next);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const cur = opRef.current;
      opRef.current = null;
      setOp(null);
      if (!cur) return;
      if (!cur.active) {
        if (item) openItem(item);
        else if (mode === 'create') setMenu({ x: ev.clientX, y: ev.clientY, day, startMin: cur.startMin, endMin: cur.startMin + 60 });
        return;
      }
      if (mode === 'create') {
        setMenu({ x: ev.clientX, y: ev.clientY, day: cur.day, startMin: cur.startMin, endMin: cur.endMin });
        return;
      }
      if (!item) return;
      commitItem(item, cur.day, cur.startMin, cur.endMin);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onExternalDrop = useCallback((p: DragPayload, info: DropInfo) => {
    if (p.kind !== 'task') return;
    const col = info.target.closest<HTMLElement>('[data-day]');
    const day = col?.dataset.day;
    if (!col || !day) return;
    const m = minuteAt(info.y, col);
    setTaskSlot(p.id, day, formatTime(m), p.durationMin ?? 30);
    toast(`${p.title} · ${formatDate(day, 'medium')} ${formatTime(m)}`);
  }, []);
  useDropTargets(days.map((d) => `cal:${d}`), onExternalDrop);

  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="tg">
      <div className="tg-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => (
          <button key={d} className={cx('tg-dayhead', d === today && 'today')} onClick={() => navigate('calendar')}>
            <span className="wd">{weekdayName(new Date(d + 'T12:00').getDay(), 'short')}</span>
            <span className="dn num">{ymd(d)[2]}</span>
          </button>
        ))}
      </div>
      {allDay.length > 0 && (
        <div className="tg-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="faint xs tg-allday-label">{t('today.allDay')}</div>
          {days.map((d) => (
            <div key={d} className="tg-allday-col">
              {allDay.filter((i) => i.start < endOfLocalDay(d) && i.end > startOfLocalDay(d)).map((i) => (
                <button key={i.key + d} className="ad-chip" style={{ '--c': itemColor(i) } as CSSProperties} onClick={() => openItem(i)}>{i.title}</button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: 1440 * PPM }}>
          <div className="tg-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * 60 * PPM }} className="num">{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</span>
            ))}
          </div>
          {days.map((d) => {
            const dayItems = timed.filter((i) => i.start < endOfLocalDay(d) && i.end > startOfLocalDay(d));
            const laid = layoutColumns(dayItems.map((i) => ({ ...i, start: new Date(Math.max(i.start.getTime(), startOfLocalDay(d).getTime())), end: new Date(Math.min(i.end.getTime(), endOfLocalDay(d).getTime())) })));
            return (
              <div
                key={d}
                className={cx('tg-col', d === today && 'today', externalOver === `cal:${d}` && 'drop-over')}
                data-day={d}
                data-drop={`cal:${d}`}
                onPointerDown={(e) => startOp(e, 'create', d)}
              >
                {laid.map(({ item, col, cols }) => {
                  const dragging = op?.active && op.item?.key === item.key;
                  const s = minutesOn(item.start, d);
                  const e = minutesOn(item.end, d);
                  const short = (e - s) * PPM < 34;
                  return (
                    <div
                      key={item.key}
                      className={cx('tg-item', `k-${item.kind}`, item.done && 'done', dragging && 'ghosted', short && 'short')}
                      style={{ top: s * PPM, height: Math.max(18, (e - s) * PPM - 2), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, '--c': itemColor(item) } as CSSProperties}
                      onPointerDown={(ev) => startOp(ev, 'move', d, item)}
                      title={`${item.title} · ${formatRange(item.start, item.end)}`}
                    >
                      <span className="tg-item-title">
                        {item.kind === 'habit' && (item.done ? '✓ ' : '○ ')}
                        {item.kind === 'task' && <CircleCheck className="ti" />}
                        {item.title}
                      </span>
                      {!short && <span className="tg-item-time num">{formatRange(item.start, item.end)}</span>}
                      {item.kind !== 'habit' && <span className="tg-resize" onPointerDown={(ev) => startOp(ev, 'resize', d, item)} />}
                    </div>
                  );
                })}
                {op?.active && op.day === d && (
                  <div className={cx('tg-preview', op.mode === 'create' && 'create')} style={{ top: op.startMin * PPM, height: Math.max(18, (op.endMin - op.startMin) * PPM), '--c': op.item ? itemColor(op.item) : 'var(--accent)' } as CSSProperties}>
                    <span className="num">{formatTime(op.startMin)}–{formatTime(op.endMin)}</span>
                    {op.item && <span className="ellipsis">{op.item.title}</span>}
                  </div>
                )}
                {d === today && <div className="tg-now" style={{ top: nowMin * PPM }}><i /></div>}
              </div>
            );
          })}
        </div>
      </div>
      {menu && (
        <Popover anchor={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)}>
          <div className="menu-label">{formatDate(menu.day, 'medium')} · {formatTime(menu.startMin)}–{formatTime(menu.endMin)}</div>
          <MenuList
            onClose={() => setMenu(null)}
            items={[
              { label: t('calendar.newEvent'), icon: <CalendarPlus />, onSelect: () => openEventEditor(null, { start: instantOf(menu.day, menu.startMin), end: instantOf(menu.day, menu.endMin) }) },
              { label: t('palette.commands.newTask'), icon: <CircleCheck />, onSelect: () => { const task = createTask({ title: t('task.titlePlaceholder'), date: menu.day, time: formatTime(menu.startMin), durationMin: menu.endMin - menu.startMin }); openTask(task.id); } },
              { label: `${t('categories.focus')} · ${t('calendar.newBlock')}`, icon: <Timer />, onSelect: () => { createEvent({ title: t('categories.focus'), category: 'focus', start: instantOf(menu.day, menu.startMin), end: instantOf(menu.day, menu.endMin), protected: true }); } },
            ]}
          />
        </Popover>
      )}
    </div>
  );
}

function openItem(item: TimelineItem) {
  if (item.kind === 'task') openTask(item.id);
  else if (item.kind === 'event') openEventEditor(item.id, undefined, item.occurrence);
  else toggleHabit(item.id, item.occurrence);
}

function commitItem(item: TimelineItem, day: string, startMin: number, endMin: number) {
  if (item.kind === 'task') {
    setTaskSlot(item.id, day, formatTime(startMin), endMin - startMin);
  } else if (item.kind === 'event') {
    const ev = getEntity('events', item.id);
    if (!ev) return;
    // Mover una ocurrencia de una serie solo cambia esa vez (lo más seguro).
    moveEvent(item.id, item.occurrence, localDateTime(day, startMin), localDateTime(day, endMin), true);
    if (ev.recurrence) toast(t('calendar.deleteOccurrence'), { kind: 'info' });
  }
}

// ── Sin programar ──────────────────────────────────────────────────────────────────────

function Unscheduled({ days, today }: { days: string[]; today: string }) {
  const tasks = useList('tasks');
  const list = useMemo(() => {
    const from = days[0];
    const to = days[days.length - 1];
    return tasks
      .filter((x) => isOpen(x) && !x.time && !x.parentId && ((x.date && x.date <= to && (x.date >= from || x.date < today)) || (x.deadline && x.deadline >= from && x.deadline <= to)))
      .sort((a, b) => a.priority - b.priority);
  }, [tasks, days, today]);
  return (
    <aside className="unscheduled hide-mobile" aria-label={t('calendar.unscheduled')}>
      <div className="eyebrow">{t('calendar.unscheduled')} · {list.length}</div>
      <p className="faint xs" style={{ margin: '4px 0 10px' }}>{t('calendar.unscheduledHint')}</p>
      <div className="list">
        {list.map((x: Task) => <TaskRow key={x.id} task={x} draggable showDate />)}
      </div>
      {list.length === 0 && <p className="faint small center" style={{ marginTop: 20 }}>{t('calendar.unscheduledEmpty')}</p>}
    </aside>
  );
}

// ── Mes ────────────────────────────────────────────────────────────────────────────────

function MonthView({ anchor, today, onPick }: { anchor: string; today: string; onPick: (d: string) => void }) {
  const prefs = usePrefs();
  const first = startOfWeek(startOfMonth(anchor), prefs.weekStartsOn);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const items = useTimeline(cells[0], cells[41]);
  const tasks = useList('tasks');
  const month = anchor.slice(0, 7);
  const over = useDragState((s) => s.over);
  const onDrop = useCallback((p: DragPayload, info: DropInfo) => {
    const d = info.target.closest<HTMLElement>('[data-mday]')?.dataset.mday;
    if (p.kind === 'task' && d) rescheduleTask(p.id, d, getEntity('tasks', p.id)?.time ?? null);
  }, []);
  useDropTarget('month', onDrop);
  return (
    <div className="month" data-drop="month">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="month-wd eyebrow">{weekdayName((prefs.weekStartsOn + i) % 7, 'short')}</div>
      ))}
      {cells.map((d) => {
        const dayItems = items.filter((i) => i.start < endOfLocalDay(d) && i.end > startOfLocalDay(d) && i.kind !== 'habit');
        const dayTasks = tasks.filter((x) => isOpen(x) && !x.time && x.date === d);
        const all = [...dayItems.map((i) => ({ key: i.key, title: i.title, color: itemColor(i), open: () => openItem(i), done: i.done })), ...dayTasks.map((x) => ({ key: x.id, title: x.title, color: 'var(--text-3)', open: () => openTask(x.id), done: false }))];
        return (
          <div key={d} className={cx('month-cell', d.slice(0, 7) !== month && 'other', d === today && 'today', over === 'month' && 'droppable')} data-mday={d} onDoubleClick={() => openEventEditor(null, { start: instantOf(d, 9 * 60), end: instantOf(d, 10 * 60) })}>
            <button className="month-dn num" onClick={() => onPick(d)}>{ymd(d)[2]}</button>
            {all.slice(0, 3).map((x) => (
              <button key={x.key} className={cx('month-item', x.done && 'done')} style={{ '--c': x.color } as CSSProperties} onClick={x.open}>
                <i className="dot" />
                <span className="ellipsis">{x.title}</span>
              </button>
            ))}
            {all.length > 3 && <button className="month-more" onClick={() => onPick(d)}>{t('calendar.moreItems', { count: all.length - 3 })}</button>}
          </div>
        );
      })}
    </div>
  );
}

// ── Agenda ─────────────────────────────────────────────────────────────────────────────

function Agenda({ from }: { from: string }) {
  const to = addDays(from, 13);
  const items = useTimeline(from, to);
  const tasks = useList('tasks');
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  const today = useToday();
  let any = false;
  return (
    <div className="agenda">
      {days.map((d) => {
        const dayItems = items.filter((i) => i.start < endOfLocalDay(d) && i.end > startOfLocalDay(d));
        const dayTasks = tasks.filter((x) => isOpen(x) && !x.time && (x.date === d || x.deadline === d) && !x.parentId);
        if (dayItems.length === 0 && dayTasks.length === 0) return null;
        any = true;
        return (
          <section key={d} className="agenda-day">
            <h2 className={cx('agenda-date', d === today && 'today')}>
              <span className="num">{ymd(d)[2]}</span>
              <span>{formatDate(d, 'weekday')}<span className="faint"> · {formatDate(d, 'medium')}</span></span>
            </h2>
            <div className="card card-pad-sm">
              {dayItems.map((i) => (
                <button key={i.key} className={cx('agenda-item', i.done && 'done')} style={{ '--c': itemColor(i) } as CSSProperties} onClick={() => openItem(i)}>
                  <span className="num faint">{i.allDay ? t('today.allDay') : formatRange(i.start, i.end)}</span>
                  <span className="bar-c" />
                  <span className="grow ellipsis">{i.title}</span>
                  <span className="faint xs">{t(`categories.${i.category}` as TKey)}</span>
                </button>
              ))}
              {dayTasks.map((x) => <TaskRow key={x.id} task={x} />)}
            </div>
          </section>
        );
      })}
      {!any && <p className="muted center" style={{ padding: 40 }}>{t('calendar.agendaEmpty')}</p>}
    </div>
  );
}

