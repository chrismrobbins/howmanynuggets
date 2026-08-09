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

const CHANNELS = [
  ['cam.y', 'H.cam.y', 0.02],
  ['camRoll', 'H.camRoll', 0.004],
  ['camSway', 'H.camSway', 0.008],
  ['gaitAmt', 'H.gaitAmt', 0.5],
  ['breath', 'H.breath', 0.5],
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
  for (const [name, expr, minRange] of CHANNELS) {
    const walk = await sample(expr, 1400, ['f']);
    await page.waitForTimeout(700);          // let the ramp settle
    const still = await sample(expr, 1400, []);
    const rng = (a) => Math.max(...a) - Math.min(...a);
    const rw = rng(walk), rs = rng(still);
    const ok = rw >= minRange;
    if (!ok) bad++;
    console.log(`  ${name.padEnd(12)}${rw.toFixed(4).padStart(12)}${rs.toFixed(4).padStart(12)}   `
      + (ok ? 'ok' : `DEAD (want >= ${minRange})`));
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
