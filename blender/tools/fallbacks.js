// blender/tools/fallbacks.js — PROVE THE DEGRADE PATHS STILL DRAW A ROOM.
//
//   node blender/tools/fallbacks.js
//
// The house rule (handoff §1.5): every call site keeps its procedural
// fallback, and the page must degrade to the OLD art — never to invisible,
// never to black. That rule is only worth anything if something checks it, and
// until now nothing did: each renderer seam was verified by hand, once, in the
// session that added it.
//
// This walks the whole matrix in one run and fails loudly on the two things
// that actually go wrong — a frame that came back black, and a shader that
// failed to compile and took its geometry with it.

const fs = require('fs');
const path = require('path');
const { openHall, stand, shotBuffer, fps, SPOTS } = require('./hallharness');
const { decode, stats, diff } = require('./png');

// Warnings a degraded path is SUPPOSED to print. Anything else is a real fault.
const EXPECTED = [
  /no ceiling ribs/i,          // no-mesh: the flat ceiling is the fallback
  /bloom unavailable/i,        // no FBO at all: render direct
  /no float target/i,          // no half-float: the 8-bit post chain
  /material shader failed/i,   // WebGL2 link failure: the flat renderer
  // Advisory, not a fault: upload() shouts from 62000 vertices up so the next
  // person to add geometry meets the 16-bit ceiling before the black spikes do.
  // It fires on every path by design — see AGENTS.md, THE GRIME.
  /left before this buffer needs 32-bit/i,
];

// Two spots: one deep in the hall (all the material work) and one on the
// street (sky, wet ground, fog). A seam that only breaks outdoors has shipped.
//
// 17-regular ADDED with THE CAST (§17), and for the reason this file exists:
// the `no-cast` seam degrades the five REGULARS, and not one of the three spots
// above has a regular in it. The seam would have diffed at ~0.0% and been
// reported as a seam that never fired — a true statement about these spots and
// a completely false one about the change. §15, verbatim, one more time: a spot
// table only measures what it points at.
const CHECK = ['03-westwall', '11-gta', '15-pier', '17-regular'];

const MATRIX = [
  { name: 'shipped', off: [] },
  { name: 'no-hdr', off: ['hdr'], why: 'no EXT_color_buffer_half_float: 8-bit post + shoulder' },
  { name: 'no-pbr', off: ['pbr'], why: 'WebGL2 material shader failed to link' },
  { name: 'no-shadows', off: ['shadows'], why: 'depth FBO refused' },
  { name: 'no-sky', off: ['sky'], why: 'the void the hall shipped with' },
  { name: 'no-lens', off: ['lens'], why: 'no vignette/aberration/grain/idle breath' },
  { name: 'no-msaa', off: ['msaa'], why: 'driver refuses a multisampled RGBA16F: the aliased frame' },
  { name: 'no-city', off: ['city'], why: 'skyline panorama never decoded: the hashed ridge' },
  { name: 'no-hallart', off: ['art'], why: 'the paint sheet never decoded' },
  { name: 'no-maps', off: ['maps'], why: 'normal/ORM pages never decoded' },
  { name: 'no-mesh', off: ['mesh'], why: 'Blender geometry never decoded: procedural boxes' },
  { name: 'no-cast', off: ['cast'], why: 'articulated parts missing: the regulars go rigid, not headless' },
  { name: 'no-anything', off: ['hdr', 'pbr', 'shadows', 'sky', 'lens', 'city', 'msaa', 'art', 'maps', 'mesh'], why: 'the 2026-08-07 hall' },
  { name: 'webgl1', off: [], webgl1: true, why: 'no WebGL2 context at all' },
];

