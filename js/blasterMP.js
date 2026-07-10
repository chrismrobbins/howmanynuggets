// ---- Blaster multiplayer renderer (client adapter) --------------------------
// Renders the server-authoritative co-op Blaster from GameRoom snapshots and
// sends this player's inputs. It is entirely separate from the single-player
// blaster.js (which is untouched) — SP and MP never share a code path, only a
// visual language. Driven by window.NuggetNet events.
(function () {
  const net = window.NuggetNet;
  if (!net) return;

  const WORLD_W = 1280, WORLD_H = 720;
  const FIRE_COOLDOWN = 55;   // ms client-side fire throttle (server enforces the real one)
  const CANNON_SPEED = 900;   // world px/s for arrow-key movement

  let stage, hud, hudWaves, hudScores, hudPower, shieldEl, banner;
  let running = false, rafId = null, lastFrame = 0;
  let lastSnap = null;
  let myX = WORLD_W / 2, lastInputSent = 0, lastInputX = null, lastFire = 0, firing = false;
  const keys = { left: false, right: false };
  const pools = { nug: [], bld: [], can: [], bolt: [], crate: [] };
  const poolIdx = { nug: 0, bld: 0, can: 0, bolt: 0, crate: 0 };

  const PLAYER_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#f472b6'];
  const CRATE_EMOJI = { rapid: '⚡', triple: '🔱', shield: '🛡️' };
  const POWER_LABEL = { rapid: '⚡ RAPID FIRE', triple: '🔱 TRIPLE SHOT', shield: '🛡️ CITY SHIELD' };

  // ---- stage / layout ----
  function ensureStage() {
    if (stage) return;
    stage = document.createElement('div');
    stage.className = 'mp-stage';
    hud = document.createElement('div');
    hud.className = 'mp-hud';
    hudWaves = document.createElement('span');
    hudWaves.className = 'mp-waves';
    hudScores = document.createElement('span');
    hudScores.className = 'mp-scores';
    hudPower = document.createElement('span');
    hudPower.className = 'mp-power';
    const leave = document.createElement('button');
    leave.className = 'mp-leave';
    leave.textContent = 'Leave';
    leave.addEventListener('click', () => net.leave());
    hud.append(hudWaves, hudScores, hudPower, leave);
    shieldEl = document.createElement('div');
    shieldEl.className = 'mp-shield';
    banner = document.createElement('div');
    banner.className = 'mp-banner';
    stage.append(shieldEl, hud, banner);
    document.body.appendChild(stage);
  }

  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / WORLD_W, vh / WORLD_H);
    return { scale, ox: (vw - WORLD_W * scale) / 2, oy: (vh - WORLD_H * scale) / 2 };
  }
  const sx = (x, L) => L.ox + x * L.scale;
  const sy = (y, L) => L.oy + y * L.scale;
  const worldX = (px, L) => (px - L.ox) / L.scale;

  // ---- session lifecycle ----
  function start() {
    if (running) return;
    if (typeof stopStorm === 'function') stopStorm(); // never overlap the SP arcade
    ensureStage();
    running = true;
    lastSnap = null;
    myX = WORLD_W / 2;
    lastFrame = performance.now();
    stage.classList.add('active');
    document.body.classList.add('mp-active');
    addInput();
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stage) stage.classList.remove('active');
    document.body.classList.remove('mp-active');
    removeInput();
    Object.values(pools).forEach((arr) => arr.forEach((el) => (el.style.display = 'none')));
  }

  net.on('started', () => { if (net.game === 'blaster') start(); });
  net.on('gameover', (m) => { if (running) showGameover(m); stop(); });
  net.on('left', stop);
  net.on('snapshot', (m) => {
    lastSnap = m.s;
    if (running) updateHud(m.s, m.scores);
  });
  net.on('event', onEvent);

  function onEvent(m) {
    if (!running || !lastSnap) return;
    const L = layout();
    if (m.kind === 'kill') {
      spawnLabel(sx(m.x, L), sy(m.y, L), (m.golden ? '✨ +10' : '+1'), m.golden);
    } else if (m.kind === 'citydown') {
      banner.textContent = '🏚️ CITY DOWN — rebuilding…';
      banner.classList.add('show');
      setTimeout(() => banner.classList.remove('show'), 1800);
    }
  }

  function showGameover(m) {
    banner.textContent = '✅ Match over' + (m && m.results ? ' — Wave ' + (m.results.waves || 0) : '');
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 2500);
  }

  // ---- input ----
  function addInput() {
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
  }
  function removeInput() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mousedown', onDown);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    keys.left = keys.right = false;
    firing = false;
  }
  function onMove(e) {
    myX = Math.max(0, Math.min(WORLD_W, worldX(e.clientX, layout())));
    sendInput();
  }
  function onDown(e) {
    if (e.target && e.target.closest && e.target.closest('.mp-hud')) return; // not HUD buttons
    firing = true;
    fire();
  }
  function onUp() { firing = false; }
  function onKey(e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
    else if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
    else if (e.code === 'Space') { firing = true; fire(); e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.code === 'ArrowLeft') keys.left = false;
    else if (e.code === 'ArrowRight') keys.right = false;
    else if (e.code === 'Space') firing = false;
  }
  function sendInput() {
    const now = performance.now();
    if (now - lastInputSent < 50 || myX === lastInputX) return;
    net.send({ t: 'input', x: Math.round(myX) });
    lastInputSent = now; lastInputX = myX;
  }
  // The server enforces the real per-power cooldown; the client just avoids
  // spamming. Kept low so ⚡ rapid fire (60ms server cooldown) can shine.
  function fire() {
    const now = performance.now();
    if (now - lastFire < FIRE_COOLDOWN) return;
    lastFire = now;
    net.send({ t: 'fire' });
  }

  // ---- render loop ----
  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) { myX = Math.max(0, Math.min(WORLD_W, myX + dir * CANNON_SPEED * dt)); sendInput(); }
    if (firing) fire(); // hold to keep shooting

    render();
    rafId = requestAnimationFrame(loop);
  }

  // Render the latest snapshot directly — 20Hz is smooth enough for this game,
  // and skipping interpolation avoids a class of timing bugs. Your own cannon is
  // drawn at your local predicted position for zero-latency movement.
  function render() {
    if (!lastSnap) return;
    const L = layout();
    poolIdx.nug = poolIdx.bld = poolIdx.can = poolIdx.bolt = poolIdx.crate = 0; // rewind pools

    const nSize = 44 * L.scale;
    let ni = 0;
    for (const n of lastSnap.nuggets) {
      const el = acquire('nug', 'img');
      el.style.width = el.style.height = nSize + 'px';
      el.classList.toggle('golden', !!n.g);
      el.style.transform = `translate(${sx(n.x, L) - nSize / 2}px, ${sy(n.y, L) - nSize / 2}px)`;
      ni++;
    }
    hidePast('nug', ni);

    // city
    let bi = 0;
    for (const b of lastSnap.city) {
      const el = acquire('bld', 'div');
      el.className = 'mp-building' + (b.hp <= 0 ? ' rubble' : b.hp === 1 ? ' dmg2' : b.hp === 2 ? ' dmg1' : '');
      el.style.left = sx(b.x, L) + 'px';
      el.style.width = b.w * L.scale + 'px';
      const h = (b.hp <= 0 ? 16 : b.h) * L.scale;
      el.style.height = h + 'px';
      el.style.top = (sy(WORLD_H, L) - h) + 'px';
      bi++;
    }
    hidePast('bld', bi);

    // cannons — your own at your predicted myX, others at their authoritative x
    let ci = 0, mineDrawn = false;
    for (const c of lastSnap.cannons) {
      const mine = c.id === net.you;
      if (mine) mineDrawn = true;
      const cx = mine ? myX : c.x;
      const el = acquire('can', 'div');
      el.className = 'mp-cannon' + (mine ? ' me' : '');
      el.style.setProperty('--c', PLAYER_COLORS[ci % PLAYER_COLORS.length]);
      el.style.left = sx(cx, L) + 'px';
      el.style.top = (sy(WORLD_H, L) - 26 * L.scale) + 'px';
      el.textContent = c.name;
      ci++;
    }
    // Always show your own cannon, even before the snapshot includes it.
    if (!mineDrawn && net.you) {
      const me = net.players.find((p) => p.id === net.you);
      const el = acquire('can', 'div');
      el.className = 'mp-cannon me';
      el.style.setProperty('--c', PLAYER_COLORS[0]);
      el.style.left = sx(myX, L) + 'px';
      el.style.top = (sy(WORLD_H, L) - 26 * L.scale) + 'px';
      el.textContent = me ? me.name : 'you';
      ci++;
    }
    hidePast('can', ci);

    // bolts
    let boi = 0;
    for (const b of (lastSnap.bolts || [])) {
      const el = acquire('bolt', 'div');
      el.style.left = sx(b.x, L) + 'px';
      el.style.top = sy(b.y, L) + 'px';
      boi++;
    }
    hidePast('bolt', boi);

    // power-up crates
    let cri = 0;
    for (const cr of (lastSnap.crates || [])) {
      const el = acquire('crate', 'div');
      el.textContent = CRATE_EMOJI[cr.k] || '🎁';
      el.style.left = sx(cr.x, L) + 'px';
      el.style.top = sy(cr.y, L) + 'px';
      cri++;
    }
    hidePast('crate', cri);

    // team shield line
    if (lastSnap.shield && lastSnap.shieldY != null) {
      shieldEl.style.display = 'block';
      shieldEl.style.top = sy(lastSnap.shieldY, L) + 'px';
    } else {
      shieldEl.style.display = 'none';
    }
  }

  // HUD is refreshed on each snapshot (20Hz), not every animation frame.
  function updateHud(s, scores) {
    if (!stage) return;
    hudWaves.textContent = '🌊 Wave ' + ((s && s.waves) || 0);
    const list = (scores || []).slice().sort((a, b) => b.score - a.score);
    hudScores.innerHTML = list.map((p) => {
      const me = p.id === net.you;
      return `<span class="mp-sc${me ? ' me' : ''}">🍗 ${escapeHtml(p.name)} ${fmtN(p.score)}</span>`;
    }).join('');
    // my active power-up, plus the team shield indicator
    const mine = s && s.cannons && s.cannons.find((c) => c.id === net.you);
    let chip = (mine && mine.p) ? (POWER_LABEL[mine.p] + ' · ' + mine.pt + 's') : '';
    if (s && s.shield) chip += (chip ? '   ' : '') + '🛡️ SHIELD UP';
    hudPower.textContent = chip;
    hudPower.style.display = chip ? 'inline' : 'none';
  }

  // ---- element pools ----
  // Reuse pooled elements by index each frame, creating one only when the pool
  // needs to grow. (The old version searched for a display:'none' element, which
  // never matched mid-frame, so it leaked a fresh element every frame.)
  function acquire(kind, tag) {
    const pool = pools[kind];
    const i = poolIdx[kind]++;
    let el = pool[i];
    if (!el) {
      el = document.createElement(tag);
      if (kind === 'nug') { el.className = 'mp-nug'; el.src = 'nugget.png'; el.draggable = false; }
      else if (kind === 'bolt') el.className = 'mp-bolt2';
      else if (kind === 'crate') el.className = 'mp-crate';
      stage.appendChild(el);
      pool[i] = el;
    }
    el.style.display = '';
    return el;
  }
  function hidePast(kind, used) {
    const pool = pools[kind];
    for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  }

  function spawnLabel(x, y, text, golden) {
    if (typeof spawnPopLabel === 'function') { spawnPopLabel(x, y, text, golden ? 'golden' : ''); return; }
    const el = document.createElement('div');
    el.className = 'catch-pop' + (golden ? ' golden' : '');
    el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
  function muzzleFlash() {
    if (!lastSnap) return;
    const L = layout();
    const el = document.createElement('div');
    el.className = 'mp-bolt';
    el.style.left = sx(myX, L) + 'px';
    el.style.top = (sy(WORLD_H, L) - 26 * L.scale) + 'px';
    stage.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  const fmtN = (n) => (typeof fmt !== 'undefined' ? fmt.format(n) : String(n));
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.BlasterMP = { start, stop };
})();
