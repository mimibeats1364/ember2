/**
 * Búsqueda global instantánea, insensible a tildes y mayúsculas, con coincidencia difusa.
 */
import { normalizeText } from './nlp';

export type SearchType = 'task' | 'project' | 'note' | 'habit' | 'goal' | 'event' | 'area';

export interface SearchDoc {
  type: SearchType;
  id: string;
  title: string;
  body?: string;
  tags?: string[];
  context?: string;
  /** Desempate: lo más reciente primero. */
  updated?: string;
  done?: boolean;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
}

interface Prepared {
  doc: SearchDoc;
  title: string;
  words: string[];
  body: string;
  tags: string[];
  context: string;
}

export class SearchIndex {
  private items: Prepared[] = [];

  constructor(docs: SearchDoc[]) {
    this.items = docs.map((doc) => {
      const title = normalizeText(doc.title);
      return {
        doc,
        title,
        words: title.split(/[^a-z0-9ñ]+/).filter(Boolean),
        body: normalizeText(doc.body ?? '').slice(0, 4000),
        tags: (doc.tags ?? []).map(normalizeText),
        context: normalizeText(doc.context ?? ''),
      };
    });
  }

  search(query: string, limit = 30): SearchHit[] {
    const q = normalizeText(query.trim());
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];
    for (const it of this.items) {
      let total = 0;
      let ok = true;
      for (const term of terms) {
        const s = scoreTerm(it, term);
        if (s <= 0) {
          ok = false;
          break;
        }
        total += s;
      }
      if (!ok) continue;
      if (it.title === q) total += 50;
      else if (it.title.startsWith(q)) total += 25;
      if (it.doc.done) total -= 15;
      hits.push({ doc: it.doc, score: total });
    }
    return hits
      .sort((a, b) => b.score - a.score || (b.doc.updated ?? '').localeCompare(a.doc.updated ?? ''))
      .slice(0, limit);
  }
}

function scoreTerm(it: Prepared, term: string): number {
  if (it.words.some((w) => w === term)) return 100;
  if (it.words.some((w) => w.startsWith(term))) return 80;
  if (it.title.includes(term)) return 60;
  if (it.tags.some((t) => t.startsWith(term))) return 55;
  if (it.context.includes(term)) return 40;
  if (it.body.includes(term)) return 30;
  if (term.length >= 3) {
    const fuzzy = subsequenceScore(it.title, term);
    if (fuzzy > 0) return fuzzy;
  }
  return 0;
}

/** Coincidencia por subsecuencia ("mktg" → "marketing"), penalizando huecos. */
function subsequenceScore(text: string, term: string): number {
  let ti = 0;
  let gaps = 0;
  let last = -1;
  for (let i = 0; i < text.length && ti < term.length; i++) {
    if (text[i] === term[ti]) {
      if (last >= 0) gaps += i - last - 1;
      last = i;
      ti++;
    }
  }
  if (ti < term.length) return 0;
  return Math.max(5, 25 - gaps);
}
