/**
 * Identificadores UUIDv7: ordenables por tiempo y únicos entre dispositivos sin coordinación.
 */
const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function uuidv7(now: number = Date.now()): string {
  const r = randomBytes(10);
  const ts = hex(now, 12);
  const verRand = hex(0x7000 | (((r[0] << 8) | r[1]) & 0x0fff), 4);
  const variant = hex(0x8000 | (((r[2] << 8) | r[3]) & 0x3fff), 4);
  let tail = '';
  for (let i = 4; i < 10; i++) tail += hex(r[i], 2);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-${verRand}-${variant}-${tail}`;
}

/** Id corto para elementos anidados (checklists, pasos de rutina, recordatorios). */
export function shortId(): string {
  const r = randomBytes(6);
  let s = '';
  for (const b of r) s += hex(b, 2);
  return s;
}
