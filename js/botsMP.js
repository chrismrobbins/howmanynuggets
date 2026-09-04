// ---- 🤖 BATTEREDBOTS online — CLUCKED METAL (the client adapter) ----------------------
// Dormant until you host/join a `bots` room. Then: the server (worker/src/games/
// bots.js) runs the SAME js/botsSim.js as the authority and streams a snapshot
// every 50 ms; this file applies it, replays your unacked inputs on top of your
// own bot (so your driving feels instant), interpolates everyone else between
// snapshots, flies the shots forward between ticks, and hands the sim's events
// to bots.js's effects layer as if they had happened locally.
//
// bots.js calls into this file through window.BotsNet — active / onEnter /
// onStep / pickBoon / onGameExit — all no-ops when not in a room. Loads after
// net.js (like blasterMP.js / gtaMP.js), and after bots.js.
(function () {
  const net = window.NuggetNet;
  if (!net) return;

  const SEND_MS = 50;      // input rate = the server tick
  const STEPS_PER_SEND = 3; // 50 ms of sim at 60 Hz
  let seq = 0, lastSend = 0, acc = 0;
  const pending = [];      // {seq, inp} — inputs the server has not acked yet
  let srv = null, applied = null, snapT = 0;
  let prev = {}, cur = {}; // remote poses for interpolation
  let setupPick = null, hud = null, launching = false, closing = false;

  const active = () => !!(net.active && net.game === 'bots');
  const inGame = () => active() && typeof storm !== 'undefined' && storm.mode === 'bots' && storm.running;
  const now = () => performance.now();

  // ---- launch / teardown -------------------------------------------------------------
  function launch() {
    if (launching) return;
    if (typeof storm === 'undefined' || typeof startStorm !== 'function') return;
    launching = true; closing = false;
    pending.length = 0; srv = applied = null; prev = {}; cur = {};
    try { if (window.NuggetArcade && NuggetArcade.active) NuggetArcade.exit(true); } catch (e) { /* hall not up */ }
    if (storm.running && storm.mode !== 'bots') stopStorm();
    if (!storm.running) {
      storm.mode = 'bots'; storm.arcade = true;
      startStorm(typeof HOUSE_STORM_NUGS !== 'undefined' ? HOUSE_STORM_NUGS : 1000000,
        typeof HOUSE_STORM_DOLLARS !== 'undefined' ? HOUSE_STORM_DOLLARS : 5000000);
    }
    // setStormMode is what runs every game's sync hook — go through it, always
    if (typeof setStormMode === 'function') setStormMode('bots');
    showHud();
    launching = false;
  }
  function teardown() {
    closing = true;
    closeSetup(); hideHud();
    pending.length = 0; srv = applied = null;
    if (typeof storm !== 'undefined' && storm.running && storm.mode === 'bots') stopStorm();
    closing = false;
  }
  function closeSetup() { if (setupPick) { setupPick.close(); setupPick = null; } }

  // ---- setup: pick your chassis; the host also picks league + floor -----------------
  function onEnter() {
    bots.me = net.you; bots.m = null; bots.phase = 'setup'; bots.results = null;
    openClassPick();
  }
  function openClassPick() {
    closeSetup();
    setupPick = ArcadeKit.tierSelect({
      storeKey: 'botsClass', tiers: BOTS_CLASS_CARDS, title: '🔧 pick your chassis', mount: botsWorld,
      note: 'CLUCKED METAL · room ' + (net.code || '----') + (net.host ? ' · you host: league and floor are next' : ' · the host picks the league and floor'),
      onPick: (key) => { setupPick = null; bots.cls = key; net.send({ t: 'pick', cls: key }); if (net.host) openTierPick(); },
    });
  }
  function openTierPick() {
    closeSetup();
    const tiers = BOTS_TIERS.map((t) => Object.assign({}, t, { locked: t.key === 'fryer' && !botsLeagueWon() }));
    setupPick = ArcadeKit.tierSelect({
      storeKey: 'bots', tiers, title: '🤖 host: pick the league', note: 'sets the hazards and the AI drivers for everyone', mount: botsWorld,
      onPick: (key) => { setupPick = null; openArenaPick(key); },
    });
  }
  function openArenaPick(tier) {
    closeSetup();
    setupPick = ArcadeKit.tierSelect({
      storeKey: 'botsArena', tiers: BOTS_ARENA_CARDS, title: '🛢️ host: pick the floor', note: 'the match starts when everyone has a chassis', mount: botsWorld,
      onPick: (key) => { setupPick = null; net.send({ t: 'setup', tier, arena: key }); },
    });
  }

  // ---- snapshots -----------------------------------------------------------------------
  net.on('snapshot', (m) => { if (net.game !== 'bots' || !m.s) return; srv = m.s; snapT = now(); });

  function applySnap(s) {
    if (s.ph === 'setup') {
      bots.phase = 'setup';
      const names = net.players.map((p) => (p.name || 'NUG').slice(0, 10) + (s.picks[p.id] ? ' ✓' : ' …')).join('  ');
      botsAnnounce('CLUCKED METAL · ROOM ' + (net.code || ''), names + '  ·  ' + Math.ceil(s.left) + 's', 0.5, 'go');
      return;
    }
    if (!bots.m) {
      bots.m = BotsSim.createMatch({ arena: s.ar, tier: s.tier, seed: 1, players: [] });
      bots.arena = s.ar; bots.cfg = BotsSim.TIERS.find((t) => t.key === s.tier) || bots.cfg;
      if (bots.art.floorArena !== s.ar) botsLoadFloor(s.ar);
      bots.phase = 'play'; bots.ann = null; closeSetup();
      bots.fx.parts.length = 0; bots.decalClear = true; bots.cx = 320; bots.cy = 180; bots.zoom = 1;
    }
    prev = {};
    for (const b of bots.m.bots) prev[b.id] = { x: b.x, y: b.y, a: b.a, turret: b.turret };
    BotsSim.applySnapshot(bots.m, s);
    cur = {};
    for (const b of bots.m.bots) { cur[b.id] = { x: b.x, y: b.y, a: b.a, turret: b.turret }; if (!prev[b.id]) prev[b.id] = cur[b.id]; }
    // my bot: the server's truth, then my unacked inputs on top
    const ack = (s.seq && s.seq[bots.me]) || 0;
    while (pending.length && pending[0].seq <= ack) pending.shift();
    const me = BotsSim.botById(bots.m, bots.me);
    if (me && me.alive && bots.m.phase === 'fight') {
      for (const p of pending) for (let i = 0; i < STEPS_PER_SEND; i++) BotsSim.predictBot(bots.m, me, p.inp, 1 / 60);
    }
    if (s.ev && s.ev.length) botsHandleEvents(s.ev);
    if (s.ph2 === 'results' && bots.phase !== 'done') botsMatchDone();
    updateHud();
  }

  // ---- per frame (called by stepBots) -----------------------------------------------------
  function onStep(dt, inp) {
    if (!inGame()) return;
    if (srv && srv !== applied) { applied = srv; applySnap(srv); }
    if (bots.phase !== 'play' || !bots.m) return;
    const t = now();
    if (t - lastSend >= SEND_MS) {
      lastSend = t; seq++;
      const msg = { t: 'in', seq, dx: +inp.dx.toFixed(3), dy: +inp.dy.toFixed(3), ax: +inp.ax.toFixed(3), ay: +inp.ay.toFixed(3), ad: Math.round(inp.ad || 0), fire: !!inp.fire, spec: !!inp.spec, nitro: !!inp.nitro, tank: !!inp.tank };
      net.send(msg);
      pending.push({ seq, inp: Object.assign({}, inp) });
      if (pending.length > 40) pending.shift();
    }
    const m = bots.m;
    const me = BotsSim.botById(m, bots.me);
    if (me && me.alive && m.phase === 'fight') {
      acc += dt;
      while (acc >= 1 / 60) { BotsSim.predictBot(m, me, inp, 1 / 60); acc -= 1 / 60; }
    }
    // everyone else eases toward the latest server pose over one tick
    const k = Math.min(1, (t - snapT) / 60);
    for (const b of m.bots) {
      if (b.id === bots.me) continue;
      const c = cur[b.id], p = prev[b.id];
      if (!c || !p) continue;
      b.x = p.x + (c.x - p.x) * k; b.y = p.y + (c.y - p.y) * k;
      b.a = p.a + BotsSim.wrap(c.a - p.a) * k; b.turret = p.turret + BotsSim.wrap(c.turret - p.turret) * k;
    }
    // shots keep flying between ticks
    for (const sh of m.shots) { const W = BotsSim.WEAPONS[sh.w]; if (W && !W.lob) { sh.x += sh.vx * dt; sh.y += sh.vy * dt; } }
    if (m.phase === 'fight') m.clock = Math.max(0, m.clock - dt);
  }

  function pickBoon(key) { net.send({ t: 'boon', key }); }

  // ---- overlay pill ------------------------------------------------------------------------
  function showHud() {
    if (!hud) { hud = document.createElement('div'); hud.className = 'bots-mp-hud'; hud.innerHTML = '<span class="bots-mp-code"></span><span class="bots-mp-count"></span>'; document.body.appendChild(hud); }
    hud.style.display = ''; updateHud();
  }
  function hideHud() { if (hud) hud.style.display = 'none'; }
  function updateHud() {
    if (!hud) return;
    hud.querySelector('.bots-mp-code').textContent = '🤖 CLUCKED METAL ONLINE · ' + (net.code || '----');
    hud.querySelector('.bots-mp-count').textContent = '👥 ' + net.players.length;
  }

  // ---- lifecycle --------------------------------------------------------------------------------
  net.on('started', () => { if (net.game === 'bots') launch(); });
  net.on('welcome', (m) => { if (m.game === 'bots' && m.phase === 'playing') launch(); }); // joined a match in progress: spectate till next round
  net.on('roster', () => { if (net.game === 'bots') updateHud(); });
  net.on('gameover', () => { if (net.game === 'bots') teardown(); });
  net.on('left', () => { if (net.game === 'bots') teardown(); });
  net.on('gaveup', () => { if (net.game === 'bots') teardown(); });

  window.BotsNet = {
    active, onEnter, onStep, pickBoon,
    // syncBots deactivating: a user exit leaves the room; a gameover keeps it for the rematch lobby
    onGameExit() { closeSetup(); hideHud(); if (!closing && net.active && net.game === 'bots') net.leave(); },
  };
})();
