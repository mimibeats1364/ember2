import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Preferences, ThemeId, Weekday } from '@core/types';
import { instantOf, localTimeZone, startOfWeek, today as todayFn } from '@core/dates';
import { createEntity, transaction, updatePrefs, usePrefs } from '@/data/store';
import { createHabit } from '@/data/actions';
import { eventFields, goalFields } from '@/data/defaults';
import { loadDemoData } from '@/data/seed';
import { t, tList, weekdayName, type TKey } from '@/i18n';
import { cx, Switch } from '@/ui/components/primitives';
import { THEMES, THEME_SWATCHES } from '@/ui/theme/palette';
import { ensureNotificationPermission } from '@/platform/native';
import { AmbientBackground } from '@/ui/components/Ambient';

const TOTAL = 5;
const HABIT_ICONS = ['🏋️', '📖', '🧘', '💧', '🧠', '💤', '🎸'];
const HABIT_COLORS = ['ember', 'violet', 'mint', 'cyan', 'amber', 'indigo', 'magenta'];
const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function Onboarding() {
  const prefs = usePrefs();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(prefs.name);
  const [userType, setUserType] = useState<Preferences['userType']>('both');
  const [wake, setWake] = useState('07:30');
  const [bed, setBed] = useState('23:30');
  const [workDays, setWorkDays] = useState<Weekday[]>([1, 2, 3, 4, 5]);
  const [work, setWork] = useState<{ on: boolean; start: string; end: string }>({ on: false, start: '09:00', end: '17:00' });
  const [study, setStudy] = useState<{ on: boolean; start: string; end: string }>({ on: false, start: '11:00', end: '15:00' });
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');
  const [focus, setFocus] = useState<'25/5' | '50/10' | '90/20'>('25/5');
  const [habits, setHabits] = useState<number[]>([]);
  const [theme, setTheme] = useState<ThemeId>(prefs.theme);
  const [gamification, setGamification] = useState(false);
  const [demo, setDemo] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);

  const goalPresets = tList('onboarding.goalPresets');
  const habitPresets = tList('onboarding.habitPresets');

  const finish = async () => {
    setBusy(true);
    const [f, b] = focus.split('/').map(Number);
    transaction('onboarding', () => {
      const tz = localTimeZone();
      const ws = startOfWeek(todayFn(), 1);
      if ((userType === 'work' || userType === 'both') && work.on) {
        createEntity('events', eventFields({ title: t('categories.work'), category: 'work', start: instantOf(ws, work.start), end: instantOf(ws, work.end), tz, recurrence: { freq: 'weekly', interval: 1, byWeekday: workDays }, protected: true, reminders: [] }));
      }
      if ((userType === 'study' || userType === 'both') && study.on) {
        createEntity('events', eventFields({ title: t('categories.study'), category: 'study', start: instantOf(ws, study.start), end: instantOf(ws, study.end), tz, recurrence: { freq: 'weekly', interval: 1, byWeekday: workDays }, protected: true, reminders: [] }));
      }
      for (const g of goals.slice(0, 3)) createEntity('goals', goalFields({ title: g }));
      habits.forEach((i, k) => createHabit({ name: habitPresets[i], icon: HABIT_ICONS[i], color: HABIT_COLORS[i], order: k }));
      updatePrefs({
        name: name.trim(),
        userType,
        sleep: { wake, bed },
        workDays,
        mainGoals: goals,
        focus: { ...prefs.focus, focusMin: f, breakMin: b, longBreakMin: b * 3 },
        theme,
        gamification,
        notifications: { ...prefs.notifications, enabled: notifications },
      });
    });
    if (notifications) await ensureNotificationPermission();
    if (demo) await loadDemoData(prefs.locale);
    updatePrefs({ onboarded: true });
  };

  const skip = () => updatePrefs({ onboarded: true });
  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : void finish());

  return (
    <div className="onboarding" data-theme={theme}>
      <AmbientBackground calm={false} />
      <div className="drag-region" data-tauri-drag-region />
      <div className="ob-card">
        <div className="row-flex" style={{ justifyContent: 'space-between', marginBottom: 28 }}>
          <div className="ob-progress" aria-label={t('onboarding.step', { n: step + 1, total: TOTAL })}>
            {Array.from({ length: TOTAL }, (_, i) => <i key={i} className={cx(i <= step && 'on')} />)}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={skip}>{t('onboarding.skip')}</button>
        </div>

        {step === 0 && (
          <div className="ob-step" key="0">
            <div className="ob-orb" />
            <h1 className="ob-title" style={{ marginTop: 28 }}>{t('onboarding.welcome')}</h1>
            <p className="ob-body">{t('onboarding.welcomeBody')}</p>
            <label className="field" style={{ marginTop: 26, maxWidth: 360 }}>
              <span className="field-label">{t('onboarding.nameQuestion')}</span>
              <input className="input" style={{ height: 46, fontSize: 'var(--fs-md)' }} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('onboarding.namePlaceholder')} onKeyDown={(e) => e.key === 'Enter' && next()} />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="ob-step" key="1">
            <h1 className="ob-title">{t('onboarding.whatDo')}</h1>
            <div className="ob-options">
              {(['work', 'study', 'both', 'other'] as const).map((u) => (
                <button key={u} className={cx('chip', userType === u && 'active')} onClick={() => setUserType(u)}>{t(`onboarding.userTypes.${u}`)}</button>
              ))}
            </div>
            <div className="eyebrow" style={{ marginTop: 26 }}>{t('onboarding.schedule')}</div>
            <div className="row-flex gap-4 wrap" style={{ marginTop: 10 }}>
              <label className="field"><span className="field-label">{t('onboarding.wake')}</span><input type="time" className="input" value={wake} onChange={(e) => setWake(e.target.value)} /></label>
              <label className="field"><span className="field-label">{t('onboarding.bed')}</span><input type="time" className="input" value={bed} onChange={(e) => setBed(e.target.value)} /></label>
            </div>
            <div className="row-flex gap-1 wrap" style={{ marginTop: 14 }}>
              {ORDER.map((d) => (
                <button key={d} className={cx('chip', workDays.includes(d) && 'active')} onClick={() => setWorkDays(workDays.includes(d) ? workDays.filter((x) => x !== d) : [...workDays, d])}>{weekdayName(d, 'short')}</button>
              ))}
            </div>
            {(userType === 'work' || userType === 'both') && (
              <BlockRow label={t('onboarding.workHours')} value={work} onChange={setWork} />
            )}
            {(userType === 'study' || userType === 'both') && (
              <BlockRow label={t('onboarding.studyHours')} value={study} onChange={setStudy} />
            )}
          </div>
        )}

        {step === 2 && (
          <div className="ob-step" key="2">
            <h1 className="ob-title">{t('onboarding.goalsQuestion')}</h1>
            <p className="ob-body">{t('onboarding.goalsHint')}</p>
            <div className="ob-options">
              {[...goalPresets, ...goals.filter((g) => !goalPresets.includes(g))].map((g) => (
                <button key={g} className={cx('chip', goals.includes(g) && 'active')} onClick={() => setGoals(goals.includes(g) ? goals.filter((x) => x !== g) : goals.length < 3 ? [...goals, g] : goals)}>{g}</button>
              ))}
            </div>
            <input className="input" style={{ marginTop: 14, maxWidth: 360 }} value={customGoal} placeholder={t('onboarding.customGoal')} onChange={(e) => setCustomGoal(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Enter' && customGoal.trim() && goals.length < 3) {
                setGoals([...goals, customGoal.trim()]);
                setCustomGoal('');
              }
            }} />
          </div>
        )}

        {step === 3 && (
          <div className="ob-step" key="3">
            <h1 className="ob-title">{t('onboarding.focusQuestion')}</h1>
            <div className="ob-options">
              {(['25/5', '50/10', '90/20'] as const).map((f) => (
                <button key={f} className={cx('chip', focus === f && 'active')} onClick={() => setFocus(f)}>{f} min</button>
              ))}
            </div>
            <h2 className="ob-title" style={{ fontSize: 'var(--fs-xl)', marginTop: 30 }}>{t('onboarding.habitsQuestion')}</h2>
            <div className="ob-options">
              {habitPresets.map((h, i) => (
                <button key={h} className={cx('chip', habits.includes(i) && 'active')} onClick={() => setHabits(habits.includes(i) ? habits.filter((x) => x !== i) : [...habits, i])}>{HABIT_ICONS[i]} {h}</button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="ob-step" key="4">
            <h1 className="ob-title">{t('onboarding.themeQuestion')}</h1>
            <div className="theme-grid" style={{ marginTop: 18 }}>
              {THEMES.map((th) => (
                <ThemeCard key={th} id={th} active={theme === th} onClick={() => { setTheme(th); updatePrefs({ theme: th }); }} />
              ))}
            </div>
            <div className="card card-pad-sm" style={{ marginTop: 20 }}>
              <div className="field-row"><span className="small">{t('onboarding.gamification')}</span><Switch checked={gamification} onChange={setGamification} label={t('onboarding.gamification')} /></div>
              <div className="field-row"><span className="small">{t('settings.notificationsEnabled')}</span><Switch checked={notifications} onChange={setNotifications} label={t('settings.notificationsEnabled')} /></div>
              <div className="field-row"><span className="small">{t('onboarding.demo')}</span><Switch checked={demo} onChange={setDemo} label={t('onboarding.demo')} /></div>
            </div>
          </div>
        )}

        <div className="ob-foot">
          {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft /> {t('common.back')}</button> : <span />}
          <button className="btn btn-primary btn-lg" onClick={next} disabled={busy}>
            {step === TOTAL - 1 ? t('onboarding.finish') : t('common.next')} <ArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockRow({ label, value, onChange }: { label: string; value: { on: boolean; start: string; end: string }; onChange: (v: { on: boolean; start: string; end: string }) => void }) {
  return (
    <div className="row-flex gap-3 wrap" style={{ marginTop: 16 }}>
      <Switch checked={value.on} onChange={(on) => onChange({ ...value, on })} label={label} />
      <span className="small" style={{ minWidth: 150 }}>{label}</span>
      {value.on ? (
        <>
          <input type="time" className="input" style={{ width: 110 }} value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} />
          <span className="faint">–</span>
          <input type="time" className="input" style={{ width: 110 }} value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} />
        </>
      ) : (
        <span className="faint small">{t('onboarding.noFixed')}</span>
      )}
    </div>
  );
}

export function ThemeCard({ id, active, onClick }: { id: ThemeId; active: boolean; onClick: () => void }) {
  const [bg, surface, accent] = THEME_SWATCHES[id];
  return (
    <button className={cx('theme-card', active && 'active')} onClick={onClick} aria-pressed={active}>
      <div className="theme-prev" style={{ background: bg }}>
        <i style={{ background: surface }} />
        <b style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
      </div>
      <div className="theme-name">{t(`settings.themes.${id}` as TKey)}</div>
    </button>
  );
}
