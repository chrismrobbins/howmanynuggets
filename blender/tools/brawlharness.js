// blender/tools/brawlharness.js — the rig every BATTERED BRAWLERS measurement runs on.
//
//   node blender/tools/brawlshoot.js --tag baseline
//   node blender/tools/brawlpose.js --seq punch --tag punch-base
//   python blender/tools/crop.py sheet baseline      (CROP_PIXEL=1)
//
// WHY THIS IS A SECOND HARNESS. `hallharness.js` is not reusable here by even
// one line: it teleports `NuggetArcade._H` around a 3D room, its 21 spots are
// world coordinates with a yaw, and its seams are WebGL flags. Brawlers is a
// canvas-2D pixel game whose entire world is 340x200, has no camera to aim and
// no renderer to degrade. The only pieces that DO transfer are png.js and
// crop.py, because they take PNG bytes and know nothing about the hall.
//
// THREE THINGS IT DOES DIFFERENTLY, all of them lessons this kit paid for once:
//
//  1. IT READS THE CANVAS BUFFER, NOT THE SCREEN. `brawl.cv.toDataURL()` gives
//     the 340x200 world image — the actual picture the game composes. The hall
//     kit screenshots an element and had to hide nine DOM selectors first,
//     because a page screenshot clipped to a canvas still paints whatever sits
//     on top of it (§4: one run measured 25fps that was really 61). Here the
//     storm HUD and the round banner are DOM and simply cannot get in. It also
//     means no resampling: this game is scaled by an integer for display, so
//     the on-screen pixels carry no information the buffer doesn't, and
//     png.staircase() over a 3x nearest upscale would measure the upscale.
//
//  2. IT PINS THE DICE. A belt-scroller is random placement end to end — depth
//     lane, speed, waddle phase, golden roll, wander spawns, crate drops. The
//     game routes all of it through brawlRand(); brawlDebug({seed}) makes it a
//     mulberry32. Without that an A/B diff is measuring different cups.
//
//  3. IT FREEZES. brawlDebug({freeze:1}) stops the clock and redraws one state,
//     so setup and capture cannot drift apart, and brawlDebug({steps:n}) walks
//     the REAL step function at a fixed dt. That is the only honest way to look
//     at a fighting game — see brawlpose.js.
//
// Requires a static server on :8787 served from the REPO ROOT, and playwright
// resolvable (npm i playwright in a scratchpad, then PW_PATH=<that>/node_modules).

const path = require('path');

function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  const extra = process.env.PW_PATH;
  if (extra) { try { return require(path.join(extra, 'playwright')); } catch (e) { /* noop */ } }
  throw new Error('playwright not found. `npm i playwright` somewhere, then set PW_PATH=<that>/node_modules');
}

const BASE = process.env.HALL_URL || 'http://localhost:8787/';

// 1020x600 is not a taste call. brawl.scale = max(2, floor(vh / 200)), and the
// canvas is sized in WORLD pixels — so vh 600 gives scale 3 and a world exactly
// 200 tall, vw 1020 gives exactly 340 wide. Any other viewport and the world is
// a fractional size that changes what "the same frame" means between runs.
const VW = 1020, VH = 600;
const WORLD_W = 340, WORLD_H = 200;

// THE SCENE TABLE. The hall's equivalent is a list of camera positions; this
// game has no camera to place, so a "spot" here is a SITUATION: which act, which
// stage, who is standing where, and what they are doing.
//
// Every scene pins the camera (`cam`) instead of letting it lerp toward the
// player, pins the clock (`t`) and clears the invuln blink, because all three
// are per-frame coin flips that decide whether there is a character in the
// picture at all.
//
// Twelve of them are the twelve STAGES, which is the part of this game that has
// never been measured: three acts x four stages, each a different piece of the
// pre-rendered strip. Four are COMBAT, because a beat-em-up that photographs
// well standing still is not the game. Five are the SCREENS around it — a title
// card and a cutscene are as much of this game's art as its walls are.
const T = 12.5;                        // the pinned clock, shared by every scene

