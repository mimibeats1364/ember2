import { useState, type CSSProperties } from 'react';
import { CalendarDays, Clock, Ellipsis, Flag, ListChecks, Repeat, Timer, Inbox, Ban, Trash, Sun, Sunrise, CalendarClock, CalendarX, CircleDot } from 'lucide-react';
import type { Task } from '@core/types';
import { addDays, startOfWeek, today as todayFn } from '@core/dates';
import { isOverdue, overdueDays, checklistProgress } from '@core/tasks';
import { completeTask, deleteTask, dropTask, reopenTask, rescheduleTask, updateTask } from '@/data/actions';
import { useCollection, undo } from '@/data/store';
import { useToday } from '@/data/selectors';
import { formatDuration, relativeDay, t, tp } from '@/i18n';
import { cx, openContextMenu, TaskCheck, type MenuEntry } from '@/ui/components/primitives';
import { beginDrag } from '@/ui/components/dnd';
import { colorValue } from '@/ui/theme/palette';
import { navigate, openTask, toast, useUi } from '@/app/ui';
import { startFocusSession } from '@/app/focusStore';
import { getPrefs } from '@/data/store';
import { pomodoroConfig } from '@core/focus';

export function completeWithFeedback(task: Task) {
  const next = completeTask(task.id);
  const label = next?.date ? `${t('tasks.completedToast')} · ${t('tasks.nextInstance', { date: relativeDay(next.date, todayFn()) })}` : t('tasks.completedToast');
  toast(label, { action: { label: t('common.undo'), run: () => undo() } });
}

export function startFocusOnTask(task: Task) {
  const p = getPrefs().focus;
  const minutes = task.durationMin && task.durationMin >= 45 ? Math.min(120, task.durationMin) : p.focusMin;
  const cfg = task.durationMin && task.durationMin >= 45
    ? { mode: 'deep' as const, focusMin: minutes, breakMin: 0, longBreakMin: 0, longBreakEvery: 0, cycles: 1, autoStartBreaks: false }
    : pomodoroConfig(p.focusMin, p.breakMin, p.longBreakMin, p.longBreakEvery, p.autoStartBreaks);
  startFocusSession(cfg, task.id, task.title, p.sound as never, p.volume);
  navigate('focus');
}

export function taskMenu(task: Task, today: string): MenuEntry[] {
  const nextMonday = addDays(startOfWeek(today, getPrefs().weekStartsOn), 7);
  const done = task.status === 'done';
  return [
    { heading: t('task.date') },
    { label: t('common.today'), icon: <Sun />, onSelect: () => rescheduleTask(task.id, today, task.time) },
    { label: t('common.tomorrow'), icon: <Sunrise />, onSelect: () => rescheduleTask(task.id, addDays(today, 1), task.time) },
    { label: t('tasks.groups.later') + ` · ${relativeDay(nextMonday, today)}`, icon: <CalendarClock />, onSelect: () => rescheduleTask(task.id, nextMonday) },
    { label: t('task.clearDate'), icon: <CalendarX />, onSelect: () => rescheduleTask(task.id, null) },
    { separator: true },
    { heading: t('tasks.priority') },
    ...([1, 2, 3, 4] as const).map((p) => ({ label: t(`tasks.priorities.${p}`), icon: <CircleDot />, hint: task.priority === p ? '✓' : undefined, onSelect: () => updateTask(task.id, { priority: p }) })),
    { separator: true },
    { label: t('task.startFocus'), icon: <Timer />, onSelect: () => startFocusOnTask(task) },
    ...(!task.inbox ? [{ label: t('task.moveToInbox'), icon: <Inbox />, onSelect: () => updateTask(task.id, { inbox: true }) }] : []),
    done ? { label: t('common.restore'), icon: <Repeat />, onSelect: () => reopenTask(task.id) } : { label: t('common.drop'), icon: <Ban />, onSelect: () => dropTask(task.id) },
    {
      label: t('common.delete'),
      icon: <Trash />,
      danger: true,
      onSelect: () => {
        deleteTask(task.id);
        toast(t('tasks.deletedToast'), { action: { label: t('common.undo'), run: () => undo() } });
      },
    },
  ];
}