const OUT = path.join(__dirname, '_shots', '_fallbacks');

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  const ref = {};      // the shipped frame per spot, to diff every seam against
  let bad = 0;

  for (const m of MATRIX) {
    const dir = path.join(OUT, m.name);
    fs.mkdirSync(dir, { recursive: true });
    let ctx = null;
    try {
      ctx = await openHall({ w: 900, h: 560, off: m.off, webgl1: m.webgl1 });
      const info = await ctx.page.evaluate(() => {
        const H = NuggetArcade._H;
        return {
          gl2: !!(H.gl && H.gl.getParameter && typeof WebGL2RenderingContext !== 'undefined'
            && H.gl instanceof WebGL2RenderingContext),
          pbr: !!H.pbr, hdr: !!(H.post && H.post.hdr), post: H.post !== false,
        };
      });
      for (const name of CHECK) {
        const spot = SPOTS.find((s) => s.name === name);
        await stand(ctx.page, spot);
        const buf = await shotBuffer(ctx.page);
        fs.writeFileSync(path.join(dir, name + '.png'), buf);
        const img = decode(buf);
        const st = stats(img);
        if (m.name === 'shipped') ref[name] = img;
        // "Black" is not dead==100: a broken hall usually comes back as the
        // clear colour plus a couple of sprites. Anything this dark is broken.
        const black = st.mean < 4 || st.dead > 75;
        // ...and a fallback that renders the SAME FRAME as shipped is a seam
        // that never fired, which is the failure this matrix missed first time.
        const changed = ref[name] ? diff(img, ref[name]) : 0;
        if (black) bad++;
        rows.push({
          mode: m.name, spot: name, ...st, hist: undefined,
          changed, broken: black, ...info,
        });
      }
      // Inertness is judged per MODE, not per spot: `no-sky` legitimately
      // changes nothing on a wall deep inside the hall with no sky in frame.
      // A seam is only inert if it fails to move ANY of the checked views.
      if (m.name !== 'shipped') {
        const mine = rows.filter((r) => r.mode === m.name);
        if (mine.length && mine.every((r) => r.changed < 0.5)) {
          bad++;
          mine.forEach((r) => { r.inert = true; });
        }
      }
      const f = await fps(ctx.page, 1200);
      rows.filter((r) => r.mode === m.name).forEach((r) => { r.fps = f; });
      const errs = [...new Set(ctx.errors)]
        .filter((e) => !/CORS|ERR_FAILED|GSI_LOGGER|403|leaderboard/i.test(e))
        .filter((e) => !EXPECTED.some((rx) => rx.test(e)));
      if (errs.length) {
        bad++;
        rows.filter((r) => r.mode === m.name).forEach((r) => { r.err = errs[0].slice(0, 90); });
      }
    } catch (e) {
      bad++;
      rows.push({ mode: m.name, spot: '-', mean: 0, dead: 100, broken: true, err: String(e).slice(0, 90) });
    } finally {
      if (ctx) await ctx.browser.close();
    }
  }

  const num = (v, n = 7) => String((v === undefined ? 0 : v).toFixed(2)).padStart(n);
  console.log(`\n  ${'mode'.padEnd(14)}${'spot'.padEnd(14)}${'mean'.padStart(7)} ${'dead'.padStart(7)} ${'chg%'.padStart(7)} ${'fps'.padStart(6)}  gl2 pbr hdr   verdict`);
  for (const r of rows) {
    console.log(`  ${r.mode.padEnd(14)}${String(r.spot).padEnd(14)}${num(r.mean)} ${num(r.dead)} ${num(r.changed || 0)} ${num(r.fps || 0, 6)}  `
      + `${r.gl2 ? ' y ' : ' n '} ${r.pbr ? ' y ' : ' n '} ${r.hdr ? ' y ' : ' n '}   `
      + (r.broken ? 'BLACK' : r.inert ? 'SEAM DID NOTHING' : 'ok') + (r.err ? '  ' + r.err : ''));
  }
  fs.writeFileSync(path.join(OUT, 'fallbacks.json'), JSON.stringify(rows, null, 2));
  console.log(`\n  ${bad ? bad + ' PROBLEM(S)' : 'all paths draw a room'}   -> ${path.relative(process.cwd(), OUT)}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
