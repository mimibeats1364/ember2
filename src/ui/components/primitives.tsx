import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { Priority } from '@core/types';
import { t, type TKey } from '@/i18n';
import { colorValue, EMOJI_CHOICES, PALETTE_KEYS } from '@/ui/theme/palette';
import { playUiSound } from '@/platform/sound';
import { LiquidTrack } from '@/ui/motion/LiquidTrack';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Modal ──────────────────────────────────────────────────────────────────────────────

export function Modal(props: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [leaving, setLeaving] = useState(false);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  // Cierre con animación de salida (la gota se recoge) salvo con movimiento reducido.
  const close = useRef(() => {});
  close.current = () => {
    if (leaving) return;
    if (document.documentElement.hasAttribute('data-reduced-motion')) {
      onCloseRef.current();
      return;
    }
    setLeaving(true);
    setTimeout(() => onCloseRef.current(), 170);
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (items.length === 0) return;
        const firstEl = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, []);
  return createPortal(
    <>
      <div className={cx('scrim', leaving && 'leaving')} onClick={() => close.current()} />
      <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && close.current()}>
        <div ref={ref} className={cx('modal', props.wide && 'wide', leaving && 'leaving', props.className)} role="dialog" aria-modal="true" aria-labelledby={props.title ? titleId : undefined} aria-label={props.label}>
          {props.title !== undefined && (
            <div className="modal-head">
              <h2 className="modal-title" id={titleId}>
                {props.title}
              </h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => close.current()} aria-label={t('a11y.close')} data-close>
                <X />
              </button>
            </div>
          )}
          <div className="modal-body">{props.children}</div>
          {props.footer && <div className="modal-foot">{props.footer}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Popover anclado ────────────────────────────────────────────────────────────────────

export function Popover(props: { anchor: DOMRect | { x: number; y: number }; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const a = props.anchor;
    let left = 'width' in a ? a.left : a.x;
    let top = 'width' in a ? a.bottom + 6 : a.y;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, ('width' in a ? a.top - 6 : a.y) - r.height);
    setPos({ left: Math.max(8, left), top });
  }, [props.anchor]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown, true));
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [props]);
  return createPortal(
    <div ref={ref} className="popover" style={{ left: pos.left, top: pos.top, width: props.width }} role="menu">
      {props.children}
    </div>,
    document.body,
  );
}

export interface MenuEntry {
  label?: string;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  separator?: boolean;
  heading?: string;
  onSelect?: () => void;
}

export function MenuList({ items, onClose }: { items: MenuEntry[]; onClose: () => void }) {
  return (
    <>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : it.heading ? (
          <div key={i} className="menu-label">
            {it.heading}
          </div>
        ) : (
          <button
            key={i}
            className={cx('menu-item', it.danger && 'danger')}
            role="menuitem"
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
          >
            {it.icon}
            <span className="ellipsis">{it.label}</span>
            {it.hint && <span className="hint">{it.hint}</span>}
          </button>
        ),
      )}
    </>
  );
}

/** Menú contextual global (clic derecho / pulsación larga). */
let setMenuState: ((s: { at: { x: number; y: number }; items: MenuEntry[] } | null) => void) | null = null;

export function openContextMenu(e: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuEntry[]) {
  e.preventDefault?.();
  setMenuState?.({ at: { x: e.clientX, y: e.clientY }, items });
}

export function ContextMenuHost() {
  const [state, setState] = useState<{ at: { x: number; y: number }; items: MenuEntry[] } | null>(null);
  useEffect(() => {
    setMenuState = setState;
    return () => {
      setMenuState = null;
    };
  }, []);
  if (!state) return null;
  return (
    <Popover anchor={state.at} onClose={() => setState(null)}>
      <MenuList items={state.items} onClose={() => setState(null)} />
    </Popover>
  );
}

// ── Celebración ────────────────────────────────────────────────────────────────────────

