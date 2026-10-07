/**
 * Recorrido guiado: oscurece la app y abre un foco de luz sobre elementos reales de la
 * interfaz. El foco viaja de un elemento a otro con muelles (se estira como una gota) y la
 * tarjeta de explicación lo acompaña. Teclado: → / Intro avanzar, ← atrás, Esc salir.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { getPrefs, updatePrefs } from '@/data/store';
import { t } from '@/i18n';
import { Rich } from '@/features/learn/Rich';
import { SPRING } from '@/ui/motion/springs';
import { navigate, useUi, type Screen } from './ui';
import '@/features/learn/learn.css';

interface TourStep {
  target?: string;
  screen?: Screen;
  title: string;
  body: string;
}

interface TourDef {
  lesson?: string;
  steps: TourStep[];
}

export const TOURS: Record<string, TourDef> = {
  welcome: {
    lesson: 'welcome',
    steps: [
      { title: 'Bienvenido a Ember 👋', body: 'Te enseño lo esencial en un minuto. Avanza con `→` o `↵` y sal cuando quieras con `esc`.' },
      { target: 'nav-today', screen: 'today', title: 'Hoy', body: 'Tu centro: lo que toca **ahora**, la agenda, las tareas y los hábitos del día. Vuelve aquí con `T`.' },
      { target: 'palette', title: 'Busca o pídeselo a Ember', body: '`⌘K` abre la paleta: busca lo que sea o escribe frases como **"qué tengo mañana"** o **"empieza focus 25 min"**.' },
      { target: 'nav-inbox', title: 'Captura y Bandeja', body: 'Pulsa `N` en cualquier momento y escribe como hablas: "Llamar a Ana mañana a las 10". Lo que no tiene fecha llega a la **Bandeja**.' },
      { target: 'nav-calendar', title: 'Calendario', body: 'Arrastra sobre una franja vacía para crear un bloque; arrastra los bloques para moverlos o estirarlos.' },
      { target: 'nav-habits', title: 'Hábitos', body: 'Rachas que no castigan: días de gracia, saltar a propósito y modo vacaciones.' },
      { target: 'nav-routines', title: 'Rutinas', body: 'Secuencias guiadas paso a paso, con temporizador y gestos. Empieza con una plantilla.' },
      { target: 'nav-focus', title: 'Focus', body: 'Pomodoro o trabajo profundo con un orbe líquido. `Espacio` pausa y `D` aparca distracciones.' },
      { target: 'learn', title: 'Aprende', body: 'Aquí tienes el tutorial completo, con ejemplos que puedes probar. Pulsa `?` cuando quieras ver todos los atajos.' },
    ],
  },
  today: {
    lesson: 'planDay',
    steps: [
      { target: 'now', screen: 'today', title: 'Ahora y lo siguiente', body: 'Lo que toca en este momento y lo que viene después. Si tienes un hueco, Ember te sugiere una tarea.' },
      { target: 'plan-day', screen: 'today', title: 'Planificar mi día', body: 'Ember propone horas para tus tareas según prioridades, fechas límite y huecos libres. Nada cambia hasta que aceptas.' },
      { target: 'today-tasks', screen: 'today', title: 'Para hoy', body: 'Escribe en la fila de añadir con lenguaje natural. Arrastra una tarea a una hora del calendario para reservarle un bloque.' },
      { target: 'today-habits', screen: 'today', title: 'Hábitos de hoy', body: 'Toca la celda para registrarlo. **Clic derecho** para saltar o registrar progreso parcial.' },
    ],
  },
  focus: {
    lesson: 'focus',
    steps: [
      { target: 'focus-orb', screen: 'focus', title: 'El orbe', body: 'Haz clic en el orbe (o en **Empezar**) para arrancar. Durante la sesión, el líquido baja como un reloj de arena.' },
      { target: 'focus-options', screen: 'focus', title: 'Modo y duración', body: 'Pomodoro o trabajo profundo. Prueba a **mantener pulsado y deslizar** sobre el selector.' },
      { target: 'focus-sound', screen: 'focus', title: 'Sonido ambiental', body: 'Lluvia, océano, bosque, café, ruido marrón… Se generan en tu Mac, sin internet.' },
      { target: 'focus-start', screen: 'focus', title: 'Durante la sesión', body: '`Espacio` pausa, `D` aparca distracciones en la Bandeja y `esc` vuelve a Hoy: la isla de Focus te acompaña.' },
    ],
  },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 8;

function findTarget(id: string | undefined): HTMLElement | null {
  if (!id) return null;
  const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)];
  return els.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null;
}

export function TourHost() {
  const tour = useUi((s) => s.tour);
  if (!tour || !TOURS[tour.id]) return null;
  return createPortal(<TourOverlay key={tour.id} id={tour.id} step={tour.step} />, document.body);
}

function TourOverlay({ id, step }: { id: string; step: number }) {
  const def = TOURS[id];
  const s = def.steps[Math.min(step, def.steps.length - 1)];
  const last = step >= def.steps.length - 1;
  const x = useMotionValue(window.innerWidth / 2);
  const y = useMotionValue(window.innerHeight / 2);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const ringOpacity = useMotionValue(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const first = useRef(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState({ left: 0, top: 0 });

  const close = (finished: boolean) => {
    if (finished && def.lesson) {
      const learned = new Set(getPrefs().learned);
      learned.add(def.lesson);
      updatePrefs({ learned: [...learned] });
    }
    useUi.setState({ tour: null });
  };
  const go = (n: number) => {
    if (n < 0) return;
    if (n >= def.steps.length) close(true);
    else useUi.setState({ tour: { id, step: n } });
  };

  // Navega a la pantalla del paso y espera a que el elemento exista.
  useEffect(() => {
    setReady(false);
    if (s.screen && useUi.getState().route.screen !== s.screen) navigate(s.screen);
    let raf = 0;
    let tries = 0;
    const seek = () => {
      const el = findTarget(s.target);
      if (el || !s.target || tries > 90) {
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(() => setReady(true), el ? 120 : 0);
        return;
      }
      tries++;
      raf = requestAnimationFrame(seek);
    };
    raf = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  useLayoutEffect(() => {
    if (!ready) return;
    const measure = () => {
      const el = findTarget(s.target);
      const r = el?.getBoundingClientRect();
      const next = r ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null;
      setRect(next);
      const target = next ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0 };
      if (first.current) {
        x.jump(target.x);
        y.jump(target.y);
        w.jump(target.w);
        h.jump(target.h);
        first.current = false;
      } else {
        animate(x, target.x, SPRING.liquid);
        animate(y, target.y, SPRING.liquid);
        animate(w, target.w, SPRING.trail);
        animate(h, target.h, SPRING.trail);
      }
      animate(ringOpacity, next ? 1 : 0, { duration: 0.25 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ready, s, x, y, w, h, ringOpacity]);

  // Coloca la tarjeta junto al foco (debajo, encima o al lado) sin salirse de la ventana.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) {
      setCardPos({ left: (vw - cw) / 2, top: (vh - ch) / 2 });
      return;
    }
    let left = rect.x + rect.w + 16;
    let top = rect.y;
    if (left + cw > vw - 16) {
      left = Math.min(Math.max(16, rect.x), vw - cw - 16);
      top = rect.y + rect.h + 14;
      if (top + ch > vh - 16) top = rect.y - ch - 14;
    }
    setCardPos({ left: Math.max(16, left), top: Math.max(16, Math.min(top, vh - ch - 16)) });
  }, [rect, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        go(step + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        go(step - 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const holeX = useTransform(x, (v) => v);
  const r = useTransform(w, (v) => Math.min(16, v / 2));

  return (
    <motion.div className="tour" role="dialog" aria-modal="true" aria-label={s.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <svg className="tour-svg" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="#fff" />
            <motion.rect x={holeX} y={y} width={w} height={h} rx={r} fill="#000" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#tour-mask)" onClick={() => go(step + 1)} />
      </svg>
      <motion.div className="tour-ring" style={{ x, y, width: w, height: h, opacity: ringOpacity }} />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          ref={cardRef}
          className="tour-card"
          style={{ left: cardPos.left, top: cardPos.top }}
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: ready ? 1 : 0, scale: ready ? 1 : 0.92, y: ready ? 0 : 10 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
          transition={SPRING.liquid}
        >
          <button className="btn btn-ghost btn-icon btn-sm tour-skip" onClick={() => close(false)} aria-label={t('tour.skip')} title={t('tour.skip')}>
            <X />
          </button>
          <div className="eyebrow accent">{t('tour.step', { n: step + 1, total: def.steps.length })}</div>
          <h3>{s.title}</h3>
          <p>
            <Rich text={s.body} />
          </p>
          <div className="tour-foot">
            <span className="tour-dots" aria-hidden>
              {def.steps.map((_, i) => (
                <i key={i} className={i === step ? 'on' : undefined} />
              ))}
            </span>
            {step > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={() => go(step - 1)}>
                <ArrowLeft /> {t('common.back')}
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => go(step + 1)} autoFocus>
              {last ? (
                <>
                  <Check /> {t('tour.done')}
                </>
              ) : (
                <>
                  {t('common.next')} <ArrowRight />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
