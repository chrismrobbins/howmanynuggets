// blender/tools/hallharness.js — the shared rig every hall measurement runs on.
//
// WHY THIS IS CHECKED IN: three consecutive art sessions built this in a
// session scratchpad, shipped, lost it, and rebuilt it from the handoff notes.
// It is ~200 lines of pure verification scaffolding, it ships nothing, and it
// is the difference between "looks better to me" and a number. It lives here
// now. (It is excluded from the page: nothing in index.html references it.)
//
//   node blender/tools/shoot.js --tag baseline
//   node blender/tools/shoot.js --tag act1 --off sky
//   node blender/tools/fallbacks.js
//
// Requires a static server on :8787 SERVED FROM THE REPO ROOT and playwright
// resolvable (npm i playwright in a scratchpad, then NODE_PATH=<that>/node_modules).

const path = require('path');
const fs = require('fs');

function requirePlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  // Common case: playwright installed in a scratchpad, not next to the repo.
  const extra = process.env.PW_PATH;
  if (extra) { try { return require(path.join(extra, 'playwright')); } catch (e) { /* noop */ } }
  throw new Error(
    'playwright not found. `npm i playwright` somewhere, then set PW_PATH=<that>/node_modules'
  );
}

const BASE = process.env.HALL_URL || 'http://localhost:8787/';

// THE SPOT TABLE. §4 of the handoff, and this session re-learned it in one run:
// hand-picked coordinates land inside walls and the collision solver quietly
// walks the camera back, so the run photographs a black brick facade while the
// stats claim to be measuring the street. (First pass here put four spots
// past the facade row and reported 48% dead black. It was a wall.)
//
// So every spot below is a position the GAME chose — a hotspot's own `stand`,
// or the open aisle between two cabinet rows the game itself places — and each
// aims at a real object's coordinates rather than at a guessed heading.
//
// YAW CONVENTION, from arcade.js's own look-at (`H.cam.yaw = atan2(-dx, -dz)`):
// yaw 0 faces -Z, which is INTO the hall from the door. `look` is the world
// point to aim at; `face()` does the arithmetic so no heading is ever guessed.
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

