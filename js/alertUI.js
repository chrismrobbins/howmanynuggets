// ---- 🚨 NUGGET ALERT — the screen ----------------------------------------------------------------------------
// The world render (terrain, ore, scenery, buildings and their moving parts, units, wrecks, effects), the
// RA2-style sidebar (credits · radar · power · tabs · cameos with the clock wipe), selection and
// commands, the keyboard, a synth for the guns, and the end card. The rules live in js/alert.js.

const ALR_SIDE_W = 236;

// ---- setup ---------------------------------------------------------------------------------------------------
function alrUIInit() {
  const root = document.createElement('div');
  root.className = 'alr-root';
  root.innerHTML = `
    <canvas class="alr-gl"></canvas>
    <canvas class="alr-ov"></canvas>
    <div class="alr-msgs"></div>
    <aside class="alr-side">
      <div class="alr-brand"><span class="alr-logo">NUGGET ALERT</span><span class="alr-cash">$ 0</span></div>
      <div class="alr-radar-wrap"><canvas class="alr-radar" width="420" height="420"></canvas><div class="alr-radar-off">NO RADAR</div></div>
      <div class="alr-mid">
        <div class="alr-power" title="power: made / used"><div class="alr-pow-use"></div><div class="alr-pow-make"></div></div>
        <div class="alr-build">
          <div class="alr-tabs"></div>
          <div class="alr-grid"></div>
        </div>
      </div>
      <div class="alr-btns">
        <button type="button" data-act="sell" title="sell a building (click it)">$ SELL</button>
        <button type="button" data-act="repair" title="repair a building (click it)">🔧 FIX</button>
        <button type="button" data-act="menu" title="menu (Esc)">☰</button>
      </div>
    </aside>
    <div class="alr-card alr-load" hidden><div class="alr-card-t">DEPLOYING</div><div class="alr-card-s">surveying the battlefield…</div></div>
    <div class="alr-card alr-menu" hidden>
      <div class="alr-card-t">PAUSED</div>
      <button type="button" data-act="resume">RESUME</button>
      <button type="button" data-act="keys">CONTROLS</button>
      <button type="button" data-act="surrender">SURRENDER</button>
      <button type="button" data-act="leave">LEAVE THE ARCADE</button>
      <div class="alr-keys" hidden>
        <b>Left-click</b> select · drag a box · <b>double-click</b> all of that type<br>
        <b>Left-click</b> the ground: move · an enemy: attack · ore: harvest · <b>right-click</b>: deselect / cancel<br>
        <b>A</b> then click: attack-move · <b>S</b> stop · <b>D</b> deploy (troopers dig in) · <b>Q</b> select your army<br>
        Jets: click a target, they strike once and fly home to rearm · Fry Cooks: click a building to take it (or fix yours)<br>
        Walls: drag a line · tanks squish enemy infantry · crates: drive over them<br>
        <b>Ctrl+1–9</b> make a group · <b>1–9</b> pick it (twice: go there)<br>
        <b>Arrows</b> / screen edge / middle-drag scroll · <b>wheel</b> zoom<br>
        <b>H</b> home · <b>Space</b> last alert · <b>M</b> sound · <b>N</b> music · <b>Esc</b> menu<br>
        Select a Boot Camp or Tank Fryer and click the ground to set its rally point.
      </div>
    </div>
    <div class="alr-card alr-end" hidden></div>
    <div class="alr-card alr-nogl" hidden><div class="alr-card-t">NO WEBGL 2</div><div class="alr-card-s">Nugget Alert needs a browser with WebGL 2 (current Chrome, Edge, Firefox or Safari).</div><button type="button" data-act="leave">BACK</button></div>`;
  alertWorld.appendChild(root);
  const q = (s) => root.querySelector(s);
  const U = alr.ui = {
    root, glc: q('.alr-gl'), ov: q('.alr-ov'), msgs: q('.alr-msgs'), side: q('.alr-side'), cash: q('.alr-cash'),
    radar: q('.alr-radar'), radarOff: q('.alr-radar-off'), powUse: q('.alr-pow-use'), powMake: q('.alr-pow-make'),
    tabs: q('.alr-tabs'), grid: q('.alr-grid'), load: q('.alr-load'), menu: q('.alr-menu'), end: q('.alr-end'), nogl: q('.alr-nogl'),
    keysBox: q('.alr-keys'), tab: 'bld', cameos: {}, g: null, rg: null, mouse: { x: 0, y: 0, in: false }, drag: null, keys: {}, lastClick: 0,
  };
  U.g = U.ov.getContext('2d'); U.rg = U.radar.getContext('2d');
  U.gl = alrGLInit(U.glc);
  if (U.gl) alrArtInit();
  // tabs
  for (const c of ALR_CATS) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = c.key; b.title = c.name;
    b.innerHTML = `<span>${c.icon}</span><i>${c.name}</i>`;
    b.addEventListener('click', () => { U.tab = c.key; alrUISide(true); alrSfx('click'); });
    U.tabs.appendChild(b);
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    alrAudioWake();
    if (act === 'sell' || act === 'repair') { alr.mode = alr.mode === act ? '' : act; alr.place = null; alrSfx('click'); alrUIButtons(); }
    else if (act === 'menu') alrPause(true);
    else if (act === 'resume') alrPause(false);
    else if (act === 'keys') U.keysBox.hidden = !U.keysBox.hidden;
    else if (act === 'surrender') { alrPause(false); alr.players[0].lost = true; for (const e of alr.ents.slice()) if (e.owner === 0) e.hp = 0; alrCheckEnd(); }
    else if (act === 'leave') { alrPause(false); if (typeof stopStorm === 'function') stopStorm(); }
    else if (act === 'again') { U.end.hidden = true; alrNewGame(alr.cfg, alr.side, alr.mapKey, alr.nAI); }
    else if (act === 'tier') { U.end.hidden = true; alrOpenTier(); }
  });
  // the battlefield's mouse
  U.ov.addEventListener('pointerdown', alrPointerDown);
  U.ov.addEventListener('pointermove', alrPointerMove);
  U.ov.addEventListener('pointerup', alrPointerUp);
  U.ov.addEventListener('pointerleave', () => { U.mouse.in = false; });
  // (the pointer only counts as 'in' once it has moved: pointerenter carries no position, and edge
  // scrolling read the stale 0,0 as 'at the left edge')
  U.ov.addEventListener('contextmenu', (e) => e.preventDefault());
  U.ov.addEventListener('wheel', (e) => { e.preventDefault(); alr.cam.zoom = alrClamp(alr.cam.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 9, 30); }, { passive: false });
  U.radar.addEventListener('pointerdown', alrRadarDown);
  U.radar.addEventListener('pointermove', alrRadarMove);
  U.radar.addEventListener('pointerup', alrRadarUp);
  U.radar.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => { if (alr.on) alrLayout(); });
}
function alrUINoGL() { alr.ui.nogl.hidden = false; alr.phase = 'nogl'; }
function alrLayout() {
  const U = alr.ui; if (!U) return;
  const W = window.innerWidth, H = window.innerHeight, sw = W < 900 ? 196 : ALR_SIDE_W;
  U.sideW = sw; U.side.style.width = sw + 'px';
  const gw = Math.max(200, W - sw), dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [U.glc, U.ov]) { c.style.width = gw + 'px'; c.style.height = H + 'px'; c.width = Math.round(gw * dpr); c.height = Math.round(H * dpr); }
  alr.cam.w = gw; alr.cam.h = H; alr.cam.dpr = dpr;
}
function alrUILoading(on) { alr.ui.load.hidden = !on; }
function alrPause(on) {
  if (alr.phase !== 'play') return;
  alr.paused = on; alr.ui.menu.hidden = !on; alr.ui.keysBox.hidden = true;
}

// the world's static pieces: the terrain texture + mesh, the cameos
function alrUIBuildWorld() {
  const M = alr.M, U = alr.ui;
  // (the painted ground keeps to ~1.8k px a side on the big maps; the shader's detail texture carries the close-up grain)
  const tcv = alrTerrainCanvas(M, ALR_N <= 64 ? 24 : ALR_N <= 96 ? 18 : 14);
  // scatter bushes on open grass: off the dirt, the ore, the tracks, anything solid; denser near the woods
  U.shrubs = [];
  { let s = M.seed * 17 + 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const nearTree = new Uint8Array(ALR_N * ALR_N); for (const t of M.trees) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = Math.floor(t.x) + dx, z = Math.floor(t.z) + dz; if (x >= 0 && z >= 0 && x < ALR_N && z < ALR_N) nearTree[z * ALR_N + x] = 1; }
    for (let z = 1; z < ALR_N - 1; z++) for (let x = 1; x < ALR_N - 1; x++) {
      const k = z * ALR_N + x;
      if (M.block[k] || M.ore[k] > 0 || M.dirt[k] > 0.12) continue;
      const n = (nearTree[k] ? 2 : 0) + (r() < 0.05 ? 1 : 0);
      for (let j = 0; j < n; j++) if (r() < 0.5) U.shrubs.push({ x: x + 0.15 + r() * 0.7, z: z + 0.15 + r() * 0.7, v: (r() * 4) | 0, yaw: r() * 6.28, s: 0.7 + r() * 0.6 });
    }
  }
  // the banks: reed clumps on the land tiles that touch water
  if (M.wet) {
    let s2 = M.seed * 29 + 1; const r2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
    for (let z = 1; z < ALR_N - 1; z++) for (let x = 1; x < ALR_N - 1; x++) {
      const k = z * ALR_N + x;
      if (M.water[k] || M.block[k] || M.ore[k] > 0) continue;
      if (!(M.water[k - 1] || M.water[k + 1] || M.water[k - ALR_N] || M.water[k + ALR_N])) continue;
      if (M.bridges.some((B) => B.tiles.includes(k) || Math.abs((B.axis === 'x' ? z : x) - B.across - 0.5) < 2.5 && ((B.axis === 'x' ? x : z) >= B.lo - 3 && (B.axis === 'x' ? x : z) <= B.hi + 3))) continue;
      for (let j = 0; j < 2; j++) if (r2() < 0.6) U.shrubs.push({ x: x + 0.15 + r2() * 0.7, z: z + 0.15 + r2() * 0.7, v: 0, yaw: r2() * 6.28, s: 0.8 + r2() * 0.6, reed: true });
    }
  }
  if (U.terrTex) alrGL.gl.deleteTexture(U.terrTex);
  U.terrTex = alrGLTexCanvas(tcv, true);
  U.waterMesh = M.wet ? alrWaterMesh(M) : null;
  if (M.wet) { U.terrMesh = alrTerrainMesh(M); U.terrN = -1; }       // a height grid: the riverbeds dip under the water
  else if (!U.terrMesh || U.terrN !== ALR_N) {
    U.terrN = ALR_N;
    const mb = new AlrMB(); mb.color('#ffffff');
    mb.face([[0, 0, 0], [0, 0, ALR_N], [ALR_N, 0, ALR_N], [ALR_N, 0, 0]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    U.terrMesh = mb.bake();
  }
  // the radar's picture of the ground (the shroud and the dots go on top each refresh)
  const rc = document.createElement('canvas'); rc.width = rc.height = 128;
  rc.getContext('2d').drawImage(tcv, 0, 0, 128, 128);
  U.radarGround = rc; U.radarLayer = null;          // (the radar's tile layer rebuilds for the new map)
  alrGLShroud(ALR_N, alr.players[0].shroud);
  if (!U.cameosBuilt) { alrBuildCameos(); U.cameosBuilt = true; }
  if (!U.sandbags) {
    const mb = new AlrMB(); mb.color(ALR_PAL.sand);
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + 0.3; if (k === 4) continue; mb.push().at(Math.cos(a) * 0.26, 0.04, Math.sin(a) * 0.26, -a).box(0, 0, 0, 0.075, 0.04, 0.045, 0.02).box(0.02, 0.07, 0, 0.07, 0.035, 0.04, 0.018).pop(); }
    U.sandbags = mb.bake();
  }
}
function alrBuildCameos() {
  const U = alr.ui, team = ALR_TEAMS[0].col;
  const all = Object.keys(ALR_BLD).filter((k) => ALR_BLD[k].cat).concat(Object.keys(ALR_UNIT));
  for (const k of all) {
    const B = ALR_BLD[k];
    const UD = ALR_UNIT[k];
    const zoom = B ? (B.w >= 3 ? 4.1 : B.w === 2 ? 3.0 : B.wall ? 1.6 : 2.3) : (UD.cat === 'inf' ? 0.85 : k === 'blimp' ? 2.8 : k === 'apoc' ? 1.8 : UD.air === 'heli' ? (UD.carry === 'veh' ? 2.5 : 2.0) : 1.45);
    const lift = B ? -0.35 : UD.cat === 'inf' ? -0.2 : -0.12;
    const parts = alrModelParts(k).filter((p) => p.mesh).map((p) => ({ mesh: p.mesh, M: alrMul(alrTRS(0, lift, 0, B ? ALR_BLD_YAW : Math.PI * 1.15), p.M) }));
    if (!parts.length) continue;
    const cv = alrGLCameo(parts, team, 112, 84, zoom, [0.11, 0.13, 0.17]);
    U.cameos[k] = cv.toDataURL('image/png');
  }
}

// ---- the sidebar ----------------------------------------------------------------------------------------------
function alrUISide(rebuild) {
  const U = alr.ui, P = alr.players[0];
  if (!P) return;
  U.cash.textContent = '$ ' + Math.floor(P.credits);
  // the power bar: green fill = made, the marker = used; red when you're short
  const cap = Math.max(200, P.make, P.use) * 1.1;
  U.powMake.style.height = (P.make / cap * 100) + '%';
  U.powUse.style.bottom = (P.use / cap * 100) + '%';
  U.side.classList.toggle('low', P.low);
  for (const b of U.tabs.children) {
    const cat = b.dataset.tab, any = alrTypesIn(cat).some((t) => alrCanBuild(P, t));
    b.classList.toggle('on', cat === U.tab); b.classList.toggle('dim', !any);
    b.classList.toggle('ready', !!(P.ready[cat]));
  }
  const nb = Object.keys(ALR_BLD).concat(Object.keys(ALR_UNIT)).filter((t) => alrCanBuild(P, t)).length;
  if (U.lastBuildable != null && nb > U.lastBuildable && alr.phase === 'play') alrSay('NEW CONSTRUCTION OPTIONS', '#9be7ff');
  U.lastBuildable = nb;
  const types = alrTypesIn(U.tab);
  if (rebuild || U.gridTab !== U.tab || U.gridKey !== types.map((t) => +alrCanBuild(P, t)).join('')) {
    U.gridTab = U.tab; U.gridKey = types.map((t) => +alrCanBuild(P, t)).join('');
    U.grid.innerHTML = '';
    for (const t of types) {
      const D = ALR_BLD[t] || ALR_UNIT[t];
      const c = document.createElement('button'); c.type = 'button'; c.className = 'alr-cameo'; c.dataset.type = t;
      c.title = D.name + ' · $' + D.cost + (D.blurb ? ' · ' + D.blurb : '') + (D.power ? ' · power ' + (D.power > 0 ? '+' : '') + D.power : '');
      c.innerHTML = `<img alt="" src="${U.cameos[t] || ''}"><div class="alr-wipe"></div><span class="alr-cn">${D.name}</span><span class="alr-cc">$${D.cost}</span><span class="alr-cq"></span><span class="alr-cs"></span>`;
      c.addEventListener('click', () => alrCameoClick(t));
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); alrUnqueue(alr.players[0], t); alrUISide(); });
      U.grid.appendChild(c);
    }
  }
  for (const c of U.grid.children) {
    const t = c.dataset.type, D = ALR_BLD[t] || ALR_UNIT[t], q = P.q[D.cat];
    const can = alrCanBuild(P, t);
    c.classList.toggle('off', !can);
    const mine = q.filter((it) => it.type === t), head = q[0] && q[0].type === t ? q[0] : null;
    const ready = P.ready[D.cat] === t;
    const p = ready ? 1 : head ? head.spent / D.cost : 0;
    c.querySelector('.alr-wipe').style.background = head || ready ? `conic-gradient(rgba(0,0,0,0) ${p}turn, rgba(0,0,0,0.62) ${p}turn)` : 'none';
    c.querySelector('.alr-cq').textContent = mine.length > 1 ? mine.length : '';
    c.querySelector('.alr-cs').textContent = ready ? 'READY' : head && head.hold ? 'ON HOLD' : '';
    c.classList.toggle('ready', ready);
    c.classList.toggle('busy', !!head && !ready);
    // the other building in this tab is in the works: this one's greyed out
    c.classList.toggle('blocked', (D.cat === 'bld' || D.cat === 'def') && !head && !ready && (q.length > 0 || !!P.ready[D.cat]));
  }
  alrUIButtons();
}
function alrTypesIn(cat) {
  const side = (alr.players[0] || {}).side, mine = (D) => D.cat === cat && (!D.side || D.side === side);
  return Object.keys(ALR_BLD).filter((k) => mine(ALR_BLD[k])).concat(Object.keys(ALR_UNIT).filter((k) => mine(ALR_UNIT[k])));
}
function alrCameoClick(t) {
  const P = alr.players[0], D = ALR_BLD[t] || ALR_UNIT[t];
  alrAudioWake();
  if (!alrCanBuild(P, t)) { alrSfx('error'); return; }
  if ((D.cat === 'bld' || D.cat === 'def') && P.ready[D.cat] === t) { alr.place = { type: t }; alr.mode = ''; alrSfx('click'); alrUIButtons(); return; }
  if (!alrQueue(P, t)) alrSfx('error');
  alrUISide();
}
function alrUIButtons() {
  const U = alr.ui;
  for (const b of U.side.querySelectorAll('.alr-btns button')) b.classList.toggle('on', b.dataset.act === alr.mode);
}

