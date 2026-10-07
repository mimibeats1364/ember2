/**
 * Orbit: conversación con el asistente local de Ember.
 *
 * Cada respuesta es una tarjeta. Las que proponen cambios muestran cada cambio con su casilla
 * (puedes quitar los que no quieras) y se aplican juntos en una sola operación que ⌘Z deshace.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  CircleCheck,
  Eraser,
  Feather,
  Flame,
  FolderPlus,
  Lightbulb,
  ListChecks,
  MoveRight,
  NotebookPen,
  Play,
  Sparkles,
  Target,
  Undo2,
} from 'lucide-react';
import { localDateTime, today as todayFn } from '@core/dates';
import { parseInput } from '@core/nlp';
import type { ProposedChange } from '@core/orbit/types';
import type { WeekNote, WeekTip } from '@core/orbit/skills';
import { undo, useData, usePrefs } from '@/data/store';
import { applyProposal, extractFromNote, type OrbitAnswer } from '@/data/orbit';
import { formatDate, formatDuration, formatPercent, formatRange, relativeDay, t, tp, type TKey } from '@/i18n';
import { Bar, cx, Modal } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { SPRING } from '@/ui/motion/springs';
import { MOD } from '@/platform/env';
import { navigate, openPlanDay, openTask, toast } from '@/app/ui';
import { previewCommand } from '@/app/commandRunner';
import { performCapture, useProjectNames } from '@/app/QuickCapture';
import { startFocusOnTask } from '@/features/tasks/TaskRow';
import { clearOrbit, closeOrbit, pushExchange, sendToOrbit, setProposalState, toggleChange, useOrbit, type OrbitMessage } from './store';
import './orbit.css';

const EXAMPLES: TKey[] = ['orbit.examples.plan', 'orbit.examples.lighten', 'orbit.examples.whatNow', 'orbit.examples.dump', 'orbit.examples.breakdown', 'orbit.examples.week'];

export function OrbitPanel() {
  const open = useOrbit((s) => s.open);
  if (!open) return null;
  return <OrbitModal />;
}

function OrbitModal() {
  const prefs = usePrefs();
  const messages = useOrbit((s) => s.messages);
  const [text, setText] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const name = prefs.assistantName || 'Orbit';

  // El diálogo enfoca su primer botón; aquí lo importante es escribir.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 2 ? 'smooth' : 'auto' });
  }, [messages.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);

  const send = (value = text) => {
    if (!value.trim()) return;
    sendToOrbit(value);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <Modal
      className="orbit"
      label={name}
      onClose={closeOrbit}
      title={
        <span className="orbit-title">
          <span className="orbit-orb" aria-hidden />
          <span>{name}</span>
          <span className="orbit-badge">{t('orbit.badge')}</span>
        </span>
      }
    >
      <div className="orbit-thread" ref={threadRef} aria-live="polite">
        <div className="orbit-msg orbit-from">
          <div className="orbit-card">
            <p>{t('orbit.hello', { name: prefs.name ? `, ${prefs.name}` : '' })}</p>
            <p className="faint small">{t('orbit.privacy')}</p>
          </div>
        </div>
        {messages.map((m) => (
          <motion.div
            key={m.id}
            className={cx('orbit-msg', m.role === 'user' ? 'orbit-me' : 'orbit-from')}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={SPRING.smooth}
          >
            {m.role === 'user' ? <div className="orbit-bubble">{m.text}</div> : <AnswerCard msg={m} onAsk={send} />}
          </motion.div>
        ))}
      </div>
      {messages.length === 0 && (
        <div className="orbit-examples">
          {EXAMPLES.map((k) => (
            <button key={k} className="chip" onClick={() => send(t(k))}>
              {t(k)}
            </button>
          ))}
        </div>
      )}
      <form
        className="orbit-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          className="orbit-input"
          rows={1}
          autoFocus
          value={text}
          placeholder={t('orbit.placeholder', { name })}
          aria-label={t('orbit.placeholder', { name })}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-icon orbit-send" disabled={!text.trim()} aria-label={t('orbit.send')}>
          <ArrowUp />
        </button>
      </form>
      <div className="orbit-foot faint xs">
        <span>{t('orbit.footHint')}</span>
        <span className="row-flex gap-2">
          {messages.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearOrbit}>
              <Eraser />
              {t('orbit.clear')}
            </button>
          )}
          <span className="orbit-kbd">{MOD}J</span>
        </span>
      </div>
    </Modal>
  );
}

// ── Tarjetas de respuesta ──────────────────────────────────────────────────────────────

function AnswerCard({ msg, onAsk }: { msg: OrbitMessage; onAsk: (text: string) => void }) {
  const a = msg.answer!;
  switch (a.kind) {
    case 'help':
      return (
        <div className="orbit-card">
          <p>{t('orbit.help.intro')}</p>
          <ul className="orbit-skills">
            <li><CalendarClock /><span>{t('orbit.help.plan')}</span></li>
            <li><Feather /><span>{t('orbit.help.lighten')}</span></li>
            <li><FolderPlus /><span>{t('orbit.help.breakdown')}</span></li>
            <li><NotebookPen /><span>{t('orbit.help.notes')}</span></li>
            <li><ListChecks /><span>{t('orbit.help.dump')}</span></li>
            <li><Sparkles /><span>{t('orbit.help.week')}</span></li>
            <li><Target /><span>{t('orbit.help.status')}</span></li>
          </ul>
          <Examples onAsk={onAsk} />
        </div>
      );
    case 'plan':
      return <PlanCard msg={msg} answer={a} />;
    case 'lighten':
      return <LightenCard msg={msg} answer={a} />;
    case 'breakdown':
      return <BreakdownCard msg={msg} answer={a} />;
    case 'extract':
      return <ExtractCard msg={msg} answer={a} />;
    case 'noteNotFound':
      return (
        <div className="orbit-card">
          <p>{a.query ? t('orbit.notes.notFound', { query: a.query }) : t('orbit.notes.which')}</p>
          {a.notes.length > 0 && (
            <div className="orbit-chips">
              {a.notes.map((n) => (
                <button key={n.id} className="chip" onClick={() => { const ans = extractFromNote(n.id); if (ans) pushExchange(n.title || t('common.untitled'), ans); }}>
                  <NotebookPen size={13} /> {n.title || t('common.untitled')}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case 'week':
      return <WeekCard answer={a} />;
    case 'projectStatus':
    case 'goalStatus':
    case 'habitStatus':
      return <StatusCard answer={a} />;
    case 'notFound':
      return (
        <div className="orbit-card">
          <p>{t('orbit.status.notFound', { query: a.query })}</p>
        </div>
      );
    case 'whatNow':
      return <WhatNowCard answer={a} />;
    case 'command':
      return <CommandCard answer={a} />;
    default:
      return <UnknownCard text={a.kind === 'unknown' ? a.text : ''} onAsk={onAsk} />;
  }
}

function Examples({ onAsk }: { onAsk: (text: string) => void }) {
  return (
    <div className="orbit-chips">
      {EXAMPLES.map((k) => (
        <button key={k} className="chip" onClick={() => onAsk(t(k))}>
          {t(k)}
        </button>
      ))}
    </div>
  );
}

/** Lista de cambios con casillas + botones Aplicar / Descartar. */
function Proposal(props: { msg: OrbitMessage; changes: ProposedChange[]; render: (c: ProposedChange, i: number) => ReactNode; applyLabel?: string; after?: (projectId: string | null) => void }) {
  const { msg, changes } = props;
  const active = changes.filter((_, i) => !msg.excluded.includes(i));
  const done = msg.state !== 'open';
  // Crear un proyecto es requisito de sus tareas: si lo desmarcas, las tareas van sin proyecto.
  const apply = () => {
    const keepProject = active.some((c) => c.kind === 'create_project');
    const list = active.map((c) => (c.kind === 'create_task' && c.projectRef && !keepProject ? { ...c, projectRef: undefined } : c));
    const res = applyProposal(list);
    setProposalState(msg.id, 'applied');
    toast(tp('orbit.appliedToast', res.applied), { kind: 'success', action: { label: t('common.undo'), run: () => { undo(); setProposalState(msg.id, 'open'); } } });
    props.after?.(res.projectId);
  };
  return (
    <>
      <ul className={cx('orbit-changes', done && 'done')}>
        {changes.map((c, i) => {
          const off = msg.excluded.includes(i);
          return (
            <li key={i} className={cx(off && 'off')}>
              <button className={cx('orbit-tick', !off && 'on')} role="checkbox" aria-checked={!off} disabled={done} onClick={() => toggleChange(msg.id, i)}>
                {!off && <Check />}
              </button>
              <div className="grow">{props.render(c, i)}</div>
            </li>
          );
        })}
      </ul>
      {msg.state === 'open' ? (
        <div className="orbit-actions">
          <button className="btn btn-primary btn-sm" disabled={active.length === 0} onClick={apply}>
            <Check />
            {props.applyLabel ?? tp('orbit.apply', active.length)}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setProposalState(msg.id, 'dismissed')}>
            {t('orbit.dismiss')}
          </button>
        </div>
      ) : (
        <div className="orbit-status faint xs">
          {msg.state === 'applied' ? (
            <>
              <CircleCheck size={13} /> {t('orbit.applied')}
              <button className="btn btn-ghost btn-sm" onClick={() => { undo(); setProposalState(msg.id, 'open'); }}>
                <Undo2 />
                {t('common.undo')}
              </button>
            </>
          ) : (
            t('orbit.dismissed')
          )}
        </div>
      )}
    </>
  );
}

