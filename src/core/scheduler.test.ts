import { describe, expect, it } from 'vitest';
import { freeSlots, planDay, suggestSlots, type Interval } from './scheduler';
import { localDateTime } from './dates';
import type { Task } from './types';

const prefs = { sleep: { bed: '23:00', wake: '07:00' }, bufferMin: 10, focusPeak: 'morning' as const };
const at = (date: string, time: string) => localDateTime(date, time).getTime();
const block = (date: string, from: string, to: string): Interval => ({ start: at(date, from), end: at(date, to) });

const task = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), createdAt: '', updatedAt: '', deletedAt: null, title: 'T', notes: '', status: 'todo',
  inbox: false, priority: 4, date: '2026-10-07', time: null, durationMin: 60, deadline: null, projectId: null, areaId: null,
  goalId: null, parentId: null, tagIds: [], checklist: [], dependsOn: [], recurrence: null, seriesId: null, reminders: [],
  links: [], quadrant: null, delegatedTo: '', order: 0, completedAt: null, ...over,
});

describe('huecos libres', () => {
  it('respeta sueño, eventos y margen entre bloques', () => {
    const busy = [block('2026-10-07', '11:00', '15:00'), block('2026-10-07', '16:00', '21:00')];
    const slots = freeSlots('2026-10-07', busy, prefs);
    expect(slots.map((s) => [new Date(s.start).getHours() * 60 + new Date(s.start).getMinutes(), new Date(s.end).getHours() * 60 + new Date(s.end).getMinutes()])).toEqual([
      [7 * 60, 10 * 60 + 50],
      [15 * 60 + 10, 15 * 60 + 50],
      [21 * 60 + 10, 23 * 60],
    ]);
  });

  it('hoy empieza desde ahora redondeado', () => {
    const slots = freeSlots('2026-10-07', [], prefs, at('2026-10-07', '13:07'));
    expect(new Date(slots[0].start).getMinutes()).toBe(15);
    expect(new Date(slots[0].start).getHours()).toBe(13);
  });
});

describe('sugerencias de horario', () => {
  it('"2 horas antes del viernes" propone huecos reales antes de la fecha límite y prefiere la mañana', () => {
    const now = new Date(at('2026-10-06', '20:00'));
    const busyFor = (d: string) => (d === '2026-10-07' ? [block(d, '07:00', '14:00')] : [block(d, '08:00', '09:00')]);
    const s = suggestSlots({ durationMin: 120, now, until: '2026-10-09', busyFor, prefs });
    expect(s.length).toBeGreaterThan(0);
    for (const sug of s) {
      expect(sug.date <= '2026-10-09').toBe(true);
      const [part] = sug.parts;
      expect(part.end - part.start).toBe(120 * 60_000);
      for (const b of busyFor(sug.date)) expect(part.end <= b.start - 10 * 60_000 || part.start >= b.end + 10 * 60_000).toBe(true);
    }
    expect(new Date(s[0].parts[0].start).getHours()).toBeLessThan(12);
  });

  it('si no hay hueco continuo propone dividir', () => {
    const now = new Date(at('2026-10-07', '06:00'));
    const busyFor = (d: string) => [block(d, '07:00', '22:20')];
    const s = suggestSlots({ durationMin: 60, now, until: '2026-10-08', busyFor, prefs: { ...prefs, bufferMin: 0 }, minChunkMin: 30 });
    expect(s).toHaveLength(1);
    expect(s[0].reason).toBe('split');
    expect(s[0].parts.reduce((a, p) => a + (p.end - p.start), 0)).toBe(60 * 60_000);
  });
});

describe('planificar el día', () => {
  it('coloca primero lo urgente e importante y no solapa eventos', () => {
    const tasks = [
      task({ id: 'a', title: 'Música', priority: 3, durationMin: 60 }),
      task({ id: 'b', title: 'Estudiar', priority: 1, durationMin: 120 }),
      task({ id: 'c', title: 'Correo', priority: 4, durationMin: 15 }),
      task({ id: 'd', title: 'Hecha', status: 'done' }),
      task({ id: 'e', title: 'Con hora', time: '18:00' }),
    ];
    const busy = [block('2026-10-07', '11:00', '15:00')];
    const plan = planDay({ date: '2026-10-07', now: new Date(at('2026-10-07', '06:00')), tasks, busy, prefs });
    expect(plan.blocks.map((b) => b.taskId).sort()).toEqual(['a', 'b', 'c']);
    const study = plan.blocks.find((b) => b.taskId === 'b')!;
    expect(new Date(study.start).getHours()).toBeGreaterThanOrEqual(7);
    expect(study.end <= at('2026-10-07', '10:50') || study.start >= at('2026-10-07', '15:10')).toBe(true);
    for (let i = 1; i < plan.blocks.length; i++) expect(plan.blocks[i].start).toBeGreaterThanOrEqual(plan.blocks[i - 1].end);
  });

  it('lo que no cabe queda para reprogramar', () => {
    const tasks = [task({ id: 'x', durationMin: 600 })];
    const busy = [block('2026-10-07', '09:00', '20:00')];
    const plan = planDay({ date: '2026-10-07', now: new Date(at('2026-10-07', '06:00')), tasks, busy, prefs });
    expect(plan.blocks).toHaveLength(0);
    expect(plan.unplaced.map((t) => t.id)).toEqual(['x']);
  });
});
