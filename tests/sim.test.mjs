import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const idle = { mx: 0, my: 0 };
const STEP = 1 / 60;

function run(sim, seconds, cmdFor = () => idle) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && sim.state().running; i++) sim.update(STEP, cmdFor(i));
}

test('the core runs without any browser globals', () => {
  const { sim, data } = loadCore();
  const S = sim.newGame(1);
  assert.equal(S.p.x, data.CONFIG.WORLD / 2);
  run(sim, 5);
  assert.ok(S.t > 0);
});

test('the same seed builds the same world', () => {
  const a = loadCore().sim.newGame(42),
    b = loadCore().sim.newGame(42),
    c = loadCore().sim.newGame(43);
  // each loadCore() is its own sandbox, so compare plain JSON rather than objects from different realms
  const sig = (S) => JSON.stringify([S.trees.length, S.rocks.length, S.strays.map((s) => s.name), Array.from(S.terr.slice(0, 5000))]);
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

test('a seeded game replays exactly', () => {
  const play = () => {
    const { sim } = loadCore();
    sim.newGame(7);
    run(sim, 30, (i) => ({ mx: Math.cos(i / 200), my: Math.sin(i / 200), charge: i % 180 === 0, bleat: i % 600 === 0 }));
    const S = sim.state();
    return [S.p.x, S.p.y, S.p.hunger, S.flock.length, S.preds.length, S.wood];
  };
  assert.deepEqual(play(), play());
});

test('the world has the guaranteed ewe and ram near home, and pens', () => {
  const { sim, data } = loadCore();
  const S = sim.newGame(5),
    c = data.CONFIG.WORLD / 2;
  const near = S.strays.filter((s) => !s.pen && Math.hypot(s.x - c, s.y - c) < 720);
  assert.ok(
    near.some((s) => s.ram),
    'a ram near home',
  );
  assert.ok(
    near.some((s) => !s.ram),
    'a ewe near home',
  );
  assert.ok(S.pens.length > 0, 'some pens');
});

test('walking up to a stray recruits it', () => {
  const { sim } = loadCore();
  const S = sim.newGame(3);
  const s = S.strays.find((x) => !x.pen);
  S.p.x = s.x + 20;
  S.p.y = s.y;
  sim.update(STEP, idle);
  assert.ok(S.flock.includes(s));
  const ev = sim.drainEvents();
  assert.ok(ev.some((e) => e.type === 'recruit'));
  assert.ok(ev.some((e) => e.type === 'toast'));
});

test('hunger falls when idle and grazing refills it', () => {
  const { sim } = loadCore();
  const S = sim.newGame(9);
  run(sim, 60);
  const h = S.p.hunger;
  assert.ok(h < 100);
  run(sim, 10, () => ({ mx: 0, my: 0, graze: true }));
  assert.ok(S.p.hunger > h);
});

test('crafting: locked, affordable and built', () => {
  const { sim } = loadCore();
  const S = sim.newGame(11);
  const opt = (id) => sim.craftOptions().find((o) => o.id === id);
  assert.equal(opt('horns1').status, 'short');
  assert.equal(opt('horns2').status, 'locked');
  S.wood = 6;
  assert.equal(opt('horns1').status, 'ok');
  assert.ok(sim.build('horns1'));
  assert.equal(S.horns, 1);
  assert.equal(S.wood, 0);
  assert.equal(opt('horns1').status, 'done');
  assert.equal(sim.build('horns1'), false, 'cannot build twice');
  S.wood = 12;
  assert.ok(sim.build('shelter'));
  assert.equal(S.folds.length, 1);
  assert.equal(opt('shelter').name, 'Wool-lined Pen');
});

test('ram requirements count rams in the flock', () => {
  const { sim } = loadCore();
  const S = sim.newGame(13);
  S.shears = 1;
  S.wool = 18;
  for (let i = 0; i < 4; i++) S.flock.push({ ...S.strays[0], ram: i === 0, x: S.p.x, y: S.p.y });
  assert.equal(sim.craftOptions().find((o) => o.id === 'ramcoat').status, 'ok');
  assert.ok(sim.build('ramcoat'));
  assert.ok(S.flock[0].coat);
});

test('starving to death ends the game with an event', () => {
  const { sim } = loadCore();
  const S = sim.newGame(17);
  S.p.hunger = 0;
  S.p.health = 1;
  run(sim, 1);
  assert.equal(S.over, true);
  assert.ok(sim.drainEvents().some((e) => e.type === 'over'));
});

test('a long night-time run stays healthy (no NaN, no runaway lists)', () => {
  const { sim } = loadCore();
  const S = sim.newGame(21);
  S.t = 320 * 0.73; // night
  S.p.health = 1e9; // keep Flossy alive so the predators keep coming
  run(sim, 120, (i) => ({ mx: Math.cos(i / 90), my: Math.sin(i / 70), charge: i % 120 === 0 }));
  for (const v of [S.p.x, S.p.y, S.p.hunger]) assert.ok(Number.isFinite(v));
  assert.ok(S.preds.length < 60);
  assert.ok(S.texts.length < 200);
});
