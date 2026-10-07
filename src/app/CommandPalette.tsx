import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  CircleCheck,
  Download,
  Flame,
  FolderKanban,
  Inbox,
  NotebookPen,
  Palette as PaletteIcon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  Timer,
  Trophy,
  Pause,
  ListChecks,
  GraduationCap,
  Keyboard,
  type LucideIcon,
} from 'lucide-react';
import { SearchIndex, type SearchDoc, type SearchType } from '@core/search';
import { parseInput, normalizeText } from '@core/nlp';
import { parseCommand } from '@core/commands';
import { motion } from 'motion/react';
import { previewCommand, type CommandPreview } from './commandRunner';
import { SPRING } from '@/ui/motion/springs';
import { addDays, today as todayFn } from '@core/dates';
import { useData, updatePrefs, getPrefs } from '@/data/store';
import { startTimer } from '@/data/actions';
import { t, type TKey } from '@/i18n';
import { cx, Kbd } from '@/ui/components/primitives';
import { THEMES } from '@/ui/theme/palette';
import {
  navigate,
  openCapture,
  openEventEditor,
  openGoalEditor,
  openHabitEditor,
  openPalette,
  openPlanDay,
  openProjectEditor,
  openRoutineEditor,
  openTask,
  startTour,
  toast,
  useUi,
} from './ui';
import { performCapture, useProjectNames } from './QuickCapture';
import { togglePauseFocus, useFocus } from './focusStore';

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  run: () => void;
}

const TYPE_ICONS: Record<SearchType, LucideIcon> = {
  task: CircleCheck,
  project: FolderKanban,
  note: NotebookPen,
  habit: Flame,
  goal: Target,
  event: CalendarDays,
  area: FolderKanban,
};

function useCommands(): Command[] {
  const focusActive = useFocus((s) => !!s.state);
  return useMemo(() => {
    const c = (id: string, key: TKey, icon: LucideIcon, run: () => void, hint?: string): Command => ({ id, label: t(key), icon, run, hint });
    const list: Command[] = [
      c('newTask', 'palette.commands.newTask', Plus, () => openCapture('task'), 'N'),
      c('startFocus', 'palette.commands.startFocus', Timer, () => navigate('focus'), 'F'),
      c('planDay', 'palette.commands.planDay', Sparkles, () => openPlanDay(todayFn())),
      c('planTomorrow', 'palette.commands.planTomorrow', Sunrise, () => openPlanDay(addDays(todayFn(), 1))),
      c('openToday', 'palette.commands.openToday', Sun, () => navigate('today'), 'T'),
      c('openInbox', 'palette.commands.openInbox', Inbox, () => navigate('inbox')),
      c('openCalendar', 'palette.commands.openCalendar', CalendarDays, () => navigate('calendar'), 'C'),
      c('openHabits', 'palette.commands.openHabits', Flame, () => navigate('habits'), 'H'),
      c('openRoutines', 'palette.commands.openRoutines', ListChecks, () => navigate('routines')),
      c('newRoutine', 'palette.commands.newRoutine', ListChecks, () => openRoutineEditor(null)),
      c('learn', 'palette.commands.learn', GraduationCap, () => navigate('learn')),
      c('tour', 'palette.commands.tour', GraduationCap, () => startTour('welcome')),
      c('shortcuts', 'palette.commands.shortcuts', Keyboard, () => useUi.setState({ cheatsheet: true }), '?'),
      c('newHabit', 'palette.commands.newHabit', Flame, () => openHabitEditor(null)),
      c('newEvent', 'palette.commands.newEvent', CalendarPlus, () => openEventEditor(null)),
      c('newNote', 'palette.commands.newNote', NotebookPen, () => openCapture('note')),
      c('openNotes', 'palette.commands.openNotes', NotebookPen, () => navigate('notes')),
      c('newProject', 'palette.commands.newProject', FolderKanban, () => openProjectEditor(null)),
      c('openProjects', 'palette.commands.openProjects', FolderKanban, () => navigate('projects'), 'P'),
      c('newGoal', 'palette.commands.newGoal', Target, () => openGoalEditor(null)),
      c('openGoals', 'palette.commands.openGoals', Target, () => navigate('goals'), 'G'),
      c('openInsights', 'palette.commands.openInsights', ChartColumn, () => navigate('insights')),
      c('yearReview', 'palette.commands.yearReview', Trophy, () => useUi.setState({ yearReview: true })),
      c('dailyReflection', 'palette.commands.dailyReflection', RotateCcw, () => navigate('review', { tab: 'daily' })),
      c('weeklyReview', 'palette.commands.weeklyReview', RotateCcw, () => navigate('review', { tab: 'weekly' })),
      c('reset', 'palette.commands.reset', RotateCcw, () => navigate('review', { tab: 'reset' })),
      c('startTimer', 'palette.commands.startTimer', Timer, () => {
        startTimer(null);
        toast(t('task.timerRunning'));
      }),
      c('theme', 'palette.commands.theme', PaletteIcon, () => {
        const cur = getPrefs().theme;
        const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
        updatePrefs({ theme: next });
        toast(`${t('settings.theme')}: ${t(`settings.themes.${next}` as TKey)}`);
      }),
      c('export', 'palette.commands.export', Download, () => navigate('settings', { tab: 'data' })),
      c('settings', 'palette.commands.settings', Settings, () => navigate('settings'), ','),
    ];
    if (focusActive) list.unshift(c('toggleFocus', 'palette.commands.toggleFocus', Pause, togglePauseFocus, '␣'));
    return list;
  }, [focusActive]);
}

