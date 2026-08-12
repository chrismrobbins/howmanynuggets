// blender/tools/pose.js — DOES THE RIG HOLD UP THROUGH ITS CYCLE?
//
//   node blender/tools/pose.js --spot 17-regular --from 11.0 --to 12.6 --n 8 --tag peck
//   python blender/tools/crop.py strip peck
//
// WHY THIS EXISTS. Every other tool in this kit measures ONE FRAME at a PINNED
// CLOCK. That was fine while nothing in the hall had a moving part, and §16
// already recorded what the blind spot cost once: the histogram statistics
// could not see aliasing because aliasing is ARRANGEMENT, not distribution.
// This is the same argument one axis over — a pinned clock cannot see TIME.
//
// Two things it catches that nothing else here can:
//
//   1. A rig that breaks at its EXTREMES. shoot.js photographs a character at
//      t=12.5 and reports a clean frame; the peck that tears her head off her
//      neck happens at t=11.8 and no table in this repo would ever know. A pose
//      is only correct if it is correct across the whole cycle, and the middle
//      of a cycle is exactly where nothing goes wrong.
//   2. Motion that measures alive and READS wrong. motion.js proves a channel
//      is sweeping; it cannot tell you the sweep looks like a person breathing
//      rather than a balloon inflating. THE GLIDE (§16) is the standing warning
//      here: the head-bob measured fine, photographed fine in a still, and was
//      deleted on sight the moment a human watched it move.
//
// So this walks the clock and hands you the frames. It asserts nothing. Looking
// at the strip IS the test — same contract as crop.py, which is the tool that
// has actually settled arguments in this repo.

const fs = require('fs');
const path = require('path');
const { openHall, stand, shotBuffer, SPOTS } = require('./hallharness');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : def;
}

const SPOT = arg('spot', '17-regular');
// --talk <id> opens that regular's dialogue before shooting.
//
// NOT optional, and finding out why was the useful part of writing this file:
// every GESTURE in the cast — Dill tipping his brim and working the notepad,
// Gravy's lid lifting, Crumb unfolding an arm — is gated on `H.dialog.npc`,
// and `stand()` sets `H.dialog = null` on every single call. So the most
// characterful half of THE CAST could not be photographed by anything in this
// kit, at all, in any mode. A pose you cannot get the harness into is a pose
// that will regress unnoticed.
const TALK = arg('talk', '');
const T0 = +arg('from', 11.0);
const T1 = +arg('to', 12.6);
const N = +arg('n', 8);
const TAG = arg('tag', 'pose');
const W = +arg('w', 900), H = +arg('h', 620);
const OUT = path.join(__dirname, '_shots', TAG);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const { browser, page, errors } = await openHall({ w: W, h: H });

  // --look <id> frames a regular WITHOUT adding a row to SPOTS. The camera is
  // derived from that character's own hotspot `stand` and its own height, so
  // the "never invent a camera spot" rule (README, and it cost a run that
  // reported 48% dead black off the inside of a wall) still holds: the game
  // says where to stand and how tall the subject is, this only backs off far
  // enough to fit them in frame and works out the pitch.
  let spot = SPOTS.find((s) => s.name === SPOT);
  const LOOK = arg('look', '');
  if (LOOK) {
    spot = await page.evaluate((id) => {
      const EYE = 1.62;
      const n = NuggetArcade._NPCS.find((v) => v.id === id);
      if (!n) return null;
      const L = Math.hypot(n.sdx, n.sdz) || 1;
      const D = Math.max(L, 2.2);             // a 0.78m hen at 1.2m is overhead
      const x = n.x + (n.sdx / L) * D, z = n.z + (n.sdz / L) * D;
      return {
        name: id, x: x, z: z,
        yaw: Math.atan2(-(n.x - x), -(n.z - z)),
        pitch: Math.atan2(n.yBase + n.h * 0.55 - EYE, D),
      };
    }, LOOK);
    if (!spot) { console.error('no such regular: ' + LOOK); process.exit(2); }
  }
  if (!spot) {
    console.error('no such spot: ' + SPOT + '\n  ' + SPOTS.map((s) => s.name).join('\n  '));
    process.exit(2);
  }
  const times = [];
  for (let i = 0; i < N; i++) times.push(T0 + (T1 - T0) * (N === 1 ? 0 : i / (N - 1)));

  console.log('\n  spot ' + spot.name + '   t ' + T0 + ' .. ' + T1 + '  ('
    + N + ' frames)' + (TALK ? '   talking to ' + TALK : '') + '\n');
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    // stand() re-pins H.t after letting the frame loop run, which is exactly
    // what is wanted: the pose is evaluated AT this clock value, not lerped
    // toward it. Smoothed channels (gesture, armLag) will not be continuous
    // across a jump — read those with motion.js, and read SHAPE here.
    await stand(page, spot, t);
    if (TALK) {
      // Drive the real entry point — the NPC hotspot's own act() — rather than
      // assembling an H.dialog by hand: the panel's node/opts shape is dialogue
      // code's business and a hand-built one would be testing this file's idea
      // of it. The dialogue panel is DOM ON TOP of the canvas and we screenshot
      // the canvas element, so it is not in frame.
      const ok = await page.evaluate((id) => {
        const H = NuggetArcade._H;
        const n = NuggetArcade._NPCS.find((v) => v.id === id);
        if (!n) return 'no such regular';
        const h = H.hotspots.find((s) => s.kind === 'npc' && s.x === n.x && s.z === n.z);
        if (!h) return 'no hotspot';
        h.act();
        return H.dialog ? '' : 'act() did not open a dialog';
      }, TALK);
      if (ok) { console.error('  --talk ' + TALK + ': ' + ok); process.exit(2); }
      // `gesture` is dt-smoothed at ~3.4/s, so it needs real frames to ramp —
      // pinning the clock does not pin dt. Shooting immediately photographs the
      // idle pose and reports the gesture as missing.
      await page.waitForTimeout(1100);
      await page.evaluate((tt) => { NuggetArcade._H.t = tt; }, t);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    const buf = await shotBuffer(page);
    const name = String(i).padStart(2, '0') + '_t' + t.toFixed(2) + '.png';
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log('  ' + name);
  }

  // Any pageerror at all matters here: a matrix built from an undefined pivot
  // throws inside the rAF tick, and the frame after it is the LAST GOOD FRAME
  // repeated — which photographs as a character standing perfectly still.
  // Where the camera ACTUALLY ended up. The hall's collision solver quietly
  // walks a bad position back inside, and a run then photographs a brick facade
  // while claiming to be looking at a chicken (§4).
  const at = await page.evaluate(() => {
    const c = NuggetArcade._H.cam;
    return [+c.x.toFixed(2), +c.z.toFixed(2), +c.pitch.toFixed(3)];
  });
  console.log('\n  camera asked for ' + [+spot.x.toFixed(2), +spot.z.toFixed(2),
    +spot.pitch.toFixed(3)].join(', ') + '   ended up ' + at.join(', '));

  const bad = errors.filter((e) => e.type === 'pageerror');
  console.log('\n  pageerrors: ' + (bad.length ? bad.length + ' — ' + bad[0].text : 'none'));
  console.log('  -> ' + path.relative(process.cwd(), OUT));
  console.log('  now LOOK at it:  python blender/tools/crop.py strip ' + TAG + '\n');
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();
