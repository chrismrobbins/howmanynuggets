// ---- GRAND THEFT NUGGET — free-roam online (Season 2, Sprint 9) --------------------
// The multiplayer adapter for GTN. Single-player is untouched: this whole file
// is dormant until you host/join a `gta` room, and gta.js only calls into it
// through three guarded hooks (GtaNet.onStep / drawRemotes / onGameExit) that
// are no-ops otherwise.
//
// Model (see worker/src/games/gta.js): the server is a pure relay. Each client
// runs its OWN Nuggetown; we broadcast our transform ~15Hz and render everyone
// else's ghost car/ped in our local city, reusing gta.js's own draw functions
// (gtaDrawVehicle / gtaDrawPed). Positions interpolate ~100ms behind for smooth
// motion. Honks relay as events. No PvP, no shared world, no server scoring.
//
// Loads AFTER net.js (like blasterMP.js), so NuggetNet exists at eval time.
(function () {
  const net = window.NuggetNet;
  if (!net) return;

  const SEND_MS = 66;    // ~15Hz transform broadcast
  const INTERP_MS = 100; // render remotes this far behind for smoothness
  const HORN_MS = 400;   // min gap between our own honks
  const KNOWN_CLASSES = ['compact', 'sedan', 'sports', 'bus', 'tanker', 'cruiser', 'van'];

  // pid -> { samples:[{t,x,y,a,f}], cls, col, name }
  const remotes = new Map();
  let lastSend = 0;
  let lastHorn = 0;
  let launching = false;
  let hud = null;

  const now = () => performance.now();
  const active = () =>
    !!(net.active && net.game === 'gta' && typeof storm !== 'undefined' &&
       storm.mode === 'gta' && storm.running);

  // ---- launch / teardown ----------------------------------------------------------
  function launch() {
    if (launching) return;
    if (typeof storm === 'undefined' || typeof startStorm !== 'function') return;
    launching = true;
    remotes.clear();
    // Leave whatever game/hall session is up, then boot GTN via the same path
    // the arcade uses, and skip straight past the title into free-roam.
    try {
      if (window.NuggetArcade && NuggetArcade.active) NuggetArcade.exit(true);
    } catch (e) { /* hall not up */ }
    if (storm.running && storm.mode !== 'gta') stopStorm();
    storm.mode = 'gta';
    storm.arcade = true;
    startStorm(
      typeof HOUSE_STORM_NUGS !== 'undefined' ? HOUSE_STORM_NUGS : 1000000,
      typeof HOUSE_STORM_DOLLARS !== 'undefined' ? HOUSE_STORM_DOLLARS : 5000000
    );
    if (typeof gta !== 'undefined' && gta.phase === 'title' && typeof gtaStart === 'function') {
      gtaStart(); // instant free-roam: don't sit on the title card
    }
    showHud();
    launching = false;
  }

  function teardown() {
    remotes.clear();
    hideHud();
    if (typeof storm !== 'undefined' && storm.running && storm.mode === 'gta') {
      stopStorm();
    }
  }

  // ---- outgoing: broadcast our transform ------------------------------------------
  function onStep() {
    if (!active() || typeof gta === 'undefined' || gta.phase !== 'play') return;
    const t = now();
    if (t - lastSend < SEND_MS) return;
    lastSend = t;
    const onFoot = !!gta.onFoot;
    const P = onFoot ? gta.ped : gta.car;
    if (!P) return;
    net.send({
      t: 'xf',
      x: Math.round(P.x), y: Math.round(P.y), a: +(P.a || 0).toFixed(3),
      f: onFoot ? 1 : 0,
      c: gta.car ? gta.car.cls : 'compact',
      col: onFoot ? (gta.ped && gta.ped.col) || '#ffd23a' : (gta.car ? gta.car.col : '#c23a3a'),
      // which space we're in: '' = out on the street, else the interior key.
      // Interiors all share GTA_INT_ORIGIN (-9000), so this is how a client
      // tells same-venue neighbours apart from everyone else at those coords.
      int: gta.interior || '',
    });
  }

  // ---- incoming: snapshots + honk events ------------------------------------------
  net.on('snapshot', (m) => {
    if (net.game !== 'gta' || !m.s || !m.s.players) return;
    const players = m.s.players;
    const t = now();
    const seen = new Set();
    for (const pid in players) {
      if (pid === net.you) continue; // never render ourselves as a ghost
      seen.add(pid);
      const p = players[pid];
      let r = remotes.get(pid);
      if (!r) { r = { samples: [], cls: 'compact', col: '#c23a3a', name: p.n || 'Nugget', interior: '' }; remotes.set(pid, r); }
      r.cls = KNOWN_CLASSES.indexOf(p.c) >= 0 ? p.c : 'compact';
      r.col = p.col || r.col;
      r.name = p.n || r.name;
      // Moving between the street and an interior teleports them across a huge
      // coordinate gap — drop the interp buffer so they don't streak across it.
      const nint = p.int || '';
      if (r.interior !== nint) { r.interior = nint; r.samples.length = 0; }
      r.samples.push({ t, x: p.x, y: p.y, a: p.a, f: p.f });
      if (r.samples.length > 6) r.samples.shift();
    }
    for (const pid of [...remotes.keys()]) if (!seen.has(pid)) remotes.delete(pid);
    updateHud();
  });

  net.on('event', (m) => {
    if (net.game !== 'gta') return;
    if (m.kind === 'honk' && m.pid && m.pid !== net.you) {
      const r = remotes.get(m.pid);
      if (r) {
        const s = r.samples[r.samples.length - 1];
        if (s && typeof gta !== 'undefined' && gta.honks) {
          gta.honks.push({ x: s.x, y: s.y, t: 1.1 });
          if (typeof sfxGtaHonk === 'function') sfxGtaHonk(s.x, s.y);
        }
      }
    } else if (m.kind === 'depart' && m.pid) {
      remotes.delete(m.pid);
      updateHud();
    }
  });

  // ---- rendering: interpolate + draw ghosts ---------------------------------------
  function sample(r, renderT) {
    const s = r.samples;
    if (!s.length) return null;
    if (renderT <= s[0].t) return s[0];
    if (renderT >= s[s.length - 1].t) return s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      if (renderT >= a.t && renderT <= b.t) {
        const u = (renderT - a.t) / Math.max(1, b.t - a.t);
        let da = b.a - a.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, a: a.a + da * u, f: b.f };
      }
    }
    return s[s.length - 1];
  }

  function drawRemotes(g, ox, oy, W, Hh) {
    if (!active() || !remotes.size) return;
    const renderT = now() - INTERP_MS;
    // Only draw players sharing our space: on the street ('') you see the
    // outdoor crowd; inside a venue you see only that venue's patrons. This one
    // call is used by BOTH the street render and the interior render.
    const here = (typeof gta !== 'undefined' && gta.interior) || '';
    for (const r of remotes.values()) {
      if ((r.interior || '') !== here) continue;
      const st = sample(r, renderT);
      if (!st) continue;
      const sx = st.x - ox, sy = st.y - oy;
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > Hh + 40) continue;
      // Ghosts render slightly translucent so YOU (crisp, full-opacity) always
      // stand out from the crowd — including on foot, where every nug is golden.
      g.save();
      g.globalAlpha = 0.82;
      if (st.f) {
        if (typeof gtaDrawPed === 'function') {
          gtaDrawPed(g, sx, sy, { x: st.x, y: st.y, a: st.a, t: renderT / 1000, flee: 0, col: r.col }, false);
        }
      } else if (typeof gtaDrawVehicle === 'function') {
        gtaDrawVehicle(g, ox, oy, { x: st.x, y: st.y, a: st.a, cls: r.cls, col: r.col }, false);
      }
      g.restore();
      // name tag (full opacity — always legible)
      g.save();
      g.font = '600 6px "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      const label = (r.name || 'Nugget').slice(0, 12);
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillText(label, sx + 0.5, sy - 11.5);
      g.fillStyle = '#eef2ff';
      g.fillText(label, sx, sy - 12);
      g.restore();
    }
  }

  // ---- the horn (H) ----------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (!active() || typeof gta === 'undefined' || gta.phase !== 'play') return;
    if (e.code !== 'KeyH') return;
    const t = now();
    if (t - lastHorn < HORN_MS) return;
    lastHorn = t;
    net.send({ t: 'honk' });
    const P = gta.onFoot ? gta.ped : gta.car; // honk locally for feel
    if (P && gta.honks) {
      gta.honks.push({ x: P.x, y: P.y, t: 1.1 });
      if (typeof sfxGtaHonk === 'function') sfxGtaHonk(P.x, P.y);
    }
  });

  // ---- in-game overlay (shareable code + player count) ----------------------------
  function showHud() {
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'gta-mp-hud';
      hud.innerHTML = '<span class="gta-mp-code"></span><span class="gta-mp-count"></span>' +
        '<span class="gta-mp-hint">H to honk</span>';
      document.body.appendChild(hud);
    }
    hud.style.display = '';
    updateHud();
  }
  function hideHud() { if (hud) hud.style.display = 'none'; }
  function updateHud() {
    if (!hud) return;
    hud.querySelector('.gta-mp-code').textContent = '🚗 ONLINE · ' + (net.code || '----');
    hud.querySelector('.gta-mp-count').textContent = '👥 ' + (1 + remotes.size);
  }

  // ---- lifecycle wiring ------------------------------------------------------------
  net.on('welcome', (m) => {
    if (m.game !== 'gta') return;
    net.setReady(true);                 // instant free-roam: auto-ready
    if (m.phase === 'playing') launch(); // joined a room already in progress
  });
  net.on('started', () => { if (net.game === 'gta') launch(); });
  net.on('gameover', () => { if (net.game === 'gta') teardown(); });
  net.on('left', () => teardown());
  net.on('gaveup', () => teardown());

  // ---- entry point (host / join) --------------------------------------------------
  function bindEntry() {
    const openBtn = document.getElementById('openGtaOnline');
    const modal = document.getElementById('gtaMpModal');
    if (!modal) return;
    const closeBtn = document.getElementById('gtaMpClose');
    const signedOut = document.getElementById('gtaMpSignedOut');
    const signInBtn = document.getElementById('gtaMpSignIn');
    const home = document.getElementById('gtaMpHome');
    const createBtn = document.getElementById('gtaMpCreate');
    const codeInput = document.getElementById('gtaMpCodeInput');
    const joinBtn = document.getElementById('gtaMpJoin');
    const errEl = document.getElementById('gtaMpError');
    const signedIn = () => !!(window.NuggetAPI && NuggetAPI.getToken());

    const showState = () => {
      errEl.classList.remove('active'); errEl.textContent = '';
      signedOut.style.display = signedIn() ? 'none' : '';
      home.style.display = signedIn() ? '' : 'none';
    };
    const open = () => { modal.classList.add('active'); showState(); };
    const close = () => modal.classList.remove('active');
    const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('active'); };

    openBtn && openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    signInBtn && signInBtn.addEventListener('click', () => {
      close();
      const ab = document.getElementById('accountBtn'); if (ab) ab.click();
    });
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      try { const code = await net.createRoom('gta'); close(); net.join(code, 'gta'); }
      catch (e) { showErr(e.message); }
      finally { createBtn.disabled = false; }
    });
    joinBtn.addEventListener('click', () => {
      const code = (codeInput.value || '').trim().toUpperCase();
      if (code.length < 4) { showErr('Enter a room code.'); return; }
      close();
      net.join(code, 'gta');
    });
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    });
    net.on('error', (e) => { if (net.game === 'gta') { open(); showErr((e && e.message) || 'Connection error.'); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
  else bindEntry();

  // Read-only positions of remotes sharing our space right now — the interior
  // darkness pass (gta.js 10.9.1) punches a light hole over each fellow patron
  // so ghosts don't hide in the gloom. Same filter + interp as drawRemotes.
  function sameSpaceRemotes() {
    if (!active() || !remotes.size) return [];
    const renderT = now() - INTERP_MS;
    const here = (typeof gta !== 'undefined' && gta.interior) || '';
    const out = [];
    for (const r of remotes.values()) {
      if ((r.interior || '') !== here) continue;
      const st = sample(r, renderT);
      if (st) out.push({ x: st.x, y: st.y });
    }
    return out;
  }

  // Every remote's live position + name, for the pause map and the 📍 player
  // tag (S2.1 waypoints): tap a blip, the GPS locks on. Same interp as draw.
  function remoteList() {
    if (!active() || !remotes.size) return [];
    const renderT = now() - INTERP_MS;
    const out = [];
    for (const [pid, r] of remotes) {
      const st = sample(r, renderT);
      if (st) out.push({ pid, name: r.name, x: st.x, y: st.y, interior: r.interior || '' });
    }
    return out;
  }

  // ---- the public hooks gta.js calls ----------------------------------------------
  window.GtaNet = {
    active,
    onStep,
    drawRemotes,
    sameSpaceRemotes,
    remoteList,
    onGameExit() { if (net.active && net.game === 'gta') net.leave(); hideHud(); },
  };
})();
