// Small maths helpers and a seedable random number generator. No browser APIs.
(function (Sheep) {
  'use strict';

  // Simulation randomness comes from one seeded generator (mulberry32), so the same seed builds the
  // same world, and tests can replay a game exactly. Presentation-only randomness (screen shake,
  // music drips) uses fxRnd so it never disturbs the simulation.
  let rngState = 1;
  function seedRng(seed) {
    rngState = seed >>> 0;
  }
  function random() {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const newSeed = () => (Math.random() * 4294967296) >>> 0;
  const rnd = (a, b) => a + random() * (b - a);
  const fxRnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // a stable per-object random stream from a position, used for shapes that must look the same every frame
  function srand(x, y, k = 0) {
    let h = (Math.imul(~~x, 73856093) ^ Math.imul(~~y, 19349663) ^ Math.imul(k + 1, 83492791)) >>> 0;
    return () => {
      h = (h + 0x6d2b79f5) >>> 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // smooth value noise on a 64x64 lattice
  function makeNoise() {
    const N = 64,
      v = new Float32Array(N * N).map(() => random()),
      m = (a) => ((a % N) + N) % N;
    return (x, y) => {
      const xi = Math.floor(x),
        yi = Math.floor(y),
        fx = x - xi,
        fy = y - yi,
        sx = fx * fx * (3 - 2 * fx),
        sy = fy * fy * (3 - 2 * fy),
        g = (a, b) => v[m(b) * N + m(a)];
      return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy;
    };
  }

  Sheep.util = { seedRng, random, newSeed, rnd, fxRnd, clamp, srand, makeNoise };
})((globalThis.Sheep = globalThis.Sheep || {}));
