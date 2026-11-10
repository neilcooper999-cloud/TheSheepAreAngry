// Writes the game's content and tuning (regions, recipes, shelters, names...) to dist/game-data.json,
// so a native build can load exactly the same data as the web game.
//   node tools/export-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadCore } from '../tests/load-core.mjs';

const { data } = loadCore();
const root = new URL('../', import.meta.url);
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/game-data.json', root), JSON.stringify(data, null, 2) + '\n');
console.log('dist/game-data.json written');
