import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { parseInput } from '@core/nlp';
import type { Task } from '@core/types';
import { captureParsed } from '@/data/actions';
import { useToday } from '@/data/selectors';
import { updateEntity } from '@/data/store';
import { t } from '@/i18n';
import { tokenLabel } from '@/ui/format';
import { useProjectNames } from '@/app/QuickCapture';
import { toast } from '@/app/ui';
import { playUiSound } from '@/platform/sound';

/** Fila "añadir tarea" con entrada inteligente. `defaults` se aplica si el texto no lo indica. */
export function InlineAdd(props: { defaults?: Partial<Pick<Task, 'date' | 'projectId' | 'areaId' | 'goalId' | 'status' | 'parentId' | 'inbox'>>; placeholder?: string }) {
  const [text, setText] = useState('');
  const today = useToday();
  const projects = useProjectNames();
  const parsed = useMemo(() => parseInput(text, { today, projects }), [text, today, projects]);
  const submit = () => {
    if (!text.trim()) return;
    const res = captureParsed(parsed, 'task', text);
    if ('error' in res) return;
    const d = props.defaults ?? {};
    const patch: Partial<Task> = { inbox: d.inbox ?? false };
    if (d.date && !parsed.date && !parsed.deadline) patch.date = d.date;
    if (d.projectId && !parsed.project) patch.projectId = d.projectId;
    if (d.areaId) patch.areaId = d.areaId;
    if (d.goalId) patch.goalId = d.goalId;
    if (d.status) patch.status = d.status;
    if (d.parentId) patch.parentId = d.parentId;
    updateEntity('tasks', res.id, patch);
    playUiSound('complete');
    setText('');
    if (res.kind !== 'task') toast(t('capture.savedTask'));
  };
  const chips = text.trim()
    ? parsed.tokens.map((tok) => tokenLabel(tok, parsed, today)).filter((x): x is string => !!x)
    : [];
  return (
    <div>
      <div className="add-row">
        <Plus size={16} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={props.placeholder ?? t('tasks.addPlaceholder')}
          aria-label={t('tasks.newTask')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') setText('');
          }}
        />
      </div>
      {chips.length > 0 && (
        <div className="parse-chips">
          {chips.map((c, i) => (
            <span key={i} className="tag info">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
