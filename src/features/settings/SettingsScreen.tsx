import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, Bot, Cloud, Database, Download, Info, Keyboard, Lock, Palette, Plug, RotateCcw, Sun, Timer, Trash, Upload, User, Flame, Clock, Plus } from 'lucide-react';
import type { Preferences, ThemeId, Weekday } from '@core/types';
import { instantOf, startOfWeek, today as todayFn } from '@core/dates';
import { getAdapter, updatePrefs, usePrefs, useData, useList, wipeAll } from '@/data/store';
import { setVacation } from '@/data/actions';
import { DEFAULT_SHORTCUTS } from '@/data/defaults';
import { hasDemo, loadDemoData, removeDemoData } from '@/data/seed';
import { t, weekdayName, type TKey } from '@/i18n';
import { cx, Field, PendingBadge, Segmented, Switch, Kbd } from '@/ui/components/primitives';
import { THEMES } from '@/ui/theme/palette';
import { AMBIENT_KINDS } from '@/platform/sound';
import { ensureNotificationPermission, notificationPermission, notify, type NotifyPermission } from '@/platform/native';
import { APP_VERSION, isTauri } from '@/platform/env';
import { askConfirm, openEventEditor, toast, useUi } from '@/app/ui';
import { ThemeCard } from '@/features/onboarding/Onboarding';
import { SHORTCUT_KEYS } from '@/app/engines';
import { describeRecurrence } from '@/ui/format';
import { exportCsv, exportIcs, exportJson, exportMarkdown, importCsv, importIcsFile, importJson } from './dataIO';
import './settings.css';

type Section = 'profile' | 'appearance' | 'schedule' | 'focus' | 'habits' | 'notifications' | 'shortcuts' | 'ai' | 'integrations' | 'privacy' | 'data' | 'sync' | 'account' | 'about';

