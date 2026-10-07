/**
 * Genera docs/TUTORIAL.md a partir de src/features/learn/lessons.ts (la misma fuente que usa la
 * pantalla Aprende y que verifican los tests). Uso: npm run docs:tutorial
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { LESSONS, MODULES } = await import(join(root, 'src/features/learn/lessons.ts'));

const md = (s) => s.replace(/`([^`]+)`/g, '<kbd>$1</kbd>');
const out = [];
out.push('# Tutorial de Ember');
out.push('');
out.push('> Este documento se genera con `npm run docs:tutorial` a partir de las lecciones de la pantalla **Aprende** de la app.');
out.push('> Cada frase, comando, enlace y atajo que aparece aquí está comprobado por los tests automáticos (`src/features/learn/lessons.test.ts`).');
out.push('');
out.push('Dentro de Ember tienes este mismo tutorial, interactivo, en **Aprende** (barra lateral). Además:');
out.push('');
out.push('- <kbd>?</kbd> abre la chuleta de atajos en cualquier pantalla.');
out.push('- En la paleta <kbd>⌘K</kbd>, escribe "recorrido guiado" para ver el recorrido de un minuto.');
out.push('');
out.push('## Índice');
out.push('');
for (const m of MODULES) {
  out.push(`- ${m.icon} **${m.title}**`);
  for (const l of LESSONS.filter((x) => x.module === m.id)) out.push(`  - [${l.title}](#${l.id})`);
}
out.push('');
for (const m of MODULES) {
  out.push(`## ${m.icon} ${m.title}`);
  out.push('');
  for (const l of LESSONS.filter((x) => x.module === m.id)) {
    out.push(`<a id="${l.id}"></a>`);
    out.push('');
    out.push(`### ${l.icon} ${l.title}`);
    out.push('');
    out.push(`*${l.summary}* · ${l.minutes} min`);
    out.push('');
    l.steps.forEach((s, i) => {
      out.push(`${i + 1}. **${s.title}.** ${md(s.body)}`);
    });
    out.push('');
    if (l.capture?.length) {
      out.push('**Prueba a escribir en la captura (`N`):**');
      out.push('');
      out.push('| Escribe | Ember entiende |');
      out.push('|---|---|');
      for (const c of l.capture) out.push(`| \`${c.text}\` | ${c.result} |`);
      out.push('');
    }
    if (l.commands?.length) {
      out.push('**Comandos para la paleta (`⌘K`):**');
      out.push('');
      out.push('| Escribe | Qué hace |');
      out.push('|---|---|');
      for (const c of l.commands) out.push(`| \`${c.text}\` | ${c.result} |`);
      out.push('');
    }
    if (l.links?.length) {
      out.push('**Enlaces (Atajos de Apple, Raycast, Alfred):**');
      out.push('');
      out.push('| Enlace | Qué hace |');
      out.push('|---|---|');
      for (const c of l.links) out.push(`| \`${decodeURIComponent(c.url)}\` | ${c.result} |`);
      out.push('');
      out.push('> En Atajos, codifica el texto con la acción **Codificar URL** antes de **Abrir URL** (los espacios y las tildes se escriben como `%20`, `%C3%B1`…).');
      out.push('');
    }
    if (l.shortcuts?.length) {
      out.push('**Atajos:**');
      out.push('');
      for (const s of l.shortcuts) out.push(`- ${s.keys.split(' ').map((k) => `<kbd>${k}</kbd>`).join(' ')} — ${s.label}${s.pref ? ' (configurable en Ajustes → Atajos)' : ''}`);
      out.push('');
    }
    if (l.goTo) {
      out.push(`➜ En la app: **${l.goTo.label}**.`);
      out.push('');
    }
  }
}
writeFileSync(join(root, 'docs/TUTORIAL.md'), out.join('\n'));
console.log(`docs/TUTORIAL.md · ${LESSONS.length} lecciones`);
