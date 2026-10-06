// Renderiza los SVG de marca a PNG. Uso: node scripts/render-icons.mjs
// Después: npx tauri icon assets/brand/icon-1024.png  (genera todos los tamaños)
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const render = (src, out, width) => {
  const svg = readFileSync(src, 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(out, png);
  console.log(`✓ ${out} (${width}px)`);
};

mkdirSync('public', { recursive: true });
render('assets/brand/icon.svg', 'assets/brand/icon-1024.png', 1024);
render('assets/brand/icon.svg', 'public/icon-192.png', 192);
render('assets/brand/tray.svg', 'src-tauri/icons/tray.png', 44);
