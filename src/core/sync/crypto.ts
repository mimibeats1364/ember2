/**
 * Cifrado de extremo a extremo para la sincronización.
 *
 * Todo sale de un CÓDIGO DE SINCRONIZACIÓN aleatorio (100 bits, p. ej. `K7F3-9QXM-2B4T-PZ8W-HC6N`)
 * que solo conocen tus dispositivos:
 *
 *   código ──PBKDF2──▶ clave maestra ──HKDF──┬─▶ espacio   (identificador público del buzón)
 *                                            ├─▶ token     (autoriza a leer/escribir el buzón)
 *                                            ├─▶ cifrado   (AES-GCM 256: contenido de cada registro)
 *                                            └─▶ claves    (HMAC: oculta el tipo y el id)
 *
 * El servidor guarda registros `{ k, v, d }`: una clave opaca, la marca HLC (para quedarse con la
 * versión más reciente) y el contenido cifrado. No puede leer títulos, notas, horas ni nada de lo
 * que escribes; solo ve cuántos registros hay y cuándo cambiaron.
 */
import type { AnyEntity, EntityType } from '../types';

const ENC = new TextEncoder();
const DEC = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

/** Base32 sin caracteres ambiguos (sin 0/O, 1/I/L). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LEN = 20;
const PBKDF2_ITERATIONS = 210_000;
const SALT = 'ember-sync-v1';

export interface SyncKeys {
  space: string;
  token: string;
  enc: CryptoKey;
  mac: CryptoKey;
}

export interface SealedRecord {
  /** Clave opaca: HMAC(tipo:id). */
  k: string;
  /** Marca HLC de la versión (orden de "gana el más reciente"). */
  v: string;
  /** iv (12 bytes) + texto cifrado, en base64url. */
  d: string;
}

/** Código nuevo de 20 caracteres (~99 bits de azar), en grupos de 4. */
export function generateSyncCode(): string {
  const out: string[] = [];
  const bytes = new Uint8Array(CODE_LEN * 2);
  while (out.length < CODE_LEN) {
    globalThis.crypto.getRandomValues(bytes);
    // Rechazo para no sesgar: 248 = 8 × 31.
    for (let i = 0; out.length < CODE_LEN && i < bytes.length; i++) if (bytes[i] < 248) out.push(ALPHABET[bytes[i] % ALPHABET.length]);
  }
  return formatSyncCode(out.join(''));
}

export function formatSyncCode(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

/** Acepta el código con o sin guiones, espacios o minúsculas. Devuelve null si no es válido. */
export function normalizeSyncCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[\s-]+/g, '');
  if (clean.length !== CODE_LEN) return null;
  for (const ch of clean) if (!ALPHABET.includes(ch)) return null;
  return clean;
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Deriva todas las claves del código. Es lento a propósito (PBKDF2): se hace una vez por sesión. */
export async function deriveSyncKeys(code: string, iterations = PBKDF2_ITERATIONS): Promise<SyncKeys> {
  const normalized = normalizeSyncCode(code);
  if (!normalized) throw new Error('invalid_sync_code');
  const base = await subtle().importKey('raw', ENC.encode(normalized), 'PBKDF2', false, ['deriveBits']);
  const master = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: ENC.encode(SALT), iterations }, base, 256);
  const hkdf = await subtle().importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const info = (label: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: ENC.encode(SALT), info: ENC.encode(label) });
  const [space, token, enc, mac] = await Promise.all([
    subtle().deriveBits(info('space'), hkdf, 128),
    subtle().deriveBits(info('auth'), hkdf, 256),
    subtle().deriveKey(info('enc'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    subtle().deriveKey(info('mac'), hkdf, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  ]);
  return { space: hex(space), token: hex(token), enc, mac };
}

export async function recordKey(keys: SyncKeys, type: EntityType, id: string): Promise<string> {
  const sig = await subtle().sign('HMAC', keys.mac, ENC.encode(`${type}:${id}`));
  return toBase64Url(new Uint8Array(sig).slice(0, 24));
}

export async function sealRecord(keys: SyncKeys, type: EntityType, entity: AnyEntity): Promise<SealedRecord> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await recordKey(keys, type, entity.id);
  // La clave opaca va como dato asociado: un registro no se puede "mover" a otra clave.
  const plain = ENC.encode(JSON.stringify({ t: type, e: entity }));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: ENC.encode(k) }, keys.enc, plain));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return { k, v: entity.updatedAt, d: toBase64Url(out) };
}

export async function openRecord(keys: SyncKeys, rec: SealedRecord): Promise<{ type: EntityType; entity: AnyEntity }> {
  const raw = fromBase64Url(rec.d);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: ENC.encode(rec.k) }, keys.enc, ct);
  const { t, e } = JSON.parse(DEC.decode(plain)) as { t: EntityType; e: AnyEntity };
  return { type: t, entity: e };
}
