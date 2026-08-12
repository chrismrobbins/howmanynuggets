// blender/tools/region.js — MEASURE A SURFACE, NOT A FRAME.
//
//   node blender/tools/region.js wear3 glass 03-westwall 430 240 420 300
//   node blender/tools/region.js base wear 02-aisle 300 420 680 330 --label carpet
//
// WHY THIS EXISTS, and it is the same shape of gap twice over.
//
// §16 found that every statistic in this kit was a HISTOGRAM, and that a
// histogram cannot see how colour is ARRANGED — so the hall rendered with no
// antialiasing for three sessions while every table reported a clean sweep.
// `png.staircase()` closed that one.
//
// This session hit the other axis of the same blind spot, three rounds running:
//
//   §17 THE CAST     articulated five characters. Table: FLAT. shoot.js pins
//                    the clock, so a statue and a person photograph identically.
//   §18 THE VERTICAL relief on every wall. `mean` went DOWN, because relief
//                    casts shadow — the metric moved the wrong way for a change
//                    that was plainly correct in the crop.
//   §20 THE PANE     glazed ten CRTs, two crane fronts, two shopfronts. Table:
//                    FLAT, every column inside run-to-run noise.
//
// None of those three was invisible. All three were invisible TO A NUMBER
// AVERAGED OVER A WHOLE FRAME, because the thing that changed was a few percent
// of the pixels. A frame statistic asks "is this room lit well". It cannot ask
// "did that surface get better", which is the question every art round is
// actually trying to answer.
//
// So: point it at a BOX and it reports that box's own dead / near / blown /
// mean / sd / chroma / hard, for two runs, with the delta. It reads PNGs that
// shoot.js has already written — no browser, no re-render, and it works
// retroactively on every tagged run still sitting in _shots.
//
// It does NOT replace looking at the crop. `crop.py zoom` on the same box is the
// other half, and the box coordinates are deliberately the same four numbers.

const fs = require('fs');
const path = require('path');
const { decode, stats, chroma, staircase } = require('./png');

const ROOT = path.join(__dirname, '_shots');

function crop(img, x, y, w, h) {
  const ch = img.channels;
  x = Math.max(0, Math.min(img.w - 1, x | 0));
  y = Math.max(0, Math.min(img.h - 1, y | 0));
  w = Math.max(1, Math.min(img.w - x, w | 0));
  h = Math.max(1, Math.min(img.h - y, h | 0));
  const out = Buffer.alloc(w * h * ch);
  for (let r = 0; r < h; r++) {
    img.data.copy(out, r * w * ch, ((y + r) * img.w + x) * ch, ((y + r) * img.w + x + w) * ch);
  }
  return { w, h, channels: ch, data: out };
}

function measure(tag, spot, box) {
  const p = path.join(ROOT, tag, spot + '.png');
  if (!fs.existsSync(p)) throw new Error('no shot at ' + path.relative(process.cwd(), p));
  const img = decode(fs.readFileSync(p));
  const c = box ? crop(img, box[0], box[1], box[2], box[3]) : img;
  const s = stats(c);
  return {
    dead: s.dead, near: s.near, blown: s.blown, mean: s.mean, sd: s.sd,
    chroma: chroma(c), hard: staircase(c), px: c.w * c.h, w: c.w, h: c.h,
  };
}

const argv = process.argv.slice(2);
const li = argv.indexOf('--label');
const LABEL = li > -1 ? argv[li + 1] : null;
const a = argv.filter((v, i) => v !== '--label' && (li < 0 || i !== li + 1));

if (a.length < 3) {
  console.error(`
  node blender/tools/region.js <tagA> <tagB> <spot> [x y w h] [--label name]

  Reports one BOX's own statistics in two runs, with the delta. Omit the box to
  measure the whole frame (which is what shoot.js already does for you).

  Pick the box off a crop: crop.py zoom <tag>/<spot>.png x y w h takes the same
  four numbers, so measure and look at exactly the same pixels.
`);
  process.exit(2);
}

const [tagA, tagB, spot] = a;
const box = a.length >= 7 ? a.slice(3, 7).map(Number) : null;

try {
  const A = measure(tagA, spot, box);
  const B = measure(tagB, spot, box);
  const KEYS = ['dead', 'near', 'blown', 'mean', 'sd', 'chroma', 'hard'];
  const title = LABEL || (box ? `${spot} [${box.join(' ')}]` : spot);
  console.log(`\n  ${title}   ${A.w}x${A.h} = ${A.px.toLocaleString()} px`
    + (box ? '' : '   (WHOLE FRAME — pass a box to measure a surface)'));
  console.log(`\n  ${''.padEnd(8)}${tagA.padStart(10)}${tagB.padStart(10)}${'delta'.padStart(10)}`);
  for (const k of KEYS) {
    const d = B[k] - A[k];
    const pct = Math.abs(A[k]) > 1e-9 ? ` (${d >= 0 ? '+' : ''}${(100 * d / A[k]).toFixed(1)}%)` : '';
    console.log(`  ${k.padEnd(8)}${A[k].toFixed(3).padStart(10)}${B[k].toFixed(3).padStart(10)}`
      + `${(d >= 0 ? '+' : '') + d.toFixed(3)}`.padStart(10) + pct);
  }
  // The reminder that has to be here, because this tool makes it easy to skip:
  // a number over a small box is still a number. §1 and §16 both say the crop
  // decides, and twice this session the table was the thing that was wrong.
  console.log(`\n  now look at it:  python blender/tools/crop.py zoom ${tagB}/${spot}.png`
    + (box ? ` ${box.join(' ')} 2` : '') + '\n');
} catch (e) {
  console.error('  ' + e.message);
  process.exit(1);
}
