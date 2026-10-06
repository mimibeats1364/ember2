/**
 * Reloj lógico híbrido (HLC).
 *
 * Formato: `<ms:12 hex>-<contador:4 hex>-<nodo>`. Es ordenable como texto, monótono en cada
 * dispositivo aunque el reloj del sistema retroceda, y se adelanta al recibir marcas remotas.
 * Así "el último cambio gana" funciona entre dispositivos con relojes desajustados.
 */
export interface HlcState {
  ms: number;
  counter: number;
  node: string;
}

export function formatHlc(s: HlcState): string {
  return `${s.ms.toString(16).padStart(12, '0')}-${s.counter.toString(16).padStart(4, '0')}-${s.node}`;
}

export function parseHlc(value: string): HlcState {
  const [ms, counter, ...node] = value.split('-');
  return { ms: parseInt(ms, 16), counter: parseInt(counter, 16), node: node.join('-') };
}

export class HybridClock {
  private state: HlcState;

  constructor(node: string, private readonly physical: () => number = Date.now) {
    this.state = { ms: 0, counter: 0, node };
  }

  get node(): string {
    return this.state.node;
  }

  /** Marca para un cambio local. */
  now(): string {
    const pt = this.physical();
    if (pt > this.state.ms) {
      this.state = { ...this.state, ms: pt, counter: 0 };
    } else {
      this.state = { ...this.state, counter: this.state.counter + 1 };
    }
    return formatHlc(this.state);
  }

  /** Integra una marca remota para que los siguientes cambios locales sean posteriores. */
  receive(remote: string): void {
    const r = parseHlc(remote);
    const pt = this.physical();
    const ms = Math.max(pt, this.state.ms, r.ms);
    let counter: number;
    if (ms === this.state.ms && ms === r.ms) counter = Math.max(this.state.counter, r.counter) + 1;
    else if (ms === this.state.ms) counter = this.state.counter + 1;
    else if (ms === r.ms) counter = r.counter + 1;
    else counter = 0;
    this.state = { ms, counter, node: this.state.node };
  }
}

export const compareHlc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