const RAW = [
  // --- inside the hall -------------------------------------------------
  ['01-entrance',   0,     5.5,  [0, -12],      0.00],  // down the aisle from the door
  ['02-aisle',      0,    -6.0,  [0, -18.7],    0.00],  // deluxe wall dead ahead
  ['03-westwall',  -3.2,  -9.5,  [-7.02, -9.5], 0.00],  // the west cabinet row
  ['04-eastwall',   3.2,  -9.5,  [7.02, -9.5],  0.00],  // the east cabinet row
  ['05-deluxe',     0,   -14.5,  [0, -18.7],    0.03],  // Knight's deluxe spot
  ['06-scoreboard', 5.82,-15.8,  [7.42, -15.8], 0.00],  // hotspot stand, east wall
  ['07-jukebox',   -4.8,  -1.87, [-4.8, -0.52], 0.00],  // hotspot stand
  ['08-ceiling',    0,    -9.5,  [0, -18.7],    0.60],  // the coffers + luminaires
  // --- out the doors ---------------------------------------------------
  ['09-doorway',    0,     4.2,  [0, 10],       0.00],  // looking OUT at the street
  ['10-busstop',   -4.2,   6.1,  [-4.2, 7.3],   0.00],  // hotspot stand
  ['11-gta',       -9.4,   7.1,  [-9.4, 9.35],  0.00],  // the double-parked compact
  ['12-club',      -6,    12.3,  [-6, 13.65],   0.00],  // DIP HOP's basement door
  ['13-drain',      8.8,  11.4,  [8.8, 12.95],  0.00],  // the gutter grate
  ['14-croft',     19.5,   2.5,  [19.5, 0.8],   0.00],  // the cellar doors
  ['15-pier',      31.4,  10.9,  [32.6, 10.9],  0.02],  // the pier gate
  // --- the lid ---------------------------------------------------------
  ['16-skyward',   -4.2,   6.1,  [-4.2, 20],    0.45],  // sky + the block across
  // --- the people ------------------------------------------------------
  // ADDED 2026-08-09 (ROUND 2). Nothing in this harness had ever looked at a
  // regular, and that is precisely why five of them stood on the pavement with
  // no contact shadow for four sessions without it showing up in a number.
  // A spot table only measures what it points at.
  ['17-regular',    2.5,   4.60, [2.5, 1.2],   -0.20],  // Big Crumb, FULL LENGTH (feet in frame)
  // --- the props -------------------------------------------------------
  // ADDED (ROUND 4), same reason as 17: the hall has two prop hotspots the
  // player deliberately walks to, and only the jukebox was ever pointed at.
  // The SAUCE-O-MATIC carries the golden nug, which is a lore item people
  // hunt, and nothing in this kit had ever photographed it.
  ['18-vending',    3.1,  -1.85, [3.1, -0.55],  0.06],  // the nug hotspot's own stand
  // --- the floor ------------------------------------------------------
  // ADDED (THE FLOOR PLAN). Same rule for the third time: sixteen spots aimed
  // at walls could not see that five people had no shadow, could not see the
  // two walk-to props, and could not have seen the middle of this room either
  // — because until now there was nothing in the middle of this room. These
  // two stand in the aisle and look ACROSS the floor, not down it.
  ['19-hockey',     0.4,  -4.2,  [-3.0, -7.6], -0.10],  // the air hockey table
  ['20-cranes',     0.4,  -4.2,  [3.5, -7.4],  -0.02],  // the two crane cabinets
  // ADDED (THE CAST, §17). Henrietta is the only regular with a real neck, so
  // she carries the only genuine head turn and the only piece of BEHAVIOUR in
  // the game (the peck) — and there was no spot pointed at her, which is the
  // §15 lesson verbatim: a spot table only measures what it points at, and five
  // characters went four sessions without a contact shadow because of it. This
  // is her own hotspot's `stand` (x + sdx, z + sdz from NPCS), never a guess.
  //
  // The pitch is NOT a guess either, and the first attempt at this spot proves
  // why it can't be: parked at her stand (z 3.60) with the -0.16 that suits a
  // person-sized subject, the frame was the Undercroft doors and a brick wall
  // with a red comb clipping the bottom edge. She is 0.78m tall and EYE is
  // 1.62, so a standing eyeline 1.2m from her looks straight over her head.
  // Backed off to 2.5m and pitched by atan((0.45 - 1.62) / 2.5) = -0.44 — still
  // on her own axis, still inside posValid's street box (z > 0.1).
  ['21-hen',       17.8,   4.90, [17.8, 2.4],  -0.44],  // Henrietta, full length
];

const SPOTS = RAW.map(([name, x, z, look, pitch]) => ({
  name, x, z, pitch, look, yaw: face(x, z, look[0], look[1]),
}));

