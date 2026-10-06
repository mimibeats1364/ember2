/**
 * Exportación legible en Markdown: notas, diario y proyectos con sus tareas.
 */
import type { DayLog, Note, Project, Tag, Task } from '../types';

export function notesToMarkdown(notes: Note[], tags: Record<string, Tag>): string {
  return notes
    .filter((n) => !n.deletedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((n) => {
      const tagLine = n.tagIds.map((id) => tags[id]?.name).filter(Boolean).map((t) => `#${t}`).join(' ');
      return [`# ${n.title || 'Sin título'}`, '', `> ${n.kind === 'idea' ? 'Idea' : 'Nota'} · ${n.createdAt.slice(0, 10)}${tagLine ? ' · ' + tagLine : ''}`, '', n.body.trim(), ''].join('\n');
    })
    .join('\n---\n\n');
}

const stars = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—');

export function journalToMarkdown(logs: DayLog[]): string {
  return logs
    .filter((l) => !l.deletedAt && (l.journal || l.highlight || l.improve || l.rating))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) =>
      [
        `## ${l.date}`,
        '',
        `Valoración ${stars(l.rating)} · Energía ${stars(l.energy)} · Foco ${stars(l.focus)} · Ánimo ${stars(l.mood)}`,
        l.intention ? `\n**Lo que importaba:** ${l.intention}` : '',
        l.highlight ? `\n**Lo más importante que conseguí:** ${l.highlight}` : '',
        l.improve ? `\n**Qué haría distinto:** ${l.improve}` : '',
        l.journal ? `\n${l.journal}` : '',
        '',
      ]
        .filter((x) => x !== '')
        .join('\n'),
    )
    .join('\n');
}

export function projectsToMarkdown(projects: Project[], tasks: Task[]): string {
  const out: string[] = [];
  for (const p of projects.filter((x) => !x.deletedAt)) {
    out.push(`# ${p.icon} ${p.name}`, '');
    if (p.description) out.push(p.description, '');
    if (p.deadline) out.push(`Fecha límite: ${p.deadline}`, '');
    for (const t of tasks.filter((x) => !x.deletedAt && x.projectId === p.id && !x.parentId)) {
      out.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.deadline ? ` (límite ${t.deadline})` : ''}`);
      for (const c of t.checklist) out.push(`  - [${c.done ? 'x' : ' '}] ${c.text}`);
    }
    out.push('');
  }
  return out.join('\n');
}
