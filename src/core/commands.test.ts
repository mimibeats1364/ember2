import { describe, expect, it } from 'vitest';
import { COMMAND_EXAMPLES, cleanCommand, parseCommand, type CommandType } from './commands';

const today = '2026-10-07'; // miércoles
const p = (s: string) => parseCommand(s, { today });

describe('comandos de Ember', () => {
  it('limpia saludos, signos y tildes', () => {
    expect(cleanCommand('¿Oye Ember, qué tengo mañana?')).toBe('que tengo manana');
    expect(cleanCommand('Planifica mi día, por favor')).toBe('planifica mi dia');
  });

  it('agenda de un día', () => {
    expect(p('qué tengo hoy')).toEqual({ type: 'agenda', date: today });
    expect(p('¿Qué tengo mañana?')).toEqual({ type: 'agenda', date: '2026-10-08' });
    expect(p('qué hay el viernes')).toEqual({ type: 'agenda', date: '2026-10-09' });
    expect(p('mi agenda')).toEqual({ type: 'agenda', date: today });
    expect(p('qué tengo que hacer pasado mañana')).toEqual({ type: 'agenda', date: '2026-10-09' });
    expect(p('qué tengo esta semana')).toEqual({ type: 'agendaWeek' });
    expect(p("what's on tomorrow")).toEqual({ type: 'agenda', date: '2026-10-08' });
  });

  it('atrasadas, mover y planificar', () => {
    expect(p('qué tengo atrasado')).toEqual({ type: 'overdue' });
    expect(p('tareas vencidas')).toEqual({ type: 'overdue' });
    expect(p('mueve las atrasadas a mañana')).toEqual({ type: 'moveOverdue', date: '2026-10-08' });
    expect(p('pasa las tareas atrasadas a hoy')).toEqual({ type: 'moveOverdue', date: today });
    expect(p('mueve las atrasadas')).toEqual({ type: 'moveOverdue', date: today });
    expect(p('move overdue tasks to friday')).toEqual({ type: 'moveOverdue', date: '2026-10-09' });
    expect(p('planifica mi día')).toEqual({ type: 'planDay', date: today });
    expect(p('planifica mañana')).toEqual({ type: 'planDay', date: '2026-10-08' });
    expect(p('organiza el día del lunes')).toEqual({ type: 'planDay', date: '2026-10-12' });
  });

  it('focus: empezar, pausar, reanudar, detener', () => {
    expect(p('empieza focus')).toEqual({ type: 'focusStart', minutes: null, deep: false, task: null });
    expect(p('empieza focus 50 min en informe')).toEqual({ type: 'focusStart', minutes: 50, deep: false, task: 'informe' });
    expect(p('trabajo profundo 90 minutos')).toEqual({ type: 'focusStart', minutes: 90, deep: true, task: null });
    expect(p('pomodoro 25')).toEqual({ type: 'focusStart', minutes: 25, deep: false, task: null });
    expect(p('inicia un pomodoro de 1 hora y media con la tarea guion')).toEqual({ type: 'focusStart', minutes: 90, deep: false, task: 'guion' });
    expect(p('start deep work for slides')).toEqual({ type: 'focusStart', minutes: null, deep: true, task: 'slides' });
    expect(p('pausa')).toEqual({ type: 'focusPause' });
    expect(p('pausa el focus')).toEqual({ type: 'focusPause' });
    expect(p('reanuda el focus')).toEqual({ type: 'focusResume' });
    expect(p('detén el focus')).toEqual({ type: 'focusStop' });
    expect(p('termina la sesión')).toEqual({ type: 'focusStop' });
  });

  it('una palabra suelta navega, no ejecuta', () => {
    expect(p('focus')).toEqual({ type: 'go', screen: 'focus' });
    expect(p('hábitos')).toEqual({ type: 'go', screen: 'habits' });
    expect(p('abre hábitos')).toEqual({ type: 'go', screen: 'habits' });
    expect(p('ve al calendario')).toEqual({ type: 'go', screen: 'calendar' });
    expect(p('llévame a ajustes')).toEqual({ type: 'go', screen: 'settings' });
    expect(p('abre el tutorial')).toEqual({ type: 'go', screen: 'learn' });
  });

  it('consultas: libre, focus, rachas, lo siguiente', () => {
    expect(p('cuánto tiempo libre tengo hoy')).toEqual({ type: 'free', date: today });
    expect(p('huecos libres mañana')).toEqual({ type: 'free', date: '2026-10-08' });
    expect(p('cuánto he enfocado esta semana')).toEqual({ type: 'focusStats', period: 'week' });
    expect(p('cuántos pomodoros llevo hoy')).toEqual({ type: 'focusStats', period: 'today' });
    expect(p('focus de este mes')).toEqual({ type: 'focusStats', period: 'month' });
    expect(p('racha de meditar')).toEqual({ type: 'streak', habit: 'meditar' });
    expect(p('cómo van mis rachas')).toEqual({ type: 'streak', habit: '' });
    expect(p('qué viene ahora')).toEqual({ type: 'next' });
    expect(p('próximo evento')).toEqual({ type: 'next' });
  });

  it('rutinas, tema, completar y registrar', () => {
    expect(p('empieza la rutina de mañana')).toEqual({ type: 'routine', query: 'manana' });
    expect(p('rutina de noche')).toEqual({ type: 'routine', query: 'noche' });
    expect(p('empieza mi rutina')).toEqual({ type: 'routine', query: '' });
    expect(p('tema océano')).toEqual({ type: 'theme', theme: 'ocean' });
    expect(p('modo claro')).toEqual({ type: 'theme', theme: 'light' });
    expect(p('pon el tema bosque')).toEqual({ type: 'theme', theme: 'forest' });
    expect(p('completa comprar pan')).toEqual({ type: 'complete', query: 'comprar pan', prefer: 'task' });
    expect(p('he terminado el informe')).toEqual({ type: 'complete', query: 'el informe', prefer: 'task' });
    expect(p('marca meditar')).toEqual({ type: 'complete', query: 'meditar', prefer: 'habit' });
    expect(p('hice ejercicio')).toEqual({ type: 'complete', query: 'ejercicio', prefer: 'habit' });
    expect(p('ayuda')).toEqual({ type: 'help' });
  });

  it('lo que no es un comando se deja para buscar o crear', () => {
    expect(p('Comprar zapatillas')).toBeNull();
    expect(p('Estudiar derecho mañana 90 minutos')).toBeNull();
    expect(p('reunión con Ana el jueves')).toBeNull();
    expect(p('planifica la fiesta de Ana')).toBeNull();
    expect(p('')).toBeNull();
  });

  it('todos los ejemplos del tutorial se entienden con el tipo correcto', () => {
    for (const [type, examples] of Object.entries(COMMAND_EXAMPLES) as [CommandType, string[]][]) {
      for (const ex of examples) expect(p(ex)?.type, ex).toBe(type);
    }
  });
});
