// blender/tools/shoot.js — THE DARKNESS HARNESS.
//
//   node blender/tools/shoot.js --tag baseline
//   node blender/tools/shoot.js --tag act1-hdr --off sky,shadows
//   node blender/tools/shoot.js --tag quick --spots 01-entrance,07-street
//
// Stands at ten fixed spots, pins the clock, screenshots the CANVAS (not the
// page), and reports dead / near-dead / blown / mean / sd / chroma per spot and
// for the run. Writes PNGs + a stats.json to blender/tools/_shots/<tag>/.
//
// THE RULE THIS EXISTS FOR (handoff §1): "measure before painting". Two
// sessions have shipped a change that was invisible and one shipped a change
// that was brighter and WORSE. Only same-harness deltas mean anything — the
// absolute numbers are not comparable across spot-table revisions.
//
// It also prints where the camera ACTUALLY ended up, because the hall's
// collision solver silently walks a bad spot back inside and a run then
// photographs the cabinets while claiming to shoot the street.

const fs = require('fs');
const path = require('path');
const { openHall, stand, shotBuffer, fps, SPOTS, SEAMS } = require('./hallharness');
const { decode, stats, chroma } = require('./png');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : def;
}

const TAG = arg('tag', 'run');
const OFF = arg('off', '').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = arg('spots', '').split(',').map((s) => s.trim()).filter(Boolean);
const W = +arg('w', 1280), H = +arg('h', 760);
const OUT = path.join(__dirname, '_shots', TAG);

(async () => {

  fs.mkdirSync(OUT, { recursive: true });

  const { browser, page, errors } = await openHall({ w: W, h: H, off: OFF, webgl1: !!arg('webgl1', '') });
  const list = ONLY.length ? SPOTS.filter((s) => ONLY.includes(s.name)) : SPOTS;
  const rows = [];

  for (const spot of list) {
    await stand(page, spot);
    const actual = await page.evaluate(() => {
      const H = NuggetArcade._H;
      return { x: +H.cam.x.toFixed(2), z: +H.cam.z.toFixed(2), yaw: +H.cam.yaw.toFixed(2) };
    });
    const buf = await shotBuffer(page);
    fs.writeFileSync(path.join(OUT, spot.name + '.png'), buf);
    const img = decode(buf);
    const st = stats(img);
    const drift = Math.hypot(actual.x - spot.x, actual.z - spot.z);
    rows.push({
      name: spot.name, ...st, hist: undefined,
      chroma: chroma(img), drift: +drift.toFixed(2), actual,
    });
    if (drift > 0.35) console.warn(`  !! ${spot.name}: collision moved the camera ${drift.toFixed(2)}m — spot is inside geometry`);
  }

  const framerate = await fps(page);
  await browser.close();

  const agg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const summary = {
    tag: TAG, off: OFF, w: W, h: H, fps: framerate, spots: rows.length,
    dead: +agg('dead').toFixed(2), near: +agg('near').toFixed(2),
    blown: +agg('blown').toFixed(2), mean: +agg('mean').toFixed(2),
    sd: +agg('sd').toFixed(2), chroma: +agg('chroma').toFixed(2),
    errors: [...new Set(errors)].slice(0, 25),
  };
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({ summary, rows }, null, 2));

  const pad = (s, n) => String(s).padEnd(n);
  const num = (v, n = 7) => String(v.toFixed(2)).padStart(n);
  console.log(`\n  ${pad('spot', 15)}${'dead'.padStart(7)} ${'near'.padStart(7)} ${'blown'.padStart(7)} ${'mean'.padStart(7)} ${'sd'.padStart(7)} ${'chroma'.padStart(7)}`);
  for (const r of rows) console.log(`  ${pad(r.name, 15)}${num(r.dead)} ${num(r.near)} ${num(r.blown)} ${num(r.mean)} ${num(r.sd)} ${num(r.chroma)}`);
  console.log(`  ${pad('-'.repeat(15), 15)}${'-'.repeat(48)}`);
  console.log(`  ${pad('ALL (' + TAG + ')', 15)}${num(summary.dead)} ${num(summary.near)} ${num(summary.blown)} ${num(summary.mean)} ${num(summary.sd)} ${num(summary.chroma)}`);
  console.log(`\n  fps ${framerate}   seams off: ${OFF.join(',') || '(none)'}   -> ${path.relative(process.cwd(), OUT)}`);
  if (summary.errors.length) {
    console.log('\n  console:');
    for (const e of summary.errors) console.log('   ' + e.slice(0, 160));
  }
})().catch((e) => { console.error(e); process.exit(1); });
