/**
 * Markdown → HTML seguro. El HTML crudo se escapa y los enlaces solo admiten http(s)/mailto,
 * porque las notas pueden venir de importaciones o (en el futuro) de otros dispositivos.
 * Soporta [[enlaces entre notas]] y checklists interactivas (- [ ] / - [x]).
 */
import { Marked, type Tokens } from 'marked';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  return null;
}

export function renderMarkdown(src: string, titles: Set<string>): string {
  let checkIndex = 0;
  const md = new Marked({ gfm: true, breaks: true });
  md.use({
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(text);
      },
      link({ href, text }: Tokens.Link) {
        const safe = safeHref(href);
        return safe ? `<a href="${escapeHtml(safe)}" rel="noreferrer">${escapeHtml(text)}</a>` : escapeHtml(text);
      },
      image({ href, text }: Tokens.Image) {
        const safe = safeHref(href);
        return safe && /^https?:/i.test(safe) ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}" loading="lazy" />` : escapeHtml(text);
      },
      checkbox({ checked }: Tokens.Checkbox) {
        return `<input type="checkbox" data-check="${checkIndex++}" ${checked ? 'checked' : ''} /> `;
      },
    },
  });
  // [[Título]] → marcador neutro antes de parsear; después se sustituye por un botón seguro.
  const links: string[] = [];
  const withMarkers = src.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, raw: string) => {
    links.push(raw.trim());
    return `\u2063WL${links.length - 1}\u2063`;
  });
  const html = md.parse(withMarkers, { async: false }) as string;
  return html.replace(/\u2063WL(\d+)\u2063/g, (_, i: string) => {
    const title = links[Number(i)] ?? '';
    const cls = titles.has(title.toLowerCase()) ? 'wikilink' : 'wikilink missing';
    return `<button type="button" class="${cls}" data-wikilink="${escapeHtml(title)}">${escapeHtml(title)}</button>`;
  });
}

/** Alterna la n-ésima casilla de checklist en el texto fuente. */
export function toggleChecklist(src: string, index: number): string {
  let i = -1;
  return src.replace(/^(\s*[-*+]\s+)\[( |x|X)\]/gm, (m, prefix: string, mark: string) => {
    i++;
    if (i !== index) return m;
    return `${prefix}[${mark === ' ' ? 'x' : ' '}]`;
  });
}

export function uncheckedItems(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*[-*+]\s+\[ \]\s+(.+)$/gm)) out.push(m[1].trim());
  return out;
}

export function wikilinksIn(src: string): string[] {
  return [...src.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)].map((m) => m[1].trim());
}
