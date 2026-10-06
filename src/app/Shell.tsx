import { lazy, Suspense, useEffect, type LazyExoticComponent, type ReactElement } from 'react';
import { X } from 'lucide-react';
import { useUi, type Screen } from './ui';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { QuickCaptureModal } from './QuickCapture';
import { ConfirmDialog, MobileNav, Toaster } from './Overlays';
import { FocusEngine, NativeBridge, NotificationEngine, Shortcuts, ThemeSync, TraySync } from './engines';
import { AmbientBackground } from '@/ui/components/Ambient';
import { ContextMenuHost, cx } from '@/ui/components/primitives';
import { DragGhost } from '@/ui/components/dnd';
import { TaskPanel } from '@/features/tasks/TaskPanel';
import { TodayScreen } from '@/features/today/TodayScreen';
import { useFocus } from './focusStore';
import { useData } from '@/data/store';
import { t } from '@/i18n';

const Screens: Record<Screen, LazyExoticComponent<() => ReactElement> | (() => ReactElement)> = {
  today: TodayScreen,
  inbox: lazy(() => import('@/features/inbox/InboxScreen')),
  tasks: lazy(() => import('@/features/tasks/TasksScreen')),
  calendar: lazy(() => import('@/features/calendar/CalendarScreen')),
  habits: lazy(() => import('@/features/habits/HabitsScreen')),
  focus: lazy(() => import('@/features/focus/FocusScreen')),
  goals: lazy(() => import('@/features/goals/GoalsScreen')),
  projects: lazy(() => import('@/features/projects/ProjectsScreen')),
  notes: lazy(() => import('@/features/notes/NotesScreen')),
  insights: lazy(() => import('@/features/insights/InsightsScreen')),
  review: lazy(() => import('@/features/review/ReviewScreen')),
  settings: lazy(() => import('@/features/settings/SettingsScreen')),
};

const Editors = lazy(() => import('@/features/editors/Editors'));

export function Shell() {
  const route = useUi((s) => s.route);
  const panel = useUi((s) => s.taskPanel);
  const focusActive = useFocus((s) => !!s.state && (s.state.status === 'running' || s.state.status === 'paused'));
  const immersive = route.screen === 'focus' && focusActive;
  const storageError = useData((s) => s.storageError);
  const Screen = Screens[route.screen];

  useEffect(() => {
    document.documentElement.classList.toggle('focus-mode', immersive);
  }, [immersive]);

  return (
    <>
      <ThemeSync />
      <FocusEngine />
      <NotificationEngine />
      <TraySync />
      <NativeBridge />
      <Shortcuts />
      <AmbientBackground calm={immersive} />
      <a className="skip-link" href="#main">
        {t('a11y.skipToContent')}
      </a>
      <div className={cx('app', panel && 'has-panel', immersive && 'immersive')}>
        {!immersive && <Sidebar />}
        <main className="main" id="main">
          <div className="drag-region" data-tauri-drag-region />
          {storageError === 'fallback' && (
            <div className="banner" style={{ margin: '48px 24px 0' }}>
              {t('errors.storageFallback')}
            </div>
          )}
          <div className="main-scroll">
            <Suspense fallback={<div className="page" />}>
              <Screen key={route.screen + (route.id ?? '')} />
            </Suspense>
          </div>
        </main>
        {panel && (
          <aside className="panel" aria-label={t('common.details')}>
            <button className="btn btn-ghost btn-icon btn-sm panel-close" onClick={() => useUi.setState({ taskPanel: null })} aria-label={t('a11y.close')}>
              <X />
            </button>
            <TaskPanel id={panel} />
          </aside>
        )}
      </div>
      {!immersive && <MobileNav />}
      <CommandPalette />
      <QuickCaptureModal />
      <Suspense fallback={null}>
        <Editors />
      </Suspense>
      <ConfirmDialog />
      <ContextMenuHost />
      <DragGhost />
      <Toaster />
    </>
  );
}