// ---- messages ---------------------------------------------------------------------------------------------------
function alrSay(text, color) {
  const U = alr.ui; if (!U) return;
  const now = performance.now();
  if (U.lastSay === text && now - U.lastSayT < 1800) return;
  U.lastSay = text; U.lastSayT = now;
  alrEva(text);
  const d = document.createElement('div'); d.className = 'alr-msg'; d.textContent = text; d.style.color = color || '#fff';
  U.msgs.appendChild(d);
  while (U.msgs.children.length > 5) U.msgs.firstChild.remove();
  setTimeout(() => d.classList.add('out'), 3800);
  setTimeout(() => d.remove(), 4600);
}
function alrFloat(text) { alrSay(text, '#ffd23a'); }
function alrFloatAt(x, z, text, color) { alr.fx.push({ kind: 'text', x, y: 0.9, z, t: 0, T: 1.6, text, col: color || '#fff' }); }

// ---- effects ------------------------------------------------------------------------------------------------------
// particles: { x,y,z, vx,vy,vz, t,T, s (size), gs (growth), r,g,b,a, cell, add, rot, vr, grav, fade }
function alrP(o) { if (alr.fx.length < 2500) alr.fx.push(Object.assign({ kind: 'p', t: 0, vx: 0, vy: 0, vz: 0, rot: Math.random() * 6, vr: 0, gs: 0, grav: 0, a: 1 }, o)); }
function alrFxSmoke(x, y, z, s, T, dark) {
  const g = dark ? 0.16 + Math.random() * 0.08 : 0.55 + Math.random() * 0.2;
  alrP({ x, y, z, vx: alrRnd(-0.1, 0.1) + 0.12, vy: alrRnd(0.35, 0.7), vz: alrRnd(-0.1, 0.1) - 0.05, s, gs: s * 1.4, T: T || 1.4, r: g, g: g, b: g * 0.98, a: dark ? 0.75 : 0.55, cell: 1, vr: alrRnd(-0.6, 0.6) });
}
function alrFxFire(x, y, z, s) {
  alrP({ x, y, z, vy: alrRnd(0.5, 1.0), s, gs: -s * 0.6, T: 0.45 + Math.random() * 0.3, r: 1, g: 0.55 + Math.random() * 0.2, b: 0.15, a: 0.9, cell: 7, add: true, vr: alrRnd(-1, 1) });
}
function alrFxMuzzle(m, s) {
  alrP({ x: m[0], y: m[1], z: m[2], s: s * 1.6, T: 0.07, r: 1, g: 0.85, b: 0.45, a: 1, cell: 0, add: true });
  alrP({ x: m[0], y: m[1], z: m[2], s: s * 0.9, T: 0.09, r: 1, g: 0.95, b: 0.8, a: 1, cell: 7, add: true });
  alrFxSmoke(m[0], m[1], m[2], s * 0.8, 0.8);
}
function alrFxTracer(a, b) { alr.fx.push({ kind: 'beam', a, b, t: 0, T: 0.06, w: 0.035, r: 1, g: 0.85, bl: 0.5, al: 0.9 }); alrFxSpark(b[0], b[1], b[2], 3); }
function alrFxSpark(x, y, z, n) {
  for (let k = 0; k < (n || 4); k++) alrP({ x, y, z, vx: alrRnd(-1.5, 1.5), vy: alrRnd(0.5, 2.2), vz: alrRnd(-1.5, 1.5), s: 0.07, T: 0.25 + Math.random() * 0.2, r: 1, g: 0.8, b: 0.4, a: 1, cell: 0, add: true, grav: 6 });
}
// a Tesla bolt: a jagged line, redrawn every frame it lives, with a glow at both ends
function alrFxZap(a, b) {
  alr.fx.push({ kind: 'zap', a, b, t: 0, T: 0.3, seed: Math.random() * 1000 });
  alrP({ x: b[0], y: b[1], z: b[2], s: 1.1, T: 0.3, r: 0.55, g: 0.75, b: 1, a: 1, cell: 0, add: true });
  alrP({ x: a[0], y: a[1], z: a[2], s: 0.9, T: 0.3, r: 0.6, g: 0.8, b: 1, a: 1, cell: 0, add: true });
  alrFxSpark(b[0], b[1], b[2], 6);
}
// a prism beam: a fat pale-blue glow around a white-hot core (k = how many towers fed it)
function alrFxPrism(a, b, k) {
  alr.fx.push({ kind: 'prism', a, b, t: 0, T: 0.28, k: k || 1 });
  alrP({ x: b[0], y: b[1], z: b[2], s: 0.7 * (k || 1), T: 0.25, r: 0.7, g: 0.9, b: 1, a: 1, cell: 0, add: true });
  alrP({ x: a[0], y: a[1], z: a[2], s: 0.45, T: 0.2, r: 0.8, g: 0.95, b: 1, a: 1, cell: 0, add: true });
}
// flak: a dark burst in the air with a flash in it
function alrFxFlak(p) {
  alrP({ x: p[0], y: p[1], z: p[2], s: 0.45, T: 0.12, r: 1, g: 0.85, b: 0.5, a: 1, cell: 0, add: true });
  for (let k = 0; k < 3; k++) alrFxSmoke(p[0] + alrRnd(-0.15, 0.15), p[1] + alrRnd(-0.1, 0.1), p[2] + alrRnd(-0.15, 0.15), 0.35, 1.1, true);
  alrFxSpark(p[0], p[1], p[2], 3);
}
// the chrono blink: a blue-white flash and a ring of sparkles
function alrFxChrono(x, z) {
  alrP({ x, y: 0.4, z, s: 1.6, T: 0.35, r: 0.55, g: 0.8, b: 1, a: 1, cell: 0, add: true });
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; alrP({ x: x + Math.cos(a) * 0.4, y: 0.2, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * 0.8, vy: 1.2, vz: Math.sin(a) * 0.8, s: 0.12, T: 0.5, r: 0.7, g: 0.9, b: 1, a: 1, cell: 0, add: true }); }
}
function alrFxBlast(x, y, z, s) {
  alrP({ x, y, z, s: s * 2.2, T: 0.18, r: 1, g: 0.8, b: 0.4, a: 1, cell: 0, add: true });
  for (let k = 0; k < 4; k++) alrFxFire(x + alrRnd(-0.1, 0.1), y + 0.05, z + alrRnd(-0.1, 0.1), s * alrRnd(0.6, 1.1));
  for (let k = 0; k < 3; k++) alrFxSmoke(x, y + 0.1, z, s * 0.9, 1.3, true);
  alrFxSpark(x, y, z, 5);
  alr.fx.push({ kind: 'decal', x, z, s: s * 0.8, t: 0, T: 24, rot: Math.random() * 6 });
}
// the big one: a fireball, a shock ring, smoke, debris, a scorch
function alrFxBoom(x, y, z, s) {
  alrP({ x, y: y + 0.2, z, s: s * 3.2, T: 0.22, r: 1, g: 0.9, b: 0.6, a: 1, cell: 0, add: true });
  for (let k = 0; k < 10 + s * 4; k++) alrP({ x: x + alrRnd(-0.3, 0.3) * s, y: y + alrRnd(0, 0.4) * s, z: z + alrRnd(-0.3, 0.3) * s, vx: alrRnd(-0.8, 0.8), vy: alrRnd(0.4, 1.6), vz: alrRnd(-0.8, 0.8), s: s * alrRnd(0.5, 1.0), gs: s * 0.5, T: 0.55 + Math.random() * 0.4, r: 1, g: 0.5 + Math.random() * 0.3, b: 0.12, a: 1, cell: 7, add: true, vr: alrRnd(-2, 2) });
  for (let k = 0; k < 8 + s * 3; k++) alrFxSmoke(x + alrRnd(-0.4, 0.4) * s, y + alrRnd(0.1, 0.5) * s, z + alrRnd(-0.4, 0.4) * s, s * alrRnd(0.6, 1.1), 2.4 + Math.random(), true);
  alr.fx.push({ kind: 'ring', x, z, t: 0, T: 0.45, s: s * 2.6 });
  for (let k = 0; k < 6 + s * 3; k++) alr.fx.push({ kind: 'chunk', x, y: y + 0.2, z, vx: alrRnd(-2.5, 2.5), vy: alrRnd(2, 5), vz: alrRnd(-2.5, 2.5), t: 0, T: 2.5, rx: Math.random() * 6, ry: Math.random() * 6, vrx: alrRnd(-10, 10), s: alrRnd(0.6, 1.4) });
  for (let k = 0; k < 8; k++) alrFxSpark(x, y + 0.3, z, 2);
  alr.fx.push({ kind: 'decal', x, z, s: s * 1.2, t: 0, T: 60, rot: Math.random() * 6 });
  alr.shake = Math.max(alr.shake || 0, 0.15 * s);
}
// ---- the bridges: deck tiles, piers, a truss on the long ones, abutments; ruins once they're down -------------
function alrDrawBridges(onScreen, seen) {
  const W = alrArt.w || {}, M = alr.M;
  for (const B of M.bridges) {
    const ax = B.axis === 'x', ac = B.across + 1, yaw = ax ? Math.PI / 2 : 0;
    const P = (t) => (ax ? [t + 0.5, ac] : [ac, t + 0.5]);
    const mid = P((B.lo + B.hi) / 2);
    if (!onScreen(mid[0], mid[1], 300) || !seen(mid[0], mid[1])) continue;
    // the abutments (they survive): +z of the piece faces the water
    for (const [t, y2] of [[B.lo - 1, 0], [B.hi + 1, Math.PI]]) { const [x, z] = P(t); if (W.bridge_end) alrGLDraw(W.bridge_end, alrTRS(x, 0, z, yaw + y2), { spec: 0.2 }); }
    for (let t = B.lo; t <= B.hi; t++) {
      const [x, z] = P(t), h = alrHash(t, B.i, 77);
      if ((t - B.lo) % 2 === 1 && t < B.hi && W.bridge_pier) alrGLDraw(W.bridge_pier, alrTRS(x, 0, z, yaw), { spec: 0.15 });
      if (!B.down) {
        if (W.bridge_deck) alrGLDraw(W.bridge_deck, alrTRS(x, 0, z, yaw), { spec: 0.2 });
        if (B.long && W.bridge_truss) alrGLDraw(W.bridge_truss, alrTRS(x, 0, z, yaw), { spec: 0.5 });
      } else if (W.bridge_ruin && (t === B.lo || t === B.hi || h < 0.35)) {
        // what's left: the end spans hang from the abutments into the water, a few slabs lie sunk mid-river
        const end = t === B.lo ? 1 : t === B.hi ? -1 : 0;
        const tilt = end ? end * 0.35 : (h - 0.17) * 2, drop = end ? -0.12 : -0.3 - h * 0.2;
        alrGLDraw(W.bridge_ruin, alrTRS(x, drop, z, yaw + (end < 0 || (!end && h > 0.2) ? Math.PI : 0), 1, 1, 1, Math.abs(tilt), (h - 0.17) * 0.5), { spec: 0.2 });
      }
    }
    if (!B.down && B.long && W.bridge_portal) for (const [t, y2] of [[B.lo - 0.5, 0], [B.hi + 0.5, Math.PI]]) { const [x, z] = P(t); alrGLDraw(W.bridge_portal, alrTRS(x, 0, z, yaw + y2), { spec: 0.5 }); }
    // a badly hurt bridge smokes
    const e = !B.down && B.ent && alr.byId.get(B.ent);
    if (e && e.hp < e.max * 0.5 && Math.random() < 0.08) { const [x, z] = P(B.lo + Math.floor(Math.random() * (B.hi - B.lo + 1))); alrFxSmoke(x, 0.2, z, 0.3, 1.8, true); }
  }
}
function alrFxSplash(x, z, s) {
  s = s || 1;
  for (let k = 0; k < 14 * s; k++) { const a = Math.random() * 6.283, sp = alrRnd(0.3, 1.4) * s; alrP({ x, y: ALR_WATER_Y + 0.02, z, vx: Math.cos(a) * sp, vy: alrRnd(1.5, 3.6) * s, vz: Math.sin(a) * sp, s: alrRnd(0.05, 0.12) * s, T: alrRnd(0.6, 1.0), r: 0.82, g: 0.9, b: 0.95, a: 0.85, cell: 0, grav: 9 }); }
  alrP({ x, y: ALR_WATER_Y + 0.05, z, vx: 0, vy: 0.2, vz: 0, s: 0.8 * s, gs: 1.2, T: 0.9, r: 0.85, g: 0.9, b: 0.92, a: 0.4, cell: 1 });
}
// a bridge comes down: explosions walk along the span, each piece throws up a splash
function alrFxBridgeDown(B) {
  const ax = B.axis === 'x', ac = B.across + 1;
  for (let t = B.lo; t <= B.hi; t++) {
    const x = ax ? t + 0.5 : ac, z = ax ? ac : t + 0.5, d = (t - B.lo) * 0.09;
    alr.later = (alr.later || []).concat([{ t: alr.t + d, fn: () => { alrFxBoom(x, 0.15, z, 0.9); } }, { t: alr.t + d + 0.35, fn: () => alrFxSplash(x, z, 1.2) }]);
  }
}
// ---- the gravy (the Gravy Blimp's pour): splash, death, the stream + the pools --------------------------------
const ALR_GRAVY = [0.36, 0.2, 0.09];
function alrFxGravy(x, z) {
  // a crown of heavy droplets thrown up and out, a few glossy glints, then a stain once the pool drains
  for (let k = 0; k < 34; k++) {
    const a = Math.random() * 6.283, sp = alrRnd(0.6, 2.4);
    const sh = alrRnd(0.75, 1.15);
    alrP({ x: x + Math.cos(a) * 0.1, y: 0.06, z: z + Math.sin(a) * 0.1, vx: Math.cos(a) * sp, vy: alrRnd(1.2, 3.2), vz: Math.sin(a) * sp, s: alrRnd(0.05, 0.13), T: alrRnd(0.5, 0.9), r: ALR_GRAVY[0] * sh, g: ALR_GRAVY[1] * sh, b: ALR_GRAVY[2] * sh, a: 1, cell: 0, grav: 9 });
  }
  alrP({ x, y: 0.12, z, vx: 0, vy: 0.3, vz: 0, s: 0.7, gs: 0.8, T: 0.7, r: 0.55, g: 0.42, b: 0.3, a: 0.35, cell: 1 });   // steam
  alr.fx.push({ kind: 'decal', x, z, s: 0.75, t: 0, T: 45, rot: Math.random() * 6, sauce: true });
}
function alrFxGravyDeath(x, z) {
  for (let k = 0; k < 10; k++) alrP({ x, y: 0.15, z, vx: alrRnd(-0.9, 0.9), vy: alrRnd(0.8, 2.0), vz: alrRnd(-0.9, 0.9), s: alrRnd(0.05, 0.1), T: 0.7, r: ALR_GRAVY[0], g: ALR_GRAVY[1], b: ALR_GRAVY[2], a: 1, cell: 0, grav: 8 });
  for (let k = 0; k < 2; k++) alrP({ x, y: 0.2, z, vx: alrRnd(-1, 1), vy: alrRnd(1, 2), vz: alrRnd(-1, 1), s: 0.06, T: 0.6, r: 0.88, g: 0.6, b: 0.24, a: 1, cell: 0, grav: 7 });   // breading
  alrP({ x, y: 0.15, z, vx: 0, vy: 0.4, vz: 0, s: 0.35, gs: 0.6, T: 0.8, r: 0.6, g: 0.5, b: 0.4, a: 0.35, cell: 1 });   // steam
}
// the pour's timing: the blimp tips its nose (pitch > 0 = nose down), the stream's front falls, the tail lets go
function alrPourTip(u) {
  if (u.pourAt == null) return 0;
  const s = (alr.t || 0) - u.pourAt, T = u.pourT || 1.5;
  if (s < 0 || s > T + 0.5) return 0;
  return 0.2 * Math.min(1, s / 0.3) * Math.min(1, (T + 0.5 - s) / 0.5);
}
function alrSpout(u) {
  const p = alrPourTip(u), c = Math.cos(u.yaw), sn = Math.sin(u.yaw);
  const fwd = Math.cos(p) * 1.0 + Math.sin(p) * 0.12, up = Math.cos(p) * 0.12 - Math.sin(p) * 1.0;
  return [u.x + sn * fwd, (u.alt || 0) + up, u.z + c * fwd];
}
// a mesh whose +y runs from point a to point b, w wide (the stream)
function alrSpan(a, b, w, spin) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1e-4;
  const y = [d[0] / L, d[1] / L, d[2] / L];
  let x = Math.abs(y[1]) < 0.9 ? [y[2], 0, -y[0]] : [1, 0, 0];
  const xl = Math.hypot(x[0], x[1], x[2]); x = x.map((v) => v / xl);
  let z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const c = Math.cos(spin || 0), s = Math.sin(spin || 0);
  const X = x.map((v, i) => v * c + z[i] * s), Z = z.map((v, i) => -x[i] * s + v * c);
  const m = new Float32Array(16);
  m[0] = X[0] * w; m[1] = X[1] * w; m[2] = X[2] * w;
  m[4] = d[0]; m[5] = d[1]; m[6] = d[2];
  m[8] = Z[0] * w; m[9] = Z[1] * w; m[10] = Z[2] * w;
  m[12] = a[0]; m[13] = a[1]; m[14] = a[2]; m[15] = 1;
  return m;
}
function alrDrawGravy(onScreen, seen) {
  const A = alrArt.u, now = alr.t || 0;
  // the pools: a glossy lobed dome that spreads, quivers, then drains
  for (const p of alr.pools || []) {
    if (!onScreen(p.x, p.z, 120) || !seen(p.x, p.z)) continue;
    const r = alrPoolR(p);
    if (r < 0.03) continue;
    const q = 1 + Math.sin(now * 5 + p.yaw * 3) * 0.02;
    if (A.gravy_pool) alrGLDraw(A.gravy_pool, alrTRS(p.x, 0.004, p.z, p.yaw + now * 0.05, r * q, 0.9, r / q), { spec: 3.2, noCast: true });
    else alrGLGround(p.x, p.z, r, r, p.yaw, ALR_GRAVY[0], ALR_GRAVY[1], ALR_GRAVY[2], 0.95, 3, false, 0.02);
    if (Math.random() < 0.06) alrP({ x: p.x + alrRnd(-r, r) * 0.6, y: 0.05, z: p.z + alrRnd(-r, r) * 0.6, vx: 0, vy: 0.25, vz: 0, s: 0.25, gs: 0.5, T: 1.2, r: 0.6, g: 0.52, b: 0.45, a: 0.18, cell: 1 });   // steam off it
  }
  // the streams
  for (const u of alr.ents) {
    if (u.type !== 'blimp' || u.pourAt == null) continue;
    const s = now - u.pourAt, T = u.pourT || 1.5;
    if (s < 0 || s > T + 0.35 || !onScreen(u.x, u.z, 200)) continue;
    const S = alrSpout(u), G = [u.pourTo[0], 0.02, u.pourTo[1]];
    const head = Math.min(1, (s / 0.45) * (s / 0.45));            // the front falls (accelerating)
    const tail = s > T - 0.1 ? Math.min(1, (s - (T - 0.1)) / 0.45) : 0;   // the tail lets go at the end
    const lerp = (k) => [S[0] + (G[0] - S[0]) * k, S[1] + (G[1] - S[1]) * k, S[2] + (G[2] - S[2]) * k];
    const a = lerp(Math.min(1, head)), b = lerp(tail * tail);
    const w = 2.1 + Math.sin(now * 23) * 0.15;
    // "loads of gravy": a thick main column and a second, offset one that wobbles out of phase
    if (A.gravy_stream) {
      alrGLDraw(A.gravy_stream, alrSpan(a, b, w, now * 3), { spec: 1.8 });
      const o = [Math.sin(now * 7) * 0.06, 0, Math.cos(now * 5) * 0.06];
      alrGLDraw(A.gravy_stream, alrSpan([a[0] + o[0], a[1], a[2] + o[2]], [b[0] + o[0] * 0.3, b[1], b[2] + o[2] * 0.3], w * 0.7, -now * 4 + 1), { spec: 1.8 });
    }
    // droplets peeling off the column
    for (let k = 0; k < 5; k++) { const f = Math.random(), P = lerp(Math.min(head, Math.max(tail * tail, f))); alrGLSprite(P[0] + alrRnd(-0.14, 0.14), P[1], P[2] + alrRnd(-0.14, 0.14), alrRnd(0.06, 0.12), 0, ALR_GRAVY[0], ALR_GRAVY[1], ALR_GRAVY[2], 1, 0, false); }
    // while it's hitting the ground: a constant churn of splashes at the foot
    if (head >= 1 && tail < 0.95 && Math.random() < 0.7) { const a2 = Math.random() * 6.283, sp = alrRnd(0.5, 1.6); alrP({ x: G[0], y: 0.05, z: G[2], vx: Math.cos(a2) * sp, vy: alrRnd(0.8, 2.2), vz: Math.sin(a2) * sp, s: alrRnd(0.05, 0.1), T: 0.5, r: ALR_GRAVY[0], g: ALR_GRAVY[1], b: ALR_GRAVY[2], a: 1, cell: 0, grav: 9 }); }
  }
}
function alrFxCrumbs(x, z) {
  for (let k = 0; k < 8; k++) alrP({ x, y: 0.25, z, vx: alrRnd(-1.2, 1.2), vy: alrRnd(1, 2.4), vz: alrRnd(-1.2, 1.2), s: 0.09, T: 0.8, r: 0.88, g: 0.6, b: 0.24, a: 1, cell: 3, grav: 7, vr: alrRnd(-8, 8) });
  alrFxSmoke(x, 0.2, z, 0.35, 0.8);
  alr.fx.push({ kind: 'decal', x, z, s: 0.3, t: 0, T: 18, rot: Math.random() * 6, sauce: true });
}
// under the treads: a wide sauce splat and a puff of breading
function alrFxSquish(x, z) {
  alr.fx.push({ kind: 'decal', x, z, s: 0.5, t: 0, T: 40, rot: Math.random() * 6, sauce: true });
  for (let k = 0; k < 10; k++) alrP({ x, y: 0.05, z, vx: alrRnd(-2, 2), vy: alrRnd(0.3, 1.2), vz: alrRnd(-2, 2), s: 0.07, T: 0.6, r: 0.85, g: 0.5, b: 0.18, a: 1, cell: 3, grav: 6, vr: alrRnd(-8, 8) });
}
function alrFxDust(x, z, gold) {
  alrP({ x, y: 0.1, z, vx: alrRnd(-0.3, 0.3), vy: alrRnd(0.2, 0.5), vz: alrRnd(-0.3, 0.3), s: 0.35, gs: 0.6, T: 0.9, r: gold ? 0.85 : 0.6, g: gold ? 0.7 : 0.52, b: gold ? 0.35 : 0.38, a: 0.45, cell: 1 });
  if (gold) alrP({ x, y: 0.15, z, vx: alrRnd(-0.8, 0.8), vy: alrRnd(1, 2), vz: alrRnd(-0.8, 0.8), s: 0.06, T: 0.5, r: 1, g: 0.8, b: 0.3, a: 1, cell: 0, add: true, grav: 6 });
}
function alrFxStep(dt) {
  if (alr.shake > 0) alr.shake = Math.max(0, alr.shake - dt * 0.6);
  for (const f of alr.fx) {
    f.t += dt;
    if (f.kind === 'p') { f.vy -= f.grav * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.s = Math.max(0.01, f.s + f.gs * dt); f.rot += f.vr * dt; if (f.y < 0.02 && f.grav) { f.y = 0.02; f.vy *= -0.3; f.vx *= 0.6; f.vz *= 0.6; } }
    else if (f.kind === 'chunk') { f.vy -= 11 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.rx += f.vrx * dt; if (f.y < 0.03) { f.y = 0.03; f.vy *= -0.35; f.vx *= 0.5; f.vz *= 0.5; f.vrx *= 0.5; } if (Math.random() < dt * 14 && f.t < 1) alrFxSmoke(f.x, f.y, f.z, 0.12, 0.6, true); }
    else if (f.kind === 'text') f.y += dt * 0.5;
  }
  alr.fx = alr.fx.filter((f) => f.t < f.T);
  // buildings on fire, burning wrecks, a power plant's steam, the chain of explosions as a building goes
  for (const b of alr.ents) {
    if (b.kind !== 'bld' || b.build < 1) continue;
    const f = b.hp / b.max;
    if (f < 0.55 && Math.random() < dt * (f < 0.3 ? 9 : 4)) alrFxSmoke(b.x + alrRnd(-b.w, b.w) * 0.3, 0.8, b.z + alrRnd(-b.h, b.h) * 0.3, 0.45, 2.2, true);
    if (f < 0.3 && Math.random() < dt * 10) alrFxFire(b.x + alrRnd(-b.w, b.w) * 0.3, 0.6, b.z + alrRnd(-b.h, b.h) * 0.3, 0.35);
    if (b.type === 'power' && !alr.players[b.owner].low && Math.random() < dt * 3) { const s = Math.random() < 0.5; alrFxSmoke(b.x + (s ? -0.42 : 0.38), 1.0, b.z + (s ? -0.38 : 0.4), 0.4, 2.6); }
    if (b.type === 'refinery' && Math.random() < dt * 1.5) alrFxSmoke(b.x + 0.95, 1.35, b.z + 0.75, 0.25, 2.2, true);   // the chimney: local (-0.95, -0.75), turned 180°
  }
  for (const d of alr.decor) {
    d.t += dt;
    if (d.kind === 'wreck' && d.t < 6 && Math.random() < dt * 8) { alrFxFire(d.x + alrRnd(-0.15, 0.15), 0.3, d.z + alrRnd(-0.15, 0.15), 0.28); alrFxSmoke(d.x, 0.5, d.z, 0.35, 2, true); }
    if (d.kind === 'chain' && Math.random() < dt * 9) alrFxBoom(d.x + alrRnd(-d.w, d.w) * 0.4, 0.4, d.z + alrRnd(-d.h, d.h) * 0.4, 0.7);
  }
  alr.decor = alr.decor.filter((d) => d.t < d.T);
  for (const u of alr.ents) if (u.kind === 'unit' && u.moving && u.D.cat === 'veh' && Math.random() < dt * 5) alrFxDust(u.x - Math.sin(u.yaw) * 0.35, u.z - Math.cos(u.yaw) * 0.35);
}

