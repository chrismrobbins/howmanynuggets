// ---- Nugget Ranch ----------------------------------------------------------------
// Sims-meets-Neopets on a chicken farm. Start with a single egg — you name it,
// it incubates, hatches into a chick, and grows on an accelerated timeline
// (egg → chick → pullet → grown hen). Feed your birds to keep them alive; a
// starved chick dies. Grown hens lay eggs that earn coins, coins buy more eggs,
// and once a bird is fully grown you can ship it to the slaughterhouse to mint
// McNuggets — which are your score. Raise one hen or build a chicken empire.
//
// DOM-driven (like Sim/Knight): a fixed grid of pens, updated each frame from
// stepRanch(). Score is banked into storm.caught, so the arcade's high-score
// plumbing (window.onArcadeScore) picks it up on exit, same as every other game.

const ranchWorld = document.getElementById('ranchWorld');

// Life stages and how long (accelerated seconds) each lasts before the bird
// advances. 'adult' is terminal — a grown hen you can keep laying or ship.
const R_STAGES = ['egg', 'chick', 'pullet', 'adult'];
const R_STAGE_SECS = { egg: 14, chick: 20, pullet: 24 };
const R_STAGE_EMOJI = { egg: '🥚', hatch: '🐣', chick: '🐤', pullet: '🐥', adult: '🐔' };
const R_STAGE_LABEL = { egg: 'Incubating', chick: 'Chick', pullet: 'Pullet', adult: 'Grown hen' };
const R_LIFETIME = R_STAGE_SECS.egg + R_STAGE_SECS.chick + R_STAGE_SECS.pullet; // to adult

const R_FULL_MAX = 100;
const R_FULL_DECAY = 5.2;     // fullness lost per second (chick+; eggs don't eat)
const R_FEED_GAIN = 44;       // fullness restored per feeding
const R_FEED_COST = 3;        // coins per feeding
const R_STARVE_SECS = 6;      // seconds at empty before the bird dies
const R_EGG_COST = 10;        // coins to buy a fresh egg
const R_START_COINS = 45;
const R_LAY_SECS = 10;        // a grown hen lays this often
const R_LAY_COINS = 6;        // coins per egg laid
const R_SLOTS = 8;            // coop capacity
const R_BASE_NUGGETS = 28;    // nuggets from shipping a well-fed grown hen
const R_SHIP_COINS = 9;       // coins back when you ship a hen
const R_GOLDEN_CHANCE = 0.06; // rare golden hen: 3x nuggets, 2x eggs
const R_GOLDEN_MULT = 3;

const R_NAMES = ['Clucky', 'Nugget', 'Pecky', 'Drumstick', 'Wing', 'Feathers', 'Biscuit',
  'Goldie', 'Rocky', 'Henrietta', 'Gizmo', 'Waffles', 'Tender', 'Marge', 'Chirp',
  'Yolko', 'Beaky', 'Scramble', 'Colonel', 'Dumpling', 'Pip', 'Noodle'];

const ranch = {
  on: false,
  coins: 0,
  birds: [],        // { id, name, si, t, full, starveT, alive, deadT, hatchT, layT, golden }
  nid: 1,
  named: false,     // has the player named their first egg yet?
  pens: [],         // persistent per-slot DOM (built once)
  built: false,
  refs: null,
};

function ranchActive() {
  return storm.mode === 'ranch' && storm.running;
}

function ranchRandName() {
  return R_NAMES[Math.floor(Math.random() * R_NAMES.length)];
}

// ---- Lifecycle: called by storm.js on mode/running changes -----------------------
function syncRanch() {
  const active = ranchActive();
  if (active === ranch.on) return;
  ranch.on = active;
  ranchWorld.classList.toggle('active', active);
  if (active) {
    buildRanchScene();
    ranch.coins = R_START_COINS;
    ranch.birds = [];
    ranch.nid = 1;
    ranch.named = false;
    // A free starter egg — the player names it to begin.
    const first = makeBird();
    ranch.birds.push(first);
    renderRanch(true);
    openNameModal(first, true);
  } else {
    closeNameModal();
  }
}

function makeBird(golden) {
  return {
    id: ranch.nid++,
    name: ranchRandName(),
    si: 0,               // stage index into R_STAGES
    t: 0,                // seconds elapsed in the current stage
    full: R_FULL_MAX,
    starveT: 0,
    alive: true,
    deadT: 0,
    hatchT: 0,           // brief 🐣 flash on hatching
    layT: 0,
    golden: golden === undefined ? Math.random() < R_GOLDEN_CHANCE : golden,
  };
}

