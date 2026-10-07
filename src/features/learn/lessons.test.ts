/**
 * El tutorial no puede mentir: cada frase de ejemplo se pasa por el analizador real y cada
 * atajo se compara con los valores por defecto de la app.
 */
import { describe, expect, it } from 'vitest';
import { addDays, today as todayFn } from '@core/dates';
import { parseInput } from '@core/nlp';
import { parseCommand } from '@core/commands';
import { parseDeepLink } from '@core/deeplink';
import { parseOrbit } from '@core/orbit/intent';
import { DEFAULT_SHORTCUTS } from '@/data/defaults';
import { LESSONS, MODULES } from './lessons';

const today = todayFn();

describe('tutorial "Aprende Ember"', () => {
  it('lecciones con id único y módulo válido', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LESSONS) {
      expect(MODULES.some((m) => m.id === l.module), l.id).toBe(true);
      expect(l.steps.length, l.id).toBeGreaterThan(0);
    }
    for (const m of MODULES) expect(LESSONS.some((l) => l.module === m.id), m.id).toBe(true);
  });

  it('cada ejemplo de captura se entiende como dice el tutorial', () => {
    const examples = LESSONS.flatMap((l) => l.capture ?? []);
    expect(examples.length).toBeGreaterThan(8);
    for (const ex of examples) {
      const r = parseInput(ex.text, { today, projects: [] });
      const c = ex.check;
      expect(r.kind, ex.text).toBe(ex.kind);
      if (c.title !== undefined) expect(r.title, ex.text).toBe(c.title);
      if (c.dateIn !== undefined) expect(r.date, ex.text).toBe(addDays(today, c.dateIn));
      if (c.time !== undefined) expect(r.time, ex.text).toBe(c.time);
      if (c.durationMin !== undefined) expect(r.durationMin, ex.text).toBe(c.durationMin);
      if (c.priority !== undefined) expect(r.priority, ex.text).toBe(c.priority);
      if (c.timesPerWeek !== undefined) expect(r.timesPerWeek, ex.text).toBe(c.timesPerWeek);
      if (c.weekdays) expect(r.recurrence?.byWeekday, ex.text).toEqual(c.weekdays);
      if (c.daily) expect(r.recurrence, ex.text).toEqual({ freq: 'daily', interval: 1 });
      if (c.hasDeadline) expect(r.deadline, ex.text).not.toBeNull();
      if (c.tags) expect(r.tags, ex.text).toEqual(c.tags);
    }
  });

  it('cada comando del tutorial se entiende con el tipo correcto', () => {
    const examples = LESSONS.flatMap((l) => l.commands ?? []);
    expect(examples.length).toBeGreaterThan(20);
    for (const ex of examples) expect(parseCommand(ex.text, { today })?.type, ex.text).toBe(ex.type);
  });

  it('cada enlace ember:// del tutorial funciona', () => {
    const links = LESSONS.flatMap((l) => l.links ?? []);
    expect(links.length).toBeGreaterThan(5);
    for (const ex of links) expect(parseDeepLink(ex.url, today)?.type, ex.url).toBe(ex.type);
  });

  it('cada ejemplo de Orbit se entiende como dice el tutorial', () => {
    const examples = LESSONS.flatMap((l) => l.orbit ?? []);
    expect(examples.length).toBeGreaterThan(5);
    for (const ex of examples) expect(parseOrbit(ex.text, { today, name: 'Orbit' }).type, ex.text).toBe(ex.type);
  });

  it('los atajos del tutorial coinciden con los de la app', () => {
    for (const l of LESSONS) {
      for (const s of l.shortcuts ?? []) {
        if (!s.pref) continue;
        const key = DEFAULT_SHORTCUTS[s.pref];
        const label = key === ' ' ? 'Espacio' : key.toUpperCase();
        expect(label, `${l.id}: ${s.label}`).toBe(s.keys);
      }
    }
  });
});
