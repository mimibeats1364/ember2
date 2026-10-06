import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CircleCheck, Flame, Lightbulb, NotebookPen, type LucideIcon } from 'lucide-react';
import { parseInput, type ParsedInput } from '@core/nlp';
import { today as todayFn } from '@core/dates';
import { captureParsed, type CaptureKind } from '@/data/actions';
import { useList } from '@/data/store';
import { t, type TKey } from '@/i18n';
import { tokenLabel } from '@/ui/format';
import { cx, Kbd, Modal } from '@/ui/components/primitives';
import { closeCapture, openTask, toast, useUi, navigate, openHabitEditor } from './ui';
import { playUiSound } from '@/platform/sound';

export const CAPTURE_KINDS: { kind: CaptureKind; icon: LucideIcon }[] = [
  { kind: 'task', icon: CircleCheck },
  { kind: 'note', icon: NotebookPen },
  { kind: 'idea', icon: Lightbulb },
  { kind: 'habit', icon: Flame },
  { kind: 'event', icon: CalendarDays },
];

function suggestedKind(p: ParsedInput): CaptureKind {
  return p.kind === 'note' ? 'note' : p.kind === 'idea' ? 'idea' : p.kind === 'habit' ? 'habit' : p.kind === 'event' ? 'event' : 'task';
}

/** Caja de captura con análisis en vivo. Se usa en el modal y en la ventana global. */
export function CaptureBox(props: {
  initialKind?: CaptureKind;
  initialText?: string;
  projects?: string[];
  onSubmit: (text: string, kind: CaptureKind, parsed: ParsedInput) => boolean | void;
  onCancel: () => void;
  autoFocusKey?: number;
}) {
  const [text, setText] = useState(props.initialText ?? '');
  const [kind, setKind] = useState<CaptureKind>(props.initialKind ?? 'task');
  const [touchedKind, setTouchedKind] = useState(!!props.initialKind && props.initialKind !== 'task');
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayFn();
  const parsed = useMemo(() => parseInput(text, { today, projects: props.projects }), [text, today, props.projects]);
  const effectiveKind = touchedKind ? kind : suggestedKind(parsed);

  useEffect(() => {
    inputRef.current?.focus();
  }, [props.autoFocusKey]);

  const submit = () => {
    if (!text.trim()) return;
    const ok = props.onSubmit(text, effectiveKind, parsed);
    if (ok !== false) {
      setText('');
      setTouchedKind(false);
    }
  };

  const chips = parsed.tokens
    .map((tok) => ({ tok, label: tokenLabel(tok, parsed, today) }))
    .filter((c): c is { tok: typeof c.tok; label: string } => !!c.label);

  return (
    <div className="capture">
      <div className="capture-input">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('capture.placeholder')}
          aria-label={t('capture.title')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              props.onCancel();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              const idx = CAPTURE_KINDS.findIndex((k) => k.kind === effectiveKind);
              const next = CAPTURE_KINDS[(idx + (e.shiftKey ? CAPTURE_KINDS.length - 1 : 1)) % CAPTURE_KINDS.length].kind;
              setKind(next);
              setTouchedKind(true);
            }
          }}
        />
      </div>
      <div className="capture-kinds" role="radiogroup" aria-label={t('capture.title')}>
        {CAPTURE_KINDS.map(({ kind: k, icon: Icon }) => (
          <button
            key={k}
            role="radio"
            aria-checked={effectiveKind === k}
            className={cx('chip', effectiveKind === k && 'active')}
            onClick={() => {
              setKind(k);
              setTouchedKind(true);
              inputRef.current?.focus();
            }}
          >
            <Icon />
            {t(`capture.kinds.${k}` as TKey)}
          </button>
        ))}
      </div>
      {(chips.length > 0 || parsed.tags.length > 0) && text.trim() && (
        <div className="parse-chips" aria-live="polite">
          <span className="eyebrow" style={{ alignSelf: 'center' }}>
            {t('capture.detected')}
          </span>
          <span className="tag accent">{parsed.title || text}</span>
          {chips.map((c, i) => (
            <span key={i} className="tag info">
              {c.label}
            </span>
          ))}
          {parsed.tags.map((tag) => (
            <span key={tag} className="tag">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="capture-hint">
        <Kbd>↵</Kbd> {t('capture.hint')}
      </div>
    </div>
  );
}

export function useProjectNames(): string[] {
  const projects = useList('projects');
  return useMemo(() => projects.filter((p) => p.status !== 'archived').map((p) => p.name), [projects]);
}

/** Ejecuta la captura en la ventana principal (dueña de los datos) y da feedback. */
export function performCapture(text: string, kind: CaptureKind, parsed: ParsedInput, opts: { silent?: boolean } = {}): boolean {
  const res = captureParsed(parsed, kind, text);
  if ('error' in res) {
    toast(t('capture.needsTime'), { kind: 'error' });
    return false;
  }
  playUiSound('complete');
  if (!opts.silent) {
    toast(t(res.messageKey), {
      action:
        res.kind === 'task'
          ? { label: t('common.open'), run: () => openTask(res.id) }
          : res.kind === 'habit'
            ? { label: t('common.edit'), run: () => openHabitEditor(res.id) }
            : res.kind === 'note' || res.kind === 'idea'
              ? { label: t('common.open'), run: () => navigate('notes', { id: res.id }) }
              : { label: t('common.open'), run: () => navigate('calendar') },
    });
  }
  return true;
}

export function QuickCaptureModal() {
  const capture = useUi((s) => s.capture);
  const projects = useProjectNames();
  if (!capture) return null;
  return (
    <Modal onClose={closeCapture} label={t('capture.title')} className="capture-modal">
      <CaptureBox
        initialKind={capture.kind}
        initialText={capture.text}
        projects={projects}
        onCancel={closeCapture}
        onSubmit={(text, kind, parsed) => {
          const ok = performCapture(text, kind, parsed);
          if (ok) closeCapture();
          return ok;
        }}
      />
    </Modal>
  );
}