// Renderer seams the hall exposes on purpose. `--off a,b` turns them off so a
// run can prove the fallback path still renders instead of going black.
//
// WHEN a seam is applied is not a detail. The first fallback run set all of
// them after enter() and reported no-hallart / no-maps / no-mesh as
// byte-identical to shipped — which looked like three passing rows and was
// actually three seams that had already been consumed by the time they were
// set. The asset loaders are read while the atlas is BUILT; the renderer flags
// are read per frame. So they go in different phases, and `webgl1` is neither:
// you cannot un-create a context, you have to refuse it before the page asks.
const SEAMS = {
  // read every frame — safe to set after the hall is up
  sky:     { when: 'post', src: 'H.sky = false;' },
  shadows: { when: 'post', src: 'H.shadows = false;' },
  pbr:     { when: 'post', src: 'H.pbr = false;' },
  hdr:     { when: 'post', src: 'H.hdr = false;' },
  lens:    { when: 'post', src: 'H.lens = false;' },
  city:    { when: 'post', src: 'H.city = false;' },
  // ✂️ THE EDGE. postSetup rebuilds when this flips, so it is safe post-boot.
  msaa:    { when: 'post', src: 'H.msaa = false;' },
  // 🪟 THE PANE (§20): false = the paneless hall, every build before it.
  glass:   { when: 'post', src: 'H.glass = false;' },
  // ⚖️ THE GOVERNOR walks the sample count down on a slow machine. Every
  // measurement in this kit must PIN it, or a long run silently changes the
  // renderer halfway through and the second half of the table is a different
  // picture from the first.
  msaaauto: { when: 'post', src: 'H.msaaAuto = false;' },
  // read once, while enter() builds the atlas and the buffers.
  //
  // `typeof X !== 'undefined'`, NOT `window.X`. HallArt / HallMaps / GtaArt are
  // top-level `const`s in classic scripts, so they are NOT properties of
  // window — §4 of the handoff says so about reading them, and it turns out to
  // be just as true when writing. The defensive `window.HallArt && (...)` guard
  // silently short-circuited to undefined and the seam never assigned; the
  // matrix then reported the fallback as passing because the frame was
  // unchanged, which is the exact failure the diff check was added to catch.
  art:     { when: 'pre', src: "typeof HallArt !== 'undefined' && (HallArt.on = () => false);" },
  maps:    { when: 'pre', src: "typeof HallMaps !== 'undefined' && (HallMaps.on = () => false);" },
  mesh:    { when: 'pre', src: "typeof HallMesh !== 'undefined' && (HallMesh.on = () => false);" },
  gtaart:  { when: 'pre', src: "typeof GtaArt !== 'undefined' && (GtaArt.on = () => false);" },
  // 🧍 THE CAST (§17) — TIER 2 of the articulation fallback, and the only tier
  // no other seam here reaches. It hides the ARTICULATED PART models and leaves
  // the one-piece characters standing, which is the case makeNpc() is written
  // for: a part set that half-arrives must produce the rigid character that
  // shipped before, never a headless nugget. `mesh` already covers tier 3 (no
  // geometry at all -> the procedural blob rig).
  //
  // Wraps HallMesh.get rather than editing the payload because that is the ONE
  // door every part goes through — makeNpc's existence check, Builder.model and
  // the claw's split test all call it.
  cast: {
    when: 'pre',
    src: "typeof HallMesh !== 'undefined' && (function () {"
      + "var g = HallMesh.get;"
      + "HallMesh.get = function (n) {"
      + "  return /_(body|head|hat|arm|armL|armR|footL|footR|lid|trolley|grab)$/.test(n)"
      + "    ? null : g(n);"
      + "};"
      + "})();",
  },
};

