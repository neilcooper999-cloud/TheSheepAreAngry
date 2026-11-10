// The game simulation: rules, AI, crafting and combat. No browser APIs: no DOM, canvas, audio,
// timers or storage. It takes a fixed time step and a player command, and changes the game state.
// Anything the outside world should react to (a sound, a message, game over) goes into
// state.events, which the platform layer drains after each frame.
(function (Sheep) {
  'use strict';
  const { rnd, random, clamp } = Sheep.util;
  const { CONFIG, TERR, TERR_SPEED, REG, SHELTERS, RECIPES, KIND_INTRO, DOG_NAMES } = Sheep.data;
  const { generateWorld, tileAt } = Sheep.world;
  const { WORLD, T, COLS, DAY, NIGHT_START, VIS_DAY, VIS_NIGHT, BLEAT_RANGE, BLEAT_COOLDOWN, PACE, CIRCLE_MIN, LOST_DIST } = CONFIG;
  const { MEADOW, WATER } = TERR;

  let S = null; // the current game state

  // ---------- lifecycle ----------
  function newGame(seed) {
    S = generateWorld(seed);
    grid = null;
    return S;
  }
  const state = () => S;

  // ---------- events out to the platform ----------
  const emit = (type, data = {}) => S.events.push({ type, ...data });
  const toast = (text, sec = 3.5) => emit('toast', { text, sec });
  const sfx = (name, arg) => emit('sfx', { name, arg });
  // show a one-off hint only the first time
  const once = (key) => (S.shown[key] ? false : (S.shown[key] = true));
  function drainEvents() {
    const ev = S.events;
    S.events = [];
    return ev;
  }

  // ---------- queries ----------
  const terrAt = (x, y) => S.terr[tileAt(x, y)];
  const regionAt = (x, y) => S.reg[tileAt(x, y)];
  const region = (x, y) => REG[regionAt(x, y)];
  const bleatRange = () => BLEAT_RANGE * (S.trumpet ? 1.5 : 1);
  const phase = () => (S.t % DAY) / DAY;
  const isNight = () => phase() > NIGHT_START;
  // 0 = full day, 1 = full night
  function nightness() {
    const ph = phase();
    if (ph < 0.06) return 1 - ph / 0.06;
    if (ph < NIGHT_START - 0.06) return 0;
    if (ph < NIGHT_START + 0.02) return (ph - (NIGHT_START - 0.06)) / 0.08;
    return 1;
  }
  // more eyes in the flock see further, up to a point
  const vision = () => {
    const n = S.flock.length,
      nt = nightness();
    return (
      (VIS_DAY + Math.min(120, n * 5) + (VIS_NIGHT + Math.min(50, n * 2) - VIS_DAY - Math.min(120, n * 5)) * nt) * (S.p.grazing ? 0.7 : 1)
    );
  };
  const allSheep = () => [S.p, ...S.flock];
  function neighbours(s, r) {
    let n = 0;
    for (const o of allSheep()) if (o !== s && Math.hypot(o.x - s.x, o.y - s.y) < r) n++;
    return n;
  }
  const rank = (n) => (n >= 20 ? 'Herd' : n >= 5 ? 'Flock' : 'Stray');
  const ramCount = () => S.flock.filter((s) => s.ram).length;
  const flockSize = () => S.flock.length + 1;
  const circleRadius = () => 44 + Math.sqrt(S.flock.length) * 11;
  const inFold = (o) => S.folds.some((f) => Math.hypot(o.x - f.x, o.y - f.y) < f.r);
  const shelterHere = () => S.folds.find((f) => Math.hypot(S.p.x - f.x, S.p.y - f.y) < f.r);
  const hostile = (w) => !(w.kind === 'dog' && w.tame);

  // how much the flock can carry: Flossy's own share, plus more for every ewe and more again for a ram
  const carryCap = () => 15 + S.flock.reduce((a, s) => a + (s.ram ? 10 : 6), 0) + [0, 20, 60][S.bags];
  const load = () => S.wool + S.wood + S.stone + S.metal + S.tech;
  const room = () => Math.max(0, carryCap() - load());

  // ---------- collision ----------
  const CELL = 200;
  let grid = null; // spatial hash of round solids, rebuilt when something is added or broken
  const circles = () => S.rocks.concat(S.trees, S.walls, S.wrecks);
  function solidsNear(x, y) {
    if (!grid) {
      grid = new Map();
      for (const o of circles()) {
        const k = ~~(o.x / CELL) * 4096 + ~~(o.y / CELL);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(o);
      }
    }
    const cx = ~~(x / CELL),
      cy = ~~(y / CELL),
      out = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const c = grid.get((cx + dx) * 4096 + cy + dy);
        if (c) out.push(...c);
      }
    return out;
  }
  const inHouse = (o, h, rad) => o.x > h.x - rad && o.x < h.x + h.w + rad && o.y > h.y - rad && o.y < h.y + h.h + rad;
  function collide(o, rad) {
    for (const r of solidsNear(o.x, o.y)) {
      const d = Math.hypot(o.x - r.x, o.y - r.y),
        m = r.r + rad;
      if (d < m && d > 0) {
        o.x = r.x + ((o.x - r.x) / d) * m;
        o.y = r.y + ((o.y - r.y) / d) * m;
      }
    }
    for (const h of S.houses) {
      if (inHouse(o, h, rad)) {
        const l = o.x - (h.x - rad),
          r = h.x + h.w + rad - o.x,
          t = o.y - (h.y - rad),
          b = h.y + h.h + rad - o.y,
          mn = Math.min(l, r, t, b);
        if (mn === l) o.x = h.x - rad;
        else if (mn === r) o.x = h.x + h.w + rad;
        else if (mn === t) o.y = h.y - rad;
        else o.y = h.y + h.h + rad;
      }
    }
    o.x = clamp(o.x, rad, WORLD - rad);
    o.y = clamp(o.y, rad, WORLD - rad);
  }
  // every animal, Flossy included, moves through here, so PACE slows the whole game evenly
  function moveBy(o, dt) {
    const f = TERR_SPEED[terrAt(o.x, o.y)] * PACE;
    const nx = o.x + o.vx * dt * f;
    if (terrAt(nx, o.y) !== WATER) o.x = nx;
    else o.vx *= -0.2;
    const ny = o.y + o.vy * dt * f;
    if (terrAt(o.x, ny) !== WATER) o.y = ny;
    else o.vy *= -0.2;
  }

  function say(x, y, txt, col = '#f4f2e6') {
    S.texts.push({ x, y, txt, col, life: 2.2 });
  }

  // ---------- exploration ----------
  function explore() {
    const p = S.p,
      r = vision(),
      tr = Math.ceil(r / T);
    const cx = ~~(p.x / T),
      cy = ~~(p.y / T);
    for (let y = cy - tr; y <= cy + tr; y++)
      for (let x = cx - tr; x <= cx + tr; x++) {
        if (x < 0 || y < 0 || x >= COLS || y >= COLS) continue;
        const i = y * COLS + x;
        if (S.explored[i]) continue;
        if (Math.hypot((x + 0.5) * T - p.x, (y + 0.5) * T - p.y) < r) {
          S.explored[i] = 1;
          S.newlyExplored.push(i); // the renderer paints these onto the minimap
        }
      }
  }

  // ---------- flock ----------
  function fullUp(p) {
    say(p.x, p.y - 34, "Can't carry any more!", '#e05a4a');
    if (once('full')) toast("The flock can't carry any more. Spend some on crafting, or grow the flock to carry more.", 4.5);
  }
  // rams near the thing Flossy charges charge it too, and each adds to the haul
  function ramHelp(x, y) {
    let n = 0;
    for (const s of S.flock) {
      if (!s.ram || Math.hypot(s.x - x, s.y - y) > 300) continue;
      n++;
      const a = Math.atan2(y - s.y, x - s.x);
      s.charge = 0.35;
      s.vx = Math.cos(a) * 420;
      s.vy = Math.sin(a) * 420;
      if (n === 1) say(s.x, s.y - 24, `${s.name}: Ram butt!`, '#e6b422');
    }
    return n;
  }
  // every butt gathers more with better horns (+1 per tier), a bigger flock (+1 per 5) and rams pitching in (+1 each)
  const bonus = (x, y) => S.horns + Math.floor(S.flock.length / 5) + (x === undefined ? 0 : ramHelp(x, y));
  // a knitted coat gives a ram one more wolf bite (2 more hp)
  function coatRam(s) {
    if (s.ram && !s.coat) {
      s.coat = true;
      s.maxhp += 2;
      s.hp += 2;
    }
  }
  // recruiting a sheep is a big moment: a name, a cheer, a burst of wool and a chime
  function recruit(s, quiet) {
    if (S.ramCoat) coatRam(s);
    S.flock.push(s);
    s.seen = 0;
    s.pen = null;
    const n = S.flock.length + 1;
    say(s.x, s.y - 30, s.ram ? `${s.name} the ram joins!` : `${s.name} joins!`, s.ram ? '#e6b422' : '#f4f2e6');
    for (let k = 0; k < 26; k++) {
      const a = rnd(0, 6.28),
        v = rnd(60, 200);
      S.confetti.push({
        x: s.x,
        y: s.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: rnd(0.7, 1.2),
        c: k % 3 ? '#f4f2e6' : s.ram ? '#e6b422' : '#9cbf6a',
      });
    }
    S.cheer = 1;
    if (!quiet)
      toast(
        s.ram ? `${s.name} the ram joins the flock! He will fight for you. (${n} sheep)` : `${s.name} joins the flock! (${n} sheep)`,
        3.5,
      );
    emit('recruit', { ram: s.ram });
  }

  // ---------- charging ----------
  function bonk(p, x, y, txt, col) {
    grid = null;
    p.dash = 0;
    const a = Math.atan2(p.y - y, p.x - x);
    p.vx = Math.cos(a) * 220;
    p.vy = Math.sin(a) * 220;
    S.shake = 0.25;
    say(p.x, p.y - 34, txt, col);
  }
  // old electronics in the Ruined Town, for anyone with iron-shod horns
  function salvage(p, x, y) {
    if (region(x, y).key !== 'town') return;
    if (S.horns < 3) {
      if (once('tech')) toast('There is old tech buried in these ruins, but you need Iron-shod Horns to get at it.', 4.5);
      return;
    }
    const tg = Math.min(1 + ~~rnd(0, 2), Math.floor(room()));
    if (tg > 0) {
      S.tech += tg;
      say(p.x, p.y - 52, `+${tg} tech`, '#6fd3e0');
    }
  }
  // charging into trees, buildings, big rocks and wrecks. What you can break depends on your horns.
  function chargeHit(p) {
    for (const pen of S.pens) {
      if (Math.hypot(p.x - pen.x, p.y - pen.y) < pen.r + 22) {
        S.pens.splice(S.pens.indexOf(pen), 1);
        bonk(p, pen.x, pen.y, 'Crash! The pen gives way!', '#e6b422');
        const freed = S.strays.filter((s) => s.pen === pen);
        for (const s of freed) {
          S.strays.splice(S.strays.indexOf(s), 1);
          recruit(s, true);
        }
        toast(`You broke ${freed.length} sheep out of the pen: ${freed.map((s) => s.name + (s.ram ? ' the ram' : '')).join(', ')}!`, 4.5);
        S.rubble.push({ x: pen.x - pen.r, y: pen.y - pen.r, w: pen.r * 2, h: pen.r * 2 });
        return;
      }
    }
    for (const t of S.trees) {
      if (Math.hypot(p.x - t.x, p.y - t.y) < t.r + 20) {
        const g = Math.min(t.res, 1 + ~~rnd(0, 2) + bonus(t.x, t.y), Math.floor(room()));
        if (g <= 0) {
          bonk(p, t.x, t.y, '', '#fff');
          fullUp(p);
          return;
        }
        t.res -= g;
        S.wood += g;
        bonk(p, t.x, t.y, `+${g} wood`, '#c89a5c');
        if (t.res <= 0) {
          S.trees.splice(S.trees.indexOf(t), 1);
          S.stumps.push({ x: t.x, y: t.y });
          say(t.x, t.y - 30, 'Timber!', '#c89a5c');
        }
        return;
      }
    }
    for (const r of S.rocks) {
      if (r.big && Math.hypot(p.x - r.x, p.y - r.y) < r.r + 20) {
        if (S.horns < 1) {
          bonk(p, r.x, r.y, 'Ow! Too hard for a bare head.', '#e05a4a');
          if (once('stone')) toast('Rock is too hard to break with your head. Craft a Ram-horn Helm from wood first.');
          return;
        }
        const g = Math.min(r.res, 1 + ~~rnd(0, 2) + bonus(r.x, r.y), Math.floor(room()));
        if (g <= 0) {
          bonk(p, r.x, r.y, '', '#fff');
          fullUp(p);
          return;
        }
        r.res -= g;
        S.stone += g;
        r.r = Math.max(12, r.r - 1.5);
        bonk(p, r.x, r.y, `+${g} stone`, '#c9c6bb');
        if (r.res <= 0) {
          S.rocks.splice(S.rocks.indexOf(r), 1);
          S.rubble.push({ x: r.x, y: r.y, w: 22, h: 22, stone: 1 });
        }
        return;
      }
    }
    for (const k of S.wrecks) {
      if (Math.hypot(p.x - k.x, p.y - k.y) < k.r + 22) {
        if (S.horns < 2) {
          bonk(p, k.x, k.y, 'Clang! Your horns just bounce off.', '#e05a4a');
          if (once('metal')) toast('Old machines hold metal, but you need Stone-tipped Horns to break into them.');
          return;
        }
        const g = Math.min(k.res, 1 + ~~rnd(0, 2) + bonus(k.x, k.y), Math.floor(room()));
        if (g <= 0) {
          bonk(p, k.x, k.y, '', '#fff');
          fullUp(p);
          return;
        }
        k.res -= g;
        S.metal += g;
        bonk(p, k.x, k.y, `+${g} metal`, '#9fb4c4');
        salvage(p, k.x, k.y);
        if (k.res <= 0) {
          S.wrecks.splice(S.wrecks.indexOf(k), 1);
          S.rubble.push({ x: k.x - 15, y: k.y - 10, w: 30, h: 20, metal: 1 });
          say(k.x, k.y - 30, 'Stripped for scrap!', '#9fb4c4');
        }
        return;
      }
    }
    for (const h of S.houses) {
      if (inHouse(p, h, 20)) {
        salvage(p, h.x + h.w / 2, h.y + h.h / 2);
        const g = Math.min(h.res, 2 + ~~rnd(0, 2) + bonus(h.x + h.w / 2, h.y + h.h / 2) * 2, Math.floor(room()));
        if (g <= 0) {
          bonk(p, h.x + h.w / 2, h.y + h.h / 2, '', '#fff');
          fullUp(p);
          return;
        }
        h.res -= g;
        S.wood += g;
        bonk(p, h.x + h.w / 2, h.y + h.h / 2, `+${g} wood`, '#c89a5c');
        if (h.res <= 0) {
          S.houses.splice(S.houses.indexOf(h), 1);
          S.rubble.push(h);
          say(h.x + h.w / 2, h.y, 'The old barn comes down!', '#c89a5c');
        }
        return;
      }
    }
  }
  // Flossy's charge meets a dog, wolf or fox: she stops dead and bounces back instead of running through it,
  // with a burst at the point of contact, a screen shake, a thud and a white flash on the animal
  function headbutt(p, w, fresh) {
    const a = Math.atan2(p.y - w.y, p.x - w.x),
      gap = Math.max(Math.hypot(p.x - w.x, p.y - w.y), 1);
    p.dash = 0;
    p.vx = Math.cos(a) * 240;
    p.vy = Math.sin(a) * 240;
    if (gap < 34) {
      p.x = w.x + Math.cos(a) * 34;
      p.y = w.y + Math.sin(a) * 34;
    }
    if (!fresh) return;
    S.shake = 0.35;
    w.flash = 0.18;
    S.impacts.push({ x: (p.x + w.x) / 2, y: (p.y + w.y) / 2, t: 0, a: a + Math.PI });
    sfx('thud', w.kind);
  }

  // ---------- crafting ----------
  // does the state meet a declarative requirement such as { horns: 2, rams: 3 }?
  function meets(req) {
    if (!req) return true;
    return Object.entries(req).every(([k, v]) =>
      k === 'rams' ? ramCount() >= v : typeof v === 'boolean' ? !!S[k] === v : (S[k] || 0) >= v,
    );
  }
  const isDone = (r) => !!r.done && meets(r.done);
  // why an item can't be built yet: a missing earlier item, or too small a flock
  function lockReason(r) {
    const rs = [];
    if (r.need && !meets(r.need)) rs.push(r.needText.replace(/^Needs /, ''));
    if (r.flock && flockSize() < r.flock) rs.push(`a flock of ${r.flock} (you have ${flockSize()})`);
    return rs.length ? 'needs ' + rs.join(' and ') : '';
  }
  const canPay = (c) => Object.entries(c).every(([k, v]) => S[k] >= v);
  function shelterRecipes() {
    const f = shelterHere(),
      out = [];
    if (!f) {
      const t = SHELTERS[1];
      out.push({
        id: 'shelter',
        track: 'Shelter',
        tier: 1,
        name: t.name,
        cost: t.cost,
        text: t.text + ' Built around where you stand.',
        label: 'Build',
      });
      return out;
    }
    const next = SHELTERS[f.tier + 1];
    if (next)
      out.push({
        id: 'shelter',
        track: 'Shelter',
        tier: f.tier + 1,
        name: next.name,
        cost: next.cost,
        need: next.need,
        needText: next.needText,
        flock: next.flock,
        text: next.text + ` Upgrades the ${SHELTERS[f.tier].name} you're standing in.`,
        label: 'Upgrade',
      });
    else {
      const top = SHELTERS[SHELTERS.length - 1];
      out.push({ id: 'none', track: 'Shelter', tier: SHELTERS.length - 1, name: top.name, cost: {}, text: top.text, done: {} });
    }
    if (f.hp < f.max)
      out.push({
        id: 'repair',
        track: 'Shelter',
        name: 'Patch it up',
        cost: f.tier >= 3 ? { stone: 4 } : { wood: 4 },
        text: `Repairs this ${SHELTERS[f.tier].name} by a third. It's at ${Math.ceil(f.hp)} of ${f.max}.`,
        label: 'Repair',
      });
    return out;
  }
  const allRecipes = () => [...shelterRecipes(), ...RECIPES];
  // A view model of every craftable item, for whatever UI the platform draws.
  // status: 'done' | 'locked' | 'short' (can't afford) | 'ok' (can build now)
  function craftOptions() {
    return allRecipes().map((r) => {
      const done = isDone(r),
        why = done ? '' : lockReason(r);
      const short = Object.entries(r.cost)
        .filter(([k, v]) => Math.floor(S[k]) < v)
        .map(([k, v]) => [k, v - Math.floor(S[k])]);
      const status = done ? 'done' : why ? 'locked' : short.length ? 'short' : 'ok';
      const label = done
        ? 'Built'
        : why
          ? 'Locked'
          : short.length
            ? 'Need ' + short.map(([k, n]) => `${n} ${k}`).join(', ')
            : r.label || 'Build';
      return {
        id: r.id,
        track: r.track,
        tier: r.tier,
        name: r.name,
        text: r.text,
        cost: r.cost,
        flock: r.flock,
        status,
        lockText: why,
        label,
      };
    });
  }
  function build(id) {
    const p = S.p,
      r = allRecipes().find((x) => x.id === id);
    if (!r || isDone(r) || !canPay(r.cost) || lockReason(r)) return false;
    const fx = p.x + Math.cos(p.face) * 60,
      fy = p.y + Math.sin(p.face) * 60;
    if (r.place && terrAt(fx, fy) === WATER) {
      toast("You can't build on water.", 2);
      return false;
    }
    for (const [k, v] of Object.entries(r.cost)) S[k] -= v;
    grid = null;
    if (id === 'shelter') {
      const f = shelterHere();
      if (!f) {
        const hp = SHELTERS[1].hp ?? Infinity;
        S.folds.push({ x: p.x, y: p.y, r: 85, tier: 1, hp, max: hp });
        say(p.x, p.y - 40, 'A pen! Everyone in.', '#9cbf6a');
        if (S.folds.length === 1)
          toast("Your pen is marked on the minimap with a hut. When it's off the map, an arrow on the edge points the way home.", 5);
      } else {
        f.tier++;
        f.hp = f.max = SHELTERS[f.tier].hp ?? Infinity;
        say(p.x, p.y - 40, `${SHELTERS[f.tier].name}!`, '#9cbf6a');
      }
    } else if (id === 'repair') {
      const f = shelterHere();
      f.hp = Math.min(f.max, f.hp + f.max / 3);
      say(p.x, p.y - 40, 'Patched up.', '#9cbf6a');
    } else if (r.gives) {
      Object.assign(S, r.gives);
      if (r.gives.ramCoat) for (const s of S.flock) coatRam(s);
      if (r.say) say(p.x, p.y - 40, r.say[0], r.say[1]);
      if (r.toast) toast(r.toast[0], r.toast[1]);
    } else if (r.place === 'wall') {
      const a = p.face + Math.PI / 2;
      for (let k = -3; k < 3; k++) {
        const x = fx + Math.cos(a) * (k + 0.5) * 24,
          y = fy + Math.sin(a) * (k + 0.5) * 24;
        if (terrAt(x, y) !== WATER) S.walls.push({ x, y, r: 12 });
      }
      say(fx, fy - 24, 'Stone on stone.', '#c9c6bb');
    } else if (r.place === 'decoy') {
      S.decoys.push({ x: fx, y: fy, hp: 3, decoy: true });
      say(fx, fy - 24, 'Baa? (it says nothing)', '#e0835a');
    } else if (r.place === 'trap') {
      S.traps.push({ x: fx, y: fy });
      say(fx, fy - 24, 'Lovely.', '#c89a5c');
    }
    return true;
  }

  // ---------- actions ----------
  function bleat() {
    const p = S.p;
    S.bleatCd = BLEAT_COOLDOWN;
    S.pings.push({ x: p.x, y: p.y, t: 0 });
    say(p.x, p.y - 34, 'BAAAAA!', '#e6b422');
    sfx('bleat');
    let found = 0;
    for (const s of S.strays) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bleatRange()) {
        s.seen = 3.5;
        found++;
        // strays answer after a delay that grows with distance
        S.answers.push({ s, t: (300 + d * 1.2) / 1000, txt: ['Baa!', 'Over here!', 'Meh?', 'Baaa!'][~~rnd(0, 4)] });
      }
    }
    if (!found) toast('No answer. No sheep within earshot.', 2);
    // bleating at night carries, and something hears it
    if (isNight()) S.sp.wolf -= 2.5;
  }
  function shear() {
    const p = S.p;
    let got = 0,
      n = 0;
    if (S.shears < 1) return;
    const reach = S.shears >= 2 ? 180 : 110,
      mult = S.shears >= 2 ? 1.5 : 1;
    if (room() < 1) {
      fullUp(p);
      return;
    }
    // the flock can shear Flossy too
    if (p.fleece >= 3 && S.flock.length) {
      got += (p.fleece - 1.5) * mult;
      n++;
      p.fleece = 1.5;
      say(p.x, p.y - 22, 'snip', '#f4f2e6');
    }
    for (const s of S.flock) {
      if (s.fleece >= 4 && Math.hypot(s.x - p.x, s.y - p.y) < reach) {
        if (got >= room()) break;
        got += (s.fleece - 1.5) * mult;
        n++;
        s.fleece = 1.5;
        say(s.x, s.y - 22, 'snip', '#f4f2e6');
      }
    }
    got = Math.min(got, room());
    if (n) {
      S.wool += got;
      say(p.x, p.y - 34, `+${got.toFixed(1)} wool`, '#f4f2e6');
    } else
      toast(
        S.flock.length ? 'No fleece is ready yet. Fleeces are ready at 4 kg (shown by a yellow dot).' : 'You need a flock to shear.',
        2.5,
      );
  }
  // Dynamo Horns: a charge sends out a shock that stuns everything nearby
  function shock(p) {
    S.shocks.push({ x: p.x, y: p.y, t: 0 });
    for (const w of S.preds) {
      if (!hostile(w)) continue;
      if (Math.hypot(w.x - p.x, w.y - p.y) < 140) {
        w.state = 'stun';
        w.st = 2;
        w.vx = w.vy = 0;
      }
    }
  }
  // lasers pick off wolves and foxes at range. Wild dogs are only ever stunned, since they can be trained.
  function zapTarget(x, y, range) {
    let b = null,
      bd = range;
    for (const w of S.preds) {
      if (!hostile(w)) continue;
      const d = Math.hypot(w.x - x, w.y - y);
      if (d < bd) {
        bd = d;
        b = w;
      }
    }
    return b;
  }
  function zap(x, y, w) {
    S.beams.push({ x1: x, y1: y, x2: w.x, y2: w.y, t: 0.2 });
    if (w.kind === 'dog') {
      w.state = 'stun';
      w.st = 2;
      say(w.x, w.y - 22, 'Zap! (stunned)', '#ff4d6d');
      return;
    }
    S.preds.splice(S.preds.indexOf(w), 1);
    S.zapped++;
    say(w.x, w.y - 22, 'Zapped!', '#ff4d6d');
  }
  function lasers(dt) {
    const p = S.p;
    S.laserCd -= dt;
    if (S.horns >= 5 && S.laserCd <= 0) {
      const t = zapTarget(p.x, p.y, 340);
      if (t) {
        zap(p.x, p.y, t);
        S.laserCd = 1.4;
      }
    }
    if (S.ramLasers)
      for (const s of S.flock) {
        if (!s.ram) continue;
        s.lcd = (s.lcd || 0) - dt;
        if (s.lcd <= 0) {
          const t = zapTarget(s.x, s.y, 260);
          if (t) {
            zap(s.x, s.y, t);
            s.lcd = 2.6;
          }
        }
      }
    for (const f of S.folds) {
      if (f.tier < 5) continue;
      f.lcd = (f.lcd || 0) - dt;
      if (f.lcd <= 0) {
        const t = zapTarget(f.x, f.y, f.r + 170);
        if (t) {
          const a = Math.atan2(t.y - f.y, t.x - f.x);
          zap(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r, t);
          f.lcd = 1;
        }
      }
    }
  }
  function nearestPred(s, r) {
    let b = null,
      bd = r;
    for (const w of S.preds) {
      if (!hostile(w) || w.state === 'stun' || w.state === 'flee') continue;
      const d = Math.hypot(w.x - s.x, w.y - s.y);
      if (d < bd) {
        bd = d;
        b = w;
      }
    }
    return b;
  }

  // ---------- predators ----------
  function spawnPreds(dt) {
    const p = S.p,
      R = region(p.x, p.y),
      night = isNight(),
      fm = 1 + S.flock.length / 12;
    const count = (k) => S.preds.filter((w) => w.kind === k && !w.tame).length;
    const tryKind = (k, rate, interval, cap) => {
      if (rate <= 0) return;
      S.sp[k] -= dt * rate * fm;
      if (S.sp[k] > 0 || count(k) >= cap) return;
      S.sp[k] = interval;
      for (let n = 0; n < 6; n++) {
        const a = rnd(0, 6.28),
          r = rnd(480, 640),
          x = clamp(p.x + Math.cos(a) * r, 20, WORLD - 20),
          y = clamp(p.y + Math.sin(a) * r, 20, WORLD - 20);
        if (terrAt(x, y) === WATER) continue;
        S.preds.push({
          kind: k,
          x,
          y,
          vx: 0,
          vy: 0,
          state: k === 'dog' ? 'herd' : 'hunt',
          st: 0,
          face: 0,
          orb: rnd(0, 6.28),
          bite: 0,
          cd: 0,
          dayborn: !night,
          tameHits: 0,
        });
        if (!S.seenKinds[k]) {
          S.seenKinds[k] = true;
          toast(KIND_INTRO[k], 5);
        }
        break;
      }
    };
    tryKind(
      'wolf',
      night ? R.wolf : R.dayWolf,
      Math.max(2.5, 8 - S.day),
      night ? Math.ceil((2 + S.day * 2 + S.flock.length / 4) * Math.max(0.5, R.wolf)) : 1 + ~~(S.day / 2),
    );
    tryKind('fox', night ? R.fox : R.dayFox, 10, 3);
    tryKind('dog', R.dog, 35, 2);
  }
  function pushOutOfFolds(w) {
    for (const f of S.folds) {
      const d = Math.hypot(w.x - f.x, w.y - f.y);
      if (d < f.r + 14 && d > 0) {
        w.x = f.x + ((w.x - f.x) / d) * (f.r + 14);
        w.y = f.y + ((w.y - f.y) / d) * (f.r + 14);
      }
    }
  }
  function updateDog(w, dt) {
    const p = S.p;
    let tx = 0,
      ty = 0,
      sp = 0;
    if (w.state === 'stun') {
      if (w.st <= 0) w.state = w.tame ? 'patrol' : 'herd';
    } else if (w.tame) {
      // a trained dog patrols outside the flock and sees off anything that comes close
      let th = null,
        bd = 320;
      for (const o of S.preds) {
        if (o === w || !hostile(o) || o.kind === 'dog' || o.state === 'flee' || o.state === 'stun') continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) {
          bd = d;
          th = o;
        }
      }
      if (th && w.cd <= 0) {
        const d = Math.hypot(th.x - w.x, th.y - w.y) || 1;
        tx = (th.x - w.x) / d;
        ty = (th.y - w.y) / d;
        sp = 250;
        if (d < 26) {
          const a = Math.atan2(th.y - w.y, th.x - w.x);
          th.vx = Math.cos(a) * 380;
          th.vy = Math.sin(a) * 380;
          th.state = 'stun';
          th.st = 1.5;
          w.cd = 1.5;
          say(w.x, w.y - 22, 'Woof!', '#9cbf6a');
        }
      } else {
        w.orb += dt * 0.8;
        const rr = circleRadius() + 90,
          gx = p.x + Math.cos(w.orb) * rr,
          gy = p.y + Math.sin(w.orb) * rr,
          gd = Math.hypot(gx - w.x, gy - w.y) || 1;
        tx = (gx - w.x) / gd;
        ty = (gy - w.y) / gd;
        sp = Math.min(240, gd * 3);
      }
    } else {
      // a wild dog slips between Flossy and the sheep furthest out, and pushes it away
      if (!w.target || !S.flock.includes(w.target)) {
        let far = null,
          fd = 0;
        for (const s of S.flock) {
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (d > fd) {
            fd = d;
            far = s;
          }
        }
        w.target = far;
      }
      const t = w.target;
      if (t) {
        const d0 = Math.hypot(p.x - t.x, p.y - t.y) || 1,
          gx = t.x + ((p.x - t.x) / d0) * 45,
          gy = t.y + ((p.y - t.y) / d0) * 45,
          gd = Math.hypot(gx - w.x, gy - w.y) || 1;
        tx = (gx - w.x) / gd;
        ty = (gy - w.y) / gd;
        sp = Math.min(205, gd * 4);
        if (d0 > 250 && once('drive')) toast('A wild sheepdog is driving your sheep away! Charge it to train it.');
      } else {
        w.orb += dt * 0.5;
        const gx = p.x + Math.cos(w.orb) * 220,
          gy = p.y + Math.sin(w.orb) * 220,
          gd = Math.hypot(gx - w.x, gy - w.y) || 1;
        tx = (gx - w.x) / gd;
        ty = (gy - w.y) / gd;
        sp = Math.min(160, gd * 2);
      }
      pushOutOfFolds(w);
    }
    w.vx += (tx * sp - w.vx) * Math.min(1, dt * 5);
    w.vy += (ty * sp - w.vy) * Math.min(1, dt * 5);
    moveBy(w, dt);
    if (Math.hypot(w.vx, w.vy) > 10) w.face = Math.atan2(w.vy, w.vx);
    collide(w, 11);
    if (w.tame) return;
    // Flossy's charge trains a wild dog; a ram's only knocks it back
    if (p.dash > 0 && w.state === 'stun' && Math.hypot(p.x - w.x, p.y - w.y) < 36) headbutt(p, w, false);
    if (p.dash > 0 && w.state !== 'stun' && Math.hypot(p.x - w.x, p.y - w.y) < 36) {
      headbutt(p, w, true);
      w.tameHits++;
      const a = Math.atan2(w.y - p.y, w.x - p.x);
      w.vx = Math.cos(a) * 300;
      w.vy = Math.sin(a) * 300;
      w.state = 'stun';
      w.st = 1;
      if (w.tameHits >= 3) {
        w.tame = true;
        w.state = 'patrol';
        w.name = DOG_NAMES[S.preds.filter((o) => o.tame).length % DOG_NAMES.length];
        say(w.x, w.y - 26, `Good dog, ${w.name}!`, '#9cbf6a');
        toast(`${w.name} the sheepdog is yours now, and will patrol around the flock and chase off predators.`, 4.5);
      } else say(w.x, w.y - 26, `Sit! (${3 - w.tameHits} more)`, '#e6b422');
    }
    for (const s of S.flock) {
      if (s.charge > 0 && w.state !== 'stun' && Math.hypot(s.x - w.x, s.y - w.y) < 34) {
        const a = Math.atan2(w.y - s.y, w.x - s.x);
        w.vx = Math.cos(a) * 300;
        w.vy = Math.sin(a) * 300;
        w.state = 'stun';
        w.st = 1.2;
        w.target = null;
      }
    }
  }
  // wolves and foxes: hunt the most exposed sheep, pace around a moving circle, flee by day
  function updateHunter(w, i, dt, pdist, R) {
    const p = S.p,
      fox = w.kind === 'fox';
    if (!isNight() && !w.dayborn && w.state !== 'flee') {
      w.state = 'flee';
      w.st = 99;
    }
    if ((w.state === 'stun' || w.state === 'stuck') && w.st <= 0) {
      w.state = 'flee';
      w.st = 5;
    }
    for (const tr of S.traps) {
      if (w.state !== 'stuck' && Math.hypot(w.x - tr.x, w.y - tr.y) < 22) {
        w.state = 'stuck';
        w.st = 5;
        w.vx = w.vy = 0;
        S.traps.splice(S.traps.indexOf(tr), 1);
        say(w.x, w.y - 24, `Dag trap! The ${w.kind} is stuck fast.`, '#c89a5c');
        break;
      }
    }
    if (w.state === 'flee' && w.st <= 0 && (isNight() || w.dayborn)) w.state = 'hunt';
    let tx = 0,
      ty = 0,
      sp = 0;
    if (w.state === 'stun' || w.state === 'stuck') sp = 0;
    else if (w.state === 'flee') {
      tx = (w.x - p.x) / pdist;
      ty = (w.y - p.y) / pdist;
      sp = fox ? 185 : 170;
    } else {
      // pick a target: decoys first, then the most isolated sheep outside a fold, or a pen with sheep in it
      let best = null,
        bs = 1e9;
      for (const dc of S.decoys) {
        const d = Math.hypot(dc.x - w.x, dc.y - w.y);
        if (d < 500 && d * 0.5 < bs) {
          bs = d * 0.5;
          best = dc;
        }
      }
      for (const s of allSheep()) {
        if (inFold(s)) continue;
        const d = Math.hypot(s.x - w.x, s.y - w.y);
        const sc = d * (1 + neighbours(s, 90) * 0.15) * (fox && s.ram ? 1.6 : 1);
        if (sc < bs) {
          bs = sc;
          best = s;
        }
      }
      for (const f of S.folds) {
        if (f.hp === Infinity || !allSheep().some((s) => Math.hypot(s.x - f.x, s.y - f.y) < f.r)) continue;
        const d = Math.hypot(w.x - f.x, w.y - f.y) || 1,
          ex = f.x + ((w.x - f.x) / d) * (f.r + 14),
          ey = f.y + ((w.y - f.y) / d) * (f.r + 14),
          sc = Math.hypot(ex - w.x, ey - w.y) * 0.9;
        if (sc < bs) {
          bs = sc;
          best = { x: ex, y: ey, shelter: f };
        }
      }
      if ((S.circling && pdist < 420 && !(best && (best.decoy || best.shelter))) || !best) {
        // a moving circle (or a closed fold): predators pace around, waiting
        w.orb += dt * 0.7;
        const fd = S.folds.find((f) => Math.hypot(p.x - f.x, p.y - f.y) < f.r),
          ox = fd ? fd.x : p.x,
          oy = fd ? fd.y : p.y,
          orR = (fd ? fd.r : R) + 110;
        const gx = ox + Math.cos(w.orb) * orR,
          gy = oy + Math.sin(w.orb) * orR,
          gd = Math.hypot(gx - w.x, gy - w.y) || 1;
        tx = (gx - w.x) / gd;
        ty = (gy - w.y) / gd;
        sp = Math.min(190, gd * 3);
      } else {
        const d = Math.hypot(best.x - w.x, best.y - w.y) || 1;
        tx = (best.x - w.x) / d;
        ty = (best.y - w.y) / d;
        sp = (fox ? 150 : 140 + S.day * 5) * (p.grazing ? 1.2 : 1);
        if (best.shelter && d < 24 && w.bite <= 0) {
          const f = best.shelter;
          f.hp -= fox ? 3 : 6;
          w.bite = 1.3;
          S.shake = 0.1;
          say(w.x, w.y - 22, 'Crunch!', '#e0835a');
          if (f.hp <= 0) {
            S.folds.splice(S.folds.indexOf(f), 1);
            S.rubble.push({ x: f.x - f.r * 0.7, y: f.y - f.r * 0.7, w: f.r * 1.4, h: f.r * 1.4 });
            toast(`Predators broke through the ${SHELTERS[f.tier].name}!`);
          } else if (f.hp < f.max * 0.3 && !f.warned) {
            f.warned = true;
            toast(`The ${SHELTERS[f.tier].name} is giving way. Patch it up from the craft menu.`);
          }
        } else if (d < 18 && w.bite <= 0 && !best.shelter) {
          if (best.decoy) {
            best.hp--;
            w.bite = 1;
            w.state = 'flee';
            w.st = 3;
            say(best.x, best.y - 22, best.hp > 0 ? 'Chomp... that tasted odd.' : 'The decoy falls apart. Just sticks and wool.', '#e0835a');
            if (best.hp <= 0) S.decoys.splice(S.decoys.indexOf(best), 1);
          } else if (best === p) {
            if (p.dash <= 0) {
              p.health -= fox ? 10 : 25;
              say(p.x, p.y - 30, 'Ouch!', '#e05a4a');
              w.bite = 1.5;
              w.state = 'flee';
              w.st = fox ? 3 : 1.5;
            }
          } else {
            best.hp -= fox ? 1 : 2;
            if (best.hp <= 0) {
              S.flock.splice(S.flock.indexOf(best), 1);
              say(best.x, best.y - 20, `${best.name} is taken!`, '#e05a4a');
              toast(`${best.name}${best.ram ? ' the ram' : ''} was taken.`, 3);
              w.state = 'flee';
              w.st = 6;
            } else {
              say(best.x, best.y - 20, fox ? 'Nip! (bitten)' : best.ram ? 'The ram shrugs off a bite!' : 'Bitten!', '#e0835a');
              w.bite = fox ? 2 : 1.2;
              if (fox) {
                w.state = 'flee';
                w.st = 2.5;
              }
            }
          }
        }
      }
    }
    w.vx += (tx * sp - w.vx) * Math.min(1, dt * 4);
    w.vy += (ty * sp - w.vy) * Math.min(1, dt * 4);
    moveBy(w, dt);
    pushOutOfFolds(w);
    if (Math.hypot(w.vx, w.vy) > 10) w.face = Math.atan2(w.vy, w.vx);
    collide(w, fox ? 9 : 12);
    if (p.dash > 0 && w.state === 'stun' && Math.hypot(p.x - w.x, p.y - w.y) < 34) headbutt(p, w, false);
    for (const h of [p, ...S.flock.filter((s) => s.charge > 0)]) {
      if ((h === p ? p.dash > 0 : true) && Math.hypot(h.x - w.x, h.y - w.y) < 34 && w.state !== 'stun') {
        if (h === p) headbutt(p, w, true);
        const a = Math.atan2(w.y - h.y, w.x - h.x);
        w.vx = Math.cos(a) * 400;
        w.vy = Math.sin(a) * 400;
        w.state = 'stun';
        w.st = [1.2, 1.5, 1.9, 2.6, 3, 3][S.horns] * (fox ? 1.4 : 1);
        say(w.x, w.y - 24, h === p ? 'Headbutt!' : 'Rammed!', '#e6b422');
      }
    }
    // from ten sheep, a lookout calls out predators beyond what Flossy can see
    if (S.flock.length >= 10 && w.state === 'hunt' && !w.warned && pdist < 380 && pdist > vision()) {
      w.warned = true;
      const dir = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][
        ((Math.round(Math.atan2(w.y - p.y, w.x - p.x) / (Math.PI / 4)) % 8) + 8) % 8
      ];
      say(p.x, p.y - 48, `${fox ? 'Fox' : 'Wolf'} to the ${dir}!`, '#e05a4a');
      S.alerts.push({ w, t: 2.5 });
    }
    if (w.state === 'flee' && pdist > 950) S.preds.splice(i, 1);
  }

  // regrowth is slow, and bare earth is slowest of all to recover. This touches every tile, so it
  // works on local copies of the arrays and skips the many tiles that are already full or not meadow.
  function regrow(dt) {
    const grass = S.grass,
      terr = S.terr,
      n = grass.length,
      slow = dt * 0.0003,
      fast = dt * 0.0008;
    for (let i = 0; i < n; i++) {
      const g = grass[i];
      if (g < 1 && terr[i] === MEADOW) {
        const v = g + (g < 0.05 ? slow : fast);
        grass[i] = v < 1 ? v : 1;
      }
    }
  }

  // ---------- the step ----------
  // cmd: { mx, my } movement in -1..1, plus graze (held), charge (held or tapped), bleat, shear (tapped)
  function update(dt, cmd) {
    S.t += dt;
    const p = S.p;
    const day = 1 + Math.floor(S.t / DAY);
    if (day !== S.lastDay) {
      S.lastDay = day;
      S.day = day;
      toast(`Dawn, day ${day}. The wolves slink off.`);
    }
    explore();
    const ri = regionAt(p.x, p.y);
    if (ri !== S.curReg) {
      S.curReg = ri;
      const R = REG[ri];
      toast(`${R.name}. ${R.blurb}`, 4.5);
    }

    // player
    const heavy = Math.max(0, p.fleece - 4);
    let spd = 150 * (1 - Math.min(0.55, heavy * 0.075));
    p.grazing = !!cmd.graze && p.cast <= 0;
    if (p.cast > 0) {
      p.cast -= dt;
      if (neighbours(p, 55) > 0) p.cast -= dt * 2;
      if (p.cast <= 0) say(p.x, p.y - 30, 'Back on my feet!');
    }
    if (cmd.charge && p.dashCd <= 0 && p.cast <= 0) {
      p.dash = 0.28;
      p.dashCd = p.dashMax = [2.2, 2, 1.8, 1.1, 1, 1][S.horns];
      say(p.x, p.y - 30, 'Baaa!', '#e6b422');
      sfx('charge');
      if (S.horns >= 4) shock(p);
    }
    p.dashCd -= dt;
    S.bleatCd -= dt;
    if (cmd.bleat && S.bleatCd <= 0) bleat();
    if (cmd.shear) shear();
    let mx = cmd.mx || 0,
      my = cmd.my || 0;
    if (p.cast > 0 || p.grazing) {
      mx = 0;
      my = 0;
    }
    if (p.dash > 0) {
      p.dash -= dt;
      spd *= 3;
      if (mx === 0 && my === 0) {
        mx = Math.cos(p.face);
        my = Math.sin(p.face);
      }
    }
    p.vx += (mx * spd - p.vx) * Math.min(1, dt * 10);
    p.vy += (my * spd - p.vy) * Math.min(1, dt * 10);
    moveBy(p, dt);
    const moving = Math.hypot(p.vx, p.vy) > 40;
    if (moving) {
      p.face = Math.atan2(p.vy, p.vx);
      p.bob += dt * 12;
      p.still = 0;
    } else p.still += dt;
    if (p.dash > 0) chargeHit(p);
    // rubbing on trees, rocks and posts tears off a little fleece, but only down to 3 kg; shears do the rest
    let rubbing = false;
    if (moving && p.dash <= 0) {
      for (const r of S.rocks.concat(S.posts, S.trees)) {
        if (Math.hypot(p.x - r.x, p.y - r.y) < r.r + 16) {
          rubbing = true;
          break;
        }
      }
    }
    collide(p, 14);
    if (rubbing && p.fleece > 3) {
      const d = Math.min(p.fleece - 3, 0.5 * dt);
      p.fleece -= d;
      S.wool += Math.min(d * 0.3, room());
      if (random() < dt * 3) say(p.x + rnd(-10, 10), p.y - 20, 'scritch', '#c9c3a8');
    } else if (rubbing && once('rub')) say(p.x, p.y - 30, "That's as much as rubbing will get off.", '#c9c3a8');
    p.fleece += dt * 0.035;
    if (p.fleece > 7 && moving && p.cast <= 0 && p.dash <= 0 && random() < dt * 0.04 * (p.fleece - 7)) {
      p.cast = 3;
      toast('Cast! Too much fleece, and Flossy has rolled onto her back. A flockmate nearby helps her up faster.');
    }

    // hunger and grazing
    const sh = shelterHere();
    p.hunger -= dt * PACE * (0.42 + heavy * 0.04 + S.flock.length * 0.008) * (sh && sh.tier >= 2 ? 0.6 : 1);
    if (sh && sh.tier >= 4 && p.still > 1) p.health += dt * 2;
    if (p.grazing) {
      // every sheep eats its own patch, and the hunger bar is the whole flock's
      let eaten = 0;
      for (const s of allSheep()) {
        const i = tileAt(s.x, s.y),
          g = S.grass[i];
        if (g > 0.05) {
          const e = Math.min(g, dt * 0.08);
          S.grass[i] -= e;
          eaten += e;
        }
      }
      p.hunger += (eaten * 42) / (S.flock.length + 1);
      if (S.flock.length >= 3 && eaten < dt * 0.08 * (S.flock.length + 1) * 0.3 && once('barren'))
        toast('This pasture is grazed bare. Grass takes many days to grow back, so move the flock on.', 4.5);
      if (isNight() && !inFold(p) && once('graze'))
        toast("Heads down. While the flock grazes it spreads out and can't see the wolves coming.");
    }
    p.hunger = clamp(p.hunger, 0, 100);
    // hunger alarm: a soft two-tone beep every 2 seconds while the bar is below 10
    if (p.hunger < 10) {
      S.hungerBeep -= dt;
      if (S.hungerBeep <= 0) {
        S.hungerBeep = 2;
        sfx('hungerAlarm');
      }
    } else S.hungerBeep = 0;
    if (p.hunger <= 0) p.health -= dt * 6;
    else if (p.hunger > 50) p.health += dt * 1.2 * (S.balm ? 2 : 1);
    p.health = Math.min(100, p.health);
    // regrowth is slow, and bare earth is slowest of all to recover
    regrow(dt);

    // strays wander and join
    for (let i = S.strays.length - 1; i >= 0; i--) {
      const s = S.strays[i];
      s.seen -= dt;
      if (Math.abs(s.x - p.x) > 1400 || Math.abs(s.y - p.y) > 1400) {
        s.fleece += dt * 0.01;
        continue;
      }
      s.wand += rnd(-1, 1) * dt;
      const sp = random() < 0.5 ? 14 : 0;
      s.vx = Math.cos(s.wand) * sp;
      s.vy = Math.sin(s.wand) * sp;
      moveBy(s, dt);
      if (sp) s.face = s.wand;
      collide(s, 12);
      s.fleece += dt * 0.01;
      if (s.pen) {
        const d = Math.hypot(s.x - s.pen.x, s.y - s.pen.y);
        if (d > s.pen.r - 14) {
          s.x = s.pen.x + ((s.x - s.pen.x) / d) * (s.pen.r - 14);
          s.y = s.pen.y + ((s.y - s.pen.y) / d) * (s.pen.r - 14);
        }
        if (Math.hypot(s.x - p.x, s.y - p.y) < vision() && once('pen'))
          toast('An old pen with sheep shut inside! Charge the hurdles to break them out.', 4.5);
        continue;
      }
      if (Math.hypot(s.x - p.x, s.y - p.y) < 75) {
        S.strays.splice(i, 1);
        recruit(s);
      }
    }
    // strays that heard a bleat answer back
    for (let i = S.answers.length - 1; i >= 0; i--) {
      const an = S.answers[i];
      an.t -= dt;
      if (an.t > 0) continue;
      S.answers.splice(i, 1);
      if (S.strays.includes(an.s)) say(an.s.x, an.s.y - 24, an.txt, '#cfe0ff');
    }

    // flock: follow Flossy, and circle her while she keeps moving
    const fl = S.flock,
      R = circleRadius();
    S.circling = fl.length >= CIRCLE_MIN && p.still < 0.6 && p.cast <= 0;
    if (S.circling && isNight() && once('circle')) toast("The flock circles Flossy while she moves. Wolves won't break a moving circle.");
    S.orbit += dt * (S.circling ? 1.6 : 0);
    const pInFold = inFold(p);
    fl.forEach((s, idx) => {
      let ax = 0,
        ay = 0;
      const dx = p.x - s.x,
        dy = p.y - s.y,
        d = Math.hypot(dx, dy) || 1;
      if (S.circling) {
        const a = S.orbit + (idx / fl.length) * Math.PI * 2,
          tx = p.x + p.vx * 0.25 + Math.cos(a) * R,
          ty = p.y + p.vy * 0.25 + Math.sin(a) * R;
        ax += (tx - s.x) * 9;
        ay += (ty - s.y) * 9;
      } else {
        const want = (40 + Math.sqrt(fl.length) * 14) * (p.grazing ? 1.9 : 1) * (pInFold ? 0.6 : 1);
        if (d > want) {
          ax += (dx / d) * (d - want) * 5;
          ay += (dy / d) * (d - want) * 5;
        }
      }
      // while grazing, a sheep on a bare patch shuffles to the greenest patch beside it
      if (p.grazing && S.grass[tileAt(s.x, s.y)] < 0.15) {
        let bx = 0,
          by = 0,
          bg = 0.15;
        for (const [ox, oy] of [
          [-T, 0],
          [T, 0],
          [0, -T],
          [0, T],
          [-T, -T],
          [T, T],
          [-T, T],
          [T, -T],
        ]) {
          const g = S.grass[tileAt(s.x + ox, s.y + oy)];
          if (g > bg) {
            bg = g;
            bx = ox;
            by = oy;
          }
        }
        if (bg > 0.15) {
          ax += bx * 5;
          ay += by * 5;
        }
      }
      for (const o of fl) {
        if (o === s) continue;
        const ox = s.x - o.x,
          oy = s.y - o.y,
          od = Math.hypot(ox, oy);
        if (od < 24 && od > 0) {
          ax += (ox / od) * (24 - od) * 9;
          ay += (oy / od) * (24 - od) * 9;
        }
      }
      const pd = Math.hypot(s.x - p.x, s.y - p.y);
      if (pd < 30 && pd > 0) {
        ax += ((s.x - p.x) / pd) * (30 - pd) * 9;
        ay += ((s.y - p.y) / pd) * (30 - pd) * 9;
      }
      if (!S.circling && !p.grazing)
        for (const w of S.preds) {
          if (!hostile(w) || w.kind === 'dog') continue;
          const wd = Math.hypot(s.x - w.x, s.y - w.y);
          if (wd < 140 && wd > 0) {
            ax += ((s.x - w.x) / wd) * 120;
            ay += ((s.y - w.y) / wd) * 120;
          }
        }
      // a wild sheepdog drives sheep before it
      for (const w of S.preds) {
        if (w.kind !== 'dog' || w.tame || w.state === 'stun') continue;
        const wd = Math.hypot(s.x - w.x, s.y - w.y);
        if (wd < 110 && wd > 0) {
          ax += ((s.x - w.x) / wd) * 520;
          ay += ((s.y - w.y) / wd) * 520;
        }
      }
      s.vx += ax * dt;
      s.vy += ay * dt;
      s.vx *= Math.pow(0.12, dt);
      s.vy *= Math.pow(0.12, dt);
      const v = Math.hypot(s.vx, s.vy),
        max = s.charge > 0 ? 420 : (S.circling ? 280 : 205) * (1 - Math.max(0, s.fleece - 5) * 0.06);
      if (v > max) {
        s.vx *= max / v;
        s.vy *= max / v;
      }
      moveBy(s, dt);
      if (v > 15) {
        s.face = Math.atan2(s.vy, s.vx);
        s.bob += dt * 12;
      }
      collide(s, 12);
      s.fleece = Math.min(9, s.fleece + dt * 0.03);
      // rams charge anything that threatens the flock, on their own
      s.rcd -= dt;
      if (s.hp < s.maxhp) s.hp = Math.min(s.maxhp, s.hp + dt / (S.balm ? 15 : 40));
      if (s.ram && !s.charge && (s.rcd <= 0 || p.dash > 0.2)) {
        const t = nearestPred(s, 230);
        if (t) {
          s.charge = 0.5;
          s.rcd = 2.5;
          const a = Math.atan2(t.y - s.y, t.x - s.x);
          s.vx = Math.cos(a) * 420;
          s.vy = Math.sin(a) * 420;
          if (random() < 0.4) say(s.x, s.y - 24, 'Ram charge!', '#e6b422');
        }
      }
      if (s.charge > 0) {
        s.charge -= dt;
        if (s.charge <= 0) s.charge = 0;
      }
    });
    for (let i = fl.length - 1; i >= 0; i--) {
      const s = fl[i];
      if (Math.hypot(s.x - p.x, s.y - p.y) > LOST_DIST) {
        fl.splice(i, 1);
        s.seen = 0;
        S.strays.push(s);
        say(s.x, s.y - 24, `${s.name} is driven off!`, '#e05a4a');
      }
    }
    S.maxFlock = Math.max(S.maxFlock, fl.length + 1);

    // predators: what turns up depends on the region and the time of day
    spawnPreds(dt);
    lasers(dt);
    for (let i = S.preds.length - 1; i >= 0; i--) {
      const w = S.preds[i];
      w.st -= dt;
      w.bite -= dt;
      w.cd -= dt;
      const pdist = Math.hypot(w.x - p.x, w.y - p.y) || 1;
      if (pdist > 1600 && !w.tame) {
        S.preds.splice(i, 1);
        continue;
      }
      if (w.kind === 'dog') updateDog(w, dt);
      else updateHunter(w, i, dt, pdist, R);
    }

    // short-lived effects
    for (let i = S.beams.length - 1; i >= 0; i--) {
      S.beams[i].t -= dt;
      if (S.beams[i].t <= 0) S.beams.splice(i, 1);
    }
    for (let i = S.shocks.length - 1; i >= 0; i--) {
      S.shocks[i].t += dt;
      if (S.shocks[i].t > 0.5) S.shocks.splice(i, 1);
    }
    for (let i = S.impacts.length - 1; i >= 0; i--) {
      S.impacts[i].t += dt;
      if (S.impacts[i].t > 0.35) S.impacts.splice(i, 1);
    }
    for (const w of S.preds) if (w.flash > 0) w.flash -= dt;
    for (let i = S.texts.length - 1; i >= 0; i--) {
      const t = S.texts[i];
      t.life -= dt;
      t.y -= dt * 14;
      if (t.life <= 0) S.texts.splice(i, 1);
    }
    for (let i = S.alerts.length - 1; i >= 0; i--) {
      S.alerts[i].t -= dt;
      if (S.alerts[i].t <= 0) S.alerts.splice(i, 1);
    }
    for (let i = S.pings.length - 1; i >= 0; i--) {
      S.pings[i].t += dt;
      if (S.pings[i].t > 1.4) S.pings.splice(i, 1);
    }
    S.shake = Math.max(0, S.shake - dt);
    S.cheer = Math.max(0, S.cheer - dt * 1.5);
    for (let i = S.confetti.length - 1; i >= 0; i--) {
      const c = S.confetti[i];
      c.t -= dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 0.94;
      c.vy *= 0.94;
      if (c.t <= 0) S.confetti.splice(i, 1);
    }
    const n = fl.length + 1;
    if (n >= 5 && once('flock')) toast('Rank up: Flock. While you keep moving, they circle you and the wolves hold back.', 4.5);
    if (n >= 20 && once('herd')) toast('Rank up: Herd. The valley is starting to belong to the sheep.', 5);
    if (p.health <= 0 && !S.over) {
      S.over = true;
      S.running = false;
      emit('over');
    }
  }

  Sheep.sim = {
    newGame,
    state,
    update,
    drainEvents,
    explore,
    // actions the UI can trigger
    build,
    craftOptions,
    // read-only queries for renderers, HUD and audio
    terrAt,
    regionAt,
    region,
    tileAt,
    bleatRange,
    phase,
    isNight,
    nightness,
    vision,
    rank,
    ramCount,
    flockSize,
    circleRadius,
    carryCap,
    load,
  };
})((globalThis.Sheep = globalThis.Sheep || {}));
