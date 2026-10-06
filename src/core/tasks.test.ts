import { describe, expect, it } from 'vitest';
import { inView, isOverdue, nextRecurringFields, quadrantOf } from './tasks';
import { goalProgress, projectHealth } from './progress';
import { SearchIndex } from './search';
import { estimateHint } from './estimation';
import type { Goal, Project, Task } from './types';

const today = '2026-10-06';
const task = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '', deletedAt: null, title: 'T',
  notes: '', status: 'todo', inbox: false, priority: 4, date: null, time: null, durationMin: null, deadline: null, projectId: null,
  areaId: null, goalId: null, parentId: null, tagIds: [], checklist: [], dependsOn: [], recurrence: null, seriesId: null,
  reminders: [], links: [], quadrant: null, delegatedTo: '', order: 0, completedAt: null, ...over,
});

describe('tareas', () => {
  it('lo atrasado nunca se esconde', () => {
    const t = task({ date: '2026-10-01' });
    expect(isOverdue(t, today)).toBe(true);
    expect(inView('my_day', t, today)).toBe(true);
    expect(inView('overdue', t, today)).toBe(true);
    expect(isOverdue(task({ date: '2026-10-01', status: 'done' }), today)).toBe(false);
  });

  it('vistas inteligentes', () => {
    expect(inView('inbox', task({ inbox: true }), today)).toBe(true);
    expect(inView('next7', task({ date: '2026-10-12' }), today)).toBe(true);
    expect(inView('next7', task({ date: '2026-10-13' }), today)).toBe(false);
    expect(inView('upcoming', task({ date: '2026-12-01' }), today)).toBe(true);
    expect(inView('someday', task({}), today)).toBe(true);
    expect(inView('completed', task({ status: 'done' }), today)).toBe(true);
  });

  it('matriz de Eisenhower: sugiere pero respeta la elección del usuario', () => {
    expect(quadrantOf(task({ priority: 1, deadline: '2026-10-07' }), today)).toBe('do');
    expect(quadrantOf(task({ priority: 2 }), today)).toBe('schedule');
    expect(quadrantOf(task({ priority: 4, deadline: '2026-10-06' }), today)).toBe('delegate');
    expect(quadrantOf(task({ priority: 4 }), today)).toBe('delete');
    expect(quadrantOf(task({ priority: 4, quadrant: 'do' }), today)).toBe('do');
  });

  it('recurrentes: la siguiente instancia sigue la serie y nunca cae en el pasado', () => {
    const daily = task({ date: '2026-10-01', recurrence: { freq: 'daily', interval: 1 }, checklist: [{ id: 'c', text: 'x', done: true }] });
    const next = nextRecurringFields(daily, today)!;
    expect(next.date).toBe('2026-10-07');
    expect(next.checklist[0].done).toBe(false);
    const mwf = task({ date: '2026-10-05', deadline: '2026-10-06', recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] } });
    const n2 = nextRecurringFields(mwf, '2026-10-05')!;
    expect(n2).toMatchObject({ date: '2026-10-07', deadline: '2026-10-08' });
  });
});

describe('progreso y salud', () => {
  const project: Project = {
    id: 'p', createdAt: '', updatedAt: '', deletedAt: null, name: 'EP', icon: '🎵', color: 'ember', description: '', areaId: null,
    goalId: 'g', startDate: null, deadline: '2026-10-20', status: 'active', view: 'list', order: 0, completedAt: null,
  };

  it('proyecto en riesgo cuando el ritmo no alcanza', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task({ projectId: 'p', status: i < 1 ? 'done' : 'todo', completedAt: i < 1 ? '2026-09-10T10:00:00.000Z' : null }));
    const h = projectHealth(project, tasks, today);
    expect(h.status).toBe('at_risk');
    expect(h.remaining).toBe(9);
  });

  it('pocas tareas con margen amplio no se marcan en riesgo', () => {
    const tasks = [task({ projectId: 'p', createdAt: '2026-10-04T10:00:00.000Z' }), task({ projectId: 'p', createdAt: '2026-10-04T10:00:00.000Z' })];
    expect(projectHealth({ ...project, deadline: '2026-11-01' }, tasks, today).status).toBe('on_track');
    // Pero dos semanas sin actividad con la fecha a menos de un mes sí es una señal.
    expect(projectHealth({ ...project, deadline: '2026-11-01' }, [task({ projectId: 'p' })], today).status).toBe('at_risk');
  });

  it('proyecto atrasado si pasó la fecha límite', () => {
    expect(projectHealth({ ...project, deadline: '2026-10-01' }, [task({ projectId: 'p' })], today).status).toBe('overdue');
  });

  it('objetivo por hitos y por tareas', () => {
    const goal: Goal = {
      id: 'g', createdAt: '', updatedAt: '', deletedAt: null, title: 'Publicar EP', icon: '🎵', color: 'ember', description: '',
      horizon: 'year', periodStart: '2026-01-01', periodEnd: '2026-12-31', areaId: null, parentId: null, progressMode: 'tasks',
      target: null, current: null, unit: '', manualProgress: null, status: 'active', completedAt: null, order: 0,
    };
    const tasks = [task({ projectId: 'p', status: 'done' }), task({ projectId: 'p' }), task({ goalId: 'g', status: 'done' }), task({ goalId: 'g' })];
    const gp = goalProgress(goal, { milestones: [], tasks, projects: [project], sessions: [], entries: [] }, today);
    expect(gp.ratio).toBe(0.5);
    expect(gp.tasks).toEqual({ done: 2, total: 4 });
  });
});

describe('búsqueda', () => {
  const idx = new SearchIndex([
    { type: 'task', id: '1', title: 'Estudiar marketing digital' },
    { type: 'note', id: '2', title: 'Ideas canción', body: 'estribillo con marketing' },
    { type: 'project', id: '3', title: 'Música' },
  ]);
  it('ignora tildes y mayúsculas, prioriza el título', () => {
    expect(idx.search('musica')[0].doc.id).toBe('3');
    expect(idx.search('MARKETING').map((h) => h.doc.id)).toEqual(['1', '2']);
    expect(idx.search('mktg')[0].doc.id).toBe('1');
    expect(idx.search('xyz')).toEqual([]);
  });
});

describe('aprendizaje de estimaciones', () => {
  it('sugiere la media real de tareas parecidas', () => {
    const done = [1, 2, 3, 4].map((i) => task({ id: `d${i}`, title: 'Estudiar marketing tema ' + i, status: 'done', completedAt: `2026-10-0${i}T10:00:00.000Z` }));
    const hint = estimateHint({ id: 'n', title: 'Estudiar marketing tema 5', projectId: null, durationMin: 30 }, done, () => 50);
    expect(hint).toEqual({ averageMin: 50, samples: 4 });
    expect(estimateHint({ id: 'n', title: 'Comprar pan', projectId: null, durationMin: 30 }, done, () => 50)).toBeNull();
  });
});
