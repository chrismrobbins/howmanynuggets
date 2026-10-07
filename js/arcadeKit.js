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
//   • boonSelect(cfg)             — the pick-1-of-3 boon deal (knight.js school)
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

  // ---- Card chrome (shared by tierSelect + boonSelect) ------------------------
  // The look lives in css/arcadeKit.css. Themes re-light the same card for the
  // room the deal happens in: 'crate' (Blaster), 'relic' (Undercroft), 'gear'
  // (Storm Drain), 'pit' (BatteredBots). No theme = the Nuggetown default.
  const THEMES = { crate: 1, relic: 1, gear: 1, pit: 1 };
  const themeClass = (theme) => (theme && THEMES[theme] ? ' ak-theme-' + theme : '');
  // The art window wraps the emoji in a glyph span so the glyph can scale and
  // cast a shadow without dragging the window's frame along with it.
  const cardArt = (emoji) => `<span class="ak-tier-emoji"><span class="ak-tier-glyph">${emoji || ''}</span></span>`;

  // Display faces (Oswald / Cormorant Garamond / JetBrains Mono). Injected
  // after load so it never sits on the boot path; offline it simply fails and
  // the CSS falls back to system condensed/serif/mono stacks.
  const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700' +
    '&family=Cormorant+Garamond:wght@600;700&family=JetBrains+Mono:wght@500;700&display=swap';
  function warmFonts() {
    if (warmFonts.done || !document.head) return;
    warmFonts.done = true;
    try {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = FONTS_URL;
      l.onload = () => {
        try {
          if (document.fonts && document.fonts.load) {
            ['600 1em Oswald', '700 1em "Cormorant Garamond"', '700 1em "JetBrains Mono"']
              .forEach((f) => document.fonts.load(f).catch(() => {}));
          }
        } catch (e) { /* ok */ }
      };
      document.head.appendChild(l);
    } catch (e) { /* ok — system fonts it is */ }
  }
  if (document.readyState === 'complete') setTimeout(warmFonts, 1200);
  else window.addEventListener('load', () => setTimeout(warmFonts, 1200));

  // Put an overlay up. Any previous deal still playing its exit beat goes now,
  // so a chained pick (league → chassis → floor) never stacks two veils.
  function mountOverlay(ov, mount) {
    warmFonts();
    document.querySelectorAll('.ak-tier-out').forEach((o) => o.remove());
    mount.appendChild(ov);
  }
  // Take an overlay down. With a chosen card (and motion allowed) it plays the
  // "chosen" beat first — but the overlay drops the .ak-tier class at once and
  // stops taking pointer events, so every game's `.ak-tier` menu guard sees the
  // menu as closed on the same frame onPick fires. Nothing waits on the beat.
  function dismiss(ov, chosen) {
    if (!chosen || reduceMotion || !ov.isConnected) { ov.remove(); return; }
    ov.classList.remove('ak-tier');
    ov.classList.add('ak-tier-out');
    chosen.classList.add('ak-chosen');
    // gone when its own fade ends; the timer is only a backstop (hidden tab, no CSS)
    ov.addEventListener('animationend', (e) => { if (e.target === ov) ov.remove(); });
    setTimeout(() => ov.remove(), 900);
  }

  // ---- Difficulty-select overlay ---------------------------------------------
  // cfg: { storeKey, tiers:[{key,emoji,name,mult,blurb,locked?,lockNote?}],
  //        title?, note?, theme?, mount?, onPick(key,tier) }
  // Renders cards, handles 1/2/3(/4) + click, remembers the pick, skips locked
  // tiers, then closes and calls onPick. Returns { close }.
  function tierSelect(cfg) {
    const tiers = cfg.tiers || [];
    const mount = cfg.mount || document.body;
    const firstOpen = tiers.find((t) => !t.locked);
    const last = lastTier(cfg.storeKey, firstOpen ? firstOpen.key : (tiers[0] && tiers[0].key));
    const rec = bests(cfg.storeKey);
    const ov = document.createElement('div');
    ov.className = 'ak-tier' + themeClass(cfg.theme);
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
      card.style.setProperty('--ak-i', String(i));
      card.innerHTML =
        `<span class="ak-tier-num">${i + 1}</span>` +
        cardArt(t.emoji) +
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
      close(Array.from(cards.children).find((c) => c.dataset.key === key));
      if (cfg.onPick) cfg.onPick(key, t);
    }
    function onClick(e) {
      const c = e.target.closest('.ak-tier-card');
      if (!c) return;
      if (c.classList.contains('ak-locked') && !reduceMotion) { // a locked card shakes its head
        c.classList.remove('ak-nope'); void c.offsetWidth; c.classList.add('ak-nope');
      }
      choose(c.dataset.key);
    }
    function onKey(e) {
      const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
      if (idx != null && tiers[idx]) { choose(tiers[idx].key); e.preventDefault(); e.stopPropagation(); }
    }
    // close(chosenCard?) — games call close() bare, which is always instant.
    function close(chosen) {
      window.removeEventListener('keydown', onKey, true);
      dismiss(ov, chosen && chosen.nodeType === 1 ? chosen : null);
    }
    ov.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey, true);
    mountOverlay(ov, mount);
    return { close: () => close() };
  }

  // ---- Boon-select overlay (the knight's pick-1-of-3, generalized) ------------
  // The between-wave "choose thy boon" card deal any game can put up at a wave
  // break or checkpoint. cfg: { title?, note?, theme?, boons:[{emoji,name,desc}],
  // mount?, onPick(idx, boon) }. Deals exactly the cards it's given — the caller
  // filters its own pool by ok() and shuffles — handles 1/2/3 + click/tap, then
  // closes and calls onPick. Reuses the .ak-tier chrome on purpose: every game's
  // input guards already treat .ak-tier as menu, not gameplay, so a boon deal
  // can't be slashed/fired/kicked through. theme ('crate' | 'relic' | 'gear' |
  // 'pit') re-lights the cards for the game's room; omit it for the default.
  // Returns { close, choose } (choose(i) is for tests). onPick fires the moment
  // a card is taken (the exit beat is cosmetic). Freeze your own sim while it's
  // up — the kit doesn't.
  function boonSelect(cfg) {
    const boons = cfg.boons || [];
    const mount = cfg.mount || document.body;
    const ov = document.createElement('div');
    ov.className = 'ak-tier ak-boons' + themeClass(cfg.theme);
    ov.innerHTML =
      `<div class="ak-tier-panel">` +
      `<div class="ak-tier-title">${cfg.title || 'Choose your boon'}</div>` +
      `<div class="ak-tier-cards"></div>` +
      `<div class="ak-tier-note">${cfg.note || 'press 1 · 2 · 3 or click'}</div>` +
      `</div>`;
    const cards = ov.querySelector('.ak-tier-cards');
    boons.forEach((b, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.idx = String(i);
      card.className = 'ak-tier-card';
      card.style.setProperty('--ak-i', String(i));
      card.innerHTML =
        `<span class="ak-tier-num">${i + 1}</span>` +
        cardArt(b.emoji) +
        `<span class="ak-tier-name">${b.name || ''}</span>` +
        `<span class="ak-tier-blurb">${b.desc || ''}</span>`;
      cards.appendChild(card);
    });
    let done = false;
    function choose(idx) {
      const b = boons[idx];
      if (done || !b) return;
      done = true;
      close(cards.children[idx]);
      if (cfg.onPick) cfg.onPick(idx, b);
    }
    function onClick(e) {
      const c = e.target.closest('.ak-tier-card');
      if (c) choose(Number(c.dataset.idx));
    }
    function onKey(e) {
      const idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (idx != null && boons[idx]) { choose(idx); e.preventDefault(); e.stopPropagation(); }
    }
    // close(chosenCard?) — games call close() bare, which is always instant.
    function close(chosen) {
      window.removeEventListener('keydown', onKey, true);
      dismiss(ov, chosen && chosen.nodeType === 1 ? chosen : null);
    }
    ov.addEventListener('click', onClick);
    ov.addEventListener('mousedown', (e) => e.stopPropagation()); // no firing through the menu
    window.addEventListener('keydown', onKey, true);
    mountOverlay(ov, mount);
    return { close: () => close(), choose };
  }

  return {
    reduceMotion,
    kick, shakeXY,
    hitStop, refreshTimeScale, get timeScale() { return tScale; },
    burst,
    makeFever, medal,
    bests, saveBest, lastTier, setLastTier, tierSelect, boonSelect,
  };
})();
window.ArcadeKit = ArcadeKit;
window.AK = ArcadeKit;
