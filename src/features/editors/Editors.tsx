import { lazy, Suspense, useMemo, useState } from 'react';
import { Archive, Check, Sparkles, Trash, ArrowRight } from 'lucide-react';
import type { CalendarEvent, EventCategory, Goal, GoalHorizon, Habit, HabitFrequency, Project, Weekday } from '@core/types';
import { addDays, endOfMonth, endOfQuarter, endOfWeek, endOfYear, instantOf, localDateOf, minutesOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear, formatTime, today as todayFn } from '@core/dates';
import type { PlanStrategy } from '@core/scheduler';
import { createEntity, getPrefs, updateEntity, useEntity, useList, undo } from '@/data/store';
import { applyPlan, createEvent, createHabit, deleteEvent, deleteEventOccurrence, rescheduleTask } from '@/data/actions';
import { areaFields, goalFields, projectFields } from '@/data/defaults';
import { proposeDay } from '@/data/schedule';
import { useData } from '@/data/store';
import { formatDate, formatDuration, formatRange, t, weekdayName, type TKey } from '@/i18n';
import { ColorPicker, cx, EmojiPicker, Field, Modal, Segmented, Switch } from '@/ui/components/primitives';
import { RecurrencePicker } from '@/ui/components/RecurrencePicker';
import { askConfirm, navigate, openPlanDay, toast, useUi } from '@/app/ui';
import { CATEGORY_ICONS } from '@/ui/theme/palette';
import { buildTimeline } from '@core/calendar';
import { isScheduled } from '@core/habits';

const YearReview = lazy(() => import('@/features/insights/YearReview'));
const RoutineRunner = lazy(() => import('@/features/routines/RoutineOverlays').then((m) => ({ default: m.RoutineRunner })));
const RoutineEditor = lazy(() => import('@/features/routines/RoutineOverlays').then((m) => ({ default: m.RoutineEditor })));

export default function Editors() {
  const ui = useUi();
  return (
    <>
      {ui.habitEditor && <HabitEditor key={ui.habitEditor.id ?? 'new'} id={ui.habitEditor.id} prefill={ui.habitEditor.prefill} />}
      {ui.eventEditor && <EventEditor key={ui.eventEditor.id ?? 'new'} id={ui.eventEditor.id} prefill={ui.eventEditor.prefill} occurrence={ui.eventEditor.occurrence} />}
      {ui.projectEditor && <ProjectEditor key={ui.projectEditor.id ?? 'new'} id={ui.projectEditor.id} prefill={ui.projectEditor.prefill} />}
      {ui.goalEditor && <GoalEditor key={ui.goalEditor.id ?? 'new'} id={ui.goalEditor.id} prefill={ui.goalEditor.prefill} />}
      {ui.areaEditor && <AreaEditor key={ui.areaEditor.id ?? 'new'} id={ui.areaEditor.id} />}
      {ui.planDay && <PlanDayModal key={ui.planDay} date={ui.planDay} />}
      {(ui.routineRunner || ui.routineEditor) && (
        <Suspense fallback={null}>
          {ui.routineRunner && <RoutineRunner key={ui.routineRunner} id={ui.routineRunner} />}
          {ui.routineEditor && <RoutineEditor key={ui.routineEditor.id ?? 'new'} id={ui.routineEditor.id} prefill={ui.routineEditor.prefill} />}
        </Suspense>
      )}
      {ui.yearReview && (
        <Suspense fallback={null}>
          <YearReview />
        </Suspense>
      )}
    </>
  );
}

// ── Hábito ─────────────────────────────────────────────────────────────────────────────

