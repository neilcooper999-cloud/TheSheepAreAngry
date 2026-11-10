// Canvas 2D renderer: draws the game state. Reads the state, never changes it.
// A native port replaces this file with its own renderer (for example a Canvas/OpenGL view on Android).
(function (Sheep) {
  'use strict';
  const { clamp, srand, fxRnd } = Sheep.util;
  const { CONFIG, TERR, REG } = Sheep.data;
  const sim = Sheep.sim;
  const { vision, nightness, tileAt, terrAt, bleatRange } = sim;
  const { WORLD, T, COLS, EYES_RANGE, MM_SPAN } = CONFIG;
  const { MEADOW, SCREE, BOG, WATER, ROAD } = TERR;

  const cv = document.getElementById('c'),
    ctx = cv.getContext('2d'),
    hudEl = document.getElementById('hud');
  let vw, vh, dpr;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = innerWidth;
    vh = innerHeight;
    cv.width = vw * dpr;
    cv.height = vh * dpr;
  }
  addEventListener('resize', resize);
  resize();

  let S = null; // the state being drawn this frame
  // shapes for trees and rocks are built once per object and kept here, off the game state
  const shapes = new WeakMap();

  // explored-terrain picture for the minimap, one pixel per tile, painted as the sim explores
  const mmc = document.createElement('canvas');
  mmc.width = mmc.height = COLS;
  const mmx = mmc.getContext('2d');
  let mmFor = null;
  function paintExplored() {
    if (mmFor !== S) {
      mmFor = S;
      mmx.fillStyle = '#000';
      mmx.fillRect(0, 0, COLS, COLS);
    }
    for (const i of S.newlyExplored) {
      const g = S.grass[i],
        tr = S.terr[i],
        x = i % COLS,
        y = (i / COLS) | 0;
      mmx.fillStyle =
        tr === WATER
          ? '#2c5470'
          : tr === SCREE
            ? '#7d7a6c'
            : tr === BOG
              ? '#3a422a'
              : tr === ROAD
                ? '#4a4a46'
                : `rgb(${~~(90 - g * 45)},${~~(80 + g * 55)},${~~(50 - g * 15)})`;
      mmx.fillRect(x, y, 1, 1);
    }
    S.newlyExplored.length = 0;
  }

  function drawSheep(s, isP, camx, camy, ghost) {
    const x = s.x - camx,
      y = s.y - camy,
      f = s.fleece || 2,
      r = 10 + f * 1.3,
      cast = isP && s.cast > 0;
    ctx.save();
    ctx.translate(x, y);
    if (ghost) ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(2, 4, r + 3, r * 0.8, 0, 0, 7);
    ctx.fill();
    ctx.rotate(s.face + (cast ? Math.PI / 2 : 0));
    const b = Math.sin(s.bob || 0) * 1.2;
    if (cast) {
      ctx.strokeStyle = '#2a2622';
      ctx.lineWidth = 3;
      for (const k of [-1, 1])
        for (const j of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(k * 6, j * 6);
          ctx.lineTo(k * 9, j * (r + 6));
          ctx.stroke();
        }
    }
    ctx.fillStyle = isP ? '#fbf8ec' : '#ece7d6';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.28;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.45 - 2, Math.sin(a) * r * 0.4, r * 0.62, 0, 7);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(-2, 0, r, r * 0.82, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = s.ram ? '#4a3d33' : '#2a2622';
    ctx.beginPath();
    ctx.ellipse(r + 2 + b, 0, 7.5, 5.5, 0, 0, 7);
    ctx.fill();
    if (s.ram && S.ramLasers) {
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(r + 8 + b, 0, 2.5, 0, 7);
      ctx.fill();
    }
    if (s.ram) {
      ctx.strokeStyle = '#b8a27a';
      ctx.lineWidth = 3;
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(r + 1 + b, k * 5, 4.5, 0, 6);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#2a2622';
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(r - 1 + b, k * 7, 3.5, 2, k * 0.6, 0, 7);
      ctx.fill();
    }
    if (isP) {
      ctx.fillStyle = '#e6b422';
      ctx.fillRect(r - 3 + b, -10, 5, 4);
    }
    ctx.restore();
    // an injured flockmate shows how many bites it has left
    if (!isP && !ghost && s.hp < s.maxhp - 0.01) {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(x - 9, y + r + 3, 18, 3);
      ctx.fillStyle = '#e05a4a';
      ctx.fillRect(x - 9, y + r + 3, (18 * s.hp) / s.maxhp, 3);
    }
    // fleece ready to shear
    if (!isP && !ghost && S.flock.includes(s) && s.fleece >= 4) {
      ctx.fillStyle = '#e6b422';
      ctx.beginPath();
      ctx.arc(x, y - r - 6, 3, 0, 7);
      ctx.fill();
    }
  }
  function drawPred(w, camx, camy) {
    const k = w.kind,
      sc = k === 'fox' ? 0.7 : k === 'dog' ? 0.85 : 1,
      dazed = w.state === 'stun',
      tm = performance.now() / 1000;
    ctx.save();
    ctx.translate(w.x - camx, w.y - camy);
    ctx.rotate(w.face + (dazed ? Math.sin(tm * 18) * 0.35 : 0));
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 20, 9, 0, 0, 7);
    ctx.fill();
    if (k === 'dog' && w.tame) {
      ctx.strokeStyle = 'rgba(230,180,34,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 17, 0, 0, 7);
      ctx.stroke();
    }
    ctx.fillStyle = k === 'fox' ? '#d0612a' : k === 'dog' ? '#1f1d1c' : '#6e6a66';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 8, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-20, 0, k === 'fox' ? 12 : 10, k === 'fox' ? 5 : 3.5, 0, 0, 7);
    ctx.fill();
    if (k === 'fox') {
      ctx.fillStyle = '#f4efe4';
      ctx.beginPath();
      ctx.arc(-30, 0, 3.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#d0612a';
    }
    if (k === 'dog') {
      ctx.fillStyle = '#f2efe6';
      ctx.beginPath();
      ctx.ellipse(10, 0, 6, 6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#1f1d1c';
    }
    ctx.beginPath();
    ctx.moveTo(14, -6);
    ctx.lineTo(28, 0);
    ctx.lineTo(14, 6);
    ctx.fill();
    // a tamed dog wears Flossy's yellow: a thick collar round the neck with a tag, and a faint yellow ring on the ground
    if (k === 'dog' && w.tame) {
      ctx.fillStyle = '#3a2f00';
      ctx.beginPath();
      ctx.roundRect(11, -8.5, 6, 17, 2.5);
      ctx.fill();
      ctx.fillStyle = '#e6b422';
      ctx.beginPath();
      ctx.roundRect(12, -7.5, 4, 15, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(17.5, 0, 2.6, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#3a2f00';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#1f1d1c';
    }
    ctx.fillStyle = w.state === 'stun' || w.state === 'stuck' ? '#9cbf6a' : k === 'dog' ? '#c9b48a' : '#ffd36a';
    ctx.beginPath();
    ctx.arc(20, -3, 1.8, 0, 7);
    ctx.arc(20, 3, 1.8, 0, 7);
    ctx.fill();
    if (w.flash > 0) {
      ctx.globalAlpha = Math.min(1, w.flash / 0.18) * 0.85;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 10, 0, 0, 7);
      ctx.ellipse(22, 0, 8, 6, 0, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // dazed: little yellow stars circling over its head
    if (dazed) {
      const x = w.x - camx,
        y = w.y - camy - 22;
      for (let i = 0; i < 3; i++) {
        const an = tm * 5 + i * 2.09,
          sx = x + Math.cos(an) * 13,
          sy = y + Math.sin(an) * 4.5;
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        for (let j = 0; j < 10; j++) {
          const r = j % 2 ? 1.6 : 4,
            q = (j * Math.PI) / 5 - Math.PI / 2;
          ctx.lineTo(sx + Math.cos(q) * r, sy + Math.sin(q) * r);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  function tileColor(tr, g, tx, ty) {
    const v = ((tx * 13 + ty * 7) % 5) * 3;
    if (tr === SCREE) return `rgb(${128 + v},${124 + v},${110 + v})`;
    if (tr === BOG) return `rgb(${58 + v},${66 + v},${42})`;
    if (tr === WATER) return `rgb(${40},${84 + v},${112 + v})`;
    if (tr === ROAD) return `rgb(${70 + v},${70 + v},${68 + v})`;
    return `rgb(${~~(120 - g * 62)},${~~(98 + g * 62)},${~~(62 - g * 22)})`;
  }
  function terrDetail(tr, x, y, tx, ty) {
    const h = (tx * 31 + ty * 17) % 29;
    if (tr === SCREE) {
      ctx.fillStyle = 'rgba(70,68,60,.45)';
      ctx.fillRect(x + h, y + ((h * 3) % 34), 5, 4);
      ctx.fillRect(x + ((h * 7) % 34), y + h, 3, 3);
    } else if (tr === BOG) {
      ctx.fillStyle = 'rgba(60,90,110,.5)';
      ctx.beginPath();
      ctx.ellipse(x + 10 + (h % 20), y + 12 + ((h * 5) % 18), 8, 4, 0, 0, 7);
      ctx.fill();
    } else if (tr === WATER) {
      ctx.strokeStyle = 'rgba(180,210,230,.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + h, y + 20);
      ctx.lineTo(x + h + 9, y + 20);
      ctx.stroke();
    } else if (tr === ROAD) {
      ctx.strokeStyle = 'rgba(30,30,28,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + h, y);
      ctx.lineTo(x + h + 6, y + 14);
      ctx.lineTo(x + h + 2, y + 26);
      ctx.stroke();
      if (h % 3 === 0) {
        ctx.fillStyle = 'rgba(110,150,70,.6)';
        ctx.fillRect(x + ((h * 3) % 30), y + ((h * 5) % 30), 4, 3);
      }
    }
  }
  const onScreen = (x, y, m) => x > -m && y > -m && x < vw + m && y < vh + m;
  // Natural-looking trees and rocks. Each object gets a shape built once from a seed of its position,
  // so it looks the same every frame. Collision still uses the plain r circle.
  function treeShape(t) {
    if (shapes.has(t)) return shapes.get(t);
    const R = srand(t.x, t.y, 1),
      r = t.r,
      wood = REG[sim.regionAt(t.x, t.y)]?.key === 'woods';
    const hue = wood ? -12 : R() * 14 - 7,
      n = 7 + ~~(R() * 3),
      rot = R() * 7,
      br = [],
      outer = [],
      mid = [],
      top = [];
    for (let k = 0; k < 5 + ~~(R() * 3); k++) {
      const a = rot + (k * 6.283) / 6 + R() * 0.6,
        l = r * (1.08 + R() * 0.32),
        bend = (R() - 0.5) * 0.5;
      br.push({ a, l, bend, w: 2.4 + R() * 1.6, tw: (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.35) });
    }
    for (let k = 0; k < n; k++) {
      const a = rot + (k * 6.283) / n + (R() - 0.5) * 0.4;
      outer.push({ a, d: r * (0.58 + R() * 0.12), s: r * (0.33 + R() * 0.1) });
    }
    for (let k = 0; k < 4; k++) {
      const a = rot + k * 1.57 + R() * 0.8;
      mid.push({ a, d: r * (0.28 + R() * 0.15), s: r * (0.34 + R() * 0.08) });
    }
    for (let k = 0; k < 3; k++) {
      const a = -2.36 + (R() - 0.5) * 1.4;
      top.push({ a, d: r * (0.2 + R() * 0.35), s: r * (0.16 + R() * 0.1) });
    }
    const col = (l) => `hsl(${(wood ? 108 : 100) + hue},${wood ? 42 : 45}%,${l}%)`;
    const shape = {
      br,
      outer,
      mid,
      top,
      c: [col(wood ? 14 : 16), col(wood ? 20 : 23), col(wood ? 26 : 30), col(wood ? 33 : 38)],
      res0: t.res,
    };
    shapes.set(t, shape);
    return shape;
  }
  function blobs(x, y, list, sc) {
    ctx.beginPath();
    for (const b of list) {
      const bx = x + Math.cos(b.a) * b.d * sc,
        by = y + Math.sin(b.a) * b.d * sc;
      ctx.moveTo(bx + b.s * sc, by);
      ctx.arc(bx, by, b.s * sc, 0, 6.284);
    }
    ctx.fill();
  }
  function drawTree(t, x, y) {
    const sh = treeShape(t),
      r = t.r,
      left = clamp(t.res / (sh.res0 || 1), 0, 1),
      sc = 0.55 + 0.45 * left;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    blobs(x + 6, y + 7, sh.outer, sc * 1.04);
    // branches reach out from the trunk, poking past the canopy edge (more of them show as the tree is chopped)
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a321d';
    for (const b of sh.br) {
      const ex = x + Math.cos(b.a) * b.l,
        ey = y + Math.sin(b.a) * b.l,
        mx = x + Math.cos(b.a + b.bend) * b.l * 0.55,
        my = y + Math.sin(b.a + b.bend) * b.l * 0.55;
      ctx.lineWidth = b.w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      const fx = x + Math.cos(b.a) * b.l * 0.78,
        fy = y + Math.sin(b.a) * b.l * 0.78;
      ctx.lineWidth = b.w * 0.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(b.a + b.tw) * b.l * 0.3, fy + Math.sin(b.a + b.tw) * b.l * 0.3);
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(b.a - b.tw * 0.6) * b.l * 0.22, fy + Math.sin(b.a - b.tw * 0.6) * b.l * 0.22);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = sh.c[0];
    blobs(x, y, sh.outer, sc);
    ctx.fillStyle = sh.c[1];
    blobs(x - r * 0.05, y - r * 0.05, sh.outer, sc * 0.86);
    ctx.fillStyle = sh.c[2];
    blobs(x - r * 0.08, y - r * 0.1, sh.mid, sc);
    ctx.fillStyle = sh.c[3];
    blobs(x, y, sh.top, sc);
    // a glimpse of trunk and limbs through the leaves
    ctx.strokeStyle = 'rgba(60,40,22,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const b = sh.br[k];
      ctx.moveTo(x + Math.cos(b.a) * r * 0.12, y + Math.sin(b.a) * r * 0.12);
      ctx.lineTo(x + Math.cos(b.a + b.bend * 0.5) * r * 0.38 * sc, y + Math.sin(b.a + b.bend * 0.5) * r * 0.38 * sc);
    }
    ctx.stroke();
    ctx.fillStyle = '#5a3d22';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.2, r * 0.11), 0, 6.284);
    ctx.fill();
  }
  function rockShape(o, mossy) {
    if (shapes.has(o)) return shapes.get(o);
    const R = srand(o.x, o.y, 2),
      r = o.r,
      n = 7 + ~~(R() * 4),
      pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k * 6.283) / n + (R() - 0.5) * 0.5,
        d = r * (0.78 + R() * 0.3);
      pts.push([Math.cos(a) * d, Math.sin(a) * d * (0.85 + R() * 0.1)]);
    }
    const tone = R() * 14 - 7,
      peak = [(-0.18 + R() * 0.12) * r, (-0.22 + R() * 0.12) * r],
      facets = pts.map((q, k) => {
        const q2 = pts[(k + 1) % n],
          ex = q2[0] - q[0],
          ey = q2[1] - q[1],
          nl = Math.hypot(ex, ey) || 1,
          lit = clamp(0.5 + ((ey / nl) * -0.7 + (-ex / nl) * -0.7) * 0.5, 0, 1);
        return `hsl(${45 + tone * 0.5},${o.big ? 6 : 7}%,${30 + lit * 34 + tone}%)`;
      });
    const cracks = [];
    for (let k = 0; k < (o.big ? 3 : 1); k++) {
      let a = R() * 6.283,
        cx = Math.cos(a) * r * 0.15,
        cy = Math.sin(a) * r * 0.15;
      const seg = [[cx, cy]];
      for (let j = 0; j < 3; j++) {
        a += (R() - 0.5) * 1.2;
        cx += Math.cos(a) * r * 0.22;
        cy += Math.sin(a) * r * 0.22;
        seg.push([cx, cy]);
      }
      cracks.push(seg);
    }
    const specks = [];
    for (let k = 0; k < 4 + ~~(r / 5); k++) {
      const a = R() * 6.283,
        d = R() * r * 0.7;
      specks.push([Math.cos(a) * d, Math.sin(a) * d, R() < 0.5]);
    }
    const moss = mossy && R() < 0.55 ? { a: R() * 6.283, d: r * 0.45, s: r * (0.22 + R() * 0.15) } : null;
    const shape = { pts, peak, facets, cracks, specks, moss, res0: o.res || 1 };
    shapes.set(o, shape);
    return shape;
  }
  function poly(x, y, pts, sc = 1) {
    ctx.beginPath();
    pts.forEach((q, k) => (k ? ctx.lineTo(x + q[0] * sc, y + q[1] * sc) : ctx.moveTo(x + q[0] * sc, y + q[1] * sc)));
    ctx.closePath();
  }
  function drawRock(o, x, y, mossy) {
    const sh = rockShape(o, mossy),
      n = sh.pts.length;
    ctx.fillStyle = 'rgba(0,0,0,.27)';
    poly(x + 3, y + 4, sh.pts, 1.02);
    ctx.fill();
    // faceted faces meeting at a ridge: lit up-left, shaded down-right
    for (let k = 0; k < n; k++) {
      const a = sh.pts[k],
        b = sh.pts[(k + 1) % n];
      ctx.fillStyle = sh.facets[k];
      ctx.beginPath();
      ctx.moveTo(x + sh.peak[0], y + sh.peak[1]);
      ctx.lineTo(x + a[0], y + a[1]);
      ctx.lineTo(x + b[0], y + b[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(30,30,26,.45)';
    ctx.lineWidth = 1;
    poly(x, y, sh.pts);
    ctx.stroke();
    for (const [sx, sy, lt] of sh.specks) {
      ctx.fillStyle = lt ? 'rgba(255,255,240,.18)' : 'rgba(0,0,0,.18)';
      ctx.fillRect(x + sx, y + sy, 2, 2);
    }
    if (sh.moss) {
      const m = sh.moss;
      ctx.fillStyle = 'rgba(98,128,58,.75)';
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(m.a) * m.d, y + Math.sin(m.a) * m.d, m.s, m.s * 0.7, m.a, 0, 6.284);
      ctx.fill();
    }
    // more cracks show as a big rock is broken up
    if (o.big) {
      const dmg = 1 - clamp(o.res / sh.res0, 0, 1),
        show = 1 + Math.round(dmg * 2);
      ctx.strokeStyle = 'rgba(30,28,24,.6)';
      ctx.lineWidth = 1.4;
      for (let c = 0; c < Math.min(show, sh.cracks.length); c++) {
        const seg = sh.cracks[c];
        ctx.beginPath();
        seg.forEach((q, k) => (k ? ctx.lineTo(x + q[0], y + q[1]) : ctx.moveTo(x + q[0], y + q[1])));
        ctx.stroke();
      }
    }
  }
  function drawStump(s, x, y) {
    const R = srand(s.x, s.y, 3);
    ctx.strokeStyle = '#4a321d';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = R() * 6.283;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#6b4c30';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#b08860';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(107,76,48,.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 7);
    ctx.stroke();
  }
  function draw(state) {
    S = state;
    paintExplored();
    const joy = Sheep.input.joy;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = S.p,
      sh = S.shake > 0 ? fxRnd(-1, 1) * Math.min(10, S.shake * 26) : 0,
      camx = p.x - vw / 2 + sh,
      camy = p.y - vh / 2 + sh;
    const vr = vision(),
      nt = nightness();
    const seen = (o, pad = 0) => Math.hypot(o.x - p.x, o.y - p.y) < vr + pad;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, vw, vh);
    const x0 = Math.max(0, ~~(camx / T)),
      y0 = Math.max(0, ~~(camy / T)),
      x1 = Math.min(COLS - 1, ~~((camx + vw) / T)),
      y1 = Math.min(COLS - 1, ~~((camy + vh) / T));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * COLS + tx;
        if (!S.explored[i]) continue;
        const g = S.grass[i];
        const tr = S.terr[i],
          sx = tx * T - camx,
          sy = ty * T - camy;
        ctx.fillStyle = tileColor(tr, g, tx, ty);
        ctx.fillRect(sx, sy, T + 1, T + 1);
        if (tr !== MEADOW) {
          terrDetail(tr, sx, sy, tx, ty);
          continue;
        }
        if (g > 0.7 && (tx * 7 + ty * 13) % 5 === 0) {
          ctx.fillStyle = 'rgba(240,230,150,.5)';
          ctx.fillRect(tx * T - camx + ((tx * 31) % 30), ty * T - camy + ((ty * 17) % 30), 3, 3);
        }
      }
    const known = (o) => S.explored[tileAt(o.x, o.y)];
    for (const h of S.rubble) {
      const x = h.x - camx,
        y = h.y - camy;
      if (!known(h) || !onScreen(x, y, 160)) continue;
      ctx.fillStyle = h.metal ? '#5d6a72' : h.stone ? '#77756c' : '#5a3a2c';
      for (let k = 0; k < 6; k++) {
        ctx.fillRect(x + ((k * 37) % h.w), y + ((k * 23) % h.h), 12, 8);
      }
    }
    for (const pen of S.pens) {
      const x = pen.x - camx,
        y = pen.y - camy;
      if (!known(pen) || !onScreen(x, y, 60)) continue;
      ctx.strokeStyle = '#7a5634';
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 6]);
      ctx.strokeRect(x - pen.r, y - pen.r, pen.r * 2, pen.r * 2);
      ctx.setLineDash([]);
      ctx.fillStyle = '#5c3f26';
      for (const [cx, cy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        ctx.fillRect(x + cx * pen.r - 4, y + cy * pen.r - 4, 8, 8);
    }
    for (const s of S.stumps) {
      const x = s.x - camx,
        y = s.y - camy;
      if (!known(s) || !onScreen(x, y, 20)) continue;
      drawStump(s, x, y);
    }
    for (const h of S.houses) {
      const x = h.x - camx,
        y = h.y - camy;
      if (!known(h) && !known({ x: h.x + h.w, y: h.y + h.h })) continue;
      if (x > vw || y > vh || x + h.w < 0 || y + h.h < 0) continue;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(x + 6, y + 8, h.w, h.h);
      ctx.fillStyle = h.res < 8 ? '#6a3f30' : '#7d4a37';
      ctx.fillRect(x, y, h.w, h.h);
      ctx.strokeStyle = '#5c3326';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + h.h / 2);
      ctx.lineTo(x + h.w, y + h.h / 2);
      ctx.stroke();
      if (h.res < 8) {
        ctx.fillStyle = '#2a1a14';
        ctx.fillRect(x + h.w * 0.3, y + h.h * 0.2, h.w * 0.25, h.h * 0.3);
      }
      ctx.fillStyle = 'rgba(120,150,70,.55)';
      ctx.beginPath();
      ctx.arc(x + h.w * 0.8, y + h.h * 0.25, 14, 0, 7);
      ctx.arc(x + h.w * 0.15, y + h.h * 0.8, 10, 0, 7);
      ctx.fill();
    }
    for (const r of S.posts) {
      const x = r.x - camx,
        y = r.y - camy;
      if (!known(r) || !onScreen(x, y, 20)) continue;
      ctx.fillStyle = '#6b4c30';
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
    ctx.strokeStyle = 'rgba(150,150,140,.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i < S.posts.length; i++) {
      const a = S.posts[i - 1],
        b = S.posts[i];
      if (known(a) && known(b) && Math.hypot(a.x - b.x, a.y - b.y) < 40) {
        ctx.beginPath();
        ctx.moveTo(a.x - camx, a.y - camy);
        ctx.lineTo(b.x - camx, b.y - camy);
        ctx.stroke();
      }
    }
    for (const r of S.rocks) {
      const x = r.x - camx,
        y = r.y - camy;
      if (!known(r) || !onScreen(x, y, 40)) continue;
      drawRock(r, x, y, terrAt(r.x, r.y) === MEADOW);
    }
    for (const t of S.trees) {
      const x = t.x - camx,
        y = t.y - camy;
      if (!known(t) || !onScreen(x, y, 40)) continue;
      drawTree(t, x, y);
    }
    for (const k of S.wrecks) {
      const x = k.x - camx,
        y = k.y - camy;
      if (!known(k) || !onScreen(x, y, 40)) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(k.a);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(-k.r + 4, -k.r * 0.55 + 5, k.r * 2, k.r * 1.1);
      ctx.fillStyle = k.tractor ? '#8a3b26' : '#5d6a72';
      ctx.fillRect(-k.r, -k.r * 0.55, k.r * 2, k.r * 1.1);
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(-k.r * 0.6, -k.r * 0.3, k.r * 0.7, k.r * 0.6);
      ctx.fillStyle = '#222';
      if (k.tractor) {
        ctx.fillRect(-k.r, -k.r * 0.8, k.r * 0.8, 5);
        ctx.fillRect(-k.r, k.r * 0.8 - 5, k.r * 0.8, 5);
      } else {
        ctx.fillRect(-k.r * 0.8, -k.r * 0.7, 7, 4);
        ctx.fillRect(k.r * 0.5, -k.r * 0.7, 7, 4);
        ctx.fillRect(-k.r * 0.8, k.r * 0.7 - 4, 7, 4);
        ctx.fillRect(k.r * 0.5, k.r * 0.7 - 4, 7, 4);
      }
      ctx.restore();
    }
    for (const w of S.walls) {
      const x = w.x - camx,
        y = w.y - camy;
      if (!onScreen(x, y, 20)) continue;
      drawRock(w, x, y, false);
    }
    for (const tr of S.traps) {
      const x = tr.x - camx,
        y = tr.y - camy;
      if (!onScreen(x, y, 20)) continue;
      ctx.fillStyle = '#5c4326';
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 10, 0.3, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#8a7048';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(x - 9 + k * 4.5, y + ((k * 7) % 6) - 3, 3, 0, 7);
        ctx.fill();
      }
    }
    for (const dc of S.decoys) {
      const x = dc.x - camx,
        y = dc.y - camy;
      if (!onScreen(x, y, 30)) continue;
      ctx.strokeStyle = '#6b4c30';
      ctx.lineWidth = 2.5;
      for (const k of [-6, 6])
        for (const j of [-7, 7]) {
          ctx.beginPath();
          ctx.moveTo(x + k, y);
          ctx.lineTo(x + k * 1.4, y + j * 1.6);
          ctx.stroke();
        }
      ctx.fillStyle = '#d9d2bb';
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 11, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#6b4c30';
      ctx.fillRect(x + 12, y - 4, 9, 7);
      ctx.fillStyle = '#2a2622';
      ctx.fillRect(x + 16, y - 2, 2, 2);
    }
    // living things only where Flossy can actually see
    for (const s of S.strays) if (seen(s, 10)) drawSheep(s, false, camx, camy);
    for (const s of S.flock) drawSheep(s, false, camx, camy);
    drawSheep(p, true, camx, camy);
    for (const w of S.preds) if (w.tame || seen(w, 10)) drawPred(w, camx, camy);
    if (S.horns) {
      ctx.strokeStyle = ['', '#8a6a44', '#b4b1a4', '#8fa3b2', '#6fd3e0', '#ff4d6d'][S.horns];
      ctx.lineWidth = 4;
      const a = p.face,
        hx = vw / 2 - sh + Math.cos(a) * (14 + p.fleece * 1.3),
        hy = vh / 2 - sh + Math.sin(a) * (14 + p.fleece * 1.3);
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx - Math.sin(a) * k * 6, hy + Math.cos(a) * k * 6, 5, 0, 6);
        ctx.stroke();
      }
    }

    // fog of sight: clear around Flossy, darker beyond, black where never explored
    const cx = vw / 2 - sh,
      cy = vh / 2 - sh,
      outer = 1 - 0.12 * (1 - nt);
    const g = ctx.createRadialGradient(cx, cy, vr * 0.55, cx, cy, vr);
    g.addColorStop(0, 'rgba(5,7,12,0)');
    g.addColorStop(1, `rgba(5,7,12,${outer})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    if (nt > 0) {
      ctx.fillStyle = `rgba(10,16,40,${0.25 * nt})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    // your shelters stay visible through the dark
    for (const f of S.folds) {
      const x = f.x - camx,
        y = f.y - camy;
      if (!onScreen(x, y, f.r + 20)) continue;
      if (f.tier <= 2) {
        ctx.strokeStyle = f.hp < f.max * 0.3 ? '#5a3e26' : '#7a5634';
        ctx.lineWidth = f.tier === 1 ? 5 : 7;
        ctx.setLineDash(f.tier === 1 ? [16, 7] : [22, 4]);
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, 7);
        ctx.stroke();
        ctx.setLineDash([]);
        if (f.tier === 2) {
          ctx.fillStyle = '#efe9d6';
          for (let k = 0; k < 18; k++) {
            const a = (k / 18) * 6.28;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * f.r, y + Math.sin(a) * f.r, 3.5, 0, 7);
            ctx.fill();
          }
        }
      } else {
        ctx.fillStyle = '#8d8a7e';
        for (let k = 0; k < 34; k++) {
          const a = (k / 34) * 6.28;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * f.r, y + Math.sin(a) * f.r, 6 + (k % 3), 0, 7);
          ctx.fill();
        }
        if (f.tier >= 4) {
          ctx.strokeStyle = '#8fa3b2';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(x, y, f.r, -0.35, 0.35);
          ctx.stroke();
        }
        if (f.tier >= 5) {
          ctx.fillStyle = '#ff4d6d';
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * 6.28 + 0.785;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * f.r, y + Math.sin(a) * f.r, 5, 0, 7);
            ctx.fill();
          }
          ctx.strokeStyle = 'rgba(255,77,109,.25)';
          ctx.setLineDash([4, 10]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, f.r + 170, 0, 7);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (f.hp < f.max) {
        const w = 60;
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(x - w / 2, y - f.r - 16, w, 6);
        ctx.fillStyle = f.hp < f.max * 0.3 ? '#e05a4a' : '#e6b422';
        ctx.fillRect(x - w / 2, y - f.r - 16, (w * f.hp) / f.max, 6);
      }
    }
    // the circle while moving
    if (S.circling) {
      ctx.strokeStyle = 'rgba(156,191,106,.45)';
      ctx.setLineDash([5, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 44 + Math.sqrt(S.flock.length) * 11 + 16, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // wolves' eyes in the dark
    if (nt > 0.3) {
      for (const w of S.preds) {
        if (w.kind === 'dog') continue;
        const d = Math.hypot(w.x - p.x, w.y - p.y);
        if (d < vr + 10 || d > EYES_RANGE) continue;
        const x = w.x - camx + Math.cos(w.face) * 20,
          y = w.y - camy + Math.sin(w.face) * 20,
          ox = -Math.sin(w.face) * 3.5,
          oy = Math.cos(w.face) * 3.5;
        ctx.fillStyle = `rgba(255,214,90,${(nt - 0.3) * 1.4 * (1 - (d / EYES_RANGE) * 0.5)})`;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, 2.3, 0, 7);
        ctx.arc(x - ox, y - oy, 2.3, 0, 7);
        ctx.fill();
      }
    }
    for (const al of S.alerts) {
      const a = Math.atan2(al.w.y - p.y, al.w.x - p.x),
        rr = vr + 26,
        x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = Math.min(1, al.t);
      ctx.fillStyle = '#e05a4a';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-6, 8);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = '#ff4d6d';
    ctx.shadowBlur = 12;
    ctx.lineCap = 'round';
    for (const bm of S.beams) {
      ctx.globalAlpha = Math.min(1, bm.t * 6);
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bm.x1 - camx, bm.y1 - camy);
      ctx.lineTo(bm.x2 - camx, bm.y2 - camy);
      ctx.stroke();
      ctx.strokeStyle = '#ffe0e6';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    for (const im of S.impacts) {
      const k = im.t / 0.35,
        x = im.x - camx,
        y = im.y - camy;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath();
      for (let j = 0; j < 16; j++) {
        const r = (j % 2 ? 10 : 28) * (0.6 + k * 0.9),
          q = (j * Math.PI) / 8 + im.a;
        ctx.lineTo(Math.cos(q) * r, Math.sin(q) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e6b422';
      ctx.lineWidth = 3;
      for (let j = 0; j < 8; j++) {
        const q = (j * Math.PI) / 4 + im.a + 0.2,
          r0 = 18 + k * 26,
          r1 = 26 + k * 34;
        ctx.beginPath();
        ctx.moveTo(Math.cos(q) * r0, Math.sin(q) * r0);
        ctx.lineTo(Math.cos(q) * r1, Math.sin(q) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const sk of S.shocks) {
      const k = sk.t / 0.5;
      ctx.strokeStyle = `rgba(111,211,224,${0.8 * (1 - k)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sk.x - camx, sk.y - camy, 20 + k * 120, 0, 7);
      ctx.stroke();
    }
    for (const c of S.confetti) {
      ctx.globalAlpha = Math.min(1, c.t * 2);
      ctx.fillStyle = c.c;
      ctx.beginPath();
      ctx.arc(c.x - camx, c.y - camy, 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (S.cheer > 0) {
      ctx.strokeStyle = `rgba(230,180,34,${S.cheer * 0.6})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 60 + (1 - S.cheer) * 160, 0, 7);
      ctx.stroke();
    }
    // bleat: echo ring, and strays that answered show through the fog
    for (const pg of S.pings) {
      const k = pg.t / 1.4;
      ctx.strokeStyle = `rgba(230,180,34,${0.6 * (1 - k)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pg.x - camx, pg.y - camy, k * bleatRange(), 0, 7);
      ctx.stroke();
    }
    for (const s of S.strays)
      if (s.seen > 0 && !seen(s, 10)) {
        const x = s.x - camx,
          y = s.y - camy;
        if (!onScreen(x, y, 10)) continue;
        ctx.globalAlpha = Math.min(1, s.seen);
        ctx.fillStyle = 'rgba(207,224,255,.25)';
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#cfe0ff';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

    if (p.grazing) {
      ctx.fillStyle = 'rgba(244,242,230,.85)';
      ctx.font = '600 12px "JetBrains Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        S.grass[tileAt(p.x, p.y)] > 0.05 ? 'munch' : terrAt(p.x, p.y) === MEADOW ? 'bare ground, move on' : 'nothing to eat here',
        cx,
        cy + 34,
      );
    }
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Bricolage Grotesque",system-ui,sans-serif';
    for (const t of S.texts) {
      ctx.globalAlpha = Math.min(1, t.life);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillText(t.txt, t.x - camx + 1, t.y - camy + 1);
      ctx.fillStyle = t.col;
      ctx.fillText(t.txt, t.x - camx, t.y - camy);
    }
    ctx.globalAlpha = 1;
    if (joy) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 50, 0, 7);
      ctx.stroke();
      const dx = joy.x - joy.ox,
        dy = joy.y - joy.oy,
        m = Math.hypot(dx, dy),
        k = m > 50 ? 50 / m : 1;
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 18, 0, 7);
      ctx.fill();
    }
    // minimap: drops below the stats panel when the screen is too narrow for both side by side.
    // It shows a window of the explored ground that scrolls with Flossy, with the flock, and strays heard answering a bleat
    const mm = Math.min(150, vw * 0.28),
      mx = vw - mm - 12,
      sc = mm / MM_SPAN,
      hr = hudEl.getBoundingClientRect(),
      my = hr.right + 8 > mx ? hr.bottom + 8 : 12,
      ox = p.x - MM_SPAN / 2,
      oy = p.y - MM_SPAN / 2;
    const mp = (x, y) => [mx + (x - ox) * sc, my + (y - oy) * sc],
      inMM = (x, y) => x > ox && x < ox + MM_SPAN && y > oy && y < oy + MM_SPAN;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mm, mm);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(mx, my, mm, mm);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mmc, mx - ox * sc, my - oy * sc, WORLD * sc, WORLD * sc);
    ctx.imageSmoothingEnabled = true;
    for (const pg of S.pings) {
      const k = pg.t / 1.4,
        [x, y] = mp(pg.x, pg.y);
      ctx.strokeStyle = `rgba(230,180,34,${0.8 * (1 - k)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, k * bleatRange() * sc, 0, 7);
      ctx.stroke();
    }
    const dot = (o, c, r) => {
      if (!inMM(o.x, o.y)) return;
      const [x, y] = mp(o.x, o.y);
      ctx.fillStyle = c;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    };
    for (const s of S.strays) if (s.seen > 0 || seen(s)) dot(s, '#cfe0ff', 4);
    for (const s of S.flock) dot(s, '#fff', 3);
    for (const w of S.preds) if (w.tame || seen(w)) dot(w, w.tame ? '#9cbf6a' : '#e05a4a', 3.5);
    // pens Flossy has built: a little hut icon, or an arrow on the edge pointing home when the pen is off the map
    for (const f of S.folds) {
      const col = ['#c89a5c', '#c89a5c', '#f4f2e6', '#a9a9a0', '#6fd3e0', '#ff4d6d'][f.tier] || '#c89a5c';
      if (inMM(f.x, f.y)) {
        const [x, y] = mp(f.x, f.y);
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(x - 6, y - 3, 12, 10);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 1);
        ctx.lineTo(x, y - 8);
        ctx.lineTo(x + 7, y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(x - 5, y - 1, 10, 7);
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 1.5, y + 2, 3, 4);
      } else {
        const a = Math.atan2(f.y - p.y, f.x - p.x),
          R = mm / 2 - 7,
          x = mx + mm / 2 + Math.cos(a) * R,
          y = my + mm / 2 + Math.sin(a) * R;
        ctx.save();
        ctx.translate(Math.max(mx + 6, Math.min(mx + mm - 6, x)), Math.max(my + 6, Math.min(my + mm - 6, y)));
        ctx.rotate(a);
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = '#e6b422';
    ctx.beginPath();
    ctx.arc(mx + mm / 2, my + mm / 2, 3, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.strokeRect(mx, my, mm, mm);
  }

  Sheep.render = { draw, canvas: cv };
})((globalThis.Sheep = globalThis.Sheep || {}));
