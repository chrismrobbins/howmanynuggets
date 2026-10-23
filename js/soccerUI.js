// ---- ⚽ NUGGET SOCCER — the stadium, the broadcast, the menus, the controls ---------------------------------------------
// Draws soccer.m (js/soccer.js) through js/soccerGL.js and takes input: keyboard (FIFA's classic Arrows layout + a
// WASD-side alternative), a gamepad (Xbox naming), and on a phone the Blitz pattern — a floating stick on the left
// that sprints when you push past its ring, and a few big context buttons on the right (PASS / SHOOT / THROUGH /
// LOB in attack, TACKLE / SLIDE / SWITCH / PRESS in defence) — see 📱 below.
//
// The Blender models (js/soccerMeshData.js → window.SOC_MESH_DATA) are injected when the game opens; until they land
// (or if they never do) everything draws from the procedural stand-ins in socStandIns(), so nothing is ever missing.

const SU = { built: false, cv: null, ov: null, g: null, menu: null, pad: null, meshes: {}, keys: {}, cam: null, dpr: 1, w: 800, h: 600,
  screen: 'title', acc: 0, cfg: null, msg: null, msgT: 0, replay: null, padOn: false, stick: null, held: {}, lastPad: {}, flash: 0 };
const SOC_MESH_SRC = 'js/soccerMeshData.js?v=1';
const SOC_TOUCH_TEST = () => { try { return matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0; } catch (e) { return false; } };

// ---- open / close (from syncSoccer) -------------------------------------------------------------------------------------
function socOpen() {
  if (!SU.built) socBuild();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  soccer.earned = 0;
  socLayout();
  if (SOC_TOUCH_TEST()) socPadOn();
  if (typeof socAudioOpen === 'function') socAudioOpen();
  socShowTitle();
}
function socClose() {
  soccer.m = null; SU.screen = 'title'; SU.replay = null;
  if (SU.menu) SU.menu.innerHTML = '';
  if (typeof socAudioClose === 'function') socAudioClose();
}

