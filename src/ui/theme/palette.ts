/**
 * Paleta de color de Ember. Los tonos de hábitos se tomaron (medidos píxel a píxel) del Reel
 * de referencia: rojo brasa, coral, magenta, violeta, cian, menta, verde, ámbar y naranja.
 */
import type { EventCategory, ThemeId } from '@core/types';

export const PALETTE: Record<string, string> = {
  ember: '#F2501F',
  red: '#E7353E',
  coral: '#E55E70',
  magenta: '#EA4BB2',
  pink: '#F26ACF',
  violet: '#7F5AEF',
  indigo: '#6F8BFF',
  cyan: '#4FD3E0',
  teal: '#50DAA9',
  mint: '#6DE78C',
  green: '#46DA68',
  amber: '#E6C030',
  orange: '#F28F19',
  slate: '#8A8F98',
};

export const PALETTE_KEYS = Object.keys(PALETTE);

export function colorValue(key: string | null | undefined): string {
  if (!key) return PALETTE.slate;
  return PALETTE[key] ?? (key.startsWith('#') ? key : PALETTE.slate);
}

export const CATEGORY_COLORS: Record<EventCategory | 'task' | 'habit', string> = {
  event: 'ember',
  meeting: 'violet',
  work: 'indigo',
  study: 'cyan',
  training: 'green',
  meal: 'amber',
  rest: 'teal',
  leisure: 'magenta',
  commute: 'slate',
  personal: 'coral',
  focus: 'ember',
  task: 'orange',
  habit: 'mint',
};

export const CATEGORY_ICONS: Record<EventCategory, string> = {
  event: '◆',
  meeting: '👥',
  work: '💼',
  study: '📚',
  training: '🏋️',
  meal: '🍽️',
  rest: '☕',
  leisure: '🎮',
  commute: '🚇',
  personal: '✦',
  focus: '◎',
};

export const THEMES: ThemeId[] = ['ember', 'midnight', 'cosmic', 'forest', 'ocean', 'minimal', 'light', 'oled'];

/** Muestras para el selector de temas (fondo, superficie, acento). */
export const THEME_SWATCHES: Record<ThemeId, [string, string, string]> = {
  ember: ['#050505', '#141416', '#FF4D2E'],
  midnight: ['#060912', '#121a2c', '#6F8BFF'],
  cosmic: ['#07040d', '#181027', '#B06BFF'],
  forest: ['#050a07', '#111c15', '#46DA68'],
  ocean: ['#040a0f', '#0f1c27', '#3CC4E6'],
  minimal: ['#0c0c0c', '#1a1a1a', '#F2F2F2'],
  light: ['#f5f4f1', '#ffffff', '#E8432A'],
  oled: ['#000000', '#0a0a0a', '#FF4D2E'],
};

export const EMOJI_CHOICES = [
  '✦', '◆', '🎯', '🔥', '📚', '🏋️', '🏃', '🧘', '💧', '🎵', '🎸', '🎧', '✍️', '💻', '🧠', '💤', '🍎', '🥗', '☕', '🚗',
  '💰', '📈', '🎓', '⚖️', '🌱', '🌙', '☀️', '🧹', '🛒', '❤️', '🎨', '📷', '🗣️', '🌍', '✈️', '🏠', '🧾', '🚴', '🦷', '📖',
];
