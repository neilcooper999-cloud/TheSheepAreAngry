// Web Audio: every sound is synthesised live, so there are no sound files.
// This is the only file that knows about AudioContext. A native port replaces it with its own
// implementation of the same small API: play(name, arg), musicStart(), suspend(), resume().
(function (Sheep) {
  'use strict';
  const { fxRnd } = Sheep.util;
  const sim = Sheep.sim;
  const store = Sheep.storage;
  let warned = false;
  const warn = (e) => {
    if (!warned) {
      warned = true;
      console.warn('Audio problem (further ones are not logged):', e);
    }
  };

  let actx = null;
  const settings = store.get('sheepAudio', {});
  let soundOn = settings.sound !== false,
    musicOn = settings.music !== false;
  const saveAudio = () => store.set('sheepAudio', { sound: soundOn, music: musicOn });
  const ac = () => {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };
  const audio = () => (soundOn ? ac() : null);
  // One plain "baa": a sawtooth voice through "aa" formants with the fast warble of a real sheep
  // Flossy's charge: a squeaky cartoon-lamb "baa", like a kid doing a lamb voice. A buzzy voice runs through three
  // vowel formants; the "b" is the formants sliding up from low as the voice opens. Pitch and length vary a little each time.
  function baaCharge() {
    try {
      const a = audio();
      if (!a) return;
      const t = a.currentTime,
        k = 0.95 + Math.random() * 0.1,
        dur = 0.55 * (0.92 + Math.random() * 0.16),
        sh = 1.25;
      const out = a.createGain();
      out.gain.value = 0.9 * 0.22;
      out.connect(a.destination);
      const src = a.createOscillator();
      src.type = 'sawtooth';
      src.frequency.setValueAtTime(380 * k, t);
      src.frequency.linearRampToValueAtTime(500 * k, t + dur * 0.15);
      src.frequency.linearRampToValueAtTime(470 * k, t + dur * 0.7);
      src.frequency.linearRampToValueAtTime(360 * k, t + dur);
      const soft = a.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 3200;
      const env = a.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
      env.gain.exponentialRampToValueAtTime(1, t + 0.06);
      env.gain.setValueAtTime(1, t + dur * 0.7);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // the lamb's flutter, on loudness and pitch
      const fl = a.createOscillator(),
        fg = a.createGain(),
        fp = a.createGain();
      fl.frequency.value = 9;
      fg.gain.setValueAtTime(0, t);
      fg.gain.linearRampToValueAtTime(0.35, t + 0.12);
      fp.gain.value = 14;
      fl.connect(fg).connect(env.gain);
      fl.connect(fp).connect(src.frequency);
      src.connect(soft).connect(env);
      // a puff of breath as the lips part on the "b"
      const nb = a.createBuffer(1, a.sampleRate * 0.05, a.sampleRate),
        nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
      const ns = a.createBufferSource(),
        nf = a.createBiquadFilter(),
        ng = a.createGain();
      ns.buffer = nb;
      nf.type = 'bandpass';
      nf.frequency.value = 900;
      nf.Q.value = 1;
      ng.gain.value = 0.12;
      ns.connect(nf).connect(ng).connect(out);
      ns.start(t + 0.005);
      [
        [760, 280, 1, 0.11],
        [1500, 850, 0.55, 0.09],
        [2800, 2200, 0.22, 0.07],
      ].forEach(([f, f0, gn, bw]) => {
        const bp = a.createBiquadFilter(),
          g = a.createGain();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(f0 * sh, t);
        bp.frequency.exponentialRampToValueAtTime(f * sh, t + 0.07);
        bp.Q.value = 1 / bw;
        g.gain.value = gn * 5;
        env.connect(bp).connect(g).connect(out);
      });
      for (const n of [src, fl]) {
        n.start(t);
        n.stop(t + dur + 0.05);
      }
    } catch (e) {
      warn(e);
    }
  }

  // The bleat: a short, high baa that rings out like a sonar ping, with echoes coming back off the hills
  function bleatSonar() {
    try {
      const a = audio();
      if (!a) return;
      const t = a.currentTime;
      const out = a.createGain();
      out.gain.value = 0.35;
      out.connect(a.destination);
      const dl = a.createDelay(1),
        fb = a.createGain(),
        lp = a.createBiquadFilter();
      dl.delayTime.value = 0.32;
      fb.gain.value = 0.5;
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      dl.connect(lp).connect(fb).connect(dl);
      lp.connect(out);
      const o = a.createOscillator(),
        g = a.createGain(),
        trem = a.createOscillator(),
        tg = a.createGain(),
        ping = a.createOscillator(),
        pg = a.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(820, t);
      o.frequency.linearRampToValueAtTime(900, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(760, t + 0.3);
      trem.frequency.value = 22;
      tg.gain.value = 0.4;
      trem.connect(tg).connect(g.gain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      ping.type = 'sine';
      ping.frequency.setValueAtTime(1560, t);
      ping.frequency.exponentialRampToValueAtTime(1480, t + 0.6);
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.linearRampToValueAtTime(0.4, t + 0.005);
      pg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      for (const [src, gn] of [
        [o, g],
        [ping, pg],
      ]) {
        src.connect(gn);
        gn.connect(out);
        gn.connect(dl);
      }
      for (const n of [o, trem]) n.start(t), n.stop(t + 0.4);
      ping.start(t);
      ping.stop(t + 0.75);
      setTimeout(() => {
        try {
          fb.gain.value = 0;
          out.disconnect();
        } catch (e) {
          warn(e);
        }
      }, 3500);
    } catch (e) {
      warn(e);
    }
  }

  // Background music: a little sequencer with one tune per region. Night closes the filter, drops the volume and thins out the melody.
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const SCALES = {
    pent: [0, 2, 4, 7, 9],
    mix: [0, 2, 4, 5, 7, 9, 10],
    dor: [0, 2, 3, 5, 7, 9, 10],
    aeo: [0, 2, 3, 5, 7, 8, 10],
    phr: [0, 1, 3, 5, 7, 8, 10],
  };
  const deg = (sc, i) => {
    const s = SCALES[sc],
      n = s.length;
    return s[((i % n) + n) % n] + 12 * Math.floor(i / n);
  };
  // a tune is written one character per eighth note: a scale step in base 36, "-" to hold, "." for a rest
  const tune = (str) => {
    const ev = [];
    let i = 0;
    for (const c of str.replace(/[ |]/g, '')) {
      const l = ev[ev.length - 1];
      if (c === '-') {
        if (l && l.s + l.len === i) l.len++;
      } else if (c !== '.') ev.push({ s: i, d: parseInt(c, 36), len: 1 });
      i++;
    }
    return { ev, len: i };
  };
  const M = { bus: null, lp: null, key: null, want: null, k: 0, next: 0, timer: null, switchAt: 0, noise: null };
  // headbutt: a low, dull thump with a short yelp from the animal
  function thud(kind) {
    try {
      const a = audio();
      if (!a) return;
      const t = a.currentTime,
        out = a.createGain();
      out.gain.value = 0.55;
      out.connect(a.destination);
      const o = a.createOscillator(),
        g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.27);
      const n = a.createBufferSource(),
        b = a.createBuffer(1, a.sampleRate * 0.08, a.sampleRate),
        d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const ng = a.createGain();
      ng.gain.value = 0.6;
      n.buffer = b;
      n.connect(lp).connect(ng).connect(out);
      n.start(t);
      const y = a.createOscillator(),
        yg = a.createGain(),
        f0 = kind === 'fox' ? 1100 : kind === 'dog' ? 800 : 600;
      y.type = 'triangle';
      y.frequency.setValueAtTime(f0, t + 0.06);
      y.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.11);
      y.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.24);
      yg.gain.setValueAtTime(0.0001, t + 0.06);
      yg.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
      yg.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      y.connect(yg).connect(out);
      y.start(t + 0.06);
      y.stop(t + 0.28);
    } catch (e) {
      warn(e);
    }
  }
  function tone(t, m, dur, o = {}) {
    const a = actx,
      osc = a.createOscillator(),
      g = a.createGain();
    osc.type = o.w || 'triangle';
    osc.frequency.value = mtof(m);
    let n = osc;
    if (o.f) {
      const f = a.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.f;
      f.Q.value = o.q || 0.7;
      osc.connect(f);
      n = f;
    }
    if (o.vib) {
      const l = a.createOscillator(),
        lg = a.createGain();
      l.frequency.value = o.vib;
      lg.gain.value = o.vd || 8;
      l.connect(lg).connect(osc.detune);
      l.start(t);
      l.stop(t + dur + 1);
    }
    const v = o.v || 0.1,
      at = o.a || 0.01,
      rel = o.r || 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + at);
    g.gain.setTargetAtTime(v * (o.s ?? 0.6), t + at, Math.max(0.02, dur / 3));
    g.gain.setTargetAtTime(0.0001, t + dur, rel / 4);
    n.connect(g).connect(M.lp);
    osc.start(t);
    osc.stop(t + dur + rel + 0.1);
  }
  function hit(t, o = {}) {
    const a = actx,
      src = a.createBufferSource(),
      f = a.createBiquadFilter(),
      g = a.createGain(),
      d = o.d || 0.05;
    src.buffer = M.noise;
    f.type = o.type || 'highpass';
    f.frequency.value = o.f || 7000;
    f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.v || 0.04, t + (o.a || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(M.lp);
    src.start(t, Math.random() * 0.5);
    src.stop(t + d + 0.05);
  }
  function thump(t, v = 0.25, f0 = 120, f1 = 45) {
    const a = actx,
      o = a.createOscillator(),
      g = a.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(M.lp);
    o.start(t);
    o.stop(t + 0.3);
  }
  function drip(t) {
    const a = actx,
      o = a.createOscillator(),
      g = a.createGain(),
      f = fxRnd(700, 1100);
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.07);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(M.lp);
    o.start(t);
    o.stop(t + 0.12);
  }
  // each song: tempo, key, scale, a lead voice and a list of 4-bar tunes, plus a band() that plays bass, drones and percussion on every sixteenth
  const SONGS = {
    meadows: {
      bpm: 84,
      root: 60,
      sc: 'pent',
      lead: { w: 'triangle', v: 0.11, r: 0.3 },
      oct: 0,
      mel: ['7-89 8-76 5-67 6--. 7-89 a-98 7-6- 5--.', '5-6- 7-8- 9-8- 7--. 8-9- a-9- 8-76 5---'],
      band(k, t, sd, night) {
        const bar = ~~(k / 16) % 4,
          p = k % 16,
          r = [0, -3, -7, -5][bar] + 48;
        if (p === 0) tone(t, r, sd * 7, { w: 'triangle', v: 0.12, r: 0.4 });
        if (p === 8) tone(t, r + 7, sd * 7, { w: 'triangle', v: 0.09, r: 0.4 });
        if (p === 4 || p === 12) for (const iv of [12, 16, 19]) tone(t, r + iv, sd * 3, { w: 'sine', v: 0.025, a: 0.04, r: 0.3 });
        if (!night && p % 4 === 2) hit(t, { v: 0.012, f: 6000, d: 0.06 });
      },
    },
    farm: {
      bpm: 112,
      root: 55,
      sc: 'mix',
      lead: { w: 'sawtooth', f: 2000, vib: 5.5, vd: 12, v: 0.06, a: 0.02, s: 0.8 },
      oct: 0,
      mel: ['ba97 9be- dcba 9-7- 79b9 acba 9789 7--.', '7-9- b-a- 9-7- 8-9- a-b- c-ba 9-87 7---'],
      band(k, t, sd, night) {
        const bar = ~~(k / 16) % 4,
          p = k % 16,
          r = [0, 5, -2, 0][bar] + 43;
        if (p % 8 === 0) {
          tone(t, r, sd * 2, { w: 'triangle', v: 0.16, r: 0.08 });
          thump(t, 0.14);
        }
        if (p % 8 === 4) for (const iv of [16, 19]) tone(t, r + iv, sd * 1.5, { w: 'square', f: 1400, v: 0.022, r: 0.05 });
        if (p % 4 === 2) hit(t, { v: night ? 0.01 : 0.02, d: 0.04 });
      },
    },
    woods: {
      bpm: 70,
      root: 50,
      sc: 'dor',
      lead: { w: 'sine', vib: 5, vd: 15, v: 0.1, a: 0.08, s: 0.85, r: 0.4 },
      oct: 0,
      mel: ['7--9 a-9- 7--- .... a-b- c-ba 9--- 7---', '9--- a-b- a-9- 7--- 6-7- 9-7- 6--- ....'],
      band(k, t, sd, night) {
        const bar = ~~(k / 16) % 4,
          p = k % 16;
        if (p === 0) {
          const r = [38, 38, 36, 38][bar];
          tone(t, r, sd * 16, { w: 'sine', v: 0.11, a: 0.6, s: 1, r: 1 });
          tone(t, r + 7, sd * 16, { w: 'triangle', v: 0.04, a: 0.8, s: 1, r: 1, f: 500 });
        }
        if (p === 10 && bar % 2) hit(t, { type: 'bandpass', f: 900, q: 6, v: 0.05, d: 0.08 });
        if (night && p === 6 && bar === 2)
          tone(t, 74, sd * 3, { w: 'sine', v: 0.04, a: 0.05, vib: 3, vd: 20 }),
            tone(t + sd * 4, 71, sd * 5, { w: 'sine', v: 0.035, a: 0.05, vib: 3, vd: 20 });
      },
    },
    marsh: {
      bpm: 58,
      root: 57,
      sc: 'aeo',
      lead: { w: 'sine', vib: 4, vd: 22, v: 0.09, a: 0.12, s: 0.9, r: 0.6 },
      oct: 0,
      mel: ['7--- 9-8- 7--- --.. a-9- 8-7- 6--- --..', '4--- 5-6- 7--- 6-5- 4-5- 6-4- 3--- ----'],
      band(k, t, sd, night) {
        const bar = ~~(k / 16) % 4,
          p = k % 16,
          r = [45, 41, 43, 45][bar];
        if (p === 0)
          for (const iv of [0, bar === 0 || bar === 3 ? 3 : 4, 7])
            tone(t, r + iv + 12, sd * 16, { w: 'triangle', v: 0.03, a: 1.2, s: 1, r: 1.5, vib: 0.7, vd: 10 });
        if (p === 0) tone(t, r, sd * 14, { w: 'sine', v: 0.1, a: 0.3, s: 0.9, r: 0.8 });
        if (Math.random() < (night ? 0.035 : 0.05)) drip(t + fxRnd(0, sd));
      },
    },
    fells: {
      bpm: 62,
      root: 52,
      sc: 'aeo',
      lead: { w: 'sawtooth', f: 850, v: 0.07, a: 0.15, s: 0.9, r: 0.5, vib: 4, vd: 6 },
      oct: 0,
      mel: ['7--- --9- a--- 9-7- b--- a-9- 7--- ----', 'a--- --b- c--- b-a- 9--- 8-7- 7--- ----'],
      band(k, t, sd, night) {
        const bar = ~~(k / 16) % 4,
          p = k % 16,
          r = [40, 40, 36, 38][bar];
        if (p === 0) {
          tone(t, r, sd * 16, { w: 'sawtooth', f: 380, v: 0.08, a: 0.8, s: 1, r: 1.2 });
          tone(t, r + 7, sd * 16, { w: 'sawtooth', f: 380, v: 0.05, a: 1, s: 1, r: 1.2 });
        }
        if (p === 0 && bar % 2 === 0) hit(t, { type: 'bandpass', f: 450, q: 0.8, v: 0.03, a: 1.2, d: sd * 28 });
        if (p === 8 && bar === 3) thump(t, 0.18, 90, 40);
      },
    },
    town: {
      bpm: 120,
      root: 52,
      sc: 'phr',
      lead: { w: 'square', f: 2600, v: 0.045, r: 0.03, s: 0.3, stacc: 1 },
      oct: 0,
      mel: ['e.d. c... e.f. edc. b.c. d... e... ....', '7.8. 7.6. 5... 7... a.9. 8.7. 8... 7...'],
      band(k, t, sd, night) {
        const bar = ~~(k / 16) % 4,
          p = k % 16,
          r = bar === 3 ? 41 : 40;
        tone(t, r + (p % 4 === 3 ? 12 : 0), sd * 0.8, { w: 'square', f: 520, q: 4, v: 0.07, r: 0.03, s: 0.4 });
        if (p === 0 || p === 8 || (p === 14 && bar % 2)) thump(t, 0.22);
        if (p % 4 === 2) hit(t, { v: 0.03, f: 8000, d: 0.03 });
        if (p === 12) hit(t, { type: 'bandpass', f: 2700, q: 9, v: 0.08, d: 0.18 });
      },
    },
  };
  for (const sg of Object.values(SONGS)) sg.tunes = sg.mel.map(tune);
  function musicStep(sg, k, t, sd, night) {
    sg.band(k, t, sd, night);
    const tl = sg.tunes[0].len * 2,
      ph = ~~(k / tl),
      tn = sg.tunes[ph % sg.tunes.length],
      pos = k % tl;
    if (night && ph % 2) return; // at night the tune only comes round every other time
    for (const e of tn.ev)
      if (e.s * 2 === pos) tone(t, sg.root + sg.oct + deg(sg.sc, e.d), sg.lead.stacc ? sd * 1.2 : e.len * sd * 2, sg.lead);
  }
  function musicStart() {
    try {
      const a = ac();
      if (!M.bus) {
        M.lp = a.createBiquadFilter();
        M.lp.type = 'lowpass';
        M.lp.frequency.value = 9000;
        M.bus = a.createGain();
        M.bus.gain.value = 0;
        M.lp.connect(M.bus).connect(a.destination);
        M.noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const d = M.noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      M.key = null;
      M.switchAt = 0;
      M.next = a.currentTime + 0.1;
      M.k = 0;
      if (!M.timer) M.timer = setInterval(musicPump, 40);
    } catch (e) {
      warn(e);
    }
  }
  function musicPump() {
    const a = actx;
    if (!a || !M.bus) return;
    const S = sim.state();
    if (!S) return;
    const p = S.p,
      night = sim.isNight(),
      want = S.over ? null : sim.region(p.x, p.y).key,
      now = a.currentTime;
    const vol = !musicOn || !want ? 0 : night ? 0.55 : 0.85;
    if (want !== M.key && !M.switchAt) {
      M.switchAt = now + (M.key ? 1.6 : 0.05);
      M.bus.gain.setTargetAtTime(0, now, 0.4);
    } // fade out the old region's tune
    if (M.switchAt && now >= M.switchAt) {
      M.switchAt = 0;
      M.key = want;
      M.k = 0;
      M.next = Math.max(M.next, now + 0.05);
    }
    if (!M.switchAt) {
      M.bus.gain.setTargetAtTime(vol, now, M.key === want ? 0.5 : 1);
      M.lp.frequency.setTargetAtTime(night ? 1400 : 9000, now, 2);
    }
    const sg = SONGS[M.key];
    if (M.next < now) M.next = now + 0.02;
    while (M.next < now + 0.2) {
      const sd = sg ? 60 / sg.bpm / 4 : 0.125;
      if (sg && !M.switchAt) musicStep(sg, M.k, M.next, sd, night);
      M.k++;
      M.next += sd;
    }
  }
  // Hunger alarm: two short high beeps, pitched above the music so they cut through without being loud.
  function hungerAlarm() {
    try {
      const a = audio();
      if (!a) return;
      const t = a.currentTime,
        out = a.createGain();
      out.gain.value = 0.16;
      out.connect(a.destination);
      [
        [1046, 0],
        [1318, 0.16],
      ].forEach(([f, d]) => {
        const o = a.createOscillator(),
          g = a.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t + d);
        g.gain.linearRampToValueAtTime(1, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.13);
        o.connect(g).connect(out);
        o.start(t + d);
        o.stop(t + d + 0.15);
      });
    } catch (e) {
      warn(e);
    }
  }
  function chime(low) {
    try {
      const actx = audio();
      if (!actx) return;
      const t = actx.currentTime;
      [low ? 392 : 523, low ? 523 : 659, low ? 659 : 784].forEach((f, i) => {
        const o = actx.createOscillator(),
          g = actx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * 0.09);
        g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.4);
        o.connect(g).connect(actx.destination);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.45);
      });
    } catch (e) {
      warn(e);
    }
  }

  // sound effects the simulation asks for by name
  const SFX = { charge: baaCharge, bleat: bleatSonar, thud, hungerAlarm, chime };
  function play(name, arg) {
    const f = SFX[name];
    if (f) f(arg);
    else warn(new Error('Unknown sound: ' + name));
  }

  Sheep.audio = {
    play,
    musicStart,
    get soundOn() {
      return soundOn;
    },
    get musicOn() {
      return musicOn;
    },
    setSound(on) {
      soundOn = on;
      saveAudio();
    },
    setMusic(on) {
      musicOn = on;
      saveAudio();
    },
    // M key: everything off, or everything back on
    toggleAll() {
      const on = !(soundOn || musicOn);
      soundOn = musicOn = on;
      saveAudio();
      return on;
    },
    suspend() {
      if (actx && actx.state === 'running') actx.suspend().catch(warn);
    },
    resume() {
      if (actx && actx.state === 'suspended') actx.resume().catch(warn);
    },
  };
})((globalThis.Sheep = globalThis.Sheep || {}));