export function TaskRow(props: { task: Task; showDate?: boolean; showProject?: boolean; draggable?: boolean; compact?: boolean }) {
  const { task } = props;
  const today = useToday();
  const projects = useCollection('projects');
  const tags = useCollection('tags');
  const allTasks = useCollection('tasks');
  const selected = useUi((s) => s.taskPanel === task.id);
  const [pending, setPending] = useState(false);
  const done = task.status === 'done' || pending;
  const overdue = isOverdue(task, today);
  const project = task.projectId ? projects[task.projectId] : undefined;
  const subtasks = Object.values(allTasks).filter((x) => x.parentId === task.id && !x.deletedAt);
  const progress = checklistProgress(task, subtasks);
  const totalItems = task.checklist.length + subtasks.length;

  const toggle = () => {
    if (task.status === 'done') {
      reopenTask(task.id);
      return;
    }
    setPending(true);
    setTimeout(() => {
      completeWithFeedback(task);
      setPending(false);
    }, 520);
  };

  return (
    <div
      className={cx('task-row', done && 'done', selected && 'selected', pending && 'leaving')}
      onContextMenu={(e) => openContextMenu(e, taskMenu(task, today))}
      onPointerDown={props.draggable ? (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        beginDrag(e, { kind: 'task', id: task.id, title: task.title, durationMin: task.durationMin ?? 30 });
      } : undefined}
      data-task={task.id}
    >
      <TaskCheck done={done} priority={task.priority} onToggle={toggle} label={t('a11y.toggleTask', { title: task.title })} />
      <div className="body" onClick={() => openTask(task.id)} role="button" tabIndex={0} aria-label={t('a11y.openTask', { title: task.title })} onKeyDown={(e) => e.key === 'Enter' && openTask(task.id)}>
        <div className="title">{task.title || t('common.untitled')}</div>
        {!props.compact && (
          <div className="meta">
            {task.time && (
              <span className="m">
                <Clock />
                {task.time}
                {task.durationMin ? ` · ${formatDuration(task.durationMin)}` : ''}
              </span>
            )}
            {!task.time && task.durationMin && (
              <span className="m">
                <Timer />
                {formatDuration(task.durationMin)}
              </span>
            )}
            {props.showDate && task.date && !overdue && (
              <span className="m">
                <CalendarDays />
                {relativeDay(task.date, today)}
              </span>
            )}
            {overdue && !done && <span className="m warn">{tp('tasks.overdueDays', overdueDays(task, today))}</span>}
            {task.deadline && !(overdue && task.deadline < today) && (
              <span className={cx('m', task.deadline <= addDays(today, 1) && 'warn')}>
                <Flag />
                {t('tasks.deadline', { date: relativeDay(task.deadline, today) })}
              </span>
            )}
            {task.recurrence && (
              <span className="m">
                <Repeat />
              </span>
            )}
            {totalItems > 0 && progress !== null && (
              <span className="m">
                <ListChecks />
                {Math.round(progress * totalItems)}/{totalItems}
              </span>
            )}
            {props.showProject !== false && project && (
              <span className="m" style={{ '--c': colorValue(project.color) } as CSSProperties}>
                <span className="dot" style={{ color: colorValue(project.color), width: 7, height: 7 }} />
                {project.name}
              </span>
            )}
            {task.tagIds.map((id) =>
              tags[id] ? (
                <span key={id} className="m">
                  #{tags[id].name}
                </span>
              ) : null,
            )}
            {task.inbox && <span className="m">{t('task.inboxBadge')}</span>}
          </div>
        )}
      </div>
      <div className="actions">
        {!done && (
          <button className="btn btn-ghost btn-icon btn-sm" title={t('task.startFocus')} aria-label={t('task.startFocus')} onClick={(e) => (e.stopPropagation(), startFocusOnTask(task))}>
            <Timer />
          </button>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.more')} onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openContextMenu({ clientX: r.left, clientY: r.bottom + 4 }, taskMenu(task, today));
        }}>
          <Ellipsis />
        </button>
      </div>
    </div>
  );
}
