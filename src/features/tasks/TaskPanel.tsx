import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  CircleDot,
  Clock,
  Flag,
  Folder,
  Grid2x2,
  Hash,
  Layers,
  Link,
  Lightbulb,
  ListChecks,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Square,
  Target,
  Timer,
  Trash,
  Ban,
  X,
  Workflow,
  Info,
} from 'lucide-react';
import type { Quadrant, Task, TaskStatus } from '@core/types';
import { quadrantOf, blockers, isOpen } from '@core/tasks';
import { estimateHint } from '@core/estimation';
import { trackedMinutes } from '@core/progress';
import { localDateOf, toLocalDate } from '@core/dates';
import { getEntity, useCollection, useEntity, useList, updateEntity, undo } from '@/data/store';
import { useToday } from '@/data/selectors';
import {
  addManualTime,
  deleteTask,
  dropTask,
  ensureTags,
  newChecklistItem,
  newReminder,
  createTask,
  setTaskSlot,
  startTimer,
  stopTimerFor,
  updateTask,
  inboxTaskToNote,
} from '@/data/actions';
import { findSlotsForTask } from '@/data/schedule';
import type { SlotSuggestion } from '@core/scheduler';
import { formatDate, formatDuration, formatRange, relativeDay, t, type TKey } from '@/i18n';
import { cx, PriorityPicker, TaskCheck } from '@/ui/components/primitives';
import { RecurrencePicker } from '@/ui/components/RecurrencePicker';
import { navigate, openTask, toast } from '@/app/ui';
import { TaskRow, completeWithFeedback, startFocusOnTask } from './TaskRow';
import { InlineAdd } from './InlineAdd';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export function TaskPanel({ id }: { id: string }) {
  const task = useEntity('tasks', id);
  if (!task || task.deletedAt) {
    return <div className="empty">{t('common.notAvailable')}</div>;
  }
  return <TaskEditor key={task.id} task={task} />;
}

