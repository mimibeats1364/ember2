/**
 * Pista líquida: una gota de vidrio que viaja hasta el elemento activo de un contenedor.
 * Cada borde tiene su propio muelle (el de delante es más rígido que el de detrás), así que
 * la gota se estira al moverse y se recoge al llegar, como en las barras de macOS 26.
 * Opcionalmente, una segunda gota más tenue sigue al cursor entre los elementos.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, motion, useMotionValue, useTransform, useVelocity, type MotionValue } from 'motion/react';
import { SPRING, prefersReducedMotion } from './springs';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectIn(container: HTMLElement, el: Element): Rect {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  // Los hijos absolutos se colocan respecto al borde interior (sin el grosor del borde).
  return { x: r.left - c.left - container.clientLeft + container.scrollLeft, y: r.top - c.top - container.clientTop + container.scrollTop, w: r.width, h: r.height };
}

function useEdges() {
  const x1 = useMotionValue(0);
  const x2 = useMotionValue(0);
  const y1 = useMotionValue(0);
  const y2 = useMotionValue(0);
  const opacity = useMotionValue(0);
  const width = useTransform(() => Math.max(0, x2.get() - x1.get()));
  const height = useTransform(() => Math.max(0, y2.get() - y1.get()));
  return { x1, x2, y1, y2, opacity, width, height };
}

type Edges = ReturnType<typeof useEdges>;

function moveEdges(e: Edges, to: Rect, prev: Rect | null, instant: boolean) {
  const targets: [MotionValue<number>, number][] = [
    [e.x1, to.x],
    [e.x2, to.x + to.w],
    [e.y1, to.y],
    [e.y2, to.y + to.h],
  ];
  if (instant || !prev) {
    for (const [mv, v] of targets) mv.jump(v);
    return;
  }
  const right = to.x > prev.x;
  const down = to.y > prev.y;
  // El borde que va delante usa el muelle rígido; el de detrás, el blando.
  animate(e.x1, to.x, right ? SPRING.trail : SPRING.lead);
  animate(e.x2, to.x + to.w, right ? SPRING.lead : SPRING.trail);
  animate(e.y1, to.y, down ? SPRING.trail : SPRING.lead);
  animate(e.y2, to.y + to.h, down ? SPRING.lead : SPRING.trail);
}

export function LiquidTrack(props: {
  container: RefObject<HTMLElement | null>;
  /** Devuelve el elemento activo (por defecto, el primero con `.active`). */
  getActive?: (c: HTMLElement) => Element | null;
  /** Cambian cuando cambia el activo: provocan una nueva medición animada. */
  deps: unknown[];
  /** Selector de elementos sobre los que aparece la gota de hover. */
  hoverSelector?: string;
  axis?: 'x' | 'y' | 'both';
  className?: string;
}) {
  const { container } = props;
  const thumb = useEdges();
  const hover = useEdges();
  const prev = useRef<Rect | null>(null);
  const hoverPrev = useRef<Rect | null>(null);
  const getActiveRef = useRef(props.getActive);
  getActiveRef.current = props.getActive;

  // Deformación líquida: se aplana en el eje perpendicular según la velocidad.
  const vx = useVelocity(thumb.x2);
  const vy = useVelocity(thumb.y2);
  const scaleX = useTransform(vy, [-2600, 0, 2600], [props.axis === 'y' ? 0.9 : 1, 1, props.axis === 'y' ? 0.9 : 1]);
  const scaleY = useTransform(vx, [-2600, 0, 2600], [props.axis === 'x' ? 0.82 : 1, 1, props.axis === 'x' ? 0.82 : 1]);

  const measure = useCallback(
    (instant: boolean) => {
      const c = container.current;
      if (!c) return;
      const el = getActiveRef.current ? getActiveRef.current(c) : c.querySelector('.active');
      if (!el || (el as HTMLElement).offsetParent === null) {
        animate(thumb.opacity, 0, { duration: 0.15 });
        prev.current = null;
        return;
      }
      const r = rectIn(c, el);
      const wasHidden = prev.current === null;
      moveEdges(thumb, r, prev.current, instant || prefersReducedMotion());
      if (wasHidden) animate(thumb.opacity, 1, { duration: instant ? 0 : 0.2 });
      prev.current = r;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [container],
  );

  useLayoutEffect(() => {
    measure(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, props.deps);

  useEffect(() => {
    const c = container.current;
    if (!c) return;
    c.classList.add('has-track');
    const ro = new ResizeObserver(() => measure(true));
    ro.observe(c);
    const onResize = () => measure(true);
    window.addEventListener('resize', onResize);
    // Las fuentes variables cambian anchos al cargar.
    void document.fonts?.ready.then(() => measure(true));
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      c.classList.remove('has-track');
    };
  }, [container, measure]);

  // Gota de hover que sigue al cursor.
  useEffect(() => {
    const c = container.current;
    const sel = props.hoverSelector;
    if (!c || !sel) return;
    let current: Element | null = null;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(sel) ?? null;
      if (el === current) return;
      current = el;
      if (!el || !c.contains(el) || el.classList.contains('active')) {
        animate(hover.opacity, 0, { duration: 0.18 });
        return;
      }
      const r = rectIn(c, el);
      const instant = hoverPrev.current === null || hover.opacity.get() < 0.05;
      if (instant) {
        hover.x1.jump(r.x);
        hover.x2.jump(r.x + r.w);
        hover.y1.jump(r.y);
        hover.y2.jump(r.y + r.h);
      } else {
        moveEdges(hover, r, hoverPrev.current, prefersReducedMotion());
      }
      hoverPrev.current = r;
      animate(hover.opacity, 1, { duration: 0.16 });
    };
    const onLeave = () => {
      current = null;
      animate(hover.opacity, 0, { duration: 0.2 });
    };
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerleave', onLeave);
    return () => {
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerleave', onLeave);
    };
  }, [container, props.hoverSelector, hover]);

  return (
    <>
      {props.hoverSelector && (
        <motion.span aria-hidden className="liquid-hover" style={{ x: hover.x1, y: hover.y1, width: hover.width, height: hover.height, opacity: hover.opacity }} />
      )}
      <motion.span
        aria-hidden
        className={['liquid-thumb', props.className].filter(Boolean).join(' ')}
        style={{ x: thumb.x1, y: thumb.y1, width: thumb.width, height: thumb.height, opacity: thumb.opacity, scaleX, scaleY }}
      />
    </>
  );
}