// ---- the render -----------------------------------------------------------------------------------------------------
const ALR_LIGHT = { sun: [1.1, 1.0, 0.86], sky: [0.5, 0.56, 0.68], ground: [0.33, 0.3, 0.22] };
function alrUIRender(dt) {
  const U = alr.ui, M = alr.M, A = alrArt, cam = alr.cam;
  if (!M) return;
  alrUICursorTick();
  const shk = alr.shake || 0;
  const sx = cam.x, sz = cam.z;
  if (shk > 0) { cam.x += alrRnd(-shk, shk); cam.z += alrRnd(-shk, shk); }
  alrGLCamera(cam);
  cam.x = sx; cam.z = sz;
  if (alr.shroudDirty) { alrGLShroud(ALR_N, alr.players[0].shroud); alr.shroudDirty = false; }
  alrGLBegin();
  const team = (o) => ALR_TEAMS[o].col;
  // what's on screen (in tiles), with a margin for tall things
  const cs = [alrGLPick(0, 0), alrGLPick(cam.w, 0), alrGLPick(0, cam.h), alrGLPick(cam.w, cam.h)];
  const x0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0])) - 2)), x1 = Math.min(ALR_N - 1, Math.ceil(Math.max(...cs.map((c) => c[0])) + 2));
  const z0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1])) - 2)), z1 = Math.min(ALR_N - 1, Math.ceil(Math.max(...cs.map((c) => c[1])) + 2));
  const onScreen = (x, z, m) => { const p = alrGLProject(x, 0, z), mm = m || 80; return p[0] > -mm && p[0] < cam.w + mm && p[1] > -mm * 1.5 && p[1] < cam.h + mm; };
  const S = alr.players[0].shroud, seen = (x, z) => S[alrTile(alrClamp(x, 0, ALR_N - 1), alrClamp(z, 0, ALR_N - 1))] > 8;
  // the ground
  alrGLDraw(U.terrMesh, alrM4(), { tex: U.terrTex, spec: 0.0, noCast: true });
  if (U.waterMesh) { alrGLDraw(U.waterMesh, alrM4(), { spec: 1.0, alpha: 0.88, noCast: true }); alrDrawBridges(onScreen, seen); }
  // the ore and its stain, the trees, the rocks
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const k = z * ALR_N + x, v = M.ore[k];
    if (v <= 0 || S[k] < 30) continue;
    const lv = v < 110 ? 0 : v < 230 ? 1 : 2;
    alrGLDraw(A.ore[lv * 3 + (k % 3)], alrTRS(x + 0.5, 0, z + 0.5, k * 1.7), { spec: 0.9 });
    alrGLGround(x + 0.5, z + 0.5, 0.62, 0.62, k * 0.7, 0.55, 0.42, 0.12, 0.4, 5, false, 0.012);
  }
  // stands of one kind: broadleaf (0-2) or pine (3-5) by a slow wave over the map, so woods read as woods
  for (const tr of M.trees) if (seen(tr.x, tr.z) && tr.x >= x0 && tr.x <= x1 + 1 && tr.z >= z0 && tr.z <= z1 + 1) {
    const sp = A.trees.length >= 6 ? (tr.v % 3) + (Math.sin(tr.x * 0.19 + 1.3) + Math.cos(tr.z * 0.23) > 0.2 ? 3 : 0) : tr.v % A.trees.length;
    alrGLDraw(A.trees[sp], alrTRS(tr.x, 0, tr.z, tr.yaw, tr.s), { spec: 0.05 });
  }
  // bushes (visual only: never block, skipped under buildings and ore)
  if (A.shrubs && U.shrubs) for (const sh of U.shrubs) {
    if (sh.x < x0 || sh.x > x1 + 1 || sh.z < z0 || sh.z > z1 + 1 || !seen(sh.x, sh.z)) continue;
    const k = alrTile(sh.x, sh.z); if (M.bld[k] || M.ore[k] > 0) continue;
    if (sh.reed) { if (alrArt.w && alrArt.w.reeds) alrGLDraw(alrArt.w.reeds, alrTRS(sh.x, 0, sh.z, sh.yaw, sh.s), { spec: 0.1 }); continue; }
    alrGLDraw(A.shrubs[sh.v % A.shrubs.length], alrTRS(sh.x, 0, sh.z, sh.yaw, sh.s), { spec: 0.05 });
  }
  for (const rk of M.rocks) if (seen(rk.x, rk.z) && rk.x >= x0 && rk.x <= x1 + 1 && rk.z >= z0 && rk.z <= z1 + 1) alrGLDraw(A.rocks[rk.v % A.rocks.length], alrTRS(rk.x, 0, rk.z, rk.yaw, rk.s), { spec: 0.1 });
  alrDrawGravy(onScreen, seen);
  // rubble, scorches and wrecks
  for (const d of alr.decor) {
    if (!onScreen(d.x, d.z, 120)) continue;
    if (d.kind === 'rubble') { alrGLDraw(A.rubble, alrTRS(d.x, 0, d.z, 0, d.w * 0.9, 1, d.h * 0.9), { spec: 0.05 }); alrGLGround(d.x, d.z, d.w * 0.6, d.h * 0.6, 0.3, 1, 1, 1, 0.85, 5, false, 0.015); }
    if (d.kind === 'wreck') {
      const fade = Math.min(1, (d.T - d.t) / 2);
      const o = { team: [0.18, 0.17, 0.16], desat: 0.85, add: [-0.08, -0.08, -0.08], spec: 0.05, alpha: fade < 1 ? fade : undefined };
      for (const p of alrUnitParts(d)) alrGLDraw(p.mesh, p.M, o);
    }
  }
  for (const f of alr.fx) if (f.kind === 'decal') {
    const a = Math.min(1, (f.T - f.t) / 4) * (f.sauce ? 0.7 : 0.85);
    if (f.sauce) alrGLGround(f.x, f.z, f.s, f.s, f.rot, 0.9, 0.55, 0.15, a, 5, false, 0.014);
    else alrGLGround(f.x, f.z, f.s, f.s, f.rot, 1, 1, 1, a, 5, false, 0.014);
  }
  // the buildings
  for (const b of alr.ents) {
    if (b.kind !== 'bld' || !onScreen(b.x, b.z, 200)) continue;
    if (b.owner !== 0 && !seen(b.x, b.z)) continue;
    let sy = 1, add = null;
    if (b.build < 1) { const e = b.build; sy = 0.04 + 0.96 * e * e * (3 - 2 * e); add = [0.25 * (1 - e), 0.45 * (1 - e), 0.6 * (1 - e)]; if (Math.random() < 0.5) alrFxSpark(b.x + alrRnd(-b.w, b.w) * 0.4, sy * 0.8, b.z + alrRnd(-b.h, b.h) * 0.4, 1); }
    if (b.sell) { const e = Math.max(0, 2 - b.sell); sy = 0.04 + 0.96 * e; add = [0.4 * (1 - e), 0.3 * (1 - e), 0.05]; }
    if (b.flash > 0) add = [0.35, 0.3, 0.25];
    const o = { team: team(b.owner), spec: 0.3, add };
    const base = alrTRS(b.x, 0, b.z, ALR_BLD_YAW, 1, sy, 1);
    for (const p of alrBldParts(b)) alrGLDraw(p.mesh, alrMul(base, p.M), o);
    if (b.type === 'prism' && b.charge > 0.2 && !alr.players[b.owner].low) alrGLSprite(b.x, 1.55, b.z, 0.35 + b.charge * 0.5, alr.t * 2, 0.75, 0.92, 1, 0.45 + b.charge * 0.4, 0, true);
    if (b.type === 'tesla' && b.charge > 0.2 && !alr.players[b.owner].low) {
      alrGLSprite(b.x, 1.35, b.z, 0.5 + b.charge * 0.7, alr.t * 3, 0.55, 0.75, 1, 0.5 + b.charge * 0.4, 0, true);
      if (Math.random() < b.charge * 0.5) { const a = Math.random() * 6.28; alrFxZapMini([b.x, 1.35, b.z], [b.x + Math.cos(a) * 0.35, 1.0 + Math.random() * 0.3, b.z + Math.sin(a) * 0.35]); }
    }
  }
  // the units
  for (const u of alr.ents) {
    if (u.kind !== 'unit' || !onScreen(u.x, u.z)) continue;
    if (u.owner !== 0 && !seen(u.x, u.z)) continue;
    const o = { team: team(u.owner), spec: u.D.cat === 'veh' ? 0.55 : 0.2, add: u.flash > 0 ? [0.4, 0.35, 0.3] : null };
    // the Mirage, parked: a tree to them (and to you, a tree with a ghost of your tank in it)
    if (u.D.disguise && u.still > 1.2) {
      const tr = alrArt.trees[(u.id % 3) * 2 + 1] || alrArt.trees[0];
      alrGLDraw(tr, alrTRS(u.x, 0, u.z, u.id, 0.95), { spec: 0.05 });
      if (u.owner === 0) for (const p of alrUnitParts(u)) alrGLDraw(p.mesh, p.M, Object.assign({}, o, { alpha: 0.35, noCast: true }));
    } else for (const p of alrUnitParts(u)) alrGLDraw(p.mesh, p.M, o);
    // dug in: the sandbags around him
    if (u.deployed && U.sandbags) alrGLDraw(U.sandbags, alrTRS(u.x, 0, u.z, u.yaw), { spec: 0.05 });
    // the jetpack's exhaust
    if (u.D.air === 'hover' && Math.random() < 0.8) { for (const sx of [-0.07, 0.07]) { const [nx, nz] = alrHullAt(u, sx * 1.3, -0.2); alrGLSprite(nx, u.alt + 0.2, nz, 0.13, 0, 1, 0.65, 0.25, 0.9, 0, true); } if (Math.random() < 0.15) alrFxSmoke(u.x, u.alt + 0.1, u.z, 0.12, 0.6); }
    if (alr.sel.includes(u)) alrGLGround(u.x, u.z, u.D.r * 1.35 + 0.06, u.D.r * 1.35 + 0.06, 0, 0.55, 1, 0.55, 0.85, 4, true, 0.02);
  }
  // crates: bobbing, turning, glinting
  for (const c of alr.crates || []) {
    if (!seen(c.x, c.z) || !onScreen(c.x, c.z)) continue;
    if (alrArt.u.crate) alrGLDraw(alrArt.u.crate, alrTRS(c.x, 0.04 + Math.abs(Math.sin(c.t * 2.2)) * 0.06, c.z, c.t * 0.8), { spec: 0.4 });
    if (Math.sin(c.t * 3) > 0.92) alrGLSprite(c.x, 0.35, c.z, 0.35, c.t, 1, 0.9, 0.5, 0.9, 6, true);
  }
  // shells and rockets in flight
  for (const s of alr.shots) {
    if (s.kind === 'v3') {
      // the V3's rocket, nose along its flight, with a long burn behind it
      const dx = s.x - (s.px == null ? s.a[0] : s.px), dy = s.y - (s.py == null ? s.a[1] : s.py), dz = s.z - (s.pz == null ? s.a[2] : s.pz), h = Math.hypot(dx, dz) || 1e-3;
      if (alrArt.u.v3_rocket) alrGLDraw(alrArt.u.v3_rocket, alrTRS(s.x, s.y, s.z, Math.atan2(dx, dz), 1, 1, 1, -Math.atan2(dy, h)), { team: team(s.owner), spec: 0.5 });
      alrGLSprite(s.x - dx / h * 0.3, s.y, s.z - dz / h * 0.3, 0.42, 0, 1, 0.6, 0.25, 1, 0, true);
      continue;
    }
    if (s.kind === 'bomb') { alrGLSprite(s.x, s.y, s.z, 0.22, 0, 0.25, 0.22, 0.2, 1, 3, false); continue; }
    if (s.kind === 'rocket') { alrGLSprite(s.x, s.y, s.z, 0.32, 0, 1, 0.7, 0.3, 1, 0, true); alrGLSprite(s.x, s.y, s.z, 0.14, 0, 1, 1, 0.9, 1, 0, true); }
    else { alrGLSprite(s.x, s.y, s.z, 0.2, 0, 1, 0.85, 0.5, 1, 0, true); const bk = 0.25 / Math.max(0.01, Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2])); alrGLBeam([s.x - (s.b[0] - s.a[0]) * bk, s.y, s.z - (s.b[2] - s.a[2]) * bk], [s.x, s.y, s.z], 0.05, 1, 0.8, 0.45, 0.8); }
  }
  // particles, beams, bolts, rings, chunks
  for (const f of alr.fx) {
    const u = f.t / f.T;
    if (f.kind === 'p') { const fa = u < 0.15 && !f.add ? u / 0.15 : 1 - u; alrGLSprite(f.x, f.y, f.z, f.s, f.rot, f.r, f.g, f.b, f.a * Math.max(0, fa), f.cell, !!f.add); }
    else if (f.kind === 'beam') alrGLBeam(f.a, f.b, f.w, f.r, f.g, f.bl, f.al * (1 - u));
    else if (f.kind === 'prism') { alrGLBeam(f.a, f.b, 0.24 * f.k, 0.45, 0.75, 1, 0.55 * (1 - u)); alrGLBeam(f.a, f.b, 0.07 * f.k, 1, 1, 1, 1 - u); }
    else if (f.kind === 'zap') alrZapDraw(f.a, f.b, f.seed + ((alr.t * 30) | 0), 1 - u);
    else if (f.kind === 'zapm') alrZapDraw(f.a, f.b, f.seed, (1 - u) * 0.7, 0.03, 3);
    else if (f.kind === 'ring') alrGLGround(f.x, f.z, f.s * u, f.s * u, 0, 1, 0.8, 0.5, (1 - u) * 0.8, 4, true, 0.05);
    else if (f.kind === 'chunk') alrGLDraw(alrArt.chunk, alrTRS(f.x, f.y, f.z, f.ry, f.s, f.s, f.s, f.rx), { spec: 0.1, team: [0.3, 0.3, 0.3] });
  }
  // RA2's green / red: the order you just gave, and the one you're about to
  alrCmdMarks(dt, S);
  // the placement ghost
  if (alr.place && U.mouse.in) {
    const D = ALR_BLD[alr.place.type], g = alrGLPick(U.mouse.x, U.mouse.y);
    const tx = Math.round(g[0] - D.w / 2), tz = Math.round(g[1] - D.h / 2);
    alr.place.tx = tx; alr.place.tz = tz;
    const ok = alrCanPlace(alr.players[0], alr.place.type, tx, tz);
    alr.place.ok = ok;
    if (D.wall && alr.place.line) for (const [wx, wz] of alrWallLine(alr.place)) {
      const good = alrCanPlace(alr.players[0], alr.place.type, wx, wz);
      alrGLGround(wx + 0.5, wz + 0.5, 0.47, 0.47, 0, good ? 0.3 : 1, good ? 1 : 0.25, 0.3, 0.38, 3, false, 0.03);
      if (good) for (const p of alrModelParts(alr.place.type)) alrGLDraw(p.mesh, alrMul(alrTRS(wx + 0.5, 0, wz + 0.5, ALR_BLD_YAW), p.M), { team: team(0), alpha: 0.5, noCast: true });
    }
    for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
      const k = (tz + j) * ALR_N + tx + i, bad = !alrIn(tx + i, tz + j) || alr.M.block[k] || alr.M.bld[k] || alr.M.ore[k] > 0;
      alrGLGround(tx + i + 0.5, tz + j + 0.5, 0.47, 0.47, 0, bad || !ok ? 1 : 0.3, bad || !ok ? 0.25 : 1, 0.3, 0.38, 3, false, 0.03);
    }
    const base = alrTRS(tx + D.w / 2, 0, tz + D.h / 2, ALR_BLD_YAW);
    for (const p of alrModelParts(alr.place.type)) alrGLDraw(p.mesh, alrMul(base, p.M), { team: team(0), alpha: 0.5, add: ok ? [0, 0.15, 0] : [0.35, 0, 0], noCast: true });
  }
  alrGLRender(ALR_N, ALR_LIGHT);
  alrOverlay();
  alr.uiT = (alr.uiT || 0) - dt;
  if (alr.uiT <= 0) { alr.uiT = 0.12; alrUISide(); alrRadar(); }
}
// where you sent them: a green ring closing in with four arrows pointing at the spot (attack-move: orange);
// what you sent them at: a red ring locked on it, pulsing. And before you click, the same, faint, under the cursor.
function alrCmdMarks(dt, S) {
  const U = alr.ui, C = U.cmd;
  const ring = (x, z, r, col, a, y) => alrGLGround(x, z, r, r, 0, col[0], col[1], col[2], a, 4, true, y || 0.04);
  const arrows = (x, z, r, col, a, spin) => { for (let k = 0; k < 4; k++) { const ang = spin + k * Math.PI / 2; alrGLGround(x + Math.cos(ang) * r, z + Math.sin(ang) * r, 0.22, 0.07, ang + Math.PI, col[0], col[1], col[2], a, 6, true, 0.045); } };
  if (C && C.t < C.T) {
    C.t += dt || 1 / 60;
    const u = C.t / C.T, col = ALR_CMD_COL[C.kind] || ALR_CMD_COL.move, fade = Math.min(1, (1 - u) * 2.5);
    const t = C.tid && alr.byId.get(C.tid);
    if (t) {
      const r = (t.kind === 'bld' ? Math.max(t.w, t.h) * 0.62 : t.D.r * 1.6 + 0.15), pulse = 1 + Math.sin(C.t * 14) * 0.08;
      ring(t.x, t.z, r * pulse, col, 0.9 * fade); ring(t.x, t.z, r * (1.5 - u * 0.5), col, 0.5 * fade);
      arrows(t.x, t.z, r * (1.9 - u * 0.6), col, 0.85 * fade, Math.PI / 4);
    } else {
      const r = 0.25 + (1 - Math.min(1, u * 2.2)) * 0.9;
      ring(C.x, C.z, r, col, 0.95 * fade); ring(C.x, C.z, 0.22, col, 0.7 * fade);
      arrows(C.x, C.z, r + 0.25, col, 0.9 * fade, Math.PI / 4);
      alrGLSprite(C.x, 0.08, C.z, 0.5, 0, col[0], col[1], col[2], 0.5 * fade, 0, true);
    }
  }
  // the preview: with your units selected, under the cursor
  if (!U.mouse.in || alr.place || alr.mode === 'sell' || alr.mode === 'repair' || U.drag && U.drag.box) return;
  if (!alr.sel.some((e) => e.kind === 'unit' && e.owner === 0)) return;
  const h = U.hover, wob = 1 + Math.sin(alr.t * 6) * 0.06;
  if (h && h.owner === 0 && h.D.carry && !alrForceOn(h) && alr.sel.some((e) => alrCanCarry(h, e))) {
    const r = h.D.r * 1.5 * wob, col = alrRoom(h) > 0 ? ALR_CMD_COL.move : ALR_CMD_COL.attack;
    ring(h.x, h.z, r, col, 0.7); arrows(h.x, h.z, r + 0.3, col, 0.6, Math.PI / 4 - alr.t * 0.8);
  } else if (h && (h.owner !== 0 || alrForceOn(h))) {
    const cook = h.owner !== 0 && alr.sel.some((e) => e.D.engineer && alrCanCapture(e, h)), col = cook ? ALR_CMD_COL.capture : ALR_CMD_COL.attack;
    const r = (h.kind === 'bld' ? Math.max(h.w, h.h) * 0.62 : h.D.r * 1.6 + 0.15) * wob;
    ring(h.x, h.z, r, col, 0.7); arrows(h.x, h.z, r + 0.3, col, 0.6, Math.PI / 4 + alr.t * 0.8);
  } else if (!h || h.owner !== 0) {
    const g = alrGLPick(U.mouse.x, U.mouse.y), col = alr.mode === 'am' ? ALR_CMD_COL.amove : ALR_CMD_COL.move;
    if (alrIn(g[0], g[1])) { ring(g[0], g[1], 0.32 * wob, col, 0.55); ring(g[0], g[1], 0.08, col, 0.6); }
  }
}
function alrFxZapMini(a, b) { alr.fx.push({ kind: 'zapm', a, b, t: 0, T: 0.12, seed: Math.random() * 1000 }); }
// a jagged bolt: midpoint displacement, three strands (a bright core and two faint)
function alrZapDraw(a, b, seed, fade, w, depth) {
  let s = (seed * 9301 + 49297) % 233280; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5);
  const pts = [a, b];
  const lv = depth || 4;
  let P = pts;
  for (let l = 0; l < lv; l++) {
    const nP = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const p = P[i], q = P[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * 0.35;
      nP.push([(p[0] + q[0]) / 2 + r() * L, (p[1] + q[1]) / 2 + r() * L, (p[2] + q[2]) / 2 + r() * L], q);
    }
    P = nP;
  }
  const ww = w || 0.07;
  for (let i = 0; i < P.length - 1; i++) {
    alrGLBeam(P[i], P[i + 1], ww * 3.2, 0.35, 0.55, 1, 0.35 * fade);
    alrGLBeam(P[i], P[i + 1], ww, 0.85, 0.92, 1, fade);
  }
}
// ---- every model's parts, posed -----------------------------------------------------------------------------------
// One place for both the live game and the sidebar's pictures (a stand-in entity at the origin). Where each moving
// part sits on its model is ALR_RIG; a mesh that isn't there (yet) is simply skipped.
// (from the art pass's report: js/alertArtP1.js)
const ALR_RIG = {
  sam_head: [0, 0.3, 0], flak_head: [0, 0.3, 0], derrick_pump: [-0.3, 0.44, 0.45],
  ifv_turret: [0, 0.24, -0.04], prismtank_turret: [0, 0.28, -0.03], mirage_turret: [0, 0.28, -0.05], v3_rack: [0, 0.3, -0.3],
  apoc_turret: [0, 0.38, -0.04], apoc_gun: [0, 0.12, 0.2], flaktrack_head: [0, 0.26, -0.12, 0.6], harvF_gun: [0, 0.5, 0.3],
  spysat_dish: [-0.25, 0.4, -0.25],
  // the helicopters' rotors (blender/alertrig.py *_ROTOR_AT): main rotors spin about y, tail rotors about x
  hawk_rotor: [0, 0.485, 0.04], hawk_tail: [0.05, 0.58, -0.69], lift_rotor: [[0, 0.54, 0.52], [0, 0.67, -0.52]],
  tater_rotor: [0, 0.52, 0.02], tater_tail: [-0.05, 0.62, -0.735], hog_rotor: [0, 0.94, 0], hog_tail: [0.05, 0.72, -1.0],
  blimp_prop: [[0.44, -0.3, -0.63], [-0.44, -0.3, -0.63]], dog_leg: [[0.05, 0.12, 0.11], [-0.05, 0.12, 0.11], [0.05, 0.12, -0.11], [-0.05, 0.12, -0.11]],
};
// a point on the hull (local x, z) in the world, for a turret that sits off-center
function alrHullAt(u, lx, lz) { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [u.x + c * lx + s * lz, u.z - s * lx + c * lz]; }
function alrModelParts(type) {
  if (ALR_BLD[type]) return alrBldParts({ type, owner: 0, anim: 0.6, tYaw: ALR_BLD_YAW + 0.6, stub: true, D: ALR_BLD[type] });
  const D = ALR_UNIT[type];
  return alrUnitParts0({ type, D, x: 0, z: 0, yaw: 0, tYaw: 0, alt: 0, walk: 0.8, moving: true, cargo: D.cap ? D.cap : 0, stub: true });
}
// a building's parts in its own frame (the caller turns it ALR_BLD_YAW and places it)
function alrBldParts(b) {
  const A = alrArt.b, t = b.type, P = alr.players[b.owner] || {}, an = b.anim || 0, R = ALR_RIG;
  const ty = (b.tYaw || 0) - ALR_BLD_YAW;          // (tYaw is a world angle; the base is turned)
  const parts = [], add = (k, M) => { if (A[k]) parts.push({ mesh: A[k], M: M || alrM4() }); };
  if (b.D && b.D.wall) {
    // a wall is a post, plus a bar toward each neighboring wall of the same owner (the line joins up)
    add(t + '_post');
    const dirs = [[1, 0, Math.PI], [-1, 0, 0], [0, 1, Math.PI / 2], [0, -1, -Math.PI / 2]];
    for (const [dx, dz, yaw] of dirs) {
      let link = b.stub ? dz === 0 : false;
      if (!b.stub) { const x = b.tx + dx, z = b.tz + dz; if (alrIn(x, z)) { const n = alr.byId.get(alr.M.bld[z * ALR_N + x]); link = !!(n && n.D.wall && n.owner === b.owner); } }
      if (link) add(t + '_bar', alrTRS(0, 0, 0, yaw));
    }
    return parts;
  }
  add(t);
  if (t === 'turret') add('turret_head', alrTRS(0, 0.32, 0, ty));
  if (t === 'sam') add('sam_head', alrTRS(R.sam_head[0], R.sam_head[1], R.sam_head[2], ty));
  if (t === 'flak') add('flak_head', alrTRS(R.flak_head[0], R.flak_head[1], R.flak_head[2], ty));
  if (t === 'radar') add('radar_dish', alrTRS(0.45, 0.78, -0.45, P.low ? 0.8 : an * 1.3));
  if (t === 'spysat') { const p = R.spysat_dish; add('spysat_dish', alrTRS(p[0], p[1], p[2], P.low ? 0.4 : 0.4 + Math.sin(an * 0.12) * 1.6)); }   // slewing, slowly, across the sky
  if (t === 'hq') add('hq_crane', alrTRS(-1.05, 0, -1.0, 0.7 + Math.sin(an * 0.25) * 1.2));
  if (t === 'factory') { const op = alrClamp(b.door > 0 ? Math.min(1, (1.6 - b.door) * 4, b.door * 2) : 0, 0, 1); add('factory_door', alrTRS(0, 0.42 + op * 0.38, 0.86, 0, 1, 1 - op * 0.75, 1)); }
  if (t === 'barracks') add('barracks_flag', alrTRS(0.72, 1.02, -0.65, 0.5 + Math.sin(an * 2.1) * 0.25));
  if (t === 'derrick') { const p = R.derrick_pump; add('derrick_pump', alrTRS(p[0], p[1], p[2], 0, 1, 1, 1, Math.sin(an * (b.owner === alr.NEU ? 0.6 : 1.8)) * 0.35)); }
  return parts;
}
// a unit's parts, posed: legs walk, a turret turns, a gun recoils, the hauler's drum spins, a jet banks
// (drawn a size up from their footprint so a soldier reads at battle zoom, the way RA2's sprites did)
const ALR_DRAW_SCALE = { inf: 1.3, rocket: 1.3, conscript: 1.3, engineer: 1.3, zapper: 1.3, jetpack: 1.3, dog: 1.25, tank: 1.15, heavy: 1.12, harv: 1.1, harvF: 1.1, ifv: 1.12, prismtank: 1.12, mirage: 1.12, flaktrack: 1.12, v3: 1.1, apoc: 1.05 };
const ALR_INF_BODY = { inf: 'inf', rocket: 'rocket', conscript: 'conscript', engineer: 'engineer', zapper: 'zapper', jetpack: 'jetpack' };
function alrUnitParts(u) {
  const parts = alrUnitParts0(u), k = ALR_DRAW_SCALE[u.type] || 1;
  if (k === 1) return parts;
  const S = alrMul(alrMul(alrTRS(u.x, 0, u.z, 0), alrTRS(0, 0, 0, 0, k)), alrTRS(-u.x, 0, -u.z, 0));
  return parts.map((p) => ({ mesh: p.mesh, M: alrMul(S, p.M) }));
}
function alrUnitParts0(u) {
  const A = alrArt.u, t = u.type, R = ALR_RIG, parts = [], alt = u.alt || 0;
  const add = (k, M) => { const m = A[k] || (k === t ? A[ALR_FALLBACK[k]] : null); if (m) parts.push({ mesh: m, M }); };
  if (ALR_INF_BODY[t]) {
    const fly = u.D && u.D.air;
    const sw = u.moving ? Math.sin(u.walk) * (fly ? 0.25 : 0.7) : fly ? 0.15 : 0, bob = fly ? Math.sin((u.walk || 0) * 0.4 + u.id) * 0.03 : u.moving ? Math.abs(Math.cos(u.walk)) * 0.02 : 0;
    const B = alrTRS(u.x, alt + bob, u.z, u.yaw);
    add(ALR_INF_BODY[t], B);
    add('leg', alrMul(B, alrTRS(0.045, 0.13, 0, 0, 1, 1, 1, sw)));
    add('leg', alrMul(B, alrTRS(-0.045, 0.13, 0, 0, 1, 1, 1, -sw)));
    return parts;
  }
  if (t === 'dog') {
    const B = alrTRS(u.x, (u.leap > 0 ? Math.sin(u.leap / 0.3 * Math.PI) * 0.18 : 0), u.z, u.yaw);
    add('dog', B);
    R.dog_leg.forEach(([x, y, z], i) => add('dog_leg', alrMul(B, alrTRS(x, y, z, 0, 1, 1, 1, u.moving ? Math.sin(u.walk * 1.6 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.8 : 0))));
    return parts;
  }
  if (u.D && u.D.air === 'heli') {
    // a helicopter: the body dips its nose as it picks up speed; the rotors spin (a tandem lifter's two
    // counter-rotate); a lifter's tank rides along — on the sling under the Sky Fryer, between the Hog's legs
    const sp = Math.min(1, Math.hypot(u.vx || 0, u.vz || 0) / u.D.speed), rot = u.rot || 0;
    const B = alrTRS(u.x, alt, u.z, u.yaw, 1, 1, 1, sp * 0.14);
    add(t, B);
    const rr = R[t + '_rotor'];
    if (rr) (Array.isArray(rr[0]) ? rr : [rr]).forEach((p, i) => add(t + '_rotor', alrMul(B, alrTRS(p[0], p[1], p[2], i ? 0.5 - rot : rot))));
    const tr = R[t + '_tail'];
    if (tr) add(t + '_tail', alrMul(B, alrTRS(tr[0], tr[1], tr[2], 0, 1, 1, 1, rot * 1.7)));
    if (u.D.carry === 'veh' && u.load && u.load[0]) {
      const c = u.load[0], lift = alrTRS(0, alt + u.D.sling, 0, 0);
      for (const q of alrUnitParts0({ ...c, x: u.x, z: u.z, yaw: u.yaw, tYaw: u.yaw, alt: 0, moving: false, recoil: 0 })) parts.push({ mesh: q.mesh, M: alrMul(lift, q.M) });
    }
    return parts;
  }
  const H = alrTRS(u.x, alt, u.z, u.yaw);
  if (t === 'jet') { add('jet', alrTRS(u.x, alt, u.z, u.yaw, 1, 1, 1, 0, -(u.bank || 0))); return parts; }
  if (t === 'blimp') {
    const tip = alrPourTip(u), HB = tip ? alrTRS(u.x, alt, u.z, u.yaw, 1, 1, 1, tip) : H;
    add('blimp', HB);
    for (const [x, y, z] of R.blimp_prop) add('blimp_prop', alrMul(HB, alrTRS(x, y, z, 0, 1, 1, 1, 0, (alr.t || 0) * 9 + x)));
    return parts;
  }
  if (t === 'tank' || t === 'heavy') {
    const hy = t === 'tank' ? 0.29 : 0.34, gy = t === 'tank' ? 0.075 : 0.09, gz = t === 'tank' ? 0.12 : 0.15;
    const T = alrTRS(u.x, hy, u.z, u.tYaw), rc = Math.max(0, u.recoil || 0) * 0.07;
    add(t, H); add(t + '_turret', T); add(t + '_gun', alrMul(T, alrTRS(0, gy, gz - rc, 0)));
    return parts;
  }
  if (t === 'harv' || t === 'harvF') {
    add(t, H);
    if (t === 'harv') add('harv_drum', alrMul(H, alrTRS(0, 0.12, 0.52, 0, 1, 1, 1, u.drum || 0)));
    else { const g = R.harvF_gun, [gx, gz] = alrHullAt(u, g[0], g[2]); add('harv_drum', alrMul(H, alrTRS(0, 0.12, 0.52, 0, 1, 1, 1, u.drum || 0))); add('harvF_gun', alrTRS(gx, g[1], gz, u.tYaw)); }
    const f = (u.cargo || 0) / u.D.cap;
    if (f > 0.02) add('harv_load', alrMul(H, alrTRS(0, 0.36 + f * 0.08, -0.2, 0, 1, Math.max(0.2, f), 1)));
    return parts;
  }
  if (t === 'ifv' || t === 'prismtank' || t === 'mirage') { const r = R[t + '_turret'], [tx, tz] = alrHullAt(u, r[0], r[2]); add(t, H); add(t + '_turret', alrTRS(tx, r[1], tz, u.tYaw)); return parts; }
  if (t === 'flaktrack') { add(t, H); const f = R.flaktrack_head, [tx, tz] = alrHullAt(u, f[0], f[2]); if (alrArt.b.flak_head) parts.push({ mesh: alrArt.b.flak_head, M: alrTRS(tx, f[1], tz, u.tYaw, f[3]) }); return parts; }
  if (t === 'apoc') {
    const r = R.apoc_turret, [tx, tz] = alrHullAt(u, r[0], r[2]);
    const T = alrTRS(tx, r[1], tz, u.tYaw), rc = Math.max(0, u.recoil || 0) * 0.08, g = R.apoc_gun;
    add('apoc', H); add('apoc_turret', T); add('apoc_gun', alrMul(T, alrTRS(g[0], g[1], g[2] - rc, 0)));
    return parts;
  }
  if (t === 'v3') {
    const r = R.v3_rack, K = alrMul(H, alrTRS(r[0], r[1], r[2], 0));
    add('v3', H); add('v3_rack', K);
    // the rocket sits on the rail until it's fired, then a new one's loaded
    if (u.stub || (u.cool || 0) < ALR_WPN.v3.rof * 0.55) add('v3_rocket', alrMul(K, alrTRS(0, 0.186, 0.222, 0, 1, 1, 1, -0.436)));
    return parts;
  }
  add(t, H);
  return parts;
}
// until a model exists, borrow a close one (so nothing is ever invisible)
const ALR_FALLBACK = { conscript: 'inf', engineer: 'inf', zapper: 'inf', jetpack: 'inf', ifv: 'tank', prismtank: 'tank', mirage: 'tank', apoc: 'heavy', flaktrack: 'tank', harvF: 'harv', v3: 'tank', jet: 'tank', blimp: 'harv', dog: 'leg', hawk: 'jet', tater: 'jet', lift: 'harv', hog: 'harv' };

// ---- the overlay: selection brackets, health pips, the drag box, floating text --------------------------------------
function alrOverlay() {
  const U = alr.ui, g = U.g, cam = alr.cam, dpr = cam.dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cam.w, cam.h);
  const S = alr.players[0].shroud;
  const bar = (x, y, w, f, segs) => {
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x - 1, y - 1, w + 2, 6);
    const col = f > 0.6 ? '#3ce65a' : f > 0.3 ? '#ffd23a' : '#ff4a3a';
    const n = segs || 10, sw = w / n;
    for (let i = 0; i < n; i++) { g.fillStyle = (i + 0.5) / n <= f ? col : 'rgba(60,60,60,0.8)'; g.fillRect(x + i * sw + 0.5, y, sw - 1, 4); }
  };
  // veterancy: a chevron for a veteran, two for elite, always shown on yours
  for (const e of alr.ents) {
    if (e.kind !== 'unit' || !e.rank || (e.owner !== 0 && !S[alrTile(e.x, e.z)])) continue;
    const p = alrGLProject(e.x, (e.alt || 0) + (e.D.cat === 'inf' ? 0.55 : 0.62), e.z);
    for (let k = 0; k < e.rank; k++) {
      const y = p[1] - 12 - k * 4;
      g.strokeStyle = '#000'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(p[0] + 14, y + 3); g.lineTo(p[0] + 17, y); g.lineTo(p[0] + 20, y + 3); g.stroke();
      g.strokeStyle = e.rank === 2 ? '#ffd23a' : '#d8e2ee'; g.lineWidth = 1.8; g.stroke();
    }
  }
  // the Sky Fryer's sling: four cables from the belly hook down to the corners of the tank it's carrying
  g.strokeStyle = 'rgba(30, 32, 34, 0.85)'; g.lineWidth = 1.3;
  for (const e of alr.ents) {
    if (e.kind !== 'unit' || !e.D.carry || !(e.D.sling < 0) || !e.load || !e.load[0]) continue;
    if (e.owner !== 0 && !S[alrTile(e.x, e.z)]) continue;
    const hk = alrGLProject(e.x, e.alt + 0.04, e.z), c = Math.cos(e.yaw), sn = Math.sin(e.yaw), y = e.alt + e.D.sling + 0.3;
    g.beginPath();
    for (const [lx, lz] of [[0.2, 0.26], [-0.2, 0.26], [0.2, -0.26], [-0.2, -0.26]]) { const q = alrGLProject(e.x + c * lx + sn * lz, y, e.z - sn * lx + c * lz); g.moveTo(hk[0], hk[1]); g.lineTo(q[0], q[1]); }
    g.stroke();
  }
  for (const e of alr.ents) {
    const sel = alr.sel.includes(e);
    const hover = U.hover === e;
    const damaged = e.hp < e.max - 0.5;
    if (!sel && !hover && !(damaged && e.owner === 0 && e.kind === 'bld')) continue;
    if (e.owner !== 0 && !S[alrTile(e.x, e.z)]) continue;
    if (e.kind === 'unit') {
      const top = alrGLProject(e.x, (e.alt || 0) + (e.D.cat === 'inf' ? 0.55 : e.type === 'blimp' ? 0.75 : 0.62), e.z);
      const w = e.D.cat === 'inf' ? 22 : e.type === 'blimp' ? 54 : 34;
      if (sel || hover) bar(top[0] - w / 2, top[1] - 8, w, e.hp / e.max, e.D.cat === 'inf' ? 5 : 8);
      if (e.D.harv && sel) { g.fillStyle = '#ffd23a'; g.fillRect(top[0] - w / 2, top[1] - 2, w * e.cargo / e.D.cap, 2); }
      if (e.D.air === 'jet' && sel) { g.fillStyle = e.ammo > 0 ? '#ffd23a' : '#555'; g.fillRect(top[0] - 4, top[1] - 2, 8, 3); }
      if (e.D.carry && (sel || hover)) {
        // one pip a seat: lit for each aboard
        const n = e.D.cap, pw = n > 1 ? 5 : 12, x0 = top[0] - (n * (pw + 2) - 2) / 2;
        for (let k = 0; k < n; k++) { g.fillStyle = '#000'; g.fillRect(x0 + k * (pw + 2) - 1, top[1] - 1, pw + 2, 5); g.fillStyle = k < e.load.length ? '#5cff6a' : '#2b3a2e'; g.fillRect(x0 + k * (pw + 2), top[1], pw, 3); }
      }
    } else {
      // the bracket around a building's box on screen
      const pts = [];
      for (const [dx, dz] of [[0, 0], [e.w, 0], [0, e.h], [e.w, e.h]]) for (const y of [0, e.type === 'tesla' ? 1.45 : e.type === 'hq' ? 1.3 : 1.0]) pts.push(alrGLProject(e.tx + dx, y, e.tz + dz));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const L = Math.min(...xs), R = Math.max(...xs), T = Math.min(...ys), B = Math.max(...ys);
      if (sel || hover) {
        g.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
        const c = 10;
        g.beginPath();
        g.moveTo(L, T + c); g.lineTo(L, T); g.lineTo(L + c, T); g.moveTo(R - c, T); g.lineTo(R, T); g.lineTo(R, T + c);
        g.moveTo(L, B - c); g.lineTo(L, B); g.lineTo(L + c, B); g.moveTo(R - c, B); g.lineTo(R, B); g.lineTo(R, B - c);
        g.stroke();
      }
      bar(L + 4, T - 8, Math.max(30, R - L - 8), e.hp / e.max, Math.max(6, e.w * 5));
      if (e.repair) { g.font = '14px sans-serif'; g.fillText('🔧', (L + R) / 2 - 7, T + 16); }
      if (sel && e.rally) { const a = alrGLProject(e.x, 0, e.z), r = alrGLProject(e.rally[0], 0, e.rally[1]); g.strokeStyle = 'rgba(120,255,120,0.6)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(r[0], r[1]); g.stroke(); g.setLineDash([]); g.fillStyle = '#7aff7a'; g.fillRect(r[0] - 3, r[1] - 3, 6, 6); }
    }
  }
  // the order's lines: from every unit you sent to where it's going (green) or to what it's going for (red)
  const C = U.cmd;
  if (C && C.t < C.T) {
    const u = C.t / C.T, col = ALR_CMD_COL[C.kind] || ALR_CMD_COL.move, a = Math.min(1, (1 - u) * 2.2);
    const css = `rgba(${(col[0] * 255) | 0},${(col[1] * 255) | 0},${(col[2] * 255) | 0},`;
    const t = C.tid && alr.byId.get(C.tid);
    const to = t ? alrGLProject(t.x, t.kind === 'bld' ? 0.3 : (t.alt || 0) + 0.2, t.z) : alrGLProject(C.x, 0.02, C.z);
    g.lineCap = 'round';
    for (const id of C.ids) {
      const e = alr.byId.get(id); if (!e) continue;
      const f = alrGLProject(e.x, (e.alt || 0) + 0.15, e.z);
      g.strokeStyle = `rgba(0,0,0,${0.5 * a})`; g.lineWidth = 4; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(to[0], to[1]); g.stroke();
      g.strokeStyle = css + (0.9 * a) + ')'; g.lineWidth = 2; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(to[0], to[1]); g.stroke();
      g.fillStyle = css + a + ')'; g.beginPath(); g.arc(f[0], f[1], 3, 0, 7); g.fill();
    }
    if (t) {
      // the reticle: four corner ticks and a cross, closing in on it
      const R = 18 + (1 - Math.min(1, u * 3)) * 16;
      g.strokeStyle = `rgba(0,0,0,${0.6 * a})`; g.lineWidth = 4;
      const ret = () => { g.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(to[0] + sx * R, to[1] + sy * R * 0.6 - sy * 8); g.lineTo(to[0] + sx * R, to[1] + sy * R * 0.6); g.lineTo(to[0] + sx * R - sx * 8, to[1] + sy * R * 0.6); } g.moveTo(to[0] - 6, to[1]); g.lineTo(to[0] + 6, to[1]); g.moveTo(to[0], to[1] - 6); g.lineTo(to[0], to[1] + 6); g.stroke(); };
      ret(); g.strokeStyle = css + a + ')'; g.lineWidth = 2; ret();
    }
    g.lineCap = 'butt';
  }
  if (U.drag && U.drag.box) {
    const d = U.drag;
    g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,0.08)';
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    g.fillRect(x, y, w, h); g.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  g.font = 'bold 13px Impact, "Arial Black", sans-serif'; g.textAlign = 'center';
  for (const f of alr.fx) if (f.kind === 'text') {
    const p = alrGLProject(f.x, f.y, f.z), a = 1 - f.t / f.T;
    g.globalAlpha = a; g.fillStyle = '#000'; g.fillText(f.text, p[0] + 1, p[1] + 1); g.fillStyle = f.col; g.fillText(f.text, p[0], p[1]); g.globalAlpha = 1;
  }
  g.textAlign = 'left';
  if (alr.mode === 'am') { g.fillStyle = 'rgba(255,90,60,0.9)'; g.font = 'bold 12px sans-serif'; g.fillText('ATTACK-MOVE: click the ground', 12, cam.h - 14); }
}

