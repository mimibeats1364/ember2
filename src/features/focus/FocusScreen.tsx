import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, CloudRain, Coffee, Disc3, Pause, Play, SkipForward, Square, Trees, Volume2, VolumeX, Wind, Orbit, AudioWaveform, Sparkles, Droplets, ParkingSquare, Inbox } from 'lucide-react';
import { DEEP_WORK_MINUTES, deepWorkConfig, formatClock, phaseDurationMs, pomodoroConfig, remainingMs, type FocusConfig } from '@core/focus';
import { compareTasks, isOpen } from '@core/tasks';
import { sessionsInRange } from '@core/analytics';
import { addDays, localDateOf, startOfWeek } from '@core/dates';
import { useList, usePrefs, useEntity } from '@/data/store';
import { useToday } from '@/data/selectors';
import { formatDate, formatDuration, formatRange, t, tp, type TKey } from '@/i18n';
import { Chips, cx, Kbd, Modal, Segmented } from '@/ui/components/primitives';
import { LiquidOrb } from '@/ui/components/LiquidOrb';
import { SPRING } from '@/ui/motion/springs';
import { AMBIENT_KINDS, playAmbient, stopAmbient, type AmbientKind } from '@/platform/sound';
import { navigate } from '@/app/ui';
import { continueFocus, dismissFinished, endFocusSession, parkThought, setFocusSound, skipFocusPhase, startFocusSession, togglePauseFocus, useFocus } from '@/app/focusStore';
import { useFocusTick } from '@/app/Sidebar';
import './focus.css';

const SOUND_ICONS: Record<AmbientKind, typeof CloudRain> = {
  none: VolumeX,
  rain: CloudRain,
  ocean: Droplets,
  forest: Trees,
  cafe: Coffee,
  brown: Wind,
  white: AudioWaveform,
  space: Orbit,
  lofi: Disc3,
};

export default function FocusScreen() {
  const state = useFocus((s) => s.state);
  const finished = useFocus((s) => s.finished);
  if (state) return <Running />;
  if (finished) return <Finished />;
  return <Setup />;
}

// ── Preparación ────────────────────────────────────────────────────────────────────────

