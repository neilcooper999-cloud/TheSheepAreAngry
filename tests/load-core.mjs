// Loads the browser-free core scripts into a fresh sandbox, the same way index.html does,
// so the simulation can be tested in Node without a browser.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CORE = ['src/core/util.js', 'src/core/data.js', 'src/core/world.js', 'src/core/sim.js'];

export function loadCore() {
  const ctx = vm.createContext({ console });
  for (const f of CORE) vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  return ctx.Sheep;
}