function useSearchIndex(open: boolean): SearchIndex | null {
  const c = useData((s) => s.c);
  return useMemo(() => {
    if (!open) return null;
    const projects = c.projects;
    const docs: SearchDoc[] = [];
    for (const x of Object.values(c.tasks)) {
      if (x.deletedAt) continue;
      docs.push({
        type: 'task',
        id: x.id,
        title: x.title,
        body: x.notes,
        tags: x.tagIds.map((id) => c.tags[id]?.name ?? ''),
        context: x.projectId ? projects[x.projectId]?.name : undefined,
        updated: x.updatedAt,
        done: x.status === 'done' || x.status === 'dropped',
      });
    }
    for (const p of Object.values(projects)) if (!p.deletedAt) docs.push({ type: 'project', id: p.id, title: p.name, body: p.description, updated: p.updatedAt, done: p.status === 'done' });
    for (const n of Object.values(c.notes)) if (!n.deletedAt) docs.push({ type: 'note', id: n.id, title: n.title || n.body.slice(0, 60), body: n.body, tags: n.tagIds.map((id) => c.tags[id]?.name ?? ''), updated: n.updatedAt });
    for (const h of Object.values(c.habits)) if (!h.deletedAt && !h.archived) docs.push({ type: 'habit', id: h.id, title: h.name, body: h.description, updated: h.updatedAt });
    for (const g of Object.values(c.goals)) if (!g.deletedAt) docs.push({ type: 'goal', id: g.id, title: g.title, body: g.description, updated: g.updatedAt, done: g.status === 'done' });
    for (const e of Object.values(c.events)) if (!e.deletedAt) docs.push({ type: 'event', id: e.id, title: e.title, body: `${e.notes} ${e.location}`, updated: e.updatedAt });
    for (const a of Object.values(c.areas)) if (!a.deletedAt) docs.push({ type: 'area', id: a.id, title: a.name, updated: a.updatedAt });
    return new SearchIndex(docs);
  }, [open, c]);
}

function openResult(doc: SearchDoc) {
  switch (doc.type) {
    case 'task':
      openTask(doc.id);
      break;
    case 'project':
      navigate('projects', { id: doc.id });
      break;
    case 'note':
      navigate('notes', { id: doc.id });
      break;
    case 'habit':
      navigate('habits');
      openHabitEditor(doc.id);
      break;
    case 'goal':
      navigate('goals', { id: doc.id });
      break;
    case 'event':
      navigate('calendar');
      openEventEditor(doc.id);
      break;
    case 'area':
      navigate('projects', { tab: 'life' });
      break;
  }
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  if (!open) return null;
  return <PaletteInner />;
}

