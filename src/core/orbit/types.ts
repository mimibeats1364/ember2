/**
 * Orbit · cambios propuestos. Ninguna habilidad de Orbit escribe datos: devuelve una lista de
 * cambios que la app enseña, el usuario puede desmarcar uno a uno y se aplican juntos en una
 * sola operación deshacible.
 */
import type { HabitFrequency, ID, LocalDate, LocalTime, Priority, Recurrence } from '../types';

export type ProposedChange =
  | { kind: 'schedule_task'; taskId: ID; title: string; date: LocalDate; time: LocalTime; durationMin: number }
  | { kind: 'reschedule_task'; taskId: ID; title: string; from: LocalDate | null; date: LocalDate | null; durationMin: number | null }
  | { kind: 'create_project'; ref: string; name: string; deadline: LocalDate | null }
  | {
      kind: 'create_task';
      title: string;
      date?: LocalDate | null;
      time?: LocalTime | null;
      durationMin?: number | null;
      deadline?: LocalDate | null;
      priority?: Priority | null;
      projectId?: ID | null;
      /** Proyecto creado en esta misma propuesta (`create_project.ref`). */
      projectRef?: string;
      tags?: string[];
      recurrence?: Recurrence | null;
    }
  | { kind: 'create_habit'; name: string; preferredTime?: LocalTime | null; frequency?: HabitFrequency; durationMin?: number | null };

export type ChangeKind = ProposedChange['kind'];
