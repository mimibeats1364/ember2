import { describe, expect, it } from 'vitest';
import { csvToTaskRows, parseCsv, tasksToCsv } from './csv';
import { parseIcs, toIcs } from './ics';
import { BackupError, createBackup, parseBackup, planMerge } from './backup';
import { ENTITY_TYPES, type CalendarEvent, type Collections, type Task } from '../types';

const emptyCollections = (): Collections => Object.fromEntries(ENTITY_TYPES.map((t) => [t, {}])) as unknown as Collections;

const task: Task = {
  id: 't1', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '0001', deletedAt: null, title: 'Estudiar, "repasar" tema', notes: 'línea 1\nlínea 2',
  status: 'todo', inbox: false, priority: 2, date: '2026-10-07', time: '09:00', durationMin: 90, deadline: '2026-10-09', projectId: null,
  areaId: null, goalId: null, parentId: null, tagIds: [], checklist: [], dependsOn: [], recurrence: null, seriesId: null, reminders: [],
  links: [], quadrant: null, delegatedTo: '', order: 0, completedAt: null,
};

describe('CSV', () => {
  it('ida y vuelta con comas, comillas y saltos de línea', () => {
    const csv = tasksToCsv([task], {}, {}, {});
    const { rows } = csvToTaskRows(csv);
    expect(rows[0]).toMatchObject({ title: 'Estudiar, "repasar" tema', notes: 'línea 1\nlínea 2', priority: 2, date: '2026-10-07', time: '09:00', durationMin: 90, deadline: '2026-10-09' });
  });

  it('acepta cabeceras en inglés y separador ;', () => {
    const { rows, skipped } = csvToTaskRows('Title;Due Date;Priority\nBuy shoes;2026-10-10;p1\n;;\n');
    expect(rows).toEqual([expect.objectContaining({ title: 'Buy shoes', deadline: '2026-10-10', priority: 1 })]);
    expect(skipped).toBe(0);
    expect(parseCsv('a,b\r\n"x\r\ny",z')).toEqual([['a', 'b'], ['x\r\ny', 'z']]);
  });
});

describe('ICS', () => {
  const ev: CalendarEvent = {
    id: 'e1', createdAt: '', updatedAt: '', deletedAt: null, title: 'Clase; Derecho', notes: 'Aula 3, edificio B', category: 'study', allDay: false,
    start: '2026-10-07T09:00:00.000Z', end: '2026-10-07T11:00:00.000Z', date: null, endDate: null, tz: 'Europe/Madrid', location: '',
    recurrence: { freq: 'weekly', interval: 1, byWeekday: [3] }, exdates: [], reminders: [], projectId: null, areaId: null, protected: false,
    source: 'local', externalId: null,
  };

  it('exporta e importa eventos con repetición', () => {
    const ics = toIcs([ev], [task]);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE');
    expect(ics).toContain('BEGIN:VTODO');
    const [parsed] = parseIcs(ics);
    expect(parsed).toMatchObject({ title: 'Clase; Derecho', notes: 'Aula 3, edificio B', start: ev.start, end: ev.end, allDay: false });
    expect(parsed.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [3] });
  });

  it('interpreta TZID, días completos y líneas plegadas', () => {
    const text = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Reunión con un título muy largo que se pliega en varias líneas para pro', ' bar el desplegado',
      'DTSTART;TZID=America/New_York:20261007T090000', 'DTEND;TZID=America/New_York:20261007T100000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:2', 'SUMMARY:Vacaciones', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261015', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const [a, b] = parseIcs(text);
    expect(a.title).toBe('Reunión con un título muy largo que se pliega en varias líneas para probar el desplegado');
    expect(a.start).toBe('2026-10-07T13:00:00.000Z');
    expect(b).toMatchObject({ allDay: true, date: '2026-10-12', endDate: '2026-10-14' });
  });
});

describe('copia de seguridad', () => {
  it('fusiona sin borrar y solo aplica lo más reciente', () => {
    const current = emptyCollections();
    current.tasks.t1 = { ...task, updatedAt: '0005' };
    const backupSrc = emptyCollections();
    backupSrc.tasks.t1 = { ...task, title: 'vieja', updatedAt: '0003' };
    backupSrc.tasks.t2 = { ...task, id: 't2', updatedAt: '0001' };
    const backup = parseBackup(JSON.stringify(createBackup(backupSrc, '0.1.0')));
    const plan = planMerge(current, backup);
    expect(plan).toMatchObject({ added: 1, updated: 0, skipped: 1 });
  });

  it('rechaza archivos que no son de Ember con un error claro', () => {
    expect(() => parseBackup('{"hola":1}')).toThrow(BackupError);
    expect(() => parseBackup('no es json')).toThrow('not_json');
  });
});
