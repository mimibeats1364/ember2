/**
 * Conversación con Orbit (estado de interfaz: vive mientras la app está abierta, no se
 * sincroniza ni se guarda). Cada respuesta con cambios recuerda cuáles desmarcaste y si ya
 * se aplicó o se descartó.
 */
import { create } from 'zustand';
import { askOrbit, type OrbitAnswer } from '@/data/orbit';

export type ProposalState = 'open' | 'applied' | 'dismissed';

export interface OrbitMessage {
  id: number;
  role: 'user' | 'orbit';
  text?: string;
  answer?: OrbitAnswer;
  /** Índices de cambios desmarcados. */
  excluded: number[];
  state: ProposalState;
}

interface OrbitState {
  open: boolean;
  messages: OrbitMessage[];
}

export const useOrbit = create<OrbitState>(() => ({ open: false, messages: [] }));

let seq = 0;

export function openOrbit(prompt?: string) {
  useOrbit.setState({ open: true });
  if (prompt?.trim()) sendToOrbit(prompt);
}

export const closeOrbit = () => useOrbit.setState({ open: false });

export function sendToOrbit(text: string) {
  const answer = askOrbit(text);
  pushExchange(text, answer);
}

/** Añade una pregunta y su respuesta ya calculada (p. ej. desde Notas → "Sacar tareas"). */
export function pushExchange(text: string | null, answer: OrbitAnswer) {
  useOrbit.setState((s) => ({
    open: true,
    messages: [
      ...s.messages.slice(-40),
      ...(text ? [{ id: ++seq, role: 'user' as const, text, excluded: [], state: 'open' as const }] : []),
      { id: ++seq, role: 'orbit' as const, answer, excluded: [], state: 'open' as const },
    ],
  }));
}

export function toggleChange(id: number, index: number) {
  useOrbit.setState((s) => ({
    messages: s.messages.map((m) => (m.id !== id ? m : { ...m, excluded: m.excluded.includes(index) ? m.excluded.filter((i) => i !== index) : [...m.excluded, index] })),
  }));
}

export function setProposalState(id: number, state: ProposalState) {
  useOrbit.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, state } : m)) }));
}

export const clearOrbit = () => useOrbit.setState({ messages: [] });
