/**
 * Reproductor de rutina (paso a paso, con temporizador y gestos) y editor de rutinas
 * (reordenar pasos arrastrando).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, Reorder, useDragControls, useMotionValue, useTransform } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Flame, GripVertical, Pause, Play, Plus, Sparkles, Trash, X } from 'lucide-react';
import type { Routine, RoutineStep } from '@core/types';
import { nextStepIndex, routineMinutes, runProgress } from '@core/routines';
import { formatClock } from '@core/focus';
import { useEntity, useList } from '@/data/store';
import { useToday } from '@/data/selectors';
import { createRoutine, deleteRoutine, getRoutineRun, newRoutineStep, updateRoutine } from '@/data/actions';
import { formatDuration, t, tp, type TKey } from '@/i18n';
import { ColorPicker, cx, EmojiPicker, Field, Modal, Segmented } from '@/ui/components/primitives';
import { LiquidOrb } from '@/ui/components/LiquidOrb';
import { colorValue } from '@/ui/theme/palette';
import { askConfirm, useUi } from '@/app/ui';
import { SPRING } from '@/ui/motion/springs';
import { playUiSound } from '@/platform/sound';
import { toggleStepWithFeedback } from './RoutinesScreen';
import './routines.css';

// ── Reproductor ────────────────────────────────────────────────────────────────────────

export function RoutineRunner({ id }: { id: string }) {
  const routine = useEntity('routines', id);
  const today = useToday();
  useList('routineRuns'); // re-render al marcar pasos
  const run = getRoutineRun(id, today);
  const close = () => useUi.setState({ routineRunner: null });
  const [index, setIndex] = useState(() => (routine ? (nextStepIndex(routine, run) ?? 0) : 0));
  const [dir, setDir] = useState(1);
  const [finished, setFinished] = useState(() => !!routine && runProgress(routine, run).complete);

  if (!routine || routine.deletedAt) return null;
  const steps = routine.steps;
  const done = new Set(run?.doneStepIds ?? []);
  const progress = runProgress(routine, run);
  const color = colorValue(routine.color);
  const step = steps[Math.min(index, steps.length - 1)];

  const go = (next: number) => {
    setDir(next >= index ? 1 : -1);
    if (next >= steps.length) {
      setFinished(true);
      return;
    }
    setIndex(Math.max(0, next));
  };
  const complete = () => {
    if (!step) return;
    if (!done.has(step.id)) toggleStepWithFeedback(routine, today, step.id, true);
    const after = new Set([...done, step.id]);
    const nextIdx = steps.findIndex((s, i) => i > index && !after.has(s.id));
    if (nextIdx === -1) {
      const firstPending = steps.findIndex((s) => !after.has(s.id));
      if (firstPending === -1) setFinished(true);
      else go(steps.length);
    } else go(nextIdx);
  };
  const skip = () => go(index + 1);

  return createPortal(
    <motion.div className="runner" style={{ '--rc': color } as CSSProperties} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} role="dialog" aria-modal="true" aria-label={routine.name}>
      <RunnerKeys onDone={complete} onSkip={skip} onBack={() => go(index - 1)} onClose={close} disabled={finished} />
      <header className="runner-head">
        <span className="runner-icon">{routine.icon}</span>
        <div className="grow">
          <div className="eyebrow">{t('routines.running')}</div>
          <div className="runner-title">{routine.name}</div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={close} aria-label={t('a11y.close')}>
          <X />
        </button>
      </header>
      <div className="runner-segments" aria-hidden>
        {steps.map((s, i) => (
          <i key={s.id} className={cx(done.has(s.id) && 'on', !finished && i === index && 'current')} />
        ))}
      </div>
      <div className="runner-stage">
        <AnimatePresence mode="wait" custom={dir}>
          {finished ? (
            <motion.div key="done" className="runner-done" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING.liquid}>
              <LiquidOrb level={progress.ratio} size={200} color={color}>
                <Sparkles size={34} />
              </LiquidOrb>
              <h2 className="runner-step-title">{progress.complete ? t('routines.doneTitle') : t('routines.partialTitle', { n: progress.total - progress.done })}</h2>
              <p className="muted">{progress.complete ? t('routines.doneBody', { duration: formatDuration(routineMinutes(routine)) }) : t('routines.partialBody')}</p>
              <div className="row-flex gap-2" style={{ marginTop: 22 }}>
                {!progress.complete && (
                  <button
                    className="btn btn-lg"
                    onClick={() => {
                      setFinished(false);
                      setIndex(nextStepIndex(routine, run) ?? 0);
                    }}
                  >
                    <ArrowLeft /> {t('routines.backToSkipped')}
                  </button>
                )}
                <button className="btn btn-primary btn-lg magnetic" onClick={close} autoFocus>
                  <Check /> {t('common.close')}
                </button>
              </div>
            </motion.div>
          ) : step ? (
            <StepCard key={step.id} step={step} index={index} total={steps.length} done={done.has(step.id)} color={color} dir={dir} onDone={complete} onSkip={skip} />
          ) : null}
        </AnimatePresence>
      </div>
      {!finished && step && (
        <footer className="runner-foot">
          <button className="btn btn-lg btn-ghost" onClick={() => go(index - 1)} disabled={index === 0}>
            <ArrowLeft /> {t('common.back')}
          </button>
          <button className="btn btn-lg" onClick={skip}>
            {t('common.skip')} <ArrowRight />
          </button>
          <button className="btn btn-xl btn-primary magnetic" onClick={complete} data-pull="14">
            <Check /> {done.has(step.id) ? t('common.next') : t('common.done')}
          </button>
        </footer>
      )}
      {!finished && <p className="runner-hint faint xs">{t('routines.runnerHint')}</p>}
    </motion.div>,
    document.body,
  );
}

function RunnerKeys(props: { onDone: () => void; onSkip: () => void; onBack: () => void; onClose: () => void; disabled: boolean }) {
  const ref = useRef(props);
  ref.current = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal')) return;
      const p = ref.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        p.onClose();
      } else if (p.disabled) return;
      else if (e.key === 'Enter') {
        e.preventDefault();
        p.onDone();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        p.onSkip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        p.onBack();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return null;
}

/** Tarjeta del paso: se arrastra a la derecha para completarlo y a la izquierda para saltarlo. */
function StepCard(props: { step: RoutineStep; index: number; total: number; done: boolean; color: string; dir: number; onDone: () => void; onSkip: () => void }) {
  const { step } = props;
  const habit = useEntity('habits', step.habitId);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-9, 0, 9]);
  const doneHint = useTransform(x, [30, 140], [0, 1]);
  const skipHint = useTransform(x, [-140, -30], [1, 0]);
  const durationMs = (step.durationMin ?? 0) * 60_000;
  const [timer, setTimer] = useState<{ startedAt: number; pausedAt: number | null; offset: number }>(() => ({ startedAt: Date.now(), pausedAt: null, offset: 0 }));
  const [, setTick] = useState(0);
  const chimed = useRef(false);
  useEffect(() => {
    if (!durationMs) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [durationMs]);
  const elapsed = (timer.pausedAt ?? Date.now()) - timer.startedAt - timer.offset;
  const remaining = Math.max(0, durationMs - elapsed);
  useEffect(() => {
    if (durationMs && remaining === 0 && !chimed.current) {
      chimed.current = true;
      playUiSound('break');
    }
  }, [remaining, durationMs]);
  const togglePause = () =>
    setTimer((tm) => (tm.pausedAt ? { ...tm, pausedAt: null, offset: tm.offset + (Date.now() - tm.pausedAt) } : { ...tm, pausedAt: Date.now() }));

  useEffect(() => {
    if (!durationMs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target as HTMLElement)?.closest?.('button, input, textarea')) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [durationMs]);

  return (
    <motion.div
      className={cx('runner-card', props.done && 'done')}
      custom={props.dir}
      initial={{ opacity: 0, x: props.dir * 120, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: props.dir * -160, scale: 0.92, transition: { duration: 0.22 } }}
      transition={SPRING.liquid}
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120 || info.velocity.x > 700) props.onDone();
        else if (info.offset.x < -120 || info.velocity.x < -700) props.onSkip();
      }}
    >
      <motion.span className="swipe-hint done" style={{ opacity: doneHint }}>
        <Check /> {t('common.done')}
      </motion.span>
      <motion.span className="swipe-hint skip" style={{ opacity: skipHint }}>
        {t('common.skip')} <ArrowRight />
      </motion.span>
      <div className="eyebrow">{t('routines.stepOf', { n: props.index + 1, total: props.total })}</div>
      <h2 className="runner-step-title">{step.title}</h2>
      <div className="row-flex gap-2 wrap" style={{ justifyContent: 'center' }}>
        {habit && (
          <span className="tag accent">
            <Flame size={12} /> {t('routines.logsHabit', { name: habit.name })}
          </span>
        )}
        {props.done && (
          <span className="tag success">
            <Check size={12} /> {t('routines.alreadyDone')}
          </span>
        )}
      </div>
      {durationMs > 0 && (
        <div className="runner-timer">
          <LiquidOrb level={remaining / durationMs} ring={1 - remaining / durationMs} size={176} color={props.color} paused={!!timer.pausedAt} onClick={togglePause} label={timer.pausedAt ? t('common.resume') : t('common.pause')}>
            <div className="num runner-clock">{remaining === 0 ? '✓' : formatClock(remaining)}</div>
            <div className="faint xs row-flex gap-1">{timer.pausedAt ? <><Play size={11} /> {t('common.resume')}</> : <><Pause size={11} /> {t('common.pause')}</>}</div>
          </LiquidOrb>
        </div>
      )}
    </motion.div>
  );
}

