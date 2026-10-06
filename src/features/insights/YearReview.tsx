import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { bestWeeks, minutesByProject } from '@core/analytics';
import { computeStreak, indexLogs } from '@core/habits';
import { localDateOf } from '@core/dates';
import { useData, usePrefs } from '@/data/store';
import { useToday } from '@/data/selectors';
import { formatDate, formatDuration, formatNumber, t } from '@/i18n';
import { Bar } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { useUi } from '@/app/ui';
import './insights.css';

/** "Mi año": resumen anual tipo Wrapped, solo con datos reales registrados. */
export default function YearReview() {
  const c = useData((s) => s.c);
  const today = useToday();
  const prefs = usePrefs();
  const year = Number(today.slice(0, 4));
  const close = () => useUi.setState({ yearReview: false });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const data = useMemo(() => {
    const inYear = (iso: string | null) => !!iso && Number(localDateOf(iso).slice(0, 4)) === year;
    const tasks = Object.values(c.tasks).filter((x) => !x.deletedAt);
    const sessions = Object.values(c.focusSessions).filter((s) => !s.deletedAt && inYear(s.startedAt));
    const logs = Object.values(c.habitLogs).filter((l) => !l.deletedAt && l.status === 'done' && Number(l.date.slice(0, 4)) === year);
    const tasksById = Object.fromEntries(tasks.map((x) => [x.id, x]));
    const byProject = [...minutesByProject(sessions, Object.values(c.timeEntries), tasksById).entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    let longest = 0;
    for (const h of Object.values(c.habits)) {
      if (h.deletedAt) continue;
      const s = computeStreak(h, indexLogs(Object.values(c.habitLogs).filter((l) => l.habitId === h.id)), today, prefs.vacations);
      longest = Math.max(longest, s.unit === 'days' ? s.best : 0);
    }
    return {
      tasks: tasks.filter((x) => x.status === 'done' && inYear(x.completedAt)).length,
      focusMin: sessions.reduce((a, s) => a + s.focusSec, 0) / 60,
      habits: logs.length,
      projects: Object.values(c.projects).filter((p) => !p.deletedAt && p.status === 'done' && inYear(p.completedAt)).length,
      goals: Object.values(c.goals).filter((g) => !g.deletedAt && g.status === 'done' && inYear(g.completedAt)).length,
      weeks: bestWeeks(sessions, year),
      byProject,
      longest,
    };
  }, [c, year, today, prefs.vacations]);
  const empty = data.tasks === 0 && data.focusMin === 0 && data.habits === 0;
  const maxP = Math.max(1, ...data.byProject.map(([, m]) => m));
  return (
    <div className="year" role="dialog" aria-modal="true" aria-label={t('year.title', { year })}>
      <button className="btn btn-ghost btn-icon" style={{ position: 'fixed', top: 40, right: 28 }} onClick={close} aria-label={t('year.close')}><X /></button>
      <div className="year-card">
        <div className="eyebrow accent">{t('year.intro')}</div>
        <h1 className="year-title">{t('year.title', { year })}</h1>
        {empty ? <p className="muted">{t('year.empty')}</p> : (
          <>
            <div className="year-stats">
              <div className="card year-stat"><div className="n num">{formatNumber(data.tasks)}</div><div className="l">{t('year.tasks')}</div></div>
              <div className="card year-stat" style={{ animationDelay: '80ms' }}><div className="n num">{formatNumber(Math.round(data.focusMin / 60))} h</div><div className="l">{t('year.focus')}</div></div>
              <div className="card year-stat" style={{ animationDelay: '160ms' }}><div className="n num">{formatNumber(data.habits)}</div><div className="l">{t('year.habits')}</div></div>
              <div className="card year-stat" style={{ animationDelay: '240ms' }}><div className="n num">{data.projects}</div><div className="l">{t('year.projects')}</div></div>
              <div className="card year-stat" style={{ animationDelay: '320ms' }}><div className="n num">{data.goals}</div><div className="l">{t('year.goals')}</div></div>
              <div className="card year-stat" style={{ animationDelay: '400ms' }}><div className="n num">🔥 {data.longest}</div><div className="l">{t('year.longestStreak')}</div></div>
            </div>
            {data.weeks.length > 0 && (
              <div className="year-section">
                <h2 className="section-title">{t('year.bestWeeks')}</h2>
                {data.weeks.map((w) => (
                  <div key={w.weekStart} className="row-flex gap-3 small" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="grow">{t('year.weekOf', { date: formatDate(w.weekStart, 'dayMonth') })}</span>
                    <span className="num">{formatDuration(w.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
            {data.byProject.length > 0 && (
              <div className="year-section">
                <h2 className="section-title">{t('year.topAreas')}</h2>
                {data.byProject.map(([pid, m]) => {
                  const p = pid ? c.projects[pid] : undefined;
                  return (
                    <div key={pid ?? 'none'} className="proj-bar">
                      <span className="small ellipsis" style={{ fontWeight: 600 }}>{p ? `${p.icon} ${p.name}` : t('insights.noProject')}</span>
                      <Bar value={m / maxP} color={p ? colorValue(p.color) : undefined} />
                      <span className="num xs faint">{formatDuration(m)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
