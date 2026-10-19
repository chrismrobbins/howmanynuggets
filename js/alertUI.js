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
        <b>A</b> then click: attack-move · <b>S</b> stop · <b>Q</b> select your army<br>
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
    else if (act === 'again') { U.end.hidden = true; alrNewGame(alr.cfg); }
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
  U.radar.addEventListener('pointerdown', alrRadarClick);
  U.radar.addEventListener('pointermove', (e) => { if (e.buttons & 1) alrRadarClick(e); });
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
  const tcv = alrTerrainCanvas(M, 24);
  if (U.terrTex) alrGL.gl.deleteTexture(U.terrTex);
  U.terrTex = alrGLTexCanvas(tcv, true);
  if (!U.terrMesh) {
    const mb = new AlrMB(); mb.color('#ffffff');
    mb.face([[0, 0, 0], [0, 0, ALR_N], [ALR_N, 0, ALR_N], [ALR_N, 0, 0]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    U.terrMesh = mb.bake();
  }
  // the radar's picture of the ground (the shroud and the dots go on top each refresh)
  const rc = document.createElement('canvas'); rc.width = rc.height = 128;
  rc.getContext('2d').drawImage(tcv, 0, 0, 128, 128);
  U.radarGround = rc;
  alrGLShroud(ALR_N, alr.players[0].shroud);
  if (!U.cameosBuilt) { alrBuildCameos(); U.cameosBuilt = true; }
}
function alrModelParts(type) {
  const A = alrArt, I = alrM4();
  if (ALR_BLD[type]) {
    const parts = [{ mesh: A.b[type], M: I }];
    if (type === 'turret') parts.push({ mesh: A.b.turret_head, M: alrTRS(0, 0.32, 0, 0.6) });
    if (type === 'radar') parts.push({ mesh: A.b.radar_dish, M: alrTRS(0.45, 0.78, -0.45, 0.8) });
    if (type === 'hq') parts.push({ mesh: A.b.hq_crane, M: alrTRS(-1.05, 0, -1.0, 0.7) });
    if (type === 'factory') parts.push({ mesh: A.b.factory_door, M: alrTRS(0, 0.42, 0.86, 0) });
    if (type === 'barracks') parts.push({ mesh: A.b.barracks_flag, M: alrTRS(0.72, 1.02, -0.65, 0.4) });
    return parts;
  }
  const u = A.u;
  if (type === 'inf' || type === 'rocket') return [{ mesh: u[type === 'inf' ? 'inf' : 'rocket'], M: alrTRS(0, 0.0, 0, 0) }, { mesh: u.leg, M: alrTRS(0.045, 0.13, 0, 0, 1, 1, 1, 0.3) }, { mesh: u.leg, M: alrTRS(-0.045, 0.13, 0, 0, 1, 1, 1, -0.3) }];
  if (type === 'tank') return [{ mesh: u.tank, M: I }, { mesh: u.tank_turret, M: alrTRS(0, 0.29, 0, 0) }, { mesh: u.tank_gun, M: alrTRS(0, 0.365, 0.12, 0) }];
  if (type === 'heavy') return [{ mesh: u.heavy, M: I }, { mesh: u.heavy_turret, M: alrTRS(0, 0.34, 0, 0) }, { mesh: u.heavy_gun, M: alrTRS(0, 0.43, 0.15, 0) }];
  if (type === 'harv') return [{ mesh: u.harv, M: I }, { mesh: u.harv_drum, M: alrTRS(0, 0.12, 0.52, 0) }, { mesh: u.harv_load, M: alrTRS(0, 0.42, -0.2, 0) }];
  return [];
}
function alrBuildCameos() {
  const U = alr.ui, team = ALR_TEAMS[0].col;
  const all = Object.keys(ALR_BLD).filter((k) => ALR_BLD[k].cat).concat(Object.keys(ALR_UNIT));
  for (const k of all) {
    const B = ALR_BLD[k];
    const zoom = B ? (B.w >= 3 ? 4.1 : B.w === 2 ? 3.0 : 2.3) : (ALR_UNIT[k].cat === 'inf' ? 0.85 : 1.45);
    const lift = B ? -0.35 : ALR_UNIT[k].cat === 'inf' ? -0.2 : -0.12;
    const parts = alrModelParts(k).map((p) => ({ mesh: p.mesh, M: alrMul(alrTRS(0, lift, 0, B ? ALR_BLD_YAW : Math.PI * 1.15), p.M) }));
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
  return Object.keys(ALR_BLD).filter((k) => ALR_BLD[k].cat === cat).concat(Object.keys(ALR_UNIT).filter((k) => ALR_UNIT[k].cat === cat));
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
    if (b.type === 'refinery' && Math.random() < dt * 1.5) alrFxSmoke(b.x - 0.95, 1.45, b.z - 0.75, 0.25, 2.2, true);
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
  // the ore and its stain, the trees, the rocks
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const k = z * ALR_N + x, v = M.ore[k];
    if (v <= 0 || S[k] < 30) continue;
    const lv = v < 110 ? 0 : v < 230 ? 1 : 2;
    alrGLDraw(A.ore[lv * 3 + (k % 3)], alrTRS(x + 0.5, 0, z + 0.5, k * 1.7), { spec: 0.9 });
    alrGLGround(x + 0.5, z + 0.5, 0.62, 0.62, k * 0.7, 0.55, 0.42, 0.12, 0.4, 5, false, 0.012);
  }
  for (const tr of M.trees) if (seen(tr.x, tr.z) && tr.x >= x0 && tr.x <= x1 + 1 && tr.z >= z0 && tr.z <= z1 + 1) alrGLDraw(A.trees[tr.v % A.trees.length], alrTRS(tr.x, 0, tr.z, tr.yaw, tr.s), { spec: 0.05 });
  for (const rk of M.rocks) if (seen(rk.x, rk.z) && rk.x >= x0 && rk.x <= x1 + 1 && rk.z >= z0 && rk.z <= z1 + 1) alrGLDraw(A.rocks[rk.v % A.rocks.length], alrTRS(rk.x, 0, rk.z, rk.yaw, rk.s), { spec: 0.1 });
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
    for (const p of alrUnitParts(u)) alrGLDraw(p.mesh, p.M, o);
    if (alr.sel.includes(u)) alrGLGround(u.x, u.z, u.D.r * 1.35 + 0.06, u.D.r * 1.35 + 0.06, 0, 0.55, 1, 0.55, 0.85, 4, true, 0.02);
  }
  // shells and rockets in flight
  for (const s of alr.shots) {
    if (s.kind === 'rocket') { alrGLSprite(s.x, s.y, s.z, 0.32, 0, 1, 0.7, 0.3, 1, 0, true); alrGLSprite(s.x, s.y, s.z, 0.14, 0, 1, 1, 0.9, 1, 0, true); }
    else { alrGLSprite(s.x, s.y, s.z, 0.2, 0, 1, 0.85, 0.5, 1, 0, true); const bk = 0.25 / Math.max(0.01, Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2])); alrGLBeam([s.x - (s.b[0] - s.a[0]) * bk, s.y, s.z - (s.b[2] - s.a[2]) * bk], [s.x, s.y, s.z], 0.05, 1, 0.8, 0.45, 0.8); }
  }
  // particles, beams, bolts, rings, chunks
  for (const f of alr.fx) {
    const u = f.t / f.T;
    if (f.kind === 'p') { const fa = u < 0.15 && !f.add ? u / 0.15 : 1 - u; alrGLSprite(f.x, f.y, f.z, f.s, f.rot, f.r, f.g, f.b, f.a * Math.max(0, fa), f.cell, !!f.add); }
    else if (f.kind === 'beam') alrGLBeam(f.a, f.b, f.w, f.r, f.g, f.bl, f.al * (1 - u));
    else if (f.kind === 'zap') alrZapDraw(f.a, f.b, f.seed + ((alr.t * 30) | 0), 1 - u);
    else if (f.kind === 'zapm') alrZapDraw(f.a, f.b, f.seed, (1 - u) * 0.7, 0.03, 3);
    else if (f.kind === 'ring') alrGLGround(f.x, f.z, f.s * u, f.s * u, 0, 1, 0.8, 0.5, (1 - u) * 0.8, 4, true, 0.05);
    else if (f.kind === 'chunk') alrGLDraw(alrArt.chunk, alrTRS(f.x, f.y, f.z, f.ry, f.s, f.s, f.s, f.rx), { spec: 0.1, team: [0.3, 0.3, 0.3] });
  }
  // the placement ghost
  if (alr.place && U.mouse.in) {
    const D = ALR_BLD[alr.place.type], g = alrGLPick(U.mouse.x, U.mouse.y);
    const tx = Math.round(g[0] - D.w / 2), tz = Math.round(g[1] - D.h / 2);
    alr.place.tx = tx; alr.place.tz = tz;
    const ok = alrCanPlace(alr.players[0], alr.place.type, tx, tz);
    alr.place.ok = ok;
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
function alrBldParts(b) {
  const A = alrArt, P = alr.players[b.owner], parts = [{ mesh: A.b[b.type], M: alrM4() }];
  if (b.type === 'turret') parts.push({ mesh: A.b.turret_head, M: alrTRS(0, 0.32, 0, b.tYaw - ALR_BLD_YAW) });   // (tYaw is a world angle; the base is turned)
  if (b.type === 'radar') parts.push({ mesh: A.b.radar_dish, M: alrTRS(0.45, 0.78, -0.45, P.low ? 0.8 : b.anim * 1.3) });
  if (b.type === 'hq') parts.push({ mesh: A.b.hq_crane, M: alrTRS(-1.05, 0, -1.0, 0.7 + Math.sin(b.anim * 0.25) * 1.2) });
  if (b.type === 'factory') { const op = alrClamp(b.door > 0 ? Math.min(1, (1.6 - b.door) * 4, b.door * 2) : 0, 0, 1); parts.push({ mesh: A.b.factory_door, M: alrTRS(0, 0.42 + op * 0.38, 0.86, 0, 1, 1 - op * 0.75, 1) }); }
  if (b.type === 'barracks') parts.push({ mesh: A.b.barracks_flag, M: alrTRS(0.72, 1.02, -0.65, 0.5 + Math.sin(b.anim * 2.1) * 0.25) });
  return parts;
}
// a unit's parts, posed: a soldier's legs walk, a turret turns, a gun recoils, the hauler's drum spins
// (drawn a size up from their footprint so a soldier reads at battle zoom, the way RA2's sprites did)
const ALR_DRAW_SCALE = { inf: 1.3, rocket: 1.3, tank: 1.15, heavy: 1.12, harv: 1.1 };
function alrUnitParts(u) {
  const parts = alrUnitParts0(u), k = ALR_DRAW_SCALE[u.type] || 1;
  if (k === 1) return parts;
  const S = alrMul(alrMul(alrTRS(u.x, 0, u.z, 0), alrTRS(0, 0, 0, 0, k)), alrTRS(-u.x, 0, -u.z, 0));
  return parts.map((p) => ({ mesh: p.mesh, M: alrMul(S, p.M) }));
}
function alrUnitParts0(u) {
  const A = alrArt.u, t = u.type;
  if (t === 'inf' || t === 'rocket') {
    const sw = u.moving ? Math.sin(u.walk) * 0.7 : 0, bob = u.moving ? Math.abs(Math.cos(u.walk)) * 0.02 : 0;
    const B = alrTRS(u.x, bob, u.z, u.yaw);
    return [{ mesh: A[t === 'inf' ? 'inf' : 'rocket'], M: B }, { mesh: A.leg, M: alrMul(B, alrTRS(0.045, 0.13, 0, 0, 1, 1, 1, sw)) }, { mesh: A.leg, M: alrMul(B, alrTRS(-0.045, 0.13, 0, 0, 1, 1, 1, -sw)) }];
  }
  const H = alrTRS(u.x, 0, u.z, u.yaw);
  if (t === 'tank' || t === 'heavy') {
    const hy = t === 'tank' ? 0.29 : 0.34, gy = t === 'tank' ? 0.075 : 0.09, gz = t === 'tank' ? 0.12 : 0.15;
    const T = alrTRS(u.x, hy, u.z, u.tYaw), rc = Math.max(0, u.recoil || 0) * 0.07;
    return [{ mesh: A[t], M: H }, { mesh: A[t + '_turret'], M: T }, { mesh: A[t + '_gun'], M: alrMul(T, alrTRS(0, gy, gz - rc, 0)) }];
  }
  if (t === 'harv') {
    const parts = [{ mesh: A.harv, M: H }, { mesh: A.harv_drum, M: alrMul(H, alrTRS(0, 0.12, 0.52, 0, 1, 1, 1, u.drum || 0)) }];
    const f = (u.cargo || 0) / u.D.cap;
    if (f > 0.02) parts.push({ mesh: A.harv_load, M: alrMul(H, alrTRS(0, 0.36 + f * 0.08, -0.2, 0, 1, Math.max(0.2, f), 1)) });
    return parts;
  }
  return [];
}

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
  for (const e of alr.ents) {
    const sel = alr.sel.includes(e);
    const hover = U.hover === e;
    const damaged = e.hp < e.max - 0.5;
    if (!sel && !hover && !(damaged && e.owner === 0 && e.kind === 'bld')) continue;
    if (e.owner !== 0 && !S[alrTile(e.x, e.z)]) continue;
    if (e.kind === 'unit') {
      const top = alrGLProject(e.x, e.D.cat === 'inf' ? 0.55 : 0.62, e.z);
      const w = e.D.cat === 'inf' ? 22 : 34;
      if (sel || hover) bar(top[0] - w / 2, top[1] - 8, w, e.hp / e.max, e.D.cat === 'inf' ? 5 : 8);
      if (e.D.harv && sel) { g.fillStyle = '#ffd23a'; g.fillRect(top[0] - w / 2, top[1] - 2, w * e.cargo / e.D.cap, 2); }
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
  // move targets: a quick green flash where you clicked
  if (U.ping && U.ping.t > 0) {
    const p = alrGLProject(U.ping.x, 0, U.ping.z), k = U.ping.t / 0.5;
    g.strokeStyle = U.ping.att ? `rgba(255,80,60,${k})` : `rgba(120,255,120,${k})`; g.lineWidth = 2;
    g.beginPath(); g.ellipse(p[0], p[1], 14 * (1.4 - k * 0.4), 7 * (1.4 - k * 0.4), 0, 0, 7); g.stroke();
    U.ping.t -= 1 / 60;
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
function alrRadarXY(x, z) { const W = 420, N = ALR_N; return [((z - x) / N + 1) * W / 2, (2 - (x + z) / N) * W / 2]; }
function alrRadarInv(u, v) { const W = 420, N = ALR_N; const a = (u / (W / 2) - 1) * N, b = (2 - v / (W / 2)) * N; return [(b - a) / 2, (a + b) / 2]; }
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
  // the ground, turned into a diamond
  g.save();
  const s = 420 / 2 / ALR_N;
  g.setTransform(-s, -s, s, -s, 210, 420);           // texture (x, z) → the radar's (u, v), the same map as alrRadarXY
  g.drawImage(U.radarGround, 0, 0, ALR_N, ALR_N);
  g.restore();
  const N = ALR_N, cell = 420 / N;
  // ore
  for (let k = 0; k < N * N; k++) if (alr.M.ore[k] > 0) { const [u, v] = alrRadarXY(k % N + 0.5, ((k / N) | 0) + 0.5); g.fillStyle = '#e8b030'; g.fillRect(u - cell * 0.4, v - cell * 0.3, cell * 0.8, cell * 0.6); }
  // the shroud
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (P.shroud[z * N + x] > 40) continue;
    const a = alrRadarXY(x, z), b = alrRadarXY(x + 1, z), c = alrRadarXY(x + 1, z + 1), d = alrRadarXY(x, z + 1);
    g.fillStyle = '#000'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
  }
  for (const e of alr.ents) {
    if (e.owner !== 0 && P.shroud[alrTile(e.x, e.z)] < 40) continue;
    g.fillStyle = ALR_TEAMS[e.owner].css;
    if (e.kind === 'bld') {
      const a = alrRadarXY(e.tx, e.tz), b = alrRadarXY(e.tx + e.w, e.tz), c = alrRadarXY(e.tx + e.w, e.tz + e.h), d = alrRadarXY(e.tx, e.tz + e.h);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    } else { const [u, v] = alrRadarXY(e.x, e.z); g.fillRect(u - 3, v - 3, 6, 6); }
  }
  // what the camera sees
  const cam = alr.cam, cs = [alrGLPick(0, 0), alrGLPick(cam.w, 0), alrGLPick(cam.w, cam.h), alrGLPick(0, cam.h)].map((c) => alrRadarXY(c[0], c[1]));
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); cs.forEach((c, i) => (i ? g.lineTo(c[0], c[1]) : g.moveTo(c[0], c[1]))); g.closePath(); g.stroke();
}
function alrRadarClick(e) {
  if (alr.phase !== 'play' || !alrHas(0, 'radar')) return;
  const r = alr.ui.radar.getBoundingClientRect(), u = (e.clientX - r.left) / r.width * 420, v = (e.clientY - r.top) / r.height * 420;
  const [x, z] = alrRadarInv(u, v);
  alr.cam.x = alrClamp(x, 0, ALR_N); alr.cam.z = alrClamp(z, 0, ALR_N);
}

// ---- picking + commands ---------------------------------------------------------------------------------------------
function alrPickAt(px, py) {
  // units first (by screen distance), then buildings (by their box on screen)
  let best = null, bd = 1e9;
  const S = alr.players[0].shroud;
  for (const e of alr.ents) {
    if (e.kind !== 'unit') continue;
    if (e.owner !== 0 && S[alrTile(e.x, e.z)] < 40) continue;
    const p = alrGLProject(e.x, e.D.cat === 'inf' ? 0.25 : 0.2, e.z), r = e.D.cat === 'inf' ? 14 : 22, d = Math.hypot(p[0] - px, p[1] - py);
    if (d < r && d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  for (const e of alr.ents) {
    if (e.kind !== 'bld') continue;
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
function alrCommand(px, py, forceAM) {
  const units = alr.sel.filter((e) => e.kind === 'unit' && e.owner === 0);
  const blds = alr.sel.filter((e) => e.kind === 'bld' && e.owner === 0 && (e.D.makes));
  const hit = alrPickAt(px, py), g = alrGLPick(px, py);
  if (!units.length) {
    if (blds.length) { for (const b of blds) b.rally = [g[0], g[1]]; alrPing(g[0], g[1], false); alrSfx('click'); }
    return;
  }
  if (hit && hit.owner !== 0) {
    for (const u of units) if (u.D.weapon) alrOrderAttack(u, hit);
    alrPing(hit.x, hit.z, true); alrSfx('ack'); alrAck(units, 'attack'); return;
  }
  const harvs = units.filter((u) => u.D.harv), rest = units.filter((u) => !u.D.harv);
  if (harvs.length) {
    const k = alrTile(g[0], g[1]);
    if (hit && hit.type === 'refinery') for (const h of harvs) { h.order = { type: 'harvest' }; h.hstate = 'home'; h.path = null; }
    else if (alrIn(g[0], g[1]) && alr.M.ore[k] > 0) { for (const h of harvs) { h.order = { type: 'harvest' }; h.hstate = 'seek'; h.path = null; h.oreAt = [g[0], g[1]]; } if (!rest.length) { alrAck(harvs, 'attack'); alrSfx('ack'); return; } }
    else for (const h of harvs) alrOrderMove(h, g[0], g[1], false);
  }
  if (rest.length) alrGroupMove(rest, g[0], g[1], forceAM || alr.mode === 'am');
  alrPing(g[0], g[1], forceAM || alr.mode === 'am');
  alrSfx('ack'); alrAck(units, forceAM || alr.mode === 'am' ? 'attack' : 'move');
  alr.mode = '';
}
function alrPing(x, z, att) { alr.ui.ping = { x, z, t: 0.5, att }; }

function alrPointerDown(e) {
  const U = alr.ui;
  alrAudioWake();
  if (alr.phase !== 'play' || alr.paused) return;
  const r = U.ov.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  U.mouse.x = x; U.mouse.y = y; U.mouse.in = true;
  if (e.button === 1) { U.pan = { x, y, cx: alr.cam.x, cz: alr.cam.z }; e.preventDefault(); return; }
  if (e.button === 2) {
    // right-click: cancel what you're holding (a building to place, sell / repair / attack-move), else let
    // go of the selection — RA2's right-click (Chris: "make it so a right click will unselect")
    if (alr.place || alr.mode) { alr.place = null; alr.mode = ''; alrUIButtons(); return; }
    if (alr.sel.length) { alr.sel = []; alrSfx('click'); }
    return;
  }
  if (alr.place) {
    const p = alr.place;
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
  U.drag = { x0: x, y0: y, x1: x, y1: y, box: false, shift: e.shiftKey };
  U.ov.setPointerCapture(e.pointerId);
}
function alrPointerMove(e) {
  const U = alr.ui, r = U.ov.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  U.mouse.x = x; U.mouse.y = y; U.mouse.in = true;
  if (U.pan) { const k = alr.cam.zoom / alr.cam.h; const G = alrGL, rx = G.right[0], rz = G.right[2], fl = Math.hypot(G.fwd[0], G.fwd[2]), fx = G.fwd[0] / fl, fz = G.fwd[2] / fl; const dx = (x - U.pan.x) * k, dy = (y - U.pan.y) * k / Math.sin(alr.cam.pitch); alr.cam.x = U.pan.cx - rx * dx + fx * dy; alr.cam.z = U.pan.cz - rz * dx + fz * dy; return; }
  if (U.drag) { U.drag.x1 = x; U.drag.y1 = y; if (Math.hypot(x - U.drag.x0, y - U.drag.y0) > 6) U.drag.box = true; }
  // the cursor says what a click will do
  const h = alr.phase === 'play' ? alrPickAt(x, y) : null;
  U.hover = h;
  const mine = alr.sel.some((s) => s.kind === 'unit' && s.owner === 0);
  let cur = 'default';
  if (alr.place) cur = 'copy';
  else if (alr.mode === 'sell' || alr.mode === 'repair') cur = h && h.kind === 'bld' && h.owner === 0 ? 'pointer' : 'not-allowed';
  else if (alr.mode === 'am') cur = 'crosshair';
  else if (h && h.owner !== 0 && mine) cur = 'crosshair';
  else if (h && h.owner === 0) cur = 'pointer';
  else if (mine) cur = 'cell';
  U.ov.style.cursor = cur;
}
function alrPointerUp(e) {
  const U = alr.ui;
  if (U.pan && e.button === 1) { U.pan = null; return; }
  const d = U.drag; U.drag = null;
  if (!d || e.button !== 0 || alr.phase !== 'play') return;
  if (d.box) {
    const L = Math.min(d.x0, d.x1), R = Math.max(d.x0, d.x1), T = Math.min(d.y0, d.y1), B = Math.max(d.y0, d.y1);
    const got = alr.ents.filter((u) => u.kind === 'unit' && u.owner === 0 && (() => { const p = alrGLProject(u.x, 0.2, u.z); return p[0] >= L && p[0] <= R && p[1] >= T && p[1] <= B; })());
    // a box with soldiers in it leaves the haulers out (unless it's only haulers)
    const army = got.filter((u) => !u.D.harv);
    alr.sel = d.shift ? Array.from(new Set(alr.sel.concat(army.length ? army : got))) : (army.length ? army : got);
    if (alr.sel.length) { alrSfx('select'); alrAck(alr.sel, 'select'); }
    return;
  }
  const h = alrPickAt(d.x0, d.y0), now = performance.now();
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
  if (k === 'KeyS') { for (const u of alr.sel) if (u.kind === 'unit' && u.owner === 0) { u.order = null; u.path = null; u.target = null; u.guardX = u.x; u.guardZ = u.z; } return; }
  if (k === 'KeyQ') { alr.sel = alr.ents.filter((u) => u.kind === 'unit' && u.owner === 0 && u.D.weapon); alrSfx('select'); return; }
  if (k === 'KeyH') { const hq = alrBldsOf(0, 'hq')[0] || alr.ents.find((x) => x.owner === 0); if (hq) { alr.cam.x = hq.x; alr.cam.z = hq.z; } return; }
  if (k === 'Space') { e.preventDefault(); if (alr.lastAlarm) { alr.cam.x = alr.lastAlarm[0]; alr.cam.z = alr.lastAlarm[1]; } return; }
  if (k === 'KeyM') { alrMute(); return; }
  if (k === 'KeyN') { alrMusicToggle(); return; }
  if (k === 'Delete' || k === 'Backspace') { for (const s of alr.sel) if (s.kind === 'bld' && s.owner === 0) alrSell(s); return; }
});
window.addEventListener('keyup', (e) => { if (alr.ui) alr.ui.keys[e.code] = false; });
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
    <div class="alr-card-s">${R.won ? 'The Fry Federation has been deep-fried.' : 'The Nugget Alliance has fallen.'}</div>
    <div class="alr-stats"><span>TIME <b>${m}:${String(s).padStart(2, '0')}</b></span><span>KILLS <b>${st.kills}</b></span><span>LOST <b>${st.lost}</b></span><span>SQUISHED <b>${st.crushed || 0}</b></span><span>HARVESTED <b>$${Math.round(st.harvested)}</b></span></div>
    <div class="alr-card-n">+${fmt.format(alr.earned)} NUGGETS</div>
    <button type="button" data-act="again">PLAY AGAIN</button><button type="button" data-act="tier">NEW ENEMY</button><button type="button" data-act="leave">LEAVE</button>`;
  setTimeout(() => { if (alr.phase === 'over') U.end.hidden = false; }, 1600);
}

// ---- the synth ------------------------------------------------------------------------------------------------------------
const alrA = { ctx: null, master: null, noise: null, muted: false, last: {} };
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
  const now = C.currentTime, gap = { rifle: 0.035, cannon: 0.05, heavy: 0.05, rocket: 0.06, zap: 0.08, squish: 0.06, boomL: 0.08, select: 0.06, ack: 0.08 }[name] || 0.02;
  if (alrA.last[name] && now - alrA.last[name] < gap) return;
  alrA.last[name] = now;
  if (alrDiscSfx(name, vol)) return;          // the ElevenLabs recording, when it's decoded (js/alertAudio.js)
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