const FREQ_KINDS: HabitFrequency['kind'][] = ['daily', 'weekdays', 'times_per_week', 'interval'];
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function HabitEditor({ id, prefill }: { id: string | null; prefill?: Partial<Habit> }) {
  const existing = useEntity('habits', id);
  const habits = useList('habits');
  const areas = useList('areas');
  const goals = useList('goals');
  const [h, setH] = useState<Partial<Habit>>(() => existing ?? { name: '', icon: '✦', color: 'mint', frequency: { kind: 'daily' }, target: 1, unit: '', preferredTime: null, durationMin: null, reminder: false, difficulty: 1, graceDays: getPrefs().graceDaysDefault, stackAfter: null, description: '', areaId: null, goalId: null, ...prefill });
  const close = () => useUi.setState({ habitEditor: null });
  const set = (p: Partial<Habit>) => setH((x) => ({ ...x, ...p }));
  const freq = h.frequency ?? { kind: 'daily' };
  const save = () => {
    if (!h.name?.trim()) return;
    if (existing) updateEntity('habits', existing.id, { ...h, name: h.name.trim() });
    else createHabit({ ...h, name: h.name.trim() });
    close();
  };
  return (
    <Modal
      title={existing ? existing.name : t('habits.newHabit')}
      onClose={close}
      wide
      footer={
        <>
          {existing && (
            <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => { updateEntity('habits', existing.id, { archived: true }); toast(t('habits.archived'), { action: { label: t('common.undo'), run: () => undo() } }); close(); }}>
              <Archive /> {t('habits.archive')}
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={!h.name?.trim()}>{t('common.save')}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('habits.name')} className="full">
          <input className="input" autoFocus value={h.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder={t('habits.namePlaceholder')} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label={t('habits.frequency')} className="full">
          <Segmented value={freq.kind} options={FREQ_KINDS.map((k) => ({ value: k, label: t(`habits.freq.${k}` as TKey) }))} onChange={(k) => set({ frequency: k === 'weekdays' ? { kind: k, days: [1, 3, 5] } : k === 'times_per_week' ? { kind: k, times: 3 } : k === 'interval' ? { kind: k, every: 2 } : { kind: 'daily' } })} />
        </Field>
        {freq.kind === 'weekdays' && (
          <div className="full row-flex gap-1 wrap">
            {WEEK_ORDER.map((d) => {
              const on = freq.days.includes(d);
              return (
                <button key={d} className={cx('chip', on && 'active')} onClick={() => set({ frequency: { kind: 'weekdays', days: on ? freq.days.filter((x) => x !== d) : [...freq.days, d] } })}>
                  {weekdayName(d, 'short')}
                </button>
              );
            })}
          </div>
        )}
        {freq.kind === 'times_per_week' && (
          <Field label={t('habits.timesPerWeek', { n: '' }).trim()}>
            <input type="number" className="input" min={1} max={7} value={freq.times} onChange={(e) => set({ frequency: { kind: 'times_per_week', times: Math.min(7, Math.max(1, Number(e.target.value) || 1)) } })} />
          </Field>
        )}
        {freq.kind === 'interval' && (
          <Field label={t('habits.everyNDays', { n: 'N' })}>
            <input type="number" className="input" min={2} max={60} value={freq.every} onChange={(e) => set({ frequency: { kind: 'interval', every: Math.max(2, Number(e.target.value) || 2) } })} />
          </Field>
        )}
        <Field label={t('habits.target')}>
          <div className="row-flex gap-2">
            <input type="number" className="input" style={{ width: 90 }} min={1} max={1000} value={h.target ?? 1} onChange={(e) => set({ target: Math.max(1, Number(e.target.value) || 1) })} />
            <input className="input" value={h.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} placeholder={t('habits.unitPlaceholder')} />
          </div>
        </Field>
        <Field label={t('habits.preferredTime')}>
          <div className="row-flex gap-2">
            <input type="time" className="input" value={h.preferredTime ?? ''} onChange={(e) => set({ preferredTime: e.target.value || null })} />
            <select className="select" value={h.durationMin ?? ''} onChange={(e) => set({ durationMin: e.target.value ? Number(e.target.value) : null })} aria-label={t('habits.duration')}>
              <option value="">{t('habits.duration')}</option>
              {[5, 10, 15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </div>
        </Field>
        <div className="field-row full">
          <span className="small">{t('habits.reminder')}</span>
          <Switch checked={!!h.reminder} onChange={(v) => set({ reminder: v })} label={t('habits.reminder')} />
        </div>
        <Field label={t('habits.difficulty')}>
          <Segmented value={String(h.difficulty ?? 1)} options={[1, 2, 3].map((d) => ({ value: String(d), label: t(`habits.difficulties.${d}` as TKey) }))} onChange={(v) => set({ difficulty: Number(v) as 1 | 2 | 3 })} />
        </Field>
        <Field label={t('habits.graceDays')} hint={t('habits.graceHint')}>
          <Segmented value={String(h.graceDays ?? 1)} options={[0, 1, 2, 3].map((d) => ({ value: String(d), label: String(d) }))} onChange={(v) => set({ graceDays: Number(v) })} />
        </Field>
        <Field label={t('habits.stackAfter')}>
          <select className="select" value={h.stackAfter ?? ''} onChange={(e) => set({ stackAfter: e.target.value || null })}>
            <option value="">{t('habits.stackNone')}</option>
            {habits.filter((x) => !x.archived && x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}
          </select>
        </Field>
        <Field label={t('habits.area')}>
          <select className="select" value={h.areaId ?? ''} onChange={(e) => set({ areaId: e.target.value || null })}>
            <option value="">—</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
        </Field>
        <Field label={t('habits.goal')}>
          <select className="select" value={h.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value || null })}>
            <option value="">—</option>
            {goals.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.icon} {g.title}</option>)}
          </select>
        </Field>
        <Field label={t('habits.description')} className="full">
          <input className="input" value={h.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label={t('habits.color')} className="full">
          <ColorPicker value={h.color ?? 'mint'} onChange={(color) => set({ color })} />
        </Field>
        <Field label={t('habits.icon')} className="full">
          <EmojiPicker value={h.icon ?? '✦'} onChange={(icon) => set({ icon })} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Evento / bloque ────────────────────────────────────────────────────────────────────

const CATEGORIES: EventCategory[] = ['event', 'meeting', 'work', 'study', 'training', 'meal', 'rest', 'leisure', 'commute', 'personal', 'focus'];

function EventEditor({ id, prefill, occurrence }: { id: string | null; prefill?: Partial<CalendarEvent>; occurrence?: string }) {
  const existing = useEntity('events', id);
  const base = existing ?? ({ title: '', category: 'event', allDay: false, notes: '', location: '', recurrence: null, protected: false, ...prefill } as Partial<CalendarEvent>);
  const start0 = new Date(base.start ?? new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString());
  const end0 = new Date(base.end ?? new Date(start0.getTime() + 3_600_000).toISOString());
  const [title, setTitle] = useState(base.title ?? '');
  const [category, setCategory] = useState<EventCategory>(base.category ?? 'event');
  const [allDay, setAllDay] = useState(!!base.allDay);
  const [date, setDate] = useState(base.date ?? localDateOf(start0));
  const [endDate, setEndDate] = useState(base.endDate ?? base.date ?? localDateOf(start0));
  const [startTime, setStartTime] = useState(formatTime(minutesOfDay(start0)));
  const [endTime, setEndTime] = useState(formatTime(minutesOfDay(end0)));
  const [location, setLocation] = useState(base.location ?? '');
  const [notes, setNotes] = useState(base.notes ?? '');
  const [recurrence, setRecurrence] = useState(base.recurrence ?? null);
  const [prot, setProt] = useState(!!base.protected);
  const close = () => useUi.setState({ eventEditor: null });

  const save = () => {
    if (!title.trim()) return;
    let start = instantOf(date, startTime);
    let end = instantOf(date, endTime);
    if (end <= start) end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
    if (allDay) {
      start = instantOf(date, 0);
      end = instantOf(addDays(endDate < date ? date : endDate, 1), 0);
    }
    const fields = { title: title.trim(), category, allDay, date: allDay ? date : null, endDate: allDay ? (endDate < date ? date : endDate) : null, start, end, location, notes, recurrence, protected: prot };
    if (existing) updateEntity('events', existing.id, fields);
    else createEvent(fields);
    close();
  };

  const remove = (onlyThis: boolean) => {
    if (!existing) return;
    if (onlyThis && occurrence) deleteEventOccurrence(existing.id, occurrence);
    else deleteEvent(existing.id);
    toast(t('calendar.deleteEvent'), { action: { label: t('common.undo'), run: () => undo() } });
    close();
  };

  return (
    <Modal
      title={existing ? existing.title : category === 'event' || category === 'meeting' ? t('calendar.newEvent') : t('calendar.newBlock')}
      onClose={close}
      footer={
        <>
          {existing && (
            <div className="row-flex gap-2" style={{ marginRight: 'auto' }}>
              {existing.recurrence && occurrence ? (
                <>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(true)}><Trash /> {t('calendar.deleteOccurrence')}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(false)}>{t('calendar.deleteSeries')}</button>
                </>
              ) : (
                <button className="btn btn-sm btn-danger" onClick={() => remove(false)}><Trash /> {t('common.delete')}</button>
              )}
            </div>
          )}
          <button className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>{t('common.save')}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('calendar.eventTitle')} className="full">
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <div className="full chips">
          {CATEGORIES.map((c) => (
            <button key={c} className={cx('chip', category === c && 'active')} onClick={() => setCategory(c)}>
              {CATEGORY_ICONS[c]} {t(`categories.${c}` as TKey)}
            </button>
          ))}
        </div>
        <div className="field-row full">
          <span className="small">{t('calendar.allDay')}</span>
          <Switch checked={allDay} onChange={setAllDay} label={t('calendar.allDay')} />
        </div>
        <Field label={t('calendar.starts')}>
          <div className="row-flex gap-2">
            <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            {!allDay && <input type="time" className="input" value={startTime} onChange={(e) => e.target.value && setStartTime(e.target.value)} />}
          </div>
        </Field>
        <Field label={t('calendar.ends')}>
          <div className="row-flex gap-2">
            {allDay ? <input type="date" className="input" value={endDate} onChange={(e) => e.target.value && setEndDate(e.target.value)} /> : <input type="time" className="input" value={endTime} onChange={(e) => e.target.value && setEndTime(e.target.value)} />}
          </div>
        </Field>
        <Field label={t('calendar.repeat')} className="full">
          <RecurrencePicker value={recurrence} anchor={date} onChange={setRecurrence} />
        </Field>
        <Field label={t('calendar.location')} className="full">
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={t('calendar.notes')} className="full">
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="field-row full">
          <div>
            <div className="small">{t('calendar.protected')}</div>
            <div className="faint xs">{t('calendar.protectedHint')}</div>
          </div>
          <Switch checked={prot} onChange={setProt} label={t('calendar.protected')} />
        </div>
      </div>
    </Modal>
  );
}

// ── Proyecto ───────────────────────────────────────────────────────────────────────────

function ProjectEditor({ id, prefill }: { id: string | null; prefill?: Partial<Project> }) {
  const existing = useEntity('projects', id);
  const areas = useList('areas');
  const goals = useList('goals');
  const [p, setP] = useState<Partial<Project>>(() => existing ?? { ...projectFields(), ...prefill });
  const set = (x: Partial<Project>) => setP((s) => ({ ...s, ...x }));
  const close = () => useUi.setState({ projectEditor: null });
  const save = () => {
    if (!p.name?.trim()) return;
    if (existing) updateEntity('projects', existing.id, { ...p, name: p.name.trim() });
    else {
      const created = createEntity('projects', projectFields({ ...p, name: p.name.trim() }));
      navigate('projects', { id: created.id });
    }
    close();
  };
  return (
    <Modal
      title={existing ? existing.name : t('projects.newProject')}
      onClose={close}
      wide
      footer={
        <>
          {existing && (
            <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => askConfirm({
              title: t('common.delete'),
              body: t('projects.deleteConfirm', { name: existing.name }),
              confirmLabel: t('common.delete'),
              danger: true,
              run: () => {
                updateEntity('projects', existing.id, { deletedAt: new Date().toISOString() });
                for (const tk of Object.values(useData.getState().c.tasks)) if (tk.projectId === existing.id) updateEntity('tasks', tk.id, { projectId: null });
                close();
                navigate('projects');
              },
            })}>
              <Trash /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={!p.name?.trim()}>{t('common.save')}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('projects.name')} className="full">
          <input className="input" autoFocus value={p.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder={t('projects.namePlaceholder')} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label={t('projects.description')} className="full">
          <textarea className="textarea" rows={2} value={p.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label={t('projects.area')}>
          <select className="select" value={p.areaId ?? ''} onChange={(e) => set({ areaId: e.target.value || null })}>
            <option value="">—</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
        </Field>
        <Field label={t('projects.goal')}>
          <select className="select" value={p.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value || null })}>
            <option value="">—</option>
            {goals.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.icon} {g.title}</option>)}
          </select>
        </Field>
        <Field label={t('projects.deadline')}>
          <input type="date" className="input" value={p.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />
        </Field>
        <Field label={t('task.status')}>
          <select className="select" value={p.status} onChange={(e) => set({ status: e.target.value as Project['status'], completedAt: e.target.value === 'done' ? new Date().toISOString() : null })}>
            {(['active', 'paused', 'done', 'archived'] as const).map((s) => <option key={s} value={s}>{t(`projects.status.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t('projects.color')} className="full">
          <ColorPicker value={p.color ?? 'ember'} onChange={(color) => set({ color })} />
        </Field>
        <Field label={t('projects.icon')} className="full">
          <EmojiPicker value={p.icon ?? '◆'} onChange={(icon) => set({ icon })} />
        </Field>
      </div>
    </Modal>
  );
}

function AreaEditor({ id }: { id: string | null }) {
  const existing = useEntity('areas', id);
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? '●');
  const [color, setColor] = useState(existing?.color ?? 'cyan');
  const close = () => useUi.setState({ areaEditor: null });
  const save = () => {
    if (!name.trim()) return;
    if (existing) updateEntity('areas', existing.id, { name: name.trim(), icon, color });
    else createEntity('areas', areaFields({ name: name.trim(), icon, color }));
    close();
  };
  return (
    <Modal
      title={existing ? existing.name : t('projects.newArea')}
      onClose={close}
      footer={
        <>
          {existing && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => { updateEntity('areas', existing.id, { archived: true }); close(); }}><Archive /> {t('common.archive')}</button>}
          <button className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>{t('common.save')}</button>
        </>
      }
    >
      <div className="stack gap-4">
        <Field label={t('projects.name')}>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label={t('projects.color')}><ColorPicker value={color} onChange={setColor} /></Field>
        <Field label={t('projects.icon')}><EmojiPicker value={icon} onChange={setIcon} /></Field>
      </div>
    </Modal>
  );
}

// ── Objetivo ───────────────────────────────────────────────────────────────────────────

function periodFor(h: GoalHorizon, ref: string): [string, string] {
  switch (h) {
    case 'year':
      return [startOfYear(ref), endOfYear(ref)];
    case 'quarter':
      return [startOfQuarter(ref), endOfQuarter(ref)];
    case 'month':
      return [startOfMonth(ref), endOfMonth(ref)];
    case 'week':
      return [startOfWeek(ref, getPrefs().weekStartsOn), endOfWeek(ref, getPrefs().weekStartsOn)];
  }
}

function GoalEditor({ id, prefill }: { id: string | null; prefill?: Partial<Goal> }) {
  const existing = useEntity('goals', id);
  const areas = useList('areas');
  const goals = useList('goals');
  const [g, setG] = useState<Partial<Goal>>(() => existing ?? { ...goalFields(), ...prefill });
  const set = (x: Partial<Goal>) => setG((s) => ({ ...s, ...x }));
  const close = () => useUi.setState({ goalEditor: null });
  const save = () => {
    if (!g.title?.trim()) return;
    if (existing) updateEntity('goals', existing.id, { ...g, title: g.title.trim() });
    else createEntity('goals', goalFields({ ...g, title: g.title.trim() }));
    close();
  };
  return (
    <Modal
      title={existing ? existing.title : t('goals.newGoal')}
      onClose={close}
      wide
      footer={
        <>
          {existing && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => { updateEntity('goals', existing.id, { deletedAt: new Date().toISOString() }); toast(t('common.delete'), { action: { label: t('common.undo'), run: () => undo() } }); close(); navigate('goals'); }}><Trash /> {t('common.delete')}</button>}
          <button className="btn btn-ghost" onClick={close}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={!g.title?.trim()}>{t('common.save')}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('goals.titleLabel')} className="full">
          <input className="input" autoFocus value={g.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={t('goals.titlePlaceholder')} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label={t('goals.why')} className="full">
          <textarea className="textarea" rows={2} value={g.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label={t('goals.horizon')} className="full">
          <Segmented
            value={g.horizon ?? 'year'}
            options={(['year', 'quarter', 'month', 'week'] as GoalHorizon[]).map((h) => ({ value: h, label: t(`goals.horizons.${h}` as TKey) }))}
            onChange={(h) => {
              const [periodStart, periodEnd] = periodFor(h, todayFn());
              set({ horizon: h, periodStart, periodEnd });
            }}
          />
        </Field>
        <Field label={t('goals.period')}>
          <div className="row-flex gap-2">
            <input type="date" className="input" value={g.periodStart} onChange={(e) => e.target.value && set({ periodStart: e.target.value })} />
            <input type="date" className="input" value={g.periodEnd} onChange={(e) => e.target.value && set({ periodEnd: e.target.value })} />
          </div>
        </Field>
        <Field label={t('goals.measure')}>
          <select className="select" value={g.progressMode} onChange={(e) => set({ progressMode: e.target.value as Goal['progressMode'] })}>
            {(['tasks', 'milestones', 'numeric', 'manual'] as const).map((m) => <option key={m} value={m}>{t(`goals.measures.${m}`)}</option>)}
          </select>
        </Field>
        {g.progressMode === 'numeric' && (
          <>
            <Field label={t('goals.target')}><input type="number" className="input" value={g.target ?? ''} onChange={(e) => set({ target: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label={t('goals.unit')}><input className="input" value={g.unit ?? ''} onChange={(e) => set({ unit: e.target.value })} placeholder="€, km, páginas…" /></Field>
          </>
        )}
        {g.progressMode === 'manual' && (
          <Field label={`${t('goals.progress')} · ${g.manualProgress ?? 0}%`} className="full">
            <input type="range" min={0} max={100} value={g.manualProgress ?? 0} onChange={(e) => set({ manualProgress: Number(e.target.value) })} />
          </Field>
        )}
        <Field label={t('task.area')}>
          <select className="select" value={g.areaId ?? ''} onChange={(e) => set({ areaId: e.target.value || null })}>
            <option value="">—</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          </select>
        </Field>
        <Field label={t('goals.horizons.year')}>
          <select className="select" value={g.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value || null })}>
            <option value="">—</option>
            {goals.filter((x) => x.id !== id && x.horizon !== 'week').map((x) => <option key={x.id} value={x.id}>{x.icon} {x.title}</option>)}
          </select>
        </Field>
        <Field label={t('projects.color')} className="full"><ColorPicker value={g.color ?? 'ember'} onChange={(color) => set({ color })} /></Field>
        <Field label={t('projects.icon')} className="full"><EmojiPicker value={g.icon ?? '🎯'} onChange={(icon) => set({ icon })} /></Field>
      </div>
    </Modal>
  );
}

// ── Planificar el día ──────────────────────────────────────────────────────────────────

const STRATEGIES: PlanStrategy[] = ['balanced', 'deep_first', 'quick_wins'];

function PlanDayModal({ date }: { date: string }) {
  const [strategy, setStrategy] = useState<PlanStrategy>('balanced');
  const c = useData((s) => s.c);
  const plan = useMemo(() => proposeDay(date, strategy), [date, strategy, c.tasks, c.events]);
  const fixed = useMemo(() => {
    const items = buildTimeline({ events: Object.values(c.events), tasks: Object.values(c.tasks).filter((x) => x.status !== 'done'), habits: Object.values(c.habits).filter((h) => !h.archived && !h.deletedAt), habitDone: () => false, habitScheduled: isScheduled }, date, date);
    return items.filter((i) => !i.allDay).map((i) => ({ key: i.key, title: i.title, start: i.start.getTime(), end: i.end.getTime(), fixed: true }));
  }, [c.events, c.tasks, c.habits, date]);
  const merged = [...fixed, ...plan.blocks.map((b) => ({ key: b.taskId, title: b.title, start: b.start, end: b.end, fixed: false }))].sort((a, b) => a.start - b.start);
  const close = () => openPlanDay(null);
  const isTomorrow = date > todayFn();
  return (
    <Modal
      title={isTomorrow ? `${t('plan.tomorrowTitle')} · ${formatDate(date, 'long')}` : t('plan.title')}
      onClose={close}
      wide
      footer={
        <>
          <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => setStrategy(STRATEGIES[(STRATEGIES.indexOf(strategy) + 1) % STRATEGIES.length])}>
            <Sparkles /> {t('plan.regenerate')}
          </button>
          <button className="btn" onClick={() => { close(); navigate('calendar'); }}>{t('plan.edit')}</button>
          <button className="btn btn-primary" disabled={plan.blocks.length === 0} onClick={() => { applyPlan(plan.blocks); toast(t('plan.accepted'), { action: { label: t('common.undo'), run: () => undo() } }); close(); }}>
            <Check /> {t('plan.accept')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('plan.subtitle')}</p>
      <div style={{ marginTop: 14 }}>
        <Segmented value={strategy} options={STRATEGIES.map((s) => ({ value: s, label: t(`plan.strategies.${s}` as TKey) }))} onChange={setStrategy} />
      </div>
      {plan.blocks.length === 0 ? (
        <div className="empty compact">
          <h3>{t('plan.empty')}</h3>
          <p>{t('plan.emptyHint')}</p>
        </div>
      ) : (
        <div className="plan-list">
          {merged.map((b) => (
            <div key={b.key} className={cx('plan-item', b.fixed && 'fixed')}>
              <span className="num">{formatRange(new Date(b.start), new Date(b.end))}</span>
              <span className="bar-c" />
              <span className="grow ellipsis" style={{ fontWeight: b.fixed ? 500 : 650 }}>{b.title}</span>
            </div>
          ))}
        </div>
      )}
      {plan.blocks.length > 0 && <p className="faint xs" style={{ marginTop: 10 }}>{t('plan.freeLeft', { duration: formatDuration(plan.freeMinutesLeft) })}</p>}
      {plan.unplaced.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="eyebrow">{t('plan.unplaced')} · {plan.unplaced.length}</div>
          <p className="faint xs" style={{ marginTop: 2 }}>{t('plan.unplacedHint')}</p>
          <div className="plan-list">
            {plan.unplaced.map((u) => (
              <div key={u.id} className="plan-item">
                <span className="grow ellipsis">{u.title}</span>
                <span className="faint xs">{formatDuration(u.durationMin ?? 30)}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => rescheduleTask(u.id, addDays(date, 1))}>
                  {t('plan.moveTomorrow')} <ArrowRight />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