function Setup() {
  const prefs = usePrefs();
  const tasks = useList('tasks');
  const today = useToday();
  const sessions = useList('focusSessions');
  const [mode, setMode] = useState<'pomodoro' | 'deep'>('pomodoro');
  const [preset, setPreset] = useState(`${prefs.focus.focusMin}/${prefs.focus.breakMin}`);
  const [custom, setCustom] = useState({ focus: 40, brk: 8 });
  const [deepMin, setDeepMin] = useState<number | 'custom'>(90);
  const [deepCustom, setDeepCustom] = useState(75);
  const [taskId, setTaskId] = useState<string>('');
  const [sound, setSound] = useState<AmbientKind>((prefs.focus.sound as AmbientKind) ?? 'none');
  const [volume, setVolume] = useState(prefs.focus.volume);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => () => {
    if (!useFocus.getState().state) stopAmbient();
  }, []);

  const candidates = useMemo(
    () => tasks.filter((x) => isOpen(x) && !x.parentId && ((x.date !== null && x.date <= addDays(today, 1)) || (x.deadline !== null && x.deadline <= addDays(today, 7)) || x.status === 'in_progress')).sort(compareTasks).slice(0, 40),
    [tasks, today],
  );

  const config: FocusConfig = mode === 'deep'
    ? deepWorkConfig(deepMin === 'custom' ? deepCustom : deepMin)
    : preset === 'custom'
      ? pomodoroConfig(custom.focus, custom.brk, custom.brk * 3, prefs.focus.longBreakEvery, prefs.focus.autoStartBreaks)
      : (() => {
          const [f, b] = preset.split('/').map(Number);
          return pomodoroConfig(f, b, b * 3, prefs.focus.longBreakEvery, prefs.focus.autoStartBreaks);
        })();

  const task = tasks.find((x) => x.id === taskId);
  const start = () => {
    setPreviewing(false);
    startFocusSession(config, task?.id ?? null, task?.title ?? '', sound, volume);
  };

  const todaySessions = sessionsInRange(sessions, today, today);
  const weekSessions = sessionsInRange(sessions, startOfWeek(today, prefs.weekStartsOn), today);
  const recent = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6);

  return (
    <div className="page focus-setup">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('focus.title')}</h1>
          <p className="page-subtitle">{t('focus.subtitle')}</p>
        </div>
      </header>
      <div className="focus-setup-grid">
        <section className="card card-glow focus-hero" data-tour="focus-orb">
          <LiquidOrb level={0.66} ring={1} size={250} calm onClick={start} label={t('focus.start')}>
            <div className="focus-clock num">{formatClock(config.focusMin * 60_000)}</div>
            <div className="faint small">{mode === 'deep' ? t('focus.deep') : `${config.focusMin} / ${config.breakMin} · ×${config.cycles}`}</div>
          </LiquidOrb>
          <button className="btn btn-primary btn-xl magnetic" data-focus-start data-pull="16" data-tour="focus-start" onClick={start} style={{ marginTop: 26 }}>
            <Play /> {t('focus.start')}
          </button>
          <p className="faint xs" style={{ marginTop: 12 }}>{t('focus.shortcutHint')}</p>
        </section>
        <section className="card card-pad stack gap-5" data-tour="focus-options">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'pomodoro', label: t('focus.pomodoro') }, { value: 'deep', label: t('focus.deep') }]} />
          {mode === 'pomodoro' ? (
            <Chips value={preset} onChange={setPreset} options={['25/5', '50/10', '90/20', 'custom'].map((p) => ({ value: p, label: p === 'custom' ? t('focus.custom') : p }))} />
          ) : (
            <Chips
              value={String(deepMin)}
              onChange={(v) => setDeepMin(v === 'custom' ? 'custom' : Number(v))}
              options={[...DEEP_WORK_MINUTES.map((m) => ({ value: String(m), label: formatDuration(m) })), { value: 'custom', label: t('focus.custom') }]}
            />
          )}
          {mode === 'pomodoro' && preset === 'custom' && (
            <div className="row-flex gap-3">
              <label className="field"><span className="field-label">{t('focus.focusMin')}</span><input type="number" className="input" min={5} max={180} value={custom.focus} onChange={(e) => setCustom({ ...custom, focus: Math.max(5, Number(e.target.value) || 25) })} /></label>
              <label className="field"><span className="field-label">{t('focus.breakMin')}</span><input type="number" className="input" min={1} max={60} value={custom.brk} onChange={(e) => setCustom({ ...custom, brk: Math.max(1, Number(e.target.value) || 5) })} /></label>
            </div>
          )}
          {mode === 'deep' && deepMin === 'custom' && (
            <label className="field"><span className="field-label">{t('focus.focusMin')}</span><input type="number" className="input" style={{ maxWidth: 140 }} min={10} max={360} value={deepCustom} onChange={(e) => setDeepCustom(Math.max(10, Number(e.target.value) || 60))} /></label>
          )}
          <label className="field">
            <span className="field-label">{t('focus.task')}</span>
            <select className="select" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">{t('focus.noTask')}</option>
              {candidates.map((x) => <option key={x.id} value={x.id}>{x.title}{x.durationMin ? ` · ${formatDuration(x.durationMin)}` : ''}</option>)}
            </select>
          </label>
          <div className="field" data-tour="focus-sound">
            <span className="field-label">{t('focus.sound')}</span>
            <div className="sound-grid">
              {AMBIENT_KINDS.map((k) => {
                const Icon = SOUND_ICONS[k];
                return (
                  <button
                    key={k}
                    className={cx('sound-tile', sound === k && 'active')}
                    onClick={() => {
                      setSound(k);
                      if (previewing) k === 'none' ? stopAmbient() : playAmbient(k, volume);
                    }}
                  >
                    <Icon />
                    <span>{t(`sounds.${k}` as TKey)}</span>
                  </button>
                );
              })}
            </div>
            <div className="row-flex gap-3" style={{ marginTop: 10 }}>
              <button className={cx('btn btn-sm', previewing && 'btn-subtle')} disabled={sound === 'none'} onClick={() => {
                if (previewing) {
                  stopAmbient();
                  setPreviewing(false);
                } else {
                  playAmbient(sound, volume);
                  setPreviewing(true);
                }
              }}>
                {previewing ? <Pause /> : <Volume2 />} {t('focus.sound')}
              </button>
              <input type="range" min={0} max={1} step={0.05} value={volume} aria-label={t('focus.volume')} onChange={(e) => { setVolume(Number(e.target.value)); if (previewing) playAmbient(sound, Number(e.target.value)); }} />
            </div>
            <p className="faint xs" style={{ marginTop: 8 }}>{t('focus.musicNote')}</p>
          </div>
        </section>
      </div>
      <section className="grid-3" style={{ marginTop: 20 }}>
        <div className="card stat"><div className="label">{t('focus.today')}</div><div className="value">{formatDuration(todaySessions.reduce((a, s) => a + s.focusSec, 0) / 60)}</div><div className="sub">{tp('focus.sessions', todaySessions.length)}</div></div>
        <div className="card stat"><div className="label">{t('focus.week')}</div><div className="value">{formatDuration(weekSessions.reduce((a, s) => a + s.focusSec, 0) / 60)}</div><div className="sub">{tp('focus.sessions', weekSessions.length)}</div></div>
        <div className="card stat">
          <div className="label">{t('insights.interrupted')}</div>
          <div className="value">{weekSessions.filter((s) => s.interrupted).length}</div>
          <div className="sub">{t('focus.week')}</div>
        </div>
      </section>
      {recent.length > 0 && (
        <section className="card card-pad" style={{ marginTop: 20 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>{t('insights.focusStats')}</div>
          {recent.map((s) => (
            <div key={s.id} className="row-flex gap-3 small" style={{ padding: '7px 0', borderTop: '1px solid var(--line)' }}>
              <span className="num faint" style={{ width: 150 }}>{formatDate(localDateOf(s.startedAt), 'medium')} · {formatRange(new Date(s.startedAt), new Date(s.endedAt ?? s.startedAt))}</span>
              <span className="grow ellipsis">{s.label || t('focus.noTask')}</span>
              <span className="num">{formatDuration(s.focusSec / 60)}</span>
              {s.interrupted ? <span className="tag warn">{t('insights.interrupted')}</span> : <Check size={14} style={{ color: 'var(--success)' }} />}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── En curso (modo inmersivo) ──────────────────────────────────────────────────────────

function Running() {
  const state = useFocus((s) => s.state)!;
  const sound = useFocus((s) => s.sound);
  const volume = useFocus((s) => s.volume);
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState('');
  useFocusTick();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !stopping && !document.querySelector('.modal')) navigate('today');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stopping]);
  const now = Date.now();
  const remaining = remainingMs(state, now);
  const progress = 1 - remaining / phaseDurationMs(state);
  const isBreak = state.phase !== 'focus';
  return (
    <div className={cx('focus-run', isBreak && 'break', state.status === 'paused' && 'paused')}>
      <button className="btn btn-ghost btn-sm focus-exit" onClick={() => navigate('today')}><ArrowLeft />{t('nav.today')}</button>
      <div className="focus-center">
        <div className="eyebrow accent">
          {t(`focus.phase.${state.phase}` as TKey)}
          {state.config.cycles > 1 && <span className="faint"> · {t('focus.cycle', { n: state.cycle, total: state.config.cycles })}</span>}
        </div>
        <h1 className="focus-task">{state.label || t('focus.noTask')}</h1>
        <div className="focus-ring">
          <LiquidOrb
            level={state.status === 'awaiting' ? 1 : 1 - progress}
            ring={state.status === 'awaiting' ? 1 : progress}
            size={Math.min(330, window.innerWidth - 60, window.innerHeight * 0.42)}
            color={isBreak ? '#4FD3E0' : undefined}
            color2={isBreak ? '#3C7EE6' : undefined}
            paused={state.status !== 'running'}
            calm={isBreak}
            onClick={state.status === 'awaiting' ? continueFocus : togglePauseFocus}
            label={state.status === 'paused' ? t('common.resume') : t('common.pause')}
          >
            <div className="focus-clock big num">{state.status === 'awaiting' ? '—' : formatClock(remaining)}</div>
            <AnimatePresence>
              {state.status === 'paused' && (
                <motion.div className="faint small" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {t('common.pause')}
                </motion.div>
              )}
            </AnimatePresence>
          </LiquidOrb>
        </div>
        {state.status === 'awaiting' ? (
          <div className="stack gap-3" style={{ alignItems: 'center' }}>
            <p className="muted">{state.phase === 'focus' ? t('focus.awaitingFocus') : t('focus.awaitingBreak')}</p>
            <div className="row-flex gap-2">
              <button className="btn btn-primary btn-lg" onClick={continueFocus}><Play />{state.phase === 'focus' ? t('focus.continue') : t('focus.startBreak')}</button>
              {state.phase !== 'focus' && <button className="btn btn-lg" onClick={skipFocusPhase}><SkipForward />{t('focus.skipBreak')}</button>}
              <button className="btn btn-lg btn-ghost" onClick={() => setStopping(true)}><Square />{t('common.stop')}</button>
            </div>
          </div>
        ) : (
          <div className="focus-controls">
            <button className="btn btn-lg btn-icon-lg" onClick={togglePauseFocus} aria-label={state.status === 'paused' ? t('common.resume') : t('common.pause')}>
              {state.status === 'paused' ? <Play /> : <Pause />}
            </button>
            <button className="btn btn-lg btn-icon-lg btn-ghost" onClick={skipFocusPhase} aria-label={t('common.skip')} title={t('common.skip')}><SkipForward /></button>
            <button className="btn btn-lg btn-icon-lg btn-ghost" onClick={() => setStopping(true)} aria-label={t('common.stop')} title={t('common.stop')}><Square /></button>
          </div>
        )}
        <div className="focus-sound">
          {AMBIENT_KINDS.map((k) => {
            const Icon = SOUND_ICONS[k];
            return (
              <button key={k} className={cx('btn btn-icon btn-sm btn-ghost', sound === k && 'active-sound')} title={t(`sounds.${k}` as TKey)} aria-label={t(`sounds.${k}` as TKey)} onClick={() => setFocusSound(k, volume)}>
                <Icon />
              </button>
            );
          })}
          <input type="range" min={0} max={1} step={0.05} value={volume} aria-label={t('focus.volume')} onChange={(e) => setFocusSound(sound, Number(e.target.value))} style={{ width: 110 }} />
        </div>
        {state.phase === 'focus' && <ParkBox />}
        <p className="faint xs" style={{ marginTop: 18 }}>{t('focus.shortcutHint')}</p>
      </div>
      {stopping && (
        <Modal
          title={t('focus.stopTitle')}
          onClose={() => setStopping(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setStopping(false)}>{t('focus.keepGoing')}</button>
              <button className="btn btn-primary" onClick={() => { endFocusSession(note.trim()); setStopping(false); }}>{t('focus.stopConfirm')}</button>
            </>
          }
        >
          <p className="muted small">{t('focus.stopBody')}</p>
          <textarea className="textarea" style={{ marginTop: 12 }} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('focus.interruptionPlaceholder')} />
        </Modal>
      )}
    </div>
  );
}

// ── Terminada ──────────────────────────────────────────────────────────────────────────

function Finished() {
  const finished = useFocus((s) => s.finished)!;
  const task = useEntity('tasks', finished.taskId);
  return (
    <div className="focus-run finished">
      <div className="focus-center">
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING.liquid}>
          <LiquidOrb level={finished.completed ? 1 : 0.6} size={150}>
            <Sparkles size={30} />
          </LiquidOrb>
        </motion.div>
        <h1 className="focus-task">{finished.completed ? t('focus.finishTitle') : t('focus.endedTitle')}</h1>
        <p className="muted" style={{ fontSize: 'var(--fs-md)' }}>
          {finished.focusSec < 30 ? t('focus.tooShort') : t('focus.finishBody', { duration: formatDuration(finished.focusSec / 60), task: finished.label ? t('focus.finishTask', { task: finished.label }) : '' })}
        </p>
        {finished.parked > 0 && (
          <button className="btn btn-subtle" style={{ marginTop: 16 }} onClick={() => { dismissFinished(false); navigate('inbox'); }}>
            <Inbox /> {tp('focus.parkedSummary', finished.parked)}
          </button>
        )}
        <div className="row-flex gap-2 wrap" style={{ marginTop: 26, justifyContent: 'center' }}>
          {task && task.status !== 'done' && <button className="btn btn-primary btn-lg" onClick={() => dismissFinished(true)}><Check />{t('focus.markTaskDone')}</button>}
          <button className="btn btn-lg" onClick={() => dismissFinished(false)}><Play />{t('focus.newSession')}</button>
          <button className="btn btn-lg btn-ghost" onClick={() => { dismissFinished(false); navigate('today'); }}>{t('focus.backToToday')}</button>
        </div>
      </div>
    </div>
  );
}

// ── Aparcar distracciones ──────────────────────────────────────────────────────────────

/** Apunta lo que te distrae en la bandeja sin salir de Focus (tecla D para escribir). */
function ParkBox() {
  const parked = useFocus((s) => s.parked);
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey && !(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) && !document.querySelector('.modal')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="park">
      <div className="park-box lg-rim">
        <ParkingSquare className="park-icon" />
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('focus.parkPlaceholder')}
          aria-label={t('focus.parkLabel')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parkThought(text)) {
              setText('');
              setFlash((n) => n + 1);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              ref.current?.blur();
            }
          }}
        />
        {!text && <Kbd>D</Kbd>}
      </div>
      <AnimatePresence mode="popLayout">
        {parked.length > 0 && (
          <motion.div key={flash} className="park-count" initial={{ opacity: 0, y: -8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING.liquid}>
            <Check size={12} /> {tp('focus.parked', parked.length)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