/** Guarda tras una pausa al escribir, solo si el valor difiere del guardado. */
function useDebouncedSave(value: string, current: () => string, save: (v: string) => void, delay = 400) {
  useEffect(() => {
    const id = setTimeout(() => {
      if (value !== current()) save(value);
    }, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

function TaskEditor({ task }: { task: Task }) {
  const today = useToday();
  const projects = useList('projects');
  const areas = useList('areas');
  const goals = useList('goals');
  const tags = useCollection('tags');
  const allTasks = useCollection('tasks');
  const sessions = useList('focusSessions');
  const entries = useList('timeEntries');
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tagInput, setTagInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [checkInput, setCheckInput] = useState('');
  const [slots, setSlots] = useState<SlotSuggestion[] | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useDebouncedSave(title, () => getEntity('tasks', task.id)?.title ?? '', (v) => v.trim() && updateEntity('tasks', task.id, { title: v.trim() }));
  useDebouncedSave(notes, () => getEntity('tasks', task.id)?.notes ?? '', (v) => updateEntity('tasks', task.id, { notes: v }));
  useEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [title]);

  const set = (patch: Partial<Task>) => updateTask(task.id, patch);
  const subtasks = useMemo(() => Object.values(allTasks).filter((x) => x.parentId === task.id && !x.deletedAt), [allTasks, task.id]);
  const blockedBy = blockers(task, allTasks);
  const tracked = trackedMinutes(sessions, entries, (tid) => tid === task.id);
  const timer = entries.find((e) => e.end === null);
  const timerHere = timer?.taskId === task.id;
  const hint = useMemo(
    () => estimateHint(task, Object.values(allTasks), (tid) => trackedMinutes(sessions, entries, (x) => x === tid)),
    [task, allTasks, sessions, entries],
  );
  const done = task.status === 'done';
  const effectiveQuadrant = quadrantOf(task, today);

  return (
    <div className="task-editor">
      <div className="tp-head">
        <TaskCheck done={done} priority={task.priority} onToggle={() => (done ? set({ status: 'todo', completedAt: null }) : completeWithFeedback(task))} label={t('a11y.toggleTask', { title: task.title })} />
        <textarea ref={titleRef} className="tp-title" rows={1} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('task.titlePlaceholder')} aria-label={t('task.titlePlaceholder')} />
      </div>
      {task.inbox && (
        <div className="row-flex gap-2" style={{ marginTop: 10 }}>
          <span className="tag accent">{t('task.inboxBadge')}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => set({ inbox: false })}>
            <Check /> {t('inbox.organized')}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => { const n = inboxTaskToNote(task.id); if (n) { openTask(null); navigate('notes', { id: n.id }); } }}>
            <Lightbulb /> {t('task.convertToNote')}
          </button>
        </div>
      )}

      <div className="row-flex gap-2 wrap" style={{ marginTop: 16 }}>
        {!done && (
          <button className="btn btn-primary btn-sm" onClick={() => startFocusOnTask(task)}>
            <Play /> {t('task.startFocus')}
          </button>
        )}
        {timerHere ? (
          <button className="btn btn-sm" onClick={() => stopTimerFor(task.id)}>
            <Square /> {t('task.stopTimer')}
          </button>
        ) : (
          !done && (
            <button className="btn btn-sm" onClick={() => { startTimer(task.id); toast(t('task.timerRunning')); }}>
              <Timer /> {t('task.startTimer')}
            </button>
          )
        )}
        {!done && (
          <button className="btn btn-sm" onClick={() => setSlots(findSlotsForTask(task.id))}>
            <Sparkles /> {t('task.findTime')}
          </button>
        )}
      </div>

      {slots && (
        <div style={{ marginTop: 10 }}>
          {slots.length === 0 && <div className="hint-box"><Info />{t('task.noSlots')}</div>}
          {slots.map((s, i) => (
            <div key={i} className="slot-sugg">
              <Sparkles size={15} style={{ color: 'var(--accent)' }} />
              <div className="grow">
                <div className="eyebrow accent">{t('task.suggestedTime')}</div>
                <div style={{ fontWeight: 650, fontSize: 'var(--fs-sm)', marginTop: 2 }}>
                  {relativeDay(s.date, today)} · {s.parts.map((p) => formatRange(new Date(p.start), new Date(p.end))).join(' + ')}
                </div>
                {s.parts.length > 1 && <div className="faint xs">{t('task.splitSuggestion', { count: s.parts.length })}</div>}
              </div>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  // Un bloque: se programa la tarea. Varios: la tarea toma el primero y el resto
                  // se crean como subtareas programadas ("Título (2/3)").
                  s.parts.forEach((part, i) => {
                    const at = new Date(part.start);
                    const minutes = Math.round((part.end - part.start) / 60_000);
                    if (i === 0) setTaskSlot(task.id, toLocalDate(at), at.toTimeString().slice(0, 5), minutes);
                    else createTask({ title: `${task.title} (${i + 1}/${s.parts.length})`, parentId: task.id, projectId: task.projectId, date: toLocalDate(at), time: at.toTimeString().slice(0, 5), durationMin: minutes, priority: task.priority });
                  });
                  setSlots(null);
                  toast(t('plan.accepted'));
                }}
              >
                {t('task.addToPlan')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tp-props">
        <span className="k"><CircleDot />{t('task.status')}</span>
        <select className="select" value={task.status} onChange={(e) => {
          const status = e.target.value as TaskStatus;
          if (status === 'done') completeWithFeedback(task);
          else set({ status, completedAt: null });
        }}>
          {(['backlog', 'todo', 'in_progress', 'done', 'dropped'] as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{t(`tasks.status.${s}` as TKey)}</option>
          ))}
        </select>

        <span className="k"><Flag />{t('tasks.priority')}</span>
        <PriorityPicker value={task.priority} onChange={(priority) => set({ priority })} />

        <span className="k"><CalendarDays />{t('task.date')}</span>
        <div className="row-flex gap-2">
          <input type="date" className="input" value={task.date ?? ''} onChange={(e) => set({ date: e.target.value || null, inbox: false })} />
          {task.date && <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('task.clearDate')} onClick={() => set({ date: null, time: null })}><X /></button>}
        </div>

        <span className="k"><Clock />{t('task.time')}</span>
        <div className="row-flex gap-2">
          <input type="time" className="input" value={task.time ?? ''} onChange={(e) => set({ time: e.target.value || null, date: task.date ?? today, inbox: false })} />
          {task.time && <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.clear')} onClick={() => set({ time: null })}><X /></button>}
        </div>

        <span className="k"><Timer />{t('task.duration')}</span>
        <select className="select" value={task.durationMin ?? ''} onChange={(e) => set({ durationMin: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>
          {[...new Set([...DURATIONS, ...(task.durationMin ? [task.durationMin] : [])])].sort((a, b) => a - b).map((d) => (
            <option key={d} value={d}>{formatDuration(d)}</option>
          ))}
        </select>

        <span className="k"><Flag />{t('task.deadline')}</span>
        <div className="row-flex gap-2">
          <input type="date" className="input" value={task.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />
          {task.deadline && <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.clear')} onClick={() => set({ deadline: null })}><X /></button>}
        </div>

        <span className="k"><Folder />{t('task.project')}</span>
        <select className="select" value={task.projectId ?? ''} onChange={(e) => {
          const p = projects.find((x) => x.id === e.target.value);
          set({ projectId: p?.id ?? null, areaId: p?.areaId ?? task.areaId, inbox: false });
        }}>
          <option value="">{t('task.noProject')}</option>
          {projects.filter((p) => p.status !== 'archived').map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
        </select>

        <span className="k"><Layers />{t('task.area')}</span>
        <select className="select" value={task.areaId ?? ''} onChange={(e) => set({ areaId: e.target.value || null })}>
          <option value="">{t('task.noArea')}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>

        <span className="k"><Target />{t('task.goal')}</span>
        <select className="select" value={task.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value || null })}>
          <option value="">{t('task.noGoal')}</option>
          {goals.filter((g) => g.status === 'active' || g.id === task.goalId).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.title}</option>)}
        </select>

        <span className="k"><Repeat />{t('task.repeat')}</span>
        <RecurrencePicker value={task.recurrence} anchor={task.date ?? today} onChange={(recurrence) => set({ recurrence, date: task.date ?? (recurrence ? today : null) })} />

        <span className="k"><Grid2x2 />{t('task.quadrant')}</span>
        <select className="select" value={task.quadrant ?? ''} onChange={(e) => set({ quadrant: (e.target.value || null) as Quadrant | null })}>
          <option value="">{t('task.quadrantAuto')} · {t(`tasks.quadrants.${effectiveQuadrant}` as TKey)}</option>
          {(['do', 'schedule', 'delegate', 'delete'] as Quadrant[]).map((q) => <option key={q} value={q}>{t(`tasks.quadrants.${q}` as TKey)}</option>)}
        </select>

        {effectiveQuadrant === 'delegate' && (
          <>
            <span className="k">{t('task.delegatedTo')}</span>
            <input className="input" value={task.delegatedTo} onChange={(e) => set({ delegatedTo: e.target.value })} />
          </>
        )}

        <span className="k"><Bell />{t('task.reminders')}</span>
        <div className="row-flex gap-1 wrap">
          {task.reminders.map((r) => (
            <span key={r.id} className="tag">
              {r.offsetMin === 0 ? t('task.reminderAt') : t('task.reminderBefore', { duration: formatDuration(r.offsetMin) })}
              <button aria-label={t('common.delete')} onClick={() => set({ reminders: task.reminders.filter((x) => x.id !== r.id) })}><X size={11} /></button>
            </span>
          ))}
          <select className="select" style={{ width: 'auto', height: 26, fontSize: 11 }} value="" onChange={(e) => e.target.value !== '' && set({ reminders: [...task.reminders, newReminder(Number(e.target.value))] })} aria-label={t('task.addReminder')}>
            <option value="">+ {t('task.addReminder')}</option>
            {[0, 5, 10, 15, 30, 60, 120, 1440].map((m) => <option key={m} value={m}>{m === 0 ? t('task.reminderAt') : t('task.reminderBefore', { duration: formatDuration(m) })}</option>)}
          </select>
        </div>

        <span className="k"><Hash />{t('task.tags')}</span>
        <div className="row-flex gap-1 wrap">
          {task.tagIds.map((tid) => tags[tid] && (
            <span key={tid} className="tag">#{tags[tid].name}
              <button aria-label={t('common.delete')} onClick={() => set({ tagIds: task.tagIds.filter((x) => x !== tid) })}><X size={11} /></button>
            </span>
          ))}
          <input className="input input-bare small" style={{ width: 120 }} value={tagInput} placeholder={t('task.addTag')} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && tagInput.trim()) {
              const [tid] = ensureTags([tagInput.trim().replace(/^#/, '')]);
              if (!task.tagIds.includes(tid)) set({ tagIds: [...task.tagIds, tid] });
              setTagInput('');
            }
          }} />
        </div>
      </div>

      {hint && !done && (
        <div className="hint-box" style={{ marginTop: 14 }}>
          <Info />
          <span className="grow">{t('task.estimateHint', { duration: formatDuration(hint.averageMin), count: hint.samples })}</span>
          <button className="btn btn-sm btn-subtle" onClick={() => set({ durationMin: hint.averageMin })}>{t('task.applyEstimate', { duration: formatDuration(hint.averageMin) })}</button>
        </div>
      )}

      <div className="tp-section">
        <div className="tp-section-title"><span className="eyebrow">{t('task.tracking')}</span></div>
        <div className="time-compare">
          <div className="card"><div className="faint xs">{t('task.planned')}</div><div className="num" style={{ fontWeight: 700, marginTop: 4 }}>{task.durationMin ? formatDuration(task.durationMin) : '—'}</div></div>
          <div className="card"><div className="faint xs">{t('task.actual')}</div><div className="num" style={{ fontWeight: 700, marginTop: 4, color: task.durationMin && tracked > task.durationMin ? 'var(--warning)' : undefined }}>{formatDuration(tracked)}{timerHere && ' · ⏱'}</div></div>
        </div>
        <div className="row-flex gap-2" style={{ marginTop: 8 }}>
          <span className="faint xs">{t('task.addManualTime')}</span>
          {[15, 30, 60].map((m) => <button key={m} className="btn btn-sm btn-ghost" onClick={() => addManualTime(task.id, m)}>+{formatDuration(m)}</button>)}
        </div>
      </div>

      <div className="tp-section">
        <div className="tp-section-title"><span className="eyebrow"><ListChecks size={12} /> {t('task.checklist')}</span></div>
        {task.checklist.map((c) => (
          <div key={c.id} className={cx('check-item', c.done && 'done')}>
            <button className={cx('mini-check', c.done && 'on')} aria-label={c.text} onClick={() => set({ checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}>
              {c.done && <Check strokeWidth={3} />}
            </button>
            <input type="text" value={c.text} onChange={(e) => set({ checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })} />
            <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.delete')} onClick={() => set({ checklist: task.checklist.filter((x) => x.id !== c.id) })}><X /></button>
          </div>
        ))}
        <div className="check-item">
          <Plus size={14} className="faint" />
          <input type="text" value={checkInput} placeholder={t('task.addChecklist')} onChange={(e) => setCheckInput(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && checkInput.trim()) {
              set({ checklist: [...task.checklist, newChecklistItem(checkInput.trim())] });
              setCheckInput('');
            }
          }} />
        </div>
      </div>

      <div className="tp-section">
        <div className="tp-section-title"><span className="eyebrow">{t('task.subtasks')}</span></div>
        <div className="list">
          {subtasks.map((s) => <TaskRow key={s.id} task={s} compact showProject={false} />)}
        </div>
        <InlineAdd defaults={{ parentId: task.id, projectId: task.projectId, date: undefined }} placeholder={t('task.addSubtask')} />
      </div>

      <div className="tp-section">
        <div className="tp-section-title"><span className="eyebrow"><Workflow size={12} /> {t('task.dependencies')}</span></div>
        {task.dependsOn.map((did) => allTasks[did] && (
          <div key={did} className="row-flex gap-2 small" style={{ padding: '4px 0' }}>
            <span className={cx('dot')} style={{ color: isOpen(allTasks[did]) ? 'var(--warning)' : 'var(--success)' }} />
            <button className="grow ellipsis" style={{ textAlign: 'left' }} onClick={() => openTask(did)}>{allTasks[did].title}</button>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.delete')} onClick={() => set({ dependsOn: task.dependsOn.filter((x) => x !== did) })}><X /></button>
          </div>
        ))}
        {blockedBy.length > 0 && <div className="faint xs">{t('tasks.blocked', { count: blockedBy.length })}</div>}
        <select className="select" style={{ marginTop: 6, height: 32, fontSize: 12 }} value="" onChange={(e) => e.target.value && set({ dependsOn: [...task.dependsOn, e.target.value] })} aria-label={t('task.addDependency')}>
          <option value="">+ {t('task.addDependency')}</option>
          {Object.values(allTasks).filter((x) => isOpen(x) && x.id !== task.id && !task.dependsOn.includes(x.id) && (!task.projectId || x.projectId === task.projectId)).slice(0, 80).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      </div>

      <div className="tp-section">
        <div className="tp-section-title"><span className="eyebrow"><Link size={12} /> {t('task.links')}</span></div>
        {task.links.map((l, i) => (
          <div key={i} className="row-flex gap-2 small" style={{ padding: '3px 0' }}>
            <a href={l} target="_blank" rel="noreferrer" className="grow ellipsis">{l}</a>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.delete')} onClick={() => set({ links: task.links.filter((_, j) => j !== i) })}><X /></button>
          </div>
        ))}
        <input className="input" style={{ height: 32 }} value={linkInput} placeholder={t('task.addLink')} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && /^https?:\/\//.test(linkInput.trim())) {
            set({ links: [...task.links, linkInput.trim()] });
            setLinkInput('');
          }
        }} />
        <div className="faint xs" style={{ marginTop: 6 }}>{t('task.attachmentsPending')}</div>
      </div>

      <div className="tp-section">
        <div className="tp-section-title"><span className="eyebrow">{t('task.notes')}</span></div>
        <textarea className="textarea" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('task.notesPlaceholder')} />
      </div>

      <div className="divider" />
      <div className="row-flex gap-2 wrap">
        <span className="faint xs grow">
          {t('task.created', { date: formatDate(localDateOf(task.createdAt), 'medium') })}
          {task.completedAt && ` · ${t('task.completedAt', { date: formatDate(localDateOf(task.completedAt), 'medium') })}`}
        </span>
        {task.status !== 'dropped' && !done && (
          <button className="btn btn-sm btn-ghost" onClick={() => { dropTask(task.id); toast(t('tasks.droppedToast'), { action: { label: t('common.undo'), run: () => undo() } }); }}>
            <Ban /> {t('common.drop')}
          </button>
        )}
        <button className="btn btn-sm btn-danger" onClick={() => {
          deleteTask(task.id);
          openTask(null);
          toast(t('tasks.deletedToast'), { action: { label: t('common.undo'), run: () => undo() } });
        }}>
          <Trash /> {t('common.delete')}
        </button>
      </div>
    </div>
  );
}
