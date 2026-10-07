/**
 * Muelles compartidos. Un único lenguaje de movimiento en toda la app:
 * - snappy: respuesta inmediata (controles, pulsaciones).
 * - smooth: sin rebote (paneles, páginas).
 * - liquid: pequeño rebote "de gota" (indicadores, capas que aparecen).
 */
import type { Transition } from 'motion/react';

export const SPRING = {
  snappy: { type: 'spring', stiffness: 520, damping: 36, mass: 0.9 },
  smooth: { type: 'spring', stiffness: 300, damping: 36 },
  liquid: { type: 'spring', stiffness: 380, damping: 24, mass: 0.9 },
  /** Borde que va delante en la pista líquida. */
  lead: { type: 'spring', stiffness: 640, damping: 38, mass: 0.8 },
  /** Borde que va detrás: más blando, por eso la gota se estira. */
  trail: { type: 'spring', stiffness: 230, damping: 25, mass: 1 },
} satisfies Record<string, Transition>;

export function prefersReducedMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-reduced-motion');
}
