// blender/tools/fortuneshoot.js — the scene table for 🎡 REEL OF FORTUNE.
//
//   node blender/tools/fortuneshoot.js --tag f-base
//   CROP_PIXEL=1 python blender/tools/crop.py sheet f-base
//   CROP_PIXEL=1 python blender/tools/crop.py ab f-base f-round1
//
// Third harness in the kit (hall / brawl / this), and for the same reason the
// second one exists: none of the others can see this game. Fortune is a canvas
// 2D wheel game whose whole world is ~427x240; it has no camera to teleport and
// no acts to stage. What transfers is png.js and crop.py, plus the brawl kit's
// three paid-for lessons:
//
//  1. READ THE CANVAS BUFFER, not the screen — the storm pill and the banner
//     are DOM on top of it. (--page ALSO grabs a real page screenshot per
//     scene, because the banner and the compact HUD are part of this game's
//     composition and a buffer shot cannot see them. Know which one you are
//     looking at.)
//  2. PIN THE DICE. The game itself is RNG-free by design; the confetti is
//     not. Math.random is seeded (mulberry32) before every scene.
//  3. FREEZE. fortuneDebug.freeze() holds state while the draw keeps running,
//     so setup and capture cannot drift — a charging meter ping-pongs at
//     0.9Hz and would never photograph the same twice otherwise.
//
// Scenes drive the REAL handlers via fortuneDebug (land/guess/setPuzzle), so a
// scene is also a smoke test: a page error or a wrong phase fails the run.
//
// Columns are the kit's standard eight, plus WHEEL and BOARD region stats —
// on a 427x240 frame the wheel is ~15% of the pixels and the board ~20%, and a
// frame average cannot see either change (region.js §19 lesson).
//
// Requires a static server on :8787 at the REPO ROOT and playwright resolvable
// (npm i playwright in a scratchpad, then PW_PATH=<that>/node_modules).

const fs = require('fs');
const path = require('path');
const { decode, stats, chroma, staircase, luma } = require('./png');

function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  const extra = process.env.PW_PATH;
  if (extra) { try { return require(path.join(extra, 'playwright')); } catch (e) { /* noop */ } }
  throw new Error('playwright not found. `npm i playwright` somewhere, then set PW_PATH=<that>/node_modules');
}

const BASE = process.env.HALL_URL || 'http://localhost:8787/';

// Two viewport profiles, because scale = floor(vh/230) means the viewport sets
// the SHAPE of the world (brawl round 5's lesson). std is what a 4K panel
// fullscreen resolves to (2160/9 = 240 world px tall); big is a 1080 window.
const PROFILES = {
  std: { vw: 1280, vh: 720 },   // scale 3 → world 427x240
  big: { vw: 1920, vh: 1080 },  // scale 4 → world 480x270
};
const PROFILE = PROFILES[process.env.FORTUNE_WORLD || 'std'] || PROFILES.std;

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const has = (n) => process.argv.includes('--' + n);

const TAG = arg('tag', 'f-base');
const ONLY = arg('only', '');
const OUT = path.join(__dirname, '_shots', TAG);

