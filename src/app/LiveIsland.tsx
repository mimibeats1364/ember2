/**
 * Isla de Focus: una píldora de vidrio con el temporizador.
 * - Dentro de la app aparece cuando hay una sesión y no estás en la pantalla de Focus.
 *   Se expande al pasar el cursor, se arrastra con inercia y doble clic la recoloca.
 * - En macOS también existe como ventana flotante propia (ver IslandWindow), que se muestra
 *   cuando Ember no está delante.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react';
import { Maximize2, Pause, Play, SkipForward } from 'lucide-react';
import type { FocusState } from '@core/focus';
import { formatClock, phaseDurationMs, remainingMs } from '@core/focus';
import { t, type TKey } from '@/i18n';
import { cx } from '@/ui/components/primitives';
import { SPRING } from '@/ui/motion/springs';
import { navigate, useUi } from './ui';
import { skipFocusPhase, togglePauseFocus, useFocus, continueFocus } from './focusStore';
import { useFocusTick } from './Sidebar';

export type IslandCommand = 'toggle' | 'skip' | 'open' | 'continue';

function MiniRing({ value, breakPhase }: { value: number; breakPhase: boolean }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className={cx('island-ring', breakPhase && 'break')} aria-hidden>
      <circle cx="12" cy="12" r={r} className="track" />
      <motion.circle cx="12" cy="12" r={r} className="value" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - value) }} transition={SPRING.smooth} />
    </svg>
  );
}

/** Contenido de la isla (compartido por la versión integrada y la ventana nativa). */
export function IslandPill(props: { state: FocusState; now: number; expanded: boolean; onCommand: (c: IslandCommand) => void; native?: boolean }) {
  const { state } = props;
  const remaining = remainingMs(state, props.now);
  const progress = state.status === 'awaiting' ? 1 : 1 - remaining / phaseDurationMs(state);
  const isBreak = state.phase !== 'focus';
  const label = state.label || t(`focus.phase.${state.phase}` as TKey);
  return (
    <>
      <MiniRing value={progress} breakPhase={isBreak} />
      <span className="island-label ellipsis" data-tauri-drag-region={props.native ? '' : undefined}>
        {state.status === 'awaiting' ? (state.phase === 'focus' ? t('focus.awaitingFocus') : t('focus.awaitingBreak')) : label}
      </span>
      <span className={cx('island-clock num', state.status === 'paused' && 'paused')} data-tauri-drag-region={props.native ? '' : undefined}>
        {state.status === 'awaiting' ? '—' : formatClock(remaining)}
      </span>
      <AnimatePresence initial={false}>
        {props.expanded && (
          <motion.span className="island-actions" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} transition={SPRING.snappy}>
            {state.status === 'awaiting' ? (
              <button className="island-btn" onClick={() => props.onCommand('continue')} aria-label={t('focus.continue')} title={t('focus.continue')}>
                <Play />
              </button>
            ) : (
              <button className="island-btn" onClick={() => props.onCommand('toggle')} aria-label={state.status === 'paused' ? t('common.resume') : t('common.pause')} title={state.status === 'paused' ? t('common.resume') : t('common.pause')}>
                {state.status === 'paused' ? <Play /> : <Pause />}
              </button>
            )}
            <button className="island-btn" onClick={() => props.onCommand('skip')} aria-label={t('common.skip')} title={t('common.skip')}>
              <SkipForward />
            </button>
            <button className="island-btn" onClick={() => props.onCommand('open')} aria-label={t('island.open')} title={t('island.open')}>
              <Maximize2 />
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );
}

export function runIslandCommand(c: IslandCommand) {
  if (c === 'toggle') togglePauseFocus();
  else if (c === 'skip') skipFocusPhase();
  else if (c === 'continue') continueFocus();
  else navigate('focus');
}

/** Versión integrada en la ventana principal. */
export function LiveIsland() {
  const state = useFocus((s) => s.state);
  const screen = useUi((s) => s.route.screen);
  const [hover, setHover] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const bounds = useRef<HTMLDivElement>(null);
  useFocusTick();
  const visible = !!state && screen !== 'focus';
  useEffect(() => {
    if (!visible) setHover(false);
  }, [visible]);
  return (
    <div className="island-bounds" ref={bounds}>
      <AnimatePresence>
        {visible && state && (
          <motion.div
            key="island"
            className={cx('island lg-rim', hover && 'expanded', state.phase !== 'focus' && 'break')}
            role="status"
            aria-label={t('island.label')}
            initial={{ opacity: 0, y: -40, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.6, transition: { duration: 0.2 } }}
            transition={SPRING.liquid}
            layout
            drag
            dragConstraints={bounds}
            dragElastic={0.18}
            dragTransition={{ bounceStiffness: 420, bounceDamping: 26 }}
            whileDrag={{ scale: 1.05 }}
            onHoverStart={() => setHover(true)}
            onHoverEnd={() => setHover(false)}
            onDoubleClick={() => {
              animate(x, 0, SPRING.liquid);
              animate(y, 0, SPRING.liquid);
            }}
            style={{ x, y, originY: 0 }}
          >
            <IslandPill state={state} now={Date.now()} expanded={hover} onCommand={runIslandCommand} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