// ---- the radar ----------------------------------------------------------------------------------------------------
// The map as RA2 showed it: a diamond, turned to match the camera. The camera's screen-right is the world's
// +z−x and its screen-up is +x+z (alrGLCamera, yaw 45°), so the radar uses the same axes. (It used +x−z and
// x+z downward — the whole map turned 180° from the battlefield — "the map is backwards", Chris.)
// Filling the box: the diamond's four corners touch the radar's four sides, so the map's edge is the radar's edge.
// (It was drawn flattened to sin(pitch), the camera's own squash: a thin diamond in the middle of the square, the
// rest black like the shroud — at the edge of the map the box looked 60% of the way across. Chris: "I'm at the edge
// of the map but the radar only shows me like 60% up and to the right".) The map's outline is always drawn, so
// where the map ends shows even before it's explored.
function alrRadarK() { return 1; }
function alrRadarXY(x, z) { const N = ALR_N, K = alrRadarK(); return [210 + (z - x) / N * 210, 210 - ((x + z) / N - 1) * 210 * K]; }
function alrRadarInv(u, v) { const N = ALR_N, K = alrRadarK(); const a = (u - 210) / 210 * N, b = N * (1 + (210 - v) / (210 * K)); return [(b - a) / 2, (a + b) / 2]; }
function alrRadar() {
  const U = alr.ui, g = U.rg, P = alr.players[0];
  const on = alrHas(0, 'radar') && !P.low;
  U.radarOff.hidden = on;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000'; g.fillRect(0, 0, 420, 420);
  if (!on) {
    // static
    const id = g.createImageData(105, 105);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 60; id.data[i] = v; id.data[i + 1] = v * 1.1; id.data[i + 2] = v * 1.2; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0); g.drawImage(U.radar, 0, 0, 105, 105, 0, 0, 420, 420);
    return;
  }
  // the ground, the ore and the shroud as ONE N×N picture (a pixel a tile), turned into the diamond. (It used
  // to be a polygon per unexplored tile: 16k paths ten times a second on the big maps.)
  const N = ALR_N;
  if (!U.radarLayer || U.radarLayer.width !== N) {
    U.radarLayer = document.createElement('canvas'); U.radarLayer.width = U.radarLayer.height = N;
    const gc = document.createElement('canvas'); gc.width = gc.height = N; gc.getContext('2d').drawImage(U.radarGround, 0, 0, N, N);
    U.radarGroundPx = gc.getContext('2d').getImageData(0, 0, N, N).data;
    U.radarImg = U.radarLayer.getContext('2d').createImageData(N, N);
  }
  const src = U.radarGroundPx, dst = U.radarImg.data, ore = alr.M.ore, sh = P.shroud;
  for (let k = 0; k < N * N; k++) {
    const o = k * 4;
    if (sh[k] <= 40) { dst[o] = dst[o + 1] = dst[o + 2] = 0; }
    else if (ore[k] > 0) { dst[o] = 232; dst[o + 1] = 176; dst[o + 2] = 48; }
    else { dst[o] = src[o]; dst[o + 1] = src[o + 1]; dst[o + 2] = src[o + 2]; }
    dst[o + 3] = 255;
  }
  U.radarLayer.getContext('2d').putImageData(U.radarImg, 0, 0);
  g.save();
  const s = 420 / 2 / N, sk = s * alrRadarK();
  g.setTransform(-s, -sk, s, -sk, 210, 210 + sk * N);  // tile (x, z) → the radar's (u, v), the same map as alrRadarXY
  g.imageSmoothingEnabled = false;
  g.drawImage(U.radarLayer, 0, 0, N, N);
  g.restore();
  // the map's edge: the four corners outside it in the panel's colour, the diamond outlined
  g.fillStyle = '#10151c'; g.beginPath(); g.rect(0, 0, 420, 420);
  g.moveTo(210, 0); g.lineTo(0, 210); g.lineTo(210, 420); g.lineTo(420, 210); g.closePath(); g.fill('evenodd');
  g.strokeStyle = 'rgba(150, 190, 230, 0.55)'; g.lineWidth = 2; g.beginPath();
  g.moveTo(210, 1); g.lineTo(419, 210); g.lineTo(210, 419); g.lineTo(1, 210); g.closePath(); g.stroke();
  for (const e of alr.ents) {
    if (e.owner !== 0 && P.shroud[alrTile(e.x, e.z)] < 40) continue;
    g.fillStyle = ALR_TEAMS[e.owner].css;
    if (e.kind === 'bld') {
      const a = alrRadarXY(e.tx, e.tz), b = alrRadarXY(e.tx + e.w, e.tz), c = alrRadarXY(e.tx + e.w, e.tz + e.h), d = alrRadarXY(e.tx, e.tz + e.h);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    } else { const [u, v] = alrRadarXY(e.x, e.z); g.fillRect(u - 3, v - 3, 6, 6); }
  }
  for (const c of alr.crates || []) if (P.shroud[alrTile(c.x, c.z)] > 40) { const [u, v] = alrRadarXY(c.x, c.z); g.fillStyle = '#fff'; g.fillRect(u - 2.5, v - 2.5, 5, 5); }
  // what the camera sees
  const cam = alr.cam, cs = [alrGLPick(0, 0), alrGLPick(cam.w, 0), alrGLPick(cam.w, cam.h), alrGLPick(0, cam.h)].map((c) => alrRadarXY(c[0], c[1]));
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); cs.forEach((c, i) => (i ? g.lineTo(c[0], c[1]) : g.moveTo(c[0], c[1]))); g.closePath(); g.stroke();
}
// the radar takes orders (RA2): with your units selected, a click sends them there (onto an enemy: attack);
// a drag, or a click with nothing selected, moves the camera; a right-click (or right-drag) takes the camera there
function alrRadarAt(e) {
  const r = alr.ui.radar.getBoundingClientRect(), u = (e.clientX - r.left) / r.width * 420, v = (e.clientY - r.top) / r.height * 420;
  const [x, z] = alrRadarInv(u, v);
  return [alrClamp(x, 0.5, ALR_N - 0.5), alrClamp(z, 0.5, ALR_N - 0.5)];
}
function alrRadarOn() { return alr.phase === 'play' && alrHas(0, 'radar') && !alr.players[0].low; }
function alrRadarPan(e) { const [x, z] = alrRadarAt(e); alr.cam.x = x; alr.cam.z = z; }
function alrRadarDown(e) {
  if (!alrRadarOn()) return;
  alrAudioWake();
  const U = alr.ui;
  // right-click: jump the camera there (hold and drag to keep panning) — the selection stays
  if (e.button === 2) { U.rdrag = { x: e.clientX, y: e.clientY, moved: true, order: false, right: true }; U.radar.setPointerCapture(e.pointerId); alrRadarPan(e); return; }
  U.rdrag = { x: e.clientX, y: e.clientY, moved: false, order: alr.sel.some((s) => s.owner === 0 && (s.kind === 'unit' || s.D.makes)) };
  U.radar.setPointerCapture(e.pointerId);
  if (!U.rdrag.order) alrRadarPan(e);
}
function alrRadarMove(e) {
  const d = alr.ui.rdrag;
  if (!d || !(e.buttons & (d.right ? 2 : 1))) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
  if (d.moved || !d.order) alrRadarPan(e);
}
function alrRadarUp(e) {
  const U = alr.ui, d = U.rdrag; U.rdrag = null;
  if (!d || d.moved || !d.order || e.button !== 0) return;
  const [x, z] = alrRadarAt(e);
  // whose is it, there? an enemy building's tile, or the nearest enemy you can see within a tile
  const S = alr.players[0].shroud, b = alr.byId.get(alr.M.bld[alrTile(x, z)]);
  let hit = b && b.owner !== 0 && S[alrTile(x, z)] > 40 ? b : null;
  if (!hit) { let bd = 1.4; for (const q of alr.ents) if (q.kind === 'unit' && q.owner !== 0 && q.owner !== alr.NEU && S[alrTile(q.x, q.z)] > 40) { const dd = Math.hypot(q.x - x, q.z - z); if (dd < bd) { bd = dd; hit = q; } } }
  alrCommandAt([x, z], hit, alr.mode === 'am');
}