/** Pequeña ráfaga de chispas alrededor de un elemento (sin confeti). */
export function sparkle(el: Element | null, color?: string) {
  if (!el || document.documentElement.hasAttribute('data-reduced-motion')) return;
  const r = el.getBoundingClientRect();
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;pointer-events:none;z-index:900`;
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
    const dist = 16 + Math.random() * 12;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    if (color) s.style.setProperty('--c', color);
    host.appendChild(s);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 700);
}

// ── Casilla de tarea ───────────────────────────────────────────────────────────────────

export function TaskCheck(props: { done: boolean; priority: Priority; onToggle: () => void; label: string }) {
  const [burst, setBurst] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className={cx('check', `p${props.priority}`, props.done && 'done', burst && 'celebrate')}
      role="checkbox"
      aria-checked={props.done}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        if (!props.done) {
          setBurst(true);
          sparkle(ref.current);
          playUiSound('complete');
          setTimeout(() => setBurst(false), 650);
        }
        props.onToggle();
      }}
    >
      <Check strokeWidth={3.5} />
    </button>
  );
}

// ── Celda de hábito ────────────────────────────────────────────────────────────────────

export function HabitCell(props: {
  color: string;
  state: string;
  fill?: number;
  size?: 'sm' | 'md' | 'lg';
  today?: boolean;
  label: string;
  onClick?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
}) {
  const [burst, setBurst] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const c = colorValue(props.color);
  const interactive = !!props.onClick && props.state !== 'future';
  return (
    <button
      ref={ref}
      className={cx('hcell', props.state, props.size && props.size !== 'md' && props.size, props.today && 'today', burst && 'celebrate')}
      style={{ '--hc': c, '--fill': `${Math.round((props.fill ?? 0.5) * 100)}%` } as CSSProperties}
      aria-label={props.label}
      title={props.label}
      disabled={!interactive}
      onClick={(e) => {
        e.stopPropagation();
        if (props.state !== 'done') {
          setBurst(true);
          sparkle(ref.current, c);
          playUiSound('habit');
          setTimeout(() => setBurst(false), 450);
        }
        props.onClick?.();
      }}
      onContextMenu={props.onContextMenu}
    >
      <Check strokeWidth={3.5} />
    </button>
  );
}

// ── Progreso ───────────────────────────────────────────────────────────────────────────

export function Ring(props: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const size = props.size ?? 44;
  const stroke = props.stroke ?? 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, props.value || 0));
  const gid = useId();
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} role="img" aria-label={props.label}>
      <svg className="ring-svg" width={size} height={size}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={props.color ?? 'var(--accent)'} />
            <stop offset="1" stopColor={props.color ?? 'var(--accent-2)'} />
          </linearGradient>
        </defs>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      {props.children && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{props.children}</div>}
    </div>
  );
}

export function Bar(props: { value: number; color?: string; marker?: number; thin?: boolean; thick?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(1, props.value || 0));
  return (
    <div
      className={cx('bar', props.thin && 'thin', props.thick && 'thick')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={props.label}
      style={props.color ? ({ '--bar-color': props.color, '--bar-glow': `${props.color}99` } as CSSProperties) : undefined}
    >
      <span style={{ width: `${v * 100}%` }} />
      {props.marker !== undefined && <i className="marker" style={{ left: `${Math.min(100, props.marker * 100)}%` }} />}
    </div>
  );
}

// ── Estado vacío ───────────────────────────────────────────────────────────────────────

export function Empty(props: { icon: ReactNode; title: string; body?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('empty', props.compact && 'compact')}>
      <div className="glyph">{props.icon}</div>
      <h3>{props.title}</h3>
      {props.body && <p>{props.body}</p>}
      {props.action}
    </div>
  );
}

// ── Controles ──────────────────────────────────────────────────────────────────────────

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<T | null>(null);
  const drag = useRef<{ x: number; active: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const itemAt = (clientX: number): T | null => {
    const items = ref.current?.querySelectorAll<HTMLElement>('.seg-item');
    if (!items) return null;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return el.dataset.value as T;
    }
    return null;
  };
  return (
    <div
      ref={ref}
      className={cx('seg', preview !== null && 'pressing')}
      role="tablist"
      aria-label={props.label}
      // Mantener pulsado y deslizar: la gota sigue al dedo y se suelta en la opción elegida.
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, active: false, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.active && Math.abs(e.clientX - d.x) > 5) {
          d.active = true;
          ref.current?.setPointerCapture(d.id);
        }
        if (d.active) {
          const v = itemAt(e.clientX);
          if (v !== null) setPreview(v);
        }
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.active) {
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 0);
          if (preview !== null && preview !== props.value) props.onChange(preview);
        }
        setPreview(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
      }}
    >
      <LiquidTrack
        container={ref}
        deps={[props.value, preview, props.options.length]}
        getActive={(c) => (preview !== null ? c.querySelector(`[data-value="${CSS.escape(preview)}"]`) : c.querySelector('.seg-item.active'))}
        axis="x"
      />
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          data-value={o.value}
          aria-selected={props.value === o.value}
          className={cx('seg-item', props.value === o.value && 'active')}
          onClick={() => {
            if (!suppressClick.current) props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>(props: { value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; scroll?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={cx('chips', props.scroll && 'scroll')} role="tablist" aria-label={props.label}>
      <LiquidTrack container={ref} deps={[props.value, props.options.length]} getActive={(c) => c.querySelector('.chip.active')} axis="both" />
      {props.options.map((o) => (
        <button key={o.value} role="tab" aria-selected={props.value === o.value} className={cx('chip', props.value === o.value && 'active')} onClick={() => props.onChange(o.value)}>
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('field', props.className)}>
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" className="switch" role="switch" checked={props.checked} aria-label={props.label} onChange={(e) => props.onChange(e.target.checked)} />;
}

export function PriorityPicker(props: { value: Priority; onChange: (p: Priority) => void }) {
  const colors: Record<Priority, string> = { 1: 'var(--accent)', 2: '#e6b030', 3: '#4fd3e0', 4: 'var(--text-3)' };
  return (
    <div className="seg" role="radiogroup" aria-label={t('tasks.priority')}>
      {([1, 2, 3, 4] as Priority[]).map((p) => (
        <button key={p} role="radio" aria-checked={props.value === p} className={cx('seg-item', props.value === p && 'active')} onClick={() => props.onChange(p)} title={t(`tasks.priorities.${p}` as TKey)}>
          <span className="dot" style={{ color: colors[p] }} />P{p}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker(props: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup">
      {PALETTE_KEYS.map((k) => (
        <button key={k} role="radio" aria-checked={props.value === k} aria-label={k} className={cx('swatch', props.value === k && 'active')} style={{ background: colorValue(k) }} onClick={() => props.onChange(k)} />
      ))}
    </div>
  );
}

export function EmojiPicker(props: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-grid" role="radiogroup">
      {EMOJI_CHOICES.map((e) => (
        <button key={e} role="radio" aria-checked={props.value === e} className={cx(props.value === e && 'active')} onClick={() => props.onChange(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function RatingInput(props: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="rating" role="radiogroup" aria-label={props.label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} role="radio" aria-checked={props.value === n} className={cx(props.value === n && 'active')} onClick={() => props.onChange(props.value === n ? null : n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function IconTile(props: { icon: string; color: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={cx('icon-tile', props.size)} style={{ '--tile': colorValue(props.color) } as CSSProperties} aria-hidden>
      {props.icon}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function PendingBadge({ label }: { label?: string }) {
  return <span className="pending-badge">{label ?? t('common.pending')}</span>;
}