// Screen-space x (0..340) for everything below — `pose()` adds the pinned camera.
// The composition is deliberate and identical in all twelve stage scenes: player
// left of centre, two cups spread right, one deep on the belt and one shallow,
// so the same frame shows the wall, the floor, the belt and the cast every time.
const SCENES = [
  // --- ACT 1, THE RESTAURANT ------------------------------------------------
  { name: '01-kitchen', act: 0, stage: 0, at: [64, 15], cups: [['ketchup', 150, 6], ['mustard', 236, 26]] },
  { name: '02-freezer', act: 0, stage: 1, at: [64, 15], cups: [['bbq', 150, 22], ['ketchup', 236, 5]] },
  { name: '03-dock', act: 0, stage: 2, at: [64, 15], cups: [['buffalo', 150, 8], ['mustard', 236, 25]] },
  { name: '04-vault', act: 0, stage: 3, at: [64, 15], cups: [['wasabi', 232, 14], ['ketchup', 150, 24]] },
  // --- ACT 2, NUGGETOWN AFTER DARK -----------------------------------------
  { name: '05-alley', act: 1, stage: 0, at: [64, 15], cups: [['soy', 150, 9], ['ketchup', 236, 26]] },
  { name: '06-neon', act: 1, stage: 1, at: [64, 15], cups: [['mustard', 150, 24], ['soy', 236, 6]] },
  { name: '07-rooftops', act: 1, stage: 2, at: [64, 15], cups: [['mayo', 150, 12], ['soy', 236, 27]] },
  { name: '08-penthouse', act: 1, stage: 3, at: [64, 15], cups: [['dijon', 232, 14], ['mustard', 150, 25]] },
  // --- ACT 3, THE SAUCE WORKS ----------------------------------------------
  { name: '09-factory', act: 2, stage: 0, at: [64, 15], cups: [['bbq', 150, 7], ['soy', 236, 24]] },
  { name: '10-vatroom', act: 2, stage: 1, at: [64, 15], cups: [['mayo', 150, 17], ['buffalo', 236, 6]] },
  { name: '11-packing', act: 2, stage: 2, at: [64, 15], cups: [['soy', 150, 11], ['mayo', 236, 27]] },
  { name: '12-coop', act: 2, stage: 3, at: [64, 15], cups: [['clucker', 236, 14], ['soy', 150, 24]] },
  // --- COMBAT. The pose is set, then the sim is stepped a few frames so the hit
  // actually LANDS: fx, hitstop, knockback, splats and shake are all consequences
  // of the step function, and a scene that only sets p.st photographs a punch in
  // an empty room. `steps` is the reason brawlDebug can advance at a fixed dt.
  {
    name: '13-jab', act: 0, stage: 0, at: [140, 14], pst: 'jab', pstT: 0.05, steps: 2,
    cups: [['ketchup', 152, 14]],
  },
  {
    name: '14-upper', act: 0, stage: 0, at: [138, 14], pst: 'upper', pstT: 0.08, steps: 3,
    cups: [['mustard', 150, 14]],
  },
  {
    name: '15-cyclone', act: 1, stage: 1, at: [138, 15], pst: 'special', pstT: 0.18, steps: 3,
    cups: [['soy', 148, 12], ['mustard', 122, 18], ['ketchup', 160, 20]], meter: 0, crowdHype: 0.8,
  },
  {
    name: '16-ko', act: 2, stage: 2, at: [136, 14], pst: 'upper', pstT: 0.08, steps: 10, hp1: 1,
    cups: [['mayo', 150, 14], ['soy', 118, 20]],
  },
  // --- THE SCREENS ----------------------------------------------------------
  { name: '17-title', phase: 'title' },
  { name: '18-heat', phase: 'heat', heatSel: 1 },
  { name: '19-cut-diner', phase: 'cut', cut: 'intro', li: 3 },
  { name: '20-map', act: 1, stage: 2, phase: 'map', mapT: 1.35 },
  { name: '21-credits', phase: 'end', endT: 3.4 },
  // ADDED IN ROUND 4, and it is §15's lesson from the hall verbatim — a spot table
  // only measures what it points at. One cutscene was in here out of five, and it
  // was the one that turned out to be 94% pure black; the other four sets went
  // unphotographed by anything in this repo until the round that rebuilt them.
  // The table going 21 -> 25 makes earlier MEAN rows historical. Per-scene rows
  // stay comparable, which is the half that decides anything.
  { name: '22-cut-vault', phase: 'cut', cut: 'act2', li: 1 },
  { name: '23-cut-penthouse', phase: 'cut', cut: 'act3', li: 1 },
  { name: '24-cut-coop', phase: 'cut', cut: 'finaldoor', li: 1 },
  { name: '25-cut-sunrise', phase: 'cut', cut: 'ending', li: 3 },
];

