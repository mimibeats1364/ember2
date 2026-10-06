/**
 * Gráficos SVG propios (ligeros, temables). La curva con brillo y relleno degradado es la
 * firma visual del Reel de referencia.
 */
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { heatLevels, type DayValue } from '@core/analytics';
import { addDays, startOfWeek, weekdayOf } from '@core/dates';
import { formatDate } from '@/i18n';
import { cx } from './primitives';

interface Point {
  label: string;
  value: number;
  tip?: string;
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] ?? pts[i + 1];
    const t = 0.18;
    const c1x = x1 + (x2 - x0) * t;
    const c1y = y1 + (y2 - y0) * t;
    const c2x = x2 - (x3 - x1) * t;
    const c2y = y2 - (y3 - y1) * t;
    d += ` C${c1x},${Math.max(Math.min(c1y, 1e6), -1e6)} ${c2x},${c2y} ${x2},${y2}`;
  }
  return d;
}

export function AreaChart(props: {
  data: Point[];
  height?: number;
  max?: number;
  color?: string;
  yTicks?: number[];
  formatY?: (v: number) => string;
  xEvery?: number;
  highlightLast?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const H = props.height ?? 180;
  const W = 600;
  const padL = props.yTicks ? 34 : 6;
  const padB = 22;
  const padT = 10;
  const max = props.max ?? Math.max(1, ...props.data.map((d) => d.value));
  const n = props.data.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - 8));
  const y = (v: number) => padT + (1 - Math.min(v, max) / max) * (H - padT - padB);
  const pts = props.data.map((d, i) => [x(i), y(d.value)] as [number, number]);
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${H - padB} L${pts[0][0]},${H - padB} Z` : '';
  const color = props.color ?? 'var(--accent)';
  const every = props.xEvery ?? Math.max(1, Math.ceil(n / 10));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`fill${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.42" />
            <stop offset="0.6" stopColor={color} stopOpacity="0.08" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`glow${id}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {(props.yTicks ?? []).map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W - 4} y1={y(tk)} y2={y(tk)} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            <text x={padL - 6} y={y(tk) + 3} textAnchor="end" fontSize="10" fill="var(--text-3)" fontFamily="var(--font-mono)">
              {props.formatY ? props.formatY(tk) : tk}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#fill${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" filter={`url(#glow${id})`} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        {props.data.map((d, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)" fontFamily="var(--font-mono)">
              {d.label}
            </text>
          ) : null,
        )}
        {props.highlightLast && pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} filter={`url(#glow${id})`} />}
        {hover !== null && pts[hover] && (
          <>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padT} y2={H - padB} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4.5" fill={color} stroke="var(--bg)" strokeWidth="2" />
          </>
        )}
        {props.data.map((_, i) => (
          <rect key={i} x={x(i) - (W / Math.max(1, n)) / 2} y={0} width={W / Math.max(1, n)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && pts[hover] && (
        <div className="chart-tip" style={{ left: `${(pts[hover][0] / W) * 100}%`, top: pts[hover][1] }}>
          {props.data[hover].tip ?? `${props.data[hover].label}: ${props.data[hover].value}`}
        </div>
      )}
    </div>
  );
}

export function BarChart(props: { data: Point[]; height?: number; color?: string; highlight?: number; formatValue?: (v: number) => string; xEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = props.height ?? 150;
  const max = Math.max(1, ...props.data.map((d) => d.value));
  const every = props.xEvery ?? 1;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H }} role="img">
        {props.data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end', position: 'relative' }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div
              style={{
                width: '100%',
                maxWidth: 34,
                height: `${Math.max(d.value > 0 ? 3 : 1.5, (d.value / max) * (H - 22))}px`,
                borderRadius: 6,
                background: d.value === 0 ? 'var(--surface-3)' : i === props.highlight || hover === i ? `linear-gradient(180deg, ${props.color ?? 'var(--accent)'}, var(--accent-2))` : `color-mix(in srgb, ${props.color ?? 'var(--accent)'} 55%, transparent)`,
                boxShadow: i === props.highlight ? 'var(--glow)' : undefined,
                transition: 'height 600ms var(--ease), background 150ms',
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', height: 12, visibility: i % every === 0 ? 'visible' : 'hidden' }}>{d.label}</span>
            {hover === i && (
              <div className="chart-tip" style={{ left: '50%', top: H - 22 - (d.value / max) * (H - 22) }}>
                {d.tip ?? (props.formatValue ? props.formatValue(d.value) : d.value)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mapa de calor estilo GitHub: columnas = semanas, filas = días. */
export function Heatmap(props: { series: DayValue[]; weekStartsOn: 0 | 1; formatTip: (d: DayValue) => string; color?: string }) {
  const levels = useMemo(() => heatLevels(props.series), [props.series]);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  if (props.series.length === 0) return null;
  const first = props.series[0].date;
  const offset = (weekdayOf(first) - props.weekStartsOn + 7) % 7;
  const cells: ReactNode[] = [];
  for (let i = 0; i < offset; i++) cells.push(<span key={`o${i}`} className="hm out" />);
  props.series.forEach((d, i) =>
    cells.push(
      <span
        key={d.date}
        className={cx('hm', levels[i] > 0 && `l${levels[i]}`)}
        style={props.color ? ({ '--accent-rgb': props.color } as CSSProperties) : undefined}
        onMouseEnter={(e) => {
          const r = (e.target as HTMLElement).getBoundingClientRect();
          const host = (e.target as HTMLElement).closest('.heatmap-wrap')!.getBoundingClientRect();
          setHover({ i, x: r.left - host.left + r.width / 2, y: r.top - host.top });
        }}
        onMouseLeave={() => setHover(null)}
      />,
    ),
  );
  const months: { col: number; label: string }[] = [];
  let lastMonth = '';
  for (let col = 0; col * 7 < props.series.length + offset; col++) {
    const idx = Math.max(0, col * 7 - offset);
    const date = props.series[idx]?.date;
    if (date && date.slice(0, 7) !== lastMonth) {
      lastMonth = date.slice(0, 7);
      months.push({ col, label: formatDate(date, 'month').slice(0, 3) });
    }
  }
  return (
    <div className="heatmap-wrap" style={{ position: 'relative', overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', height: 16, minWidth: (Math.ceil((props.series.length + offset) / 7)) * 15 }}>
        {months.map((m) => (
          <span key={m.col} style={{ position: 'absolute', left: m.col * 15, fontSize: 10, color: 'var(--text-3)' }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="heatmap">{cells}</div>
      {hover && (
        <div className="chart-tip" style={{ left: hover.x, top: hover.y + 18 }}>
          {props.formatTip(props.series[hover.i])}
        </div>
      )}
    </div>
  );
}

export function weekColumns(from: string, to: string, weekStartsOn: 0 | 1): string[] {
  const out: string[] = [];
  for (let d = startOfWeek(from, weekStartsOn); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}
