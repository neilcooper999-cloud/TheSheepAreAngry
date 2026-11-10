// Wires the pieces together and runs the game loop: input -> fixed-step simulation -> events -> draw.
(function (Sheep) {
  'use strict';
  const { sim, render, hud, ui, audio, input, util } = Sheep;
  const { STEP } = Sheep.data.CONFIG;
  const MAX_STEPS = 4; // after a long stall, catch up at most this many steps instead of jumping ahead

  // ?seed=1234 in the address replays the same world, handy for bug reports and testing
  const seedParam = new URLSearchParams(location.search).get('seed');
  const pickSeed = () => (seedParam !== null && seedParam !== '' ? Number(seedParam) >>> 0 : util.newSeed());

  let last = performance.now(),
    acc = 0,
    paused = false;
  const resetClock = () => {
    last = performance.now();
    acc = 0;
  };

  function start() {
    sim.newGame(pickSeed());
    ui.hide();
    input.clear();
    audio.musicStart();
    ui.toast('Morning. Bleat to find other sheep before dark.');
    resetClock();
  }

  // the simulation reports what happened; this is where the web build reacts with sound and messages
  function handleEvents() {
    for (const e of sim.drainEvents()) {
      if (e.type === 'toast') ui.toast(e.text, e.sec);
      else if (e.type === 'sfx') audio.play(e.name, e.arg);
      else if (e.type === 'recruit') {
        hud.pulseFlock();
        audio.play('chime', e.ram);
      } else if (e.type === 'over') ui.showOver(sim.state());
    }
  }

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const S = sim.state();
    if (S.running && !ui.isOpen() && !paused) {
      if (input.takeCraft()) ui.showCraft();
      else {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < MAX_STEPS) {
          sim.update(STEP, input.command());
          acc -= STEP;
          n++;
        }
        if (n >= MAX_STEPS) acc = 0;
        ui.tick(dt);
      }
    } else input.takeCraft(); // a craft request made on a menu screen is dropped
    handleEvents();
    render.draw(S);
    hud.update(S);
    requestAnimationFrame(frame);
  }

  ui.on('start', start);
  ui.on('resume', resetClock);
  input.on('mute', () => {
    const on = audio.toggleAll();
    ui.toast(on ? 'Sound and music on' : 'Sound and music off (press M to turn them back on)', 2);
  });
  // pause when the tab or app goes into the background, and quieten the audio
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) audio.suspend();
    else {
      audio.resume();
      resetClock();
    }
  });

  // a world sits behind the start screen
  sim.newGame(pickSeed());
  sim.explore();
  ui.showIntro();
  requestAnimationFrame(frame);
  Sheep.main = { start };
})((globalThis.Sheep = globalThis.Sheep || {}));
