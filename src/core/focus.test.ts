import { describe, expect, it } from 'vitest';
import { deepWorkConfig, focusSeconds, formatClock, pause, pomodoroConfig, remainingMs, resume, skipPhase, startFocus, stop, tick, continuePhase } from './focus';

const MIN = 60_000;

describe('temporizador de focus', () => {
  it('cuenta atrás con pausas exactas', () => {
    let s = startFocus(pomodoroConfig(25, 5), 0, 't1', 'Estudiar');
    expect(remainingMs(s, 10 * MIN)).toBe(15 * MIN);
    s = pause(s, 10 * MIN);
    expect(remainingMs(s, 20 * MIN)).toBe(15 * MIN);
    s = resume(s, 20 * MIN);
    expect(remainingMs(s, 21 * MIN)).toBe(14 * MIN);
    expect(focusSeconds(s, 21 * MIN)).toBe(11 * 60);
  });

  it('pasa de foco a descanso y vuelve, aunque la app estuviera suspendida', () => {
    let s = startFocus({ ...pomodoroConfig(25, 5), autoStartBreaks: true }, 0, null, 'Pomodoro');
    const r = tick(s, 27 * MIN);
    expect(r.events).toEqual([{ type: 'focus_block_done', cycle: 1 }]);
    expect(r.state.phase).toBe('break');
    expect(remainingMs(r.state, 27 * MIN)).toBe(3 * MIN);
    const r2 = tick(r.state, 31 * MIN);
    expect(r2.events).toEqual([{ type: 'break_done', cycle: 1 }]);
    expect(r2.state.status).toBe('awaiting');
    expect(r2.state.cycle).toBe(2);
    s = continuePhase(r2.state, 32 * MIN);
    expect(remainingMs(s, 32 * MIN)).toBe(25 * MIN);
  });

  it('descanso largo cada cuatro bloques', () => {
    let s = startFocus({ ...pomodoroConfig(1, 1, 3, 8), autoStartBreaks: true }, 0, null, '');
    let t = 0;
    for (let i = 0; i < 3; i++) {
      t += MIN;
      s = tick(s, t).state;
      t += MIN;
      s = continuePhase(tick(s, t).state, t);
    }
    t += MIN;
    s = tick(s, t).state;
    expect(s.phase).toBe('long_break');
  });

  it('deep work termina tras un único bloque', () => {
    const s = startFocus(deepWorkConfig(90), 0, null, 'Deep');
    const r = tick(s, 91 * MIN);
    expect(r.events).toEqual([{ type: 'session_done' }]);
    const summary = stop(r.state, 91 * MIN);
    expect(summary).toMatchObject({ completed: true, interrupted: false, focusSec: 90 * 60 });
  });

  it('detener antes de tiempo registra interrupción sin perder lo hecho', () => {
    const s = startFocus(deepWorkConfig(60), 0, null, 'Deep');
    expect(stop(s, 20 * MIN)).toMatchObject({ completed: false, interrupted: true, focusSec: 20 * 60 });
  });

  it('saltar el foco acredita solo el tiempo real', () => {
    const s = startFocus(pomodoroConfig(25, 5), 0, null, '');
    const skipped = skipPhase(s, 10 * MIN);
    expect(skipped.phase).toBe('break');
    expect(focusSeconds(skipped, 10 * MIN)).toBe(10 * 60);
  });

  it('formato de reloj', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(90 * MIN)).toBe('1:30:00');
    expect(formatClock(59_001)).toBe('01:00');
  });
});
