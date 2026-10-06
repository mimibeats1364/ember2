/**
 * CSV de tareas (RFC 4180). Cabeceras aceptadas en español o inglés.
 */
import { isValidLocalDate, isValidTime } from '../dates';
import type { Area, Priority, Project, Tag, Task } from '../types';

export const TASK_CSV_COLUMNS = [
  'id', 'titulo', 'estado', 'prioridad', 'fecha', 'hora', 'duracion_min', 'fecha_limite', 'proyecto', 'area', 'etiquetas', 'notas', 'completada',
] as const;

const ALIASES: Record<string, (typeof TASK_CSV_COLUMNS)[number]> = {
  id: 'id', titulo: 'titulo', title: 'titulo', tarea: 'titulo', task: 'titulo', name: 'titulo', nombre: 'titulo',
  estado: 'estado', status: 'estado', prioridad: 'prioridad', priority: 'prioridad',
  fecha: 'fecha', date: 'fecha', hora: 'hora', time: 'hora',
  duracion_min: 'duracion_min', duracion: 'duracion_min', duration: 'duracion_min', duration_min: 'duracion_min',
  fecha_limite: 'fecha_limite', deadline: 'fecha_limite', due: 'fecha_limite', due_date: 'fecha_limite',
  proyecto: 'proyecto', project: 'proyecto', area: 'area', etiquetas: 'etiquetas', tags: 'etiquetas', labels: 'etiquetas',
  notas: 'notas', notes: 'notas', description: 'notas', descripcion: 'notas', completada: 'completada', completed: 'completada', completed_at: 'completada',
};

function escape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function tasksToCsv(tasks: Task[], projects: Record<string, Project>, areas: Record<string, Area>, tags: Record<string, Tag>): string {
  const rows = [TASK_CSV_COLUMNS.join(',')];
  for (const t of tasks) {
    if (t.deletedAt) continue;
    rows.push(
      [
        t.id,
        t.title,
        t.status,
        `P${t.priority}`,
        t.date ?? '',
        t.time ?? '',
        t.durationMin?.toString() ?? '',
        t.deadline ?? '',
        t.projectId ? (projects[t.projectId]?.name ?? '') : '',
        t.areaId ? (areas[t.areaId]?.name ?? '') : '',
        t.tagIds.map((id) => tags[id]?.name).filter(Boolean).join('; '),
        t.notes,
        t.completedAt ?? '',
      ]
        .map((v) => escape(String(v)))
        .join(','),
    );
  }
  return rows.join('\r\n') + '\r\n';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export interface CsvTaskRow {
  title: string;
  status: Task['status'];
  priority: Priority;
  date: string | null;
  time: string | null;
  durationMin: number | null;
  deadline: string | null;
  project: string | null;
  area: string | null;
  tags: string[];
  notes: string;
  completedAt: string | null;
}

export function csvToTaskRows(text: string): { rows: CsvTaskRow[]; skipped: number } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0 };
  const header = table[0].map((h) => ALIASES[h.trim().toLowerCase().replace(/\s+/g, '_')] ?? null);
  if (!header.includes('titulo')) throw new Error('missing_title_column');
  const rows: CsvTaskRow[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const get = (col: (typeof TASK_CSV_COLUMNS)[number]) => {
      const i = header.indexOf(col);
      return i >= 0 ? (r[i] ?? '').trim() : '';
    };
    const title = get('titulo');
    if (!title) {
      skipped++;
      continue;
    }
    const p = get('prioridad').replace(/^p/i, '');
    const status = get('estado') as Task['status'];
    const date = get('fecha');
    const deadline = get('fecha_limite');
    const time = get('hora');
    const dur = parseInt(get('duracion_min'), 10);
    rows.push({
      title,
      status: ['backlog', 'todo', 'in_progress', 'done', 'dropped'].includes(status) ? status : get('completada') ? 'done' : 'todo',
      priority: (['1', '2', '3', '4'].includes(p) ? Number(p) : 4) as Priority,
      date: isValidLocalDate(date) ? date : null,
      time: isValidTime(time) ? time : null,
      durationMin: Number.isFinite(dur) && dur > 0 ? dur : null,
      deadline: isValidLocalDate(deadline) ? deadline : null,
      project: get('proyecto') || null,
      area: get('area') || null,
      tags: get('etiquetas').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
      notes: get('notas'),
      completedAt: get('completada') || null,
    });
  }
  return { rows, skipped };
}
