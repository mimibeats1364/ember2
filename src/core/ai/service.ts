/**
 * Capa de IA (Orbit), independiente del proveedor.
 *
 * ESTADO: Orbit funciona HOY en local (`LocalOrbit`, sobre `@core/orbit`): reglas, el
 * planificador y el NLP de Ember, sin red ni modelos. Esta interfaz es el punto de enganche
 * para un proveedor en la nube en el futuro, que tendría que cumplir lo mismo:
 *
 * - El cliente hablaría con NUESTRO backend (`/ai/*`), nunca directamente con un proveedor:
 *   las claves no viajan en el cliente.
 * - Toda propuesta que modifique datos vuelve como `ProposedChange[]` y requiere confirmación.
 * - Solo se envía el contexto mínimo necesario; nada se usa para entrenar sin consentimiento.
 */
import type { PlanStrategy, Interval, SchedulePrefs } from '../scheduler';
import type { LocalDate, Project, Task } from '../types';
import { extractActions } from '../orbit/extract';
import { parseConstraints } from '../orbit/intent';
import { breakDownProject, planWithConstraints, summarizeWeek, type WeekInput, type WeekNote, type WeekTip } from '../orbit/skills';
import type { ProposedChange } from '../orbit/types';

export type { ProposedChange };

export interface AiContext {
  today: LocalDate;
  now: Date;
  lang: 'es' | 'en';
  tasks: Task[];
  projects: Project[];
  /** Ocupado el día que se planifica. */
  busy: Interval[];
  prefs: SchedulePrefs;
}

export interface AiProposal {
  changes: ProposedChange[];
  /** Lo que no se pudo encajar o se dejó fuera, para explicarlo. */
  leftOut: string[];
}

export interface AIService {
  readonly provider: string;
  available(): Promise<boolean>;
  planDay(ctx: AiContext, date: LocalDate, instruction: string, strategy?: PlanStrategy): Promise<AiProposal>;
  breakDownProject(ctx: AiContext, name: string, deadline: LocalDate | null): Promise<AiProposal>;
  summarizeWeek(input: WeekInput): Promise<{ notes: WeekNote[]; tips: WeekTip[] }>;
  notesToTasks(ctx: AiContext, noteBody: string): Promise<AiProposal>;
}

/** Orbit local: determinista, explicable y sin conexión. */
export class LocalOrbit implements AIService {
  readonly provider = 'local';
  async available() {
    return true;
  }
  async planDay(ctx: AiContext, date: LocalDate, instruction: string, strategy?: PlanStrategy): Promise<AiProposal> {
    const constraints = parseConstraints(instruction);
    const plan = planWithConstraints({ date, now: ctx.now, tasks: ctx.tasks, busy: ctx.busy, prefs: ctx.prefs, constraints: { ...constraints, strategy: constraints.strategy ?? strategy ?? null } });
    return { changes: plan.changes, leftOut: plan.unplaced.map((t) => t.title) };
  }
  async breakDownProject(ctx: AiContext, name: string, deadline: LocalDate | null): Promise<AiProposal> {
    const r = breakDownProject({ subject: name, deadline, today: ctx.today, lang: ctx.lang, projects: ctx.projects, tasks: ctx.tasks });
    return { changes: r.changes, leftOut: r.skipped };
  }
  async summarizeWeek(input: WeekInput) {
    const { notes, tips } = summarizeWeek(input);
    return { notes, tips };
  }
  async notesToTasks(ctx: AiContext, noteBody: string): Promise<AiProposal> {
    const items = extractActions(noteBody, { today: ctx.today, mode: 'note', projects: ctx.projects.map((p) => p.name) });
    return {
      changes: items.map(({ parsed }) => ({ kind: 'create_task' as const, title: parsed.title, date: parsed.date, time: parsed.time, durationMin: parsed.durationMin, deadline: parsed.deadline, priority: parsed.priority })),
      leftOut: [],
    };
  }
}