const timeRange = (date: string, time: string, minutes: number) => {
  const start = localDateTime(date, time);
  return formatRange(start, new Date(start.getTime() + minutes * 60_000));
};

function ChangeMeta({ c }: { c: ProposedChange }) {
  const today = todayFn();
  const projects = useData((s) => s.c.projects);
  if (c.kind !== 'create_task') return null;
  const bits: string[] = [];
  if (c.date) bits.push(c.time ? `${relativeDay(c.date, today)} · ${c.time}` : relativeDay(c.date, today));
  if (c.deadline) bits.push(t('orbit.dueBy', { date: relativeDay(c.deadline, today) }));
  if (c.durationMin) bits.push(formatDuration(c.durationMin));
  if (c.priority && c.priority < 4) bits.push(`P${c.priority}`);
  if (c.recurrence) bits.push(t('orbit.repeats'));
  const project = c.projectId ? projects[c.projectId] : undefined;
  if (project) bits.push(project.name);
  if (c.tags?.length) bits.push(c.tags.map((x) => `#${x}`).join(' '));
  if (bits.length === 0) bits.push(t('orbit.toInbox'));
  return <span className="faint xs">{bits.join(' · ')}</span>;
}

function PlanCard({ msg, answer }: { msg: OrbitMessage; answer: Extract<OrbitAnswer, { kind: 'plan' }> }) {
  const p = answer.proposal;
  const c = answer.intent.constraints;
  const today = todayFn();
  const chips: string[] = [];
  if (c.start) chips.push(t('orbit.plan.from', { time: c.start }));
  if (c.end) chips.push(t('orbit.plan.until', { time: c.end }));
  if (p.budgetMin) chips.push(t('orbit.plan.budget', { duration: formatDuration(p.budgetMin) }));
  if (c.strategy) chips.push(t(`plan.strategies.${c.strategy}` as TKey));
  if (c.breakMin) chips.push(t('orbit.plan.breaks', { min: c.breakMin }));
  if (c.light) chips.push(t('orbit.plan.light'));
  for (const f of p.matchedFocus) chips.push(t('orbit.plan.focus', { what: f }));
  const day = relativeDay(answer.intent.date, today);
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <CalendarClock />
        <b>{t('orbit.plan.title', { day: day.toLowerCase() })}</b>
      </div>
      {chips.length > 0 && (
        <div className="orbit-chips tight">
          {chips.map((x) => <span key={x} className="tag">{x}</span>)}
        </div>
      )}
      {p.changes.length === 0 ? (
        <p className="muted small">{p.unplaced.length > 0 ? t('orbit.plan.nothingFits', { free: formatDuration(p.freeMinutes) }) : t('orbit.plan.empty')}</p>
      ) : (
        <Proposal
          msg={msg}
          changes={p.changes}
          render={(ch) =>
            ch.kind === 'schedule_task' ? (
              <span className="orbit-line">
                <span className="num faint">{timeRange(ch.date, ch.time, ch.durationMin)}</span>
                <span className="ellipsis">{ch.title}</span>
              </span>
            ) : null
          }
        />
      )}
      {p.changes.length > 0 && <p className="faint xs">{t('orbit.plan.freeLeft', { duration: formatDuration(p.freeMinutesLeft) })}</p>}
      {p.unplaced.length > 0 && (
        <p className="faint xs">
          {tp('orbit.plan.unplaced', p.unplaced.length)}: {p.unplaced.slice(0, 4).map((x) => x.title).join(', ')}
          {p.unplaced.length > 4 ? '…' : ''}
        </p>
      )}
      {p.missedFocus.length > 0 && <p className="faint xs">{t('orbit.plan.missedFocus', { what: p.missedFocus.join(', ') })}</p>}
      <div className="orbit-links">
        <button className="btn btn-ghost btn-sm" onClick={() => { closeOrbit(); openPlanDay(answer.intent.date); }}>
          {t('orbit.plan.openPlanner')} <ArrowRight />
        </button>
      </div>
    </div>
  );
}

