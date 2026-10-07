/**
 * Procesos de fondo de la ventana principal: tema, focus, notificaciones, barra de menús,
 * puente nativo y atajos. Componentes sin UI montados una vez.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { expandEvent } from '@core/calendar';
import { addDays, instantOf, localDateTime, parseTime, toLocalDate, today as todayFn } from '@core/dates';
import { computeStreak, indexLogs, isComplete, isScheduled } from '@core/habits';
import { compareTasks, isOpen } from '@core/tasks';
import { formatClock, remainingMs } from '@core/focus';
import { parseInput } from '@core/nlp';
import { getPrefs, undo, useData, useList, usePrefs, flush } from '@/data/store';
import { useToday } from '@/data/selectors';
import { formatDuration, setLocale, t, tp, type TKey } from '@/i18n';
import { notify, onCapture, onIslandCommand, onIslandReady, onMainFocusChange, onNativeAction, openExternal, registerCaptureShortcut, sendIslandState, setDockBadge, setIslandVisible, setTrayTitle, setWindowGlass, setWindowTheme, showMainWindow, supportsWindowGlass, updateTray } from '@/platform/native';
import { setUiSoundsEnabled } from '@/platform/sound';
import { isTauri } from '@/platform/env';
import { navigate, openCapture, openPalette, openTask, toast, useUi, type Screen } from './ui';
import { closeOrbit, openOrbit, useOrbit } from '@/features/orbit/store';
import { isApplyingRemote, loadSyncConfig, syncNow, useSync } from '@/data/sync';
import { tickFocus, togglePauseFocus, useFocus, startFocusSession } from './focusStore';
import { performCapture } from './QuickCapture';
import { runIslandCommand, type IslandCommand } from './LiveIsland';
import { listenDeepLinks } from './deeplinks';
import { pomodoroConfig } from '@core/focus';
import type { CaptureKind } from '@/data/actions';

// ── Tema y accesibilidad ───────────────────────────────────────────────────────────────

export function ThemeSync() {
  const prefs = usePrefs();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const reduce = prefs.reducedMotion === 'on' || (prefs.reducedMotion === 'system' && mq.matches);
      root.toggleAttribute('data-reduced-motion', reduce);
    };
    apply();
    mq.addEventListener('change', apply);
    const mqt = window.matchMedia('(prefers-reduced-transparency: reduce)');
    root.toggleAttribute('data-reduced-transparency', prefs.reducedTransparency || mqt.matches);
    root.style.setProperty('--text-scale', String(prefs.textScale));
    root.dataset.glass = prefs.glass;
    setLocale(prefs.locale);
    setUiSoundsEnabled(prefs.uiSounds);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#050505');
    try {
      localStorage.setItem('ember_theme', prefs.theme);
      localStorage.setItem('ember_locale', prefs.locale);
      localStorage.setItem('ember_glass', prefs.glass);
    } catch {
      /* almacenamiento local no disponible */
    }
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme, prefs.reducedMotion, prefs.reducedTransparency, prefs.textScale, prefs.locale, prefs.uiSounds, prefs.glass]);

  // Vidrio nativo de macOS: primero se aplica el efecto y después se vuelve transparente la
  // página, para que nunca se vea el escritorio sin desenfocar.
  const wantGlass = prefs.windowGlass && !prefs.reducedTransparency && prefs.glass !== 'off' && supportsWindowGlass();
  useEffect(() => {
    let alive = true;
    void (async () => {
      const ok = await setWindowGlass(wantGlass);
      if (alive) document.documentElement.toggleAttribute('data-window-glass', ok && wantGlass);
    })();
    return () => {
      alive = false;
    };
  }, [wantGlass]);
  useEffect(() => {
    void setWindowTheme(prefs.theme === 'light' ? 'light' : 'dark');
  }, [prefs.theme]);
  return null;
}

/**
 * Isla de Focus nativa: se muestra cuando hay una sesión y Ember no está delante, y se oculta
 * en cuanto vuelves a la ventana principal (que ya enseña el temporizador).
 */
export function IslandBridge() {
  const prefs = usePrefs();
  const active = useFocus((s) => !!s.state);
  const [mainFocused, setMainFocused] = useState(true);
  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    void onMainFocusChange(setMainFocused).then((u) => (un = u));
    return () => un?.();
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    const send = () => void sendIslandState({ state: useFocus.getState().state, theme: prefs.theme, glass: prefs.windowGlass });
    send();
    const unsub = useFocus.subscribe(send);
    let un: (() => void) | undefined;
    void onIslandReady(send).then((u) => (un = u));
    return () => {
      unsub();
      un?.();
    };
  }, [prefs.theme, prefs.windowGlass]);
  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    void onIslandCommand((cmd) => {
      runIslandCommand(cmd as IslandCommand);
      if (cmd === 'open') void showMainWindow();
    }).then((u) => (un = u));
    return () => un?.();
  }, []);
  const visible = isTauri() && prefs.focusIsland && active && !mainFocused;
  useEffect(() => {
    void setIslandVisible(visible);
  }, [visible]);
  return null;
}

