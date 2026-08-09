// blender/tools/probe.js — ask the RUNNING hall where things are.
//
// §4 of the handoff, learned twice: do not invent camera spots. Hand-picked
// coordinates land inside walls and the collision solver quietly walks the
// camera back, so the run photographs a brick facade while claiming to shoot
// the street. This dumps every hotspot's own `stand`, every cabinet, the NPCs,
// and the light list, so a spot table can be BUILT from the game's own numbers.
//
//   node blender/tools/probe.js            # hotspots + cabinets + npcs
//   node blender/tools/probe.js --expr "H.lights.length"

const { openHall } = require('./hallharness');

const i = process.argv.indexOf('--expr');
const EXPR = i > -1 ? process.argv[i + 1] : null;

(async () => {
  const { browser, page } = await openHall({ w: 900, h: 560 });
  const out = await page.evaluate((expr) => {
    const H = NuggetArcade._H;
    if (expr) { const f = new Function('H', 'return (' + expr + ')'); return f(H); }
    const r2 = (v) => (typeof v === 'number' ? +v.toFixed(2) : v);
    return {
      keys: Object.keys(H).sort(),
      cam: { x: r2(H.cam.x), y: r2(H.cam.y), z: r2(H.cam.z), yaw: r2(H.cam.yaw), pitch: r2(H.cam.pitch) },
      hotspots: (H.hotspots || []).map((s) => ({
        label: s.label || s.name || s.kind || '?',
        stand: (s.stand || []).map(r2),
        at: [r2(s.x), r2(s.y), r2(s.z)],
      })),
      cabinets: (H.cabs || H.cabinets || []).map((c) => ({
        mode: c.mode, x: r2(c.x), z: r2(c.z), rot: r2(c.rot !== undefined ? c.rot : c.yaw),
      })),
      npcs: (H.npcs || []).map((n) => ({ id: n.id || n.key, x: r2(n.x), z: r2(n.z) })),
      lights: H.lights ? H.lights.length : null,
      lastSpot: H.lastSpot || null,
      bounds: H.bounds || null,
    };
  }, EXPR);
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
