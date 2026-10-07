/**
 * QA de producto (integración): flujos reales sobre el store + acciones, con almacenamiento
 * en memoria. Cubre la lista de pruebas del encargo (crear/completar/reprogramar tarea,
 * hábitos, proyectos, objetivos, focus, eventos, búsqueda, filtros, deshacer, export/import).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, instantOf, today as todayFn } from '@core/dates';
import { computeStreak, indexLogs, habitLogId } from '@core/habits';
import { parseInput } from '@core/nlp';
import { SearchIndex } from '@core/search';
import { applyFilter, inView } from '@core/tasks';
import { goalProgress, projectHealth } from '@core/progress';
import { createBackup, parseBackup, planMerge } from '@core/io/backup';
import { deepWorkConfig, startFocus, stop } from '@core/focus';
import { initData, useData, createEntity, getEntity, undo, importEntities } from './store';
import {
  createRoutine,
  newRoutineStep,
  rescheduleMany,
  setRoutineStep,
  captureParsed,
  completeTask,
  createEvent,
  createHabit,
  createTask,
  moveEvent,
  rescheduleTask,
  saveFocusSession,
  setHabitLog,
  toggleHabit,
  applyPlan,
} from './actions';
import { goalFields, projectFields } from './defaults';
import type { Task } from '@core/types';
import { proposeDay } from './schedule';
import { parkThought, startFocusSession, useFocus } from '@/app/focusStore';
import { pomodoroConfig } from '@core/focus';
import { routineRunId } from './defaults';

const today = todayFn();

beforeAll(async () => {
  await initData();
});

describe('QA de producto', () => {
  it('crear, completar y reprogramar tareas', () => {
    const t1 = createTask({ title: 'Estudiar marketing', date: today, durationMin: 60, priority: 1 });
    expect(inView('my_day', getEntity('tasks', t1.id)!, today)).toBe(true);
    rescheduleTask(t1.id, addDays(today, 1));
    expect(getEntity('tasks', t1.id)!.date).toBe(addDays(today, 1));
    completeTask(t1.id);
    expect(getEntity('tasks', t1.id)!.status).toBe('done');
    expect(getEntity('tasks', t1.id)!.completedAt).toBeTruthy();
  });

  it('una tarea recurrente genera la siguiente al completarse y deshacer lo revierte todo', () => {
    const r = createTask({ title: 'Sacar la basura', date: today, recurrence: { freq: 'daily', interval: 1 } });
    const next = completeTask(r.id)!;
    expect(next.date).toBe(addDays(today, 1));
    expect(next.recurrence).toEqual({ freq: 'daily', interval: 1 });
    expect(getEntity('tasks', r.id)!.recurrence).toBeNull();
    undo();
    expect(getEntity('tasks', r.id)!.status).toBe('todo');
    expect(getEntity('tasks', next.id)!.deletedAt).toBeTruthy();
  });

  it('captura inteligente: tarea a la bandeja, hábito y evento', () => {
    const inbox = captureParsed(parseInput('Comprar zapatillas', { today }), 'task', 'Comprar zapatillas');
    expect('id' in inbox && getEntity('tasks', inbox.id)!.inbox).toBe(true);
    const habit = captureParsed(parseInput('Gimnasio lunes, miércoles y viernes a las 18:00', { today }), 'habit', '');
    expect('id' in habit && getEntity('habits', habit.id)!.frequency).toEqual({ kind: 'weekdays', days: [1, 3, 5] });
    const ev = captureParsed(parseInput('Reunión con Ana mañana a las 10', { today }), 'event', '');
    expect('id' in ev && getEntity('events', ev.id)!.title).toBe('Reunión con Ana');
    expect(captureParsed(parseInput('Reunión sin hora', { today }), 'event', '')).toEqual({ error: 'needsTime' });
  });

  it('crear y completar hábitos; la racha no se rompe por saltar', () => {
    const h = createHabit({ name: 'Leer', startDate: addDays(today, -3), graceDays: 0 });
    setHabitLog(h.id, addDays(today, -3), 'done');
    setHabitLog(h.id, addDays(today, -2), 'skipped');
    setHabitLog(h.id, addDays(today, -1), 'done');
    expect(toggleHabit(h.id, today)).toBe('done');
    const logs = Object.values(useData.getState().c.habitLogs).filter((l) => l.habitId === h.id);
    expect(computeStreak(getEntity('habits', h.id)!, indexLogs(logs), today, []).current).toBe(3);
    expect(toggleHabit(h.id, today)).toBe('cleared');
    expect(getEntity('habitLogs', habitLogId(h.id, today))!.deletedAt).toBeTruthy();
  });

  it('proyecto y objetivo con progreso y salud', () => {
    const goal = createEntity('goals', goalFields({ title: 'Publicar EP', progressMode: 'tasks' }));
    const project = createEntity('projects', projectFields({ name: 'EP', goalId: goal.id, deadline: addDays(today, 30) }));
    const a = createTask({ title: 'Mezcla', projectId: project.id });
    createTask({ title: 'Máster', projectId: project.id });
    completeTask(a.id);
    const c = useData.getState().c;
    const gp = goalProgress(goal, { milestones: [], tasks: Object.values(c.tasks), projects: Object.values(c.projects), sessions: [], entries: [] }, today);
    expect(gp.ratio).toBe(0.5);
    expect(projectHealth(getEntity('projects', project.id)!, Object.values(c.tasks), today).remaining).toBe(1);
  });

  it('focus: iniciar, detener y guardar la sesión en la tarea', () => {
    const task = createTask({ title: 'Deep work', date: today });
    const s = startFocus(deepWorkConfig(60), 0, task.id, task.title);
    const sum = stop(s, 20 * 60_000);
    saveFocusSession({ taskId: task.id, label: task.title, mode: 'deep', plannedMin: sum.plannedMin, startedAt: Date.now() - 20 * 60_000, endedAt: Date.now(), focusSec: sum.focusSec, completed: sum.completed, interrupted: sum.interrupted, note: 'mensaje' });
    const saved = Object.values(useData.getState().c.focusSessions).find((x) => x.taskId === task.id)!;
    expect(saved).toMatchObject({ focusSec: 1200, interrupted: true, interruptionNote: 'mensaje' });
  });

  it('crear y mover eventos (una ocurrencia de una serie)', () => {
    const ev = createEvent({ title: 'Clase', start: instantOf(today, '11:00'), end: instantOf(today, '13:00'), recurrence: { freq: 'daily', interval: 1 } });
    const occ = addDays(today, 1);
    moveEvent(ev.id, occ, new Date(instantOf(occ, '15:00')), new Date(instantOf(occ, '17:00')), true);
    expect(getEntity('events', ev.id)!.exdates).toContain(occ);
    const detached = Object.values(useData.getState().c.events).find((e) => e.title === 'Clase' && !e.recurrence && e.id !== ev.id)!;
    expect(new Date(detached.start).getHours()).toBe(15);
  });

  it('planificar el día y aplicar el plan', () => {
    const x = createTask({ title: 'Tarea para planificar', date: addDays(today, 2), durationMin: 45, priority: 1 });
    const plan = proposeDay(addDays(today, 2), 'balanced', new Date(instantOf(today, '06:00')));
    expect(plan.blocks.some((b) => b.taskId === x.id)).toBe(true);
    applyPlan(plan.blocks.filter((b) => b.taskId === x.id));
    expect(getEntity('tasks', x.id)!.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it('buscar y filtrar', () => {
    const tasks = Object.values(useData.getState().c.tasks).filter((x) => !x.deletedAt);
    const idx = new SearchIndex(tasks.map((x) => ({ type: 'task' as const, id: x.id, title: x.title })));
    expect(idx.search('marketing')[0].doc.title).toBe('Estudiar marketing');
    expect(applyFilter(tasks, { priorities: [1] }).every((x) => x.priority === 1)).toBe(true);
  });

  it('exportar e importar (ida y vuelta) sin perder ni duplicar', () => {
    const before = useData.getState().c;
    const backup = parseBackup(JSON.stringify(createBackup(before, 'test')));
    const plan = planMerge(before, backup);
    expect(plan.added).toBe(0);
    expect(plan.updated).toBe(0);
    const newer = { ...backup, data: { ...backup.data, tasks: (backup.data.tasks as Task[]).map((x) => ({ ...x, title: x.title + ' (copia)', updatedAt: 'zzzz' })) } };
    const plan2 = planMerge(before, newer);
    expect(plan2.updated).toBe(backup.data.tasks!.length);
    importEntities(plan2.upserts);
    expect(Object.values(useData.getState().c.tasks).every((x) => x.title.endsWith('(copia)'))).toBe(true);
  });

  it('rutinas: un paso vinculado registra el hábito; completar todo marca la rutina; desmarcar no borra el hábito', () => {
    const habit = createHabit({ name: 'Meditar', startDate: today });
    const r = createRoutine({ name: 'Mañana', steps: [newRoutineStep('Agua', 1), newRoutineStep('Meditar', 10, habit.id)] });
    const [s1, s2] = r.steps;
    expect(setRoutineStep(r.id, today, s2.id, true)).toEqual({ habitLogged: 'Meditar', completed: false });
    expect(getEntity('habitLogs', `${habit.id}_${today}`)?.status).toBe('done');
    const res = setRoutineStep(r.id, today, s1.id, true);
    expect(res.completed).toBe(true);
    expect(getEntity('routineRuns', routineRunId(r.id, today))?.completedAt).toBeTruthy();
    setRoutineStep(r.id, today, s2.id, false);
    expect(getEntity('routineRuns', routineRunId(r.id, today))?.completedAt).toBeNull();
    expect(getEntity('habitLogs', `${habit.id}_${today}`)?.status).toBe('done');
  });

  it('mover varias tareas atrasadas se deshace de una vez', () => {
    const a = createTask({ title: 'Atrasada A', date: addDays(today, -3) });
    const b = createTask({ title: 'Atrasada B', date: addDays(today, -1) });
    expect(rescheduleMany([a.id, b.id], addDays(today, 1))).toBe(2);
    expect(getEntity('tasks', a.id)!.date).toBe(addDays(today, 1));
    undo();
    expect(getEntity('tasks', a.id)!.date).toBe(addDays(today, -3));
    expect(getEntity('tasks', b.id)!.date).toBe(addDays(today, -1));
  });

  it('focus: aparcar distracciones y no perder la sesión anterior al empezar otra', () => {
    const before = Object.keys(useData.getState().c.focusSessions).length;
    startFocusSession(pomodoroConfig(25, 5, 15, 4, true), null, 'Primera', 'none', 0);
    expect(parkThought('Contestar a Marta')).toBe(true);
    expect(Object.values(useData.getState().c.tasks).some((x) => x.title === 'Contestar a Marta' && x.inbox)).toBe(true);
    expect(useFocus.getState().parked).toEqual(['Contestar a Marta']);
    // Simula 40 s de sesión y empieza otra: la primera se guarda.
    const st = useFocus.getState().state!;
    useFocus.setState({ state: { ...st, phaseStartedAt: st.phaseStartedAt - 40_000, sessionStartedAt: st.sessionStartedAt - 40_000 } });
    startFocusSession(pomodoroConfig(25, 5, 15, 4, true), null, 'Segunda', 'none', 0);
    const sessions = Object.values(useData.getState().c.focusSessions);
    expect(sessions.length).toBe(before + 1);
    expect(sessions.some((x) => x.label === 'Primera')).toBe(true);
  });

  it('sin conexión: todo funciona con almacenamiento local (no hay dependencias de red)', () => {
    expect(useData.getState().ready).toBe(true);
    expect(['memory', 'indexeddb', 'sqlite']).toContain(useData.getState().storageKind);
  });
});
