// blender/tools/botsshoot.js — the FOURTH harness: measurement shots for
// 🤖 BATTEREDBOTS (js/bots.js, mode `bots`).
//
// Why a fourth. hallharness drives a 3D camera around a WebGL hall;
// brawlharness steps a canvas-2D fighter at a fixed timestep; fortuneshoot
// pins a wheel game's state. BatteredBots is a WebGL 2D arena whose frame is
// a function of SIM STATE (deterministic, seeded) plus FX state (particles,
// lights, decals). So a scene here = start a seeded match, step the sim a
// known number of frames, inject the named FX event, freeze, render, shoot
// the GL canvas via botsDebug.snap() (rendered on demand — no
// preserveDrawingBuffer). The same seed gives the same frame on any machine,
// which is the whole point of the shared sim.
//
//   node blender/tools/botsshoot.js [--url http://127.0.0.1:8123/index.html]
//        [--out blender/tools/_shots/bots] [--tier high|med|low] [--scene name]
//
// Metrics per scene (same lenses as brawlshoot): mean luma, luma sd, `flat`
// (adjacent identical-luma pairs, %), `blown` (luma > 250, %), `dark`
// (luma < 8, %). Crops decide; the numbers only point.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { decode: decodePNG } = require('./png.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://127.0.0.1:8123/index.html');
const OUT = opt('out', path.join(__dirname, '_shots', 'bots'));
const TIER = opt('tier', 'high');
const ONLY = opt('scene', null);
fs.mkdirSync(OUT, { recursive: true });

// name → { arena, frames (sim steps after the drop), clock?, events[] , note }
const SCENES = {
  '01-empty':    { arena: 'pit',   frames: 0,   clock: 180, ev: [], note: 'the pit before the buzzer — lamps, floor pages, crowd' },
  '02-drive':    { arena: 'pit',   frames: 240, clock: 176, ev: [], note: 'four seconds in: skids, first pads live' },
  '03-contact':  { arena: 'pit',   frames: 240, ev: [{ k: 'spark', x: 300, y: 170, n: 18, big: true }, { k: 'hit', id: 'me', by: 'ai0', x: 300, y: 170, dmg: 22, cause: 'spinner' }], note: 'a spinner hit: sparks + crumbs + plate, the impact light' },
  '04-fire':     { arena: 'pit',   frames: 240, ev: Array.from({ length: 30 }, (_, i) => ({ k: 'fire', x: 400 + (i % 6) * 3, y: 150 + Math.floor(i / 6) * 3 })), note: 'a burning bot lights the floor' },
  '05-boom':     { arena: 'pit',   frames: 240, ev: [{ k: 'boom', x: 320, y: 210, r: 36, w: 'rocket' }], note: 'the rocket: ring, smoke, scorch decal, the flash' },
  '06-pitopen':  { arena: 'pit',   frames: 300, clock: 100, ev: [], note: 'the grate slid aside; hazards armed' },
  '07-sudden':   { arena: 'pit',   frames: 300, clock: 28,  ev: [], note: 'sudden death: hot clock' },
  '08-fryer':    { arena: 'fryer', frames: 300, clock: 140, ev: [], note: 'THE FRYER: cold light, baskets telegraphing' },
  '09-sump':     { arena: 'sump',  frames: 300, clock: 40,  ev: [], note: 'THE SUMP knee-deep: ripples steal the normals' },
  '10-flood':    { arena: 'sump',  frames: 300, clock: 12,  ev: [], note: 'flooded: lamps dead, headlights only' },
  '11-storm':    { arena: 'sump',  frames: 300, clock: 9,   ev: [{ k: 'storm' }], note: 'the storm passes under the grating — gold from below' },
  '12-ko':       { arena: 'pit',   frames: 240, ev: [{ k: 'ko', id: 'ai1', by: 'me', x: 330, y: 190, cause: 'spinner' }], note: 'the KO: punch-in, plates, smoke, the crowd jumps' },
};

function metrics(png) {
  const { w, h, channels, data } = png; // png.decode → { w, h, channels, data }
  const ch = channels || 4;
  let sum = 0, sum2 = 0, flat = 0, pairs = 0, blown = 0, dark = 0, n = w * h;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    const l = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    sum += l; sum2 += l * l;
    if (l > 250) blown++; if (l < 8) dark++;
    if (i % w) { pairs++; if (Math.round(l) === Math.round(prev)) flat++; }
    prev = l;
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { mean: +mean.toFixed(1), sd: +sd.toFixed(1), flat: +(flat / pairs * 100).toFixed(1), blown: +(blown / n * 100).toFixed(3), dark: +(dark / n * 100).toFixed(1) };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate((t) => { localStorage.setItem('nugHallQuality', t); localStorage.setItem('botsLast', 'league'); }, TIER);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); startStorm(1000000, 5000); setStormMode('bots'); });
  await page.waitForTimeout(500);
  // wait for the Blender pages (they arrive async); shoot the procedural stand-ins if they never do
  await page.waitForFunction(() => botsDebug.state().art && botsDebug.state().floorArt, null, { timeout: 15000 }).catch(() => console.log('(art did not arrive — shooting the stand-ins)'));
  const rows = [];
  for (const [name, sc] of Object.entries(SCENES)) {
    if (ONLY && name.indexOf(ONLY) < 0) continue;
    await page.evaluate((sc) => {
      botsDebug.freeze(false);
      botsDebug.start('league', 'dicer', sc.arena);
      const m = botsDebug.match();
      // deterministic: the harness owns the seed
      m.seed = 1234; m.rng = BotsSim.mulberry(1234);
      // through the drop, then the requested frames of fight with the AI driving
      botsDebug.step(Math.ceil(BotsSim.DROP_SECS * 60) + 2);
      if (sc.frames) botsDebug.step(sc.frames, { dx: 0.6, dy: 0.2, ax: 1, ay: 0, ad: 120, fire: false, spec: true, nitro: false });
      if (sc.clock != null) { botsDebug.clock(sc.clock); botsDebug.step(30); }
      for (const e of sc.ev) botsDebug.event(e);
      bots.fx.parts.forEach(() => {}); // particles spawned; let a few frames of FX run
      botsDebug.freeze(true);
    }, sc);
    // let the render loop draw ~10 frames of FX with the sim frozen (particles still move)
    await page.waitForTimeout(180);
    const dataUrl = await page.evaluate(() => botsDebug.snap());
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const file = path.join(OUT, name + '.png');
    fs.writeFileSync(file, buf);
    const m = metrics(decodePNG(buf));
    rows.push({ name, ...m, note: sc.note });
    console.log(name.padEnd(12), 'mean', String(m.mean).padStart(5), 'sd', String(m.sd).padStart(5), 'flat', String(m.flat).padStart(5), 'blown', String(m.blown).padStart(6), 'dark', String(m.dark).padStart(5), ' ', sc.note);
  }
  fs.writeFileSync(path.join(OUT, '_table.json'), JSON.stringify({ tier: TIER, when: new Date().toISOString(), rows }, null, 2));
  console.log('errors', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error('botsshoot FAIL', e); process.exit(1); });
