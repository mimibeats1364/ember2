/**
 * Plantillas de rutina. Son solo un punto de partida: se copian y se editan libremente.
 */
import type { Routine } from '@core/types';
import { t, type TKey } from '@/i18n';
import { newRoutineStep } from '@/data/actions';

export interface RoutineTemplate {
  id: string;
  icon: string;
  color: string;
  timeOfDay: Routine['timeOfDay'];
  steps: [TKey, number | null][];
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'morning',
    icon: '☀️',
    color: 'amber',
    timeOfDay: 'morning',
    steps: [
      ['routines.tpl.morning.water', 1],
      ['routines.tpl.morning.stretch', 5],
      ['routines.tpl.morning.bed', 2],
      ['routines.tpl.morning.shower', 10],
      ['routines.tpl.morning.plan', 5],
    ],
  },
  {
    id: 'workStart',
    icon: '💻',
    color: 'indigo',
    timeOfDay: 'work',
    steps: [
      ['routines.tpl.workStart.desk', 2],
      ['routines.tpl.workStart.inbox', 5],
      ['routines.tpl.workStart.top3', 5],
      ['routines.tpl.workStart.block', 3],
      ['routines.tpl.workStart.silence', 1],
    ],
  },
  {
    id: 'shutdown',
    icon: '🌇',
    color: 'orange',
    timeOfDay: 'work',
    steps: [
      ['routines.tpl.shutdown.review', 3],
      ['routines.tpl.shutdown.move', 5],
      ['routines.tpl.shutdown.note', 3],
      ['routines.tpl.shutdown.close', 2],
    ],
  },
  {
    id: 'night',
    icon: '🌙',
    color: 'violet',
    timeOfDay: 'night',
    steps: [
      ['routines.tpl.night.clothes', 5],
      ['routines.tpl.night.screens', null],
      ['routines.tpl.night.read', 20],
      ['routines.tpl.night.journal', 5],
      ['routines.tpl.night.breathe', 3],
    ],
  },
  {
    id: 'study',
    icon: '📚',
    color: 'cyan',
    timeOfDay: 'study',
    steps: [
      ['routines.tpl.study.materials', 3],
      ['routines.tpl.study.goal', 2],
      ['routines.tpl.study.block', 45],
      ['routines.tpl.study.recall', 10],
    ],
  },
];

export function templateFields(tpl: RoutineTemplate): Partial<Routine> {
  return {
    name: t(`routines.tpl.${tpl.id}.name` as TKey),
    icon: tpl.icon,
    color: tpl.color,
    timeOfDay: tpl.timeOfDay,
    steps: tpl.steps.map(([key, min]) => newRoutineStep(t(key), min)),
  };
}