// ---- The scene ------------------------------------------------------------------
function buildRanchScene() {
  if (ranch.built) return;
  ranchWorld.innerHTML = `
    <div class="ranch-sky"></div>
    <div class="ranch-hills"></div>
    <div class="ranch-ground"></div>
    <div class="ranch-barn">🏚️</div>
    <div class="ranch-coop" id="ranchCoop"></div>
    <div class="ranch-toolbar">
      <div class="ranch-coins" id="ranchCoins">🪙 0</div>
      <button class="ranch-tbtn buy" id="ranchBuy" type="button">🥚 Buy egg · 10🪙</button>
      <button class="ranch-tbtn feedall" id="ranchFeedAll" type="button">🌾 Feed all</button>
      <div class="ranch-hint" id="ranchHint">Name your first egg to start the flock.</div>
    </div>
    <div class="ranch-namewrap" id="ranchNameWrap">
      <div class="ranch-namecard">
        <div class="ranch-nametitle" id="ranchNameTitle">Name your egg 🥚</div>
        <input class="ranch-nameinput" id="ranchNameInput" maxlength="14" autocomplete="off" spellcheck="false" />
        <div class="ranch-namebtns">
          <button class="ranch-namebtn ghost" id="ranchNameRandom" type="button">🎲 Random</button>
          <button class="ranch-namebtn go" id="ranchNameGo" type="button">Hatch it →</button>
        </div>
      </div>
    </div>`;

  const coop = ranchWorld.querySelector('#ranchCoop');
  ranch.pens = [];
  for (let i = 0; i < R_SLOTS; i++) {
    const pen = document.createElement('div');
    pen.className = 'ranch-pen empty';
    pen.innerHTML = `
      <div class="ranch-critter">🥚</div>
      <div class="ranch-golden">✨</div>
      <div class="ranch-name">—</div>
      <div class="ranch-stagelbl">Empty pen</div>
      <div class="ranch-bars">
        <div class="ranch-bar grow"><i></i></div>
        <div class="ranch-bar full"><i></i></div>
      </div>
      <div class="ranch-actions">
        <button class="ranch-act feed" type="button">🌾 Feed</button>
        <button class="ranch-act ship" type="button">🏭 Ship</button>
      </div>
      <div class="ranch-float"></div>`;
    pen._sig = null;
    pen._critter = pen.querySelector('.ranch-critter');
    pen._name = pen.querySelector('.ranch-name');
    pen._lbl = pen.querySelector('.ranch-stagelbl');
    pen._grow = pen.querySelector('.ranch-bar.grow i');
    pen._full = pen.querySelector('.ranch-bar.full i');
    pen._fullbar = pen.querySelector('.ranch-bar.full');
    pen._feed = pen.querySelector('.ranch-act.feed');
    pen._ship = pen.querySelector('.ranch-act.ship');
    pen._float = pen.querySelector('.ranch-float');
    const idx = i;
    pen._feed.addEventListener('click', (e) => { e.stopPropagation(); feedBird(idx); });
    pen._ship.addEventListener('click', (e) => { e.stopPropagation(); shipBird(idx); });
    pen._name.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ranch.birds[idx]) openNameModal(ranch.birds[idx], false);
    });
    pen.addEventListener('click', () => { if (!ranch.birds[idx]) buyEgg(); });
    coop.appendChild(pen);
    ranch.pens.push(pen);
  }

  ranch.refs = {
    coins: ranchWorld.querySelector('#ranchCoins'),
    buy: ranchWorld.querySelector('#ranchBuy'),
    feedAll: ranchWorld.querySelector('#ranchFeedAll'),
    hint: ranchWorld.querySelector('#ranchHint'),
    nameWrap: ranchWorld.querySelector('#ranchNameWrap'),
    nameTitle: ranchWorld.querySelector('#ranchNameTitle'),
    nameInput: ranchWorld.querySelector('#ranchNameInput'),
    nameRandom: ranchWorld.querySelector('#ranchNameRandom'),
    nameGo: ranchWorld.querySelector('#ranchNameGo'),
  };
  ranch.refs.buy.addEventListener('click', (e) => { e.stopPropagation(); buyEgg(); });
  ranch.refs.feedAll.addEventListener('click', (e) => { e.stopPropagation(); feedAll(); });
  ranch.refs.nameGo.addEventListener('click', (e) => { e.stopPropagation(); commitName(); });
  ranch.refs.nameRandom.addEventListener('click', (e) => {
    e.stopPropagation();
    ranch.refs.nameInput.value = ranchRandName();
    ranch.refs.nameInput.focus();
  });
  ranch.refs.nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitName(); }
  });
  ranch.built = true;
}

