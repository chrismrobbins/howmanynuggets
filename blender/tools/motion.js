// blender/tools/motion.js — DOES ANYTHING ACTUALLY MOVE?
//
//   node blender/tools/motion.js
//
// Every other tool in this kit pins the clock and holds the camera still,
// which is exactly right for measuring a picture and exactly wrong for
// measuring MOTION. A gait that never fires, a flicker stuck at one value, or
// a fan that does not turn all look perfect to shoot.js.
//
// So: hold the WASD key down for real frames and sample the state the renderer
// reads, then report the range each channel actually swept. A channel whose
// range is ~0 is a feature that is not running.

const { openHall } = require('./hallharness');

// [name, expr, minRange, windowMs, which] — `which` picks WHICH of the two
// samples the threshold is applied to. That column exists because THE GLIDE
// deleted the head-bob: `cam.y` is now deliberately a flat line while you walk
// and only moves when you stand still, so testing it against the walking
// sample would fail a channel that is behaving exactly as designed.
const CHANNELS = [
  // Thresholds are RANGES, and the first sample lands a frame or two after the
  // key goes down — so a channel that ramps 0 -> 3.4 reports ~2.8, not 3.4.
  // Do not "fix" that by raising the bar; it is the sampler, not the glide.
  ['cam.y(idle)', 'H.cam.y', 0.004, 2600, 'still'],
  ['speed', 'H.speed', 2.5, 1400, 'walk'],
  ['vel.z', 'H.vel.z', 2.5, 1400, 'walk'],
  ['breath', 'H.breath', 0.5, 1400, 'still'],
  // 🧍 THE REGULARS. They were statues for five sessions with a 6mm breath as
  // their only motion, and nothing in this kit could see that either — shoot.js
  // pins the clock, so a waxwork and a person photograph identically. The
  // weight shift is SLOW (0.37x the breath rate) so it needs a long window.
  // NuggetArcade._NPCS, not a bare NPCS: `new Function` bodies run in GLOBAL
  // scope and NPCS is a const inside arcade.js's IIFE, so the bare name throws
  // a ReferenceError inside the rAF tick — the sample promise then never
  // resolves and playwright reports "promise was garbage collected", which
  // looks nothing at all like the mistake it is.
  ['npc.shift', 'NuggetArcade._NPCS[0].shift || 0', 1.1, 6000, 'still'],
  ['npc.yaw', 'NuggetArcade._NPCS[2].curYaw', 0.04, 6000, 'still'],
  // 🌫 the motion layer. A plume that never rises and a splash that never
  // expands both photograph perfectly, which is exactly why they need a
  // channel here rather than an eyeball.
  ['steam.y', 'H.steam.length ? H.steam[0].y : 0', 0.05],
  ['steam.size', 'H.steam.length ? H.steam[0].s : 0', 0.05],
  ['splash', 'H.splash.length ? H.splash[0].life : 0', 0.05],
  // Read off the renderer itself, not recomputed here — a duplicated formula
  // would pass while the real one was stuck.
  //
  // 6 seconds, not the default 1.4: the tube is MOSTLY FINE and drops into a
  // stutter for about half a second every five. A window shorter than its
  // period samples only the healthy band and reports a dead channel, which is
  // a measurement bug that looks exactly like a rendering bug.
  ['failTube', 'H.failLevel || 0', 0.4, 6000],
];

(async () => {
  const { browser, page } = await openHall({ w: 900, h: 560 });
  // stand somewhere with room to walk, facing down the aisle
  await page.evaluate(() => {
    const H = NuggetArcade._H;
    H.state = 'walk'; H.auto = null; H.cam.x = 0; H.cam.z = 2; H.cam.yaw = 0;
  });

  const sample = (expr, ms, keys) => page.evaluate(({ expr, ms, keys }) => new Promise((resolve) => {
    const H = NuggetArcade._H;
    for (const k of keys) H.keys[k] = true;
    const f = new Function('H', 'return (' + expr + ')');
    const vals = [];
    const t0 = performance.now();
    const tick = () => {
      vals.push(f(H));
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else { for (const k of keys) H.keys[k] = false; resolve(vals); }
    };
    requestAnimationFrame(tick);
  }), { expr, ms, keys });

  console.log(`\n  ${'channel'.padEnd(12)}${'walking'.padStart(12)}${'standing'.padStart(12)}   verdict`);
  let bad = 0;
  for (const [name, expr, minRange, ms, which] of CHANNELS) {
    const win = ms || 1400;
    const walk = await sample(expr, win, ['f']);
    await page.waitForTimeout(700);          // let the ramp settle
    const still = await sample(expr, win, []);
    const rng = (a) => Math.max(...a) - Math.min(...a);
    const rw = rng(walk), rs = rng(still);
    const ok = (which === 'still' ? rs : rw) >= minRange;
    if (!ok) bad++;
    console.log(`  ${name.padEnd(12)}${rw.toFixed(4).padStart(12)}${rs.toFixed(4).padStart(12)}   `
      + (ok ? 'ok' : `DEAD (${which || 'walk'} want >= ${minRange})`));
  }

  // 🚶 THE ANTI-CHANNEL. Every other row here fails when a number STOPS
  // moving; this one fails when the head-bob comes back. It is a real risk —
  // bob is the reflex fix for "movement feels weightless" and this project
  // has already shipped it once.
  //
  // PRE-ROLL, and it is not optional: the idle breath fades out over the first
  // ~150ms of a walk, so a sample taken from the instant the key goes down
  // catches the tail of it and reports 0.0044 of "head-bob" that is really a
  // lungful of air on the way out. This channel is about STEADY-STATE walking.
  {
    await page.evaluate(() => { NuggetArcade._H.keys.f = true; });
    await page.waitForTimeout(800);
    const walk = await sample('H.cam.y', 1400, ['f']);
    const rng = Math.max(...walk) - Math.min(...walk);
    const ok = rng < 0.004;
    if (!ok) bad++;
    console.log(`  ${'no-bob'.padEnd(12)}${rng.toFixed(4).padStart(12)}${''.padStart(12)}   `
      + (ok ? 'ok (flat while moving)' : 'HEAD-BOB IS BACK (want < 0.004)'));
  }

  // the frame itself: two shots a few frames apart must not be identical
  const jitter = await page.evaluate(() => new Promise((resolve) => {
    const H = NuggetArcade._H;
    const gl = H.gl, w = 64, h = 64;
    const read = () => {
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(200, 200, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    requestAnimationFrame(() => {
      const a = read();
      requestAnimationFrame(() => {
        const b = read();
        let n = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 0) n++;
        resolve((100 * n) / (w * h));
      });
    });
  }));
  console.log(`  ${'frame'.padEnd(12)}${(jitter.toFixed(2) + '%').padStart(12)}${''.padStart(12)}   `
    + (jitter > 0.5 ? 'ok (grain is live)' : 'STATIC — grain frozen?'));
  if (jitter <= 0.5) bad++;

  await browser.close();
  console.log(`\n  ${bad ? bad + ' DEAD CHANNEL(S)' : 'everything moves'}\n`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
