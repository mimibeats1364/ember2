/**
 * Aprendizaje de estimaciones: compara lo estimado con lo registrado en tareas parecidas.
 * Solo sugiere ("Tu media reciente en tareas similares es ~50 min"); nunca cambia nada solo.
 */
import { normalizeText } from './nlp';
import type { ID, Task } from './types';

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'en', 'para', 'con', 'un', 'una', 'por', 'al', 'mi', 'mis',
  'the', 'a', 'an', 'and', 'of', 'to', 'for', 'in', 'on', 'my', 'with',
]);

export function titleTokens(title: string): string[] {
  return normalizeText(title)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface EstimateHint {
  averageMin: number;
  samples: number;
}

/**
 * @param trackedMin minutos reales registrados por tarea (focus + temporizador)
 */
export function estimateHint(task: Pick<Task, 'id' | 'title' | 'projectId' | 'durationMin'>, done: Task[], trackedMin: (id: ID) => number): EstimateHint | null {
  const tokens = titleTokens(task.title);
  const similar = done
    .filter((t) => t.id !== task.id && t.status === 'done' && !t.deletedAt)
    .map((t) => ({ t, actual: trackedMin(t.id), sim: jaccard(tokens, titleTokens(t.title)) + (task.projectId && t.projectId === task.projectId ? 0.15 : 0) }))
    .filter((x) => x.actual >= 5 && x.sim >= 0.5)
    .sort((a, b) => (b.t.completedAt ?? '').localeCompare(a.t.completedAt ?? ''))
    .slice(0, 8);
  if (similar.length < 3) return null;
  const averageMin = Math.round(similar.reduce((a, x) => a + x.actual, 0) / similar.length / 5) * 5;
  if (task.durationMin && Math.abs(averageMin - task.durationMin) / task.durationMin < 0.2) return null;
  return { averageMin, samples: similar.length };
}
