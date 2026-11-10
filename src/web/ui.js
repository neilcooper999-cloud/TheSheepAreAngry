// HTML menus and messages: the start screen, game details, options, the craft menu, game over and toasts.
// The craft menu is drawn from sim.craftOptions(), a plain list a native UI can draw just as well.
(function (Sheep) {
  'use strict';
  const { CRAFT_GROUPS, RES } = Sheep.data;
  const sim = Sheep.sim,
    audio = Sheep.audio,
    store = Sheep.storage;
  const $ = (id) => document.getElementById(id);
  const ov = $('overlay'),
    card = $('card'),
    toastEl = $('toast');
  const handlers = {}; // start(), resume()
  const rank = sim.rank;

  // ---------- toast ----------
  let toastT = 0;
  function toast(m, sec = 3.5) {
    toastEl.textContent = m;
    toastEl.hidden = false;
    toastT = sec;
  }
  function tick(dt) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) toastEl.hidden = true;
    }
  }

  // ---------- craft menu ----------
  const resName = (k) => RES.find((r) => r[0] === k)[1],
    resCol = (k) => RES.find((r) => r[0] === k)[2];
  let craftAll = !!store.get('sheepCraftAll', 0);
  function showCraft() {
    const S = sim.state(),
      all = sim.craftOptions();
    const chip = (k, v) => {
      const have = Math.floor(S[k]);
      return `<span class="cost ${have >= v ? 'ok' : 'short'}"><i style="background:${resCol(k)}"></i>${resName(k)} <b>${Math.min(have, v)}/${v}</b></span>`;
    };
    const card_ = (r) => {
      const done = r.status === 'done',
        locked = r.status === 'locked',
        ok = r.status === 'ok';
      return `<div class="rec${ok ? ' can' : done ? ' done' : ' cant'}"><div class="rh"><b>${r.name}</b>${r.tier ? `<span class="tier">Tier ${r.tier}</span>` : ''}</div>
      <p>${r.text}</p>${
        Object.keys(r.cost).length && !done
          ? `<div class="costs">${Object.entries(r.cost)
              .map(([k, v]) => chip(k, v))
              .join('')}</div>`
          : ''
      }
      ${locked ? `<div class="lock">Locked: ${r.lockText}</div>` : ''}${r.flock && !done && !locked ? `<div class="lock ok">Flock of ${r.flock} or more</div>` : ''}
      <button type="button" data-id="${r.id}" ${ok ? '' : 'disabled'}>${r.label}</button></div>`;
    };
    // what you can afford right now comes first, from every track in tree order; the rest of the tree hides behind a checkbox
    const ready = CRAFT_GROUPS.flatMap(([tk]) => all.filter((r) => r.track === tk && r.status === 'ok'));
    card.classList.add('wide');
    card.innerHTML = `<div class="stickhead"><div class="chead"><div><div class="eb">Craft</div><h1>Flock <span>works</span></h1></div><button id="close" type="button" class="ghost x" aria-label="Close">Close ✕</button></div>
  <div class="resbar">${RES.map(([k, n, c]) => `<div class="res"><i style="background:${c}"></i><span>${n}</span><b>${Math.floor(S[k])}</b></div>`).join('')}<div class="res load"><span>Carrying</span><b>${Math.floor(sim.load())}/${sim.carryCap()}</b></div></div></div>
  <h2 class="trk">Ready to build</h2>${ready.length ? `<div class="recipes">${ready.map(card_).join('')}</div>` : `<div class="sub">Nothing you can build yet. Gather more, or tick the box below to see what's coming.</div>`}
  <label class="opt treebox"><input type="checkbox" id="showTree" ${craftAll ? 'checked' : ''}> Show full tech tree</label>
  ${
    craftAll
      ? CRAFT_GROUPS.map(([tk, title, sub]) => {
          const rs = all.filter((r) => r.track === tk && r.status !== 'ok');
          return rs.length
            ? `<h2 class="trk">${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}<div class="recipes">${rs.map(card_).join('')}</div>`
            : '';
        }).join('')
      : ''
  }`;
    ov.hidden = false;
    $('showTree').onchange = (e) => {
      craftAll = e.target.checked;
      store.set('sheepCraftAll', craftAll ? 1 : 0);
      const y = ov.scrollTop;
      showCraft();
      ov.scrollTop = y;
      $('showTree').focus({ preventScroll: true });
    };
    card.querySelectorAll('[data-id]').forEach(
      (b) =>
        (b.onclick = () => {
          sim.build(b.dataset.id);
          closeCraft();
        }),
    );
    $('close').onclick = closeCraft;
    $('close').focus({ preventScroll: true });
    ov.scrollTop = 0;
  }
  const craftOpen = () => !ov.hidden && !!$('showTree');
  function closeCraft() {
    ov.hidden = true;
    if (handlers.resume) handlers.resume();
  }
  // a click or tap on the dimmed backdrop, outside the card, closes the craft menu
  ov.addEventListener('click', (e) => {
    if (e.target === ov && craftOpen()) closeCraft();
  });
  // Escape (and, in an Android wrapper, the back button) closes it too
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && craftOpen()) closeCraft();
  });

  // ---------- screens ----------
  function showIntro() {
    card.classList.remove('wide');
    card.innerHTML = `<div class="eb">A survival game</div><h1>The Sheep Are <span>Angry!</span></h1>
  <p>The humans are gone. You are Flossy, a ewe with a yellow ear tag and an attitude.</p>
  <p>Ewe must survive and save as many of your sheepy friends as you can.</p>
  <p>Build your flock, craft shelter and defences, and remember: a traditional enemy may be willing to be your friend.</p>
  <p class="warn">But beware of the night!!! Keep your flock close!!</p>
  <div class="introbtns"><button id="go" type="button">Leave the field</button>
  <button id="details" type="button" class="ghost">Game Details</button><button id="opts" type="button" class="ghost">Options</button></div>`;
    ov.hidden = false;
    $('go').onclick = () => handlers.start();
    $('details').onclick = showDetails;
    $('opts').onclick = showOptions;
    $('go').focus({ preventScroll: true });
    ov.scrollTop = 0;
  }
  function showDetails() {
    card.innerHTML = `<div class="chead"><div><div class="eb">How to play</div><h1>Game <span>Details</span></h1></div><button id="back" type="button" class="ghost x">Back</button></div>
  <ul><li><kbd>M</kbd> turns sound and music off and on.</li>
  <li><kbd>WASD</kbd> or arrows to move. On a phone, drag anywhere.</li>
  <li>Hold <kbd>Space</kbd> or GRAZE to eat. Bare brown ground has nothing left.</li>
  <li><kbd>B</kbd> or BLEAT to call out. Sheep nearby answer and show up briefly. At night, wolves hear it too.</li>
  <li><kbd>Shift</kbd> or CHARGE to headbutt. At first you can only break trees and buildings for wood. Better horns let you break big rocks for stone, then old cars and tractors for metal. Charging also knocks wolves back.</li>
  <li>A bigger flock can carry more: each ewe adds 6 to how much you can hold and each ram adds 10.</li>
  <li>A bigger flock sees further, helps you gather more with every charge, and from ten sheep a lookout warns you of wolves. It also gets hungrier and draws more wolves.</li>
  <li>Sheep are rare out here. There's a ewe and a ram somewhere near home, and the old farms have pens with sheep shut inside: charge a pen to break them out.</li>
  <li>Walk near a stray to recruit it. Their fleeces grow, and once you've made shears, press <kbd>F</kbd> or SHEAR near flockmates with a yellow dot to harvest wool.</li>
  <li>The map is split into regions. Home Meadows are gentle. The Wildwood has timber and foxes, the Fells have stone and wolves, Old Farmland has barns, tractors and wild sheepdogs, and the Ruined Town is rich in metal but has no grass and danger day and night.</li>
  <li>Rams defend the flock on their own and survive two wolf bites. Foxes are small and need two bites to kill a ewe. A wild sheepdog herds your sheep away, but charge it three times and it's yours.</li>
  <li>Wolves will attack a flock that stands still. With four or more flockmates, keep moving and they circle you, and the wolves can only pace around.</li>
  <li>When you graze, the whole flock grazes, so a big flock strips a pasture fast and grass takes many days to grow back. While heads are down the flock spreads out and can't see far. Only green meadow has grass; scree, bog and old roads have none, bog slows you, and nothing crosses water.</li>
  <li>The best items need a big flock as well as materials. At the top of the tree, Laser Horns let Flossy and her rams zap predators from a distance, using old tech dug out of the Ruined Town.</li>
  <li><kbd>C</kbd> or CRAFT to open the upgrade tree. Start with a Wooden Pen and a Ram-horn Helm. Wolves will chew through a weak pen, so upgrade it as you go: wool-lined, then drystone, then iron-gated.</li>
  <li>Choose where to build your pen with care: it's built where Flossy stands and becomes the flock's home base. Good grass nearby keeps the flock fed, and every upgrade goes into the same spot. It shows on the minimap as a hut, with an arrow pointing home when it's out of view.</li>
  <li>Your own fleece slows you down, and too much can leave you cast on your back. Rubbing against trees, rocks and posts tears a little off and gives you a scrap of wool, but only down to 3 kg. To get it all off you need shears.</li></ul>
  <button id="back2" type="button" class="ghost">Back</button>`;
    $('back').onclick = $('back2').onclick = showIntro;
    $('back').focus({ preventScroll: true });
    ov.scrollTop = 0;
  }
  function showOptions() {
    card.innerHTML = `<div class="chead"><div><div class="eb">Settings</div><h1><span>Options</span></h1></div><button id="back" type="button" class="ghost x">Back</button></div>
  <label class="opt"><input type="checkbox" id="optMusic" ${audio.musicOn ? 'checked' : ''}><span><b>Music</b> A different tune for each region</span></label>
  <label class="opt"><input type="checkbox" id="optSound" ${audio.soundOn ? 'checked' : ''}><span><b>Sound</b> Baas, bleats, chimes and the rest</span></label>
  <p class="sub">You can also press <kbd>M</kbd> during the game to turn both off and on.</p>`;
    $('optMusic').onchange = (e) => audio.setMusic(e.target.checked);
    $('optSound').onchange = (e) => audio.setSound(e.target.checked);
    $('back').onclick = showIntro;
    $('back').focus({ preventScroll: true });
    ov.scrollTop = 0;
  }
  function showOver(S) {
    card.classList.remove('wide');
    card.innerHTML = `<div class="eb">Flossy has fallen</div><h1>Day ${S.day}</h1>
  <p>Largest flock: <b>${S.maxFlock}</b> sheep (${rank(S.maxFlock)}). Gathered <b>${~~S.wool}</b> wool, <b>${S.wood}</b> wood, <b>${S.stone}</b> stone and <b>${S.metal}</b> metal.</p>
  <p>${S.maxFlock < 5 ? 'Next time, bleat to find strays before the first night. Alone, a sheep is dinner.' : 'At night, graze in short bursts. Every time you stop, the wolves close in.'}</p>
  <button id="go" type="button">Try again</button>`;
    ov.hidden = false;
    $('go').onclick = () => handlers.start();
    $('go').focus();
  }

  Sheep.ui = {
    toast,
    tick,
    showIntro,
    showCraft,
    closeCraft,
    showOver,
    isOpen: () => !ov.hidden,
    hide() {
      ov.hidden = true;
    },
    on(name, fn) {
      handlers[name] = fn;
    },
  };
})((globalThis.Sheep = globalThis.Sheep || {}));