async function openHall(opts = {}) {
  const { chromium } = requirePlaywright();
  const w = opts.w || 1280, h = opts.h || 760;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', ...(opts.args || [])],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h } });

  // WebGL1 is not a flag — ANGLE + SwiftShader hands out a WebGL2 context
  // regardless of --disable-es3-gl-context, and the first run of the fallback
  // matrix "tested" WebGL1 on a context that reported gl2 = yes. Refusing the
  // context is the only way to get the real path.
  if (opts.webgl1) {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl2') return null;
        return real.call(this, type, ...rest);
      };
    });
  }

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });

  await page.goto(BASE, { waitUntil: 'load' });
  // The amount input autofocuses; keystrokes meant for the hall land in it.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  // The hall needs a storm session behind it — same path the arcade button uses.
  await page.evaluate(() => { startStorm(1e6, 5000); });
  await page.waitForTimeout(250);

  const off = opts.off || [];
  for (const k of off) if (!SEAMS[k]) throw new Error(`unknown seam "${k}"`);
  const phase = (when) => off.map((k) => SEAMS[k]).filter((s) => s.when === when).map((s) => s.src);

  // BEFORE enter(): the asset loaders, which are read while the atlas builds.
  const pre = phase('pre');
  // eslint-disable-next-line no-new-func
  if (pre.length) await page.evaluate((src) => { new Function(src)(); }, pre.join('\n'));

  await page.evaluate(() => NuggetArcade.enter());
  // hallMeshData/hallArtData load async after first paint; enter() waits on
  // them behind .hall-booting. Wait for the boot screen to actually clear.
  await page.waitForFunction(
    () => !document.querySelector('.hall-booting') && NuggetArcade._H && NuggetArcade._H.raf,
    null, { timeout: 45000 }
  );
  await page.waitForTimeout(400);

  // Skip the intro (doors + neon warm-up) and get to a walking camera.
  //
  // ⚖️ AND PIN THE GOVERNOR, always, whatever the caller asked for. The hall
  // walks its own MSAA sample count down when a machine cannot hold 48fps —
  // which is right for a player and poison for a measurement, because this box
  // renders through SwiftShader and WILL trip it. Unpinned, an eighteen-spot
  // run photographs the first six spots at 4x and the rest at 2x and calls the
  // difference a change. Same class of bug as an unpinned clock.
  await page.evaluate(() => {
    const H = NuggetArcade._H;
    H.introT = 99; H.doorsOpen = 1; H.state = 'walk';
    H.msaaAuto = false;
  });

  // §4: the storm layer is DOM ON TOP of the canvas. It covers the thing under
  // test and it costs enough to make an fps reading meaningless (a run once
  // measured 25fps that was really 61). The hall's own chrome sits on top too
  // — the hint toast, the skip button and the mute button all landed in this
  // session's first contact sheet. Set them inline: a stylesheet loses to the
  // rules that toggle these elements, and losing silently is the whole problem.
  //
  // `.hall-vignette` STAYS. It is part of the picture the player sees, so a
  // measurement without it is a measurement of a different room.
  await page.evaluate(() => {
    const hide = [
      '#nuggetStorm', '.storm-hud', '.arcade-hint',
      '.hall-hint', '.hall-prompt', '.hall-skip', '.hall-mute',
      '.hall-dialog', '.hall-cross', '.hall-flash',
    ];
    for (const sel of hide)
      document.querySelectorAll(sel).forEach((el) => el.style.setProperty('display', 'none', 'important'));
    const H = NuggetArcade._H;
    H.toast = null;
    if (H.fade) H.fade.style.opacity = '0';
  });

  // AFTER enter(): the renderer flags, which are read per frame.
  const post = phase('post');
  if (post.length) {
    await page.evaluate((src) => {
      const H = NuggetArcade._H;
      // eslint-disable-next-line no-new-func
      new Function('H', src)(H);
    }, post.join('\n'));
  }

  await page.waitForTimeout(300);
  return { browser, page, errors, w, h };
}

// Park the camera and pin time so two runs are comparable frame-for-frame.
async function stand(page, spot, t = 12.5) {
  await page.evaluate(({ s, t }) => {
    const H = NuggetArcade._H;
    H.state = 'walk'; H.auto = null; H.dialog = null;
    H.cam.x = s.x; H.cam.z = s.z; H.cam.yaw = s.yaw; H.cam.pitch = s.pitch;
    H.t = t; H.introT = 99; H.toast = null;
  }, { s: spot, t });
  // two frames: one to consume the new camera, one to settle any lerp
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(90);
  // re-pin: the frame loop advances H.t
  await page.evaluate((t) => { NuggetArcade._H.t = t; }, t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function shotBuffer(page) {
  const el = await page.$('#arcadeHall canvas');
  return el ? el.screenshot({ type: 'png' }) : page.screenshot({ type: 'png' });
}

// Measured fps over `ms` of real frames, with the storm layer already hidden.
async function fps(page, ms = 1600) {
  return page.evaluate((ms) => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else resolve(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
    };
    requestAnimationFrame(tick);
  }), ms);
}

module.exports = { openHall, stand, shotBuffer, fps, SPOTS, SEAMS, BASE, requirePlaywright };
