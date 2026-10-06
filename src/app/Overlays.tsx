import { useState, type ReactNode } from 'react';
import { CalendarDays, CalendarPlus, ChartColumn, CircleCheck, Flame, FolderKanban, Inbox, Lightbulb, Menu, NotebookPen, Plus, RotateCcw, Settings, Sun, Target, Timer, Info, TriangleAlert, CircleCheckBig } from 'lucide-react';
import { t } from '@/i18n';
import { Modal, cx } from '@/ui/components/primitives';
import { askConfirm, dismissToast, navigate, openCapture, openEventEditor, openHabitEditor, useUi, type Screen } from './ui';

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={cx('toast', x.kind === 'error' && 'error')}>
          <span className="icon">{x.kind === 'error' ? <TriangleAlert /> : x.kind === 'info' ? <Info /> : <CircleCheckBig />}</span>
          <span>{x.text}</span>
          {x.action && (
            <button
              className="btn btn-sm btn-subtle"
              onClick={() => {
                x.action!.run();
                dismissToast(x.id);
              }}
            >
              {x.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const confirm = useUi((s) => s.confirm);
  const [typed, setTyped] = useState('');
  if (!confirm) return null;
  const close = () => {
    setTyped('');
    useUi.setState({ confirm: null });
  };
  const blocked = !!confirm.typed && typed.trim().toUpperCase() !== confirm.typed;
  return (
    <Modal
      title={confirm.title}
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            className={cx('btn', confirm.danger ? 'btn-danger' : 'btn-primary')}
            disabled={blocked}
            onClick={() => {
              confirm.run();
              close();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{confirm.body}</p>
      {confirm.typed && (
        <input className="input" style={{ marginTop: 14 }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirm.typed} aria-label={confirm.typed} autoFocus />
      )}
    </Modal>
  );
}

export { askConfirm };

const BOTTOM: { screen: Screen; icon: typeof Sun; key: 'nav.today' | 'nav.tasks' | 'nav.calendar' | 'nav.habits' }[] = [
  { screen: 'today', icon: Sun, key: 'nav.today' },
  { screen: 'tasks', icon: CircleCheck, key: 'nav.tasks' },
  { screen: 'calendar', icon: CalendarDays, key: 'nav.calendar' },
  { screen: 'habits', icon: Flame, key: 'nav.habits' },
];

/** Navegación inferior + botón flotante (móvil / ventanas estrechas). */
export function MobileNav() {
  const route = useUi((s) => s.route);
  const sheet = useUi((s) => s.mobileSheet);
  const close = () => useUi.setState({ mobileSheet: null });
  const go = (s: Screen) => {
    navigate(s);
    close();
  };
  const inMore = !BOTTOM.some((b) => b.screen === route.screen);
  return (
    <>
      <nav className="bottom-nav" aria-label="Navegación">
        {BOTTOM.map(({ screen, icon: Icon, key }) => (
          <button key={screen} className={cx(route.screen === screen && 'active')} onClick={() => go(screen)} aria-current={route.screen === screen ? 'page' : undefined}>
            <Icon />
            {t(key)}
          </button>
        ))}
        <button className={cx(inMore && 'active')} onClick={() => useUi.setState({ mobileSheet: 'more' })}>
          <Menu />
          {t('nav.more')}
        </button>
      </nav>
      <button className="fab" aria-label={t('nav.capture')} onClick={() => useUi.setState({ mobileSheet: 'fab' })}>
        <Plus />
      </button>
      {sheet && (
        <>
          <div className="scrim" onClick={close} />
          <div className="sheet" role="dialog" aria-modal="true">
            {sheet === 'fab' ? (
              <div className="sheet-grid">
                <Tile icon={<CircleCheck />} label={t('palette.commands.newTask')} onClick={() => openCapture('task')} />
                <Tile icon={<Flame />} label={t('palette.commands.newHabit')} onClick={() => openHabitEditor(null)} />
                <Tile icon={<Timer />} label={t('palette.commands.startFocus')} onClick={() => go('focus')} />
                <Tile icon={<NotebookPen />} label={t('palette.commands.newNote')} onClick={() => openCapture('note')} />
                <Tile icon={<CalendarPlus />} label={t('palette.commands.newEvent')} onClick={() => openEventEditor(null)} />
                <Tile icon={<Lightbulb />} label={t('capture.kinds.idea')} onClick={() => openCapture('idea')} />
              </div>
            ) : (
              <div className="sheet-grid">
                <Tile icon={<Inbox />} label={t('nav.inbox')} onClick={() => go('inbox')} />
                <Tile icon={<Timer />} label={t('nav.focus')} onClick={() => go('focus')} />
                <Tile icon={<Target />} label={t('nav.goals')} onClick={() => go('goals')} />
                <Tile icon={<FolderKanban />} label={t('nav.projects')} onClick={() => go('projects')} />
                <Tile icon={<NotebookPen />} label={t('nav.notes')} onClick={() => go('notes')} />
                <Tile icon={<ChartColumn />} label={t('nav.insights')} onClick={() => go('insights')} />
                <Tile icon={<RotateCcw />} label={t('nav.review')} onClick={() => go('review')} />
                <Tile icon={<Settings />} label={t('nav.settings')} onClick={() => go('settings')} />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Tile(props: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="sheet-tile" onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}