const SECTIONS: { id: Section; icon: ReactNode }[] = [
  { id: 'profile', icon: <User /> },
  { id: 'appearance', icon: <Palette /> },
  { id: 'schedule', icon: <Clock /> },
  { id: 'focus', icon: <Timer /> },
  { id: 'habits', icon: <Flame /> },
  { id: 'notifications', icon: <Bell /> },
  { id: 'shortcuts', icon: <Keyboard /> },
  { id: 'ai', icon: <Bot /> },
  { id: 'integrations', icon: <Plug /> },
  { id: 'privacy', icon: <Lock /> },
  { id: 'data', icon: <Database /> },
  { id: 'sync', icon: <Cloud /> },
  { id: 'account', icon: <User /> },
  { id: 'about', icon: <Info /> },
];

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export default function SettingsScreen() {
  const routeTab = useUi((s) => s.route.tab) as Section | undefined;
  const [section, setSection] = useState<Section>(routeTab ?? 'profile');
  const prefs = usePrefs();
  const set = (p: Partial<Preferences>) => updatePrefs(p);
  return (
    <div className="page settings">
      <header className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={cx('nav-item', section === s.id && 'active')} onClick={() => setSection(s.id)}>
              {s.icon}
              <span>{t(`settings.sections.${s.id}` as TKey)}</span>
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <h2 className="section-title" style={{ marginBottom: 14 }}>{t(`settings.sections.${section}` as TKey)}</h2>
          {section === 'profile' && (
            <div className="card card-pad stack gap-4">
              <Field label={t('settings.name')}><input className="input" value={prefs.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label={t('settings.language')}>
                <Segmented value={prefs.locale} onChange={(locale) => set({ locale })} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
              </Field>
            </div>
          )}
          {section === 'appearance' && (
            <div className="stack gap-4">
              <div className="theme-grid">
                {THEMES.map((th: ThemeId) => <ThemeCard key={th} id={th} active={prefs.theme === th} onClick={() => set({ theme: th })} />)}
              </div>
              <p className="faint xs">{t(`settings.themeHints.${prefs.theme}` as TKey)}</p>
              <div className="card card-pad">
                <Row label={t('settings.reducedMotion')}>
                  <Segmented value={prefs.reducedMotion} onChange={(reducedMotion) => set({ reducedMotion })} options={(['system', 'on', 'off'] as const).map((v) => ({ value: v, label: t(`settings.reducedMotionOptions.${v}`) }))} />
                </Row>
                <Row label={t('settings.reducedTransparency')}><Switch checked={prefs.reducedTransparency} onChange={(v) => set({ reducedTransparency: v })} label={t('settings.reducedTransparency')} /></Row>
                <Row label={t('settings.textSize')}>
                  <Segmented value={String(prefs.textScale)} onChange={(v) => set({ textScale: Number(v) })} options={['0.9', '1', '1.1', '1.25'].map((v) => ({ value: v, label: `${Math.round(Number(v) * 100)}%` }))} />
                </Row>
                <Row label={t('settings.ambient')}><Switch checked={prefs.ambient} onChange={(v) => set({ ambient: v })} label={t('settings.ambient')} /></Row>
                <Row label={t('settings.uiSounds')}><Switch checked={prefs.uiSounds} onChange={(v) => set({ uiSounds: v })} label={t('settings.uiSounds')} /></Row>
                <Row label={t('settings.gamification')} hint={t('settings.gamificationHint')}><Switch checked={prefs.gamification} onChange={(v) => set({ gamification: v })} label={t('settings.gamification')} /></Row>
              </div>
            </div>
          )}
          {section === 'schedule' && <ScheduleSection prefs={prefs} set={set} />}
          {section === 'focus' && (
            <div className="card card-pad">
              <Row label={t('settings.defaultFocus')}>
                <Segmented value={`${prefs.focus.focusMin}/${prefs.focus.breakMin}`} onChange={(v) => { const [f, b] = v.split('/').map(Number); set({ focus: { ...prefs.focus, focusMin: f, breakMin: b, longBreakMin: b * 3 } }); }} options={['25/5', '50/10', '90/20'].map((v) => ({ value: v, label: v }))} />
              </Row>
              <Row label={t('settings.autoBreaks')}><Switch checked={prefs.focus.autoStartBreaks} onChange={(v) => set({ focus: { ...prefs.focus, autoStartBreaks: v } })} label={t('settings.autoBreaks')} /></Row>
              <Row label={t('focus.sound')}>
                <select className="select" style={{ width: 200 }} value={prefs.focus.sound} onChange={(e) => set({ focus: { ...prefs.focus, sound: e.target.value } })}>
                  {AMBIENT_KINDS.map((k) => <option key={k} value={k}>{t(`sounds.${k}` as TKey)}</option>)}
                </select>
              </Row>
              <Row label={t('focus.volume')}>
                <input type="range" min={0} max={1} step={0.05} style={{ width: 200 }} value={prefs.focus.volume} onChange={(e) => set({ focus: { ...prefs.focus, volume: Number(e.target.value) } })} />
              </Row>
              <p className="faint xs" style={{ marginTop: 10 }}>{t('focus.musicNote')}</p>
            </div>
          )}
          {section === 'habits' && (
            <div className="card card-pad">
              <Row label={t('settings.graceDefault')} hint={t('habits.graceHint')}>
                <Segmented value={String(prefs.graceDaysDefault)} onChange={(v) => set({ graceDaysDefault: Number(v) })} options={['0', '1', '2', '3'].map((v) => ({ value: v, label: v }))} />
              </Row>
              <Row label={t('habits.vacation')}>
                <Switch checked={prefs.vacations.some((v) => v.end === null)} onChange={(on) => setVacation(on)} label={t('habits.vacation')} />
              </Row>
              {prefs.vacations.length > 0 && (
                <div className="faint xs" style={{ marginTop: 8 }}>
                  {t('settings.vacations')}: {prefs.vacations.map((v) => `${v.start} → ${v.end ?? '…'}`).join(' · ')}
                </div>
              )}
            </div>
          )}
          {section === 'notifications' && <NotificationsSection prefs={prefs} set={set} />}
          {section === 'shortcuts' && <ShortcutsSection prefs={prefs} set={set} />}
          {section === 'ai' && (
            <div className="card card-pad stack gap-4">
              <div className="row-flex gap-3"><Bot size={18} style={{ color: 'var(--accent)' }} /><b>{t('settings.aiTitle')}</b><PendingBadge /></div>
              <p className="muted small">{t('settings.aiBody')}</p>
              <p className="muted small">{t('settings.aiLocalNow')}</p>
              <Field label={t('settings.aiName')}><input className="input" style={{ maxWidth: 240 }} value={prefs.assistantName} onChange={(e) => set({ assistantName: e.target.value })} /></Field>
            </div>
          )}
          {section === 'integrations' && (
            <div className="card card-pad stack gap-4">
              <div className="row-flex gap-3"><Plug size={18} /><PendingBadge /></div>
              <p className="muted small">{t('settings.integrationsBody')}</p>
              <div><button className="btn btn-sm" onClick={() => void importIcsFile()}><Upload />{t('calendar.importIcs')}</button></div>
            </div>
          )}
          {section === 'privacy' && <PrivacySection />}
          {section === 'data' && <DataSection />}
          {section === 'sync' && <SyncSection />}
          {section === 'account' && (
            <div className="card card-pad stack gap-3">
              <div className="row-flex gap-3"><User size={18} /><b>{prefs.name || '—'}</b><PendingBadge /></div>
              <p className="muted small">{t('settings.accountBody')}</p>
            </div>
          )}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

function Row(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <div style={{ minWidth: 0 }}>
        <div className="small">{props.label}</div>
        {props.hint && <div className="faint xs">{props.hint}</div>}
      </div>
      <div className="row-flex gap-2">{props.children}</div>
    </div>
  );
}

function ScheduleSection({ prefs, set }: { prefs: Preferences; set: (p: Partial<Preferences>) => void }) {
  const events = useList('events');
  const fixed = events.filter((e) => e.recurrence && e.protected);
  return (
    <div className="stack gap-4">
      <div className="card card-pad">
        <Row label={t('settings.wake')}><input type="time" className="input" style={{ width: 120 }} value={prefs.sleep.wake} onChange={(e) => e.target.value && set({ sleep: { ...prefs.sleep, wake: e.target.value } })} /></Row>
        <Row label={t('settings.bed')}><input type="time" className="input" style={{ width: 120 }} value={prefs.sleep.bed} onChange={(e) => e.target.value && set({ sleep: { ...prefs.sleep, bed: e.target.value } })} /></Row>
        <Row label={t('settings.workDays')}>
          <div className="row-flex gap-1 wrap">
            {ORDER.map((d) => (
              <button key={d} className={cx('chip', prefs.workDays.includes(d) && 'active')} onClick={() => set({ workDays: prefs.workDays.includes(d) ? prefs.workDays.filter((x) => x !== d) : [...prefs.workDays, d] })}>{weekdayName(d, 'short')}</button>
            ))}
          </div>
        </Row>
        <Row label={t('settings.weekStart')}>
          <Segmented value={String(prefs.weekStartsOn)} onChange={(v) => set({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: weekdayName(1) }, { value: '0', label: weekdayName(0) }]} />
        </Row>
        <Row label={t('settings.buffer')}>
          <Segmented value={String(prefs.bufferMin)} onChange={(v) => set({ bufferMin: Number(v) })} options={['0', '5', '10', '15'].map((v) => ({ value: v, label: `${v} min` }))} />
        </Row>
        <Row label={t('settings.focusPeak')}>
          <select className="select" style={{ width: 210 }} value={prefs.focusPeak} onChange={(e) => set({ focusPeak: e.target.value as Preferences['focusPeak'] })}>
            {(['morning', 'afternoon', 'evening', 'auto'] as const).map((v) => <option key={v} value={v}>{t(`settings.focusPeaks.${v}`)}</option>)}
          </select>
        </Row>
      </div>
      <div className="card card-pad">
        <div className="row-flex" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 650 }}>{t('settings.fixedBlocks')}</div>
            <div className="faint xs">{t('settings.fixedBlocksHint')}</div>
          </div>
          <button className="btn btn-sm" onClick={() => {
            const ws = startOfWeek(todayFn(), 1);
            openEventEditor(null, { title: '', category: 'work', start: instantOf(ws, 9 * 60), end: instantOf(ws, 17 * 60), recurrence: { freq: 'weekly', interval: 1, byWeekday: prefs.workDays }, protected: true });
          }}><Plus />{t('settings.addFixedBlock')}</button>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          {fixed.map((e) => (
            <button key={e.id} className="menu-item" onClick={() => openEventEditor(e.id)}>
              <span className="grow ellipsis">{e.title}</span>
              <span className="faint xs">{new Date(e.start).toTimeString().slice(0, 5)}–{new Date(e.end).toTimeString().slice(0, 5)} · {describeRecurrence(e.recurrence)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsSection({ prefs, set }: { prefs: Preferences; set: (p: Partial<Preferences>) => void }) {
  const [perm, setPerm] = useState<NotifyPermission>('default');
  useEffect(() => {
    void notificationPermission().then(setPerm);
  }, []);
  const n = prefs.notifications;
  const setN = (p: Partial<Preferences['notifications']>) => set({ notifications: { ...n, ...p } });
  return (
    <div className="stack gap-4">
      <p className="muted small">{t('settings.notificationsHint')}</p>
      {perm === 'denied' && <div className="banner">{t('settings.permissionDenied')}</div>}
      <div className="card card-pad">
        <Row label={t('settings.notificationsEnabled')}>
          <Switch checked={n.enabled} onChange={async (v) => { setN({ enabled: v }); if (v) setPerm((await ensureNotificationPermission()) ? 'granted' : 'denied'); }} label={t('settings.notificationsEnabled')} />
        </Row>
        {(['tasks', 'habits', 'calendar', 'focus', 'goals', 'digest'] as const).map((k) => (
          <Row key={k} label={t(`settings.notifyCategories.${k}`)}>
            <Switch checked={n[k]} onChange={(v) => setN({ [k]: v })} label={t(`settings.notifyCategories.${k}`)} />
          </Row>
        ))}
        <Row label={t('settings.eventLead')}>
          <Segmented value={String(n.eventLeadMin)} onChange={(v) => setN({ eventLeadMin: Number(v) })} options={['5', '10', '15', '30'].map((v) => ({ value: v, label: `${v} min` }))} />
        </Row>
        <Row label={t('settings.quietHours')}>
          <input type="time" className="input" style={{ width: 110 }} value={n.quietStart} onChange={(e) => e.target.value && setN({ quietStart: e.target.value })} />
          <span className="faint">–</span>
          <input type="time" className="input" style={{ width: 110 }} value={n.quietEnd} onChange={(e) => e.target.value && setN({ quietEnd: e.target.value })} />
        </Row>
      </div>
      <div>
        <button className="btn btn-sm" onClick={async () => {
          const ok = (await ensureNotificationPermission()) && (await notify('Ember', t('notify.test')));
          if (!ok) toast(t('settings.permissionDenied'), { kind: 'error' });
        }}><Bell />{t('settings.testNotification')}</button>
      </div>
    </div>
  );
}

function ShortcutsSection({ prefs, set }: { prefs: Preferences; set: (p: Partial<Preferences>) => void }) {
  const [editing, setEditing] = useState<keyof Preferences['shortcuts'] | null>(null);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setEditing(null);
      if (e.key.length === 1) {
        set({ shortcuts: { ...prefs.shortcuts, [editing]: e.key.toLowerCase() } });
        setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, prefs.shortcuts, set]);
  return (
    <div className="stack gap-4">
      <p className="muted small">{t('settings.shortcutsHint')}</p>
      <div className="card card-pad">
        {SHORTCUT_KEYS.map((k) => (
          <Row key={k} label={t(`settings.shortcutNames.${k}` as TKey)}>
            <button className={cx('btn btn-sm', editing === k && 'btn-subtle')} onClick={() => setEditing(k)}>
              {editing === k ? t('settings.pressKey') : <Kbd>{prefs.shortcuts[k] === ' ' ? '␣' : prefs.shortcuts[k].toUpperCase()}</Kbd>}
            </button>
          </Row>
        ))}
        <Row label="⌘K / Ctrl+K"><span className="faint xs">{t('palette.placeholder')}</span></Row>
        <Row label="⌘Z / Ctrl+Z"><span className="faint xs">{t('common.undo')}</span></Row>
        <div style={{ marginTop: 10 }}><button className="btn btn-sm btn-ghost" onClick={() => set({ shortcuts: { ...DEFAULT_SHORTCUTS } })}><RotateCcw />{t('settings.reset')}</button></div>
      </div>
      <div className="card card-pad">
        <Row label={t('settings.captureShortcut')} hint={t('settings.captureShortcutHint')}>
          <input className="input mono" style={{ width: 220 }} defaultValue={prefs.captureShortcut} onBlur={(e) => e.target.value.trim() && set({ captureShortcut: e.target.value.trim() })} disabled={!isTauri()} />
        </Row>
      </div>
    </div>
  );
}

function PrivacySection() {
  const [loc, setLoc] = useState('');
  useEffect(() => {
    void getAdapter().location().then(setLoc);
  }, []);
  return (
    <div className="card card-pad stack gap-3">
      <p className="muted small">{t('settings.privacyBody')}</p>
      <div className="field-row"><span className="small">{t('settings.dataLocation')}</span><span className="mono xs faint selectable" style={{ wordBreak: 'break-all', textAlign: 'right' }}>{loc}</span></div>
      <div className="field-row"><span className="small">{t('settings.analytics')}</span><span className="faint xs">{t('settings.analyticsNone')}</span></div>
      <p className="faint xs">{t('settings.encryptionNote')}</p>
    </div>
  );
}

function DataSection() {
  const [demo, setDemo] = useState(false);
  const prefs = usePrefs();
  useEffect(() => {
    void hasDemo().then(setDemo);
  }, []);
  return (
    <div className="stack gap-4">
      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 10 }}>{t('settings.exportTitle')}</div>
        <div className="row-flex gap-2 wrap">
          <button className="btn btn-sm" onClick={() => void exportJson()}><Download />{t('settings.exportJson')}</button>
          <button className="btn btn-sm" onClick={() => void exportCsv()}><Download />{t('settings.exportCsv')}</button>
          <button className="btn btn-sm" onClick={() => void exportIcs()}><Download />{t('settings.exportIcs')}</button>
          <button className="btn btn-sm" onClick={() => void exportMarkdown()}><Download />{t('settings.exportMd')}</button>
        </div>
        <div className="eyebrow" style={{ margin: '18px 0 10px' }}>{t('settings.importTitle')}</div>
        <div className="row-flex gap-2 wrap">
          <button className="btn btn-sm" onClick={() => void importJson()}><Upload />{t('settings.importJson')}</button>
          <button className="btn btn-sm" onClick={() => void importCsv()}><Upload />{t('settings.importCsv')}</button>
          <button className="btn btn-sm" onClick={() => void importIcsFile()}><Upload />{t('settings.importIcs')}</button>
        </div>
        <p className="faint xs" style={{ marginTop: 12 }}>{t('settings.docs')}</p>
      </div>
      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 10 }}>{t('settings.demoData')}</div>
        {demo ? (
          <button className="btn btn-sm" onClick={async () => { await removeDemoData(); setDemo(false); toast(t('settings.demoRemoved')); }}><Trash />{t('settings.removeDemo')}</button>
        ) : (
          <button className="btn btn-sm" onClick={async () => { await loadDemoData(prefs.locale); setDemo(true); toast(t('settings.demoLoaded')); }}><Sun />{t('settings.loadDemo')}</button>
        )}
      </div>
      <div className="card card-pad danger-zone">
        <button className="btn btn-danger btn-sm" onClick={() => askConfirm({
          title: t('settings.deleteAll'),
          body: t('settings.deleteAllConfirm'),
          confirmLabel: t('settings.deleteAll'),
          danger: true,
          typed: prefs.locale === 'en' ? 'DELETE' : 'BORRAR',
          run: async () => {
            await wipeAll();
            toast(t('settings.deleted'));
          },
        })}><Trash />{t('settings.deleteAll')}</button>
      </div>
    </div>
  );
}

function SyncSection() {
  const conflicts = useList('conflicts').filter((c) => !c.resolvedAt);
  return (
    <div className="card card-pad stack gap-3">
      <div className="field-row"><span className="small">{t('settings.syncStatus')}</span><span className="row-flex gap-2 small"><i className="dot" style={{ color: 'var(--success)' }} />{t('settings.syncLocal')}</span></div>
      <p className="muted small">{t('settings.syncBody')}</p>
      <div className="field-row"><span className="small">{t('settings.conflicts')}</span><span className="faint xs">{conflicts.length ? conflicts.length : t('settings.noConflicts')}</span></div>
    </div>
  );
}

function AboutSection() {
  const kind = useData((s) => s.storageKind);
  const counts = useData((s) => s.c);
  const total = useMemo(() => Object.values(counts).reduce((a, r) => a + Object.keys(r).length, 0), [counts]);
  return (
    <div className="card card-pad stack gap-3">
      <div className="row-flex gap-3"><span className="brand-orb" /><b className="brand-name">Ember</b><span className="faint small">{t('settings.version', { version: APP_VERSION })}</span></div>
      <p className="muted small">{t('app.tagline')}</p>
      <div className="faint xs">{t('settings.storage', { kind: t(`settings.storageKinds.${kind}` as TKey) })} · {total}</div>
    </div>
  );
}