// ---- Naming modal ---------------------------------------------------------------
let nameTarget = null;
let nameIsFirst = false;

function openNameModal(bird, first) {
  if (!ranch.refs) return;
  nameTarget = bird;
  nameIsFirst = !!first;
  ranch.refs.nameTitle.textContent = first ? 'Name your egg 🥚' : 'Rename ' + bird.name;
  ranch.refs.nameInput.value = bird.name;
  ranch.refs.nameWrap.classList.add('show');
  setTimeout(() => { ranch.refs.nameInput.focus(); ranch.refs.nameInput.select(); }, 30);
}

function closeNameModal() {
  if (ranch.refs) ranch.refs.nameWrap.classList.remove('show');
  nameTarget = null;
}

function commitName() {
  if (!nameTarget) return;
  const v = (ranch.refs.nameInput.value || '').trim().slice(0, 14) || ranchRandName();
  nameTarget.name = v;
  if (nameIsFirst) ranch.named = true;
  closeNameModal();
  renderRanch(true);
}

// ---- Player actions -------------------------------------------------------------
function firstEmptySlot() {
  for (let i = 0; i < R_SLOTS; i++) if (!ranch.birds[i]) return i;
  return -1;
}

function buyEgg() {
  const slot = firstEmptySlot();
  if (slot === -1) { flashHint('Coop is full — ship a grown hen first.'); return; }
  if (ranch.coins < R_EGG_COST) { flashHint('Not enough coins for an egg.'); return; }
  ranch.coins -= R_EGG_COST;
  ranch.birds[slot] = makeBird();
  penFloat(slot, '🥚');
  renderRanch(true);
}

function feedBird(i) {
  const b = ranch.birds[i];
  if (!b || !b.alive || b.si === 0) return; // eggs don't eat
  if (b.full >= R_FULL_MAX - 0.5) { flashHint(b.name + ' is stuffed already.'); return; }
  if (ranch.coins < R_FEED_COST) { flashHint('Out of coins — ship a hen for cash.'); return; }
  ranch.coins -= R_FEED_COST;
  b.full = Math.min(R_FULL_MAX, b.full + R_FEED_GAIN);
  b.starveT = 0;
  penFloat(i, '🌾');
  renderRanch();
}

function feedAll() {
  let any = false;
  for (let i = 0; i < R_SLOTS; i++) {
    const b = ranch.birds[i];
    if (!b || !b.alive || b.si === 0 || b.full >= R_FULL_MAX - 0.5) continue;
    if (ranch.coins < R_FEED_COST) break;
    ranch.coins -= R_FEED_COST;
    b.full = Math.min(R_FULL_MAX, b.full + R_FEED_GAIN);
    b.starveT = 0;
    penFloat(i, '🌾');
    any = true;
  }
  if (!any) flashHint('Nothing to feed right now.');
  renderRanch();
}

function shipBird(i) {
  const b = ranch.birds[i];
  if (!b || !b.alive || b.si !== 3) return; // only grown hens
  const health = 0.45 + 0.55 * (b.full / R_FULL_MAX); // well-fed birds yield more
  let nuggets = Math.round(R_BASE_NUGGETS * health);
  if (b.golden) nuggets *= R_GOLDEN_MULT;
  storm.caught += nuggets;
  ranch.coins += R_SHIP_COINS;
  penFloat(i, '🍗 +' + nuggets, 'nug');
  ranch.birds[i] = null;
  renderRanch(true);
}

// ---- Per-frame simulation (called by storm.js) ----------------------------------
function stepRanch(dt, w, h) {
  if (!ranch.on) return;
  dt = Math.min(dt, 0.1); // clamp to avoid a giant jump after a tab stall

  for (let i = 0; i < R_SLOTS; i++) {
    const b = ranch.birds[i];
    if (!b) continue;

    if (!b.alive) {
      b.deadT -= dt;
      if (b.deadT <= 0) { ranch.birds[i] = null; renderRanch(true); }
      continue;
    }
    if (b.hatchT > 0) b.hatchT -= dt;

    // Grow through the stages.
    const stage = R_STAGES[b.si];
    if (b.si < 3) {
      b.t += dt;
      const need = R_STAGE_SECS[stage];
      if (b.t >= need) {
        b.t -= need;
        b.si++;
        if (R_STAGES[b.si] === 'chick') { b.hatchT = 0.9; b.full = 72; penFloat(i, '🐣'); }
      }
    }

    // Hunger (chicks and older; eggs incubate hands-free).
    if (b.si >= 1) {
      b.full -= R_FULL_DECAY * dt;
      if (b.full <= 0) {
        b.full = 0;
        b.starveT += dt;
        if (b.starveT >= R_STARVE_SECS) {
          b.alive = false;
          b.deadT = 1.3;
          penFloat(i, '💀', 'dead');
          flashHint(b.name + ' starved. Keep them fed!');
        }
      } else {
        b.starveT = 0;
      }
    }

    // Grown hens lay eggs for coins.
    if (b.si === 3) {
      b.layT += dt;
      if (b.layT >= R_LAY_SECS) {
        b.layT = 0;
        const c = b.golden ? R_LAY_COINS * 2 : R_LAY_COINS;
        ranch.coins += c;
        penFloat(i, '🥚 +' + c, 'coin');
      }
    }
  }
  renderRanch();
}

