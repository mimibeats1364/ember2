import { describe, expect, it } from 'vitest';
import { localDateTime } from '../dates';
import type { Interval } from '../scheduler';
import type { PeriodSummary } from '../analytics';
import type { Project, Task } from '../types';
import { extractActions, splitActions, startsWithVerb } from './extract';
import { emptyConstraints, parseConstraints, parseOrbit } from './intent';
import { breakDownProject, lightenDay, nameScore, planWithConstraints, summarizeWeek, whatNow } from './skills';

const TODAY = '2026-10-07'; // miércoles
const prefs = { sleep: { bed: '23:00', wake: '07:00' }, bufferMin: 10, focusPeak: 'morning' as const };
const at = (date: string, time: string) => localDateTime(date, time).getTime();
const block = (date: string, from: string, to: string): Interval => ({ start: at(date, from), end: at(date, to) });
const hm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

let seq = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${++seq}`, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '', deletedAt: null, title: 'T', notes: '', status: 'todo',
  inbox: false, priority: 4, date: TODAY, time: null, durationMin: 60, deadline: null, projectId: null, areaId: null,
  goalId: null, parentId: null, tagIds: [], checklist: [], dependsOn: [], recurrence: null, seriesId: null, reminders: [],
  links: [], quadrant: null, delegatedTo: '', order: 0, completedAt: null, ...over,
});
const project = (over: Partial<Project>): Project => ({
  id: `p${++seq}`, createdAt: '', updatedAt: '', deletedAt: null, name: 'P', icon: '', color: 'ember', description: '', areaId: null, goalId: null,
  startDate: null, deadline: null, status: 'active', view: 'list', order: 0, completedAt: null, ...over,
});

describe('Orbit entiende lo que le pides', () => {
  const p = (s: string) => parseOrbit(s, { today: TODAY, name: 'Orbit' });

  it('planificar con restricciones en lenguaje natural', () => {
    const i = p('Orbit, planifica mi día: nada después de las 20, prioriza marketing y con descansos de 15 min');
    expect(i.type).toBe('plan');
    if (i.type !== 'plan') return;
    expect(i.date).toBe(TODAY);
    expect(i.constraints.end).toBe('20:00');
    expect(i.constraints.focus).toEqual(['marketing']);
    expect(i.constraints.breakMin).toBe(15);
  });

  it('fecha, inicio, tope y estrategia', () => {
    const i = p('organiza mañana empezando a las 10, solo tengo 3 horas, primero lo difícil');
    expect(i).toMatchObject({ type: 'plan', date: '2026-10-08', constraints: { start: '10:00', budgetMin: 180, strategy: 'deep_first' } });
    expect(parseConstraints('hasta las 6 de la tarde, día tranquilo')).toMatchObject({ end: '18:00', light: true });
    expect(parseConstraints('victorias rápidas').strategy).toBe('quick_wins');
    expect(parseConstraints('tengo hora y media').budgetMin).toBe(90);
  });

  it('aligerar, resumir, estado y qué hago ahora', () => {
    expect(p('estoy saturado').type).toBe('lighten');
    expect(p('aligera mi día de mañana')).toEqual({ type: 'lighten', date: '2026-10-08' });
    expect(p('resume mi semana')).toEqual({ type: 'week', offset: 0 });
    expect(p('¿cómo fue la semana pasada?')).toEqual({ type: 'week', offset: -1 });
    expect(p('¿cómo voy con el EP?')).toEqual({ type: 'status', query: 'ep' });
    expect(p('¿qué hago ahora?').type).toBe('whatNow');
    expect(p('hola').type).toBe('help');
  });

  it('desglosar proyectos con fecha', () => {
    expect(p('desglosa la mudanza para el 30 de noviembre')).toEqual({ type: 'breakdown', subject: 'Mudanza', deadline: '2026-11-30' });
    expect(p('organiza el viaje a Japón')).toMatchObject({ type: 'breakdown', subject: 'Viaje a Japón' });
  });

  it('notas a tareas y listas', () => {
    expect(p('convierte la nota Ideas para Ceniza en tareas')).toEqual({ type: 'noteTasks', query: 'ideas para ceniza' });
    expect(p('tengo que llamar al banco, comprar pan mañana y enviar el informe').type).toBe('dump');
    expect(p('- llamar al banco\n- pagar el gimnasio').type).toBe('dump');
  });

  it('lo demás lo resuelve la paleta de comandos', () => {
    expect(p('empieza focus 50 min')).toMatchObject({ type: 'command', intent: { type: 'focusStart', minutes: 50 } });
    expect(p('¿cómo va mi racha de meditar?')).toMatchObject({ type: 'command', intent: { type: 'streak' } });
    expect(p('xyzzy').type).toBe('unknown');
  });
});

describe('Orbit saca tareas de texto libre', () => {
  it('detecta verbos sin confundir sustantivos', () => {
    expect(startsWithVerb('llamar al banco')).toBe(true);
    expect(startsWithVerb('Envía el informe')).toBe(true);
    expect(startsWithVerb('prepararme la entrevista')).toBe(true);
    expect(startsWithVerb('leche')).toBe(false);
    expect(startsWithVerb('lugar de la cena')).toBe(false);
    expect(startsWithVerb('call mum')).toBe(true);
  });

  it('corta por acciones, no por cada coma', () => {
    expect(splitActions('Tengo que llamar al banco, comprar pan y leche, y enviar el informe')).toEqual(['llamar al banco', 'comprar pan y leche', 'enviar el informe']);
    expect(splitActions('comprar pan, leche y huevos')).toEqual(['comprar pan, leche y huevos']);
    expect(splitActions('call the bank and then email Ana')).toEqual(['call the bank', 'email Ana']);
  });

  it('cada tarea conserva su fecha, duración y prioridad', () => {
    const items = extractActions('recuérdame llamar al banco mañana p1, revisar el contrato 45 min y enviar el informe antes del viernes', { today: TODAY, mode: 'dump' });
    expect(items.map((i) => i.parsed.title)).toEqual(['Llamar al banco', 'Revisar el contrato', 'Enviar el informe']);
    expect(items[0].parsed).toMatchObject({ date: '2026-10-08', priority: 1 });
    expect(items[1].parsed.durationMin).toBe(45);
    expect(items[2].parsed.deadline).toBe('2026-10-09');
  });

  it('en notas prioriza casillas abiertas e ignora lo hecho, títulos y citas', () => {
    const body = '# Reunión\n\nHablamos del presupuesto.\n\n- [x] Enviar acta\n- [ ] Pedir presupuesto a la imprenta\n- [ ] Llamar a Marta el lunes\n\n> Ojo con los plazos';
    const items = extractActions(body, { today: TODAY, mode: 'note' });
    expect(items.map((i) => i.parsed.title)).toEqual(['Pedir presupuesto a la imprenta', 'Llamar a Marta']);
    expect(items[1].parsed.date).toBe('2026-10-12');
  });

  it('sin casillas, en notas solo cuentan las líneas que empiezan por verbo', () => {
    const body = 'Ideas sueltas:\n- Abrir con sintetizador granulado\n- Puente en 6/8\n- grabar guitarra limpia\nTODO: subir maqueta';
    expect(extractActions(body, { today: TODAY, mode: 'note' }).map((i) => i.parsed.title)).toEqual(['Abrir con sintetizador granulado', 'Grabar guitarra limpia', 'Subir maqueta']);
  });
});

describe('Orbit planifica con tus condiciones', () => {
  const busy = [block(TODAY, '11:00', '15:00')];
  const now = new Date(at(TODAY, '08:00'));

  it('respeta "nada después de las X" y "empieza a las Y"', () => {
    const tasks = [task({ title: 'A', durationMin: 120 }), task({ title: 'B', durationMin: 60 }), task({ title: 'C', durationMin: 90 })];
    const c = { ...emptyConstraints(), start: '09:00', end: '17:00' };
    const plan = planWithConstraints({ date: TODAY, now, tasks, busy, prefs, constraints: c });
    for (const b of plan.blocks) {
      expect(hm(b.start) >= '09:00').toBe(true);
      expect(hm(b.end) <= '17:00').toBe(true);
    }
    expect(plan.changes.every((ch) => ch.kind === 'schedule_task')).toBe(true);
  });

  it('el tope de horas deja fuera lo menos urgente y explica qué no cabe', () => {
    const tasks = [task({ title: 'Urgente', priority: 1, durationMin: 90 }), task({ title: 'Normal', priority: 3, durationMin: 90 }), task({ title: 'Menor', priority: 4, durationMin: 60 })];
    const plan = planWithConstraints({ date: TODAY, now, tasks, busy, prefs, constraints: { ...emptyConstraints(), budgetMin: 180 } });
    expect(plan.blocks.map((b) => b.title).sort()).toEqual(['Normal', 'Urgente']);
    expect(plan.unplaced.map((t) => t.title)).toEqual(['Menor']);
  });

  it('"prioriza X" mete en el día tareas de ese proyecto aunque no tuvieran fecha', () => {
    const mkt = project({ name: 'Marketing (asignatura)' });
    const tasks = [task({ title: 'Ordenar escritorio', priority: 2, durationMin: 30 }), task({ title: 'Tema 5', projectId: mkt.id, date: null, durationMin: 60 })];
    const plan = planWithConstraints({ date: TODAY, now, tasks, busy, prefs, constraints: { ...emptyConstraints(), focus: ['marketing', 'ajedrez'] }, projectNames: { [mkt.id]: mkt.name } });
    expect(plan.blocks[0].title).toBe('Tema 5');
    expect(plan.matchedFocus).toEqual(['marketing']);
    expect(plan.missedFocus).toEqual(['ajedrez']);
  });
});

describe('Orbit aligera un día imposible', () => {
  it('mueve lo menos urgente a días con hueco y nunca lo prioritario ni lo que vence', () => {
    const now = new Date(at(TODAY, '15:00'));
    const fixedBusyFor = (d: string) => (d === TODAY ? [block(d, '07:00', '18:00')] : [block(d, '09:00', '14:00')]);
    const tasks = [
      task({ title: 'Entrega', priority: 1, durationMin: 120 }),
      task({ title: 'Vence hoy', priority: 3, deadline: TODAY, durationMin: 60 }),
      task({ title: 'Ordenar fotos', priority: 4, durationMin: 90 }),
      task({ title: 'Leer artículo', priority: 3, durationMin: 60 }),
      task({ title: 'Mañana ya', date: '2026-10-08', durationMin: 60 }),
    ];
    const r = lightenDay({ date: TODAY, now, tasks, fixedBusyFor, prefs });
    expect(r.fits).toBe(false);
    expect(r.loadMin).toBe(330);
    const moved = r.changes.map((c) => (c.kind === 'reschedule_task' ? c.title : ''));
    expect(moved).toContain('Ordenar fotos');
    expect(moved).not.toContain('Entrega');
    expect(moved).not.toContain('Vence hoy');
    for (const c of r.changes) if (c.kind === 'reschedule_task') expect(c.date! > TODAY).toBe(true);
  });

  it('si ya cabe, lo dice y no propone nada', () => {
    const r = lightenDay({ date: TODAY, now: new Date(at(TODAY, '08:00')), tasks: [task({ durationMin: 30 })], fixedBusyFor: () => [], prefs });
    expect(r).toMatchObject({ fits: true, changes: [] });
  });
});

describe('Orbit desglosa proyectos', () => {
  it('crea el proyecto y reparte las fases hasta la fecha límite, empezando hoy', () => {
    const r = breakDownProject({ subject: 'mudanza', deadline: '2026-11-07', today: TODAY, lang: 'es', projects: [], tasks: [] });
    expect(r.changes[0]).toMatchObject({ kind: 'create_project', name: 'Mudanza', deadline: '2026-11-07' });
    const tasks = r.changes.filter((c) => c.kind === 'create_task');
    expect(tasks.length).toBeGreaterThan(3);
    expect(tasks[0]).toMatchObject({ date: TODAY });
    expect(tasks[tasks.length - 1]).toMatchObject({ deadline: '2026-11-07' });
    const dues = tasks.map((c) => (c.kind === 'create_task' ? c.deadline! : ''));
    expect([...dues].sort()).toEqual(dues);
  });

  it('en un proyecto existente no repite fases que ya están', () => {
    const ep = project({ name: 'EP "Brasas"' });
    const existing = [task({ title: 'Mezcla', projectId: ep.id }), task({ title: 'Portada', projectId: ep.id })];
    const r = breakDownProject({ subject: 'el EP brasas', deadline: null, today: TODAY, lang: 'es', projects: [ep], tasks: existing });
    expect(r.projectId).toBe(ep.id);
    expect(r.skipped).toEqual(['Mezcla', 'Portada']);
    expect(r.changes.some((c) => c.kind === 'create_project')).toBe(false);
  });

  it('reconoce nombres parecidos', () => {
    expect(nameScore('ep', 'EP "Brasas"')).toBeGreaterThan(0.45);
    expect(nameScore('marketing', 'Marketing (asignatura)')).toBeGreaterThan(0.6);
    expect(nameScore('derecho', 'Marketing (asignatura)')).toBe(0);
  });
});

describe('¿Qué hago ahora?', () => {
  it('elige lo más urgente que cabe en el hueco actual', () => {
    const now = new Date(at(TODAY, '10:00'));
    const busy = [block(TODAY, '11:00', '15:00')];
    const tasks = [task({ title: 'Largo', priority: 1, durationMin: 120 }), task({ title: 'Corto', priority: 2, durationMin: 30 }), task({ title: 'Otro', priority: 4, durationMin: 20 })];
    const r = whatNow({ now, tasks, busy, prefs });
    expect(r.freeMin).toBe(60);
    expect(r.pick?.title).toBe('Corto');
  });
});

describe('Resumen de la semana', () => {
  const summary = (over: Partial<PeriodSummary>): PeriodSummary => ({
    from: '2026-10-05', to: '2026-10-11', tasksCompleted: 0, habitDone: 0, habitScheduled: 0, bestDay: null, topProjects: [], tasksCreated: 0,
    focus: { sessions: 0, totalSec: 0, avgSec: 0, longestSec: 0, interrupted: 0, completed: 0, deepSessions: 0 }, ...over,
  });
  it('describe sin juzgar y sugiere como mucho tres cosas', () => {
    const cur = summary({ tasksCompleted: 9, tasksCreated: 20, habitDone: 6, habitScheduled: 14, focus: { sessions: 6, totalSec: 6 * 3000, avgSec: 3000, longestSec: 3000, interrupted: 3, completed: 3, deepSessions: 6 } });
    const prev = summary({ tasksCompleted: 4, focus: { sessions: 2, totalSec: 3000, avgSec: 1500, longestSec: 1500, interrupted: 0, completed: 2, deepSessions: 0 } });
    const r = summarizeWeek({ cur, prev, peak: { start: 9, end: 12, minutes: 200 }, overdue: 4 });
    expect(r.trend).toBe('up');
    expect(r.notes[0]).toEqual({ kind: 'tasks', count: 9, prev: 4 });
    expect(r.tips.length).toBeLessThanOrEqual(3);
    expect(r.tips[0].kind).toBe('celebrate');
  });
  it('una semana vacía no es un fracaso: propone empezar pequeño', () => {
    const r = summarizeWeek({ cur: summary({}), prev: summary({}), peak: null, overdue: 0 });
    expect(r).toMatchObject({ trend: 'quiet', notes: [{ kind: 'quiet' }], tips: [{ kind: 'restart' }] });
  });
});

describe('LocalOrbit cumple el contrato de AIService', () => {
  it('propone sin escribir nada y está siempre disponible', async () => {
    const { LocalOrbit } = await import('../ai/service');
    const ai = new LocalOrbit();
    expect(await ai.available()).toBe(true);
    const ctx = { today: TODAY, now: new Date(at(TODAY, '08:00')), lang: 'es' as const, tasks: [task({ title: 'Informe', durationMin: 60 })], projects: [], busy: [], prefs };
    const plan = await ai.planDay(ctx, TODAY, 'empieza a las 10');
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ kind: 'schedule_task', time: '10:00' });
    const notes = await ai.notesToTasks(ctx, '- [ ] Llamar a Marta mañana');
    expect(notes.changes[0]).toMatchObject({ kind: 'create_task', title: 'Llamar a Marta', date: '2026-10-08' });
  });
});
