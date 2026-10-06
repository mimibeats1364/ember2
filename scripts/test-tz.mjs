// Ejecuta la suite de tests con una zona horaria concreta.
// Las funciones de fecha deben comportarse igual en cualquier zona (incluido DST).
import { spawnSync } from 'node:child_process';

const tz = process.argv[2] ?? 'Europe/Madrid';
console.log(`\n▶ Tests con TZ=${tz}`);
const res = spawnSync('npx', ['vitest', 'run', '--reporter=dot'], {
  stdio: 'inherit',
  env: { ...process.env, TZ: tz },
});
process.exit(res.status ?? 1);
