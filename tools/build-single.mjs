// Bundles index.html, its stylesheet and scripts into one self-contained file, dist/sheep.html,
// for sharing as a single page (for example as a Claude artifact). No dependencies.
//   node tools/build-single.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="(?!https?:)([^"]+)">/g, (_, p) => `<style>\n${read(p)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, p) => `<script>\n${read(p).replace(/<\/script/gi, '<\\/script')}</script>`);
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/sheep.html', root), html);
console.log(`dist/sheep.html written (${(html.length / 1024).toFixed(1)} KB)`);
