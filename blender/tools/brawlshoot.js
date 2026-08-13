// blender/tools/brawlshoot.js — the 21-scene table for BATTERED BRAWLERS.
//
//   node blender/tools/brawlshoot.js --tag baseline
//   CROP_PIXEL=1 python blender/tools/crop.py sheet baseline
//   CROP_PIXEL=1 python blender/tools/crop.py ab baseline parallax
//
// shoot.js's hall equivalent reports dead/near/blown/mean/chroma/hard per camera
// spot. Same columns here, because they are the columns that have moved
// decisions, plus two this game needs that the hall did not:
//
//   BAND   the same statistics over the belt band alone — the horizontal slice
//          the cast actually stands in. On a 200px world a fighter is a couple
//          of percent of the pixels, so a frame average cannot see a character
//          change at all (region.js §19, one game over).
//   flat   the fraction of adjacent pixel pairs that are IDENTICAL. This game
//          is 185 fillRect calls; large dead-flat areas are its characteristic
//          failure, and no histogram statistic can see one. It is the same
//          argument png.staircase() was added for, pointing the other way:
//          staircase counts hard edges, flat counts the absence of any edge.

const fs = require('fs');
const path = require('path');
const { openBrawl, pose, shotBuffer, fps, SCENES, BAND, PROFILE } = require('./brawlharness');
const { decode, stats, chroma, staircase, luma } = require('./png');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const has = (n) => process.argv.includes('--' + n);

const TAG = arg('tag', 'b-base');
const ONLY = arg('only', '');
const OUT = path.join(__dirname, '_shots', TAG);

// _shots is a shared scratch namespace and the hall got there first. The first
// run of this file wrote 21 scenes into `baseline`, which is shoot.js's own tag,
// and the contact sheet came back as a kitchen wall next to the arcade's neon —
// plus one clobbered stats.json. So: refuse a tag that already holds someone
// else's shots, and default to a b- prefix.
function guardTag() {
  if (!fs.existsSync(OUT)) return;
  const mine = new Set(SCENES.map((s) => s.name + '.png'));
  const theirs = fs.readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('_') && !mine.has(f));
  if (theirs.length) {
    throw new Error(`_shots/${TAG} already holds ${theirs.length} shot(s) that are not brawl scenes`
      + ` (${theirs.slice(0, 3).join(', ')}…). Pick another --tag; brawl tags start with "b-".`);
  }
}

// Percentage of adjacent pixel pairs with IDENTICAL luma. A flat fill reads 100.
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

(async () => {
  guardTag();
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await openBrawl();
  const rows = [];
  const list = ONLY ? SCENES.filter((s) => s.name.includes(ONLY)) : SCENES;
  if (!list.length) throw new Error('no scene matches --only ' + ONLY);

  console.log('\n  world ' + PROFILE.w + 'x' + PROFILE.h + '  (BRAWL_WORLD='
    + (process.env.BRAWL_WORLD || 'std') + ', viewport ' + PROFILE.vw + 'x' + PROFILE.vh
    + ', aspect ' + (PROFILE.w / PROFILE.h).toFixed(2) + ')');
  const f = has('fps') ? await fps(page) : null;
  if (f != null) console.log('  fps ' + f + ' (frozen game unfrozen for 1.6s)');

  console.log('\n  scene           dead   near  blown   mean     sd chroma   hard   flat |'
    + '  BAND mean  chroma   hard   flat');
  for (const s of list) {
    const state = await pose(page, s);
    const buf = await shotBuffer(page);
    fs.writeFileSync(path.join(OUT, s.name + '.png'), buf);
    const img = decode(buf);
    const st = stats(img);
    const band = cropBox(img, BAND(state.ground));
    const bst = stats(band);
    const row = {
      name: s.name, phase: state.phase, act: state.act, stage: state.stage,
      dead: st.dead, near: st.near, blown: st.blown, mean: st.mean, sd: st.sd,
      chroma: chroma(img), hard: staircase(img), flat: flatness(img),
      bandMean: bst.mean, bandChroma: chroma(band), bandHard: staircase(band), bandFlat: flatness(band),
      enemies: state.enemies.length, cam: state.cam, w: img.w, h: img.h,
    };
    rows.push(row);
    console.log('  ' + s.name.padEnd(14)
      + [st.dead, st.near, st.blown].map((v) => v.toFixed(2).padStart(6)).join(' ')
      + [st.mean, st.sd, row.chroma, row.hard, row.flat].map((v) => v.toFixed(1).padStart(7)).join('')
      + ' |' + [row.bandMean, row.bandChroma, row.bandHard, row.bandFlat].map((v) => v.toFixed(1).padStart(8)).join(''));
  }

  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  console.log('\n  MEAN of ' + rows.length + '   dead ' + mean('dead').toFixed(2)
    + '  near ' + mean('near').toFixed(2) + '  mean ' + mean('mean').toFixed(1)
    + '  chroma ' + mean('chroma').toFixed(1) + '  hard ' + mean('hard').toFixed(1)
    + '  flat ' + mean('flat').toFixed(1)
    + '  | band mean ' + mean('bandMean').toFixed(1) + '  flat ' + mean('bandFlat').toFixed(1));

  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({ tag: TAG, fps: f, rows }, null, 1));
  if (errors.length) console.log('\n  PAGE ERRORS:\n   ' + [...new Set(errors)].slice(0, 12).join('\n   '));
  console.log('\n  ' + path.relative(process.cwd(), OUT)
    + '\n  now look at it:  CROP_PIXEL=1 python blender/tools/crop.py sheet ' + TAG + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