// ── Editor ─────────────────────────────────────────────────────────────────────────────

const TIMES: Routine['timeOfDay'][] = ['morning', 'work', 'study', 'night', 'custom'];

export function RoutineEditor({ id, prefill }: { id: string | null; prefill?: Partial<Routine> }) {
  const existing = useEntity('routines', id);
  const habits = useList('habits');
  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const [r, setR] = useState<Partial<Routine>>(() => existing ?? { name: '', icon: '☀️', color: 'amber', timeOfDay: 'morning', steps: [], ...prefill });
  const [draft, setDraft] = useState('');
  const close = () => useUi.setState({ routineEditor: null });
  const set = (p: Partial<Routine>) => setR((x) => ({ ...x, ...p }));
  const steps = r.steps ?? [];
  const setStep = (sid: string, p: Partial<RoutineStep>) => set({ steps: steps.map((s) => (s.id === sid ? { ...s, ...p } : s)) });
  const addStep = () => {
    const title = draft.trim();
    if (!title) return;
    const m = title.match(/^(.*?)(?:\s+(\d{1,3})\s*(?:m|min|minutos?)?)?$/i);
    set({ steps: [...steps, newRoutineStep(m?.[1]?.trim() || title, m?.[2] ? Number(m[2]) : null)] });
    setDraft('');
  };
  const save = () => {
    if (!r.name?.trim()) return;
    const clean = { ...r, name: r.name.trim(), steps: steps.filter((s) => s.title.trim()) };
    if (existing) updateRoutine(existing.id, clean);
    else createRoutine(clean);
    close();
  };
  return (
    <Modal
      title={existing ? t('routines.editTitle') : t('routines.new')}
      onClose={close}
      wide
      footer={
        <>
          {existing && (
            <button
              className="btn btn-ghost btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() =>
                askConfirm({
                  title: t('routines.deleteTitle'),
                  body: t('routines.deleteBody', { name: existing.name }),
                  confirmLabel: t('common.delete'),
                  danger: true,
                  run: () => {
                    deleteRoutine(existing.id);
                    close();
                  },
                })
              }
            >
              <Trash /> {t('common.delete')}
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!r.name?.trim()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('routines.name')} className="full">
          <input className="input" value={r.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder={t('routines.namePlaceholder')} autoFocus />
        </Field>
        <Field label={t('routines.when')} className="full">
          <Segmented value={r.timeOfDay ?? 'morning'} onChange={(timeOfDay) => set({ timeOfDay })} options={TIMES.map((x) => ({ value: x, label: t(`routines.times.${x}` as TKey) }))} />
        </Field>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <span className="field-label">
          {t('routines.stepsLabel')} · {tp('routines.steps', steps.length)} · {formatDuration(routineMinutes({ steps }))}
        </span>
        <Reorder.Group axis="y" values={steps} onReorder={(next) => set({ steps: next })} className="step-list">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} habits={activeHabits} onChange={(p) => setStep(s.id, p)} onRemove={() => set({ steps: steps.filter((x) => x.id !== s.id) })} />
          ))}
        </Reorder.Group>
        <div className="add-row" style={{ marginTop: 8 }}>
          <Plus size={16} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('routines.addStep')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addStep();
              }
            }}
          />
          <button className="btn btn-sm" onClick={addStep} disabled={!draft.trim()}>
            {t('common.add')}
          </button>
        </div>
        <span className="field-hint">{t('routines.addStepHint')}</span>
      </div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <Field label={t('habits.color')}>
          <ColorPicker value={r.color ?? 'amber'} onChange={(color) => set({ color })} />
        </Field>
        <Field label={t('habits.icon')}>
          <EmojiPicker value={r.icon ?? '☀️'} onChange={(icon) => set({ icon })} />
        </Field>
      </div>
    </Modal>
  );
}