// Every scene body runs in the page with the dice seeded and freeze OFF, then
// the shooter freezes, waits two frames, and reads the buffer. `t` is pinned
// per scene so time-driven cosmetics (bulb chase, shimmer) photograph stable.
const SCENES = [
  { name: 'idle', t: 3.0, run: `fortuneDebug.setPuzzle(0);` },
  { name: 'charging', t: 4.2, run: `fortuneDebug.setPuzzle(0); fortuneDebug.set({phase:'charging', power:0.72, chargeT:0.79});` },
  { name: 'spinning', t: 5.1, run: `fortuneDebug.setPuzzle(0); fortuneDebug.set({phase:'spinning', vel:6.5, angle:2.31});` },
  { name: 'guess-100', t: 6.0, run: `fortuneDebug.setPuzzle(0); fortuneDebug.land(14);` },
  { name: 'guess-swirl', t: 6.5, run: `fortuneDebug.setPuzzle(0); fortuneDebug.land(8);` },
  {
    name: 'mid-round', t: 8.0, run: `
    fortuneDebug.setPuzzle(0);
    fortuneDebug.land(0); fortuneDebug.guess('T');
    fortuneDebug.land(6); fortuneDebug.guess('S');
    fortuneDebug.land(2); fortuneDebug.guess('X');
    fortuneDebug.land(9);`,
  },
  {
    // `post` runs after t is pinned — the celebration scenes re-pin t just
    // after their own FX stamp, or the shot is of a party three seconds over.
    name: 'solved', t: 10.0, post: `fortuneDebug.set({t: fortune.solveT0 + 0.7})`, run: `
    fortuneDebug.setPuzzle(1); // LEAVE IT A DOOR
    for (const ch of 'LEAVITDOR') { fortuneDebug.land(0); if (fortuneDebug.state().phase === 'guess') fortuneDebug.guess(ch); }`,
  },
  {
    name: 'jackpot', t: 12.0, post: `fortuneDebug.set({t: fortune.jackT0 + 1.1})`, run: `
    fortuneDebug.setPuzzle(1);
    fortuneDebug.land(8); fortuneDebug.guess('L'); // swirl banked
    for (const ch of 'EAVITDOR') { fortuneDebug.land(0); if (fortuneDebug.state().phase === 'guess') fortuneDebug.guess(ch); }`,
  },
  {
    // jackT0 cleared: pinning t backward would re-arm the PREVIOUS scene's
    // jackpot rings (in real play t only moves forward — harness-only hazard)
    name: 'bankrupt', t: 14.0, post: `fortuneDebug.set({t: fortune.shakeT0 + 0.16, jackT0: -9, solveT0: -9})`, run: `
    fortuneDebug.setPuzzle(0);
    fortuneDebug.land(0); fortuneDebug.guess('T');
    fortuneDebug.land(4); // 💀`,
  },
];

function flatness(img) {
  const { w, h, channels: c, data } = img;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = luma(data[i * c], data[i * c + 1], data[i * c + 2]);
  let n = 0, tot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) { tot++; if (L[y * w + x] === L[y * w + x + 1]) n++; }
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) { tot++; if (L[y * w + x] === L[(y + 1) * w + x]) n++; }
  return (100 * n) / tot;
}

function cropBox(img, [x, y, w, h]) {
  const ch = img.channels;
  x = Math.max(0, x | 0); y = Math.max(0, y | 0);
  w = Math.max(1, Math.min(img.w - x, w | 0)); h = Math.max(1, Math.min(img.h - y, h | 0));
  const out = Buffer.alloc(w * h * ch);
  for (let r = 0; r < h; r++) {
    img.data.copy(out, r * w * ch, ((y + r) * img.w + x) * ch, ((y + r) * img.w + x + w) * ch);
  }
  return { w, h, channels: ch, data: out };
}

function guardTag() {
  if (!fs.existsSync(OUT)) return;
  const mine = new Set(SCENES.flatMap((s) => [s.name + '.png', s.name + '.page.png']));
  const theirs = fs.readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('_') && !mine.has(f));
  if (theirs.length) {
    throw new Error(`_shots/${TAG} already holds ${theirs.length} shot(s) that are not fortune scenes`
      + ` (${theirs.slice(0, 3).join(', ')}…). Pick another --tag; fortune tags start with "f-".`);
  }
}

