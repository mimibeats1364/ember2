import { useMemo } from 'react';
import { CalendarPlus, Check, CircleCheck, Flame, Inbox, Lightbulb, NotebookPen, Sun, Sunrise, Trash } from 'lucide-react';
import { addDays, localDateOf } from '@core/dates';
import { isOpen } from '@core/tasks';
import { deleteEntity, updateEntity, useList, transaction, undo } from '@/data/store';
import { useToday } from '@/data/selectors';
import { createHabit, inboxNoteToTask, inboxTaskToNote, rescheduleTask } from '@/data/actions';
import { relativeDay, t, tp } from '@/i18n';
import { Empty } from '@/ui/components/primitives';
import { navigate, openCapture, openEventEditor, openHabitEditor, openTask, toast } from '@/app/ui';
import { InlineAdd } from '@/features/tasks/InlineAdd';
import './inbox.css';

export default function InboxScreen() {
  const tasks = useList('tasks');
  const notes = useList('notes');
  const today = useToday();
  const items = useMemo(
    () =>
      [
        ...tasks.filter((x) => isOpen(x) && x.inbox).map((x) => ({ kind: 'task' as const, id: x.id, title: x.title, created: x.createdAt })),
        ...notes.filter((n) => n.inbox && !n.archived).map((n) => ({ kind: n.kind, id: n.id, title: n.title || n.body.slice(0, 80) || t('common.untitled'), created: n.createdAt })),
      ].sort((a, b) => b.created.localeCompare(a.created)),
    [tasks, notes],
  );
  const organizedToast = () => toast(t('inbox.organized'), { action: { label: t('common.undo'), run: () => undo() } });
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('inbox.title')}</h1>
          <p className="page-subtitle">{t('inbox.subtitle')}</p>
        </div>
        <span className="faint small">{tp('inbox.count', items.length)}</span>
      </header>
      <div className="card card-pad">
        <InlineAdd defaults={{ inbox: true }} placeholder={t('capture.placeholder')} />
        <div className="inbox-list">
          {items.map((it) => (
            <div key={it.kind + it.id} className="inbox-item">
              <span className="inbox-kind">{it.kind === 'task' ? <CircleCheck /> : it.kind === 'idea' ? <Lightbulb /> : <NotebookPen />}</span>
              <button className="grow inbox-title" onClick={() => (it.kind === 'task' ? openTask(it.id) : navigate('notes', { id: it.id }))}>
                <span className="ellipsis">{it.title}</span>
                <span className="faint xs">{relativeDay(localDateOf(it.created), today)}</span>
              </button>
              <div className="inbox-actions">
                {it.kind === 'task' ? (
                  <>
                    <button className="btn btn-sm btn-ghost" title={t('common.today')} onClick={() => { rescheduleTask(it.id, today); organizedToast(); }}><Sun />{t('common.today')}</button>
                    <button className="btn btn-sm btn-ghost" title={t('common.tomorrow')} onClick={() => { rescheduleTask(it.id, addDays(today, 1)); organizedToast(); }}><Sunrise /></button>
                    <button className="btn btn-sm btn-ghost" onClick={() => { updateEntity('tasks', it.id, { inbox: false }); openTask(it.id); }} title={t('inbox.schedule')}><Check /></button>
                    <button className="btn btn-sm btn-ghost" title={t('inbox.toNote')} onClick={() => { inboxTaskToNote(it.id); organizedToast(); }}><NotebookPen /></button>
                    <button className="btn btn-sm btn-ghost" title={t('inbox.toHabit')} onClick={() => {
                      const habit = transaction(t('inbox.toHabit'), () => { const h = createHabit({ name: it.title }); deleteEntity('tasks', it.id); return h; });
                      openHabitEditor(habit.id);
                    }}><Flame /></button>
                    <button className="btn btn-sm btn-ghost" title={t('inbox.toEvent')} onClick={() => { deleteEntity('tasks', it.id); openEventEditor(null, { title: it.title }); }}><CalendarPlus /></button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm btn-ghost" title={t('inbox.toTask')} onClick={() => { const task = inboxNoteToTask(it.id); if (task) openTask(task.id); }}><CircleCheck />{t('inbox.toTask')}</button>
                    <button className="btn btn-sm btn-ghost" title={t('inbox.organized')} onClick={() => { updateEntity('notes', it.id, { inbox: false }); organizedToast(); }}><Check /></button>
                  </>
                )}
                <button className="btn btn-sm btn-ghost btn-danger" aria-label={t('common.delete')} onClick={() => { deleteEntity(it.kind === 'task' ? 'tasks' : 'notes', it.id); toast(t('tasks.deletedToast'), { action: { label: t('common.undo'), run: () => undo() } }); }}><Trash /></button>
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && <Empty icon={<Inbox />} title={t('inbox.empty')} body={t('inbox.emptyHint')} action={<button className="btn btn-sm" onClick={() => openCapture('task')}>{t('nav.capture')}</button>} />}
      </div>
    </div>
  );
}
