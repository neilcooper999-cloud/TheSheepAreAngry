# Architecture

The game is split into a **core** that holds all the rules and a **web platform layer** that does everything a browser is needed for. The core has no DOM, canvas, audio, timers or storage in it, so it can be tested in Node and carried over to an Android build.

```
index.html            markup only; loads the scripts below in order
css/game.css          styles for the HUD, buttons and menus

src/core/             the game itself, no browser APIs
  util.js             seeded random numbers, clamp, noise
  data.js             content and tuning: regions, recipes, shelters, names, constants (plain data)
  world.js            world generation from a seed -> a fresh game state
  sim.js              the simulation: update(dt, command), crafting, combat, predators, events out

src/web/              the browser platform layer
  storage.js          saved settings (localStorage)
  audio.js            Web Audio sound effects and procedural region music
  render.js           Canvas 2D drawing of the world, fog, effects and minimap
  hud.js              the HTML stats panel and button cooldown rings
  ui.js               start screen, details, options, craft menu, game over, toasts
  input.js            keyboard, drag joystick and touch buttons -> one command per step
src/main.js           wiring and the fixed-step game loop

tests/                Node tests for the core (npm test)
tools/                build-single.mjs (one-file bundle), export-data.mjs (data as JSON)
```

## How a frame works

1. `input.command()` turns keys, the joystick and the buttons into `{ mx, my, graze, charge, bleat, shear }`.
2. `sim.update(STEP, command)` advances the game by a fixed 1/60 s step (several steps if the frame was slow, at most four).
3. The simulation never plays a sound or shows a message itself. It pushes events into `state.events`: `toast`, `sfx`, `recruit`, `over`. `main.js` drains them and calls the audio and UI layers.
4. `render.draw(state)` and `hud.update(state)` read the state and draw it. They never change it.

Other rules the code follows:

- **One source of randomness for the rules.** World generation and the simulation use the seeded generator in `util.js`, so a seed rebuilds the same world (`index.html?seed=1234`) and tests can replay a game exactly. Purely visual randomness (screen shake, music) uses `fxRnd` so it never changes the game.
- **Content is data.** Recipes and shelters say what they need with plain objects (`need: { horns: 2, rams: 3 }`), not code, so `tools/export-data.mjs` can write them to JSON.
- **The craft menu is a view model.** `sim.craftOptions()` returns a plain list with each item's status (`ok`, `short`, `locked`, `done`) and button label. The web UI turns it into HTML; a native UI can draw the same list.
- **The game pauses in the background** (tab hidden or app switched away), and audio is suspended.

## Running it

- Play: open `index.html` in a browser. It still works straight from disk, with no build step.
- Test: `npm test` (Node 18 or later, no installs needed).
- One-file build: `npm run build` writes `dist/sheep.html`, everything inlined, for sharing as a single page.
- Data as JSON: `npm run export-data` writes `dist/game-data.json`.

## Taking it to Android

There are two realistic routes. They are not exclusive: the first gets the game on phones quickly, and the restructure keeps the second open.

### Route 1: wrap the web game (quickest)

Use [Capacitor](https://capacitorjs.com/) (or a Trusted Web Activity, if the game is hosted with a web manifest). The whole web build runs inside an Android WebView, so nothing in the game is rewritten. Work needed:

- Bundle the fonts locally instead of loading Google Fonts, so it works offline.
- Map the Android back button to the same action as Escape (close the craft menu, or pause).
- Lock to one orientation or test both; handle display cutouts (the CSS already uses safe-area insets).
- Hook `storage.js` to Capacitor Preferences if settings must survive a WebView data clear.
- Add save and resume, since Android can close a backgrounded app at any time (see the issues).

### Route 2: a native rewrite (Kotlin)

Port the core and replace the platform layer:

| Web file | Android equivalent |
|---|---|
| `src/core/*` | Kotlin classes with the same logic: `World`, `Sim`, data classes for sheep, predators and folds |
| `data.js` | `game-data.json` from `npm run export-data`, loaded at start-up |
| `render.js` | a custom `SurfaceView`/`Canvas` renderer, or a game library such as libGDX |
| `audio.js` | pre-rendered sound files played with `SoundPool`, or real-time synthesis with Oboe |
| `input.js` | touch handling that builds the same command object |
| `ui.js`, `hud.js` | Jetpack Compose screens driven by `craftOptions()` and the state |
| `storage.js` | DataStore / SharedPreferences |

Because the core is deterministic from a seed, the Node tests can produce reference runs (seed plus commands in, state out) to check the Kotlin port against.