function LightenCard({ msg, answer }: { msg: OrbitMessage; answer: Extract<OrbitAnswer, { kind: 'lighten' }> }) {
  const p = answer.proposal;
  const today = todayFn();
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <Feather />
        <b>{p.fits ? t('orbit.lighten.fitsTitle') : t('orbit.lighten.title')}</b>
      </div>
      <p className="muted small">{t('orbit.lighten.load', { load: formatDuration(p.loadMin), free: formatDuration(p.capacityMin) })}</p>
      <div className="orbit-meter">
        <Bar value={Math.min(1, p.capacityMin ? p.loadMin / Math.max(1, p.capacityMin) : 1)} color={p.fits ? 'var(--success)' : 'var(--warning)'} label={t('orbit.lighten.meter')} />
      </div>
      {!p.fits && p.changes.length === 0 && <p className="muted small">{t('orbit.lighten.nothingMovable')}</p>}
      {p.changes.length > 0 && (
        <>
          <p className="small">{t('orbit.lighten.proposal')}</p>
          <Proposal
            msg={msg}
            changes={p.changes}
            render={(ch) =>
              ch.kind === 'reschedule_task' ? (
                <span className="orbit-line">
                  <span className="ellipsis">{ch.title}</span>
                  <span className="faint xs nowrap">
                    <MoveRight size={12} /> {ch.date ? relativeDay(ch.date, today) : t('tasks.views.someday')}
                    {ch.durationMin ? ` · ${formatDuration(ch.durationMin)}` : ''}
                  </span>
                </span>
              ) : null
            }
          />
        </>
      )}
      {p.stillOverMin > 0 && <p className="faint xs">{t('orbit.lighten.stillOver', { duration: formatDuration(p.stillOverMin) })}</p>}
    </div>
  );
}

