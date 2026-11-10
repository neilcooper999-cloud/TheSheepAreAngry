// Keyboard and touch input. Turns key presses, the drag joystick and the on-screen buttons into
// one command per simulation step: { mx, my, graze, charge, bleat, shear }.
// A native port produces the same command from its own touch, gamepad or keyboard events.
(function (Sheep) {
  'use strict';
  const keys = {};
  const handlers = {};
  let joy = null,
    grazeBtn = false;
  // one-shot requests, kept until the next simulation step uses them
  let chargeReq = false,
    bleatReq = false,
    shearReq = false,
    craftReq = false;
  const $ = (id) => document.getElementById(id);

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!keys[k]) {
      if (k === 'b') bleatReq = true;
      if (k === 'shift' || k === 'e') chargeReq = true;
      if (k === 'f') shearReq = true;
      if (k === 'c') craftReq = true;
      if (k === 'm' && handlers.mute) handlers.mute();
    }
    keys[k] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  // a lost focus would otherwise leave keys stuck down
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    grazeBtn = false;
  });

  // drag anywhere on the game to steer, like a floating joystick
  const cv = $('c');
  cv.addEventListener('pointerdown', (e) => {
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (joy && e.pointerId === joy.id) {
      joy.x = e.clientX;
      joy.y = e.clientY;
    }
  });
  const endJoy = (e) => {
    if (joy && e.pointerId === joy.id) joy = null;
  };
  cv.addEventListener('pointerup', endJoy);
  cv.addEventListener('pointercancel', endJoy);

  // on-screen buttons
  const gb = $('bGraze');
  gb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grazeBtn = true;
    gb.classList.add('on');
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    gb.addEventListener(ev, () => {
      grazeBtn = false;
      gb.classList.remove('on');
    }),
  );
  $('bCharge').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    chargeReq = true;
  });
  $('bBleat').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bleatReq = true;
  });
  $('bShear').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    shearReq = true;
  });
  $('bCraft').addEventListener('click', () => {
    craftReq = true;
  });

  function moveVector() {
    let x = 0,
      y = 0;
    if (keys['a'] || keys['arrowleft']) x--;
    if (keys['d'] || keys['arrowright']) x++;
    if (keys['w'] || keys['arrowup']) y--;
    if (keys['s'] || keys['arrowdown']) y++;
    if (joy) {
      const dx = joy.x - joy.ox,
        dy = joy.y - joy.oy,
        m = Math.hypot(dx, dy);
      if (m > 8) {
        x = dx / Math.max(m, 50);
        y = dy / Math.max(m, 50);
      }
    }
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  // the command for one simulation step; one-shot requests are used up
  function command() {
    const v = moveVector();
    const cmd = {
      mx: v.x,
      my: v.y,
      graze: !!(keys[' '] || keys['g'] || grazeBtn),
      charge: !!(keys['shift'] || keys['e'] || chargeReq),
      bleat: bleatReq,
      shear: shearReq,
    };
    chargeReq = bleatReq = shearReq = false;
    return cmd;
  }
  function takeCraft() {
    const c = craftReq;
    craftReq = false;
    return c;
  }
  function clear() {
    chargeReq = bleatReq = shearReq = craftReq = false;
  }

  Sheep.input = {
    command,
    takeCraft,
    clear,
    on(name, fn) {
      handlers[name] = fn;
    },
    get joy() {
      return joy;
    },
  };
})((globalThis.Sheep = globalThis.Sheep || {}));
