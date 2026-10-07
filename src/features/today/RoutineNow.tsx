import { useMemo, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { ListChecks, Play } from 'lucide-react';
import { routineForNow, runProgress, routineMinutes } from '@core/routines';
import { useList } from '@/data/store';
import { useToday } from '@/data/selectors';
import { formatDuration, t, tp } from '@/i18n';
import { Bar, IconTile } from '@/ui/components/primitives';
import { colorValue } from '@/ui/theme/palette';
import { navigate, runRoutine } from '@/app/ui';
import { SPRING } from '@/ui/motion/springs';

/** La rutina que encaja con esta hora (si la hay y no está completa). */
export function RoutineNow({ hour }: { hour: number }) {
  const routines = useList('routines');
  const runs = useList('routineRuns');
  const today = useToday();
  const routine = useMemo(() => {
    const todayRuns = new Map(runs.filter((r) => r.date === today).map((r) => [r.routineId, r]));
    const r = routineForNow(routines, todayRuns, hour);
    return r ? { r, p: runProgress(r, todayRuns.get(r.id)) } : null;
  }, [routines, runs, today, hour]);
  if (!routine) return null;
  const { r, p } = routine;
  const color = colorValue(r.color);
  return (
    <motion.section
      className="card card-pad-sm routine-now"
      style={{ '--rc': color } as CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.liquid}
      aria-label={t('routines.forNow')}
    >
      <IconTile icon={r.icon} color={r.color} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="eyebrow">
          <ListChecks size={11} style={{ verticalAlign: -1 }} /> {t('routines.forNow')}
        </div>
        <div className="routine-now-title ellipsis">{r.name}</div>
        <div className="row-flex gap-3" style={{ marginTop: 6 }}>
          <div style={{ width: 120 }}>
            <Bar value={p.ratio} color={color} thin />
          </div>
          <span className="faint xs num">
            {p.done}/{p.total} · {tp('routines.steps', r.steps.length)}
            {routineMinutes(r) > 0 ? ` · ${formatDuration(routineMinutes(r))}` : ''}
          </span>
        </div>
      </div>
      <button className="btn btn-sm btn-ghost hide-mobile" onClick={() => navigate('routines')}>
        {t('nav.routines')}
      </button>
      <button className="btn btn-sm btn-primary magnetic" onClick={() => runRoutine(r.id)}>
        <Play /> {p.done > 0 ? t('routines.continue') : t('routines.start')}
      </button>
    </motion.section>
  );
}
