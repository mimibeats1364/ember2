import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChartColumn,
  CircleCheck,
  Flame,
  FolderKanban,
  GraduationCap,
  Inbox,
  ListChecks,
  NotebookPen,
  RotateCcw,
  Search,
  Settings,
  Sun,
  Target,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { navigate, openPalette, useUi, type Screen } from './ui';
import { useList, usePrefs, useData } from '@/data/store';
import { useToday } from '@/data/selectors';
import { isOverdue, isOpen } from '@core/tasks';
import { t, type TKey } from '@/i18n';
import { cx, Kbd, Bar } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { isMac, isTauri, MOD } from '@/platform/env';
import { useFocus } from './focusStore';
import { formatClock, remainingMs } from '@core/focus';
import { levelFor, totalXp } from '@core/gamification';
import { LiquidTrack } from '@/ui/motion/LiquidTrack';
import { LESSONS } from '@/features/learn/lessons';
import { openOrbit } from '@/features/orbit/store';
import { useSync } from '@/data/sync';

export const NAV: { screen: Screen; icon: LucideIcon; key: TKey }[] = [
  { screen: 'today', icon: Sun, key: 'nav.today' },
  { screen: 'inbox', icon: Inbox, key: 'nav.inbox' },
  { screen: 'tasks', icon: CircleCheck, key: 'nav.tasks' },
  { screen: 'calendar', icon: CalendarDays, key: 'nav.calendar' },
  { screen: 'habits', icon: Flame, key: 'nav.habits' },
  { screen: 'routines', icon: ListChecks, key: 'nav.routines' },
  { screen: 'focus', icon: Timer, key: 'nav.focus' },
  { screen: 'goals', icon: Target, key: 'nav.goals' },
  { screen: 'projects', icon: FolderKanban, key: 'nav.projects' },
  { screen: 'notes', icon: NotebookPen, key: 'nav.notes' },
  { screen: 'insights', icon: ChartColumn, key: 'nav.insights' },
  { screen: 'review', icon: RotateCcw, key: 'nav.review' },
];

