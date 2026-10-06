/**
 * Capa de IA (Orbit), independiente del proveedor.
 *
 * ESTADO: interfaz definida, sin implementación conectada. La app NO muestra funciones de IA
 * hasta que exista un proxy seguro (las claves nunca viajan en el cliente). Las funciones
 * "inteligentes" actuales (planificar el día, buscar hueco, entrada natural, resumen semanal)
 * son locales y deterministas, y no dependen de esta capa.
 *
 * Principios de diseño:
 * - El cliente habla con NUESTRO backend (`/ai/*`), nunca directamente con un proveedor.
 * - Toda propuesta que modifique datos vuelve como `ProposedChange[]` y requiere confirmación.
 * - Solo se envía el contexto mínimo necesario; nada se usa para entrenar sin consentimiento.
 */
import type { CalendarEvent, Habit, LocalDate, Task } from '../types';

export interface AiContext {
  today: LocalDate;
  tasks: Pick<Task, 'id' | 'title' | 'priority' | 'date' | 'deadline' | 'durationMin' | 'status'>[];
  events: Pick<CalendarEvent, 'id' | 'title' | 'start' | 'end' | 'category'>[];
  habits: Pick<Habit, 'id' | 'name' | 'preferredTime' | 'durationMin'>[];
}

export type ProposedChange =
  | { kind: 'schedule_task'; taskId: string; date: LocalDate; time: string; durationMin: number }
  | { kind: 'create_task'; title: string; date?: LocalDate; durationMin?: number; projectId?: string }
  | { kind: 'create_habit'; name: string; preferredTime?: string }
  | { kind: 'split_project'; projectId: string; phases: string[] };

export interface AiProposal {
  summary: string;
  changes: ProposedChange[];
}

export interface AIService {
  readonly provider: string;
  available(): Promise<boolean>;
  planDay(ctx: AiContext, instruction: string): Promise<AiProposal>;
  breakDownProject(name: string, description: string): Promise<AiProposal>;
  summarizeWeek(facts: string): Promise<string>;
  notesToTasks(noteBody: string): Promise<AiProposal>;
}

/** Proveedor por defecto: honesto, no simula nada. */
export class NotConfiguredAI implements AIService {
  readonly provider = 'none';
  async available() {
    return false;
  }
  private fail(): never {
    throw new Error('ai_not_configured');
  }
  async planDay(): Promise<AiProposal> {
    return this.fail();
  }
  async breakDownProject(): Promise<AiProposal> {
    return this.fail();
  }
  async summarizeWeek(): Promise<string> {
    return this.fail();
  }
  async notesToTasks(): Promise<AiProposal> {
    return this.fail();
  }
}