/** Enlaces ember:// desde Atajos de Apple, Siri, Raycast… */
export function DeepLinkBridge() {
  const ready = useData((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    let un: (() => void) | undefined;
    void listenDeepLinks().then((u) => (un = u));
    return () => un?.();
  }, [ready]);
  return null;
}

/**
 * Sincronización automática (solo si está configurada): al abrir, cada 90 s con la ventana
 * visible, al volver a la ventana o recuperar la conexión, y unos segundos después de cada cambio.
 */
export function SyncEngine() {
  const configured = useSync((s) => s.configured);
  useEffect(() => {
    void loadSyncConfig();
  }, []);
  useEffect(() => {
    if (!configured) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void syncNow();
    };
    tick();
    const id = setInterval(tick, 90_000);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = useData.subscribe((s, prev) => {
      if (s.c === prev.c || isApplyingRemote()) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(tick, 5000);
    });
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(id);
      if (debounce) clearTimeout(debounce);
      unsub();
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
    };
  }, [configured]);
  return null;
}

/** Insignia del Dock: tareas abiertas de hoy (incluidas las atrasadas). */
export function DockBadgeSync() {
  const tasks = useList('tasks');
  const today = useToday();
  const enabled = usePrefs().dockBadge;
  const count = useMemo(() => (enabled ? tasks.filter((x) => isOpen(x) && !x.parentId && ((x.date !== null && x.date <= today) || (x.deadline !== null && x.deadline <= today))).length : 0), [tasks, today, enabled]);
  useEffect(() => {
    void setDockBadge(count);
  }, [count]);
  return null;
}

// ── Focus ──────────────────────────────────────────────────────────────────────────────