async function openBrawl(opts = {}) {
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', ...(opts.args || [])],
  });
  const page = await browser.newPage({ viewport: { width: opts.w || VW, height: opts.h || VH } });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });

  await page.goto(BASE, { waitUntil: 'load' });
  // The amount input autofocuses; keystrokes meant for the game land in it.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  // Same path the arcade cabinet uses: a storm session, then the mode switch.
  await page.evaluate(() => { startStorm(1e6, 5000); setStormMode('brawl'); });
  await page.waitForFunction(() => typeof brawl !== 'undefined' && brawl.on && brawl.cv, null, { timeout: 20000 });
  await page.waitForTimeout(250);

  // The world must be the size the scene table assumes, or nothing is comparable.
  const dims = await page.evaluate(() => ({ w: brawl.cv.width, h: brawl.cv.height, scale: brawl.scale }));
  if (dims.w !== WORLD_W || dims.h !== WORLD_H) {
    throw new Error(`world is ${dims.w}x${dims.h} (scale ${dims.scale}), expected ${WORLD_W}x${WORLD_H}`
      + ' — the viewport must be ' + VW + 'x' + VH);
  }

  // The storm layer is DOM ON TOP of the canvas. It cannot reach the buffer we
  // capture, but it still costs frames, and fps() would report its bill as the
  // game's. Hidden inline: a stylesheet loses to the rules that toggle these.
  await page.evaluate(() => {
    for (const sel of ['#nuggetStorm', '.storm-hud', '.arcade-hint', '.brawl-banner']) {
      document.querySelectorAll(sel).forEach((el) => el.style.setProperty('display', 'none', 'important'));
    }
  });

  await page.evaluate((seed) => brawlDebug({ seed, freeze: 1 }), opts.seed == null ? 1337 : opts.seed);
  return { browser, page, errors, w: opts.w || VW, h: opts.h || VH };
}

// Put the game in a scene and hold it there. Returns brawlDebug's state report,
// which is the record of what was actually photographed — a scene that silently
// failed to place its boss must not come back looking like a passing row.
async function pose(page, scene, t = T) {
  return page.evaluate(({ s, t }) => {
    // phase 1: the world. act/stage rebuild the strip and reposition everyone.
    const base = { seed: 1337, heat: 'spicy', freeze: 0, clear: 1, t };
    if (s.act != null) { base.act = s.act; base.stage = s.stage || 0; }
    brawlDebug(base);
    // phase 2: the cast, at exact world x/depth rather than spawnCup's dice.
    const p = { t, iT: 0, freeze: 0 };
    if (s.cups) {
      p.place = s.cups.map(([kind, dx, d], i) => ({
        kind, x: brawl.cam + dx, d, face: -1, hp: s.hp1 && i === 0 ? 1 : undefined,
      }));
      p.locked = 1;
    }
    if (s.at) p.at = [brawl.cam + s.at[0], s.at[1]];
    if (s.pst) { p.pst = s.pst; p.pstT = s.pstT; }
    if (s.meter != null) p.meter = s.meter;
    if (s.weapon != null) p.weapon = s.weapon;
    if (s.rage != null) p.rage = s.rage;
    if (s.walk != null) p.walk = s.walk;
    if (s.face != null) p.face = s.face;
    if (s.hearts != null) p.hearts = s.hearts;
    if (s.crowdHype != null) p.crowdHype = s.crowdHype;
    brawlDebug(p);
    // phase 3: the clock. `steps` runs the real sim so a hit has consequences.
    if (s.steps) brawlDebug({ steps: s.steps, stepDt: 1 / 60 });
    // phase 4: the screens, last — they override the phase the stage jump set.
    const fin = { freeze: 1 };
    if (s.phase) {
      fin.phase = s.phase;
      if (s.cut) fin.cut = s.cut;
      if (s.li != null) fin.li = s.li;
      if (s.mapT != null) fin.mapT = s.mapT;
      if (s.endT != null) fin.endT = s.endT;
      if (s.heatSel != null) fin.heatSel = s.heatSel;
    }
    return brawlDebug(fin);
  }, { s: scene, t });
}

// THE CAPTURE. The world buffer, at world resolution, with no DOM and no
// resampling in the path. `brawl` is a top-level const in a classic script, so
// it is a global BINDING and not a property of window — same rule §4 of the hall
// handoff records for HallArt, and the reason this reads `brawl` bare.
async function shotBuffer(page) {
  const url = await page.evaluate(() => brawl.cv.toDataURL('image/png'));
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

// A frozen game is not a game. Unfreeze, measure real frames, freeze again.
async function fps(page, ms = 1600) {
  await page.evaluate(() => brawlDebug({ freeze: 0 }));
  const v = await page.evaluate((ms) => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else resolve(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
    };
    requestAnimationFrame(tick);
  }), ms);
  await page.evaluate(() => brawlDebug({ freeze: 1 }));
  return v;
}

// The belt band: the horizontal slice a fighter's body actually occupies. On a
// 200px-tall world the cast is a few percent of the frame, so a whole-frame
// average is blind to almost everything a character round does — the §19 lesson
// from region.js, one game over. ground is 124 at this viewport; a cup stands
// from about ground-18 to ground+34 once depth is counted.
const BAND = (ground) => [0, ground - 22, WORLD_W, 60];

module.exports = {
  openBrawl, pose, shotBuffer, fps, SCENES, BASE, requirePlaywright,
  VW, VH, WORLD_W, WORLD_H, T, BAND,
};