function PaletteInner() {
  const [q, setQ] = useState(() => useUi.getState().paletteQuery);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useCommands();
  const index = useSearchIndex(true);
  const projects = useProjectNames();
  const close = () => openPalette(false);

  const items = useMemo(() => {
    const out: { key: string; group: string; label: ReactNode; icon: LucideIcon; hint?: string; run: () => void; preview?: CommandPreview }[] = [];
    const nq = normalizeText(q.trim());
    const intent = q.trim() ? parseCommand(q, { today: todayFn() }) : null;
    if (intent) {
      const preview = previewCommand(intent);
      out.push({ key: `cmd:${intent.type}`, group: t('cmd.understood'), label: preview.title, icon: preview.icon, run: preview.run, preview });
    }
    const cmds = nq ? commands.filter((c) => normalizeText(c.label).includes(nq)) : commands.slice(0, 9);
    const hits = nq && index ? index.search(q, 14) : [];
    if (nq && hits.length === 0 && cmds.length === 0) {
      out.push({
        key: 'create',
        group: t('palette.actions'),
        label: t('palette.createTask', { title: q.trim() }),
        icon: Plus,
        run: () => performCapture(q, 'task', parseInput(q, { today: todayFn(), projects })),
      });
    }
    for (const c of cmds) out.push({ key: `c:${c.id}`, group: t('palette.actions'), label: c.label, icon: c.icon, hint: c.hint, run: c.run });
    for (const h of hits) {
      out.push({
        key: `r:${h.doc.type}:${h.doc.id}`,
        group: t('palette.results'),
        label: (
          <>
            <span className={cx('ellipsis', h.doc.done && 'faint')}>{h.doc.title || t('common.untitled')}</span>
            {h.doc.context && <span className="faint xs ellipsis">· {h.doc.context}</span>}
          </>
        ),
        icon: TYPE_ICONS[h.doc.type],
        hint: t(`palette.types.${h.doc.type}` as TKey),
        run: () => openResult(h.doc),
      });
    }
    if (nq && (hits.length > 0 || cmds.length > 0)) {
      out.push({
        key: 'create-tail',
        group: t('palette.actions'),
        label: t('palette.createTask', { title: q.trim() }),
        icon: Plus,
        run: () => performCapture(q, 'task', parseInput(q, { today: todayFn(), projects })),
      });
    }
    return out;
  }, [q, commands, index, projects]);

  // Si el comando no tiene nada que hacer, la selección empieza en el siguiente resultado.
  useEffect(() => setSel(items[0]?.preview?.disabled && items.length > 1 ? 1 : 0), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    listRef.current?.querySelector('.menu-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  let lastGroup = '';
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && close()}>
        <div className="modal palette" role="dialog" aria-modal="true" aria-label={t('palette.placeholder')}>
          <div className="palette-input">
            <Search />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('palette.placeholder')}
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSel((s) => Math.min(items.length - 1, s + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSel((s) => Math.max(0, s - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const it = items[sel];
                  if (it && !it.preview?.disabled) {
                    close();
                    it.run();
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                }
              }}
            />
            <Kbd>esc</Kbd>
          </div>
          <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
            {items.length === 0 && <div className="empty compact faint">{t('palette.noResults')}</div>}
            {items.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              const Icon = it.icon;
              if (it.preview) {
                const pv = it.preview;
                return (
                  <div key={it.key}>
                    {header && <div className="menu-label">{header}</div>}
                    <motion.button
                      layout
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={SPRING.liquid}
                      className={cx('cmd-card lg-rim', i === sel && 'active', pv.disabled && 'disabled')}
                      role="option"
                      aria-selected={i === sel}
                      onMouseMove={() => setSel(i)}
                      onClick={() => {
                        if (pv.disabled) return;
                        close();
                        pv.run();
                      }}
                    >
                      <span className="cmd-head">
                        <span className="cmd-icon"><Icon /></span>
                        <span className="cmd-title">{pv.title}</span>
                        {!pv.disabled && (
                          <span className="cmd-action">
                            {pv.actionLabel} <Kbd>↵</Kbd>
                          </span>
                        )}
                      </span>
                      {pv.lines.length > 0 && (
                        <span className="cmd-lines">
                          {pv.lines.map((ln, k) => (
                            <span key={k} className={cx('cmd-line', ln.done && 'done')}>
                              {ln.left !== undefined && <span className="cmd-left num">{ln.left}</span>}
                              {ln.color && <i className="dot" style={{ color: ln.color }} />}
                              <span className="ellipsis">{ln.text}</span>
                              {ln.sub && <span className="faint xs">{ln.sub}</span>}
                            </span>
                          ))}
                        </span>
                      )}
                      {pv.note && <span className="cmd-note">{pv.note}</span>}
                    </motion.button>
                  </div>
                );
              }
              return (
                <div key={it.key}>
                  {header && <div className="menu-label">{header}</div>}
                  <button
                    className={cx('menu-item', i === sel && 'active')}
                    role="option"
                    aria-selected={i === sel}
                    onMouseMove={() => setSel(i)}
                    onClick={() => {
                      close();
                      it.run();
                    }}
                  >
                    <Icon />
                    <span className="row-flex gap-2 grow" style={{ minWidth: 0 }}>
                      {it.label}
                    </span>
                    {it.hint && <span className="hint">{it.hint}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="palette-foot faint xs">{t('palette.hint')}</div>
        </div>
      </div>
    </>
  );
}
