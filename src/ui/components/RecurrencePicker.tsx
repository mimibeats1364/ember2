import type { Recurrence, Weekday } from '@core/types';
import { weekdayOf } from '@core/dates';
import { t, weekdayName } from '@/i18n';
import { cx } from './primitives';

type Preset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom' | 'interval' | 'monthly' | 'yearly';

function presetOf(r: Recurrence | null): Preset {
  if (!r) return 'none';
  if (r.freq === 'daily') return r.interval > 1 ? 'interval' : 'daily';
  if (r.freq === 'weekly') {
    const d = [...(r.byWeekday ?? [])].sort().join();
    if (d === '1,2,3,4,5') return 'weekdays';
    return (r.byWeekday?.length ?? 0) > 1 ? 'custom' : 'weekly';
  }
  return r.freq === 'monthly' ? 'monthly' : 'yearly';
}

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function RecurrencePicker(props: { value: Recurrence | null; anchor: string; onChange: (r: Recurrence | null) => void }) {
  const preset = presetOf(props.value);
  const anchorDay = weekdayOf(props.anchor);
  const set = (p: Preset) => {
    switch (p) {
      case 'none':
        return props.onChange(null);
      case 'daily':
        return props.onChange({ freq: 'daily', interval: 1 });
      case 'interval':
        return props.onChange({ freq: 'daily', interval: 2 });
      case 'weekdays':
        return props.onChange({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] });
      case 'weekly':
        return props.onChange({ freq: 'weekly', interval: 1, byWeekday: [anchorDay] });
      case 'custom':
        return props.onChange({ freq: 'weekly', interval: 1, byWeekday: props.value?.byWeekday?.length ? props.value.byWeekday : [anchorDay] });
      case 'monthly':
        return props.onChange({ freq: 'monthly', interval: 1 });
      case 'yearly':
        return props.onChange({ freq: 'yearly', interval: 1 });
    }
  };
  return (
    <div className="stack gap-2">
      <select className="select" value={preset === 'custom' ? 'custom' : preset} onChange={(e) => set(e.target.value as Preset)} aria-label={t('task.repeat')}>
        <option value="none">{t('recurrence.none')}</option>
        <option value="daily">{t('recurrence.daily')}</option>
        <option value="weekdays">{t('recurrence.weekdays')}</option>
        <option value="weekly">{t('recurrence.weekly')}</option>
        <option value="custom">{t('recurrence.custom')}</option>
        <option value="interval">{t('recurrence.everyNDays', { n: 'N' })}</option>
        <option value="monthly">{t('recurrence.monthly')}</option>
        <option value="yearly">{t('recurrence.yearly')}</option>
      </select>
      {(preset === 'custom' || preset === 'weekly' || preset === 'weekdays') && (
        <div className="row-flex gap-1 wrap">
          {ORDER.map((d) => {
            const on = props.value?.byWeekday?.includes(d) ?? false;
            return (
              <button
                key={d}
                className={cx('chip', on && 'active')}
                style={{ height: 26, padding: '0 9px' }}
                onClick={() => {
                  const cur = new Set(props.value?.byWeekday ?? []);
                  if (on) cur.delete(d);
                  else cur.add(d);
                  const days = [...cur] as Weekday[];
                  props.onChange(days.length ? { freq: 'weekly', interval: props.value?.interval ?? 1, byWeekday: days } : null);
                }}
              >
                {weekdayName(d, 'short')}
              </button>
            );
          })}
        </div>
      )}
      {props.value && props.value.interval > 1 || preset === 'interval' ? (
        <label className="row-flex gap-2 small muted">
          ×
          <input
            type="number"
            min={1}
            max={365}
            className="input"
            style={{ width: 80, height: 30 }}
            value={props.value?.interval ?? 1}
            onChange={(e) => props.value && props.onChange({ ...props.value, interval: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
      ) : null}
    </div>
  );
}