function socBuild() {
  SU.built = true;
  const root = soccerWorld;
  root.innerHTML = `<canvas class="soc-gl"></canvas><canvas class="soc-ov"></canvas><div class="soc-menu"></div><div class="soc-pad" hidden></div>`;
  SU.cv = root.querySelector('.soc-gl'); SU.ov = root.querySelector('.soc-ov'); SU.g = SU.ov.getContext('2d');
  SU.menu = root.querySelector('.soc-menu'); SU.pad = root.querySelector('.soc-pad');
  SU.gl = sglInit(SU.cv);
  if (!SU.gl) { SU.menu.innerHTML = `<div class="soc-card"><h2>No WebGL 2</h2><p>Nugget Soccer needs a browser with WebGL 2.</p><button data-act="quit">Back</button></div>`; }
  else { socStandIns(); socLoadMeshes(); socBuildStadium(); }
  window.addEventListener('resize', () => { if (soccer.on) socLayout(); });
  window.addEventListener('keydown', socKeyDown);
  window.addEventListener('keyup', socKeyUp);
  window.addEventListener('blur', () => { SU.keys = {}; });
  root.addEventListener('click', socMenuClick);
  root.addEventListener('pointerdown', () => { if (typeof socAudioWake === 'function') socAudioWake(); if (SOC_TOUCH_TEST() && !SU.padOn) socPadOn(); }, true);
  // a phone's first touch anywhere turns the pad on (some laptops report coarse pointers too: they only get it on touch)
  root.addEventListener('touchstart', () => { if (!SU.padOn) socPadOn(); }, { passive: true });
}
function socLayout() {
  const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  SU.w = W; SU.h = H; SU.dpr = dpr;
  for (const c of [SU.cv, SU.ov]) { if (!c) continue; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
}

// ---- the meshes: the Blender models, or the stand-ins -----------------------------------------------------------------------
function socLoadMeshes() {
  const use = () => {
    const D = window.SOC_MESH_DATA;
    if (!D) return;
    const raw = sglDecodeModels(D);
    SU.raw = raw;
    for (const k in raw) SU.meshes[k] = sglMesh(raw[k]);
    SU.blender = true;
    socBuildStadium();     // the crowd and the stands are merged meshes: rebuild them from the real models
  };
  if (window.SOC_MESH_DATA) { use(); return; }
  const s = document.createElement('script'); s.src = SOC_MESH_SRC; s.async = true;
  s.onload = use; s.onerror = () => console.warn('soccer: Blender meshes failed to load; keeping the stand-ins');
  document.head.appendChild(s);
}
// procedural stand-ins (AlrMB): a nugget, its limbs, a ball, a goal — enough to play with before the models land
function socStandIns() {
  const mk = (fn) => { const mb = new AlrMB(); fn(mb); return sglMesh(mb); };
  const S = SU.meshes, brd = '#c98d3c';
  S['p.body'] = S['p.bodyGK'] = mk((mb) => {
    mb.color('#b0b0b0', 1).box(0, 0.32, 0, 0.21, 0.22, 0.15, 0.06);
    mb.color('#808080', 0.5).box(0, 0.03, 0, 0.2, 0.09, 0.15, 0.04);
    mb.color(brd).ball(0, 0.68, 0, 0.17, 10, 0.16);
    mb.color('#ffffff').ball(-0.06, 0.72, 0.15, 0.04, 6).ball(0.06, 0.72, 0.15, 0.04, 6);
    mb.color('#111111').ball(-0.06, 0.72, 0.18, 0.018, 5).ball(0.06, 0.72, 0.18, 0.018, 5);
  });
  S['p.arm'] = S['p.armGK'] = mk((mb) => { mb.color('#b0b0b0', 1).box(0, -0.08, 0, 0.06, 0.08, 0.06, 0.02); mb.color(brd).box(0, -0.3, 0, 0.05, 0.16, 0.05, 0.02); });
  S['p.thigh'] = mk((mb) => { mb.color('#808080', 0.5).box(0, -0.08, 0, 0.075, 0.09, 0.075, 0.02); mb.color(brd).box(0, -0.3, 0, 0.065, 0.13, 0.065, 0.02); });
  S['p.shin'] = mk((mb) => { mb.color(brd).box(0, -0.06, 0, 0.055, 0.07, 0.055, 0.02); mb.color('#a0a0a0', 0.25).box(0, -0.24, 0, 0.06, 0.13, 0.06, 0.02); mb.color('#151515').box(0, -0.4, 0.05, 0.06, 0.04, 0.12, 0.02); });
  S.ball = mk((mb) => { mb.color('#f4f4f4').ball(0, 0, 0, SOC.R, 12, SOC.R); mb.color('#222222').ball(0, 0, SOC.R * 0.92, SOC.R * 0.35, 5).ball(0, SOC.R * 0.92, 0, SOC.R * 0.35, 5).ball(SOC.R * 0.92, 0, 0, SOC.R * 0.35, 5); });
  S.goal = mk((mb) => {
    mb.color('#f2f2f2');
    for (const z of [-SOC.GW, SOC.GW]) mb.cyl(z, 0, 0, 0.06, SOC.GH, 0.06, 10);
    mb.push().at(0, SOC.GH, 0, 0, 0, Math.PI / 2).cyl(0, -SOC.GW, 0, 0.06, SOC.GW, 0.06, 10).pop();
    mb.color('#d8d8d8');
    for (let k = -18; k <= 18; k++) { const z = k * 0.2; mb.box(z, SOC.GH / 2, -SOC.GD, 0.008, SOC.GH / 2, 0.008, 0); }
    for (let k = 0; k <= 12; k++) mb.box(0, k * 0.2, -SOC.GD, SOC.GW, 0.008, 0.008, 0);
    for (let k = 0; k <= 10; k++) mb.box(0, SOC.GH, -k * 0.2, SOC.GW, 0.008, 0.008, 0);
  });
  S.flag = mk((mb) => { mb.color('#e8e8e8').cyl(0, 0, 0, 0.02, 1.5, 0.02, 6); mb.color('#e8b53a').box(0.13, 1.38, 0, 0.13, 0.09, 0.005, 0); });
  S.fan0 = S.fan1 = S.fan2 = S.fan3 = mk((mb) => { mb.color('#b0b0b0', 1).box(0, 0.2, 0, 0.17, 0.17, 0.13, 0.04); mb.color(brd).ball(0, 0.45, 0, 0.12, 6); });
}
// the goal's mesh is the Blender one whose mouth faces +z; the game's goals are at x = ±52.5 facing in: turned ±90°
const socM = () => alrM4();

// ---- the stadium: the pitch (a painted canvas), the stands, the crowd, the lights, the boards -------------------------------
function socPitchCanvas() {
  const PX = 18, X0 = -62, Z0 = -42, WM = 124, HM = 84;     // metres covered by the canvas, px per metre
  const cv = document.createElement('canvas'); cv.width = WM * PX; cv.height = HM * PX;
  const g = cv.getContext('2d');
  const X = (x) => (x - X0) * PX, Z = (z) => (z - Z0) * PX;
  // the run-off: a darker, rougher green
  g.fillStyle = '#2f5a22'; g.fillRect(0, 0, cv.width, cv.height);
  // the playing surface: mown stripes across the length (twelve), and a cross-mow shimmer
  for (let k = 0; k < 14; k++) {
    const x0 = -SOC.HL - 4 + k * ((SOC.HL * 2 + 8) / 14);
    g.fillStyle = k % 2 ? '#3f7a2c' : '#4a8a33';
    g.fillRect(X(x0), Z(-SOC.HW - 4), ((SOC.HL * 2 + 8) / 14) * PX + 1, (SOC.HW * 2 + 8) * PX);
  }
  for (let k = 0; k < 10; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.025)'; g.fillRect(X(-SOC.HL - 4), Z(-SOC.HW - 4 + k * 7.6), (SOC.HL * 2 + 8) * PX, 7.6 * PX); }
  // grain: tufts and wear (the goalmouths and the centre are worn a little)
  let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 60000; k++) { const x = r() * cv.width, y = r() * cv.height, v = r(); g.fillStyle = v < 0.5 ? 'rgba(20,40,10,0.08)' : 'rgba(150,200,90,0.06)'; g.fillRect(x, y, 2, 2); }
  for (const gx of [-SOC.HL + 4, SOC.HL - 4, 0]) { const rg = g.createRadialGradient(X(gx), Z(0), 0, X(gx), Z(0), 7 * PX); rg.addColorStop(0, 'rgba(120,100,50,0.22)'); rg.addColorStop(1, 'rgba(120,100,50,0)'); g.fillStyle = rg; g.fillRect(X(gx) - 7 * PX, Z(0) - 7 * PX, 14 * PX, 14 * PX); }
  // the markings: 12 cm white lines
  g.strokeStyle = 'rgba(245,245,240,0.92)'; g.lineWidth = Math.max(2, 0.12 * PX); g.lineJoin = 'miter';
  const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX);
  rect(-SOC.HL, -SOC.HW, SOC.HL, SOC.HW);
  g.beginPath(); g.moveTo(X(0), Z(-SOC.HW)); g.lineTo(X(0), Z(SOC.HW)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), SOC.CIRCLE * PX, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(245,245,240,0.95)';
  const dot = (x, z, rr) => { g.beginPath(); g.arc(X(x), Z(z), (rr || 0.12) * PX, 0, Math.PI * 2); g.fill(); };
  dot(0, 0, 0.15);
  for (const sg of [-1, 1]) {
    const gx = sg * SOC.HL;
    rect(Math.min(gx, gx - sg * SOC.BOX), -SOC.BOXW, Math.max(gx, gx - sg * SOC.BOX), SOC.BOXW);
    rect(Math.min(gx, gx - sg * SOC.SIX), -SOC.SIXW, Math.max(gx, gx - sg * SOC.SIX), SOC.SIXW);
    const px = gx - sg * SOC.PEN; dot(px, 0, 0.12);
    // the D: the arc of the centre-circle radius round the spot, outside the box
    const a = Math.acos((SOC.BOX - SOC.PEN) / SOC.CIRCLE);
    g.beginPath(); if (sg > 0) g.arc(X(px), Z(0), SOC.CIRCLE * PX, Math.PI - a, Math.PI + a); else g.arc(X(px), Z(0), SOC.CIRCLE * PX, -a, a); g.stroke();
    // corner arcs
    for (const sz of [-1, 1]) { g.beginPath(); g.arc(X(gx), Z(sz * SOC.HW), 1 * PX, sg > 0 ? (sz > 0 ? Math.PI : Math.PI / 2) : (sz > 0 ? -Math.PI / 2 : 0), sg > 0 ? (sz > 0 ? Math.PI * 1.5 : Math.PI) : (sz > 0 ? 0 : Math.PI / 2)); g.stroke(); }
  }
  // a nugget crest on the centre circle (painted turf, the club's touch)
  g.save(); g.translate(X(0), Z(0)); g.globalAlpha = 0.09; g.fillStyle = '#e8c060'; g.beginPath(); g.ellipse(0, 0, 4.6 * PX, 3.6 * PX, 0, 0, Math.PI * 2); g.fill(); g.restore();
  return { cv, X0, Z0, WM, HM };
}
// the advertising boards' faces: original sponsors in the nugget world, a long strip that scrolls
function socAdsCanvas() {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 64;
  const g = cv.getContext('2d');
  const ads = [['#c8302a', '#fff', 'SAUCE CO.'], ['#1f3a6a', '#e8c060', 'GOLDEN FRY OIL'], ['#f2f2f2', '#c8302a', 'NUGGET NEWS'], ['#2a7a3a', '#fff', 'PICKLE PARK BANK'], ['#e8b53a', '#3a1a0a', 'CRUMB CEREAL'], ['#1a1a1a', '#e8742a', 'HOT DIP ENERGY'], ['#6a3aa8', '#f2d23a', 'CURLY TELECOM'], ['#f2f2f2', '#2a5bc8', 'RANCH AIRWAYS']];
  const w = cv.width / ads.length;
  ads.forEach(([bg, fg, t], k) => {
    g.fillStyle = bg; g.fillRect(k * w, 0, w, 64);
    g.fillStyle = fg; g.font = '900 34px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, k * w + w / 2, 34, w - 20);
  });
  return cv;
}
function socBuildStadium() {
  if (!SU.gl) return;
  const S = SU.meshes;
  // the pitch: one big textured quad over the canvas's span
  if (!SU.pitch) {
    const P = socPitchCanvas(); SU.pitchInfo = P;
    SU.pitchTex = sglTexCanvas(P.cv, true, false);
    const mb = new AlrMB(); mb.color('#ffffff');
    const x0 = P.X0, z0 = P.Z0, x1 = P.X0 + P.WM, z1 = P.Z0 + P.HM;
    mb.face([[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    SU.pitch = sglMesh(mb);
    // the ads: a strip of boards round the pitch, its face textured
    SU.adsCv = socAdsCanvas(); SU.adsTex = sglTexCanvas(SU.adsCv, true, true);
    const ab = new AlrMB(); ab.color('#ffffff');
    const H = 0.9, put = (ax, az, bx, bz, u0, u1) => ab.face([[ax, 0.05, az], [bx, 0.05, bz], [bx, 0.05 + H, bz], [ax, 0.05 + H, az]], [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]);
    // long sides (both), the goal ends (beside the goals)
    const LZ = SOC.HW + 4.2, LX = SOC.HL + 5.5;
    put(-LX, -LZ, LX, -LZ, 0, 6); put(LX, LZ, -LX, LZ, 0, 6);
    for (const sx of [-1, 1]) { put(sx * LX, -LZ, sx * LX, -6, 0, 1.2); put(sx * LX, 6, sx * LX, LZ, 0, 1.2); }
    SU.ads = sglMesh(ab);
    const bk = new AlrMB(); bk.color('#2a2f36');
    bk.box(0, 0.5, LZ + 0.12, LX, 0.5, 0.1, 0.01); bk.box(0, 0.5, -LZ - 0.12, LX, 0.5, 0.1, 0.01);
    for (const sx of [-1, 1]) { bk.box(sx * (LX + 0.12), 0.5, -(LZ + 6) / 2, 0.1, 0.5, (LZ - 6) / 2, 0.01); bk.box(sx * (LX + 0.12), 0.5, (LZ + 6) / 2, 0.1, 0.5, (LZ - 6) / 2, 0.01); }
    SU.adsBack = sglMesh(bk);
  }
  // the stands + the crowd: four sides of `stand` sections (20 m each), corners, the crowd merged into one mesh a side
  SU.standDraws = [];
  const stand = S.stand, R = SU.raw;
  const sides = [
    { name: 'far', cx: 0, cz: -SOC.HW - 6, yaw: Math.PI, len: 120, roof: true },     // (local +z = away from the pitch)
    { name: 'west', cx: -SOC.HL - 8, cz: 0, yaw: -Math.PI / 2, len: 80, roof: true },
    { name: 'east', cx: SOC.HL + 8, cz: 0, yaw: Math.PI / 2, len: 80, roof: true },
  ];
  SU.sides = sides;
  const crowd = [];
  for (const sd of sides) {
    const n = Math.round(sd.len / 20);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 20;
      const c = Math.cos(sd.yaw), s = Math.sin(sd.yaw);
      const x = sd.cx + off * c, z = sd.cz - off * s;
      if (stand) SU.standDraws.push({ mesh: stand, M: alrTRS(x, 0, z, sd.yaw) });
    }
    // the crowd on that side: fans on the stand's rows (from the Blender report: rows climb 0.45 and step 0.85)
    if (R && R.fan0) {
      const rows = 16;
      for (let row = 0; row < rows; row++) {
        const ly = 1.09 + 0.45 * row, lz = 0.7 + 0.85 * row;          // (the seat tops, from the rig's STAND_ROWS)
        for (let a = -sd.len / 2 + 0.6; a < sd.len / 2 - 0.6; a += 0.62 + (row % 3) * 0.04) {
          const u = ((a + sd.len / 2) % 20 + 20) % 20 - 10;           // where in its 20 m section
          if (Math.abs(u) > 9.4 || (Math.abs(u) > 2.73 && Math.abs(u) < 3.93)) continue;   // the aisles
          if (socHash(a * 7 + row, sd.cz) < 0.12) continue;      // the empty seats
          const c = Math.cos(sd.yaw), s = Math.sin(sd.yaw);
          // local (a along, lz away) → world (yaw turns local +z away from the pitch)
          const wx = sd.cx + a * c + lz * s, wz = sd.cz - a * s + lz * c;
          const v = (socHash(a, row * 3.1) * 4) | 0;
          crowd.push({ src: R['fan' + v], M: alrTRS(wx, ly, wz, sd.yaw + Math.PI + (socHash(a, row) - 0.5) * 0.4), k1: null, side: sd.name, a, row });
        }
      }
    }
  }
  SU.crowdParts = crowd;
  socCrowdColours();
  // the lights: a tower at each corner
  SU.lights = [];
  if (S.floodlight) for (const sx of [-1, 1]) for (const sz of [-1, 1]) SU.lights.push(alrTRS(sx * (SOC.HL + 14), 0, sz * (SOC.HW + 14), Math.atan2(-sx, -sz)));
  SU.corners = [];
  if (S.standCorner) for (const sx of [-1, 1]) for (const sz of [-1]) SU.corners.push(alrTRS(sx * (SOC.HL + 8), 0, sz * (SOC.HW + 6), sx > 0 ? (sz > 0 ? 0 : Math.PI / 2) : (sz > 0 ? -Math.PI / 2 : Math.PI)));
}
function socHash(a, b) { let h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); }
// the crowd's colours: the home end and the away end in their kits, the sides mixed; rebuilt per match
function socCrowdColours() {
  if (!SU.crowdParts || !SU.crowdParts.length) { SU.crowd = []; return; }
  const M = soccer.m, home = M ? M.T[0].c1 : [0.9, 0.7, 0.2], away = M ? M.T[1].c1 : [0.8, 0.2, 0.2];
  const neutral = [[0.85, 0.85, 0.85], [0.25, 0.3, 0.4], [0.6, 0.15, 0.15], [0.2, 0.45, 0.25]];
  const by = {};
  for (const q of SU.crowdParts) {
    const r = socHash(q.a * 3, q.row);
    q.k1 = q.side === 'west' ? (r < 0.8 ? home : neutral[(r * 4) | 0]) : q.side === 'east' ? (r < 0.8 ? away : neutral[(r * 4) | 0]) : (r < 0.45 ? home : r < 0.8 ? away : neutral[(r * 7) % 4 | 0]);
    (by[q.side] = by[q.side] || []).push(q);
  }
  SU.crowd = Object.values(by).map((list) => sglMesh(sglMerge(list)));
}

// ---- the broadcast camera ----------------------------------------------------------------------------------------------
// From the research: the main camera sits on the halfway line, high and back, 12–15° down; pans with critical damping,
// leads the ball by ~0.4 s, shows ~40 m of pitch in tight play, wider on a counter, never far past a goal line.
function socCamStep(M, dt) {
  const B = M.ball, C = SU.cam || (SU.cam = { x: 0, z: 0, vx: 0, vz: 0, fov: 0.42, shake: 0 });
  let tx = B.x + B.vx * 0.4, tz = B.z * 0.55 + B.vz * 0.2;
  if (M.phase === 'restart' && M.restart && M.restart.kind === 'kickoff') { tx = 0; tz = 0; }
  tx = socClamp(tx, -SOC.HL + 16, SOC.HL - 16); tz = socClamp(tz, -18, 18);
  // a critically damped follow (ω ~ 4)
  const w = 3.6, k = w * w, c = 2 * w;
  C.vx += ((tx - C.x) * k - C.vx * c) * dt; C.vz += ((tz - C.z) * k - C.vz * c) * dt;
  C.x += C.vx * dt; C.z += C.vz * dt;
  // zoom: wider when the ball's flying fast / the play's spread
  const sp = Math.hypot(B.vx, B.vz);
  const want = M.phase === 'goal' ? 0.3 : socClamp(0.4 + sp * 0.006, 0.4, 0.54);
  C.fov += (want - C.fov) * Math.min(1, dt * 1.5);
  const portrait = SU.h > SU.w;
  const fov = portrait ? C.fov * 1.55 : C.fov;
  // (on the +z touchline, looking −z: that way screen-right is +x — from the −z side the picture came out mirrored)
  const eye = [C.x * 0.84, 18.5, 52 + C.z * 0.16];
  if (C.shake > 0) { C.shake -= dt; eye[0] += (Math.random() - 0.5) * C.shake; eye[1] += (Math.random() - 0.5) * C.shake; }
  return { eye, at: [C.x, 0, C.z * 0.92 - 1], fov, w: SU.w, h: SU.h, dpr: SU.dpr };
}

// ---- a player's pose: rigid parts from his state (run cycle, kick, tackle, slide, dive, header, celebrate, fall) ----------
const SOC_HIP = 0.86;
function socPose(p, out, k) {
  const A = p.act, t = p.actT || 0, sp = p.spd || 0, w = p.walk || 0, S = SU.meshes;
  const gk = p.role === 'GK';
  let hipY = SOC_HIP, lean = Math.min(0.32, sp * 0.032), roll = 0, yaw = p.face;
  const run = Math.min(1, sp / 6.5);
  let thL = Math.sin(w * 2) * 0.75 * run, thR = -thL, knL = Math.max(0, -Math.sin(w * 2 - 0.9)) * 1.1 * run + 0.08, knR = Math.max(0, Math.sin(w * 2 - 0.9)) * 1.1 * run + 0.08;
  let arL = -thL * 0.8, arR = -thR * 0.8, arLr = 0.12, arRr = -0.12;
  hipY += Math.abs(Math.cos(w * 2)) * 0.05 * run;
  if (sp < 0.4 && !A) { const br = Math.sin(performance.now() / 600 + p.id) * 0.02; hipY += br * 0.3; arL = 0.05; arR = -0.05; }
  if (A) {
    if (A.kind === 'kick') {
      const sd = A.side || 1, wind = A.wind || 0.12, u = socClamp(t / (wind + 0.15), 0, 1);
      // back-lift then follow-through on the kicking leg (right unless he's a left-footer), arms out for balance
      const ang = u < 0.55 ? 0.7 * (u / 0.55) : 0.7 - 2.2 * ((u - 0.55) / 0.45);
      const kn = u < 0.55 ? 1.25 * (u / 0.55) : 1.25 * (1 - (u - 0.55) / 0.45) + 0.1;
      if (sd > 0) { thR = ang; knR = kn; thL = -0.15; knL = 0.25; } else { thL = ang; knL = kn; thR = -0.15; knR = 0.25; }
      arL = -0.5; arR = 0.5; arLr = 0.7; arRr = -0.7; lean = -0.1 + u * 0.25;
    } else if (A.kind === 'tackle') {
      const u = socClamp(t / 0.4, 0, 1), e = Math.sin(u * Math.PI);
      thR = -1.0 * e; knR = 0.1; thL = 0.5 * e; knL = 0.9 * e; lean = 0.35 * e; hipY -= 0.18 * e; arL = 0.6; arR = -0.4;
    } else if (A.kind === 'slide') {
      // on his side along the turf, one leg out in front
      hipY = 0.32; lean = -1.25; thR = -1.35; knR = 0.05; thL = -0.6; knL = 1.4; arL = -2.2; arR = 0.6; arLr = 0.4;
    } else if (A.kind === 'dive') {
      const u = socClamp(t / (A.dur || 0.45), 0, 1), dz = A.dz || 1;
      // a keeper's dive: laid out sideways, arms at full stretch
      roll = -dz * 1.35 * Math.sin(Math.min(1, u * 1.3) * Math.PI / 2) * (p.T.dir > 0 ? 1 : -1);
      hipY = 0.5 + (A.y1 || 0.4) * Math.sin(u * Math.PI) * 0.9 + (u > 0.95 ? -0.15 : 0);
      if (t > A.dur) hipY = 0.3;
      arL = arR = -2.9; arLr = 0.3; arRr = -0.3; thL = -0.3; thR = 0.2; knL = knR = 0.5;
    } else if (A.kind === 'header') {
      const u = socClamp(t / 0.45, 0, 1); hipY += Math.sin(u * Math.PI) * 0.45; lean = 0.25 - Math.sin(u * Math.PI) * 0.5; arL = -0.9; arR = -0.9; arLr = 0.5; arRr = -0.5; thL = 0.3; thR = 0.3; knL = knR = 0.8;
    } else if (A.kind === 'celebrate') {
      const st = A.style || 0, e = performance.now() / 1000;
      if (st === 0) { arL = arR = -2.8; arLr = 0.25; arRr = -0.25; hipY += Math.abs(Math.sin(e * 6)) * 0.15; }           // arms up, bouncing
      else if (st === 1) { hipY = 0.45; lean = -0.6; thL = thR = -1.3; knL = knR = 2.2; arL = arR = -2.6; }                 // the knee slide
      else { arL = arR = 0; arLr = 1.5; arRr = -1.5; yaw += Math.sin(e * 3) * 0.6; lean = 0.25; roll = Math.sin(e * 3) * 0.3; }   // the aeroplane
    } else if (A.kind === 'fall') {
      const u = socClamp(t / 0.5, 0, 1); hipY = SOC_HIP - 0.55 * u; lean = 1.25 * u; arL = arR = -1.5 * u; thL = thR = -0.6 * u; knL = knR = 0.4;
    } else if (A.kind === 'throw') {
      const u = socClamp(t / 0.5, 0, 1); arL = arR = -2.9 + u * 2.2; arLr = 0.2; arRr = -0.2; lean = -0.2 + u * 0.4;
    }
  }
  // a keeper in his ready stance
  if (gk && !A && sp < 2.2) { arL = -0.5; arR = -0.5; arLr = 0.65; arRr = -0.65; knL = knR = 0.35; thL = thR = -0.2; hipY = SOC_HIP - 0.08; lean = 0.18; }
  const s = 1.0;
  const B = alrTRS(p.x, hipY, p.z, yaw, s, s, s, lean, roll);
  const body = gk ? S['p.bodyGK'] || S['p.body'] : S['p.body'], arm = gk ? S['p.armGK'] || S['p.arm'] : S['p.arm'];
  out.push({ mesh: body, M: B, k });
  const hair = p.hair && S['p.hair' + (p.hair - 1)]; if (hair) out.push({ mesh: hair, M: B, k });
  // the limbs (alrTRS pitch: +θ swings the foot backward — a forward thigh swing is negative)
  for (const [sx, th, kn] of [[-1, thL, knL], [1, thR, knR]]) {
    const T = alrMul(B, alrTRS(sx * 0.1, 0, 0, 0, 1, 1, 1, -th));
    out.push({ mesh: S['p.thigh'], M: T, k });
    out.push({ mesh: S['p.shin'], M: alrMul(T, alrTRS(0, -0.42, 0, 0, 1, 1, 1, kn)), k });
  }
  for (const [sx, ar, rr] of [[-1, arL, arLr], [1, arR, arRr]]) out.push({ mesh: arm, M: alrMul(B, alrTRS(sx * 0.25, 0.5, 0, 0, 1, 1, 1, ar, rr * sx * -1)), k });
}

// ---- the frame ------------------------------------------------------------------------------------------------------------
function socFrame(dt, w, h) {
  if (Math.abs(SU.w - window.innerWidth) > 2 || Math.abs(SU.h - window.innerHeight) > 2) socLayout();
  socPollPad();
  const M = soccer.m;
  if (M && SU.screen === 'match') {
    if (!SU.paused && !SU.replay) {
      socReadInput(M);
      SU.acc += Math.min(dt, 0.1);
      while (SU.acc >= SOC_DT) { socStep(M, SOC_DT); SU.acc -= SOC_DT; }
      socMatchFlow(M);
    }
    socEvents(M);
  }
  socRender(dt);
  if (typeof socAudioFrame === 'function') socAudioFrame(dt, M, SU.screen);
}
// half time, full time, the cup's next round
function socMatchFlow(M) {
  if (M.phase === 'halftime' && !SU.card) socCard('halftime');
  if (M.phase === 'over' && !SU.card && M.phaseT > 2.2) socFullTime(M);
}
// the event stream: messages, the commentary + crowd hooks, payouts, the camera's reactions
function socEvents(M) {
  // (by each event's running number: the list keeps only the last 200, so positions shift)
  if (SU.evM !== M) { SU.evM = M; SU.evN = M.evN || 0; }
  for (const e of M.events) {
    if (e.n <= SU.evN) continue;
    SU.evN = e.n;
    if (typeof socAudioEvent === 'function') socAudioEvent(e, M);
    if (e.kind === 'goal') {
      const T = M.T[e.team];
      socMsg(e.own ? 'OWN GOAL' : 'GOAL!', `${e.p && !e.own ? e.p.name + ' · ' : ''}${T.name}  ${M.score[0]}–${M.score[1]}`, T.k1, 3.6);
      if (SU.cam) SU.cam.shake = 0.6;
      if (M.human === e.team) socPay(M, 6, 'goal');
      SU.goalFlash = 1;
    } else if (e.kind === 'save' && e.great) socMsg('WHAT A SAVE', e.p.name, '#9be7ff', 1.6);
    else if (e.kind === 'yellow') socMsg('YELLOW CARD', e.p.name, '#f2d23a', 1.8);
    else if (e.kind === 'red') socMsg('RED CARD', e.p.name + ' is off', '#e83a2a', 2.4);
    else if (e.kind === 'penalty') socMsg('PENALTY!', M.T[e.team].name, '#ffffff', 2.2);
    else if (e.kind === 'offside') socMsg('OFFSIDE', e.p.name, '#ffffff', 1.4);
    else if (e.kind === 'corner') socMsg('CORNER', M.T[e.team].short, '#ffffff', 1.1);
    else if (e.kind === 'shootout') socMsg('PENALTIES', 'a shootout decides it', '#ffd23a', 3);
    else if (e.kind === 'pen_goal' || e.kind === 'pen_miss') socMsg(e.kind === 'pen_goal' ? 'SCORED' : 'MISSED', `${M.T[e.team].short}  ${M.pens.g[0]}–${M.pens.g[1]}`, e.kind === 'pen_goal' ? '#9bff9b' : '#ff8a7a', 1.6);
  }
}
function socMsg(big, small, col, secs) { SU.msg = { big, small, col: col || '#fff', t: 0, T: secs || 2 }; }

// ---- rendering ------------------------------------------------------------------------------------------------------------
function socRender(dt) {
  if (!SU.gl) return;
  const M = soccer.m;
  sglBegin();
  let cam;
  if (SU.replay) cam = socReplayFrame(dt);
  else if (M && SU.screen === 'match') cam = socCamStep(M, dt);
  else cam = socMenuCam(dt);
  sglCamera(cam, { x: cam.at[0], z: cam.at[2], r: 70 });
  // the ground, the boards, the stadium
  sglDraw(SU.pitch, socM(), { tex: SU.pitchTex, spec: 0.05, noCast: true });
  SU.adScroll = ((SU.adScroll || 0) + dt * 0.03) % 1;
  sglDraw(SU.ads, alrTRS(0, 0, 0, 0), { tex: SU.adsTex, spec: 0.1, noCast: true, add: [0.08, 0.08, 0.08] });
  sglDraw(SU.adsBack, socM(), { spec: 0.1 });
  for (const d of SU.standDraws || []) sglDraw(d.mesh, d.M, { k1: M ? M.T[0].c1 : [0.7, 0.2, 0.2], spec: 0.15, noCast: true });
  for (const c of SU.corners || []) sglDraw(SU.meshes.standCorner, c, { k1: M ? M.T[0].c1 : [0.7, 0.2, 0.2], spec: 0.15, noCast: true });
  // the crowd: bounces on a goal
  const jump = SU.goalFlash > 0 ? Math.abs(Math.sin(performance.now() / 120)) * 0.22 * SU.goalFlash : 0;
  if (SU.goalFlash > 0) SU.goalFlash = Math.max(0, SU.goalFlash - dt * 0.2);
  for (const c of SU.crowd || []) sglDraw(c, alrTRS(0, jump, 0, 0), { spec: 0.05, noCast: true });
  for (const L of SU.lights || []) sglDraw(SU.meshes.floodlight, L, { spec: 0.3, noCast: true });
  // the goals and the flags
  // (the model's mouth faces its +z: turned so it faces the pitch — +x end yaw −90°, −x end +90°; the first cut had
  // them the other way round, the nets out on the pitch and the mouths to the stands)
  for (const sx of [-1, 1]) sglDraw(SU.meshes.goal, alrTRS(sx * SOC.HL, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2), { spec: 0.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sglDraw(SU.meshes.flag, alrTRS(sx * SOC.HL, 0, sz * SOC.HW, socHash(sx, sz) * 6), { spec: 0.2 });
  // the players and the ball
  if (M && (SU.screen === 'match' || SU.replay)) {
    const parts = [];
    const src = SU.replay ? SU.replayPlayers : M.players;
    for (const p of src) {
      const T = p.T, gk = p.role === 'GK';
      const k = gk ? { k1: T.cgk, k2: T.cgk, k3: T.cgk } : { k1: T.c1, k2: T.c2, k3: T.c3 };
      socPose(p, parts, k);
      // a soft contact shadow under each (the shadow map does the real one; this grounds them at distance)
      sglGround(p.x, p.z, 0.45, 0.45, 0, 0, 0, 0, 0.28, 0, false, 0.02);
    }
    for (const q of parts) sglDraw(q.mesh, q.M, { k1: q.k.k1, k2: q.k.k2, k3: q.k.k3, spec: 0.3 });
    const B = SU.replay ? SU.replayBall : M.ball;
    const R = alrRotAxis(B.rax || [1, 0, 0], B.rot || 0);
    sglDraw(SU.meshes.ball, alrMul(alrTRS(B.x, B.y, B.z, 0), R), { spec: 0.6 });
    sglGround(B.x, B.z, 0.16, 0.16, 0, 0, 0, 0, 0.35 * socClamp(1.4 - B.y * 0.15, 0.2, 1), 0, false, 0.02);
    // the controlled player: a ring at his feet in his team colour
    if (!SU.replay && M.ctl && M.T[M.ctl.team].human) {
      const c = M.T[M.ctl.team].c1;
      sglGround(M.ctl.x, M.ctl.z, 0.85, 0.85, performance.now() / 700, c[0] * 1.2 + 0.2, c[1] * 1.2 + 0.2, c[2] * 1.2 + 0.2, 0.9, 4, true, 0.03);
    }
  }
  sglRender({ clear: [0.1, 0.14, 0.22], fogD: 95, fog: [0.32, 0.38, 0.48] });
  socHud(dt, M);
}
// a rotation of angle a about the unit axis ax (the rolling ball)
function alrRotAxis(ax, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = ax, m = new Float32Array(16);
  m[0] = t * x * x + c; m[1] = t * x * y + s * z; m[2] = t * x * z - s * y;
  m[4] = t * x * y - s * z; m[5] = t * y * y + c; m[6] = t * y * z + s * x;
  m[8] = t * x * z + s * y; m[9] = t * y * z - s * x; m[10] = t * z * z + c; m[15] = 1;
  return m;
}
// the menus' slow pan over the stadium
function socMenuCam(dt) {
  SU.menuT = (SU.menuT || 0) + dt;
  const a = SU.menuT * 0.05;
  return { eye: [Math.sin(a) * 70, 26 + Math.sin(a * 0.7) * 4, Math.cos(a) * 62], at: [0, 0, 0], fov: 0.62, w: SU.w, h: SU.h, dpr: SU.dpr };
}

// ---- the replay: the last seconds from M.replay, from behind the goal, slowed ----------------------------------------------
function socStartReplay(M) {
  const buf = M.replay.slice(-180);
  if (buf.length < 30) return false;
  SU.replay = { buf, i: 0, t: 0, M, team: M.celebrate ? M.celebrate.team : 0 };
  SU.replayPlayers = M.players.map((p) => Object.assign(Object.create(Object.getPrototypeOf(p)), p));
  SU.replayBall = Object.assign({}, M.ball);
  return true;
}
soccer.onReplay = (M) => { if (!socStartReplay(M)) { socKickoffSetup(M, 1 - M.celebrate.team); M.celebrate = null; } };
function socReplayFrame(dt) {
  const R = SU.replay, M = R.M;
  R.t += dt * 0.55 * 30;           // slow motion: 0.55× (the frames are 30 Hz)
  const i = Math.min(R.buf.length - 1, Math.floor(R.t)), f = R.buf[i];
  SU.replayBall.x = f.b[0]; SU.replayBall.y = f.b[1]; SU.replayBall.z = f.b[2]; SU.replayBall.rot = f.b[3]; SU.replayBall.rax = [f.b[4], 0, f.b[5]];
  SU.replayPlayers.forEach((p, k) => { const q = f.p[k]; if (!q) return; p.x = q[0]; p.z = q[1]; p.face = q[2]; p.spd = q[3]; p.walk = q[4]; p.act = q[5] ? { kind: q[5], side: q[7], dz: q[8], y1: q[9], dur: 0.45, wind: 0.12, style: 0 } : null; p.actT = q[6]; });
  if (i >= R.buf.length - 1 || SU.skipReplay) {
    SU.replay = null; SU.skipReplay = false;
    socKickoffSetup(M, 1 - R.team); M.celebrate = null;      // (the scoring side's kept on the replay: the celebration may be gone)
    return socCamStep(M, dt);
  }
  // behind the goal it went into, low, tracking the ball
  const last = R.buf[R.buf.length - 1].b, gx = Math.sign(last[0] || 1) * (SOC.HL + 9);      // (behind the goal it went in, the whole replay)
  return { eye: [gx, 4.2, f.b[2] * 0.4 - 4], at: [f.b[0] - Math.sign(gx) * 6, 1, f.b[2]], fov: 0.62, w: SU.w, h: SU.h, dpr: SU.dpr };
}

// ---- the HUD (2D over the GL): the score bug, the radar, the player's tag, the power bar, the messages ----------------------
function socHud(dt, M) {
  const g = SU.g, W = SU.w, H = SU.h;
  g.setTransform(SU.dpr, 0, 0, SU.dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!M || (SU.screen !== 'match')) return;
  const font = (wt, px) => `${wt} ${px}px "Avenir Next Condensed", "Bahnschrift", "Roboto Condensed", "Arial Narrow", sans-serif`;
  const css = (c) => `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
  // the score bug, top left
  const x0 = 16, y0 = 14, h = 30;
  g.fillStyle = 'rgba(10,14,20,0.88)'; g.fillRect(x0, y0, 252, h);
  g.fillStyle = css(M.T[0].c1); g.fillRect(x0, y0, 6, h); g.fillStyle = css(M.T[1].c1); g.fillRect(x0 + 124, y0, 6, h);
  g.font = font(700, 17); g.fillStyle = '#fff'; g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillText(M.T[0].short, x0 + 14, y0 + h / 2 + 1); g.fillText(M.T[1].short, x0 + 138, y0 + h / 2 + 1);
  g.textAlign = 'center'; g.font = font(800, 19); g.fillText(String(M.score[0]), x0 + 104, y0 + h / 2 + 1); g.fillText(String(M.score[1]), x0 + 226, y0 + h / 2 + 1);
  const mm = Math.floor(M.clock / 60), ss = Math.floor(M.clock % 60);
  g.fillStyle = 'rgba(10,14,20,0.88)'; g.fillRect(x0 + 252, y0, 66, h);
  g.fillStyle = '#d9a23a'; g.font = font(700, 16); g.fillText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, x0 + 285, y0 + h / 2 + 1);
  if (M.pens && M.phase === 'pens') { g.fillStyle = 'rgba(10,14,20,0.88)'; g.fillRect(x0, y0 + h + 4, 252, 24); g.fillStyle = '#fff'; g.font = font(600, 14); g.fillText(`PENALTIES  ${M.pens.g[0]} – ${M.pens.g[1]}`, x0 + 126, y0 + h + 16); }
  // the controlled player's tag + the shot power bar
  if (M.ctl && !SU.replay && M.T[M.ctl.team].human) {
    const P = sglProject(M.ctl.x, 2.25, M.ctl.z);
    if (P) {
      g.font = font(700, 13); g.textAlign = 'center';
      const label = `${M.ctl.num}  ${M.ctl.name.split(' ')[1] || M.ctl.name}`, tw = g.measureText(label).width + 14;
      g.fillStyle = 'rgba(10,14,20,0.78)'; g.fillRect(P[0] - tw / 2, P[1] - 22, tw, 18);
      g.fillStyle = css(M.T[M.ctl.team].c1); g.beginPath(); g.moveTo(P[0] - 6, P[1] - 4); g.lineTo(P[0] + 6, P[1] - 4); g.lineTo(P[0], P[1] + 4); g.fill();
      g.fillStyle = '#fff'; g.fillText(label, P[0], P[1] - 12);
      if (M.shoot) {
        const pw = socClamp(M.shoot.t / 0.9, 0, 1.2), bw = 64;
        g.fillStyle = 'rgba(10,14,20,0.8)'; g.fillRect(P[0] - bw / 2 - 2, P[1] + 52, bw + 4, 10);
        g.fillStyle = pw > 1 ? '#e8543a' : pw > 0.75 ? '#e8b53a' : '#7fe08a'; g.fillRect(P[0] - bw / 2, P[1] + 54, bw * Math.min(1, pw), 6);
      }
    }
  }
  // the radar, bottom centre: the pitch and every player as a dot
  const rw = SU.padOn ? Math.min(150, W * 0.18) : Math.min(220, W * 0.34), rh = rw * 68 / 105, rx = W / 2 - rw / 2, ry = H - rh - (SU.padOn ? 8 : 16);
  {
    g.fillStyle = 'rgba(10,30,14,0.62)'; g.fillRect(rx, ry, rw, rh);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; g.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    g.beginPath(); g.moveTo(rx + rw / 2, ry); g.lineTo(rx + rw / 2, ry + rh); g.stroke();
    const RX = (x) => rx + (x + SOC.HL) / (SOC.HL * 2) * rw, RZ = (z) => ry + (z + SOC.HW) / (SOC.HW * 2) * rh;
    for (const p of M.players) { g.fillStyle = p === M.ctl ? '#fff' : css(p.T.c1); g.beginPath(); g.arc(RX(p.x), RZ(p.z), p === M.ctl ? 3.4 : 2.4, 0, 7); g.fill(); }
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(RX(M.ball.x), RZ(M.ball.z), 2.6, 0, 7); g.fill();
  }
  // a message (GOAL!, CORNER …)
  if (SU.msg) {
    const m = SU.msg; m.t += dt;
    const a = Math.min(1, m.t * 5, (m.T - m.t) * 3);
    if (m.t > m.T) SU.msg = null;
    else {
      g.globalAlpha = Math.max(0, a);
      const big = m.big === 'GOAL!' || m.big === 'OWN GOAL';
      g.fillStyle = 'rgba(10,14,20,0.85)'; const bw = big ? Math.min(W - 40, 520) : 300, bh = big ? 92 : 58, by = H * (big ? 0.3 : 0.2);
      g.fillRect(W / 2 - bw / 2, by, bw, bh);
      g.fillStyle = typeof m.col === 'string' ? m.col : css(socHex(m.col)); g.fillRect(W / 2 - bw / 2, by, bw, 4);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = font(800, big ? 54 : 26); g.fillText(m.big, W / 2, by + (big ? 44 : 24));
      g.font = font(500, big ? 16 : 13); g.fillStyle = '#c9d3dc'; g.fillText(m.small || '', W / 2, by + bh - 14);
      g.globalAlpha = 1;
    }
  }
  if (SU.replay) { g.fillStyle = 'rgba(10,14,20,0.85)'; g.fillRect(W - 120, 16, 104, 26); g.fillStyle = '#d9a23a'; g.font = font(700, 15); g.textAlign = 'center'; g.fillText('REPLAY', W - 68, 30); g.fillStyle = '#9fb0c2'; g.font = font(500, 11); g.fillText(SU.padOn ? 'tap to skip' : 'any key to skip', W - 68, 52); }
}

// ---- input ----------------------------------------------------------------------------------------------------------------
// keyboard: FIFA's classic Arrows preset (arrows move · S pass · A lob · W through · D shoot · E sprint · Q switch) and
// the arcade-wide WASD side (WASD move · J pass · K shoot · L through · I lob · Shift sprint · Q switch). On defence
// pass = tackle (hold to jockey), shoot = slide, through = team-mate press.
const SOC_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  pass: ['KeyJ', 'Space'], shoot: ['KeyK'], through: ['KeyL'], lob: ['KeyI'], sprint: ['ShiftLeft', 'ShiftRight', 'KeyE'], switch: ['KeyQ'],
};
// (with the arrows moving, S/A/W/D are FIFA's pass/lob/through/shoot — a player on the arrows has those free)
function socKeyDown(e) {
  if (!soccer.on) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (typeof socAudioWake === 'function') socAudioWake();
  const k = e.code;
  if (SU.replay) { SU.skipReplay = true; e.preventDefault(); return; }
  if (k === 'Escape') { e.preventDefault(); if (SU.screen === 'match') socTogglePause(); return; }
  if (k === 'KeyM' && typeof socAudioToggle === 'function') { socAudioToggle('sound'); return; }
  if (k === 'KeyN' && typeof socAudioToggle === 'function') { socAudioToggle('music'); return; }
  if (k === 'KeyV' && typeof socAudioToggle === 'function') { socAudioToggle('voice'); return; }
  if (SU.screen !== 'match') { if (k === 'Enter' || k === 'Space') { const b = SU.menu.querySelector('[data-default]'); if (b) { e.preventDefault(); b.click(); } } return; }
  if (!SU.keys[k]) socPress(socKeyAct(k), true);
  SU.keys[k] = true;
  if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
}
function socKeyUp(e) { if (!soccer.on) return; const k = e.code; SU.keys[k] = false; socPress(socKeyAct(k), false); }
function socKeyAct(k) {
  const arrows = SU.keys.ArrowUp || SU.keys.ArrowDown || SU.keys.ArrowLeft || SU.keys.ArrowRight || SU.lastArrows;
  if (k.startsWith('Arrow')) SU.lastArrows = true;
  if (k === 'KeyW' || k === 'KeyA' || k === 'KeyS' || k === 'KeyD') { if (SU.lastArrows) return { KeyS: 'pass', KeyA: 'lob', KeyW: 'through', KeyD: 'shoot' }[k]; SU.lastArrows = false; return null; }
  void arrows;
  for (const a in SOC_KEYS) if (SOC_KEYS[a].includes(k)) return a;
  return null;
}
// a button went down / up (keyboard, pad or touch all come through here)
function socPress(a, down) {
  const M = soccer.m; if (!M || !a) return;
  const I = M.input;
  if (a === 'shoot') { if (down) { I.shootHeld = true; M.shoot = { t: 0 }; I.slide = true; } else { if (I.shootHeld) I.shootUp = true; I.shootHeld = false; } return; }
  if (a === 'pass') { if (down) { I.pass = true; I.tackle = true; I.tackleHeld = true; } else I.tackleHeld = false; return; }
  if (a === 'through') { if (down) { I.through = true; I.press = true; } else I.press = false; return; }
  if (a === 'lob' && down) { I.lob = true; return; }
  if (a === 'switch' && down) { I.switch = true; return; }
  if (a === 'sprint') { SU.held.sprint = down; return; }
}
function socReadInput(M) {
  const I = M.input, K = SU.keys;
  SU.flagAge = SU.flagAge || {};
  for (const f of ['pass', 'through', 'lob', 'shootUp', 'switch', 'tackle', 'slide']) { if (I[f]) { SU.flagAge[f] = (SU.flagAge[f] || 0) + 1; if (SU.flagAge[f] > 24) I[f] = false; } else SU.flagAge[f] = 0; }
  let x = 0, z = 0;
  // (with the arrows, W/A/S/D are buttons; otherwise they move)
  const wasd = !SU.lastArrows;
  if (K.ArrowRight || wasd && K.KeyD) x += 1; if (K.ArrowLeft || wasd && K.KeyA) x -= 1;
  if (K.ArrowUp || wasd && K.KeyW) z -= 1; if (K.ArrowDown || wasd && K.KeyS) z += 1;     // (up the screen = away = −z)
  // the pad's stick / the touch stick
  if (SU.padStick && Math.hypot(SU.padStick[0], SU.padStick[1]) > 0.18) { x = SU.padStick[0]; z = SU.padStick[1]; }
  if (SU.stick && SU.stick.on) { x = SU.stick.x; z = SU.stick.z; }
  I.x = x; I.z = z;
  I.sprint = !!(SU.held.sprint || (SU.stick && SU.stick.sprint) || SU.padSprint);
  // team-mate press: the second-nearest defender closes the carrier (FIFA's RB)
  if (I.press && M.ball.owner && M.ball.owner.team !== M.human) {
    const T = M.T[M.human]; const q = T.players.filter((p) => p !== M.ctl && p.role !== 'GK').sort((a, b) => Math.hypot(a.x - M.ball.x, a.z - M.ball.z) - Math.hypot(b.x - M.ball.x, b.z - M.ball.z))[0];
    if (q && !q.act) socSteer(q, M.ball.x, M.ball.z, true, SOC_DT, false);
  }
}
// the gamepad (standard mapping): A pass · B shoot · Y through · X lob · RT sprint · LB switch · RB press · Start pause
function socPollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && Array.from(pads).find((p) => p && p.connected);
  if (!gp) { SU.padStick = null; return; }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  SU.padStick = [ax, ay];
  const map = [[0, 'pass'], [1, 'shoot'], [3, 'through'], [2, 'lob'], [4, 'switch'], [5, 'through']];
  for (const [i, a] of map) { const d = !!(gp.buttons[i] && gp.buttons[i].pressed); if (d !== !!SU.lastPad[i]) { SU.lastPad[i] = d; if (SU.screen === 'match') socPress(a, d); else if (d && i === 0) { const b = SU.menu.querySelector('[data-default]'); if (b) b.click(); } } }
  SU.padSprint = !!(gp.buttons[7] && gp.buttons[7].value > 0.3);
  const st = !!(gp.buttons[9] && gp.buttons[9].pressed); if (st && !SU.lastPad[9] && SU.screen === 'match') socTogglePause(); SU.lastPad[9] = st;
}

// ---- 📱 THE PHONE: a floating stick (push past the ring = sprint) and context buttons ----------------------------------------
function socPadOn() {
  if (SU.padOn || !SU.pad) return;
  SU.padOn = true;
  document.body.classList.add('soc-touch');
  SU.pad.hidden = false;
  SU.pad.innerHTML = `<div class="socp-stick"><i></i></div>
    <button class="socp-b" data-slot="B0" data-c="#2aa84a"><span class="socp-l"></span></button>
    <button class="socp-b" data-slot="B1" data-c="#c8302a"><span class="socp-l"></span></button>
    <button class="socp-b" data-slot="B2" data-c="#2a5bc8"><span class="socp-l"></span></button>
    <button class="socp-b" data-slot="B3" data-c="#d9a23a"><span class="socp-l"></span></button>
    <button class="socp-pause" aria-label="pause">II</button>`;
  SU.stick = { on: false, x: 0, z: 0, id: null, cx: 0, cy: 0, sprint: false };
  const st = SU.pad.querySelector('.socp-stick');
  // the stick: anywhere on the left 45% of the screen; it centres where the thumb lands
  soccerWorld.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || SU.screen !== 'match') return;
    if (e.target.closest('.socp-b, .socp-pause')) return;
    if (SU.replay) { SU.skipReplay = true; return; }
    if (e.clientX > SU.w * 0.45 || SU.stick.on) return;
    Object.assign(SU.stick, { on: true, id: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, z: 0, sprint: false });
    st.style.left = e.clientX + 'px'; st.style.top = e.clientY + 'px'; st.classList.add('live');
  });
  window.addEventListener('pointermove', (e) => {
    const S = SU.stick; if (!S.on || e.pointerId !== S.id) return;
    const R = 52, dx = e.clientX - S.cx, dy = e.clientY - S.cy, d = Math.hypot(dx, dy);
    S.x = socClamp(dx / R, -1.4, 1.4); S.z = socClamp(dy / R, -1.4, 1.4); S.sprint = d > R * 1.25;
    const k = Math.min(1, R * 1.2 / (d || 1));
    st.querySelector('i').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    st.classList.toggle('sprint', S.sprint);
  });
  const end = (e) => { const S = SU.stick; if (!S.on || e.pointerId !== S.id) return; S.on = false; S.x = S.z = 0; S.sprint = false; st.classList.remove('live', 'sprint'); st.querySelector('i').style.transform = ''; };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  // the buttons: what each does depends on the moment
  for (const b of SU.pad.querySelectorAll('.socp-b')) {
    b.style.setProperty('--c', b.dataset.c);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); b.setPointerCapture(e.pointerId); const a = b.dataset.act; if (a) socPress(a, true); });
    const up = () => { b.classList.remove('on'); const a = b.dataset.act; if (a) socPress(a, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  SU.pad.querySelector('.socp-pause').addEventListener('click', () => socTogglePause());
  socPadLabels();
}
// attack: PASS (big) · SHOOT (hold for power) · THROUGH · LOB/CROSS — defence: TACKLE (hold = jockey) · SLIDE · PRESS · SWITCH
function socPadLabels() {
  if (!SU.padOn) return;
  const M = soccer.m, att = !M || (M.ball.owner && M.ball.owner.team === M.human) || (M.restart && M.restart.team === M.human);
  const key = att ? 'att' : 'def';
  if (SU.padKey === key) return;
  SU.padKey = key;
  const spec = att ? [['pass', 'PASS'], ['shoot', 'SHOOT'], ['through', 'THROUGH'], ['lob', 'LOB']] : [['pass', 'TACKLE'], ['shoot', 'SLIDE'], ['through', 'PRESS'], ['switch', 'SWITCH']];
  SU.pad.querySelectorAll('.socp-b').forEach((b, i) => { b.dataset.act = spec[i][0]; b.querySelector('.socp-l').textContent = spec[i][1]; });
}
setInterval(() => { if (soccer.on) { socPadLabels(); if (SU.pad && SU.padOn) SU.pad.hidden = SU.screen !== 'match'; } }, 150);

// ---- pause, the menus, the cup -------------------------------------------------------------------------------------------
function socTogglePause() {
  if (SU.screen !== 'match') return;
  SU.paused = !SU.paused;
  if (SU.paused) socCard('pause'); else socCardClose();
}
function socCardClose() { SU.card = null; SU.menu.innerHTML = ''; }
function socTeamBadge(T) { return `<span class="soc-kit" style="--a:${T.k1};--b:${T.k2}"></span>`; }
function socShowTitle() {
  SU.screen = 'title'; SU.card = null; SU.paused = false;
  const cfg = SU.cfg || (SU.cfg = socLoadCfg());
  const cup = socCupLoad();
  SU.menu.innerHTML = `<div class="soc-title">
    <div class="soc-logo"><span>NUGGET</span><b>SOCCER</b></div>
    <div class="soc-sub">11 a side · the Nugget Cup</div>
    <div class="soc-row">
      <button class="soc-big" data-act="quick" data-default>Quick match</button>
      <button class="soc-big" data-act="cup">${cup && !cup.done ? 'Nugget Cup — continue' : 'Nugget Cup'}</button>
    </div>
    <div class="soc-opts">
      <div class="soc-opt"><label>Difficulty</label><div class="soc-seg" data-k="tier">${SOC_TIERS.map((t, i) => `<button data-v="${i}" class="${cfg.tier === i ? 'on' : ''}" title="${t.blurb}">${t.name}</button>`).join('')}</div></div>
      <div class="soc-opt"><label>Half length</label><div class="soc-seg" data-k="half">${SOC_HALF_SECS.map((s, i) => `<button data-v="${i}" class="${cfg.half === i ? 'on' : ''}">${s / 60} min</button>`).join('')}</div></div>
    </div>
    <div class="soc-keys">${SU.padOn ? 'Left thumb: move (push past the ring to sprint) · right: PASS · SHOOT (hold for power) · THROUGH · LOB — on defence TACKLE · SLIDE · PRESS · SWITCH' : 'Arrows/WASD move · J pass · K shoot (hold for power) · L through ball · I lob/cross · Shift sprint · Q switch · defence: J tackle (hold to jockey) · K slide · L team-mate press · Esc pause · M sound · N music · V commentary · FIFA\'s arrow layout works too (S pass · A lob · W through · D shoot · E sprint)'}</div>
  </div>`;
}
function socLoadCfg() { try { return Object.assign({ tier: 1, half: 1, team: 'rovers', opp: 'sauce' }, JSON.parse(localStorage.getItem('nugSoccerCfg') || '{}')); } catch (e) { return { tier: 1, half: 1, team: 'rovers', opp: 'sauce' }; } }
function socSaveCfg() { try { localStorage.setItem('nugSoccerCfg', JSON.stringify(SU.cfg)); } catch (e) { /* private mode */ } }
// a club's overall, FIFA-style (the ratings 0.70–0.75 spread out to the 70s and low 80s)
function socOvr(T) { const a = (T.r.pace + T.r.pass + T.r.shot + T.r.def + T.r.gk) / 5; return Math.round(60 + (a - 0.6) * 150); }
function socPickTeams(mode) {
  SU.screen = 'pick'; const cfg = SU.cfg;
  SU.pickMode = mode;
  const card = (T, k) => `<button class="soc-club ${cfg[k] === T.id ? 'on' : ''}" data-club="${T.id}" data-k="${k}">${socTeamBadge(T)}<b>${T.name}</b><span>${T.style}</span><i>OVR ${socOvr(T)}</i></button>`;
  SU.menu.innerHTML = `<div class="soc-pick">
    <h2>${mode === 'cup' ? 'The Nugget Cup — pick your club' : 'Quick match'}</h2>
    <div class="soc-pickcols">
      <div><h3>Your club</h3><div class="soc-clubs">${SOC_TEAMS.map((T) => card(T, 'team')).join('')}</div></div>
      ${mode === 'cup' ? '' : `<div><h3>Opponent</h3><div class="soc-clubs">${SOC_TEAMS.map((T) => card(T, 'opp')).join('')}</div></div>`}
    </div>
    <div class="soc-row"><button class="soc-ghost" data-act="title">Back</button><button class="soc-big" data-act="${mode === 'cup' ? 'cupstart' : 'kickoff'}" data-default>${mode === 'cup' ? 'Enter the cup' : 'Kick off'}</button></div>
  </div>`;
}
function socMenuClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (typeof socAudioWake === 'function') socAudioWake();
  if (typeof socAudioClick === 'function') socAudioClick();
  const cfg = SU.cfg, a = b.dataset.act;
  if (b.parentNode && b.parentNode.classList.contains('soc-seg')) { cfg[b.parentNode.dataset.k] = +b.dataset.v; socSaveCfg(); b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); return; }
  if (b.dataset.club) { cfg[b.dataset.k] = b.dataset.club; if (cfg.team === cfg.opp) cfg[b.dataset.k === 'team' ? 'opp' : 'team'] = SOC_TEAMS.find((t) => t.id !== b.dataset.club).id; socSaveCfg(); socPickTeams(SU.pickMode); return; }
  if (a === 'quick') socPickTeams('quick');
  else if (a === 'cup') { const c = socCupLoad(); if (c && !c.done) socShowCup(); else socPickTeams('cup'); }
  else if (a === 'title') socShowTitle();
  else if (a === 'kickoff') socStartMatch({ home: cfg.team, away: cfg.opp, cup: false });
  else if (a === 'cupstart') { socCupNew(cfg.team, cfg.tier); socShowCup(); }
  else if (a === 'cupplay') socCupPlay();
  else if (a === 'cupquit') { socCupClear(); socShowTitle(); }
  else if (a === 'resume') socTogglePause();
  else if (a === 'second') { socCardClose(); socSecondHalf(soccer.m); }
  else if (a === 'done') socAfterMatch();
  else if (a === 'rematch') { const M = soccer.m; socStartMatch({ home: M.T[0].id, away: M.T[1].id, cup: false }); }
  else if (a === 'quit') { if (SU.screen === 'match' && soccer.m && soccer.m.phase !== 'over') { SU.paused = false; socCardClose(); socShowTitle(); soccer.m = null; } else if (typeof stopStorm === 'function') stopStorm(); }
  else if (a === 'leave' && typeof stopStorm === 'function') stopStorm();
}
function socStartMatch(o) {
  const cfg = SU.cfg;
  const M = socNewMatch({ home: o.home, away: o.away, human: 0, tier: cfg.tier, halfSecs: SOC_HALF_SECS[cfg.half], cup: !!o.cup });
  M.round = o.round;
  SU.screen = 'match'; SU.card = null; SU.paused = false; SU.acc = 0; SU.cam = null; SU.msg = null; SU.evM = null;
  SU.menu.innerHTML = '';
  socCrowdColours();
  M.ctl = M.T[0].players.find((p) => p.role === 'FW');
  socMsg(M.T[0].name, `v ${M.T[1].name}${o.round ? ' · ' + o.round : ''}`, M.T[0].k1, 3);
  if (typeof socAudioMatch === 'function') socAudioMatch(M);
}
function socCard(kind) {
  const M = soccer.m; SU.card = kind;
  const st = M.stats, tot = st.possT[0] + st.possT[1] || 1;
  const stats = `<table class="soc-stats"><tr><td>${M.T[0].short}</td><th></th><td>${M.T[1].short}</td></tr>
    <tr><td>${Math.round(st.possT[0] / tot * 100)}%</td><th>Possession</th><td>${Math.round(st.possT[1] / tot * 100)}%</td></tr>
    <tr><td>${st.shots[0]}</td><th>Shots</th><td>${st.shots[1]}</td></tr>
    <tr><td>${st.onT[0]}</td><th>On target</th><td>${st.onT[1]}</td></tr>
    <tr><td>${st.passOk[0]}/${st.passes[0]}</td><th>Passes</th><td>${st.passOk[1]}/${st.passes[1]}</td></tr>
    <tr><td>${st.corners[0]}</td><th>Corners</th><td>${st.corners[1]}</td></tr>
    <tr><td>${st.fouls[0]}</td><th>Fouls</th><td>${st.fouls[1]}</td></tr></table>`;
  const score = `<div class="soc-score">${socTeamBadge(M.T[0])}<b>${M.T[0].name}</b><em>${M.score[0]} – ${M.score[1]}</em><b>${M.T[1].name}</b>${socTeamBadge(M.T[1])}</div>`;
  if (kind === 'pause') SU.menu.innerHTML = `<div class="soc-card"><h2>Paused</h2>${score}<div class="soc-row"><button class="soc-big" data-act="resume" data-default>Resume</button><button class="soc-ghost" data-act="quit">Quit match</button></div></div>`;
  if (kind === 'halftime') SU.menu.innerHTML = `<div class="soc-card"><h2>Half time</h2>${score}${stats}<div class="soc-row"><button class="soc-big" data-act="second" data-default>Second half</button></div></div>`;
}
function socFullTime(M) {
  SU.card = 'full';
  const won = M.pens && M.pens.done ? M.pens.win === M.human : M.score[M.human] > M.score[1 - M.human];
  const draw = !M.pens && M.score[0] === M.score[1];
  if (!M.paid) { M.paid = true; if (won) socPay(M, 12, 'win'); else if (draw) socPay(M, 4, 'draw'); if (M.score[1 - M.human] === 0) socPay(M, 2, 'clean sheet'); }
  const res = won ? 'You win' : draw ? 'A draw' : 'Defeat';
  const pens = M.pens ? ` <small>(${M.pens.g[0]}–${M.pens.g[1]} on penalties)</small>` : '';
  const st = M.stats, tot = st.possT[0] + st.possT[1] || 1;
  SU.menu.innerHTML = `<div class="soc-card"><h2>Full time — ${res}</h2>
    <div class="soc-score">${socTeamBadge(M.T[0])}<b>${M.T[0].name}</b><em>${M.score[0]} – ${M.score[1]}${pens}</em><b>${M.T[1].name}</b>${socTeamBadge(M.T[1])}</div>
    <table class="soc-stats"><tr><td>${Math.round(st.possT[0] / tot * 100)}%</td><th>Possession</th><td>${Math.round(st.possT[1] / tot * 100)}%</td></tr><tr><td>${st.shots[0]}</td><th>Shots</th><td>${st.shots[1]}</td></tr><tr><td>${st.passOk[0]}/${st.passes[0]}</td><th>Passes</th><td>${st.passOk[1]}/${st.passes[1]}</td></tr></table>
    <p class="soc-earn">${soccer.earned ? `+${soccer.earned.toLocaleString()} nuggets this session` : ''}</p>
    <div class="soc-row">${M.cup ? `<button class="soc-big" data-act="done" data-default>Continue</button>` : `<button class="soc-big" data-act="rematch" data-default>Rematch</button><button class="soc-ghost" data-act="title">Menu</button>`}</div></div>`;
}
function socAfterMatch() {
  const M = soccer.m;
  if (M.cup) { socCupResult(M); socShowCup(); return; }
  socShowTitle();
}

// ---- the Nugget Cup: eight clubs, three rounds, saved in this browser -------------------------------------------------------
const SOC_ROUNDS = ['Quarter-final', 'Semi-final', 'Final'];
function socCupLoad() { try { return JSON.parse(localStorage.getItem('nugSoccerCup') || 'null'); } catch (e) { return null; } }
function socCupSave(c) { try { localStorage.setItem('nugSoccerCup', JSON.stringify(c)); } catch (e) { /* */ } }
function socCupClear() { try { localStorage.removeItem('nugSoccerCup'); } catch (e) { /* */ } }
function socCupNew(team, tier) {
  const others = SOC_TEAMS.map((t) => t.id).filter((id) => id !== team).sort(() => Math.random() - 0.5);
  const draw = [team, ...others];
  // the quarter-finals: you v a random club, the rest paired
  const qf = [[draw[0], draw[1]], [draw[2], draw[3]], [draw[4], draw[5]], [draw[6], draw[7]]];
  const cup = { team, tier, round: 0, ties: [qf], results: [[]], done: false, won: false };
  socCupSave(cup);
}
function socCupTie(cup) { return cup.ties[cup.round].find((t) => t.includes(cup.team)); }
function socShowCup() {
  const cup = socCupLoad(); if (!cup) { socShowTitle(); return; }
  SU.screen = 'cup';
  const name = (id) => (SOC_TEAMS.find((t) => t.id === id) || {}).name || id;
  const col = (r) => `<div class="soc-round"><h3>${SOC_ROUNDS[r]}</h3>${(cup.ties[r] || []).map((t, i) => { const res = cup.results[r] && cup.results[r][i]; return `<div class="soc-tie${t.includes(cup.team) ? ' mine' : ''}">${t.map((id, j) => `<span class="${res && res.win === j ? 'w' : ''}">${socTeamBadge(SOC_TEAMS.find((x) => x.id === id))}${name(id)}${res ? `<em>${res.score[j]}${res.pens ? ` (${res.pens[j]})` : ''}</em>` : ''}</span>`).join('')}</div>`; }).join('') || '<div class="soc-tie tbd">—</div>'}</div>`;
  const tie = !cup.done && socCupTie(cup);
  SU.menu.innerHTML = `<div class="soc-cup">
    <h2>The Nugget Cup <small>${SOC_TIERS[cup.tier].name}</small></h2>
    <div class="soc-bracket">${col(0)}${col(1)}${col(2)}</div>
    <div class="soc-row">${cup.done ? `<p class="soc-res">${cup.won ? 'Champions! The Nugget Cup is yours.' : 'Knocked out. Next year.'}</p><button class="soc-big" data-act="cupquit" data-default>${cup.won ? 'Lift it again' : 'Try again'}</button>` : `<button class="soc-ghost" data-act="cupquit">Abandon cup</button><button class="soc-big" data-act="cupplay" data-default>Play the ${SOC_ROUNDS[cup.round].toLowerCase()}${tie ? ` v ${name(tie.find((id) => id !== cup.team))}` : ''}</button>`}</div>
  </div>`;
}
function socCupPlay() {
  const cup = socCupLoad(), tie = socCupTie(cup);
  SU.cfg.tier = cup.tier;
  socStartMatch({ home: tie[0] === cup.team ? tie[0] : tie[1], away: tie[0] === cup.team ? tie[1] : tie[0], cup: true, round: SOC_ROUNDS[cup.round] });
}
function socCupResult(M) {
  const cup = socCupLoad(); if (!cup) return;
  const r = cup.round, ties = cup.ties[r];
  cup.results[r] = ties.map((t) => {
    if (t.includes(cup.team)) {
      const mine = t.indexOf(cup.team), h = M.human;
      const s = mine === 0 ? M.score.slice() : [M.score[1], M.score[0]];
      const pens = M.pens ? (mine === 0 ? M.pens.g.slice() : [M.pens.g[1], M.pens.g[0]]) : null;
      const win = M.pens && M.pens.done ? (M.pens.win === h ? mine : 1 - mine) : (M.score[h] > M.score[1 - h] ? mine : 1 - mine);
      return { score: s, pens, win };
    }
    // the other ties: played headless, at the cup's difficulty
    const R = soccerDebug.match({ home: t[0], away: t[1], human: -1, tier: cup.tier, halfSecs: 60, cup: true });
    return { score: R.score, pens: R.pens, win: R.pens ? (R.pens[0] > R.pens[1] ? 0 : 1) : (R.score[0] > R.score[1] ? 0 : 1) };
  });
  const winners = ties.map((t, i) => t[cup.results[r][i].win]);
  if (!winners.includes(cup.team)) { cup.done = true; cup.won = false; }
  else if (r === 2) { cup.done = true; cup.won = true; socPay(M, 40, 'the Nugget Cup'); }
  else { cup.round++; const nx = []; for (let i = 0; i < winners.length; i += 2) nx.push([winners[i], winners[i + 1]]); cup.ties[cup.round] = nx; cup.results[cup.round] = []; }
  socCupSave(cup);
  soccer.m = M;      // (the headless ties replaced soccer.m: put ours back for the menu's background)
}