export function Sidebar() {
  const route = useUi((s) => s.route);
  const tasks = useList('tasks');
  const notes = useList('notes');
  const projects = useList('projects');
  const today = useToday();
  const prefs = usePrefs();
  const storageError = useData((s) => s.storageError);
  const inboxCount = useMemo(() => tasks.filter((x) => isOpen(x) && x.inbox).length + notes.filter((n) => n.inbox && !n.archived).length, [tasks, notes]);
  const overdueCount = useMemo(() => tasks.filter((x) => isOverdue(x, today)).length, [tasks, today]);
  const activeProjects = useMemo(() => projects.filter((p) => p.status === 'active').sort((a, b) => a.order - b.order).slice(0, 6), [projects]);
  const openCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of tasks) if (isOpen(x) && x.projectId) m.set(x.projectId, (m.get(x.projectId) ?? 0) + 1);
    return m;
  }, [tasks]);

  const ref = useRef<HTMLElement>(null);
  const learned = prefs.learned.filter((id) => LESSONS.some((l) => l.id === id)).length;

  return (
    <aside className="sidebar" aria-label="Navegación principal" ref={ref}>
      <LiquidTrack
        container={ref}
        deps={[route.screen, route.id, activeProjects.length, prefs.gamification]}
        getActive={(c) => c.querySelector('.nav-project.active') ?? c.querySelector('.nav-item.active')}
        hoverSelector=".nav-item"
        axis="y"
      />
      <div className="drag-region" data-tauri-drag-region />
      <div className="brand" data-tauri-drag-region>
        <span className="brand-orb" aria-hidden />
        <span className="brand-name">Ember</span>
      </div>
      <button className="side-search" onClick={() => openPalette()} title={t('nav.searchPlaceholder')} data-tour="palette">
        <Search />
        <span>{t('nav.searchPlaceholder')}</span>
        <Kbd>{MOD}K</Kbd>
      </button>
      <nav className="nav">
        {NAV.map(({ screen, icon: Icon, key }) => (
          <button key={screen} className={cx('nav-item', route.screen === screen && 'active')} onClick={() => navigate(screen)} title={t(key)} aria-current={route.screen === screen ? 'page' : undefined} data-tour={`nav-${screen}`}>
            <Icon />
            <span>{t(key)}</span>
            {screen === 'inbox' && inboxCount > 0 && <span className="count">{inboxCount}</span>}
            {screen === 'tasks' && overdueCount > 0 && <span className="count warn">{overdueCount}</span>}
          </button>
        ))}
      </nav>
      {activeProjects.length > 0 && (
        <div className="nav-section">
          <div className="eyebrow">{t('nav.projects')}</div>
          <div className="nav">
            {activeProjects.map((p) => (
              <button key={p.id} className={cx('nav-item nav-project', route.screen === 'projects' && route.id === p.id && 'active')} onClick={() => navigate('projects', { id: p.id })}>
                <span className="dot" style={{ color: colorValue(p.color) }} />
                <span className="ellipsis">{p.name}</span>
                {(openCounts.get(p.id) ?? 0) > 0 && <span className="count">{openCounts.get(p.id)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="side-foot">
        <FocusPill />
        {prefs.gamification && <LevelChip />}
        <button className="nav-item orbit-item" onClick={() => openOrbit()} title={`${prefs.assistantName || 'Orbit'} · ${MOD}J`} data-tour="orbit">
          <span className="orbit-dot" aria-hidden />
          <span>{prefs.assistantName || 'Orbit'}</span>
          <Kbd>{MOD}J</Kbd>
        </button>
        <button className={cx('nav-item', route.screen === 'learn' && 'active')} onClick={() => navigate('learn')} title={t('nav.learn')} data-tour="learn">
          <GraduationCap />
          <span>{t('nav.learn')}</span>
          {learned < LESSONS.length && <span className="count">{learned}/{LESSONS.length}</span>}
        </button>
        <button className={cx('nav-item', route.screen === 'settings' && 'active')} onClick={() => navigate('settings')} title={t('nav.settings')}>
          <Settings />
          <span>{t('nav.settings')}</span>
        </button>
        <SideStatus storageError={storageError} />
      </div>
    </aside>
  );
}

/** Dónde están tus datos: solo aquí, sincronizados, sincronizando o con algún problema. */
function SideStatus({ storageError }: { storageError: string }) {
  const sync = useSync();
  const offline = sync.status === 'error' && sync.error === 'network';
  const problem = storageError !== 'none' || (sync.status === 'error' && !offline);
  const label =
    storageError !== 'none'
      ? t('errors.storage').split('.')[0]
      : !sync.configured
        ? isTauri() && isMac
          ? t('nav.localOnly')
          : t('sync.statusLocal')
        : sync.status === 'syncing'
          ? t('sync.statusSyncing')
          : offline
            ? t('sync.statusOffline')
            : sync.status === 'error'
              ? t('sync.statusError')
              : t('sync.statusSynced');
  return (
    <button className={cx('side-status', problem && 'error', offline && 'offline', sync.status === 'syncing' && 'syncing')} title={sync.configured && sync.lastSyncAt ? t('sync.syncedAgo', { when: new Date(sync.lastSyncAt).toLocaleTimeString() }) : label} onClick={() => navigate('settings', { tab: sync.configured ? 'sync' : 'privacy' })}>
      <i className="dot" />
      <span>{label}</span>
    </button>
  );
}

function FocusPill() {
  const state = useFocus((s) => s.state);
  useFocusTick();
  if (!state) return null;
  const remaining = remainingMs(state, Date.now());
  return (
    <button className="focus-pill" onClick={() => navigate('focus')} title={t('focus.running')}>
      <i className="pulse" />
      <span className="label ellipsis">{state.label || t(`focus.phase.${state.phase}` as TKey)}</span>
      <span className="num">{formatClock(remaining)}</span>
    </button>
  );
}

/** Re-renderiza cada segundo mientras haya focus activo. */
export function useFocusTick() {
  const running = useFocus((s) => s.state?.status === 'running');
  const [, setN] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
}

function LevelChip() {
  const c = useData((s) => s.c);
  const info = useMemo(() => {
    const xp = totalXp({
      tasks: Object.values(c.tasks),
      habits: Object.values(c.habits),
      habitLogs: Object.values(c.habitLogs),
      sessions: Object.values(c.focusSessions),
      projects: Object.values(c.projects),
      reviews: Object.values(c.reviews),
    });
    return { xp, ...levelFor(xp) };
  }, [c.tasks, c.habits, c.habitLogs, c.focusSessions, c.projects, c.reviews]);
  return (
    <div className="level-chip" title={t('insights.xp', { xp: info.xp })}>
      <span>{t('nav.level', { level: info.level })}</span>
      <Bar value={info.progress} thin />
    </div>
  );
}