(async () => {
  guardTag();
  fs.mkdirSync(OUT, { recursive: true });
  const pw = requirePlaywright();
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: PROFILE.vw, height: PROFILE.vh } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    startStorm(1e6, 5000);
    setStormMode('fortune');
  });
  await page.waitForFunction(() => window.fortuneDebug && typeof fortune !== 'undefined' && fortune.on);
  await page.evaluate(() => fortuneDebug.pickTier(0));
  await page.waitForTimeout(120);

  const rows = [];
  const list = ONLY ? SCENES.filter((s) => s.name.includes(ONLY)) : SCENES;
  if (!list.length) throw new Error('no scene matches --only ' + ONLY);

  const world = await page.evaluate(() => ({ w: fortune.W, h: fortune.Hh, scale: fortune.scale }));
  console.log('\n  world ' + world.w + 'x' + world.h + '  (FORTUNE_WORLD=' + (process.env.FORTUNE_WORLD || 'std')
    + ', viewport ' + PROFILE.vw + 'x' + PROFILE.vh + ', scale ' + world.scale + ')');

  console.log('\n  scene           dead   near  blown   mean     sd chroma   hard   flat |'
    + ' WHEEL   sd chroma  flat | BOARD   sd chroma  flat');
  for (const s of list) {
    const state = await page.evaluate(([body, t]) => {
      fortuneDebug.freeze(false);
      // pin the dice: the game is RNG-free, the confetti is not
      let seed = 0x9e3779b9;
      Math.random = () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
        return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
      };
      eval(body[0]);
      fortuneDebug.set({ t });
      if (body[1]) eval(body[1]);
      fortuneDebug.freeze(true);
      return { ...fortuneDebug.state(), hit: JSON.parse(JSON.stringify(fortune.hit)), W: fortune.W, Hh: fortune.Hh };
    }, [[s.run, s.post || ''], s.t]);
    await page.waitForTimeout(80); // two frames under freeze so the pinned draw lands
    const buf = Buffer.from((await page.evaluate(() => fortune.cv.toDataURL('image/png'))).split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, s.name + '.png'), buf);
    if (has('page')) await page.screenshot({ path: path.join(OUT, s.name + '.page.png') });
    const img = decode(buf);
    const st = stats(img);
    const wb = state.hit.wheel ? [state.hit.wheel.cx - state.hit.wheel.r, state.hit.wheel.cy - state.hit.wheel.r,
      state.hit.wheel.r * 2, state.hit.wheel.r * 2] : [0, 0, img.w, img.h];
    const bb = [img.w * 0.15, 18, img.w * 0.7, Math.max(30, (state.hit.wheel ? state.hit.wheel.cy - state.hit.wheel.r : 90) - 24)];
    const wheel = cropBox(img, wb), board = cropBox(img, bb);
    const wst = stats(wheel), bst = stats(board);
    const row = {
      name: s.name, phase: state.phase, bank: state.bank, tokens: state.tokens,
      dead: st.dead, near: st.near, blown: st.blown, mean: st.mean, sd: st.sd,
      chroma: chroma(img), hard: staircase(img), flat: flatness(img),
      wheelSd: wst.sd, wheelChroma: chroma(wheel), wheelFlat: flatness(wheel),
      boardSd: bst.sd, boardChroma: chroma(board), boardFlat: flatness(board),
      w: img.w, h: img.h,
    };
    rows.push(row);
    console.log('  ' + s.name.padEnd(14)
      + [st.dead, st.near, st.blown].map((v) => v.toFixed(2).padStart(6)).join(' ')
      + [st.mean, st.sd, row.chroma, row.hard, row.flat].map((v) => v.toFixed(1).padStart(7)).join('')
      + ' |' + [row.wheelSd, row.wheelChroma, row.wheelFlat].map((v) => v.toFixed(1).padStart(6)).join('')
      + ' |' + [row.boardSd, row.boardChroma, row.boardFlat].map((v) => v.toFixed(1).padStart(6)).join(''));
    await page.evaluate(() => fortuneDebug.freeze(false));
  }

  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  console.log('\n  MEAN of ' + rows.length + '   dead ' + mean('dead').toFixed(2)
    + '  near ' + mean('near').toFixed(2) + '  sd ' + mean('sd').toFixed(1)
    + '  chroma ' + mean('chroma').toFixed(1) + '  flat ' + mean('flat').toFixed(1)
    + '  | wheel flat ' + mean('wheelFlat').toFixed(1) + '  board flat ' + mean('boardFlat').toFixed(1));

  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({ tag: TAG, world, rows }, null, 1));
  if (errors.length) console.log('\n  PAGE ERRORS:\n   ' + [...new Set(errors)].slice(0, 12).join('\n   '));
  console.log('\n  ' + path.relative(process.cwd(), OUT)
    + '\n  now look at it:  CROP_PIXEL=1 python blender/tools/crop.py sheet ' + TAG + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