// ---- picking + commands ---------------------------------------------------------------------------------------------
function alrPickAt(px, py) {
  // units first (by screen distance), then buildings (by their box on screen)
  let best = null, bd = 1e9;
  const S = alr.players[0].shroud;
  for (const e of alr.ents) {
    if (e.kind !== 'unit') continue;
    if (e.owner !== 0 && S[alrTile(e.x, e.z)] < 40) continue;
    const p = alrGLProject(e.x, (e.alt || 0) + (e.D.cat === 'inf' ? 0.25 : 0.2), e.z), r = e.D.cat === 'inf' ? 14 : e.type === 'blimp' ? 40 : e.D.air === 'heli' ? (e.D.carry === 'veh' ? 34 : 28) : 22, d = Math.hypot(p[0] - px, p[1] - py);
    if (d < r && d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  const force = alr.ui && alr.ui.force;     // (Ctrl / ⌘ held: force-fire — the only way a click lands on a bridge)
  for (const e of alr.ents) {
    if (e.kind !== 'bld') continue;
    if (e.D.bridge && !force) continue;
    if (e.owner !== 0 && S[alrTile(e.x, e.z)] < 40) continue;
    const pts = [];
    for (const [dx, dz] of [[0.1, 0.1], [e.w - 0.1, 0.1], [0.1, e.h - 0.1], [e.w - 0.1, e.h - 0.1]]) for (const y of [0, e.type === 'tesla' ? 1.3 : 0.8]) pts.push(alrGLProject(e.tx + dx, y, e.tz + dz));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    if (px > Math.min(...xs) && px < Math.max(...xs) && py > Math.min(...ys) && py < Math.max(...ys)) {
      // the box on screen is generous; the ground under the cursor decides between neighbors
      const g = alrGLPick(px, py), on = g[0] >= e.tx - 0.5 && g[0] <= e.tx + e.w + 0.5 && g[1] >= e.tz - 1.5 && g[1] <= e.tz + e.h + 0.5;
      if (on || !best) best = e;
    }
  }
  return best;
}
function alrCommand(px, py, forceAM) { alrCommandAt(alrGLPick(px, py), alrPickAt(px, py), forceAM); }
// force-fire (RA2's Ctrl — or ⌘ on a Mac): hold it and a click on something of your own is an attack order
function alrForceOn(h) { return !!(alr.ui.force && h && h.owner === 0 && h.hp > 0 && alr.sel.some((s) => s.kind === 'unit' && s.owner === 0 && s !== h)); }
function alrCommandAt(g, hit, forceAM, force) {
  const units = alr.sel.filter((e) => e.kind === 'unit' && e.owner === 0);
  const blds = alr.sel.filter((e) => e.kind === 'bld' && e.owner === 0 && (e.D.makes));
  if (!units.length) {
    if (blds.length) { for (const b of blds) b.rally = [g[0], g[1]]; alrCmdFx('move', g[0], g[1], null, blds); alrSfx('click'); }
    return;
  }
  if (force && hit) {
    const shooters = units.filter((u) => u !== hit && !u.D.engineer && (alrCanHit(ALR_WPN[u.D.weapon], hit) || (u.D.weapon2 && alrCanHit(ALR_WPN[u.D.weapon2], hit))));
    if (!shooters.length) { alrSfx('error'); return; }
    for (const u of shooters) alrOrderAttack(u, hit);
    alrCmdFx('attack', hit.x, hit.z, hit, shooters); alrSfx('ack'); alrAck(shooters, 'attack');
    alr.mode = ''; return;
  }
  // into a carrier: whoever fits boards it (as many as there's room for)
  if (hit && hit.owner === 0 && hit.D.carry) {
    const go = units.filter((u) => alrCanCarry(hit, u) && alrOrderBoard(u, hit));
    if (go.length) { alrCmdFx('board', hit.x, hit.z, hit, go); alrSfx('ack'); alrAck(go, 'move'); }
    else alrSfx('error');
    return;
  }
  // cooks: into a building that isn't yours to take it, into one of yours that's hurt to fix it
  const cooks = units.filter((u) => u.D.engineer && hit && alrCanCapture(u, hit));
  if (cooks.length) { for (const u of cooks) alrOrderAttack(u, hit); alrCmdFx('capture', hit.x, hit.z, hit, cooks); alrSfx('ack'); alrAck(cooks, 'attack'); if (cooks.length === units.length) return; }
  if (hit && hit.owner !== 0) {
    const shooters = units.filter((u) => (u.D.weapon || u.D.weapon2) && !u.D.engineer);
    for (const u of shooters) alrOrderAttack(u, hit);
    alrCmdFx('attack', hit.x, hit.z, hit, shooters.length ? shooters : units); alrSfx('ack'); alrAck(shooters.length ? shooters : units, 'attack'); return;
  }
  const harvs = units.filter((u) => u.D.harv), rest = units.filter((u) => !u.D.harv);
  if (harvs.length) {
    const k = alrTile(g[0], g[1]);
    if (hit && hit.type === 'refinery') for (const h of harvs) { h.order = { type: 'harvest' }; h.hstate = 'home'; h.path = null; }
    else if (alrIn(g[0], g[1]) && alr.M.ore[k] > 0) { for (const h of harvs) { h.order = { type: 'harvest' }; h.hstate = 'seek'; h.path = null; h.oreAt = [g[0], g[1]]; } if (!rest.length) { alrCmdFx('move', g[0], g[1], null, harvs); alrAck(harvs, 'attack'); alrSfx('ack'); return; } }
    else for (const h of harvs) alrOrderMove(h, g[0], g[1], false);
  }
  if (rest.length) alrGroupMove(rest, g[0], g[1], forceAM || alr.mode === 'am');
  alrCmdFx(forceAM || alr.mode === 'am' ? 'amove' : 'move', g[0], g[1], null, units);
  alrSfx('ack'); alrAck(units, forceAM || alr.mode === 'am' ? 'attack' : 'move');
  alr.mode = '';
}
function alrPing(x, z, att) { alrCmdFx(att ? 'amove' : 'move', x, z, null, []); }
// an order's feedback (RA2's green / red): lines from each unit to where it was sent (green) or to what it was sent
// at (red), a marker where they're going, a reticle on the target — for a second and a bit
function alrCmdFx(kind, x, z, target, units) {
  alr.ui.cmd = { kind, x, z, tid: target ? target.id : 0, ids: units.map((u) => u.id), t: 0, T: 1.4 };
}
const ALR_CMD_COL = { move: [0.35, 1, 0.4], amove: [1, 0.55, 0.2], attack: [1, 0.22, 0.15], capture: [1, 0.85, 0.25] };

function alrPointerDown(e) {
  const U = alr.ui;
  alrAudioWake();
  if (alr.phase !== 'play' || alr.paused) return;
  const r = U.ov.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  U.mouse.x = x; U.mouse.y = y; U.mouse.in = true;
  if (e.button === 1) { U.pan = { x, y, cx: alr.cam.x, cz: alr.cam.z }; e.preventDefault(); return; }
  U.force = e.ctrlKey || e.metaKey;
  const macCtrl = e.button === 2 && e.ctrlKey && /Mac/i.test(navigator.platform || navigator.userAgent);
  if ((e.button === 0 || macCtrl) && U.force && !alr.place && alr.mode !== 'sell' && alr.mode !== 'repair') {
    const h = alrPickAt(x, y);
    if (alrForceOn(h)) { alrCommandAt(alrGLPick(x, y), h, false, true); return; }
    if (macCtrl) { if (alr.sel.some((s) => s.owner === 0)) alrCommand(x, y); return; }   // a Mac's Ctrl+click on the ground: still a left click
  }
  if (e.button === 2) {
    // right-click: cancel what you're holding (a building to place, sell / repair / attack-move), else let
    // go of the selection — RA2's right-click (Chris: "make it so a right click will unselect")
    if (alr.place || alr.mode) { alr.place = null; alr.mode = ''; alrUIButtons(); return; }
    if (alr.sel.length) { alr.sel = []; alrSfx('click'); }
    return;
  }
  if (alr.place) {
    const p = alr.place;
    // a wall: press, drag a straight line, let go
    if (ALR_BLD[p.type].wall) { p.line = { tx: p.tx, tz: p.tz }; U.ov.setPointerCapture(e.pointerId); return; }
    if (p.ok && alrPlace(alr.players[0], p.type, p.tx, p.tz)) { alr.place = null; alrUISide(); }
    else { alrSfx('error'); alrSay('CANNOT DEPLOY HERE', '#ff8a7a'); }
    return;
  }
  if (alr.mode === 'sell' || alr.mode === 'repair') {
    const h = alrPickAt(x, y);
    if (h && h.kind === 'bld' && h.owner === 0) { if (alr.mode === 'sell') alrSell(h); else { h.repair = !h.repair; alrSfx('click'); if (h.repair) alrSay('REPAIRING', '#9be7ff'); } }
    else alrSfx('error');
    if (!e.shiftKey) { alr.mode = ''; alrUIButtons(); }
    return;
  }
  if (alr.mode === 'am') { alrCommand(x, y, true); return; }
  U.drag = { x0: x, y0: y, x1: x, y1: y, box: false, shift: e.shiftKey, force: U.force };
  U.ov.setPointerCapture(e.pointerId);
}
function alrPointerMove(e) {
  const U = alr.ui, r = U.ov.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  U.mouse.x = x; U.mouse.y = y; U.mouse.in = true;
  if (U.pan) { const k = alr.cam.zoom / alr.cam.h; const G = alrGL, rx = G.right[0], rz = G.right[2], fl = Math.hypot(G.fwd[0], G.fwd[2]), fx = G.fwd[0] / fl, fz = G.fwd[2] / fl; const dx = (x - U.pan.x) * k, dy = (y - U.pan.y) * k / Math.sin(alr.cam.pitch); alr.cam.x = U.pan.cx - rx * dx + fx * dy; alr.cam.z = U.pan.cz - rz * dx + fz * dy; return; }
  if (U.drag) { U.drag.x1 = x; U.drag.y1 = y; if (Math.hypot(x - U.drag.x0, y - U.drag.y0) > 6) U.drag.box = true; }
  U.force = e.ctrlKey || e.metaKey;
  alrUICursorPick();
}
// the cursor says what a click will do (on a mouse move, and when Ctrl / ⌘ goes down or up)
function alrUICursorPick() {
  const U = alr.ui, x = U.mouse.x, y = U.mouse.y;
  if (!U.mouse.in) return;
  const h = alr.phase === 'play' ? alrPickAt(x, y) : null;
  U.hover = h;
  const mine = alr.sel.some((s) => s.kind === 'unit' && s.owner === 0);
  let cur = 'default';
  const cook = h && alr.sel.some((s) => s.owner === 0 && s.D.engineer && alrCanCapture(s, h));
  if (alr.place) cur = 'copy';
  else if (alr.mode === 'sell') cur = h && h.kind === 'bld' && h.owner === 0 && !h.D.tech ? ALR_CURSOR.sell : ALR_CURSOR.nogo;
  else if (alr.mode === 'repair') cur = h && h.kind === 'bld' && h.owner === 0 && h.hp < h.max ? ALR_CURSOR.repair : ALR_CURSOR.nogo;
  else if (cook) cur = ALR_CURSOR.capture;
  else if (alrForceOn(h)) cur = ALR_CURSOR.attack;   // force-fire on your own: the red reticle, so you know
  else if (h && h.owner === 0 && h.D.carry && alr.sel.some((s) => alrCanCarry(h, s))) cur = alrRoom(h) > 0 ? ALR_CURSOR.board : ALR_CURSOR.nogo;
  else if (h && h.owner === 0 && h.D.carry && alr.sel.includes(h) && h.load.length) cur = alrLandOk(h.x, h.z, h) ? ALR_CURSOR.unload : ALR_CURSOR.nogo;
  else if (alr.mode === 'am') cur = ALR_CURSOR.amove;
  else if (h && h.owner !== 0 && mine) cur = ALR_CURSOR.attack;
  else if (h && h.owner === 0) cur = 'pointer';
  else if (mine) cur = ALR_CURSOR.move;
  U.cur = cur; alrUICursorTick(true);
}
// the animated cursors: the frame for now (called from the render loop and on every mouse move)
function alrUICursorTick(force) {
  const U = alr.ui, c = U.cur;
  if (!c) return;
  const f = Array.isArray(c) ? c[Math.floor(performance.now() / 1000 * ALR_CURSOR_FPS) % c.length] : c;
  if (force || f !== U.curShown) { U.curShown = f; U.ov.style.cursor = f; }
}
// the cursors (SVG, drawn here; hot spot in the middle): move = four green arrows, attack = a red reticle,
// attack-move = an orange reticle with arrows, capture = a gold arrow into a box, sell = $, repair = a wrench.
// Move, attack and attack-move are ANIMATED as RA2's were — a list of frames that alrUICursorTick flips through:
// the arrows pulse in to the point and back, the reticle closes on its target. (Chris: the green arrows were
// "kind of clunky that it just stays one size".)
const ALR_CURSOR_FPS = 14;
const ALR_CURSOR = (() => {
  const svg = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`)}") 16 16`;
  // d: how far the arrows have come in toward the point (0 = at the rim); k: their size
  const arrow = (c, d = 0, k = 1) => [0, 90, 180, 270].map((a) => `<path transform='rotate(${a} 16 16) translate(0 ${d.toFixed(2)}) translate(16 7) scale(${k.toFixed(3)}) translate(-16 -7)' d='M16 2 L21 9 L18 9 L18 ${(12 - d).toFixed(2)} L14 ${(12 - d).toFixed(2)} L14 9 L11 9 Z' fill='${c}' stroke='#000' stroke-width='1.2'/>`).join('');
  // r: the ring's radius; the four ticks ride in with it
  const ret = (c, r = 9) => `<circle cx='16' cy='16' r='${r.toFixed(2)}' fill='none' stroke='#000' stroke-width='4'/><circle cx='16' cy='16' r='${r.toFixed(2)}' fill='none' stroke='${c}' stroke-width='2'/>` +
    [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([ux, uy]) => { const a = 15 - (9 - r) * 0.6, b = r; const d = `M${16 + ux * a} ${16 + uy * a} L${16 + ux * b} ${16 + uy * b}`; return `<path d='${d}' stroke='#000' stroke-width='4'/><path d='${d}' stroke='${c}' stroke-width='2'/>`; }).join('') + `<circle cx='16' cy='16' r='2' fill='${c}' stroke='#000'/>`;
  // one beat: in fast, out slow (an ease, not a sine, so it reads as a pulse)
  const N = 10, beat = (i) => { const t = i / N; return t < 0.35 ? Math.sin(t / 0.35 * Math.PI / 2) : Math.cos((t - 0.35) / 0.65 * Math.PI / 2); };
  const frames = (f) => Array.from({ length: N }, (_, i) => f(beat(i)));
  return {
    move: frames((p) => svg(arrow('#5cff6a', p * 4, 1 - p * 0.18) + `<circle cx='16' cy='16' r='${(2.5 + p).toFixed(2)}' fill='#5cff6a' stroke='#000'/>`) + ', cell'),
    attack: frames((p) => svg(ret('#ff3a2a', 9 - p * 3)) + ', crosshair'),
    amove: frames((p) => svg(ret('#ff9a2a', 9 - p * 3)) + ', crosshair'),
    // board: a green arrow dropping into the hold's bracket; unload: arrows popping out of it
    board: frames((p) => svg(`<path d='M6 18 V27 H26 V18' fill='none' stroke='#000' stroke-width='5'/><path d='M6 18 V27 H26 V18' fill='none' stroke='#5cff6a' stroke-width='2.5'/>` +
      `<path transform='translate(0 ${(p * 5).toFixed(2)})' d='M16 21 L22 13 L18.5 13 L18.5 2 L13.5 2 L13.5 13 L10 13 Z' fill='#5cff6a' stroke='#000' stroke-width='1.3'/>`) + ', pointer'),
    unload: frames((p) => svg(`<rect x='10' y='10' width='12' height='12' fill='none' stroke='#000' stroke-width='5'/><rect x='10' y='10' width='12' height='12' fill='none' stroke='#5cff6a' stroke-width='2.5'/>` +
      [0, 90, 180, 270].map((a) => `<path transform='rotate(${a} 16 16) translate(0 ${(-p * 3).toFixed(2)})' d='M16 1 L20.5 6.5 L18 6.5 L18 8.5 L14 8.5 L14 6.5 L11.5 6.5 Z' fill='#5cff6a' stroke='#000' stroke-width='1.1'/>`).join('')) + ', pointer'),
    capture: svg(`<rect x='9' y='13' width='14' height='12' fill='none' stroke='#000' stroke-width='4'/><rect x='9' y='13' width='14' height='12' fill='none' stroke='#ffd23a' stroke-width='2'/><path d='M16 2 L22 9 L18 9 L18 16 L14 16 L14 9 L10 9 Z' fill='#ffd23a' stroke='#000' stroke-width='1.2'/>`) + ', pointer',
    sell: svg(`<circle cx='16' cy='16' r='12' fill='#1a1a1a' stroke='#ffd23a' stroke-width='2'/><text x='16' y='22' font-size='17' font-family='Arial' font-weight='bold' text-anchor='middle' fill='#ffd23a'>$</text>`) + ', pointer',
    repair: svg(`<circle cx='16' cy='16' r='12' fill='#1a1a1a' stroke='#5cc8ff' stroke-width='2'/><path d='M10 22 L18 14 M18 14 a4 4 0 1 0 2 -6 l-2 2 l-1 -1 l2 -2 a4 4 0 0 0 -5 5' fill='none' stroke='#5cc8ff' stroke-width='2.4' stroke-linecap='round'/>`) + ', pointer',
    nogo: svg(`<circle cx='16' cy='16' r='11' fill='none' stroke='#000' stroke-width='5'/><circle cx='16' cy='16' r='11' fill='none' stroke='#ff3a2a' stroke-width='3'/><path d='M8 24 L24 8' stroke='#ff3a2a' stroke-width='3'/>`) + ', not-allowed',
  };
})();
// the tiles of a wall line: straight along whichever axis you dragged further
function alrWallLine(p) {
  const a = p.line || { tx: p.tx, tz: p.tz }, dx = p.tx - a.tx, dz = p.tz - a.tz, out = [];
  const n = Math.min(24, Math.max(Math.abs(dx), Math.abs(dz)));
  for (let k = 0; k <= n; k++) out.push(Math.abs(dx) >= Math.abs(dz) ? [a.tx + Math.sign(dx) * k, a.tz] : [a.tx, a.tz + Math.sign(dz) * k]);
  return out;
}
function alrPointerUp(e) {
  const U = alr.ui;
  if (alr.place && alr.place.line && e.button === 0) {
    const n = alrPlaceWalls(alr.players[0], alr.place.type, alrWallLine(alr.place));
    if (n) { alr.place = null; alrUISide(); } else { alr.place.line = null; alrSfx('error'); alrSay('CANNOT DEPLOY HERE', '#ff8a7a'); }
    return;
  }
  if (U.pan && e.button === 1) { U.pan = null; return; }
  const d = U.drag; U.drag = null;
  if (!d || e.button !== 0 || alr.phase !== 'play') return;
  if (d.box) {
    const L = Math.min(d.x0, d.x1), R = Math.max(d.x0, d.x1), T = Math.min(d.y0, d.y1), B = Math.max(d.y0, d.y1);
    const got = alr.ents.filter((u) => u.kind === 'unit' && u.owner === 0 && (() => { const p = alrGLProject(u.x, 0.2 + (u.alt || 0), u.z); return p[0] >= L && p[0] <= R && p[1] >= T && p[1] <= B; })());
    // a box with soldiers in it leaves the haulers out (unless it's only haulers)
    const army = got.filter((u) => !u.D.harv);
    alr.sel = d.shift ? Array.from(new Set(alr.sel.concat(army.length ? army : got))) : (army.length ? army : got);
    if (alr.sel.length) { alrSfx('select'); alrAck(alr.sel, 'select'); }
    return;
  }
  const h = alrPickAt(d.x0, d.y0), now = performance.now();
  if (h && h.owner === 0 && h.D.carry && !d.force) {
    // with troops (or a tank) selected: they board it; the carrier itself selected and loaded: it unloads
    if (alr.sel.some((s) => alrCanCarry(h, s))) { alrCommandAt([h.x, h.z], h); return; }
    if (alr.sel.includes(h) && h.load.length) { alrOrderUnload(h); if (h.order) { alrCmdFx('unload', h.x, h.z, h, [h]); alrSfx('ack'); } return; }
  }
  if (h && h.owner === 0 && h.kind === 'bld' && alr.sel.some((s) => s.D.engineer && alrCanCapture(s, h))) { alrCommand(d.x0, d.y0); return; }
  if (h && h.owner === 0) {
    if (now - U.lastClick < 320 && U.lastPick === h && h.kind === 'unit') {
      // double-click: everybody of that type on screen
      alr.sel = alr.ents.filter((u) => u.kind === 'unit' && u.owner === 0 && u.type === h.type && (() => { const p = alrGLProject(u.x, 0, u.z); return p[0] > 0 && p[0] < alr.cam.w && p[1] > 0 && p[1] < alr.cam.h; })());
    } else if (d.shift && h.kind === 'unit') { if (alr.sel.includes(h)) alr.sel = alr.sel.filter((s) => s !== h); else alr.sel = alr.sel.filter((s) => s.kind === 'unit').concat(h); }
    else alr.sel = [h];
    U.lastClick = now; U.lastPick = h;
    alrSfx('select'); alrAck(alr.sel, 'select');
    return;
  }
  // RA2 style: a left-click on the ground (or an enemy) with your units selected is an order
  if (alr.sel.some((s) => s.owner === 0 && (s.kind === 'unit' || s.D.makes))) { alrCommand(d.x0, d.y0); return; }
  if (h && h.owner !== 0) { alr.sel = [h]; return; }
  alr.sel = [];
}

// ---- the keyboard + scrolling ------------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (!alr.on || !alr.ui) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (document.querySelector('.ak-tier')) return;
  alrUIForceKey(e);
  alrAudioWake();
  const U = alr.ui, k = e.code;
  if (k === 'Escape') {
    e.preventDefault();
    if (alr.phase !== 'play') return;
    if (alr.place || alr.mode) { alr.place = null; alr.mode = ''; alrUIButtons(); return; }
    if (alr.paused) alrPause(false); else if (alr.sel.length) alr.sel = []; else alrPause(true);
    return;
  }
  if (alr.phase !== 'play' || alr.paused) return;
  U.keys[k] = true;
  if (/^Arrow/.test(k)) { e.preventDefault(); return; }
  const dig = /^Digit([1-9])$/.exec(k);
  if (dig) {
    e.preventDefault();
    const n = dig[1];
    if (e.ctrlKey || e.metaKey) { alr.groups[n] = alr.sel.filter((s) => s.owner === 0).map((s) => s.id); alrSay('GROUP ' + n + ' SET', '#cfe8ff'); return; }
    const ids = alr.groups[n] || [], got = ids.map((id) => alr.byId.get(id)).filter(Boolean);
    if (!got.length) return;
    const now = performance.now();
    if (U.lastGroup === n && now - U.lastGroupT < 400) { let cx = 0, cz = 0; for (const u of got) { cx += u.x; cz += u.z; } alr.cam.x = cx / got.length; alr.cam.z = cz / got.length; }
    alr.sel = got; U.lastGroup = n; U.lastGroupT = now; alrSfx('select'); alrAck(got, 'select');
    return;
  }
  if (k === 'KeyA' && alr.sel.some((s) => s.kind === 'unit' && s.owner === 0)) { alr.mode = 'am'; e.preventDefault(); return; }
  if (k === 'KeyD') { for (const u of alr.sel) if (u.kind === 'unit' && u.owner === 0 && (u.D.deploy || u.D.carry)) alrDeploy(u); alrSfx('place'); return; }
  if (k === 'KeyS') { for (const u of alr.sel) if (u.kind === 'unit' && u.owner === 0) { u.order = null; u.path = null; u.target = null; u.guardX = u.x; u.guardZ = u.z; } return; }
  if (k === 'KeyQ') { alr.sel = alr.ents.filter((u) => u.kind === 'unit' && u.owner === 0 && u.D.weapon); alrSfx('select'); return; }
  if (k === 'KeyH') { const hq = alrBldsOf(0, 'hq')[0] || alr.ents.find((x) => x.owner === 0); if (hq) { alr.cam.x = hq.x; alr.cam.z = hq.z; } return; }
  if (k === 'Space') { e.preventDefault(); if (alr.lastAlarm) { alr.cam.x = alr.lastAlarm[0]; alr.cam.z = alr.lastAlarm[1]; } return; }
  if (k === 'KeyM') { alrMute(); return; }
  if (k === 'KeyN') { alrMusicToggle(); return; }
  if (k === 'Delete' || k === 'Backspace') { for (const s of alr.sel) if (s.kind === 'bld' && s.owner === 0) alrSell(s); return; }
});
window.addEventListener('keyup', (e) => { if (alr.ui) { alr.ui.keys[e.code] = false; alrUIForceKey(e); } });
function alrUIForceKey(e) {
  const U = alr.ui, f = e.ctrlKey || e.metaKey;
  if (!alr.on || !U || U.force === f) return;
  U.force = f; alrUICursorPick();
}
window.addEventListener('blur', () => { if (alr.ui && alr.ui.force) { alr.ui.force = false; alrUICursorPick(); } });
function alrUIInput(dt) {
  const U = alr.ui, cam = alr.cam, G = alrGL;
  if (!G.right) return;
  let ux = 0, uy = 0;
  if (U.keys.ArrowLeft) ux -= 1; if (U.keys.ArrowRight) ux += 1; if (U.keys.ArrowUp) uy -= 1; if (U.keys.ArrowDown) uy += 1;
  // the screen edge scrolls (only while the pointer is over the battlefield, and not while dragging a box)
  if (U.mouse.in && !U.drag && document.hasFocus()) {
    const m = 10;
    if (U.mouse.x < m) ux -= 1; else if (U.mouse.x > cam.w - m) ux += 1;
    if (U.mouse.y < m) uy -= 1; else if (U.mouse.y > cam.h - m) uy += 1;
  }
  if (ux || uy) {
    const sp = cam.zoom * 1.25 * dt;
    const rl = Math.hypot(G.right[0], G.right[2]) || 1, fl = Math.hypot(G.fwd[0], G.fwd[2]) || 1;
    cam.x += (G.right[0] / rl * ux - G.fwd[0] / fl * uy) * sp;
    cam.z += (G.right[2] / rl * ux - G.fwd[2] / fl * uy) * sp;
  }
  cam.x = alrClamp(cam.x, 2, ALR_N - 2); cam.z = alrClamp(cam.z, 2, ALR_N - 2);
}