function StepRow(props: { step: RoutineStep; habits: { id: string; name: string; icon: string }[]; onChange: (p: Partial<RoutineStep>) => void; onRemove: () => void }) {
  const controls = useDragControls();
  const { step } = props;
  return (
    <Reorder.Item value={step} dragListener={false} dragControls={controls} className="step-row" whileDrag={{ scale: 1.03, boxShadow: '0 18px 40px -12px rgba(0,0,0,.6)' }} transition={SPRING.liquid}>
      <button className="step-grip" onPointerDown={(e) => controls.start(e)} aria-label={t('routines.dragToReorder')} type="button">
        <GripVertical size={16} />
      </button>
      <input className="input input-bare grow" value={step.title} onChange={(e) => props.onChange({ title: e.target.value })} aria-label={t('routines.stepTitle')} />
      <input
        className="input step-min num"
        type="number"
        min={0}
        max={240}
        value={step.durationMin ?? ''}
        placeholder="min"
        onChange={(e) => props.onChange({ durationMin: e.target.value === '' ? null : Math.max(0, Math.min(240, Number(e.target.value))) })}
        aria-label={t('routines.stepMinutes')}
      />
      <select className="select step-habit" value={step.habitId ?? ''} onChange={(e) => props.onChange({ habitId: e.target.value || null })} aria-label={t('routines.linkedHabit')}>
        <option value="">{t('routines.noHabit')}</option>
        {props.habits.map((h) => (
          <option key={h.id} value={h.id}>
            {h.icon} {h.name}
          </option>
        ))}
      </select>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={props.onRemove} aria-label={t('common.delete')} type="button">
        <Trash />
      </button>
    </Reorder.Item>
  );
}
