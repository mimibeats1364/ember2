/**
 * Interacción "de vidrio" global con un único listener (delegación de eventos):
 * - Reflejo y borde de luz que siguen al cursor en tarjetas y capas (`--mx`, `--my`, `--lit`).
 * - Inclinación 3D suave en elementos `.tilt` (`--rx`, `--ry`).
 * - Efecto imán en `.magnetic` (`--tx`, `--ty`).
 * - Ondas de agua al pulsar botones, chips y elementos de navegación.
 * Todo se calcula como mucho una vez por fotograma y se apaga con movimiento reducido.
 */
import { useEffect } from 'react';

const LIT_SELECTOR = '.card, .modal, .lg-rim';
const RIPPLE_SELECTOR = '.btn, .chip, .sound-tile, .sheet-tile, .fab, .nav-item, .seg-item, .lg-ripple';

function reduced(): boolean {
  return document.documentElement.hasAttribute('data-reduced-motion');
}

export function LiquidPointer() {
  useEffect(() => {
    let raf = 0;
    let last: PointerEvent | null = null;
    let lit = new Set<HTMLElement>();
    let tiltEl: HTMLElement | null = null;
    let magEl: HTMLElement | null = null;

    const resetTilt = () => {
      if (!tiltEl) return;
      tiltEl.style.setProperty('--rx', '0deg');
      tiltEl.style.setProperty('--ry', '0deg');
      tiltEl = null;
    };
    const resetMag = () => {
      if (!magEl) return;
      magEl.style.setProperty('--tx', '0px');
      magEl.style.setProperty('--ty', '0px');
      magEl = null;
    };
    const clearLit = () => {
      for (const el of lit) el.style.setProperty('--lit', '0');
      lit = new Set();
    };

    const frame = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      // Borde de luz y reflejo: la tarjeta bajo el cursor y hasta dos contenedores de vidrio.
      const next = new Set<HTMLElement>();
      let el = target.closest<HTMLElement>(LIT_SELECTOR);
      for (let depth = 0; el && depth < 3; depth++) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
        if (!lit.has(el)) el.style.setProperty('--lit', '1');
        next.add(el);
        el = el.parentElement?.closest<HTMLElement>(LIT_SELECTOR) ?? null;
      }
      for (const old of lit) if (!next.has(old)) old.style.setProperty('--lit', '0');
      lit = next;

      if (reduced()) return;

      const tilt = target.closest<HTMLElement>('.tilt');
      if (tilt !== tiltEl) resetTilt();
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const max = Number(tilt.dataset.tilt ?? 4);
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty('--rx', `${(-ny * max).toFixed(2)}deg`);
        tilt.style.setProperty('--ry', `${(nx * max).toFixed(2)}deg`);
        tiltEl = tilt;
      }

      const mag = target.closest<HTMLElement>('.magnetic');
      if (mag !== magEl) resetMag();
      if (mag) {
        const r = mag.getBoundingClientRect();
        const pull = Number(mag.dataset.pull ?? 10);
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        mag.style.setProperty('--tx', `${(nx * pull).toFixed(1)}px`);
        mag.style.setProperty('--ty', `${(ny * pull * 0.8).toFixed(1)}px`);
        magEl = mag;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      last = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onLeave = () => {
      last = null;
      clearLit();
      resetTilt();
      resetMag();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || reduced()) return;
      const host = (e.target as Element | null)?.closest?.<HTMLElement>(RIPPLE_SELECTOR);
      if (!host || host.hasAttribute('disabled')) return;
      const r = host.getBoundingClientRect();
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.left = `${e.clientX - r.left}px`;
      span.style.top = `${e.clientY - r.top}px`;
      // La onda cubre el elemento entero desde el punto de contacto.
      span.style.setProperty('--rs', String(Math.ceil((Math.hypot(r.width, r.height) * 2) / 12)));
      host.appendChild(span);
      setTimeout(() => span.remove(), 720);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);
  return null;
}
