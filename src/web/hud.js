// The HTML heads-up display: bars, counters and the cooldown rings on the touch buttons.
(function (Sheep) {
  'use strict';
  const { clamp } = Sheep.util;
  const sim = Sheep.sim;
  const { phase, isNight, rank, load, carryCap } = sim;
  const els = {};
  const $ = (id) => els[id] || (els[id] = document.getElementById(id));

  function update(S) {
    const p = S.p,
      set = (id, v) => ($(id).textContent = v),
      bar = (id, f) => ($(id).style.width = clamp(f, 0, 1) * 100 + '%');
    const ph = phase(),
      hrs = (6 + ph * 24) % 24;
    set(
      'day',
      `Day ${S.day} · ${String(~~hrs).padStart(2, '0')}:${String(~~((hrs % 1) * 60)).padStart(2, '0')}${isNight() ? ' · night' : ''}`,
    );
    set('rank', rank(S.flock.length + 1));
    bar('bHunger', p.hunger / 100);
    set('vHunger', ~~p.hunger);
    // hunger colour: green when fed, yellow as it drops, red before it runs out, flashing below 10
    const hb = $('bHunger'),
      starving = p.hunger < 10 && !S.over;
    hb.style.background = p.hunger > 50 ? '#9cbf6a' : p.hunger > 25 ? '#e6b422' : '#ff3b30';
    hb.classList.toggle('starving', starving);
    $('vHunger').classList.toggle('starving', starving);
    bar('bHealth', p.health / 100);
    set('vHealth', Math.max(0, ~~p.health));
    bar('bFleece', p.fleece / 10);
    set('vFleece', p.fleece.toFixed(1) + 'kg');
    $('bFleece').style.background = p.fleece > 7 ? '#e0835a' : p.fleece > 4 ? '#e6b422' : '#f4f2e6';
    const R = sim.region(p.x, p.y);
    $('region').textContent = R.name;
    $('region').style.color = R.col;
    const dogs = S.preds.filter((w) => w.tame).length,
      rams = S.flock.filter((s) => s.ram).length;
    set(
      'vFlock',
      `${S.flock.length + 1} sheep${rams ? ` · ${rams} ram${rams > 1 ? 's' : ''}` : ''}${dogs ? ` · ${dogs} dog${dogs > 1 ? 's' : ''}` : ''}`,
    );
    const ready = S.flock.filter((s) => s.fleece >= 4).length;
    set('vReady', ready ? `${ready} ready` : '');
    const ring = (id, left, max) => {
      const b = $(id),
        pr = max > 0 ? clamp(1 - left / max, 0, 1) : 1;
      b.style.setProperty('--p', pr.toFixed(3));
      b.classList.toggle('cooling', pr < 1);
      b.classList.toggle('ready', pr >= 1);
    };
    $('bShear').hidden = S.shears < 1;
    ring('bCharge', p.dashCd, p.dashMax || 1);
    ring('bBleat', S.bleatCd, 4);
    const ld = load(),
      cap = carryCap();
    bar('bLoad', ld / cap);
    set('vLoad', `${Math.floor(ld)}/${cap}`);
    $('bLoad').style.background = ld >= cap - 0.5 ? '#e05a4a' : '#c89a5c';
    set('vWool', ~~S.wool);
    set('vWood', S.wood);
    set('vStone', S.stone);
    set('vMetal', S.metal);
    set('vTech', S.tech);
  }
  // a sheep joining makes the flock counter pulse
  function pulseFlock() {
    const el = $('vFlock');
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  Sheep.hud = { update, pulseFlock };
})((globalThis.Sheep = globalThis.Sheep || {}));