export function FocusEngine() {
  const running = useFocus((s) => !!s.state);
  useEffect(() => {
    if (!running) {
      void setTrayTitle(null);
      return;
    }
    const tick = () => {
      const events = tickFocus();
      const prefs = getPrefs();
      for (const ev of events) {
        if (!prefs.notifications.enabled || !prefs.notifications.focus) continue;
        if (ev.type === 'focus_block_done') void notify('Ember', t('notify.focusBlockDone'));
        else if (ev.type === 'break_done') void notify('Ember', t('notify.breakDone'));
        else if (ev.type === 'session_done') {
          const fin = useFocus.getState().finished;
          void notify('Ember', t('notify.sessionDone', { duration: formatDuration((fin?.focusSec ?? 0) / 60) }));
        }
      }
      const s = useFocus.getState().state;
      if (s) {
        const icon = s.status === 'paused' ? '❚❚' : s.phase === 'focus' ? '◉' : '☕';
        void setTrayTitle(s.status === 'awaiting' ? `${icon} —` : `${icon} ${formatClock(remainingMs(s, Date.now()))}`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running]);
  return null;
}

// ── Barra de menús / bandeja ───────────────────────────────────────────────────────────

export function TraySync() {
  const tasks = useList('tasks');
  const today = useToday();
  const focus = useFocus((s) => s.state);
  const focusLabel = focus ? (focus.status === 'paused' ? t('common.resume') : t('common.pause')) + ` · ${focus.label || t('nav.focus')}` : null;
  const payload = useMemo(() => {
    const list = tasks
      .filter((x) => isOpen(x) && !x.parentId && ((x.date !== null && x.date <= today) || (x.deadline !== null && x.deadline <= today)))
      .sort(compareTasks)
      .slice(0, 8)
      .map((x) => ({ id: x.id, title: x.title.length > 48 ? x.title.slice(0, 47) + '…' : x.title, time: x.time }));
    return { tasks: list, focusRunning: !!focus, focusLabel };
  }, [tasks, today, focus, focusLabel]);
  useEffect(() => {
    const id = setTimeout(() => void updateTray(payload), 400);
    return () => clearTimeout(id);
  }, [payload]);
  return null;
}

// ── Notificaciones ─────────────────────────────────────────────────────────────────────

const FIRED_KEY = 'ember_notified_v1';

function loadFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function inQuietHours(now: Date, start: string, end: string): boolean {
  const m = now.getHours() * 60 + now.getMinutes();
  const s = parseTime(start);
  const e = parseTime(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

interface Due {
  key: string;
  at: number;
  title: string;
  body: string;
}

/** Calcula los avisos que tocan ahora. Mensajes descriptivos, nunca imperativos. */
function computeDue(now: Date): Due[] {
  const { c } = useData.getState();
  const prefs = getPrefs();
  const n = prefs.notifications;
  const today = toLocalDate(now);
  const out: Due[] = [];
  if (n.tasks) {
    for (const task of Object.values(c.tasks)) {
      if (!isOpen(task) || !task.date || task.date < addDays(today, -1) || task.date > addDays(today, 1)) continue;
      const base = task.time ? localDateTime(task.date, task.time) : localDateTime(task.date, 9 * 60);
      const reminders = task.reminders.length ? task.reminders : task.time ? [{ id: 'auto', offsetMin: 0 }] : [];
      for (const r of reminders) {
        const at = base.getTime() - r.offsetMin * 60_000;
        out.push({
          key: `task:${task.id}:${task.date}:${task.time}:${r.offsetMin}`,
          at,
          title: task.title,
          body: r.offsetMin === 0 || !task.time ? t('notify.taskAt', { title: task.title, time: task.time ?? '09:00' }) : t('notify.taskBefore', { title: task.title, duration: formatDuration(r.offsetMin) }),
        });
      }
    }
  }
  if (n.calendar || n.focus) {
    for (const ev of Object.values(c.events)) {
      if (ev.deletedAt || ev.allDay) continue;
      const isFocus = ev.category === 'focus';
      if ((isFocus && !n.focus) || (!isFocus && !n.calendar)) continue;
      for (const o of expandEvent(ev, today, addDays(today, 1))) {
        const reminders = ev.reminders.length ? ev.reminders : [{ id: 'lead', offsetMin: n.eventLeadMin }];
        for (const r of reminders) {
          out.push({
            key: `event:${ev.id}:${o.occurrence}:${r.offsetMin}`,
            at: o.start.getTime() - r.offsetMin * 60_000,
            title: ev.title,
            body: isFocus ? t('notify.focusBlockSoon', { title: ev.title, duration: formatDuration(r.offsetMin) }) : t('notify.eventSoon', { title: ev.title, duration: formatDuration(r.offsetMin) }),
          });
        }
      }
    }
  }
  if (n.habits) {
    const logs = Object.values(c.habitLogs);
    for (const h of Object.values(c.habits)) {
      if (h.deletedAt || h.archived || !h.reminder || !h.preferredTime || !isScheduled(h, today)) continue;
      const index = indexLogs(logs.filter((l) => l.habitId === h.id));
      if (isComplete(h, index.get(today))) continue;
      const streak = computeStreak(h, index, today, prefs.vacations);
      out.push({
        key: `habit:${h.id}:${today}`,
        at: localDateTime(today, h.preferredTime).getTime(),
        title: `${h.icon} ${h.name}`,
        body: streak.current >= 3 ? t('notify.habitStreak', { name: h.name, count: streak.current }) : t('notify.habit', { name: h.name }),
      });
    }
  }
  if (n.digest) {
    const tomorrow = addDays(today, 1);
    const due = Object.values(c.tasks).filter((x) => isOpen(x) && x.deadline === tomorrow).length;
    if (due > 0) out.push({ key: `digest:${today}`, at: localDateTime(today, 19 * 60).getTime(), title: 'Ember', body: tp('notify.digest', due) });
  }
  if (n.goals) {
    for (const g of Object.values(c.goals)) {
      if (g.deletedAt || g.status !== 'active') continue;
      for (const days of [7, 1]) {
        if (addDays(today, days) === g.periodEnd) {
          out.push({ key: `goal:${g.id}:${days}`, at: new Date(instantOf(today, 10 * 60)).getTime(), title: `${g.icon} ${g.title}`, body: t('notify.goalDeadline', { days, title: g.title }) });
        }
      }
    }
  }
  return out;
}

export function NotificationEngine() {
  const ready = useData((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    const check = async () => {
      const prefs = getPrefs();
      if (!prefs.notifications.enabled || !prefs.onboarded) return;
      const now = new Date();
      if (inQuietHours(now, prefs.notifications.quietStart, prefs.notifications.quietEnd)) return;
      const fired = loadFired();
      let changed = false;
      // Solo avisos recientes (≤10 min): al abrir la app no llega una avalancha de avisos viejos.
      for (const d of computeDue(now).filter((x) => x.at <= now.getTime() && now.getTime() - x.at < 10 * 60_000)) {
        if (fired[d.key]) continue;
        fired[d.key] = now.getTime();
        changed = true;
        await notify(d.title, d.body);
      }
      if (changed) {
        for (const [k, ts] of Object.entries(fired)) if (now.getTime() - ts > 3 * 86_400_000) delete fired[k];
        try {
          localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
        } catch {
          /* sin almacenamiento */
        }
      }
    };
    void check();
    const id = setInterval(() => void check(), 30_000);
    return () => clearInterval(id);
  }, [ready]);
  return null;
}

// ── Puente nativo (menús, bandeja, ventana de captura, atajo global) ────────────────────

export function NativeBridge() {
  const shortcut = usePrefs().captureShortcut;
  useEffect(() => {
    if (!isTauri()) return;
    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    void onNativeAction((a) => {
      switch (a.action) {
        case 'settings':
          navigate('settings');
          break;
        case 'new_task':
          openCapture('task');
          break;
        case 'palette':
          openPalette();
          break;
        case 'open_task':
          if (a.id) openTask(a.id);
          break;
        case 'go':
          if (a.id) navigate(a.id as Screen);
          break;
        case 'focus_toggle':
          togglePauseFocus();
          break;
        case 'focus_start': {
          const p = getPrefs().focus;
          startFocusSession(pomodoroConfig(p.focusMin, p.breakMin, p.longBreakMin, p.longBreakEvery, p.autoStartBreaks), null, '', p.sound as never, p.volume);
          break;
        }
      }
    }).then((u) => (un1 = u));
    void onCapture((p) => {
      performCapture(p.text, p.kind as CaptureKind, parseInput(p.text, { today: todayFn(), projects: Object.values(useData.getState().c.projects).filter((x) => !x.deletedAt).map((x) => x.name) }), { silent: true });
    }).then((u) => (un2 = u));
    return () => {
      un1?.();
      un2?.();
    };
  }, []);
  useEffect(() => {
    if (!isTauri() || !shortcut) return;
    void registerCaptureShortcut(shortcut).then((ok) => {
      if (!ok) toast(t('errors.shortcut', { shortcut }), { kind: 'error' });
    });
  }, [shortcut]);
  return null;
}

// ── Atajos de teclado ──────────────────────────────────────────────────────────────────

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function Shortcuts() {
  const prefs = usePrefs();
  const ref = useRef(prefs.shortcuts);
  ref.current = prefs.shortcuts;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUi.getState();
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette(!ui.paletteOpen);
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTyping(e)) {
        e.preventDefault();
        const label = undo();
        if (label) toast(`${t('common.undo')}: ${label}`, { kind: 'info' });
        return;
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (useOrbit.getState().open) closeOrbit();
        else {
          openPalette(false);
          openOrbit();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openCapture('task');
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        navigate('settings');
        return;
      }
      if (mod && /^[1-5]$/.test(e.key) && !isTauri()) {
        e.preventDefault();
        navigate((['today', 'tasks', 'calendar', 'habits', 'focus'] as Screen[])[Number(e.key) - 1]);
        return;
      }
      if (mod || e.altKey || isTyping(e)) return;
      const anyOverlay = useOrbit.getState().open || ui.paletteOpen || ui.capture || ui.habitEditor || ui.eventEditor || ui.projectEditor || ui.goalEditor || ui.confirm || ui.planDay || ui.yearReview || ui.routineEditor || ui.routineRunner || ui.cheatsheet || ui.whatsNew || ui.tour;
      if (e.key === 'Escape') {
        if (ui.taskPanel && !anyOverlay) useUi.setState({ taskPanel: null });
        return;
      }
      if (anyOverlay || document.querySelector('.modal')) return;
      if (e.key === '?') {
        e.preventDefault();
        useUi.setState({ cheatsheet: true });
        return;
      }
      const s = ref.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const map: Record<string, () => void> = {
        [s.newTask]: () => openCapture('task'),
        [s.focus]: () => navigate('focus'),
        [s.habits]: () => navigate('habits'),
        [s.calendar]: () => navigate('calendar'),
        [s.goals]: () => navigate('goals'),
        [s.projects]: () => navigate('projects'),
        [s.search]: () => openPalette(),
        [s.today]: () => navigate('today'),
        [s.tasks]: () => navigate('tasks'),
        [s.toggleFocus]: () => {
          if (useFocus.getState().state) togglePauseFocus();
          else if (ui.route.screen === 'focus') document.querySelector<HTMLButtonElement>('[data-focus-start]')?.click();
        },
      };
      const action = map[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    // Los enlaces externos se abren en el navegador del sistema.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a && /^https?:\/\//i.test(a.getAttribute('href') ?? '')) {
        e.preventDefault();
        void openExternal(a.href);
      }
    };
    document.addEventListener('click', onClick);
    const onUnload = () => void flush();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);
  return null;
}

export const SHORTCUT_KEYS: (keyof ReturnType<typeof getPrefs>['shortcuts'])[] = ['newTask', 'focus', 'habits', 'calendar', 'goals', 'projects', 'search', 'toggleFocus', 'today', 'tasks'];
export type ShortcutName = TKey;
