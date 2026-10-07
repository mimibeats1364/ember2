/**
 * Orbe de vidrio con líquido dentro. El nivel sube con muelle según el progreso, las olas se
 * mueven solas y se agitan al pasar el cursor (y más al pulsar). Se usa en Focus, en las
 * rutinas y en la isla flotante.
 */
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import { cx } from './primitives';

const R = 92;

/** Ola con periodo 200 (dos crestas en 400) para poder desplazarla sin costuras. */
function wavePath(amp: number): string {
  return `M0,0 Q50,${-amp} 100,0 T200,0 T300,0 T400,0 V230 H0 Z`;
}

export function LiquidOrb(props: {
  /** 0 = vacío, 1 = lleno. */
  level: number;
  /** Progreso exacto en el anillo exterior (por defecto, igual que el nivel). */
  ring?: number;
  size: number;
  color?: string;
  color2?: string;
  paused?: boolean;
  calm?: boolean;
  onClick?: () => void;
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const level = useSpring(Math.max(0, Math.min(1, props.level)), { stiffness: 60, damping: 16, mass: 1.2 });
  const ring = useSpring(Math.max(0, Math.min(1, props.ring ?? props.level)), { stiffness: 90, damping: 22 });
  const y = useTransform(level, (v) => 196 - v * 186);
  const [slosh, setSlosh] = useState(0);

  useEffect(() => {
    level.set(Math.max(0, Math.min(1, props.level)));
  }, [props.level, level]);
  useEffect(() => {
    ring.set(Math.max(0, Math.min(1, props.ring ?? props.level)));
  }, [props.ring, props.level, ring]);

  const color = props.color ?? 'var(--accent)';
  const color2 = props.color2 ?? 'var(--accent-2)';
  const Tag = props.onClick ? 'button' : 'div';

  return (
    <Tag
      className={cx('lorb tilt', props.paused && 'paused', props.calm && 'calm', slosh > 0 && 'slosh', props.className)}
      style={{ width: props.size, height: props.size, '--lc': color, '--lc2': color2 } as CSSProperties}
      data-tilt="7"
      aria-label={props.label}
      onClick={
        props.onClick
          ? () => {
              setSlosh((n) => n + 1);
              setTimeout(() => setSlosh(0), 900);
              props.onClick?.();
            }
          : undefined
      }
    >
      <svg viewBox="0 0 200 200" className="lorb-svg" aria-hidden>
        <defs>
          <clipPath id={`c${id}`}>
            <circle cx="100" cy="100" r={R} />
          </clipPath>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.78" />
            <stop offset="0.55" stopColor={color2} stopOpacity="0.62" />
            <stop offset="1" stopColor={color2} stopOpacity="0.92" />
          </linearGradient>
          <radialGradient id={`k${id}`} cx="0.5" cy="1.05" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`s${id}`} cx="0.34" cy="0.24" r="0.62">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={R} className="lorb-body" />
        <g clipPath={`url(#c${id})`}>
          <motion.g style={{ y }}>
            <g className="lorb-amp">
              <g className="lorb-wave w2">
                <path d={wavePath(11)} fill={`url(#g${id})`} opacity="0.42" />
              </g>
              <g className="lorb-wave w1">
                <path d={wavePath(7)} fill={`url(#g${id})`} opacity="0.85" />
                <path d={wavePath(7)} fill="none" className="lorb-meniscus" />
              </g>
            </g>
          </motion.g>
          <circle cx="100" cy="100" r={R} fill={`url(#k${id})`} className="lorb-caustic" />
          <circle cx="100" cy="100" r={R} className="lorb-inner" />
        </g>
        <circle cx="100" cy="100" r={R} fill="none" stroke={`url(#r${id})`} strokeWidth="1.4" />
        <ellipse cx="74" cy="56" rx="50" ry="30" fill={`url(#s${id})`} className="lorb-gloss" />
        <motion.circle
          cx="100"
          cy="100"
          r="98"
          fill="none"
          className="lorb-ring"
          strokeWidth="2.4"
          strokeLinecap="round"
          style={{ pathLength: ring, rotate: -90, transformOrigin: '50% 50%' }}
        />
      </svg>
      {props.children && <div className="lorb-center">{props.children}</div>}
    </Tag>
  );
}
