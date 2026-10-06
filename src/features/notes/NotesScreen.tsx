import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, Eye, Lightbulb, ListChecks, NotebookPen, Pencil, Pin, PinOff, Plus, Search, Trash, X, Link as LinkIcon } from 'lucide-react';
import type { Note } from '@core/types';
import { normalizeText } from '@core/nlp';
import { localDateOf } from '@core/dates';
import { createEntity, deleteEntity, getEntity, updateEntity, useCollection, useEntity, useList, transaction, undo } from '@/data/store';
import { useToday } from '@/data/selectors';
import { ensureTags } from '@/data/actions';
import { noteFields, taskFields } from '@/data/defaults';
import { relativeDay, t, type TKey } from '@/i18n';
import { Chips, cx, Empty } from '@/ui/components/primitives';
import { renderMarkdown, toggleChecklist, uncheckedItems, wikilinksIn } from '@/ui/markdown';
import { navigate, toast, useUi } from '@/app/ui';
import './notes.css';

type Filter = 'all' | 'ideas' | 'pinned' | 'inbox';

export default function NotesScreen() {
  const routeId = useUi((s) => s.route.id);
  const notes = useList('notes');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const today = useToday();
  const selected = routeId ?? null;
  const visible = useMemo(() => {
    const nq = normalizeText(q.trim());
    return notes
      .filter((n) => !n.archived)
      .filter((n) => filter === 'all' || (filter === 'ideas' ? n.kind === 'idea' : filter === 'pinned' ? n.pinned : n.inbox))
      .filter((n) => !nq || normalizeText(`${n.title} ${n.body}`).includes(nq))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, q, filter]);
  const create = (kind: 'note' | 'idea') => {
    const n = createEntity('notes', noteFields({ kind }));
    navigate('notes', { id: n.id });
  };
  return (
    <div className={cx('page wide notes-page', selected && 'has-selection')}>
      <aside className="notes-list">
        <div className="row-flex gap-2" style={{ justifyContent: 'space-between' }}>
          <h1 className="page-title">{t('notes.title')}</h1>
          <div className="row-flex gap-1">
            <button className="btn btn-icon btn-sm" title={t('notes.newIdea')} aria-label={t('notes.newIdea')} onClick={() => create('idea')}><Lightbulb /></button>
            <button className="btn btn-primary btn-icon btn-sm" title={t('notes.newNote')} aria-label={t('notes.newNote')} onClick={() => create('note')}><Plus /></button>
          </div>
        </div>
        <p className="page-subtitle">{t('notes.subtitle')}</p>
        <div className="notes-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('notes.searchPlaceholder')} aria-label={t('notes.searchPlaceholder')} />
        </div>
        <Chips scroll value={filter} onChange={setFilter} options={(['all', 'ideas', 'pinned', 'inbox'] as Filter[]).map((f) => ({ value: f, label: t(`notes.filters.${f}` as TKey) }))} />
        <div className="notes-items">
          {visible.map((n) => (
            <button key={n.id} className={cx('note-item', selected === n.id && 'active')} onClick={() => navigate('notes', { id: n.id })}>
              <div className="row-flex gap-2">
                {n.kind === 'idea' ? <Lightbulb size={13} className="faint" /> : <NotebookPen size={13} className="faint" />}
                <span className="note-item-title ellipsis">{n.title || t('common.untitled')}</span>
                {n.pinned && <Pin size={12} style={{ color: 'var(--accent)', marginLeft: 'auto', flex: 'none' }} />}
              </div>
              <div className="note-item-snippet">{n.body.replace(/[#>*_`\-[\]]/g, '').slice(0, 110) || '—'}</div>
              <div className="faint xs">{relativeDay(localDateOf(n.createdAt), today)}{n.inbox ? ` · ${t('nav.inbox')}` : ''}</div>
            </button>
          ))}
          {visible.length === 0 && <Empty compact icon={<NotebookPen />} title={t('notes.empty')} body={t('notes.emptyHint')} action={<button className="btn btn-sm" onClick={() => create('note')}><Plus />{t('notes.createFirst')}</button>} />}
        </div>
      </aside>
      <section className="notes-editor">
        {selected ? <NoteEditor key={selected} id={selected} /> : <div className="empty" style={{ height: '100%' }}><NotebookPen size={26} className="faint" /><p>{t('notes.selectHint')}</p></div>}
      </section>
    </div>
  );
}

function NoteEditor({ id }: { id: string }) {
  const note = useEntity('notes', id);
  const notes = useList('notes');
  const projects = useList('projects');
  const goals = useList('goals');
  const areas = useList('areas');
  const tasks = useList('tasks');
  const tags = useCollection('tags');
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [mode, setMode] = useState<'edit' | 'preview'>(note && note.body.length > 0 ? 'preview' : 'edit');
  const [tagInput, setTagInput] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Autoguardado (debounce): solo si el contenido cambió de verdad.
  useEffect(() => {
    const h = setTimeout(() => {
      const current = getEntity('notes', id);
      if (!current || (current.title === title && current.body === body)) return;
      updateEntity('notes', id, { title, body });
      setSavedAt(Date.now());
    }, 450);
    return () => clearTimeout(h);
  }, [title, body, id]);

  const titleSet = useMemo(() => new Set(notes.map((n) => n.title.trim().toLowerCase()).filter(Boolean)), [notes]);
  const html = useMemo(() => renderMarkdown(body, titleSet), [body, titleSet]);
  const backlinks = useMemo(() => (note?.title ? notes.filter((n) => n.id !== id && wikilinksIn(n.body).some((l) => l.toLowerCase() === note.title.trim().toLowerCase())) : []), [notes, note?.title, id]);
  const pending = uncheckedItems(body);

  if (!note || note.deletedAt) return <Empty icon={<NotebookPen />} title={t('common.notAvailable')} />;
  const set = (p: Partial<Note>) => updateEntity('notes', id, p);

  const onPreviewClick = (e: ReactMouseEvent) => {
    const el = e.target as HTMLElement;
    const check = el.closest<HTMLInputElement>('input[data-check]');
    if (check) {
      e.preventDefault();
      setBody((b) => toggleChecklist(b, Number(check.dataset.check)));
      return;
    }
    const wl = el.closest<HTMLElement>('[data-wikilink]');
    if (wl) {
      const target = wl.dataset.wikilink!;
      const found = notes.find((n) => n.title.trim().toLowerCase() === target.toLowerCase());
      if (found) navigate('notes', { id: found.id });
      else {
        const created = createEntity('notes', noteFields({ title: target, projectId: note.projectId }));
        navigate('notes', { id: created.id });
      }
    }
  };

  return (
    <div className="note-editor">
      <div className="note-toolbar">
        <button className="btn btn-ghost btn-sm only-mobile" onClick={() => navigate('notes')}><ArrowLeft /></button>
        <div className="seg">
          <button className={cx('seg-item', mode === 'edit' && 'active')} onClick={() => setMode('edit')}><Pencil />{t('notes.editMode')}</button>
          <button className={cx('seg-item', mode === 'preview' && 'active')} onClick={() => setMode('preview')}><Eye />{t('notes.previewMode')}</button>
        </div>
        <span className="faint xs">{savedAt ? t('notes.autosaved') : ''}</span>
        <span className="spacer" />
        <select className="select" style={{ width: 'auto', height: 30, fontSize: 12 }} value={note.kind} onChange={(e) => set({ kind: e.target.value as Note['kind'] })} aria-label={t('capture.title')}>
          <option value="note">{t('notes.kind.note')}</option>
          <option value="idea">{t('notes.kind.idea')}</option>
        </select>
        {note.inbox && <button className="btn btn-sm btn-ghost" onClick={() => set({ inbox: false })}>{t('inbox.organized')}</button>}
        <button className="btn btn-ghost btn-icon btn-sm" title={note.pinned ? t('notes.unpin') : t('notes.pin')} aria-label={note.pinned ? t('notes.unpin') : t('notes.pin')} onClick={() => set({ pinned: !note.pinned })}>{note.pinned ? <PinOff /> : <Pin />}</button>
        <button className="btn btn-ghost btn-icon btn-sm" aria-label={t('common.delete')} onClick={() => { deleteEntity('notes', id); navigate('notes'); toast(t('notes.deleted'), { action: { label: t('common.undo'), run: () => undo() } }); }}><Trash /></button>
      </div>
      <input className="note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('notes.titlePlaceholder')} aria-label={t('notes.titlePlaceholder')} />
      <div className="note-links">
        <LinkIcon size={13} className="faint" />
        <span className="faint xs">{t('notes.linkTo')}</span>
        <select className="select" value={note.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null })} aria-label={t('task.project')}>
          <option value="">{t('task.project')} —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
        </select>
        <select className="select" value={note.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value || null })} aria-label={t('task.goal')}>
          <option value="">{t('task.goal')} —</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.icon} {g.title}</option>)}
        </select>
        <select className="select" value={note.areaId ?? ''} onChange={(e) => set({ areaId: e.target.value || null })} aria-label={t('task.area')}>
          <option value="">{t('task.area')} —</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>
        <select className="select" value={note.taskId ?? ''} onChange={(e) => set({ taskId: e.target.value || null })} aria-label={t('nav.tasks')}>
          <option value="">{t('capture.kinds.task')} —</option>
          {tasks.filter((x) => x.status !== 'done' || x.id === note.taskId).slice(0, 120).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      </div>
      <div className="note-tags">
        {note.tagIds.map((tid) => tags[tid] && <span key={tid} className="tag">#{tags[tid].name}<button aria-label={t('common.delete')} onClick={() => set({ tagIds: note.tagIds.filter((x) => x !== tid) })}><X size={11} /></button></span>)}
        <input className="input input-bare xs" style={{ width: 140 }} value={tagInput} placeholder={t('task.addTag')} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && tagInput.trim()) {
            const [tid] = ensureTags([tagInput.trim().replace(/^#/, '')]);
            if (!note.tagIds.includes(tid)) set({ tagIds: [...note.tagIds, tid] });
            setTagInput('');
          }
        }} />
      </div>
      {mode === 'edit' ? (
        <textarea className="note-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('notes.bodyPlaceholder')} autoFocus={!note.body} />
      ) : (
        <div className="note-preview markdown selectable" onClick={onPreviewClick} onDoubleClick={() => setMode('edit')} dangerouslySetInnerHTML={{ __html: html || `<p class="faint">${t('notes.bodyPlaceholder')}</p>` }} />
      )}
      {pending.length > 0 && (
        <button className="btn btn-sm btn-subtle" style={{ alignSelf: 'flex-start', marginTop: 12 }} onClick={() => {
          transaction(t('notes.tasksFromChecklist', { count: pending.length }), () => {
            for (const text of pending) createEntity('tasks', taskFields({ title: text, projectId: note.projectId, areaId: note.areaId, goalId: note.goalId, inbox: !note.projectId }));
          });
          setBody((b) => b.replace(/^(\s*[-*+]\s+)\[ \]/gm, '$1[x]'));
          toast(t('notes.tasksCreated', { count: pending.length }));
        }}>
          <ListChecks />{t('notes.tasksFromChecklist', { count: pending.length })}
        </button>
      )}
      <div className="note-backlinks">
        <div className="eyebrow">{t('notes.backlinks')}</div>
        {backlinks.length === 0 ? <p className="faint xs" style={{ marginTop: 4 }}>{t('notes.noBacklinks')}</p> : (
          <div className="row-flex gap-2 wrap" style={{ marginTop: 6 }}>
            {backlinks.map((b) => <button key={b.id} className="tag" onClick={() => navigate('notes', { id: b.id })}>{b.title}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