// ---- the end card -------------------------------------------------------------------------------------------------------
function alrUIEnd() {
  const U = alr.ui, R = alr.result, st = alr.stats;
  const m = Math.floor(R.t / 60), s = Math.floor(R.t % 60);
  U.end.innerHTML = `<div class="alr-card-t ${R.won ? 'win' : 'lose'}">${R.won ? 'VICTORY' : 'DEFEAT'}</div>
    <div class="alr-card-s">${R.won ? (alr.nAI > 1 ? 'Every rival has been deep-fried.' : 'The ' + alr.players[1].team.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) + ' has been deep-fried.') : 'The ' + alr.players[0].team.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) + ' has fallen.'}</div>
    <div class="alr-stats"><span>TIME <b>${m}:${String(s).padStart(2, '0')}</b></span><span>KILLS <b>${st.kills}</b></span><span>LOST <b>${st.lost}</b></span><span>SQUISHED <b>${st.crushed || 0}</b></span><span>CAPTURED <b>${st.captured || 0}</b></span><span>HARVESTED <b>$${Math.round(st.harvested)}</b></span></div>
    <div class="alr-card-n">+${fmt.format(alr.earned)} NUGGETS</div>
    <button type="button" data-act="again">PLAY AGAIN</button><button type="button" data-act="tier">NEW SKIRMISH</button><button type="button" data-act="leave">LEAVE</button>`;
  setTimeout(() => { if (alr.phase === 'over') U.end.hidden = false; }, 1600);
}

