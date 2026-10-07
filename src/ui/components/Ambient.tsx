import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { usePrefs } from '@/data/store';

/**
 * Aurora: manchas de luz del color del tema que derivan muy despacio detrás del vidrio y se
 * desplazan un poco hacia el cursor (paralaje con muelle). Es lo que el vidrio "refracta".
 */
export function Aurora() {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 40, damping: 20, mass: 1.4 });
  const y = useSpring(py, { stiffness: 40, damping: 20, mass: 1.4 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (document.documentElement.hasAttribute('data-reduced-motion')) return;
      px.set((e.clientX / window.innerWidth - 0.5) * -46);
      py.set((e.clientY / window.innerHeight - 0.5) * -36);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [px, py]);
  return (
    <div className="aurora" aria-hidden>
      <motion.div className="aurora-layer" style={{ x, y }}>
        <i className="aurora-blob b1" />
        <i className="aurora-blob b2" />
        <i className="aurora-blob b3" />
        <i className="aurora-blob b4" />
      </motion.div>
    </div>
  );
}

/**
 * Fondo vivo muy sutil: chispas que ascienden despacio. Se detiene con movimiento reducido,
 * con la ventana oculta o si el usuario lo desactiva. En Focus se calma aún más.
 */
export function AmbientBackground({ calm }: { calm: boolean }) {
  const prefs = usePrefs();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const enabled = prefs.ambient && prefs.theme !== 'minimal';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const reduced = () => document.documentElement.hasAttribute('data-reduced-motion');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const count = Math.round(Math.min(46, (w * h) / 32000));
    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.6,
      vy: 0.06 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      a: 0.06 + Math.random() * 0.32,
    }));
    const rgb = () => getComputedStyle(document.documentElement).getPropertyValue('--particle').trim() || '255,120,80';
    let color = rgb();
    const themeObserver = new MutationObserver(() => (color = rgb()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    let raf = 0;
    let last = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || reduced()) return;
      if (ts - last < 33) return; // ~30 fps es suficiente para un fondo
      const dt = Math.min(3, (ts - last) / 16.7);
      last = ts;
      const speed = calmRef.current ? 0.35 : 1;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.vy * dt * speed;
        p.phase += 0.008 * dt * speed;
        const x = p.x + Math.sin(p.phase) * 14;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        const fade = Math.min(1, p.y / (h * 0.25)) * (calmRef.current ? 0.5 : 1);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${color}, ${p.a * fade})`;
        ctx.shadowColor = `rgba(${color}, ${p.a * fade})`;
        ctx.shadowBlur = 6;
        ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      themeObserver.disconnect();
    };
  }, [enabled]);

  return (
    <>
      {prefs.ambient && <Aurora />}
      <div className="ambient" aria-hidden>{enabled && <canvas ref={canvasRef} />}</div>
    </>
  );
}
