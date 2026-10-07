// Renderiza los SVG de marca a PNG. Uso: node scripts/render-icons.mjs
// Después: npx tauri icon assets/brand/icon-1024.png  (genera todos los tamaños)
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const render = (src, out, width, transform = (svg) => svg) => {
  const svg = transform(readFileSync(src, 'utf8'));
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(out, png);
  console.log(`✓ ${out} (${width}px)`);
};

mkdirSync('public', { recursive: true });
render('assets/brand/icon.svg', 'assets/brand/icon-1024.png', 1024);
render('assets/brand/icon.svg', 'public/icon-192.png', 192);
render('assets/brand/icon.svg', 'public/icon-512.png', 512);
// Variante a sangre (sin esquinas ni borde): Android la recorta con su máscara e iOS redondea
// las esquinas por su cuenta. El orbe queda dentro de la zona segura (80 % central).
const fullBleed = (svg) =>
  svg
    .replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"')
    .replace(/rx="186" ry="186"/, 'rx="0" ry="0"')
    .replace(/<rect x="101"[^>]*\/>/, '');
render('assets/brand/icon.svg', 'public/icon-maskable-512.png', 512, fullBleed);
render('assets/brand/icon.svg', 'public/apple-touch-icon.png', 180, fullBleed);
render('assets/brand/tray.svg', 'src-tauri/icons/tray.png', 44);