function BreakdownCard({ msg, answer }: { msg: OrbitMessage; answer: Extract<OrbitAnswer, { kind: 'breakdown' }> }) {
  const p = answer.proposal;
  const today = todayFn();
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <FolderPlus />
        <b>{p.projectId ? t('orbit.breakdown.existing', { name: p.name }) : t('orbit.breakdown.new', { name: p.name })}</b>
      </div>
      <p className="muted small">{p.deadline ? t('orbit.breakdown.withDeadline', { date: formatDate(p.deadline, 'long') }) : t('orbit.breakdown.noDeadline')}</p>
      <Proposal
        msg={msg}
        changes={p.changes}
        render={(c) =>
          c.kind === 'create_project' ? (
            <span className="orbit-line">
              <b className="ellipsis">{t('orbit.breakdown.createProject', { name: c.name })}</b>
            </span>
          ) : c.kind === 'create_task' ? (
            <span className="orbit-line">
              <span className="ellipsis">{c.title}</span>
              <span className="faint xs nowrap">{c.date === today ? t('common.today') : c.deadline ? t('orbit.dueBy', { date: relativeDay(c.deadline, today) }) : ''}</span>
            </span>
          ) : null
        }
        after={(projectId) => projectId && toast(t('orbit.breakdown.done'), { action: { label: t('common.open'), run: () => { closeOrbit(); navigate('projects', { id: projectId }); } } })}
      />
      {p.skipped.length > 0 && <p className="faint xs">{t('orbit.breakdown.skipped', { list: p.skipped.join(', ') })}</p>}
    </div>
  );
}

