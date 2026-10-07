import { useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { motion } from 'motion/react';
import { Check, Clock, Ellipsis, ListChecks, Pencil, Play, Plus, RotateCcw, Trash, Flame } from 'lucide-react';
import type { Routine, RoutineRun } from '@core/types';
import { completedInLast, routineMinutes, runProgress } from '@core/routines';
import { useList } from '@/data/store';
import { useToday } from '@/data/selectors';
import { createRoutine, deleteRoutine, resetRoutineRun, setRoutineStep } from '@/data/actions';
import { formatDuration, t, tp, type TKey } from '@/i18n';
import { cx, Empty, IconTile, openContextMenu, Ring } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { askConfirm, openRoutineEditor, runRoutine, toast } from '@/app/ui';
import { SPRING } from '@/ui/motion/springs';
import { playUiSound } from '@/platform/sound';
import { ROUTINE_TEMPLATES, templateFields } from './templates';
import './routines.css';

export function useTodayRuns(): Map<string, RoutineRun> {
  const runs = useList('routineRuns');
  const today = useToday();
  return useMemo(() => new Map(runs.filter((r) => r.date === today).map((r) => [r.routineId, r])), [runs, today]);
}

export function useRoutines(): Routine[] {
  const routines = useList('routines');
  return useMemo(() => routines.filter((r) => !r.archived).sort((a, b) => a.order - b.order), [routines]);
}

/** Marca un paso con sonido y avisos (hábito registrado, rutina completada). */
export function toggleStepWithFeedback(routine: Routine, date: string, stepId: string, done: boolean) {
  const res = setRoutineStep(routine.id, date, stepId, done);
  if (done) playUiSound(res.completed ? 'focusDone' : 'habit');
  if (res.habitLogged) toast(t('routines.habitLogged', { name: res.habitLogged }));
  if (res.completed) toast(t('routines.completedToast', { name: routine.name }), { kind: 'success' });
}

export default function RoutinesScreen() {
  const routines = useRoutines();
  const runs = useTodayRuns();
  const allRuns = useList('routineRuns');
  const today = useToday();
  const usedTemplates = new Set(routines.map((r) => r.name));
  const templates = ROUTINE_TEMPLATES.filter((tpl) => !usedTemplates.has(t(`routines.tpl.${tpl.id}.name` as TKey)));

  return (
    <div className="page routines">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('routines.title')}</h1>
          <p className="page-subtitle">{t('routines.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={() => openRoutineEditor(null)} data-tour="new-routine">
            <Plus /> {t('routines.new')}
          </button>
        </div>
      </header>

      {routines.length === 0 ? (
        <div className="card">
          <Empty icon={<ListChecks />} title={t('routines.empty')} body={t('routines.emptyHint')} />
        </div>
      ) : (
        <motion.div className="routine-grid" layout>
          {routines.map((r, i) => (
            <motion.div key={r.id} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING.liquid, delay: i * 0.04 }}>
              <RoutineCard routine={r} run={runs.get(r.id)} week={completedInLast(allRuns, r.id, today, 7)} today={today} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {templates.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{t('routines.templates')}</h2>
            <span className="faint xs">{t('routines.templatesHint')}</span>
          </div>
          <div className="template-grid">
            {templates.map((tpl) => {
              const fields = templateFields(tpl);
              return (
                <button
                  key={tpl.id}
                  className="card card-pad-sm template-card tilt"
                  style={{ '--rc': colorValue(tpl.color) } as CSSProperties}
                  onClick={() => {
                    const r = createRoutine(fields);
                    toast(t('routines.createdFrom', { name: r.name }), { action: { label: t('common.edit'), run: () => openRoutineEditor(r.id) } });
                  }}
                >
                  <IconTile icon={tpl.icon} color={tpl.color} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="template-name">{fields.name}</div>
                    <div className="faint xs">
                      {tp('routines.steps', tpl.steps.length)} · {formatDuration(routineMinutes(fields as Routine))}
                    </div>
                  </div>
                  <Plus className="template-add" />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function RoutineCard({ routine, run, week, today }: { routine: Routine; run: RoutineRun | undefined; week: number; today: string }) {
  const p = runProgress(routine, run);
  const done = new Set(run?.doneStepIds ?? []);
  const color = colorValue(routine.color);
  const minutes = routineMinutes(routine);
  const menu = (e: ReactMouseEvent) =>
    openContextMenu(e, [
      { label: t('common.edit'), icon: <Pencil />, onSelect: () => openRoutineEditor(routine.id) },
      ...(p.done > 0 ? [{ label: t('routines.resetToday'), icon: <RotateCcw />, onSelect: () => resetRoutineRun(routine.id, today) }] : []),
      { separator: true },
      {
        label: t('common.delete'),
        icon: <Trash />,
        danger: true,
        onSelect: () =>
          askConfirm({ title: t('routines.deleteTitle'), body: t('routines.deleteBody', { name: routine.name }), confirmLabel: t('common.delete'), danger: true, run: () => deleteRoutine(routine.id) }),
      },
    ]);
  return (
    <article className={cx('card routine-card', p.complete && 'complete')} style={{ '--rc': color } as CSSProperties} onContextMenu={menu}>
      <header className="routine-head">
        <IconTile icon={routine.icon} color={routine.color} size="lg" />
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 className="routine-name ellipsis">{routine.name}</h3>
          <div className="routine-meta">
            <span>{t(`routines.times.${routine.timeOfDay}` as TKey)}</span>
            <span>· {tp('routines.steps', routine.steps.length)}</span>
            {minutes > 0 && (
              <span className="row-flex gap-1">
                · <Clock size={12} /> {formatDuration(minutes)}
              </span>
            )}
          </div>
        </div>
        <Ring value={p.ratio} size={46} stroke={4} color={color} label={`${p.done}/${p.total}`}>
          {p.complete ? <Check size={18} style={{ color }} /> : <span className="num xs">{p.done}/{p.total}</span>}
        </Ring>
      </header>
      <ol className="routine-steps">
        {routine.steps.map((s) => {
          const isDone = done.has(s.id);
          return (
            <li key={s.id}>
              <button className={cx('routine-step', isDone && 'done')} onClick={() => toggleStepWithFeedback(routine, today, s.id, !isDone)} aria-pressed={isDone}>
                <span className={cx('mini-check', isDone && 'on')} style={isDone ? { background: color, borderColor: color } : undefined}>
                  {isDone && <Check />}
                </span>
                <span className="grow ellipsis">{s.title}</span>
                {s.habitId && <Flame size={12} className="faint" aria-label={t('routines.linkedHabit')} />}
                {s.durationMin ? <span className="faint xs num">{s.durationMin}′</span> : null}
              </button>
            </li>
          );
        })}
        {routine.steps.length === 0 && <li className="faint small">{t('routines.noSteps')}</li>}
      </ol>
      <footer className="routine-foot">
        <span className="faint xs">{week > 0 ? t('routines.weekCount', { n: week }) : t('routines.weekNone')}</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-icon btn-sm" onClick={menu} aria-label={t('common.more')}>
          <Ellipsis />
        </button>
        <button className="btn btn-sm btn-primary magnetic" disabled={routine.steps.length === 0} onClick={() => {
            if (p.complete) resetRoutineRun(routine.id, today);
            runRoutine(routine.id);
          }}>
          <Play /> {p.complete ? t('routines.again') : p.done > 0 ? t('routines.continue') : t('routines.start')}
        </button>
      </footer>
    </article>
  );
}
