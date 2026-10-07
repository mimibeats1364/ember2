import { describe, expect, it } from 'vitest';
import { parseDeepLink } from './deeplink';

const today = '2026-10-07';
const p = (s: string) => parseDeepLink(s, today);

describe('enlaces ember://', () => {
  it('captura con texto y tipo opcional', () => {
    expect(p('ember://capture?text=Comprar%20pan%20ma%C3%B1ana')).toEqual({ type: 'capture', text: 'Comprar pan mañana', kind: null });
    expect(p('ember://capture?text=Idea%20de%20canci%C3%B3n&kind=idea')).toEqual({ type: 'capture', text: 'Idea de canción', kind: 'idea' });
    expect(p('ember://capturar?texto=Llamar%20a%20Ana%20ma%C3%B1ana%20a%20las%2010&tipo=evento')).toEqual({ type: 'capture', text: 'Llamar a Ana mañana a las 10', kind: 'event' });
    expect(p('ember://capture')).toBeNull();
  });

  it('recorta textos enormes y quita caracteres de control', () => {
    const long = 'a'.repeat(2000);
    const r = p(`ember://capture?text=${long}`);
    expect(r && r.type === 'capture' && r.text.length).toBe(500);
    expect(p('ember://capture?text=hola%0Amundo')).toEqual({ type: 'capture', text: 'hola mundo', kind: null });
  });

  it('abrir pantallas en español o inglés', () => {
    expect(p('ember://open/habitos')).toEqual({ type: 'open', screen: 'habits' });
    expect(p('ember://open/calendar')).toEqual({ type: 'open', screen: 'calendar' });
    expect(p('ember://abrir/ajustes')).toEqual({ type: 'open', screen: 'settings' });
    expect(p('ember://open/nada-de-esto')).toBeNull();
  });

  it('comandos y focus', () => {
    expect(p('ember://command?q=qu%C3%A9%20tengo%20ma%C3%B1ana')).toEqual({ type: 'command', q: 'qué tengo mañana' });
    expect(p('ember://focus?minutes=50&task=informe')).toEqual({ type: 'focusStart', minutes: 50, deep: false, task: 'informe' });
    expect(p('ember://focus?minutos=90&modo=profundo')).toEqual({ type: 'focusStart', minutes: 90, deep: true, task: null });
    expect(p('ember://focus')).toEqual({ type: 'focusStart', minutes: null, deep: false, task: null });
    expect(p('ember://focus?action=pause')).toEqual({ type: 'focus', action: 'pause' });
    expect(p('ember://focus/stop')).toEqual({ type: 'focus', action: 'stop' });
  });

  it('ignora otros esquemas y acciones desconocidas', () => {
    expect(p('https://example.com/capture?text=x')).toBeNull();
    expect(p('ember://delete?all=1')).toBeNull();
    expect(p('no es una url')).toBeNull();
  });
});
