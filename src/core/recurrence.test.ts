import { describe, expect, it } from 'vitest';
import { nextOccurrence, occurrencesBetween, occursOn } from './recurrence';
import { expandEvent } from './calendar';
import { zonedParts } from './dates';
import type { CalendarEvent } from './types';

describe('reglas de repetición', () => {
  it('diaria con intervalo', () => {
    const r = { freq: 'daily' as const, interval: 2 };
    expect(occurrencesBetween(r, '2026-10-01', '2026-10-01', '2026-10-07')).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']);
    expect(nextOccurrence(r, '2026-10-01', '2026-10-01')).toBe('2026-10-03');
  });

  it('lunes, miércoles y viernes', () => {
    const r = { freq: 'weekly' as const, interval: 1, byWeekday: [1, 3, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] };
    expect(occurrencesBetween(r, '2026-10-05', '2026-10-05', '2026-10-11')).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
    expect(nextOccurrence(r, '2026-10-05', '2026-10-09')).toBe('2026-10-12');
  });

  it('cada dos semanas los martes', () => {
    const r = { freq: 'weekly' as const, interval: 2, byWeekday: [2] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] };
    expect(occurrencesBetween(r, '2026-10-06', '2026-10-01', '2026-11-05')).toEqual(['2026-10-06', '2026-10-20', '2026-11-03']);
  });

  it('mensual el día 31 cae en el último día de meses cortos', () => {
    const r = { freq: 'monthly' as const, interval: 1 };
    expect(occurrencesBetween(r, '2026-01-31', '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    expect(nextOccurrence(r, '2026-01-31', '2026-02-28')).toBe('2026-03-31');
  });

  it('anual en 29 de febrero', () => {
    const r = { freq: 'yearly' as const, interval: 1 };
    expect(nextOccurrence(r, '2028-02-29', '2028-02-29')).toBe('2029-02-28');
    expect(occursOn(r, '2028-02-29', '2032-02-29')).toBe(true);
  });

  it('respeta la fecha final', () => {
    const r = { freq: 'daily' as const, interval: 1, until: '2026-10-03' };
    expect(occurrencesBetween(r, '2026-10-01', '2026-10-01', '2026-10-10')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(nextOccurrence(r, '2026-10-01', '2026-10-03')).toBeNull();
  });
});

describe('eventos recurrentes y horario de verano', () => {
  const base: CalendarEvent = {
    id: 'e1', createdAt: '', updatedAt: '', deletedAt: null, title: 'Clase', notes: '', category: 'study', allDay: false,
    start: '2026-03-20T07:00:00.000Z', end: '2026-03-20T08:30:00.000Z', date: null, endDate: null, tz: 'Europe/Madrid',
    location: '', recurrence: { freq: 'weekly', interval: 1 }, exdates: [], reminders: [], projectId: null, areaId: null,
    protected: false, source: 'local', externalId: null,
  };

  it('mantiene las 08:00 de Madrid antes y después del cambio de hora', () => {
    const occ = expandEvent(base, '2026-03-15', '2026-04-10');
    expect(occ.map((o) => o.occurrence)).toEqual(['2026-03-20', '2026-03-27', '2026-04-03', '2026-04-10']);
    for (const o of occ) {
      expect(zonedParts(o.start, 'Europe/Madrid').minutes).toBe(8 * 60);
      expect(o.end.getTime() - o.start.getTime()).toBe(90 * 60_000);
    }
    expect(occ[2].start.toISOString()).toBe('2026-04-03T06:00:00.000Z');
  });

  it('omite fechas excluidas', () => {
    const occ = expandEvent({ ...base, exdates: ['2026-03-27'] }, '2026-03-15', '2026-04-05');
    expect(occ.map((o) => o.occurrence)).toEqual(['2026-03-20', '2026-04-03']);
  });

  it('eventos de varios días completos', () => {
    const ev = { ...base, allDay: true, recurrence: null, date: '2026-10-09', endDate: '2026-10-11' };
    expect(expandEvent(ev, '2026-10-10', '2026-10-10')).toHaveLength(1);
    expect(expandEvent(ev, '2026-10-12', '2026-10-13')).toHaveLength(0);
  });
});
