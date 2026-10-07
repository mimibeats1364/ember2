/**
 * Aprende Ember: tutorial interactivo en español. Cada lección explica una función paso a paso,
 * enseña sus atajos reales (los de tus ajustes) y trae un "Pruébalo" que usa el mismo
 * analizador que la app, así que lo que ves aquí es exactamente lo que hará Ember.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Compass, Copy, Keyboard, Link2, Play, Sparkles, Wand, Command as CommandIcon } from 'lucide-react';
import { parseInput } from '@core/nlp';
import { parseCommand } from '@core/commands';
import { today as todayFn } from '@core/dates';
import { updatePrefs, usePrefs } from '@/data/store';
import { t, tp, type TKey } from '@/i18n';
import { tokenLabel } from '@/ui/format';
import { cx, Kbd } from '@/ui/components/primitives';
import { LiquidOrb } from '@/ui/components/LiquidOrb';
import { SPRING } from '@/ui/motion/springs';
import { navigate, openCapture, openPalette, startTour, useUi } from '@/app/ui';
import { openOrbit } from '@/features/orbit/store';
import { previewCommand } from '@/app/commandRunner';
import { useProjectNames } from '@/app/QuickCapture';
import { LESSONS, MODULES, lessonById, type Lesson, type LessonShortcut } from './lessons';
import { Rich } from './Rich';
import './learn.css';

function useLearned() {
  const prefs = usePrefs();
  const learned = new Set(prefs.learned);
  const toggle = (id: string, on?: boolean) => {
    const next = new Set(prefs.learned);
    const value = on ?? !next.has(id);
    if (value) next.add(id);
    else next.delete(id);
    updatePrefs({ learned: [...next] });
  };
  return { learned, toggle };
}

export default function LearnScreen() {
  const route = useUi((s) => s.route);
  const lessonId = route.id ?? (route.tab === 'commands' ? 'commands' : route.tab === 'shortcuts' ? 'shortcuts' : undefined);
  const lesson = lessonId ? lessonById(lessonId) : undefined;
  return lesson ? <LessonView key={lesson.id} lesson={lesson} /> : <LearnHome />;
}

// ── Portada ────────────────────────────────────────────────────────────────────────────

function LearnHome() {
  const { learned } = useLearned();
  const done = LESSONS.filter((l) => learned.has(l.id)).length;
  const next = LESSONS.find((l) => !learned.has(l.id));
  return (
    <div className="page learn">
      <section className="card card-glow learn-hero">
        <LiquidOrb level={done / LESSONS.length} ring={done / LESSONS.length} size={150} calm>
          <div className="learn-count num">
            {done}
            <span className="faint">/{LESSONS.length}</span>
          </div>
        </LiquidOrb>
        <div className="learn-hero-body">
          <div className="eyebrow accent">{t('learn.eyebrow')}</div>
          <h1 className="learn-title">{t('learn.title')}</h1>
          <p className="muted">{t('learn.subtitle')}</p>
          <div className="row-flex gap-2 wrap" style={{ marginTop: 18 }}>
            <button className="btn btn-primary magnetic" onClick={() => startTour('welcome')}>
              <Compass /> {t('learn.tour')}
            </button>
            {next && (
              <button className="btn" onClick={() => navigate('learn', { id: next.id })}>
                <Play /> {done === 0 ? t('learn.start') : t('learn.continue', { title: next.title })}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => useUi.setState({ cheatsheet: true })}>
              <Keyboard /> {t('learn.shortcuts')} <Kbd>?</Kbd>
            </button>
            <button className="btn btn-ghost" onClick={() => useUi.setState({ whatsNew: true })}>
              <Sparkles /> {t('learn.whatsNew')}
            </button>
          </div>
        </div>
      </section>

      {MODULES.map((m, mi) => {
        const lessons = LESSONS.filter((l) => l.module === m.id);
        const doneHere = lessons.filter((l) => learned.has(l.id)).length;
        return (
          <section key={m.id} className="section learn-module">
            <div className="section-head">
              <h2 className="section-title">
                <span className="learn-module-icon">{m.icon}</span> {m.title}
              </h2>
              <span className="faint xs num">
                {doneHere}/{lessons.length}
              </span>
            </div>
            <div className="lesson-grid">
              {lessons.map((l, i) => (
                <motion.button
                  key={l.id}
                  className={cx('card lesson-card tilt', learned.has(l.id) && 'done')}
                  data-tilt="5"
                  onClick={() => navigate('learn', { id: l.id })}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING.liquid, delay: Math.min(0.5, mi * 0.03 + i * 0.04) }}
                >
                  <span className="lesson-icon">{l.icon}</span>
                  <span className="lesson-main">
                    <span className="lesson-title">{l.title}</span>
                    <span className="lesson-summary">{l.summary}</span>
                  </span>
                  <span className="lesson-meta">
                    {learned.has(l.id) ? (
                      <span className="lesson-done">
                        <Check size={13} />
                      </span>
                    ) : (
                      <span className="faint xs">{t('learn.minutes', { n: l.minutes })}</span>
                    )}
                  </span>
                </motion.button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Lección ────────────────────────────────────────────────────────────────────────────

function LessonView({ lesson }: { lesson: Lesson }) {
  const { learned, toggle } = useLearned();
  const isDone = learned.has(lesson.id);
  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const next = LESSONS[idx + 1];
  const prev = LESSONS[idx - 1];
  const module = MODULES.find((m) => m.id === lesson.module)!;
  return (
    <div className="page learn lesson">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('learn')} style={{ marginBottom: 16 }}>
        <ArrowLeft /> {t('nav.learn')}
      </button>
      <header className="lesson-head">
        <motion.span className="lesson-hero-icon" initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING.liquid}>
          {lesson.icon}
        </motion.span>
        <div>
          <div className="eyebrow">
            {module.icon} {module.title} · {t('learn.minutes', { n: lesson.minutes })}
          </div>
          <h1 className="page-title" style={{ marginTop: 6 }}>
            {lesson.title}
          </h1>
          <p className="page-subtitle">{lesson.summary}</p>
        </div>
      </header>

      <ol className="lesson-steps">
        {lesson.steps.map((s, i) => (
          <motion.li key={i} className="lesson-step" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING.liquid, delay: 0.05 + i * 0.06 }}>
            <span className="lesson-step-n num">{i + 1}</span>
            <div className="lesson-step-body">
              <h3>{s.title}</h3>
              <p>
                <Rich text={s.body} />
              </p>
            </div>
          </motion.li>
        ))}
      </ol>

      {lesson.capture && lesson.capture.length > 0 && <CaptureSandbox lesson={lesson} />}
      {lesson.commands && lesson.commands.length > 0 && <CommandSandbox lesson={lesson} />}
      {lesson.orbit && lesson.orbit.length > 0 && <OrbitExamples lesson={lesson} />}
      {lesson.links && lesson.links.length > 0 && <LinksTable lesson={lesson} />}
      {lesson.shortcuts && lesson.shortcuts.length > 0 && <ShortcutTable shortcuts={lesson.shortcuts} />}

      <div className="lesson-actions">
        {lesson.goTo && (
          <button className="btn" onClick={() => navigate(lesson.goTo!.screen, lesson.goTo!.tab ? { tab: lesson.goTo!.tab } : {})}>
            <ArrowRight /> {lesson.goTo.label}
          </button>
        )}
        {lesson.tour && (
          <button className="btn" onClick={() => startTour(lesson.tour!)}>
            <Compass /> {t('learn.showMe')}
          </button>
        )}
        <span className="spacer" />
        <button className={cx('btn', isDone ? 'btn-subtle' : 'btn-primary magnetic')} onClick={() => toggle(lesson.id)}>
          <Check /> {isDone ? t('learn.learned') : t('learn.markLearned')}
        </button>
      </div>
      <nav className="lesson-nav">
        {prev ? (
          <button className="lesson-nav-btn" onClick={() => navigate('learn', { id: prev.id })}>
            <span className="faint xs">
              <ArrowLeft size={12} /> {t('learn.prev')}
            </span>
            <span>
              {prev.icon} {prev.title}
            </span>
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button
            className="lesson-nav-btn right"
            onClick={() => {
              if (!isDone) toggle(lesson.id, true);
              navigate('learn', { id: next.id });
            }}
          >
            <span className="faint xs">
              {t('learn.next')} <ArrowRight size={12} />
            </span>
            <span>
              {next.icon} {next.title}
            </span>
          </button>
        )}
      </nav>
    </div>
  );
}

// ── Pruébalo: captura ──────────────────────────────────────────────────────────────────

function CaptureSandbox({ lesson }: { lesson: Lesson }) {
  const examples = lesson.capture!;
  const [text, setText] = useState(examples[0].text);
  const projects = useProjectNames();
  const today = todayFn();
  const parsed = useMemo(() => parseInput(text, { today, projects }), [text, today, projects]);
  const chips = parsed.tokens.map((tok) => tokenLabel(tok, parsed, today)).filter((x): x is string => !!x);
  const kind = parsed.kind === 'note' ? 'note' : parsed.kind;
  return (
    <section className="card card-pad sandbox">
      <div className="sandbox-head">
        <span className="sandbox-badge">
          <Wand size={14} /> {t('learn.tryIt')}
        </span>
        <span className="faint xs">{t('learn.captureHint')}</span>
      </div>
      <input className="input sandbox-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('capture.placeholder')} aria-label={t('learn.tryIt')} />
      <div className="sandbox-result" aria-live="polite">
        {text.trim() ? (
          <>
            <span className="tag accent">{t(`capture.kinds.${kind}` as TKey)}</span>
            <span className="tag">{parsed.title || text}</span>
            {chips.map((c, i) => (
              <motion.span key={c + i} className="tag info" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING.snappy}>
                {c}
              </motion.span>
            ))}
            {parsed.tags.map((tag) => (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ))}
          </>
        ) : (
          <span className="faint small">{t('learn.typeSomething')}</span>
        )}
      </div>
      <div className="sandbox-examples">
        {examples.map((ex) => (
          <button key={ex.text} className={cx('example', ex.text === text && 'active')} onClick={() => setText(ex.text)}>
            <span className="example-text">“{ex.text}”</span>
            <span className="example-result">{ex.result}</span>
          </button>
        ))}
      </div>
      <div className="row-flex gap-2" style={{ marginTop: 12 }}>
        <button className="btn btn-sm btn-primary" disabled={!text.trim()} onClick={() => openCapture(kind === 'idea' || kind === 'note' || kind === 'habit' || kind === 'event' ? kind : 'task', text)}>
          <Sparkles /> {t('learn.createForReal')}
        </button>
        <span className="faint xs">{t('learn.createForRealHint')}</span>
      </div>
    </section>
  );
}

// ── Pruébalo: comandos ─────────────────────────────────────────────────────────────────

function CommandSandbox({ lesson }: { lesson: Lesson }) {
  const examples = lesson.commands!;
  const [text, setText] = useState(examples[0].text);
  const intent = useMemo(() => parseCommand(text, { today: todayFn() }), [text]);
  const preview = intent ? previewCommand(intent) : null;
  const Icon = preview?.icon;
  return (
    <section className="card card-pad sandbox">
      <div className="sandbox-head">
        <span className="sandbox-badge">
          <CommandIcon size={14} /> {t('learn.tryCommands')}
        </span>
        <span className="faint xs">{t('learn.commandHint')}</span>
      </div>
      <input className="input sandbox-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('learn.commandPlaceholder')} aria-label={t('learn.tryCommands')} />
      <div className="sandbox-preview" aria-live="polite">
        {preview && Icon ? (
          <motion.div key={intent?.type + preview.title} className={cx('cmd-card lg-rim', preview.disabled && 'disabled')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.liquid}>
            <span className="cmd-head">
              <span className="cmd-icon">
                <Icon />
              </span>
              <span className="cmd-title">{preview.title}</span>
            </span>
            {preview.lines.length > 0 && (
              <span className="cmd-lines">
                {preview.lines.map((ln, k) => (
                  <span key={k} className={cx('cmd-line', ln.done && 'done')}>
                    {ln.left !== undefined && <span className="cmd-left num">{ln.left}</span>}
                    {ln.color && <i className="dot" style={{ color: ln.color }} />}
                    <span className="ellipsis">{ln.text}</span>
                    {ln.sub && <span className="faint xs">{ln.sub}</span>}
                  </span>
                ))}
              </span>
            )}
            {preview.note && <span className="cmd-note">{preview.note}</span>}
          </motion.div>
        ) : (
          <div className="faint small sandbox-empty">{text.trim() ? t('learn.notACommand') : t('learn.typeSomething')}</div>
        )}
      </div>
      <div className="sandbox-examples">
        {examples.map((ex) => (
          <button key={ex.text} className={cx('example', ex.text === text && 'active')} onClick={() => setText(ex.text)}>
            <span className="example-text">“{ex.text}”</span>
            <span className="example-result">{ex.result}</span>
          </button>
        ))}
      </div>
      <div className="row-flex gap-2 wrap" style={{ marginTop: 12 }}>
        <button className="btn btn-sm btn-primary" disabled={!preview || preview.disabled} onClick={() => preview?.run()}>
          <Play /> {preview ? preview.actionLabel : t('learn.run')}
        </button>
        <button className="btn btn-sm" onClick={() => openPalette(true, text)}>
          <CommandIcon /> {t('learn.openInPalette')} <Kbd>⌘K</Kbd>
        </button>
        <span className="faint xs">{t('learn.runHint')}</span>
      </div>
    </section>
  );
}

// ── Pídeselo a Orbit ───────────────────────────────────────────────────────────────────

function OrbitExamples({ lesson }: { lesson: Lesson }) {
  return (
    <section className="card card-pad sandbox">
      <div className="sandbox-head">
        <span className="sandbox-badge">
          <Sparkles size={14} /> {t('learn.tryOrbit')}
        </span>
        <span className="faint xs">{t('learn.orbitHint')}</span>
      </div>
      <div className="sandbox-examples">
        {lesson.orbit!.map((ex) => (
          <button key={ex.text} className="example" onClick={() => openOrbit(ex.text)}>
            <span className="example-text">“{ex.text}”</span>
            <span className="example-result">{ex.result}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Enlaces ember:// ───────────────────────────────────────────────────────────────────

function LinksTable({ lesson }: { lesson: Lesson }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <section className="card card-pad sandbox">
      <div className="sandbox-head">
        <span className="sandbox-badge">
          <Link2 size={14} /> {t('learn.links')}
        </span>
        <span className="faint xs">{t('learn.linksHint')}</span>
      </div>
      <div className="link-list">
        {lesson.links!.map((l) => (
          <div key={l.url} className="link-row">
            <code className="link-url selectable">{decodeURIComponent(l.url)}</code>
            <span className="faint xs grow">{l.result}</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(l.url).then(() => {
                  setCopied(l.url);
                  setTimeout(() => setCopied(null), 1400);
                });
              }}
            >
              {copied === l.url ? <Check /> : <Copy />} {copied === l.url ? t('learn.copied') : t('learn.copy')}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Atajos ─────────────────────────────────────────────────────────────────────────────

export function shortcutKey(s: LessonShortcut, prefs: ReturnType<typeof usePrefs>): string {
  if (!s.pref) return s.keys;
  const k = prefs.shortcuts[s.pref];
  return k === ' ' ? 'Espacio' : k.toUpperCase();
}

function ShortcutTable({ shortcuts }: { shortcuts: LessonShortcut[] }) {
  const prefs = usePrefs();
  return (
    <section className="card card-pad shortcut-table">
      <div className="sandbox-head">
        <span className="sandbox-badge">
          <Keyboard size={14} /> {tp('learn.shortcutsCount', shortcuts.length)}
        </span>
      </div>
      <div className="kbd-grid">
        {shortcuts.map((s) => {
          const key = shortcutKey(s, prefs);
          return (
            <div key={s.label} className="kbd-row">
              <span className="kbd-keys">
                {key.split(' ').map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
              <span>{s.label}</span>
              {key !== s.keys && <span className="faint xs">{t('learn.customized', { key: s.keys })}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