function ExtractCard({ msg, answer }: { msg: OrbitMessage; answer: Extract<OrbitAnswer, { kind: 'extract' }> }) {
  if (answer.changes.length === 0) {
    return (
      <div className="orbit-card">
        <p>{answer.note ? t('orbit.notes.noActions', { title: answer.note.title || t('common.untitled') }) : t('orbit.dump.none')}</p>
      </div>
    );
  }
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <ListChecks />
        <b>{answer.note ? t('orbit.notes.title', { title: answer.note.title || t('common.untitled') }) : tp('orbit.dump.title', answer.changes.length)}</b>
      </div>
      <Proposal
        msg={msg}
        changes={answer.changes}
        render={(c) =>
          c.kind === 'create_task' ? (
            <span className="orbit-line col">
              <span>{c.title}</span>
              <ChangeMeta c={c} />
            </span>
          ) : c.kind === 'create_habit' ? (
            <span className="orbit-line col">
              <span>
                <Flame size={13} className="accent" /> {c.name}
              </span>
              <span className="faint xs">{t('orbit.dump.habit')}</span>
            </span>
          ) : null
        }
      />
    </div>
  );
}

function weekNoteText(n: WeekNote, projects: Record<string, { name: string }>): string {
  switch (n.kind) {
    case 'quiet':
      return t('orbit.week.quiet');
    case 'tasks':
      return n.prev > 0 && n.count !== n.prev
        ? t(n.count > n.prev ? 'orbit.week.tasksUp' : 'orbit.week.tasksDown', { count: n.count, prev: n.prev })
        : tp('orbit.week.tasks', n.count);
    case 'focus':
      return t('orbit.week.focus', { duration: formatDuration(n.minutes), sessions: n.sessions }) + (n.prevMinutes > 0 ? ` ${t('orbit.week.focusPrev', { duration: formatDuration(n.prevMinutes) })}` : '');
    case 'bestDay':
      return t('orbit.week.bestDay', { day: formatDate(n.date, 'weekday').toLowerCase(), duration: formatDuration(n.minutes) });
    case 'topProject':
      return t('orbit.week.topProject', { project: n.projectId ? (projects[n.projectId]?.name ?? '—') : t('insights.noProject'), duration: formatDuration(n.minutes) });
    case 'habits':
      return t('orbit.week.habits', { done: n.done, scheduled: n.scheduled, rate: formatPercent(n.scheduled ? n.done / n.scheduled : 0) });
  }
}

