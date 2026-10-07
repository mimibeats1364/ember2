/**
 * Estado de interfaz (no se sincroniza): navegación, capas abiertas y avisos.
 */
import { create } from 'zustand';
import type { CaptureKind } from '@/data/actions';
import type { CalendarEvent, Habit, ID, LocalDate, Project, Goal, Routine } from '@core/types';

export type Screen =
  | 'today'
  | 'inbox'
  | 'tasks'
  | 'calendar'
  | 'habits'
  | 'routines'
  | 'focus'
  | 'goals'
  | 'projects'
  | 'notes'
  | 'insights'
  | 'review'
  | 'learn'
  | 'settings';

export interface Route {
  screen: Screen;
  id?: string;
  tab?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind?: 'info' | 'error' | 'success';
  action?: { label: string; run: () => void };
}

type Editor<T> = { id: ID | null; prefill?: Partial<T> } | null;

interface UiState {
  route: Route;
  history: Route[];
  taskPanel: ID | null;
  paletteOpen: boolean;
  /** Texto con el que se abre la paleta (por ejemplo, desde el tutorial). */
  paletteQuery: string;
  capture: { kind: CaptureKind; text?: string } | null;
  habitEditor: Editor<Habit>;
  eventEditor: Editor<CalendarEvent> & ({ occurrence?: LocalDate } | null);
  projectEditor: Editor<Project>;
  goalEditor: Editor<Goal>;
  areaEditor: { id: ID | null } | null;
  planDay: LocalDate | null;
  routineEditor: Editor<Routine>;
  routineRunner: ID | null;
  cheatsheet: boolean;
  whatsNew: boolean;
  tour: { id: string; step: number } | null;
  yearReview: boolean;
  mobileSheet: 'more' | 'fab' | null;
  confirm: { title: string; body: string; confirmLabel: string; danger?: boolean; typed?: string; run: () => void } | null;
  toasts: Toast[];
}

export const useUi = create<UiState>(() => ({
  route: { screen: 'today' },
  history: [],
  taskPanel: null,
  paletteOpen: false,
  paletteQuery: '',
  capture: null,
  habitEditor: null,
  eventEditor: null,
  projectEditor: null,
  goalEditor: null,
  areaEditor: null,
  planDay: null,
  routineEditor: null,
  routineRunner: null,
  cheatsheet: false,
  whatsNew: false,
  tour: null,
  yearReview: false,
  mobileSheet: null,
  confirm: null,
  toasts: [],
}));

export function navigate(screen: Screen, opts: { id?: string; tab?: string } = {}) {
  useUi.setState((s) => ({
    route: { screen, ...opts },
    history: [...s.history.slice(-30), s.route],
    mobileSheet: null,
    taskPanel: screen === s.route.screen ? s.taskPanel : null,
  }));
  document.querySelector('.main-scroll')?.scrollTo({ top: 0 });
}

export function goBack() {
  useUi.setState((s) => {
    const prev = s.history[s.history.length - 1];
    return prev ? { route: prev, history: s.history.slice(0, -1) } : {};
  });
}

export const openTask = (id: ID | null) => useUi.setState({ taskPanel: id });
export const openPalette = (open = true, query = '') => useUi.setState({ paletteOpen: open, paletteQuery: query });
export const openCapture = (kind: CaptureKind = 'task', text?: string) => useUi.setState({ capture: { kind, text }, mobileSheet: null });
export const closeCapture = () => useUi.setState({ capture: null });
export const openHabitEditor = (id: ID | null = null, prefill?: Partial<Habit>) => useUi.setState({ habitEditor: { id, prefill }, mobileSheet: null });
export const openEventEditor = (id: ID | null = null, prefill?: Partial<CalendarEvent>, occurrence?: LocalDate) =>
  useUi.setState({ eventEditor: { id, prefill, occurrence }, mobileSheet: null });
export const openProjectEditor = (id: ID | null = null, prefill?: Partial<Project>) => useUi.setState({ projectEditor: { id, prefill } });
export const openGoalEditor = (id: ID | null = null, prefill?: Partial<Goal>) => useUi.setState({ goalEditor: { id, prefill } });
export const openAreaEditor = (id: ID | null = null) => useUi.setState({ areaEditor: { id } });
export const openPlanDay = (date: LocalDate | null) => useUi.setState({ planDay: date });
export const openRoutineEditor = (id: ID | null = null, prefill?: Partial<Routine>) => useUi.setState({ routineEditor: { id, prefill }, mobileSheet: null });
export const runRoutine = (id: ID) => useUi.setState({ routineRunner: id, mobileSheet: null, paletteOpen: false });
export const startTour = (id: string) => useUi.setState({ tour: { id, step: 0 }, paletteOpen: false, mobileSheet: null });
export const askConfirm = (c: NonNullable<UiState['confirm']>) => useUi.setState({ confirm: c });

let toastSeq = 0;
export function toast(text: string, opts: Omit<Toast, 'id' | 'text'> & { duration?: number } = {}) {
  const id = ++toastSeq;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, kind: opts.kind, action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.duration ?? (opts.action ? 6000 : 3200));
  return id;
}
export const dismissToast = (id: number) => useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