// ---- Rendering (diffed; bars every frame, structure only on change) --------------
function renderRanch(force) {
  if (!ranch.built) return;
  ranch.refs.coins.textContent = '🪙 ' + Math.floor(ranch.coins);
  ranch.refs.buy.classList.toggle('cant', ranch.coins < R_EGG_COST || firstEmptySlot() === -1);

  for (let i = 0; i < R_SLOTS; i++) {
    const b = ranch.birds[i];
    const pen = ranch.pens[i];
    if (!b) {
      if (force || pen._sig !== 'empty') {
        pen.className = 'ranch-pen empty';
        pen._critter.textContent = '🥚';
        pen._name.textContent = '—';
        pen._lbl.textContent = 'Empty pen';
        pen._grow.style.width = '0%';
        pen._full.style.width = '0%';
        pen._sig = 'empty';
      }
      continue;
    }

    const stage = R_STAGES[b.si];
    const emoji = !b.alive ? '💀'
      : b.hatchT > 0 ? R_STAGE_EMOJI.hatch
        : R_STAGE_EMOJI[stage];
    const sig = stage + '|' + b.alive + '|' + (b.hatchT > 0) + '|' + b.golden + '|' + b.name;
    if (force || pen._sig !== sig) {
      pen.className = 'ranch-pen'
        + (b.golden ? ' golden' : '')
        + (!b.alive ? ' dead' : '')
        + (b.si === 3 && b.alive ? ' grown' : '')
        + (' st-' + stage);
      pen._critter.textContent = emoji;
      pen._name.textContent = b.name;
      pen._lbl.textContent = !b.alive ? 'Lost…' : R_STAGE_LABEL[stage] + (b.golden ? ' ✨' : '');
      pen._feed.style.display = (b.alive && b.si >= 1) ? '' : 'none';
      pen._ship.style.display = (b.alive && b.si === 3) ? '' : 'none';
      pen._sig = sig;
    }

    // Growth bar: overall progress toward a grown hen.
    let grown = 0;
    for (let s = 0; s < b.si && s < 3; s++) grown += R_STAGE_SECS[R_STAGES[s]];
    if (b.si < 3) grown += Math.min(b.t, R_STAGE_SECS[stage]);
    else grown = R_LIFETIME;
    pen._grow.style.width = Math.min(100, (grown / R_LIFETIME) * 100) + '%';

    // Fullness bar (hidden for eggs).
    if (b.si >= 1 && b.alive) {
      pen._fullbar.style.visibility = 'visible';
      pen._full.style.width = b.full + '%';
      pen._full.className = b.full < 25 ? 'low' : b.full < 55 ? 'mid' : '';
    } else {
      pen._fullbar.style.visibility = 'hidden';
    }
  }
}

// A floating emoji/label that drifts up out of a pen and fades.
function penFloat(i, text, kind) {
  const pen = ranch.pens[i];
  if (!pen) return;
  const el = pen._float;
  el.textContent = text;
  el.className = 'ranch-float' + (kind ? ' ' + kind : '');
  // restart the animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  el.classList.add('go');
  setTimeout(() => el.classList.remove('go'), 900);
}

let ranchHintT = null;
function flashHint(msg) {
  if (!ranch.refs) return;
  ranch.refs.hint.textContent = msg;
  ranch.refs.hint.classList.add('alert');
  clearTimeout(ranchHintT);
  ranchHintT = setTimeout(() => {
    ranch.refs.hint.classList.remove('alert');
    ranch.refs.hint.textContent = 'Feed 🌾 to keep birds alive · Ship 🏭 grown hens for nuggets';
  }, 2200);
}

// HUD tally string shown by storm.js.
function ranchTally() {
  if (!ranch.named) return 'Name your first egg…';
  const flock = ranch.birds.filter((b) => b && b.alive).length;
  return '🪙 ' + Math.floor(ranch.coins) + ' · 🐔 ' + flock + '/' + R_SLOTS;
}
