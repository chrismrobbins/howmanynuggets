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
  // BODY yaw, and it has to be read off a regular with NO articulated head.
  // It used to point at index 2 (the Hooded Nug) and THE CAST made that channel
  // read dead — correctly. His body only turns when the head runs out of neck,
  // and an idle glance of ±0.26rad is well inside his 0.95 headMax, so the cowl
  // absorbs all of it and the robe never moves. That is the feature. Index 0 is
  // Big Crumb, who has no neck at all and still turns bodily, so he is what a
  // body-yaw channel should be watching now.
  ['npc.yaw', 'NuggetArcade._NPCS[0].curYaw', 0.04, 6000, 'still'],
  // 🧍 THE CAST (§17). The regulars are articulated now — separate parts posed
  // by separate matrices — and every one of these channels is a part that would
  // silently freeze into the rigid character that shipped before if its pose
  // maths broke. The whole point of this file: a statue photographs perfectly.
  //
  // These read the POSE STATE, not the matrices, for the same reason failTube
  // does — a duplicated formula here would pass while the real one was stuck.
  ['npc.breath', 'NuggetArcade._NPCS[0].breath || 0', 0.02, 6000, 'still'],
  ['npc.armLag', 'NuggetArcade._NPCS[0].armLag || 0', 0.9, 6000, 'still'],
  // index 2 is the Hooded Nug (headMax 0.95) and 3 is Henrietta. Hers is a
  // step-and-hold, so it needs a window long enough to contain a flick.
  ['npc.headYaw', 'NuggetArcade._NPCS[2].headYaw || 0', 0.02, 6000, 'still'],
  ['hen.flick', 'NuggetArcade._NPCS[3].headYaw || 0', 0.15, 6000, 'still'],
  // THE PECK is once per ~7s and it is 85% of its own range for 15% of that, so
  // a short window samples only the hold and reports a dead chicken.
  ['hen.peck', 'NuggetArcade._NPCS[3].headPitch || 0', 0.5, 9000, 'still'],
  ['gravy.lid', 'NuggetArcade._NPCS[1].lid || 0', 0.02, 9000, 'still'],
  // 🕹 and the crane machines' trolleys, which had never moved at all.
  // ⚓ THE MOORING (§21). She is the only thing that moves on the harbour, and
  // the only motion anywhere east of the pier gate. Read off the values the
  // renderer actually used, like claw.travel and failTube — a channel that
  // recomputes the formula keeps sweeping while the real draw is frozen.
  ['boat.roll', 'NuggetArcade._H.boat ? (NuggetArcade._H.boat.roll || 0) : 0', 0.06, 9000, 'still'],
  ['boat.heave', 'NuggetArcade._H.boat ? (NuggetArcade._H.boat.heave || 0) : 0', 0.03, 9000, 'still'],
  // (claw.travel / claw.swing left with THE CLEARING, 2026-08-24 — the crane
  // machines were removed for performance along with the rest of the FLOOR
  // PLAN furniture.)
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
    // 🚨 AND PUT THE CAMERA BACK ON OPEN FLOOR FIRST. This check runs LAST, and
    // every channel above it holds 'f' down for its window without ever
    // resetting the position — so by the time it fires, twenty walks have driven
    // the camera into the back wall. It sits at z -17.85 with `speed` pinned at
    // 0.62 by the collision solver, and at that speed the hall treats it as
    // nearly-standing and the IDLE BREATH never fully fades. What the channel
    // then measured was the breath decaying — a smooth monotonic ramp of about
    // 0.0040, right on the threshold — and it reported HEAD-BOB IS BACK.
    //
    // It is a false positive, and a dangerous one: the obvious "fix" is to raise
    // the threshold, which would blind the only guard standing between this
    // project and the head-bob it has already shipped once. A fresh camera on
    // open floor measures cam.y range 0.00000, exactly as THE GLIDE intended.
    //
    // The channel's own claim is "flat while WALKING". A camera wedged in a
    // corner at 0.62 m/s is not walking, so this is not moving the goalposts —
    // it is finally measuring the thing the row says it measures.
    await page.evaluate(() => {
      const H = NuggetArcade._H;
      H.cam.x = 0; H.cam.z = 2; H.cam.yaw = 0; H.vel.x = 0; H.vel.z = 0;
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
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
