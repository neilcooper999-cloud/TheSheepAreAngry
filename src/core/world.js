// World generation: builds a fresh game state from a seed. No browser APIs.
(function (Sheep) {
  'use strict';
  const { seedRng, random, rnd, clamp, makeNoise } = Sheep.util;
  const { CONFIG, TERR, REG, EWE_NAMES, RAM_NAMES } = Sheep.data;
  const { WORLD, T, COLS, DAY, START_PHASE } = CONFIG;
  const { MEADOW, SCREE, BOG, WATER, ROAD } = TERR;

  const tileAt = (x, y) => {
    const tx = clamp(~~(x / T), 0, COLS - 1),
      ty = clamp(~~(y / T), 0, COLS - 1);
    return ty * COLS + tx;
  };

  // rams are tougher: two wolf bites or four fox bites, against one and two for a ewe
  function makeSheepFactory() {
    let nameN = 0;
    const pickName = (ram) => {
      const l = ram ? RAM_NAMES : EWE_NAMES;
      return l[(nameN++ * 7 + ~~rnd(0, l.length)) % l.length];
    };
    return (x, y, ram) => {
      const hp = ram ? 4 : 2;
      return {
        name: pickName(ram),
        x,
        y,
        vx: 0,
        vy: 0,
        face: rnd(0, 6.28),
        ram,
        fleece: rnd(2, 5),
        wand: rnd(0, 6.28),
        bob: rnd(0, 9),
        seen: 0,
        hp,
        maxhp: hp,
        rcd: 0,
      };
    };
  }

  function generateWorld(seed) {
    seedRng(seed);
    const mkSheep = makeSheepFactory();
    const terr = new Uint8Array(COLS * COLS),
      grass = new Float32Array(COLS * COLS),
      reg = new Uint8Array(COLS * COLS),
      c = WORLD / 2,
      ct = COLS / 2;
    const nA = makeNoise(),
      nB = makeNoise(),
      nW = makeNoise(),
      nBg = makeNoise(),
      nS = makeNoise(),
      nR = makeNoise(),
      nG = makeNoise(),
      nT = makeNoise();
    // noise values bunch up around 0.5, so turn "fraction of tiles" into a threshold from samples
    const samp = [...Array(3000)].map(() => nW(rnd(0, 500), rnd(0, 500))).sort((a, b) => a - b),
      Q = (p) => (p <= 0 ? -1 : samp[Math.min(2999, ~~(p * 3000))]);
    // one region per cell of a jittered 7x7 grid; home in the middle, the ruined towns furthest out
    const RG = 7,
      seeds = [];
    for (let gy = 0; gy < RG; gy++)
      for (let gx = 0; gx < RG; gx++) seeds.push({ x: ((gx + rnd(0.25, 0.75)) * WORLD) / RG, y: ((gy + rnd(0.25, 0.75)) * WORLD) / RG });
    seeds.forEach((sd) => (sd.d = Math.hypot(sd.x - c, sd.y - c) / (WORLD * 0.7)));
    const byD = [...seeds].sort((a, b) => a.d - b.d),
      pick = (a) => a[~~rnd(0, a.length)];
    byD.forEach((sd, k) => {
      const key =
        k === 0
          ? 'meadows'
          : k >= byD.length - 4
            ? 'town'
            : sd.d < 0.3
              ? pick(['meadows', 'farm', 'farm', 'woods'])
              : sd.d < 0.55
                ? pick(['farm', 'woods', 'marsh', 'meadows', 'fells'])
                : pick(['fells', 'fells', 'marsh', 'woods', 'farm']);
      sd.t = REG.findIndex((r) => r.key === key);
    });
    for (let ty = 0; ty < COLS; ty++)
      for (let tx = 0; tx < COLS; tx++) {
        const i = ty * COLS + tx;
        const wx = (tx + 0.5) * T + (nA(tx / 10, ty / 10) - 0.5) * 900,
          wy = (ty + 0.5) * T + (nB(tx / 10, ty / 10) - 0.5) * 900;
        let best = 0,
          bd = 1e12;
        seeds.forEach((sd, k) => {
          const d = (sd.x - wx) ** 2 + (sd.y - wy) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        });
        const t = seeds[best].t,
          R = REG[t];
        reg[i] = t;
        let tr = MEADOW;
        if (nW(tx / 7, ty / 7) < Q(R.water)) tr = WATER;
        else if (nBg(tx / 6, ty / 6) < Q(R.bog)) tr = BOG;
        else if (nS(tx / 9, ty / 9) < Q(R.scree)) tr = SCREE;
        else if (nR(tx / 3, ty / 3) < Q(R.road)) tr = ROAD;
        if (Math.hypot(tx - ct, ty - ct) < 7) tr = MEADOW;
        terr[i] = tr;
        grass[i] = tr === MEADOW ? clamp(R.grass[0] + (R.grass[1] - R.grass[0]) * nG(tx / 5, ty / 5) * 1.2 + rnd(-0.05, 0.05), 0, 1) : 0;
      }
    // old roads wander across the whole map
    for (let k = 0; k < 14; k++) {
      let x = k % 2 ? 0 : rnd(10, COLS - 10),
        y = k % 2 ? rnd(10, COLS - 10) : 0,
        a = k % 2 ? 0 : Math.PI / 2;
      for (let n = 0; n < COLS * 1.6; n++) {
        a += rnd(-0.12, 0.12);
        x += Math.cos(a);
        y += Math.sin(a);
        if (x < 0 || y < 0 || x >= COLS || y >= COLS) break;
        for (const [ox, oy] of [
          [0, 0],
          [1, 0],
          [0, 1],
        ]) {
          const tx = ~~x + ox,
            ty = ~~y + oy;
          if (tx < COLS && ty < COLS && terr[ty * COLS + tx] !== WATER) {
            terr[ty * COLS + tx] = ROAD;
            grass[ty * COLS + tx] = 0;
          }
        }
      }
    }
    const far = (x, y, r) => Math.hypot(x - c, y - c) > r,
      tt = (x, y) => terr[tileAt(x, y)];
    const dry = (x, y) => tt(x, y) !== WATER && tt(x, y) !== ROAD;
    const rocks = [],
      posts = [],
      houses = [],
      trees = [],
      wrecks = [],
      strays = [];
    for (let ty = 1; ty < COLS - 1; ty++)
      for (let tx = 1; tx < COLS - 1; tx++) {
        const i = ty * COLS + tx,
          tr = terr[i],
          R = REG[reg[i]],
          x = (tx + rnd(0.2, 0.8)) * T,
          y = (ty + rnd(0.2, 0.8)) * T;
        if (!far(x, y, 170)) continue;
        if ((tr === MEADOW || tr === BOG) && random() < 0.02 * R.trees * (nT(tx / 6, ty / 6) > 0.55 ? 2.5 : 0.25))
          trees.push({ x, y, r: rnd(15, 24), res: 10 });
        else if (tr !== WATER && tr !== ROAD && random() < (tr === SCREE ? 0.04 : 0.003) * R.rocks) {
          const r = { x, y, r: rnd(12, 34) };
          r.big = r.r >= 22;
          r.res = r.big ? Math.round(r.r / 2) : 0;
          rocks.push(r);
        }
        if (tr !== WATER && random() < (tr === ROAD ? 0.006 : 0.0008) * R.wrecks)
          wrecks.push({ x, y, r: 18, a: rnd(0, 3.14), res: 12, tractor: R.key === 'farm' && random() < 0.6 });
        if (tr !== WATER && random() < 0.0012 * R.houses) {
          const h = { x, y, w: rnd(90, 150), h: rnd(70, 110), res: 28 };
          if (
            tt(h.x + h.w, h.y + h.h) !== WATER &&
            tt(h.x + h.w, h.y) !== WATER &&
            tt(h.x, h.y + h.h) !== WATER &&
            !houses.some((o) => Math.abs(o.x - h.x) < 170 && Math.abs(o.y - h.y) < 140)
          )
            houses.push(h);
        }
        if (random() < 0.0005 * (R.key === 'farm' ? 4 : R.key === 'meadows' ? 1 : 0.3)) {
          const a = random() < 0.5 ? 0 : Math.PI / 2,
            n = 8 + ~~rnd(0, 10);
          for (let k = 0; k < n; k++) {
            const px = x + Math.cos(a) * k * 34,
              py = y + Math.sin(a) * k * 34;
            if (dry(px, py)) posts.push({ x: px, y: py, r: 6 });
          }
        }
        if ((tr === MEADOW || tr === BOG) && far(x, y, 360) && random() < 0.00022 * R.strays) {
          const n = random() < 0.8 ? 1 : 2;
          for (let k = 0; k < n; k++) {
            const sx = x + rnd(-40, 40),
              sy = y + rnd(-40, 40);
            if (tt(sx, sy) !== WATER) strays.push(mkSheep(sx, sy, random() < 0.2));
          }
        }
      }
    for (const h of houses) {
      const x = h.x + h.w + 30,
        y = h.y + h.h / 2;
      if (dry(x, y) && random() < 0.6) wrecks.push({ x, y, r: 20, a: rnd(0, 3.14), res: 14, tractor: true });
    }
    // abandoned pens with two or three sheep shut inside, mostly beside farm buildings
    const pens = [];
    let penId = 0;
    const addPen = (x, y) => {
      if (tt(x, y) === WATER || !far(x, y, 500) || pens.some((o) => Math.hypot(o.x - x, o.y - y) < 300)) return;
      const pen = { id: ++penId, x, y, r: 46 };
      pens.push(pen);
      const n = 2 + (random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const sh = mkSheep(x + rnd(-18, 18), y + rnd(-18, 18), random() < 0.35);
        sh.pen = pen;
        strays.push(sh);
      }
    };
    for (const h of houses) {
      const R = REG[reg[tileAt(h.x, h.y)]];
      if (random() < (R.key === 'farm' ? 0.7 : 0.15)) addPen(h.x - 70, h.y + h.h / 2);
    }
    for (let i = 0; i < 4000 && pens.length < 20; i++) {
      const x = rnd(300, WORLD - 300),
        y = rnd(300, WORLD - 300);
      if (REG[reg[tileAt(x, y)]].key === 'farm' && tt(x, y) === MEADOW) addPen(x, y);
    }
    // one ewe and one ram within reach of home, so the first day has a chance
    for (const ram of [false, true]) {
      for (let n = 0; n < 50; n++) {
        const a = rnd(0, 6.28),
          r = ram ? rnd(520, 700) : rnd(320, 460),
          x = c + Math.cos(a) * r,
          y = c + Math.sin(a) * r;
        if (tt(x, y) === MEADOW) {
          strays.push(mkSheep(x, y, ram));
          break;
        }
      }
    }
    return {
      seed,
      t: DAY * START_PHASE,
      terr,
      grass,
      reg,
      explored: new Uint8Array(COLS * COLS),
      newlyExplored: [],
      rocks,
      posts,
      houses,
      trees,
      stumps: [],
      rubble: [],
      strays,
      flock: [],
      preds: [],
      texts: [],
      pings: [],
      answers: [],
      folds: [],
      walls: [],
      decoys: [],
      traps: [],
      pens,
      confetti: [],
      alerts: [],
      wrecks,
      beams: [],
      shocks: [],
      impacts: [],
      events: [],
      shown: {},
      seenKinds: {},
      horns: 0,
      shears: 0,
      wool: 0,
      wood: 0,
      stone: 0,
      metal: 0,
      tech: 0,
      bags: 0,
      trumpet: false,
      balm: false,
      ramCoat: false,
      ramLasers: false,
      laserCd: 0,
      bleatCd: 0,
      hungerBeep: 0,
      orbit: 0,
      circling: false,
      sp: { wolf: 0, fox: 8, dog: 25 },
      curReg: -1,
      p: {
        x: c,
        y: c,
        vx: 0,
        vy: 0,
        face: 0,
        hunger: 100,
        health: 100,
        fleece: 2,
        dash: 0,
        dashCd: 0,
        dashMax: 1,
        cast: 0,
        grazing: false,
        bob: 0,
        still: 0,
      },
      maxFlock: 1,
      day: 1,
      running: true,
      over: false,
      lastDay: 1,
      shake: 0,
      cheer: 0,
      zapped: 0,
    };
  }

  Sheep.world = { generateWorld, tileAt };
})((globalThis.Sheep = globalThis.Sheep || {}));