function weekTipText(tip: WeekTip): string {
  switch (tip.kind) {
    case 'protectPeak':
      return t('orbit.week.tips.protectPeak', { from: `${String(tip.start).padStart(2, '0')}:00`, to: `${String(tip.end).padStart(2, '0')}:00` });
    case 'overdue':
      return t('orbit.week.tips.overdue', { count: tip.count });
    case 'habitsLow':
      return t('orbit.week.tips.habitsLow');
    case 'inflow':
      return t('orbit.week.tips.inflow', { created: tip.created, completed: tip.completed });
    case 'interruptions':
      return t('orbit.week.tips.interruptions', { count: tip.count, sessions: tip.sessions });
    case 'celebrate':
      return t('orbit.week.tips.celebrate');
    case 'restart':
      return t('orbit.week.tips.restart');
  }
}

function WeekCard({ answer }: { answer: Extract<OrbitAnswer, { kind: 'week' }> }) {
  const projects = useData((s) => s.c.projects);
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <Sparkles />
        <b>{t('orbit.week.title', { from: formatDate(answer.from, 'dayMonth'), to: formatDate(answer.to, 'dayMonth') })}</b>
        <span className={cx('tag', `trend-${answer.trend}`)}>{t(`orbit.week.trend.${answer.trend}` as TKey)}</span>
      </div>
      <p className="orbit-prose">{answer.notes.map((n) => weekNoteText(n, projects)).join(' ')}</p>
      {answer.tips.length > 0 && (
        <ul className="orbit-tips">
          {answer.tips.map((tip) => (
            <li key={tip.kind}>
              <Lightbulb />
              <span>{weekTipText(tip)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="orbit-links">
        <button className="btn btn-ghost btn-sm" onClick={() => { closeOrbit(); navigate('review', { tab: 'weekly' }); }}>
          {t('orbit.week.openReview')} <ArrowRight />
        </button>
      </div>
    </div>
  );
}

function StatusCard({ answer }: { answer: Extract<OrbitAnswer, { kind: 'projectStatus' | 'goalStatus' | 'habitStatus' }> }) {
  const today = todayFn();
  if (answer.kind === 'habitStatus') {
    const s = answer.streak;
    return (
      <div className="orbit-card">
        <div className="orbit-card-head">
          <Flame style={{ color: colorValue(answer.habit.color) }} />
          <b>{answer.habit.name}</b>
        </div>
        <p className="small">{s.unit === 'weeks' ? t('orbit.status.habitWeeks', { current: s.current, best: s.best }) : t('orbit.status.habitDays', { current: s.current, best: s.best })}</p>
        {s.todayPending && <p className="faint xs">{t('orbit.status.habitToday')}</p>}
      </div>
    );
  }
  const isProject = answer.kind === 'projectStatus';
  const ratio = isProject ? answer.health.progress : answer.progress.ratio;
  const color = colorValue(isProject ? answer.project.color : answer.goal.color);
  const name = isProject ? answer.project.name : answer.goal.title;
  let line: string;
  if (isProject) {
    const h = answer.health;
    line = t(`orbit.status.project.${h.status}` as TKey, { done: h.done, total: h.total, remaining: h.remaining, days: h.daysLeft ?? 0, pace: h.pacePerWeek, needed: h.neededPerWeek ?? 0 });
  } else {
    const g = answer.progress;
    line = t(`orbit.status.goal.${g.pace}` as TKey, { progress: formatPercent(g.ratio), elapsed: formatPercent(g.timeElapsed) });
  }
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <Target style={{ color }} />
        <b className="ellipsis">{name}</b>
        <span className="num faint small">{formatPercent(ratio)}</span>
      </div>
      <Bar value={ratio} color={color} label={name} />
      <p className="small" style={{ marginTop: 10 }}>{line}</p>
      {answer.next.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 12 }}>{t('orbit.status.next')}</div>
          <ul className="orbit-next">
            {answer.next.map((x) => (
              <li key={x.id}>
                <button className="orbit-linkish" onClick={() => openTask(x.id)}>
                  <span className="ellipsis">{x.title}</span>
                  {(x.date ?? x.deadline) && <span className="faint xs">{relativeDay((x.date ?? x.deadline)!, today)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="orbit-links">
        <button className="btn btn-ghost btn-sm" onClick={() => { closeOrbit(); if (isProject) navigate('projects', { id: answer.project.id }); else navigate('goals', { id: answer.goal.id }); }}>
          {t('common.open')} <ArrowRight />
        </button>
      </div>
    </div>
  );
}

function WhatNowCard({ answer }: { answer: Extract<OrbitAnswer, { kind: 'whatNow' }> }) {
  const r = answer.result;
  const until = r.until ? new Date(r.until) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const busyUntil = r.busyUntil ? new Date(r.busyUntil) : null;
  const headline =
    r.freeMin === null
      ? busyUntil
        ? t('orbit.now.busyUntil', { time: `${pad(busyUntil.getHours())}:${pad(busyUntil.getMinutes())}` })
        : t('orbit.now.busy')
      : until ? t('orbit.now.free', { duration: formatDuration(r.freeMin), time: `${pad(until.getHours())}:${pad(until.getMinutes())}` }) : t('orbit.now.freeRest');
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <Play />
        <b>{headline}</b>
      </div>
      {r.pick ? (
        <>
          <p className="small">{r.freeMin === null ? t('orbit.now.pickAfter') : t('orbit.now.pick')}</p>
          <div className="orbit-pick">
            <button className="orbit-linkish grow" onClick={() => openTask(r.pick!.id)}>
              <b className="ellipsis">{r.pick.title}</b>
              <span className="faint xs">{formatDuration(r.pick.durationMin ?? 30)}</span>
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { closeOrbit(); startFocusOnTask(r.pick!); }}>
              <Play />
              {t('today.startFocus')}
            </button>
          </div>
          {r.alternatives.length > 0 && (
            <p className="faint xs">
              {t('orbit.now.alternatives')}: {r.alternatives.map((x) => x.title).join(' · ')}
            </p>
          )}
        </>
      ) : (
        <p className="muted small">{t('orbit.now.nothing')}</p>
      )}
    </div>
  );
}

function CommandCard({ answer }: { answer: Extract<OrbitAnswer, { kind: 'command' }> }) {
  // Se calcula una vez: la vista previa refleja los datos del momento en que preguntaste.
  const preview = useMemo(() => previewCommand(answer.intent), [answer.intent]);
  const Icon = preview.icon;
  const [ran, setRan] = useState(false);
  return (
    <div className="orbit-card">
      <div className="orbit-card-head">
        <Icon />
        <b>{preview.title}</b>
      </div>
      {preview.lines.length > 0 && (
        <ul className="orbit-preview">
          {preview.lines.slice(0, 8).map((l, i) => (
            <li key={i} className={cx(l.done && 'done')}>
              {l.left && <span className="num faint xs">{l.left}</span>}
              {l.color && <i className="dot" style={{ color: l.color }} />}
              <span className="grow ellipsis">{l.text}</span>
              {l.sub && <span className="faint xs">{l.sub}</span>}
            </li>
          ))}
        </ul>
      )}
      {preview.note && <p className="faint xs">{preview.note}</p>}
      {!preview.disabled && (
        <div className="orbit-actions">
          <button className="btn btn-sm" disabled={ran} onClick={() => { setRan(true); preview.run(); }}>
            {ran ? <Check /> : <ArrowRight />}
            {preview.actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function UnknownCard({ text, onAsk }: { text: string; onAsk: (text: string) => void }) {
  const projects = useProjectNames();
  const [saved, setSaved] = useState(false);
  const parsed = useMemo(() => parseInput(text, { today: todayFn(), projects }), [text, projects]);
  return (
    <div className="orbit-card">
      <p>{t('orbit.unknown')}</p>
      {text.trim() && (
        <div className="orbit-actions">
          <button className="btn btn-sm" disabled={saved} onClick={() => { if (performCapture(text, 'task', parsed)) setSaved(true); }}>
            {saved ? <Check /> : <CircleCheck />}
            {t('orbit.saveAsTask', { title: parsed.title || text })}
          </button>
        </div>
      )}
      <Examples onAsk={onAsk} />
    </div>
  );
}
