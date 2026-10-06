/**
 * Exportar / importar datos (JSON, CSV, ICS, Markdown). Formatos documentados en docs/FORMATOS.md.
 */
import { createBackup, parseBackup, planMerge, BackupError } from '@core/io/backup';
import { tasksToCsv, csvToTaskRows } from '@core/io/csv';
import { toIcs, parseIcs } from '@core/io/ics';
import { journalToMarkdown, notesToMarkdown, projectsToMarkdown } from '@core/io/markdown';
import { localTimeZone, today } from '@core/dates';
import { createEntity, importEntities, transaction, updateEntity, useData } from '@/data/store';
import { ensureTags } from '@/data/actions';
import { areaFields, eventFields, projectFields, taskFields } from '@/data/defaults';
import { openTextFile, saveTextFile } from '@/platform/native';
import { APP_VERSION } from '@/platform/env';
import { t, type TKey } from '@/i18n';
import { toast } from '@/app/ui';

const live = <T extends { deletedAt: string | null }>(r: Record<string, T>) => Object.values(r).filter((x) => !x.deletedAt);

async function save(name: string, content: string, ext: string) {
  try {
    if (await saveTextFile(name, content, ext, ext.toUpperCase())) toast(t('settings.exported'));
  } catch {
    toast(t('errors.generic'), { kind: 'error' });
  }
}

export async function exportJson() {
  const c = useData.getState().c;
  await save(`ember-copia-${today()}.json`, JSON.stringify(createBackup(c, APP_VERSION), null, 2), 'json');
}

export async function exportCsv() {
  const c = useData.getState().c;
  await save(`ember-tareas-${today()}.csv`, '﻿' + tasksToCsv(live(c.tasks), c.projects, c.areas, c.tags), 'csv');
}

export async function exportIcs() {
  const c = useData.getState().c;
  await save(`ember-calendario-${today()}.ics`, toIcs(live(c.events), live(c.tasks)), 'ics');
}

export async function exportMarkdown() {
  const c = useData.getState().c;
  const md = [
    `# Ember · ${today()}`,
    '',
    '# Notas',
    '',
    notesToMarkdown(live(c.notes), c.tags),
    '',
    '# Diario',
    '',
    journalToMarkdown(live(c.dayLogs)),
    '',
    '# Proyectos',
    '',
    projectsToMarkdown(live(c.projects), live(c.tasks)),
  ].join('\n');
  await save(`ember-notas-${today()}.md`, md, 'md');
}

function importError(reason: string) {
  const key = `errors.importReasons.${reason}` as TKey;
  const text = t(key);
  toast(t('settings.importError', { reason: text === key ? reason : text }), { kind: 'error', duration: 6000 });
}

export async function importJson() {
  const file = await openTextFile(['json'], 'JSON');
  if (!file) return;
  try {
    const backup = parseBackup(file.text);
    const plan = planMerge(useData.getState().c, backup);
    importEntities(plan.upserts);
    toast(t('settings.importResult', { added: plan.added, updated: plan.updated }));
  } catch (e) {
    importError(e instanceof BackupError ? e.message : 'corrupt');
  }
}

export async function importCsv() {
  const file = await openTextFile(['csv', 'txt'], 'CSV');
  if (!file) return;
  try {
    const { rows } = csvToTaskRows(file.text);
    transaction('import-csv', () => {
      const c = useData.getState().c;
      const projects = live(c.projects);
      const areas = live(c.areas);
      for (const r of rows) {
        let projectId: string | null = null;
        let areaId: string | null = null;
        if (r.area) {
          const a = areas.find((x) => x.name.toLowerCase() === r.area!.toLowerCase()) ?? createEntity('areas', areaFields({ name: r.area }));
          if (!areas.includes(a)) areas.push(a);
          areaId = a.id;
        }
        if (r.project) {
          const p = projects.find((x) => x.name.toLowerCase() === r.project!.toLowerCase()) ?? createEntity('projects', projectFields({ name: r.project, areaId }));
          if (!projects.includes(p)) projects.push(p);
          projectId = p.id;
        }
        createEntity('tasks', taskFields({
          title: r.title, status: r.status, priority: r.priority, date: r.date, time: r.time, durationMin: r.durationMin, deadline: r.deadline,
          projectId, areaId, tagIds: r.tags.length ? ensureTags(r.tags) : [], notes: r.notes, completedAt: r.status === 'done' ? (r.completedAt ?? new Date().toISOString()) : null,
        }));
      }
    });
    toast(t('settings.importResult', { added: rows.length, updated: 0 }));
  } catch (e) {
    importError(e instanceof Error ? e.message : 'corrupt');
  }
}

export async function importIcsFile() {
  const file = await openTextFile(['ics'], 'iCalendar');
  if (!file) return;
  try {
    const events = parseIcs(file.text);
    let added = 0;
    let updated = 0;
    transaction('import-ics', () => {
      const existing = live(useData.getState().c.events);
      for (const e of events) {
        const fields = { title: e.title, notes: e.notes, location: e.location, allDay: e.allDay, date: e.date, endDate: e.endDate, start: e.allDay ? new Date(`${e.date}T00:00:00`).toISOString() : e.start, end: e.allDay ? new Date(`${e.endDate}T23:59:00`).toISOString() : e.end, recurrence: e.recurrence, exdates: e.exdates, source: 'ics' as const, externalId: e.uid || null, tz: localTimeZone(), reminders: [] };
        const match = e.uid ? existing.find((x) => x.externalId === e.uid) : undefined;
        if (match) {
          updateEntity('events', match.id, fields);
          updated++;
        } else {
          createEntity('events', eventFields(fields));
          added++;
        }
      }
    });
    toast(t('settings.importResult', { added, updated }));
  } catch {
    importError('corrupt');
  }
}
