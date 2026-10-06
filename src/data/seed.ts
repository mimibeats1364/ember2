/**
 * Datos de ejemplo realistas para explorar Ember. Se pueden cargar y quitar sin tocar lo
 * que el usuario haya creado (se guardan los ids en metadatos).
 */
import { addDays, endOfMonth, instantOf, localTimeZone, startOfMonth, startOfWeek, today as todayFn } from '@core/dates';
import { habitLogId, isScheduled } from '@core/habits';
import type { EntityType } from '@core/types';
import { createEntity, deleteEntity, getMeta, setMeta, transaction, upsertEntity, useData } from './store';
import { areaFields, dayLogFields, dayLogId, eventFields, goalFields, habitFields, milestoneFields, noteFields, projectFields, taskFields } from './defaults';

const DEMO_KEY = 'demo_ids';

export async function hasDemo(): Promise<boolean> {
  return !!(await getMeta(DEMO_KEY));
}

/** Pseudoaleatorio determinista para que los datos de ejemplo sean estables. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function loadDemoData(lang: 'es' | 'en' = 'es'): Promise<void> {
  const es = lang === 'es';
  const ids: { type: EntityType; id: string }[] = [];
  const track = <T extends { id: string }>(type: EntityType, e: T) => {
    ids.push({ type, id: e.id });
    return e;
  };
  const today = todayFn();
  const rand = rng(42);
  const tz = localTimeZone();
  const year = today.slice(0, 4);

  transaction('demo', () => {
    // Áreas
    const areas = {
      uni: track('areas', createEntity('areas', areaFields({ name: es ? 'Universidad' : 'University', icon: '🎓', color: 'cyan' }))),
      music: track('areas', createEntity('areas', areaFields({ name: es ? 'Música' : 'Music', icon: '🎵', color: 'magenta' }))),
      health: track('areas', createEntity('areas', areaFields({ name: es ? 'Salud' : 'Health', icon: '💪', color: 'green' }))),
      work: track('areas', createEntity('areas', areaFields({ name: es ? 'Trabajo' : 'Work', icon: '💼', color: 'indigo' }))),
      money: track('areas', createEntity('areas', areaFields({ name: es ? 'Finanzas' : 'Finances', icon: '💰', color: 'amber' }))),
      personal: track('areas', createEntity('areas', areaFields({ name: 'Personal', icon: '✦', color: 'coral' }))),
    };

    // Objetivos del año
    const gEP = track('goals', createEntity('goals', goalFields({ title: es ? 'Publicar mi EP' : 'Release my EP', icon: '🎵', color: 'magenta', areaId: areas.music.id, progressMode: 'milestones', description: es ? 'Compartir mi música con el mundo.' : 'Share my music with the world.' })));
    const gUni = track('goals', createEntity('goals', goalFields({ title: es ? 'Aprobar todas las asignaturas' : 'Pass all my courses', icon: '📚', color: 'cyan', areaId: areas.uni.id, progressMode: 'tasks' })));
    const gCar = track('goals', createEntity('goals', goalFields({ title: es ? 'Sacarme el carnet de conducir' : 'Get my driving licence', icon: '🚗', color: 'orange', areaId: areas.personal.id, progressMode: 'milestones' })));
    track('goals', createEntity('goals', goalFields({ title: es ? 'Mejorar mi forma física' : 'Improve my fitness', icon: '💪', color: 'green', areaId: areas.health.id, progressMode: 'manual', manualProgress: 55 })));
    track('goals', createEntity('goals', goalFields({ title: es ? 'Ahorrar 3.000 €' : 'Save €3,000', icon: '💰', color: 'amber', areaId: areas.money.id, progressMode: 'numeric', target: 3000, current: 1840, unit: '€' })));
    track('goals', createEntity('goals', goalFields({ title: es ? 'Terminar 2 maquetas este mes' : 'Finish 2 demos this month', icon: '🎧', color: 'violet', horizon: 'month', periodStart: startOfMonth(today), periodEnd: endOfMonth(today), areaId: areas.music.id, progressMode: 'manual', manualProgress: 50 })));
    for (const [i, m] of (es ? ['Concepto y letras', 'Producción de 5 temas', 'Mezcla y máster', 'Portada', 'Distribución'] : ['Concept and lyrics', 'Produce 5 tracks', 'Mix and master', 'Artwork', 'Distribution']).entries()) {
      track('milestones', createEntity('milestones', milestoneFields({ goalId: gEP.id, title: m, done: i < 2, doneAt: i < 2 ? new Date().toISOString() : null, order: i, dueDate: `${year}-${String(6 + i * 1).padStart(2, '0')}-28` })));
    }
    for (const [i, m] of (es ? ['Aprobar teórico', 'Clases prácticas (10)', 'Examen práctico'] : ['Pass theory test', 'Practical lessons (10)', 'Practical exam']).entries()) {
      track('milestones', createEntity('milestones', milestoneFields({ goalId: gCar.id, title: m, done: i === 0, doneAt: i === 0 ? new Date().toISOString() : null, order: i })));
    }

    // Proyectos
    const pEP = track('projects', createEntity('projects', projectFields({ name: es ? 'EP "Brasas"' : 'EP "Embers"', icon: '🎵', color: 'magenta', areaId: areas.music.id, goalId: gEP.id, deadline: addDays(today, 40), view: 'board' })));
    const pMkt = track('projects', createEntity('projects', projectFields({ name: es ? 'Marketing (asignatura)' : 'Marketing (course)', icon: '📈', color: 'cyan', areaId: areas.uni.id, goalId: gUni.id, deadline: addDays(today, 12) })));
    const pLaw = track('projects', createEntity('projects', projectFields({ name: es ? 'Derecho mercantil' : 'Business law', icon: '⚖️', color: 'indigo', areaId: areas.uni.id, goalId: gUni.id, deadline: addDays(today, 26) })));
    const pCar = track('projects', createEntity('projects', projectFields({ name: es ? 'Carnet de conducir' : 'Driving licence', icon: '🚗', color: 'orange', areaId: areas.personal.id, goalId: gCar.id })));

    // Tareas
    type T = Parameters<typeof taskFields>[0];
    const mk = (o: T) => track('tasks', createEntity('tasks', taskFields(o)));
    const done = (o: T, daysAgo: number) => mk({ ...o, status: 'done', completedAt: instantOf(addDays(today, -daysAgo), 18 * 60) });
    mk({ title: es ? 'Estudiar marketing: tema 4' : 'Study marketing: unit 4', projectId: pMkt.id, areaId: areas.uni.id, date: today, time: '09:30', durationMin: 90, priority: 1 });
    mk({ title: es ? 'Grabar voces de "Ceniza"' : 'Record vocals for "Ash"', projectId: pEP.id, areaId: areas.music.id, date: today, durationMin: 60, priority: 2, status: 'in_progress' });
    mk({ title: es ? 'Responder correo del tutor' : 'Reply to tutor email', areaId: areas.uni.id, date: today, durationMin: 15, priority: 3 });
    mk({ title: es ? 'Repasar test de conducir' : 'Practise driving theory test', projectId: pCar.id, date: today, durationMin: 30, priority: 2, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] } });
    mk({ title: es ? 'Comprar zapatillas de running' : 'Buy running shoes', inbox: true });
    mk({ title: es ? 'Trabajo en grupo: análisis DAFO' : 'Group work: SWOT analysis', projectId: pMkt.id, deadline: addDays(today, 3), durationMin: 120, priority: 1, checklist: [{ id: 'a', text: es ? 'Fortalezas' : 'Strengths', done: true }, { id: 'b', text: es ? 'Debilidades' : 'Weaknesses', done: false }, { id: 'c', text: es ? 'Oportunidades y amenazas' : 'Opportunities & threats', done: false }] });
    mk({ title: es ? 'Leer sentencia caso Iberdrola' : 'Read Iberdrola case ruling', projectId: pLaw.id, date: addDays(today, -2), durationMin: 45, priority: 3 });
    mk({ title: es ? 'Mezclar pista 2' : 'Mix track 2', projectId: pEP.id, date: addDays(today, 1), durationMin: 120, priority: 2 });
    mk({ title: es ? 'Diseñar portada (bocetos)' : 'Design artwork (sketches)', projectId: pEP.id, status: 'backlog', priority: 3 });
    mk({ title: es ? 'Plan de lanzamiento en redes' : 'Social launch plan', projectId: pEP.id, status: 'backlog', priority: 3, deadline: addDays(today, 30) });
    mk({ title: es ? 'Preparar presentación de derecho' : 'Prepare law presentation', projectId: pLaw.id, date: addDays(today, 4), durationMin: 90, priority: 2 });
    mk({ title: es ? 'Pagar el alquiler' : 'Pay rent', areaId: areas.money.id, date: addDays(today, 2), priority: 1, recurrence: { freq: 'monthly', interval: 1 } });
    mk({ title: es ? 'Reservar clase práctica de coche' : 'Book a driving lesson', projectId: pCar.id, date: addDays(today, 1), priority: 3, durationMin: 10 });
    mk({ title: es ? 'Idea: colaboración con productora' : 'Idea: collab with producer', status: 'backlog', areaId: areas.music.id, priority: 4 });
    done({ title: es ? 'Componer letra de "Ceniza"' : 'Write lyrics for "Ash"', projectId: pEP.id, durationMin: 60, priority: 2 }, 3);
    done({ title: es ? 'Producir beat de "Brasas"' : 'Produce beat for "Embers"', projectId: pEP.id, durationMin: 120, priority: 2 }, 6);
    done({ title: es ? 'Estudiar marketing: tema 3' : 'Study marketing: unit 3', projectId: pMkt.id, durationMin: 60, priority: 2 }, 2);
    done({ title: es ? 'Estudiar marketing: tema 2' : 'Study marketing: unit 2', projectId: pMkt.id, durationMin: 60, priority: 2 }, 5);
    done({ title: es ? 'Estudiar marketing: tema 1' : 'Study marketing: unit 1', projectId: pMkt.id, durationMin: 45, priority: 2 }, 9);
    done({ title: es ? 'Apuntes derecho tema 1-2' : 'Law notes units 1-2', projectId: pLaw.id, durationMin: 90, priority: 3 }, 1);
    done({ title: es ? 'Aprobar examen teórico' : 'Pass theory exam', projectId: pCar.id, priority: 1 }, 12);

    // Eventos y bloques fijos
    const wd = (d: number) => {
      const ws = startOfWeek(today, 1);
      return addDays(ws, d);
    };
    track('events', createEntity('events', eventFields({ title: es ? 'Universidad' : 'University', category: 'study', start: instantOf(wd(0), '11:00'), end: instantOf(wd(0), '15:00'), tz, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }, protected: true, reminders: [] })));
    track('events', createEntity('events', eventFields({ title: es ? 'Trabajo' : 'Work', category: 'work', start: instantOf(wd(0), '16:00'), end: instantOf(wd(0), '21:00'), tz, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4] }, protected: true, reminders: [] })));
    track('events', createEntity('events', eventFields({ title: es ? 'Trayecto' : 'Commute', category: 'commute', start: instantOf(wd(0), '10:30'), end: instantOf(wd(0), '11:00'), tz, recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] }, reminders: [] })));
    track('events', createEntity('events', eventFields({ title: es ? 'Comida' : 'Lunch', category: 'meal', start: instantOf(wd(0), '15:00'), end: instantOf(wd(0), '15:45'), tz, recurrence: { freq: 'daily', interval: 1 }, reminders: [] })));
    track('events', createEntity('events', eventFields({ title: es ? 'Clase práctica de coche' : 'Driving lesson', category: 'personal', start: instantOf(addDays(today, 2), '09:00'), end: instantOf(addDays(today, 2), '10:00'), tz })));
    track('events', createEntity('events', eventFields({ title: es ? 'Ensayo con la banda' : 'Band rehearsal', category: 'leisure', start: instantOf(addDays(today, 3), '19:00'), end: instantOf(addDays(today, 3), '21:00'), tz })));
    track('events', createEntity('events', eventFields({ title: es ? 'Entrega DAFO' : 'SWOT due', category: 'event', allDay: true, date: addDays(today, 3), endDate: addDays(today, 3), start: instantOf(addDays(today, 3), 0), end: instantOf(addDays(today, 4), 0), tz })));

    // Hábitos con historial (con algunos fallos y días saltados: nada de rachas perfectas falsas)
    const habitDefs = [
      { name: es ? 'Entrenar' : 'Workout', icon: '🏋️', color: 'ember', frequency: { kind: 'weekdays' as const, days: [1, 3, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] }, preferredTime: '18:00', durationMin: 60, p: 0.85, difficulty: 3 as const },
      { name: es ? 'Leer 10 páginas' : 'Read 10 pages', icon: '📖', color: 'violet', frequency: { kind: 'daily' as const }, preferredTime: '22:30', durationMin: 15, p: 0.8, difficulty: 1 as const },
      { name: es ? 'Beber agua' : 'Drink water', icon: '💧', color: 'cyan', frequency: { kind: 'daily' as const }, target: 8, unit: es ? 'vasos' : 'glasses', p: 0.7, difficulty: 1 as const },
      { name: es ? 'Practicar guitarra' : 'Practise guitar', icon: '🎸', color: 'magenta', frequency: { kind: 'times_per_week' as const, times: 4 }, durationMin: 30, p: 0.6, difficulty: 2 as const },
      { name: es ? 'Meditar' : 'Meditate', icon: '🧘', color: 'mint', frequency: { kind: 'daily' as const }, preferredTime: '07:45', durationMin: 10, p: 0.65, difficulty: 2 as const },
      { name: es ? 'Estudiar 1 h' : 'Study 1 h', icon: '🧠', color: 'amber', frequency: { kind: 'weekdays' as const, days: [1, 2, 3, 4, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] }, p: 0.75, difficulty: 2 as const },
    ];
    let prevHabitId: string | null = null;
    for (const [i, d] of habitDefs.entries()) {
      const habit = track('habits', createEntity('habits', habitFields({
        name: d.name, icon: d.icon, color: d.color, frequency: d.frequency, preferredTime: d.preferredTime ?? null, durationMin: d.durationMin ?? null,
        target: d.target ?? 1, unit: d.unit ?? '', difficulty: d.difficulty, startDate: addDays(today, -75), graceDays: 1, order: i, reminder: !!d.preferredTime,
      })));
      if (d.name === (es ? 'Meditar' : 'Meditate')) prevHabitId = habit.id;
      for (let k = 75; k >= 1; k--) {
        const date = addDays(today, -k);
        if (!isScheduled(habit, date)) continue;
        const r = rand();
        if (r < d.p) {
          ids.push({ type: 'habitLogs', id: habitLogId(habit.id, date) });
          upsertEntity('habitLogs', habitLogId(habit.id, date), {}, () => ({ habitId: habit.id, date, status: 'done' as const, value: d.target ?? 1, note: '' }));
        } else if (r > 0.97) {
          ids.push({ type: 'habitLogs', id: habitLogId(habit.id, date) });
          upsertEntity('habitLogs', habitLogId(habit.id, date), {}, () => ({ habitId: habit.id, date, status: 'skipped' as const, value: 0, note: '' }));
        }
      }
    }
    // Cadena: Meditar → Beber agua (por la mañana)
    if (prevHabitId) {
      const water = Object.values(useData.getState().c.habits).find((h) => h.name === (es ? 'Beber agua' : 'Drink water') && !h.deletedAt);
      if (water) upsertEntity('habits', water.id, { stackAfter: prevHabitId }, () => habitFields());
    }

    // Sesiones de focus de las últimas semanas (más por la mañana, algunas interrumpidas)
    const tasksNow = Object.values(useData.getState().c.tasks);
    const focusTargets = tasksNow.filter((x) => x.projectId);
    for (let k = 28; k >= 1; k--) {
      const date = addDays(today, -k);
      const n = rand() < 0.15 ? 0 : 1 + Math.floor(rand() * 3);
      for (let s = 0; s < n; s++) {
        const startMin = [9 * 60, 9 * 60 + 45, 10 * 60 + 30, 17 * 60, 21 * 60 + 30][Math.floor(rand() * 5)] + s * 5;
        const planned = [25, 25, 50, 90][Math.floor(rand() * 4)];
        const interrupted = rand() < 0.18;
        const focusSec = Math.round(planned * 60 * (interrupted ? 0.4 + rand() * 0.4 : 1));
        const task = focusTargets[Math.floor(rand() * focusTargets.length)];
        const startedAt = instantOf(date, startMin);
        track('focusSessions', createEntity('focusSessions', {
          taskId: task?.id ?? null, projectId: task?.projectId ?? null, label: task?.title ?? '', mode: planned >= 50 ? 'deep' : 'pomodoro', plannedMin: planned,
          startedAt, endedAt: new Date(new Date(startedAt).getTime() + focusSec * 1000).toISOString(), focusSec, completed: !interrupted, interrupted, interruptionNote: '',
        }));
      }
      // Registro del día (sueño/energía) para que haya datos de correlación honestos.
      if (rand() < 0.8) {
        const bed = ['23:00', '23:30', '00:15', '01:00', '23:45'][Math.floor(rand() * 5)];
        const wake = ['07:00', '07:30', '08:00', '08:30'][Math.floor(rand() * 4)];
        ids.push({ type: 'dayLogs', id: dayLogId(date) });
        upsertEntity('dayLogs', dayLogId(date), { sleepBed: bed, sleepWake: wake, energy: 2 + Math.floor(rand() * 4), mood: 2 + Math.floor(rand() * 4), focus: 2 + Math.floor(rand() * 4), rating: 3 + Math.floor(rand() * 3) }, () => dayLogFields(date));
      }
    }

    // Notas
    track('notes', createEntity('notes', noteFields({ title: es ? 'Ideas para "Ceniza"' : 'Ideas for "Ash"', kind: 'idea', projectId: pEP.id, pinned: true, body: es ? '- Abrir con sintetizador granulado\n- Puente en 6/8\n- Referencias: [[Referencias sonoras]]\n\n- [ ] Probar voz doblada en el estribillo\n- [ ] Grabar guitarra limpia' : '- Open with granular synth\n- Bridge in 6/8\n- References: [[Sound references]]\n\n- [ ] Try doubled vocal on chorus\n- [ ] Record clean guitar' })));
    track('notes', createEntity('notes', noteFields({ title: es ? 'Referencias sonoras' : 'Sound references', body: es ? 'Texturas cálidas, cintas, reverb de muelle.\n\nEnlace: https://example.com/moodboard' : 'Warm textures, tape, spring reverb.\n\nLink: https://example.com/moodboard', projectId: pEP.id })));
    track('notes', createEntity('notes', noteFields({ title: es ? 'Apuntes marketing · 4P' : 'Marketing notes · 4P', projectId: pMkt.id, body: es ? '## Las 4P\n\n1. **Producto**\n2. **Precio**\n3. **Distribución**\n4. **Promoción**\n\n> Repasar ejemplos del tema 4.' : '## The 4P\n\n1. **Product**\n2. **Price**\n3. **Place**\n4. **Promotion**\n\n> Review unit 4 examples.' })));
    track('notes', createEntity('notes', noteFields({ title: es ? 'idea para canción sobre el verano' : 'song idea about summer', kind: 'idea', inbox: true })));

    // Revisión de la semana pasada
    const lastWeek = addDays(startOfWeek(today, 1), -7);
    ids.push({ type: 'reviews', id: `week_${lastWeek}` });
    upsertEntity('reviews', `week_${lastWeek}`, { accomplished: es ? 'Terminé la letra de "Ceniza" y aprobé el teórico.' : 'Finished "Ash" lyrics and passed the theory test.', wentWell: es ? 'Las mañanas de estudio.' : 'Morning study sessions.', didntGoWell: es ? 'Me dispersé por la tarde.' : 'Got scattered in the afternoons.', change: es ? 'Bloquear focus antes de las 11.' : 'Block focus before 11.', priorities: es ? 'DAFO, mezcla pista 2' : 'SWOT, mix track 2', completedAt: instantOf(addDays(lastWeek, 6), 20 * 60) }, () => ({ weekStart: lastWeek, accomplished: '', wentWell: '', didntGoWell: '', change: '', priorities: '', summary: '', completedAt: null }));
  });
  await setMeta(DEMO_KEY, JSON.stringify(ids));
}

export async function removeDemoData(): Promise<void> {
  const raw = await getMeta(DEMO_KEY);
  if (!raw) return;
  const ids = JSON.parse(raw) as { type: EntityType; id: string }[];
  transaction('demo-remove', () => {
    for (const { type, id } of ids) {
      const e = (useData.getState().c[type] as Record<string, { deletedAt: string | null }>)[id];
      if (e && !e.deletedAt) deleteEntity(type, id);
    }
    // Instancias recurrentes creadas a partir de tareas de ejemplo
    const removed = new Set(ids.map((x) => x.id));
    for (const task of Object.values(useData.getState().c.tasks)) if (task.seriesId && removed.has(task.seriesId) && !task.deletedAt) deleteEntity('tasks', task.id);
  });
  await setMeta(DEMO_KEY, '');
}