// ---- the synth ------------------------------------------------------------------------------------------------------------
const alrA = { ctx: null, master: null, noise: null, muted: false, last: {} };
const ALR_SFX_SYNTH = { prism: 'zap', flak: 'cannon', bark: 'squish', jet: 'rocket', chrono: 'zap', bomb: 'boomL', pour: 'squish', splat: 'squish', scream1: 'squish', scream2: 'squish', scream3: 'squish' };
function alrAudioWake() {
  if (alrA.ctx) { if (alrA.ctx.state === 'suspended') alrA.ctx.resume(); return; }
  try {
    const C = alrA.ctx = new (window.AudioContext || window.webkitAudioContext)();
    alrA.master = C.createGain(); alrA.master.gain.value = alrA.muted ? 0 : 0.5; alrA.master.connect(C.destination);
    const n = C.sampleRate * 2, b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    alrA.noise = b;
  } catch (e) { alrA.ctx = null; }
}
function alrSfxStop() { if (alrA.ctx && alrA.ctx.state === 'running') alrA.ctx.suspend(); }
function alrMute() { alrA.muted = !alrA.muted; if (alrA.master) alrA.master.gain.value = alrA.muted ? 0 : 0.5; alrSay(alrA.muted ? 'SOUND OFF' : 'SOUND ON', '#8a92b0'); }
function alrSfx(name, x, z) {
  const C = alrA.ctx; if (!C || alrA.muted || C.state !== 'running') return;
  let vol = 1;
  if (x != null) { const d = Math.hypot(x - alr.cam.x, z - alr.cam.z); vol = alrClamp(1.25 - d / 16, 0, 1); if (vol <= 0.02) return; }
  const now = C.currentTime, gap = { rifle: 0.035, cannon: 0.05, heavy: 0.05, rocket: 0.06, zap: 0.08, squish: 0.06, boomL: 0.08, select: 0.06, ack: 0.08, scream1: 0.12, scream2: 0.12, scream3: 0.12, splat: 0.1 }[name] || 0.02;
  if (alrA.last[name] && now - alrA.last[name] < gap) return;
  alrA.last[name] = now;
  if (alrDiscSfx(name, vol)) return;          // the ElevenLabs recording, when it's decoded (js/alertAudio.js)
  name = ALR_SFX_SYNTH[name] || name;          // (a newer sound without a synth of its own borrows one)
  const out = C.createGain(); out.gain.value = vol; out.connect(alrA.master);
  const env = (node, a, peak, dec, t0) => { const g = C.createGain(); g.gain.setValueAtTime(0.0001, t0 || now); g.gain.exponentialRampToValueAtTime(peak, (t0 || now) + a); g.gain.exponentialRampToValueAtTime(0.0001, (t0 || now) + a + dec); node.connect(g); g.connect(out); return g; };
  const noise = (dur, type, f, q, peak, dec, sweep) => {
    const s = C.createBufferSource(); s.buffer = alrA.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.8;
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, now + dur);
    s.connect(fl); env(fl, 0.003, peak, dec); s.start(now, Math.random()); s.stop(now + dur + 0.05);
  };
  const tone = (type, f0, f1, peak, dec, t0) => {
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0 || now); if (f1) o.frequency.exponentialRampToValueAtTime(f1, (t0 || now) + dec);
    env(o, 0.004, peak, dec, t0); o.start(t0 || now); o.stop((t0 || now) + dec + 0.05);
  };
  switch (name) {
    case 'rifle': noise(0.08, 'bandpass', 1900, 1.2, 0.5, 0.07); tone('square', 420, 160, 0.06, 0.04); break;
    case 'cannon': noise(0.35, 'lowpass', 1600, 0.7, 0.7, 0.3, 300); tone('sine', 120, 45, 0.6, 0.25); break;
    case 'heavy': noise(0.45, 'lowpass', 1300, 0.7, 0.8, 0.4, 200); tone('sine', 95, 38, 0.7, 0.32); break;
    case 'rocket': noise(0.5, 'bandpass', 900, 0.6, 0.45, 0.45, 2600); break;
    case 'zap': tone('sawtooth', 1800, 140, 0.25, 0.28); noise(0.3, 'highpass', 2500, 0.5, 0.4, 0.28); tone('square', 60, 50, 0.15, 0.25); break;
    case 'boomL': noise(1.6, 'lowpass', 900, 0.6, 1.0, 1.4, 120); tone('sine', 70, 28, 0.9, 0.9); break;
    case 'squish': noise(0.15, 'bandpass', 700, 2, 0.5, 0.12); tone('sine', 380, 120, 0.25, 0.12); break;
    case 'place': tone('sine', 150, 55, 0.6, 0.25); noise(0.2, 'bandpass', 2400, 3, 0.25, 0.15); break;
    case 'sell': tone('triangle', 900, 1400, 0.2, 0.18); tone('triangle', 1400, 2000, 0.15, 0.2, now + 0.12); break;
    case 'cash': tone('triangle', 1250, 0, 0.12, 0.12); tone('triangle', 1650, 0, 0.12, 0.16, now + 0.07); break;
    case 'ready': tone('triangle', 660, 0, 0.18, 0.18); tone('triangle', 880, 0, 0.18, 0.25, now + 0.1); break;
    case 'click': tone('square', 1200, 900, 0.06, 0.03); break;
    case 'select': tone('square', 700, 980, 0.05, 0.05); break;
    case 'ack': tone('square', 520, 760, 0.06, 0.06); tone('square', 760, 0, 0.05, 0.05, now + 0.06); break;
    case 'error': tone('square', 220, 160, 0.12, 0.18); break;
    case 'alarm': for (let k = 0; k < 3; k++) { tone('sawtooth', 520, 0, 0.12, 0.1, now + k * 0.22); tone('sawtooth', 390, 0, 0.12, 0.1, now + k * 0.22 + 0.11); } break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0, 0.25, 0.5, now + i * 0.16)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, 0, 0.22, 0.6, now + i * 0.22)); break;
  }
}

