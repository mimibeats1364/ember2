/**
 * Enlaces ember:// para automatizar Ember desde Atajos de Apple, Siri, Raycast o Alfred.
 *
 *   ember://capture?text=Comprar pan mañana        → captura (lenguaje natural)
 *   ember://capture?text=Idea de canción&kind=idea  → captura con tipo
 *   ember://open/habitos                            → abre una pantalla
 *   ember://command?q=qué tengo mañana              → abre ⌘K con la frase (confirmas tú)
 *   ember://focus?minutes=50&task=informe           → empieza Focus
 *   ember://focus?action=pause | resume | stop
 *
 * Seguridad: los textos se recortan, no se descarga nada y ningún enlace borra datos. Lo que
 * cambia datos más allá de crear una captura pasa por la paleta, donde se confirma con Intro.
 */
import type { CommandScreen } from './commands';
import { parseCommand } from './commands';
import type { LocalDate } from './types';

export type CaptureKindLink = 'task' | 'note' | 'idea' | 'habit' | 'event';

export type DeepLinkAction =
  | { type: 'capture'; text: string; kind: CaptureKindLink | null }
  | { type: 'open'; screen: CommandScreen }
  | { type: 'command'; q: string }
  | { type: 'focusStart'; minutes: number | null; deep: boolean; task: string | null }
  | { type: 'focus'; action: 'pause' | 'resume' | 'stop' };

const MAX_TEXT = 500;
const KINDS: Record<string, CaptureKindLink> = {
  task: 'task', tarea: 'task', note: 'note', nota: 'note', idea: 'idea', habit: 'habit', habito: 'habit', hábito: 'habit', event: 'event', evento: 'event',
};

function clean(s: string | null): string {
  return (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
}

export function parseDeepLink(raw: string, today: LocalDate): DeepLinkAction | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'ember:') return null;
  // ember://capture?x → host "capture"; ember:capture?x → pathname "capture".
  const parts = [url.hostname, ...url.pathname.split('/')].map((p) => decodeURIComponent(p).trim()).filter(Boolean);
  const [action, arg] = parts;
  const q = url.searchParams;
  switch ((action ?? '').toLowerCase()) {
    case 'capture':
    case 'capturar':
    case 'add': {
      const text = clean(q.get('text') ?? q.get('texto') ?? arg ?? '');
      if (!text) return null;
      const kind = KINDS[(q.get('kind') ?? q.get('tipo') ?? '').toLowerCase()] ?? null;
      return { type: 'capture', text, kind };
    }
    case 'open':
    case 'abrir':
    case 'go': {
      const target = clean(arg ?? q.get('screen') ?? q.get('pantalla') ?? '');
      if (!target) return null;
      const intent = parseCommand(target, { today });
      return intent?.type === 'go' ? { type: 'open', screen: intent.screen } : null;
    }
    case 'command':
    case 'comando':
    case 'ask': {
      const text = clean(q.get('q') ?? q.get('text') ?? arg ?? '');
      return text ? { type: 'command', q: text } : null;
    }
    case 'focus':
    case 'foco': {
      const act = (q.get('action') ?? q.get('accion') ?? arg ?? '').toLowerCase();
      if (['pause', 'pausa', 'pausar'].includes(act)) return { type: 'focus', action: 'pause' };
      if (['resume', 'reanudar', 'continuar'].includes(act)) return { type: 'focus', action: 'resume' };
      if (['stop', 'parar', 'detener', 'terminar'].includes(act)) return { type: 'focus', action: 'stop' };
      const minutes = Number(q.get('minutes') ?? q.get('minutos') ?? q.get('min') ?? '');
      const mode = (q.get('mode') ?? q.get('modo') ?? '').toLowerCase();
      return {
        type: 'focusStart',
        minutes: Number.isFinite(minutes) && minutes >= 1 ? Math.min(360, Math.round(minutes)) : null,
        deep: mode === 'deep' || mode === 'profundo',
        task: clean(q.get('task') ?? q.get('tarea')) || null,
      };
    }
    default:
      return null;
  }
}
