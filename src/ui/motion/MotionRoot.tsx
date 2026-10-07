import type { ReactNode } from 'react';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { usePrefs } from '@/data/store';
import { LiquidPointer } from './LiquidPointer';
import { SPRING } from './springs';

/** Configuración de movimiento para toda la app (respeta "reducir movimiento"). */
export function MotionRoot({ children }: { children: ReactNode }) {
  const pref = usePrefs().reducedMotion;
  const system = useReducedMotion();
  const reduce = pref === 'on' || (pref === 'system' && !!system);
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'} transition={SPRING.smooth}>
      <LiquidPointer />
      {children}
    </MotionConfig>
  );
}
