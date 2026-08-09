// blender/tools/tune.js — SWEEP THE DIALS IN ONE BROWSER SESSION.
//
//   node blender/tools/tune.js --dial emisGain --values 2.2,2.8,3.4,4.0
//   node blender/tools/tune.js --grid emisGain=2.4,3.0,3.6 bloomAmt=0.30,0.46
//   node blender/tools/tune.js --dial emisGain --values 2.6,3.2 --spots 01-entrance,06-scoreboard
//
// Writes blender/tools/_shots/_tune/<dial>=<value>/<spot>.png and a comparison
// sheet per spot, so the choice is made by looking at the same wall four ways
// instead of by editing a constant and reloading.
//
// WHY: ACT I's first tuning pass was edit -> reload -> 16-spot run, ~90s a
// round, for a value that interacts with three other values. The interesting
// region is a box, not a line: raise the emissive gain and the bloom threshold
// wants to move, which moves what the saturation should be. Poking
// NuggetArcade._TUNE between frames turns an afternoon into two minutes.
//
// The dials (see TUNE in js/arcade.js): emisGain glowGain bloomAmt
// bloomThresh bloomKnee exposure sat.

const fs = require('fs');
const path = require('path');
const { openHall, stand, shotBuffer, SPOTS } = require('./hallharness');
const { decode, stats, chroma } = require('./png');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : def;
}
function argList(name) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++)
    out.push(process.argv[j]);
  return out;
}

const OUT = path.join(__dirname, '_shots', '_tune');
// The four spots that have actually caught a bad dial: a marquee with text on
// it, a scoreboard with text on it, a wall of neon, and the street.
const DEFAULT_SPOTS = '01-entrance,06-scoreboard,03-westwall,11-gta';

(async () => {
  // Either --dial X --values a,b,c  or  --grid k=a,b k2=c,d
  const combos = [];
  const grid = argList('grid');
  if (grid.length) {
    const axes = grid.map((g) => {
      const [k, v] = g.split('=');
      return [k, v.split(',').map(Number)];
    });
    const walk = (i, acc) => {
      if (i === axes.length) { combos.push({ ...acc }); return; }
      for (const v of axes[i][1]) walk(i + 1, { ...acc, [axes[i][0]]: v });
    };
    walk(0, {});
  } else {
    const dial = arg('dial');
    if (!dial) throw new Error('need --dial <name> --values a,b,c   (or --grid k=a,b ...)');
    for (const v of arg('values', '').split(',').filter(Boolean))
      combos.push({ [dial]: Number(v) });
  }
  if (!combos.length) throw new Error('no combinations');

  const names = arg('spots', DEFAULT_SPOTS).split(',').map((s) => s.trim());
  const list = SPOTS.filter((s) => names.includes(s.name));
  if (!list.length) throw new Error('no matching spots');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const { browser, page } = await openHall({ w: 1280, h: 760 });
  const hdr = await page.evaluate(() => !!(NuggetArcade._H.post && NuggetArcade._H.post.hdr));
  if (!hdr) console.warn('  !! no float target — these dials do nothing on the 8-bit path');

  const table = [];
  for (const combo of combos) {
    const label = Object.entries(combo).map(([k, v]) => `${k}=${v}`).join(',');
    const dir = path.join(OUT, label.replace(/[^\w=.,-]/g, '_'));
    fs.mkdirSync(dir, { recursive: true });
    await page.evaluate((c) => { Object.assign(NuggetArcade._TUNE, c); }, combo);
    for (const spot of list) {
      await stand(page, spot);
      const buf = await shotBuffer(page);
      fs.writeFileSync(path.join(dir, spot.name + '.png'), buf);
      const img = decode(buf);
      const st = stats(img);
      table.push({ combo: label, spot: spot.name, ...st, hist: undefined, chroma: chroma(img) });
    }
  }
  await browser.close();

  const num = (v) => String(v.toFixed(2)).padStart(7);
  let last = null;
  console.log(`\n  ${'combo'.padEnd(28)}${'spot'.padEnd(15)}${'dead'.padStart(7)} ${'near'.padStart(7)} ${'blown'.padStart(7)} ${'mean'.padStart(7)} ${'chroma'.padStart(7)}`);
  for (const r of table) {
    const c = r.combo === last ? '' : r.combo; last = r.combo;
    console.log(`  ${c.padEnd(28)}${r.spot.padEnd(15)}${num(r.dead)} ${num(r.near)} ${num(r.blown)} ${num(r.mean)} ${num(r.chroma)}`);
  }
  fs.writeFileSync(path.join(OUT, 'tune.json'), JSON.stringify(table, null, 2));
  console.log(`\n  -> ${path.relative(process.cwd(), OUT)}   (python blender/tools/crop.py tunesheet to compare)`);
})().catch((e) => { console.error(e); process.exit(1); });
