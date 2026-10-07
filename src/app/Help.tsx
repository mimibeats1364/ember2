/**
 * Ayuda siempre a mano: chuleta de atajos (tecla ?) y novedades de la versión.
 */
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Compass, GraduationCap } from 'lucide-react';
import { updatePrefs, usePrefs } from '@/data/store';
import { t } from '@/i18n';
import { Kbd, Modal } from '@/ui/components/primitives';
import { SPRING } from '@/ui/motion/springs';
import { APP_VERSION, MOD, isTauri } from '@/platform/env';
import { navigate, startTour, useUi } from './ui';

type Row = [string[], string];

export function Cheatsheet() {
  const open = useUi((s) => s.cheatsheet);
  const prefs = usePrefs();
  if (!open) return null;
  const k = (key: string) => (key === ' ' ? t('help.space') : key.toUpperCase());
  const s = prefs.shortcuts;
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: t('help.groups.general'),
      rows: [
        [[`${MOD}K`], t('help.rows.palette')],
        [[k(s.newTask)], t('help.rows.capture')],
        [[`${MOD}N`], t('help.rows.capture')],
        [[`${MOD}Z`], t('help.rows.undo')],
        [[`${MOD},`], t('help.rows.settings')],
        [['?'], t('help.rows.cheatsheet')],
        [['esc'], t('help.rows.close')],
      ],
    },
    {
      title: t('help.groups.navigation'),
      rows: [
        [[k(s.today)], t('nav.today')],
        [[k(s.tasks)], t('nav.tasks')],
        [[k(s.calendar)], t('nav.calendar')],
        [[k(s.habits)], t('nav.habits')],
        [[k(s.focus)], t('nav.focus')],
        [[k(s.goals)], t('nav.goals')],
        [[k(s.projects)], t('nav.projects')],
        [[k(s.search)], t('help.rows.palette')],
        [[`${MOD}1`, '…', `${MOD}5`], t('help.rows.numbers')],
      ],
    },
    {
      title: t('help.groups.capture'),
      rows: [
        [['Tab'], t('help.rows.kind')],
        [['↵'], t('help.rows.save')],
        ...(isTauri() ? [[[prefs.captureShortcut.replace('Control', '⌃').replace('Shift', '⇧').replace('Space', 'Espacio').split('+').join('')], t('help.rows.global')] as Row] : []),
      ],
    },
    {
      title: t('help.groups.focus'),
      rows: [
        [[k(s.toggleFocus)], t('help.rows.pause')],
        [['D'], t('help.rows.park')],
        [['esc'], t('help.rows.exitFocus')],
      ],
    },
    {
      title: t('help.groups.routines'),
      rows: [
        [['↵'], t('help.rows.stepDone')],
        [['→'], t('help.rows.stepSkip')],
        [['←'], t('help.rows.stepBack')],
        [[t('help.space')], t('help.rows.stepTimer')],
      ],
    },
    {
      title: t('help.groups.palette'),
      rows: [
        [['↑', '↓'], t('help.rows.move')],
        [['↵'], t('help.rows.run')],
        [['←', '→'], t('help.rows.tour')],
      ],
    },
  ];
  const close = () => useUi.setState({ cheatsheet: false });
  return (
    <Modal title={t('help.title')} onClose={close} wide>
      <div className="cheat-grid">
        {groups.map((g, gi) => (
          <motion.div key={g.title} className="cheat-group" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING.liquid, delay: gi * 0.04 }}>
            <h3>{g.title}</h3>
            {g.rows.map(([keys, label], i) => (
              <div key={i} className="cheat-row">
                <span>{label}</span>
                <span className="keys">
                  {keys.map((x, j) => (
                    <Kbd key={j}>{x}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </motion.div>
        ))}
      </div>
      <div className="row-flex gap-2" style={{ marginTop: 18 }}>
        <button
          className="btn btn-sm"
          onClick={() => {
            close();
            navigate('learn', { tab: 'shortcuts' });
          }}
        >
          <GraduationCap /> {t('help.moreInLearn')}
        </button>
        <span className="faint xs">{t('help.customize')}</span>
      </div>
    </Modal>
  );
}

const NEWS: [string, string, string][] = [
  ['💧', 'news.glass', 'news.glassBody'],
  ['📋', 'news.routines', 'news.routinesBody'],
  ['💬', 'news.commands', 'news.commandsBody'],
  ['🏝️', 'news.island', 'news.islandBody'],
  ['🅿️', 'news.park', 'news.parkBody'],
  ['🎓', 'news.learn', 'news.learnBody'],
];

export function WhatsNew() {
  const open = useUi((s) => s.whatsNew);
  const prefs = usePrefs();
  // Se enseña una vez por versión a quien ya usaba Ember.
  useEffect(() => {
    if (prefs.onboarded && prefs.seenWhatsNew !== APP_VERSION) {
      const id = setTimeout(() => useUi.setState({ whatsNew: true }), 900);
      return () => clearTimeout(id);
    }
  }, [prefs.onboarded, prefs.seenWhatsNew]);
  if (!open) return null;
  const close = () => {
    useUi.setState({ whatsNew: false });
    if (prefs.seenWhatsNew !== APP_VERSION) updatePrefs({ seenWhatsNew: APP_VERSION });
  };
  return (
    <Modal
      title={t('news.title', { version: APP_VERSION })}
      onClose={close}
      wide
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={() => {
              close();
              navigate('learn');
            }}
          >
            <GraduationCap /> {t('news.openLearn')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              close();
              startTour('welcome');
            }}
          >
            <Compass /> {t('news.tour')}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginBottom: 14 }}>
        {t('news.intro')}
      </p>
      <div className="news-grid">
        {NEWS.map(([icon, title, body], i) => (
          <motion.div key={title} className="news-item" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING.liquid, delay: 0.08 + i * 0.06 }}>
            <span className="icon">{icon}</span>
            <div>
              <b>{t(title as 'news.glass')}</b>
              <span>{t(body as 'news.glassBody')}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </Modal>
  );
}