// ---- the skirmish setup: map · opponents · army · difficulty ---------------------------------------------------------
// One screen in place of the card pickers (RA2's skirmish lobby): the maps down the left with their previews, the
// chosen map big on the right with its starts marked, and the choices under it. Remembered between games.
function alrSetupLoad() { try { return Object.assign({ map: 'valley', ai: 1, side: 'A', tier: 'rookie' }, JSON.parse(localStorage.getItem('nugAlertSetup') || '{}')); } catch (e) { return { map: 'valley', ai: 1, side: 'A', tier: 'rookie' }; } }
function alrSetupSave(c) { try { localStorage.setItem('nugAlertSetup', JSON.stringify(c)); } catch (e) { } }
// a map's picture, turned the way the radar (and the camera) see it, with its starts numbered
function alrMapPreview(def, size, marks, seats) {
  const M = alrMakeMap(def), N = M.N, cv = document.createElement('canvas'); cv.width = cv.height = size;
  const src = document.createElement('canvas'); src.width = src.height = N;
  const sg = src.getContext('2d'), id = sg.createImageData(N, N);
  const trees = new Uint8Array(N * N); for (const t of M.trees) trees[Math.floor(t.z) * N + Math.floor(t.x)] = 1;
  for (let k = 0; k < N * N; k++) {
    let r = 92, g = 116, b = 62;
    const d = M.dirt[k]; r += (138 - r) * d; g += (112 - g) * d; b += (78 - b) * d;
    const onBridge = M.bridges && M.bridges.some((B) => B.tiles.includes(k));
    if (onBridge) { r = 70; g = 70; b = 72; }
    else if (M.water && M.water[k]) { r = 42; g = 82; b = 104; }
    else if (M.ore[k] > 0) { r = 214; g = 166; b = 58; }
    else if (trees[k]) { r = 46; g = 74; b = 38; }
    else if (M.block[k]) { r = 118; g = 112; b = 102; }
    const o = k * 4; id.data[o] = r; id.data[o + 1] = g; id.data[o + 2] = b; id.data[o + 3] = 255;
  }
  sg.putImageData(id, 0, 0);
  // (the radar's shape: the isometric diamond, filling the square)
  const g = cv.getContext('2d'), s = size / 2 / N, K = alrRadarK(), sk = s * K, h = size / 2;
  g.fillStyle = '#05070a'; g.fillRect(0, 0, size, size);
  g.save(); g.setTransform(-s, -sk, s, -sk, h, h + sk * N); g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, N, N); g.restore();
  const XY = (x, z) => [h + (z - x) / N * h, h - ((x + z) / N - 1) * h * K];
  for (const [tx, tz] of M.derricks) { const [u, v] = XY(tx + 1, tz + 1); g.fillStyle = '#1a1a1a'; g.fillRect(u - 2, v - 2, 4, 4); }
  if (marks) M.starts.forEach(([x, z], i) => {
    const [u, v] = XY(x, z), seat = seats ? seats[i] : null;
    g.fillStyle = seat ? seat.css : 'rgba(255,255,255,0.85)'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(u, v, Math.max(6, size / 26), 0, 7); g.fill(); g.stroke();
    g.fillStyle = seat ? '#fff' : '#111'; g.font = `bold ${Math.max(9, size / 22)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(seat ? seat.label : String(i + 1), u, v + 0.5);
  });
  return cv;
}
function alrOpenSetup() {
  const U = alr.ui;
  alr.phase = 'tier';
  if (U) U.root.classList.remove('alr-playing');
  if (!U.setup) {
    const d = document.createElement('div'); d.className = 'alr-setup';
    d.innerHTML = `<div class="alr-setup-panel">
      <div class="alr-setup-title">🚨 NUGGET ALERT <span>SKIRMISH</span></div>
      <div class="alr-setup-body">
        <div class="alr-maps"></div>
        <div class="alr-setup-right">
          <div class="alr-setup-preview"></div>
          <div class="alr-setup-name"></div><div class="alr-setup-blurb"></div>
          <div class="alr-opt"><label>OPPONENTS</label><div class="alr-seg" data-k="ai"></div></div>
          <div class="alr-opt"><label>YOUR ARMY</label><div class="alr-seg" data-k="side"></div></div>
          <div class="alr-opt"><label>DIFFICULTY</label><div class="alr-seg" data-k="tier"></div></div>
          <div class="alr-seats"></div>
          <button type="button" class="alr-go">START</button>
        </div>
      </div>
      <div class="alr-setup-note">free-for-all · destroy every rival's base · starts are dealt at random · Enter to start</div>
    </div>`;
    U.root.appendChild(d);
    U.setup = d;
    U.setupCfg = alrSetupLoad();
    U.mapThumbs = {};
    d.addEventListener('click', (e) => {
      alrAudioWake();
      const c = U.setupCfg, m = e.target.closest('[data-map]'), o = e.target.closest('[data-v]');
      if (m) { c.map = m.dataset.map; alrSfx('click'); }
      else if (o && !o.disabled) { const k = o.parentNode.dataset.k; c[k] = k === 'ai' ? +o.dataset.v : o.dataset.v; alrSfx('click'); }
      else if (e.target.closest('.alr-go')) { alrSetupGo(); return; }
      else return;
      alrSetupRender();
    });
    window.addEventListener('keydown', (e) => { if (alr.on && U.setup && !U.setup.hidden && e.code === 'Enter') { e.preventDefault(); alrSetupGo(); } });
  }
  U.setup.hidden = false;
  alrSetupRender();
}
function alrSetupRender() {
  const U = alr.ui, d = U.setup, c = U.setupCfg, def = alrMapDef(c.map), K = def.ring[0];
  c.ai = alrClamp(c.ai, 1, K - 1);
  if (c.tier === 'allout' && !alertProWon()) c.tier = 'pro';
  // the map list (previews made once)
  const list = d.querySelector('.alr-maps');
  if (!list.children.length) for (const m of ALR_MAPS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'alr-mapcard'; b.dataset.map = m.key;
    b.appendChild(U.mapThumbs[m.key] = alrMapPreview(m, 96, false));
    const t = document.createElement('div'); t.className = 'alr-mapinfo';
    t.innerHTML = `<b>${m.emoji} ${m.name}</b><span>${m.N}×${m.N} · up to ${m.ring[0]} players</span>`;
    b.appendChild(t); list.appendChild(b);
  }
  for (const b of list.children) b.classList.toggle('on', b.dataset.map === c.map);
  // who sits where: you, then the CPUs (the first one fights as the other army; the rest are drawn at random)
  const m = c.ai + 1, seats = {}, other = c.side === 'A' ? 'F' : 'A';
  for (let i = 0; i < m; i++) seats[Math.floor(i * K / m)] = { css: ALR_TEAMS[i].css, label: i ? String(i) : '★' };
  const pv = d.querySelector('.alr-setup-preview'); pv.innerHTML = ''; pv.appendChild(alrMapPreview(def, 260, true, seats));
  d.querySelector('.alr-setup-name').textContent = def.emoji + ' ' + def.name + ' · ' + def.N + '×' + def.N;
  d.querySelector('.alr-setup-blurb').textContent = def.blurb;
  const seg = (k, items) => {
    const el = d.querySelector(`.alr-seg[data-k="${k}"]`); el.innerHTML = '';
    for (const it of items) { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = it.v; b.textContent = it.t; b.disabled = !!it.off; b.title = it.title || ''; if (String(c[k]) === String(it.v)) b.classList.add('on'); el.appendChild(b); }
  };
  seg('ai', [1, 2, 3, 4].map((n) => ({ v: n, t: String(n), off: n > K - 1, title: n > K - 1 ? 'this map seats ' + K : '' })));
  seg('side', [{ v: 'A', t: '🔷 ALLIANCE' }, { v: 'F', t: '🔶 FEDERATION' }]);
  seg('tier', ALR_TIERS.map((t) => ({ v: t.key, t: t.emoji + ' ' + t.name, off: t.key === 'allout' && !alertProWon(), title: t.key === 'allout' && !alertProWon() ? t.lockNote : t.blurb })));
  const rows = [];
  for (let i = 0; i < m; i++) {
    const army = i === 0 ? ALR_SIDES[c.side].name : i === 1 ? ALR_SIDES[other].name : 'RANDOM ARMY';
    rows.push(`<div class="alr-seat"><i style="background:${ALR_TEAMS[i].css}"></i><b>${i === 0 ? 'YOU' : 'CPU ' + i}</b><span>${army}</span></div>`);
  }
  d.querySelector('.alr-seats').innerHTML = rows.join('');
  alrSetupSave(c);
}
function alrSetupGo() {
  const U = alr.ui, c = U.setupCfg;
  U.setup.hidden = true;
  alrSfx('ready');
  alrNewGame(ALR_TIERS.find((t) => t.key === c.tier) || ALR_TIERS[0], c.side, c.map, c.ai);
}
