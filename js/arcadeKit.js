// ---- ArcadeKit — the shared juice + progression toolkit ------------------------
// The primitives every UPGRADED game reuses so the five oven-relit classics feel
// like one arcade instead of five different decades. Loaded after storm.js and
// BEFORE the games (see index.html). Pure DOM + rAF + localStorage — no build
// step, render-agnostic: a game can be drawn in DOM, SVG, or canvas and still
// use all of this. Prefix everything ArcadeKit.* (alias AK).
//
// What's in the box:
//   • kick(mag,ms) + shakeXY()    — screen shake you fold into your own transform
//   • hitStop(ms) + timeScale     — cooperative freeze-frame (multiply your dt)
//   • burst(x,y,opts)             — screen-space particle pop (auto-managed)
//   • makeFever(opts)             — combo/streak → level/mult (beat.js HYPE shape)
//   • medal(score,cuts)           — 🥇🥈🥉 by threshold
//   • bests/saveBest/lastTier/... — difficulty-ladder localStorage (oath/HEAT shape)
//   • tierSelect(cfg)             — the pre-game difficulty overlay, reused by all
//
// See UPGRADE_SPRINTS.md for how each sprint leans on these.

const ArcadeKit = (() => {
  const reduceMotion = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const now = () => (window.performance && performance.now) ? performance.now() : 0;

  // ---- Screen shake ----------------------------------------------------------
  // Render-agnostic: kick() registers an impulse; each frame the game reads
  // shakeXY() and adds it into whatever transform it already sets on its root
  // (SVG group, DOM layer, canvas camera). No element ownership, no conflicts.
  // The strongest live impulse wins so a small kick can't stomp a big one.
  let kMag = 0, kUntil = 0, kMs = 1;
  function kick(mag = 8, ms = 260) {
    if (reduceMotion) return;
    const t = now();
    if (mag >= kMag || t > kUntil) { kMag = mag; kMs = ms; kUntil = t + ms; }
  }
  function shakeXY() {
    if (reduceMotion) return { x: 0, y: 0 };
    const left = (kUntil - now()) / kMs;
    if (left <= 0) return { x: 0, y: 0 };
    const m = kMag * left; // linear decay
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
  }

  // ---- Cooperative hit-stop --------------------------------------------------
  // hitStop(ms) drops the shared timeScale toward 0 then eases it back to 1.
  // A game opts in by multiplying its per-frame dt: dt *= ArcadeKit.timeScale.
  // Games that never read it are unaffected. That crunchy freeze on a big hit.
  let tScale = 1, sUntil = 0, sMs = 1;
  function hitStop(ms = 90) {
    if (reduceMotion) return;
    sMs = ms; sUntil = now() + ms;
  }
  function refreshTimeScale() {
    const left = (sUntil - now()) / sMs;
    tScale = left <= 0 ? 1 : 0.06 + 0.94 * (1 - left); // 0.06 → 1 across the freeze
    return tScale;
  }

  // ---- Particle burst --------------------------------------------------------
  // Screen-space (clientX/clientY) DOM pop. Circles by default, or pass an emoji.
  // One overlay layer + one rAF loop shared by every burst; auto-stops when idle.
  let layer = null;
  const parts = [];
  let pRaf = null, pLast = 0;
  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'ak-fx';
    document.body.appendChild(layer);
    return layer;
  }
  function burst(x, y, opts) {
    opts = opts || {};
    const n = reduceMotion ? Math.ceil((opts.n || 12) / 3) : (opts.n || 12);
    const life = opts.life || 0.6;
    const speed = opts.speed || 300;
    const grav = opts.gravity != null ? opts.gravity : 620;
    const size = opts.size || 8;
    const color = opts.color || '#fbbf24';
    const emoji = opts.emoji || '';
    const l = ensureLayer();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      const el = document.createElement('div');
      el.className = 'ak-p';
      if (emoji) { el.textContent = emoji; el.style.fontSize = size + 'px'; }
      else { el.style.width = el.style.height = size + 'px'; el.style.background = color; el.style.borderRadius = '50%'; }
      l.appendChild(el);
      parts.push({
        el, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.35,
        life, t: 0, grav, rot: Math.random() * 360, vr: (Math.random() * 2 - 1) * 420,
      });
    }
    if (!pRaf) { pLast = now(); pRaf = requestAnimationFrame(pStep); }
  }
  function pStep() {
    const t = now();
    const dt = Math.min((t - pLast) / 1000, 0.05);
    pLast = t;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      const q = p.t / p.life;
      if (q >= 1) { p.el.remove(); parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${p.rot.toFixed(0)}deg)`;
      p.el.style.opacity = String(Math.max(0, 1 - q));
    }
    pRaf = parts.length ? requestAnimationFrame(pStep) : null;
  }

  // ---- FEVER / combo ---------------------------------------------------------
  // makeFever() returns an independent streak tracker (each game owns one).
  // level rises every `perLevel` hits up to `maxLevel`; mult = 1 + level*step.
  // Optional `timeout` (secs) auto-breaks the streak if you stop hitting — call
  // tick() each frame for that. The beat.js HYPE→FEVER shape, generalized.
  function makeFever(o) {
    o = o || {};
    const perLevel = o.perLevel || 10, maxLevel = o.maxLevel || 3;
    const step = o.step != null ? o.step : 0.5, timeout = o.timeout || 0;
    let streak = 0, last = now();
    const api = {
      hit(k) { streak += (k || 1); last = now(); return api.level; },
      miss() { const l = api.level; streak = 0; return l; },
      reset() { streak = 0; },
      tick() { if (timeout > 0 && (now() - last) > timeout * 1000) streak = 0; },
      get streak() { return streak; },
      get level() { return Math.min(maxLevel, Math.floor(streak / perLevel)); },
      get active() { return api.level > 0; },
      get mult() { return 1 + api.level * step; },
      get maxLevel() { return maxLevel; },
    };
    return api;
  }

  // ---- Medals ----------------------------------------------------------------
  // cuts: [bronze, silver, gold] or {bronze,silver,gold}. Returns tier info.
  function medal(score, cuts) {
    const b = Array.isArray(cuts) ? cuts[0] : cuts.bronze;
    const s = Array.isArray(cuts) ? cuts[1] : cuts.silver;
    const g = Array.isArray(cuts) ? cuts[2] : cuts.gold;
    if (score >= g) return { tier: 'gold', emoji: '🥇', label: 'GOLD' };
    if (score >= s) return { tier: 'silver', emoji: '🥈', label: 'SILVER' };
    if (score >= b) return { tier: 'bronze', emoji: '🥉', label: 'BRONZE' };
    return { tier: 'none', emoji: '', label: '' };
  }

  // ---- Difficulty-ladder persistence (the oath/HEAT idiom) -------------------
  // Per game: `<storeKey>Best` = JSON map tierKey→best number; `<storeKey>Last`
  // = sticky last pick. All wrapped for private-mode.
  function bests(storeKey) {
    try { return JSON.parse(localStorage.getItem(storeKey + 'Best') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveBest(storeKey, tierKey, value) {
    const rec = bests(storeKey);
    if (value > (rec[tierKey] || 0)) {
      rec[tierKey] = value;
      try { localStorage.setItem(storeKey + 'Best', JSON.stringify(rec)); } catch (e) { /* ok */ }
    }
    return rec;
  }
  function lastTier(storeKey, fallback) {
    try { return localStorage.getItem(storeKey + 'Last') || fallback; } catch (e) { return fallback; }
  }
  function setLastTier(storeKey, tierKey) {
    try { localStorage.setItem(storeKey + 'Last', tierKey); } catch (e) { /* ok */ }
  }

  // ---- Difficulty-select overlay ---------------------------------------------
  // cfg: { storeKey, tiers:[{key,emoji,name,mult,blurb,locked?,lockNote?}],
  //        title?, note?, mount?, onPick(key,tier) }
  // Renders cards, handles 1/2/3(/4) + click, remembers the pick, skips locked
  // tiers, then closes and calls onPick. Returns { close }.
  function tierSelect(cfg) {
    const tiers = cfg.tiers || [];
    const mount = cfg.mount || document.body;
    const firstOpen = tiers.find((t) => !t.locked);
    const last = lastTier(cfg.storeKey, firstOpen ? firstOpen.key : (tiers[0] && tiers[0].key));
    const rec = bests(cfg.storeKey);
    const ov = document.createElement('div');
    ov.className = 'ak-tier';
    ov.innerHTML =
      `<div class="ak-tier-panel">` +
      `<div class="ak-tier-title">${cfg.title || 'Choose your heat'}</div>` +
      `<div class="ak-tier-cards"></div>` +
      `<div class="ak-tier-note">${cfg.note || 'press 1 · 2 · 3 or click'}</div>` +
      `</div>`;
    const cards = ov.querySelector('.ak-tier-cards');
    tiers.forEach((t, i) => {
      const b = rec[t.key];
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.key = t.key;
      card.className = 'ak-tier-card' + (t.locked ? ' ak-locked' : '') + (t.key === last ? ' ak-last' : '');
      card.innerHTML =
        `<span class="ak-tier-num">${i + 1}</span>` +
        `<span class="ak-tier-emoji">${t.emoji || ''}</span>` +
        `<span class="ak-tier-name">${t.name || t.key}</span>` +
        `<span class="ak-tier-blurb">${t.locked ? (t.lockNote || 'Locked') : (t.blurb || '')}</span>` +
        `<span class="ak-tier-mult">${t.locked ? '' : ('×' + (t.mult || 1) + ' score')}</span>` +
        `<span class="ak-tier-best">${b ? ('best ' + b) : ''}</span>`;
      cards.appendChild(card);
    });
    let done = false;
    function choose(key) {
      const t = tiers.find((x) => x.key === key);
      if (done || !t || t.locked) return;
      done = true;
      setLastTier(cfg.storeKey, key);
      close();
      if (cfg.onPick) cfg.onPick(key, t);
    }
    function onClick(e) {
      const c = e.target.closest('.ak-tier-card');
      if (c) choose(c.dataset.key);
    }
    function onKey(e) {
      const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
      if (idx != null && tiers[idx]) { choose(tiers[idx].key); e.preventDefault(); e.stopPropagation(); }
    }
    function close() { window.removeEventListener('keydown', onKey, true); ov.remove(); }
    ov.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey, true);
    mount.appendChild(ov);
    return { close };
  }

  return {
    reduceMotion,
    kick, shakeXY,
    hitStop, refreshTimeScale, get timeScale() { return tScale; },
    burst,
    makeFever, medal,
    bests, saveBest, lastTier, setLastTier, tierSelect,
  };
})();
window.ArcadeKit = ArcadeKit;
window.AK = ArcadeKit;
