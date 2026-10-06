import { describe, expect, it } from 'vitest';
import { parseInput } from './nlp';

// Martes 6 de octubre de 2026
const today = '2026-10-06';
const p = (s: string, projects: string[] = []) => parseInput(s, { today, projects });

describe('entrada inteligente (español)', () => {
  it('"Estudiar derecho mañana 90 minutos"', () => {
    const r = p('Estudiar derecho mañana 90 minutos');
    expect(r).toMatchObject({ kind: 'task', title: 'Estudiar derecho', date: '2026-10-07', durationMin: 90, time: null });
  });

  it('"Gimnasio lunes, miércoles y viernes a las 18:00" → hábito', () => {
    const r = p('Gimnasio lunes, miércoles y viernes a las 18:00');
    expect(r.kind).toBe('habit');
    expect(r.title).toBe('Gimnasio');
    expect(r.time).toBe('18:00');
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] });
  });

  it('"Estudiar marketing 2 horas antes del viernes" → buscar hueco', () => {
    const r = p('Estudiar marketing 2 horas antes del viernes');
    expect(r).toMatchObject({ title: 'Estudiar marketing', durationMin: 120, deadline: '2026-10-09', date: null, autoSchedule: true });
  });

  it('"entrenar 3 veces semana" → hábito flexible', () => {
    const r = p('entrenar 3 veces semana');
    expect(r).toMatchObject({ kind: 'habit', title: 'Entrenar', timesPerWeek: 3 });
  });

  it('"idea para canción" → idea con el texto completo', () => {
    const r = p('idea para canción');
    expect(r.kind).toBe('idea');
    expect(r.title).toBe('Idea para canción');
  });

  it('"Comprar zapatillas" → tarea simple', () => {
    expect(p('Comprar zapatillas')).toMatchObject({ kind: 'task', title: 'Comprar zapatillas', date: null });
  });

  it('rangos horarios y eventos', () => {
    const r = p('Reunión con Ana el jueves de 10 a 11:30');
    expect(r).toMatchObject({ kind: 'event', title: 'Reunión con Ana', date: '2026-10-08', time: '10:00', durationMin: 90 });
  });

  it('"a las 5" se interpreta por la tarde y la prioridad se detecta', () => {
    expect(p('Llamar al banco hoy a las 5 p1')).toMatchObject({ title: 'Llamar al banco', date: today, time: '17:00', priority: 1 });
    expect(p('Despertar a las 7 de la mañana')).toMatchObject({ time: '07:00' });
    expect(p('Cena a las 9 de la noche')).toMatchObject({ time: '21:00' });
  });

  it('fechas con número y mes', () => {
    expect(p('Entregar trabajo para el 15/10')).toMatchObject({ title: 'Entregar trabajo', deadline: '2026-10-15' });
    expect(p('Viaje 3 de noviembre')).toMatchObject({ title: 'Viaje', date: '2026-11-03' });
    expect(p('Renovar DNI el 2 de marzo')).toMatchObject({ date: '2027-03-02' });
  });

  it('"mañana por la mañana" distingue día y franja', () => {
    expect(p('Ir al médico mañana por la mañana')).toMatchObject({ title: 'Ir al médico', date: '2026-10-07', time: '09:00' });
  });

  it('repeticiones diarias y duración', () => {
    const r = p('Leer 30 min todos los días');
    expect(r).toMatchObject({ kind: 'habit', title: 'Leer', durationMin: 30, recurrence: { freq: 'daily', interval: 1 } });
  });

  it('tareas recurrentes no-hábito empiezan en la próxima ocurrencia', () => {
    const r = p('Sacar la basura cada martes');
    expect(r).toMatchObject({ kind: 'task', title: 'Sacar la basura', date: '2026-10-06' });
    expect(r.recurrence?.byWeekday).toEqual([2]);
  });

  it('proyectos y etiquetas con #', () => {
    const r = p('Mezclar pista 3 #Music #urgente', ['Music', 'University']);
    expect(r).toMatchObject({ title: 'Mezclar pista 3', project: 'Music', tags: ['urgente'] });
  });

  it('1h30 y hora y media', () => {
    expect(p('Repasar apuntes 1h30')).toMatchObject({ durationMin: 90, title: 'Repasar apuntes' });
    expect(p('Correr hora y media el sábado')).toMatchObject({ durationMin: 90, date: '2026-10-10' });
  });
});

describe('entrada inteligente (inglés)', () => {
  it('"Gym Monday Wednesday Friday at 18:00"', () => {
    const r = p('Gym Monday Wednesday Friday at 18:00');
    expect(r).toMatchObject({ kind: 'habit', title: 'Gym', time: '18:00' });
    expect(r.recurrence?.byWeekday).toEqual([1, 3, 5]);
  });

  it('"Study law tomorrow 90 minutes"', () => {
    expect(p('Study law tomorrow 90 minutes')).toMatchObject({ title: 'Study law', date: '2026-10-07', durationMin: 90 });
  });

  it('"Call mom next friday at 6pm"', () => {
    expect(p('Call mom next friday at 6pm')).toMatchObject({ title: 'Call mom', date: '2026-10-09', time: '18:00' });
  });
});
