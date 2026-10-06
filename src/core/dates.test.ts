import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  endOfLocalDay,
  formatTime,
  isoWeekKey,
  isValidLocalDate,
  localDateOf,
  localDateTime,
  parseTime,
  startOfLocalDay,
  startOfWeek,
  weekdayOf,
  zonedParts,
  zonedToDate,
} from './dates';

describe('aritmética de fechas locales', () => {
  it('suma días cruzando cambios de horario sin desplazar la fecha', () => {
    // Cambios DST de 2026 en Europa, EE. UU. y Lord Howe (cambio de 30 min).
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addDays('2026-10-03', 2)).toBe('2026-10-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('calcula diferencias y días de la semana', () => {
    expect(diffDays('2026-10-06', '2026-10-01')).toBe(5);
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2);
    expect(weekdayOf('2026-10-06')).toBe(2); // martes
    expect(weekdayOf('1970-01-01')).toBe(4);
    expect(startOfWeek('2026-10-06', 1)).toBe('2026-10-05');
    expect(startOfWeek('2026-10-04', 1)).toBe('2026-09-28');
    expect(startOfWeek('2026-10-06', 0)).toBe('2026-10-04');
  });

  it('suma meses ajustando al final de mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('valida fechas y horas', () => {
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(parseTime('18:30')).toBe(1110);
    expect(formatTime(1110)).toBe('18:30');
    expect(formatTime(1440 + 30)).toBe('00:30');
  });

  it('semanas ISO', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(isoWeekKey('2026-10-06')).toBe('2026-W41');
  });
});

describe('instantes en la zona del sistema', () => {
  it('conserva la hora de pared en días con cambio de hora', () => {
    for (const day of ['2026-03-08', '2026-03-29', '2026-04-05', '2026-10-04', '2026-10-25', '2026-11-01']) {
      const d = localDateTime(day, '09:00');
      expect(d.getHours()).toBe(9);
      expect(localDateOf(d)).toBe(day);
    }
  });

  it('el fin del día es el inicio del siguiente (días de 23, 24 o 25 h)', () => {
    for (const day of ['2026-03-29', '2026-10-25', '2026-06-15']) {
      const len = (endOfLocalDay(day).getTime() - startOfLocalDay(day).getTime()) / 3_600_000;
      expect([23, 23.5, 24, 24.5, 25]).toContain(len);
      expect(localDateOf(endOfLocalDay(day))).toBe(addDays(day, 1));
    }
  });
});

describe('zonas IANA explícitas', () => {
  it('convierte hora de pared de Madrid a instante en ambos lados del DST', () => {
    expect(zonedToDate('2026-03-28', '08:00', 'Europe/Madrid').toISOString()).toBe('2026-03-28T07:00:00.000Z');
    expect(zonedToDate('2026-03-30', '08:00', 'Europe/Madrid').toISOString()).toBe('2026-03-30T06:00:00.000Z');
    expect(zonedToDate('2026-10-26', '08:00', 'Europe/Madrid').toISOString()).toBe('2026-10-26T07:00:00.000Z');
  });

  it('obtiene partes de reloj en otra zona', () => {
    const p = zonedParts(new Date('2026-07-01T22:30:00Z'), 'America/New_York');
    expect(p.date).toBe('2026-07-01');
    expect(p.minutes).toBe(18 * 60 + 30);
    const k = zonedParts(new Date('2026-07-01T22:30:00Z'), 'Asia/Kolkata');
    expect(k.date).toBe('2026-07-02');
    expect(k.minutes).toBe(4 * 60);
  });
});
