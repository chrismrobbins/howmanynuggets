// ---- FAST FOOD -------------------------------------------------------------------
// "PEDAL TO THE BATTER."
//
// An OutRun-style pseudo-3D night racer (mode key: kart). You're a delivery
// nug hauling a hot order across Nuggetown after dark: auto-throttle down a
// segment-projected road, ← → steer, ↓ brake, SPACE burns a 🌶️ chili for
// nitro. Checkpoints feed the clock (+16s); BATTER tanker trucks (the
// syndicate's, if you believe the street) clog the lanes, and the billboards
// ask the only question that matters in this town: SEEN OUR STORM?
//
// TIME UP ends the run — X restarts the clock right where you stalled, and
// (arcade house rule) the score NEVER resets.
//
// Rendering is the classic low-res pixel canvas trick from Battered Brawlers:
// a ~270px-tall backing store scaled up with image-rendering: pixelated.
// Scoring mirrors the other games: distance, clean tanker passes, and pickups
// pay perFlyer-scaled points into storm.caught (golden nugs 10×).

const kartWorld = document.getElementById('kartWorld');

const KART_DRAW = 40;          // segments visible ahead
const KART_TRACK_N = 480;      // loop length in segments
const KART_CP_EVERY = 120;     // checkpoint spacing (segments)
const KART_CP_BONUS = 16;      // seconds per checkpoint
const KART_START_SECS = 40;
const KART_MAX = 16;           // cruise speed, segments/sec
const KART_NITRO_MAX = 26;
const KART_NITRO_SECS = 1.6;
const KART_OFFROAD_MAX = 6;

const kart = {
  on: false,
  cv: null, g: null, banner: null,
  W: 0, Hh: 0, scale: 1,
  phase: 'title',      // title | race | timeup
  t: 0,
  track: [],           // [{curve}] per segment
  sprites: [],         // billboards + pickups: {kind, pz, px, msg?, taken?}
  traffic: [],         // tankers: {pz, px, spd, prevRel}
  pos: 0,              // loop position (segments, wraps)
  dist: 0,             // total distance (never wraps — drives checkpoints)
  speed: 0,
  playerX: 0,          // -1 .. 1 across the road (beyond = shoulder)
  steer: 0,            // -1 | 0 | 1 (touch/pointer feeds this too)
  braking: false,
  nitroT: 0, chilis: 1,
  spinT: 0, spinDir: 1,
  timer: KART_START_SECS,
  cp: 0, cpNext: KART_CP_EVERY,
  passes: 0,
  keys: {},
  rain: [],
  distPay: 0,          // fractional distance-points accumulator
};

function kartActive() {
  return storm.mode === 'kart' && storm.running;
}

function kartTally() {
  if (kart.phase === 'title') return '"pedal to the batter"';
  if (kart.phase === 'timeup') return '⏰ TIME UP · press X — the order is still hot';
  return '⏱ ' + Math.ceil(kart.timer) + 's · CP ' + kart.cp + ' · 🌶️×' + kart.chilis +
    ' · ' + Math.round(kart.speed * 16) + ' NPH';
}

// ---- setup -------------------------------------------------------------------------

function kartLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  kart.scale = Math.max(2, Math.floor(vh / 270)); // world is ~270px tall
  kart.W = Math.ceil(vw / kart.scale);
  kart.Hh = Math.ceil(vh / kart.scale);
  kart.cv.width = kart.W;
  kart.cv.height = kart.Hh;
  kart.g.imageSmoothingEnabled = false;
  kart.rain = [];
  for (let i = 0; i < 40; i++)
    kart.rain.push({ x: Math.random() * kart.W, y: Math.random() * kart.Hh, v: 90 + Math.random() * 60 });
}

// The course: straights, sweepers, and S-bends, laid out by a seeded shuffle so
// every session drives the same Nuggetown loop (billboards live at fixed spots).
function kartBuildTrack() {
  kart.track = [];
  const add = (n, curve) => { for (let i = 0; i < n; i++) kart.track.push({ curve }); };
  // hand-tuned loop, KART_TRACK_N segments total
  add(40, 0); add(30, 0.7); add(20, 0); add(30, -1.1); add(30, 0);
  add(24, 1.6); add(24, -1.6); add(28, 0); add(40, 0.5); add(20, 0);
  add(30, -0.8); add(26, 0); add(22, 2.0); add(30, 0); add(26, -0.6);
  add(30, 1.0); add(30, -1.4); // sums to exactly KART_TRACK_N
  while (kart.track.length < KART_TRACK_N) kart.track.push({ curve: 0 });
  kart.track.length = KART_TRACK_N;

  // roadside billboards — Nuggetown's finest, plus the question on everyone's mind
  const ADS = [
    ['SEEN OUR STORM?', 'NPD TIP LINE · 555-DILL'],
    ['GREASE GARAGE', 'NOW OPEN — home of FAST FOOD'],
    ['THE NUGGET ARCADE', 'FREE PLAY · OPEN 24/7'],
    ['SUDS & SPUDS', 'wash · dry · fold · 24H'],
    ['NOODLE NUG', 'slurp responsibly'],
    ['BATTER FUTURES UP 300%', 'ask us how — S.W. Holdings'],
  ];
  kart.sprites = [];
  for (let i = 0; i < 12; i++) {
    kart.sprites.push({
      kind: 'board', pz: 20 + i * 38 + (i % 3) * 7, px: i % 2 ? 2.4 : -2.4,
      msg: ADS[i % ADS.length],
    });
  }
  // chilis and the occasional golden nug, parked on the asphalt
  for (let i = 0; i < 10; i++)
    kart.sprites.push({ kind: 'chili', pz: 45 + i * 47, px: [-0.55, 0, 0.55][i % 3], taken: false });
  for (let i = 0; i < 2; i++)
    kart.sprites.push({ kind: 'gold', pz: 150 + i * 240, px: i ? -0.55 : 0.55, taken: false });

  // the BATTER tankers, riding low, headed for the Sauce Works
  kart.traffic = [];
  for (let i = 0; i < 7; i++)
    kart.traffic.push({
      pz: 30 + i * 64, px: [-0.55, 0, 0.55][i % 3],
      spd: 6 + (i % 3) * 1.2, prevRel: 99,
    });
}

function syncKart() {
  const active = kartActive();
  if (active === kart.on) return;
  kart.on = active;
  document.body.classList.toggle('kart-mode', active);
  if (active) {
    if (!kart.cv) {
      kart.cv = document.createElement('canvas');
      kart.g = kart.cv.getContext('2d');
      kartWorld.appendChild(kart.cv);
      kart.banner = document.createElement('div');
      kart.banner.className = 'kart-banner';
      kartWorld.appendChild(kart.banner);
    }
    kart.phase = 'title';
    kart.t = 0;
    kart.pos = 0; kart.dist = 0; kart.speed = 0;
    kart.playerX = 0; kart.steer = 0; kart.braking = false;
    kart.nitroT = 0; kart.chilis = 1;
    kart.spinT = 0;
    kart.timer = KART_START_SECS;
    kart.cp = 0; kart.cpNext = KART_CP_EVERY;
    kart.passes = 0;
    kart.keys = {};
    kart.distPay = 0;
    kartBuildTrack();
    kartLayout();
  } else {
    kart.banner && kart.banner.classList.remove('show');
  }
}

function kartBanner(text, cls, secs) {
  kart.banner.textContent = text;
  kart.banner.className = 'kart-banner show' + (cls ? ' ' + cls : '');
  void kart.banner.offsetWidth;
  clearTimeout(kart.bannerT);
  kart.bannerT = setTimeout(() => kart.on && kart.banner.classList.remove('show'), (secs || 1.4) * 1000);
}

// ---- flow --------------------------------------------------------------------------

function kartStartRace() {
  kart.phase = 'race';
  kart.timer = KART_START_SECS;
  kart.spinT = 0;
  kartBanner('🏁 ORDER UP — GO GO GO', 'go', 1.6);
}

function kartTimeUp() {
  kart.phase = 'timeup';
  kartBanner('⏰ TIME UP', 'over', 2.4);
}

// ---- scoring (perFlyer-scaled, like every other cabinet) -----------------------------

function kartPay(mult, label, sx, sy) {
  const worth = Math.max(1, Math.round(storm.perFlyer * mult));
  storm.caught += worth;
  if (label) spawnPopLabel(sx * kart.scale, sy * kart.scale, label + ' +' + fmt.format(worth), label.includes('✨') ? 'golden' : '');
  updateStormHud();
}

// ---- update ---------------------------------------------------------------------------

function stepKart(dt, w, h) {
  if (!kart.on) return;
  if (kart.cv.width !== Math.ceil(w / kart.scale) || kart.cv.height !== Math.ceil(h / kart.scale)) kartLayout();
  kart.t += dt;

  if (kart.phase === 'race') {
    const seg = kart.track[Math.floor(kart.pos) % KART_TRACK_N];
    const nitro = kart.nitroT > 0;
    const top = nitro ? KART_NITRO_MAX : (Math.abs(kart.playerX) > 1.05 ? KART_OFFROAD_MAX : KART_MAX);

    // auto-throttle toward top speed; ↓ brakes; off-road drags you down hard
    if (kart.spinT > 0) {
      kart.spinT -= dt;
      kart.speed = Math.max(kart.speed - 10 * dt, 3);
    } else if (kart.braking) {
      kart.speed = Math.max(0, kart.speed - 22 * dt);
    } else if (kart.speed > top) {
      kart.speed = Math.max(top, kart.speed - 14 * dt);
    } else {
      kart.speed = Math.min(top, kart.speed + (nitro ? 18 : 6.5) * dt);
    }
    if (nitro) kart.nitroT -= dt;

    // steering + the curve shoving you outward
    const sf = kart.speed / KART_MAX;
    if (kart.spinT <= 0) kart.playerX += kart.steer * dt * 2.1 * Math.min(1, sf + 0.25);
    kart.playerX -= seg.curve * sf * sf * dt * 0.62;
    kart.playerX = Math.max(-1.6, Math.min(1.6, kart.playerX));

    // advance
    const moved = kart.speed * dt;
    kart.pos = (kart.pos + moved) % KART_TRACK_N;
    kart.dist += moved;

    // distance pays the meter (nitro doubles it — hot order, hot pay)
    kart.distPay += moved * (nitro ? 2 : 1);
    if (kart.distPay >= 4) {
      const chunks = Math.floor(kart.distPay / 4);
      kart.distPay -= chunks * 4;
      storm.caught += Math.max(1, Math.round(storm.perFlyer * 3)) * chunks;
    }

    // checkpoint
    if (kart.dist >= kart.cpNext) {
      kart.cp++;
      kart.cpNext += KART_CP_EVERY;
      kart.timer += KART_CP_BONUS;
      kartPay(60, null);
      kartBanner('🏁 CHECKPOINT +' + KART_CP_BONUS + 's', 'go', 1.3);
    }

    // traffic: move, detect passes and collisions
    for (const t of kart.traffic) {
      t.pz = (t.pz + t.spd * dt) % KART_TRACK_N;
      const rel = (t.pz - kart.pos + KART_TRACK_N) % KART_TRACK_N;
      if (kart.spinT <= 0 && rel < 0.6 && Math.abs(kart.playerX - t.px) < 0.36 && kart.speed > t.spd + 1) {
        // ate the mud flaps — spin out
        kart.spinT = 1.0;
        kart.spinDir = kart.playerX > t.px ? 1 : -1;
        kart.playerX += kart.spinDir * 0.3;
        kartBanner('💥 BATTER’D!', 'over', 1.1);
      }
      if (t.prevRel < 1 && rel > KART_TRACK_N * 0.5) kart.passes++, kartPay(25, null); // clean pass
      t.prevRel = rel;
    }

    // pickups
    for (const s of kart.sprites) {
      if (s.kind === 'board' || s.taken) continue;
      const rel = (s.pz - kart.pos + KART_TRACK_N) % KART_TRACK_N;
      if (rel < 0.55 && Math.abs(kart.playerX - s.px) < 0.32) {
        s.taken = true;
        s.respawn = kart.t + 24;
        if (s.kind === 'chili') {
          kart.chilis = Math.min(kart.chilis + 1, 5);
          kartPay(10, '🌶️', kart.W / 2, kart.Hh * 0.5);
        } else {
          kartPay(100, '✨', kart.W / 2, kart.Hh * 0.5);
        }
      }
      if (s.taken && s.respawn && kart.t > s.respawn) { s.taken = false; s.respawn = 0; }
    }

    // the clock
    kart.timer -= dt;
    if (kart.timer <= 0) { kart.timer = 0; kartTimeUp(); }
  } else if (kart.phase === 'timeup') {
    kart.speed = Math.max(0, kart.speed - 8 * dt);
    kart.pos = (kart.pos + kart.speed * dt) % KART_TRACK_N;
  }

  kartDraw();
}

// ---- render ---------------------------------------------------------------------------

function kartDraw() {
  const g = kart.g, W = kart.W, Hh = kart.Hh;
  const HOR = Math.round(Hh * 0.38);
  const RW1 = W * 0.55;              // road half-width in screen px at z=1
  const camX = kart.playerX * RW1 * 0.84;
  const baseI = Math.floor(kart.pos);
  const frac = kart.pos - baseI;

  // night sky
  const sky = g.createLinearGradient(0, 0, 0, HOR);
  sky.addColorStop(0, '#05040f');
  sky.addColorStop(1, '#141034');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, HOR + 1);
  // stars
  g.fillStyle = 'rgba(220,230,255,0.5)';
  for (let i = 0; i < 24; i++) g.fillRect((i * 53 + 11) % W, (i * 29) % (HOR - 8), 1, 1);

  // project boundaries 0..KART_DRAW, accumulating curve
  const bx = [], by = [], bs = [];
  let cx = 0, cdx = -(kart.track[baseI % KART_TRACK_N].curve) * frac;
  for (let j = 0; j <= KART_DRAW; j++) {
    const z = Math.max(0.28, j + 1 - frac);
    const inv = 1 / z;
    bx.push(W / 2 + (cx - camX) * inv);
    by.push(HOR + (Hh - HOR) * inv);
    bs.push(inv);
    const seg = kart.track[(baseI + j) % KART_TRACK_N];
    cdx += seg.curve;
    cx += cdx;
  }

  // skyline parallax leans against the curve ahead
  const lean = -(bx[Math.min(12, KART_DRAW)] - W / 2) * 0.14 - kart.playerX * 6;
  g.fillStyle = '#0d0a20';
  for (let i = 0; i < 11; i++) {
    const bw = 14 + (i * 19) % 22, bh = 12 + (i * 31) % 26;
    const x = ((i * 47 + lean | 0) % (W + 60) + W + 60) % (W + 60) - 30;
    g.fillRect(x, HOR - bh, bw, bh);
  }
  g.fillStyle = '#2b2450';
  for (let i = 0; i < 26; i++) {
    const x = ((i * 37 + 5 + lean | 0) % (W + 60) + W + 60) % (W + 60) - 30;
    if ((i * 7) % 3) g.fillRect(x, HOR - 6 - (i * 13) % 22, 2, 2);
  }
  // one distant neon smudge
  g.fillStyle = 'rgba(255,47,160,0.5)';
  g.fillRect(((W * 0.7 + lean) | 0 + W) % W, HOR - 20, 8, 2);

  // ground base (past the draw distance)
  g.fillStyle = '#0b0b12';
  g.fillRect(0, HOR, W, Hh - HOR);

  // road, far → near
  for (let j = KART_DRAW - 1; j >= 0; j--) {
    const segIdx = (baseI + j) % KART_TRACK_N;
    const alt = Math.floor((segIdx) / 2) % 2;
    const x1 = bx[j], y1 = by[j], w1 = RW1 * bs[j];
    const x2 = bx[j + 1], y2 = by[j + 1], w2 = RW1 * bs[j + 1];
    if (y1 <= y2) continue; // behind the horizon rounding — skip
    // sidewalk / shoulder
    g.fillStyle = alt ? '#101018' : '#0c0c14';
    g.fillRect(0, y2, W, y1 - y2 + 1);
    // rumble strips
    g.fillStyle = alt ? '#c23a3a' : '#d8d8e0';
    kartQuad(g, x1 - w1 * 1.12, x1 + w1 * 1.12, y1, x2 - w2 * 1.12, x2 + w2 * 1.12, y2);
    // asphalt
    g.fillStyle = alt ? '#26262e' : '#2a2a34';
    kartQuad(g, x1 - w1, x1 + w1, y1, x2 - w2, x2 + w2, y2);
    // lane dashes
    if (alt) {
      g.fillStyle = '#b8b84a';
      for (const ln of [-1 / 3, 1 / 3]) {
        kartQuad(g, x1 + w1 * ln - w1 * 0.012 - 1, x1 + w1 * ln + w1 * 0.012 + 1, y1,
          x2 + w2 * ln - w2 * 0.012 - 1, x2 + w2 * ln + w2 * 0.012 + 1, y2);
      }
    }
    // wet-night sheen down the middle
    if (!alt) {
      g.fillStyle = 'rgba(120,160,220,0.05)';
      kartQuad(g, x1 - w1 * 0.2, x1 + w1 * 0.2, y1, x2 - w2 * 0.2, x2 + w2 * 0.2, y2);
    }
  }

  // sprites (billboards, pickups, tankers), far → near
  const draws = [];
  for (const s of kart.sprites) {
    if (s.taken) continue;
    const rel = (s.pz - kart.pos + KART_TRACK_N) % KART_TRACK_N;
    if (rel > 0.25 && rel < KART_DRAW - 1) draws.push({ s, rel });
  }
  for (const t of kart.traffic) {
    const rel = (t.pz - kart.pos + KART_TRACK_N) % KART_TRACK_N;
    if (rel > 0.25 && rel < KART_DRAW - 1) draws.push({ s: t, rel, tanker: true });
  }
  draws.sort((a, b) => b.rel - a.rel);
  for (const d of draws) {
    const j = Math.floor(d.rel), f = d.rel - j;
    const inv = bs[j] + (bs[j + 1] - bs[j]) * f;
    const roadX = bx[j] + (bx[j + 1] - bx[j]) * f;
    const y = by[j] + (by[j + 1] - by[j]) * f;
    const x = roadX + d.s.px * RW1 * inv;
    if (d.tanker) kartDrawTanker(g, x, y, inv);
    else if (d.s.kind === 'board') kartDrawBoard(g, x, y, inv, d.s.msg, d.s.px < 0);
    else if (d.s.kind === 'chili') kartDrawChili(g, x, y, inv);
    else kartDrawGold(g, x, y, inv);
  }

  // rain
  g.strokeStyle = 'rgba(160,190,240,0.16)';
  g.lineWidth = 1;
  g.beginPath();
  for (const r of kart.rain) {
    r.y += r.v * 0.016; r.x -= 8 * 0.016;
    if (r.y > Hh) { r.y = -4; r.x = Math.random() * W; }
    g.moveTo(r.x, r.y); g.lineTo(r.x - 1, r.y + 5);
  }
  g.stroke();

  // the player kart
  kartDrawPlayer(g, W, Hh);

  // HUD strip
  kartDrawHud(g, W, Hh);

  if (kart.phase === 'title') kartDrawTitle(g, W, Hh);
  if (kart.phase === 'timeup') kartDrawTimeUp(g, W, Hh);
}

function kartQuad(g, l1, r1, y1, l2, r2, y2) {
  g.beginPath();
  g.moveTo(l1, y1); g.lineTo(r1, y1); g.lineTo(r2, y2); g.lineTo(l2, y2);
  g.closePath(); g.fill();
}

// A BATTER tanker from behind: dark tank riding low, hazard plate, tail lights.
function kartDrawTanker(g, x, y, inv) {
  const w = 88 * inv, h = 66 * inv;
  if (w < 2) return;
  const x0 = x - w / 2, y0 = y - h;
  g.fillStyle = '#0a0a10';
  g.fillRect(x0 - w * 0.06, y - h * 0.16, w * 1.12, h * 0.16); // bumper shadow
  g.fillStyle = '#3a3630';
  g.fillRect(x0, y0, w, h * 0.86);
  g.fillStyle = '#2a2620';
  g.fillRect(x0, y0, w, h * 0.14); // tank curve shadow
  g.fillStyle = '#14141c';
  g.fillRect(x0 + w * 0.08, y - h * 0.3, w * 0.2, h * 0.16); // wheels
  g.fillRect(x0 + w * 0.72, y - h * 0.3, w * 0.2, h * 0.16);
  // hazard stripes
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? '#b8a020' : '#1a1a20';
    g.fillRect(x0 + (i / 5) * w, y - h * 0.2, w / 5 + 1, h * 0.07);
  }
  // tail lights
  g.fillStyle = '#ff3d3d';
  g.fillRect(x0 + w * 0.04, y - h * 0.28, w * 0.07, h * 0.06);
  g.fillRect(x0 + w * 0.89, y - h * 0.28, w * 0.07, h * 0.06);
  if (w > 22) {
    g.fillStyle = '#d8d0b8';
    g.font = '900 ' + Math.max(5, w * 0.14) + 'px Consolas, monospace';
    g.textAlign = 'center';
    g.fillText('BATTER', x, y0 + h * 0.5);
    if (w > 44) {
      g.font = '700 ' + Math.max(4, w * 0.07) + 'px Consolas, monospace';
      g.fillStyle = '#8a8474';
      g.fillText('S.W. LOGISTICS · non-flammable, very dippable', x, y0 + h * 0.66);
    }
  }
}

function kartDrawBoard(g, x, y, inv, msg, leftSide) {
  const w = 150 * inv, h = 64 * inv;
  if (w < 3) return;
  const x0 = x - w / 2, y0 = y - h - 40 * inv;
  g.fillStyle = '#1a1a26';
  g.fillRect(x - 2 * inv * 8, y - 40 * inv, Math.max(1, 4 * inv * 4), 40 * inv); // pole
  g.fillStyle = '#0a0a12';
  g.fillRect(x0 - w * 0.03, y0 - h * 0.05, w * 1.06, h * 1.1);
  g.fillStyle = '#141420';
  g.fillRect(x0, y0, w, h);
  if (w > 26) {
    g.textAlign = 'center';
    g.font = '900 ' + Math.max(5, w * 0.085) + 'px Consolas, monospace';
    g.fillStyle = msg[0].includes('STORM') ? '#ffe23a' : '#39ff7a';
    g.fillText(msg[0], x, y0 + h * 0.42);
    g.font = '700 ' + Math.max(4, w * 0.06) + 'px Consolas, monospace';
    g.fillStyle = '#9aa3c7';
    g.fillText(msg[1], x, y0 + h * 0.72);
  }
}

function kartDrawChili(g, x, y, inv) {
  const s = 26 * inv;
  if (s < 2) return;
  g.font = s + 'px sans-serif';
  g.textAlign = 'center';
  g.fillText('🌶️', x, y - s * 0.1);
}

function kartDrawGold(g, x, y, inv) {
  const s = 26 * inv;
  if (s < 2) return;
  const r = s * 0.4;
  const grad = g.createRadialGradient(x - r * 0.3, y - s * 0.4 - r * 0.3, r * 0.2, x, y - s * 0.4, r * 1.1);
  grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.5, '#ffd23a'); grad.addColorStop(1, '#c68a12');
  g.fillStyle = grad;
  g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rw = r * (0.85 + 0.15 * Math.sin(a * 3));
    const px = x + Math.cos(a) * rw, py = y - s * 0.4 + Math.sin(a) * rw * 0.9;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
  if (Math.sin(kart.t * 6) > 0) {
    g.fillStyle = '#fff';
    g.fillRect(x + r, y - s * 0.75, 1.5, 1.5);
  }
}

// The hero: a green kart, a nug in a helmet, and (on nitro) a very brave flame.
function kartDrawPlayer(g, W, Hh) {
  const cx = W / 2, cy = Hh - 8;
  const spin = kart.spinT > 0 ? kart.spinDir * kart.spinT * 14 : 0;
  const bump = Math.abs(kart.playerX) > 1.05 && kart.speed > 3
    ? Math.sin(kart.t * 40) * 1.6 : 0;
  const tilt = kart.spinT > 0 ? spin : kart.steer * 2.2;
  g.save();
  g.translate(cx, cy + bump);
  g.scale(1.7, 1.7); // presence: the hero reads bigger than raw sprite px
  g.rotate(tilt * 0.06);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(-17, 0, 34, 3);
  // nitro flame
  if (kart.nitroT > 0) {
    const f = 6 + Math.sin(kart.t * 46) * 3;
    g.fillStyle = '#ff8a3d';
    g.fillRect(-4, 1, 8, f);
    g.fillStyle = '#ffe23a';
    g.fillRect(-2, 1, 4, f * 0.6);
  }
  // wheels
  g.fillStyle = '#0c0c12';
  g.fillRect(-17, -7, 6, 8);
  g.fillRect(11, -7, 6, 8);
  // body
  g.fillStyle = '#0a7a3a';
  g.fillRect(-13, -9, 26, 9);
  g.fillStyle = '#39ff7a';
  g.fillRect(-13, -9, 26, 3);
  g.fillStyle = '#063f1e';
  g.fillRect(-13, -2, 26, 2);
  // spoiler
  g.fillStyle = '#0a7a3a';
  g.fillRect(-11, -13, 4, 4);
  g.fillRect(7, -13, 4, 4);
  g.fillStyle = '#39ff7a';
  g.fillRect(-12, -14, 24, 2);
  // the driver nug + helmet
  g.fillStyle = '#e8a83e';
  g.fillRect(-5, -17, 10, 8);
  g.fillStyle = '#f7cf7d';
  g.fillRect(-5, -17, 10, 2);
  g.fillStyle = '#39ff7a';
  g.fillRect(-6, -21, 12, 5); // helmet
  g.fillStyle = '#0c2c16';
  g.fillRect(-4, -17, 8, 2);  // visor
  // tail lights when braking
  if (kart.braking) {
    g.fillStyle = '#ff3d3d';
    g.fillRect(-13, -5, 3, 3);
    g.fillRect(10, -5, 3, 3);
  }
  g.restore();
}

function kartDrawHud(g, W, Hh) {
  if (kart.phase === 'title') return;
  g.textAlign = 'left';
  g.font = '900 11px Consolas, monospace';
  // the clock — goes red and blinky when it's dire
  const dire = kart.timer < 8;
  g.fillStyle = dire && Math.floor(kart.t * 3) % 2 ? '#ff3d3d' : '#eef2ff';
  g.fillText('⏱ ' + Math.ceil(kart.timer), 6, 14);
  g.fillStyle = '#39ff7a';
  g.fillText('CP ' + kart.cp, 6, 26);
  // chilis
  g.textAlign = 'right';
  g.font = '10px sans-serif';
  g.fillText('🌶️'.repeat(kart.chilis) || '·', W - 6, 14);
  // speedo
  g.font = '900 10px Consolas, monospace';
  g.fillStyle = kart.nitroT > 0 ? '#ffe23a' : '#9aa3c7';
  g.fillText(Math.round(kart.speed * 16) + ' NPH', W - 6, 26);
}

function kartDrawTitle(g, W, Hh) {
  g.fillStyle = 'rgba(4,4,12,0.62)';
  g.fillRect(0, 0, W, Hh);
  g.textAlign = 'center';
  const bob = Math.sin(kart.t * 2) * 2;
  g.font = '900 ' + Math.min(38, W * 0.11) + 'px Impact, "Arial Black", sans-serif';
  g.lineWidth = 4; g.lineJoin = 'round';
  g.strokeStyle = '#04140a';
  g.strokeText('FAST FOOD', W / 2, Hh * 0.34 + bob);
  const tg = g.createLinearGradient(0, Hh * 0.26, 0, Hh * 0.38);
  tg.addColorStop(0, '#d2ffe3'); tg.addColorStop(0.5, '#39ff7a'); tg.addColorStop(1, '#0a7a3a');
  g.fillStyle = tg;
  g.fillText('FAST FOOD', W / 2, Hh * 0.34 + bob);
  g.font = '700 10px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText('a nuggetown delivery story', W / 2, Hh * 0.42);
  g.fillStyle = '#eef2ff';
  g.fillText('← → steer · ↓ brake · SPACE nitro 🌶️', W / 2, Hh * 0.56);
  g.fillText('checkpoints feed the clock. tankers do not.', W / 2, Hh * 0.63);
  if (Math.floor(kart.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('PRESS SPACE / TAP — DELIVER', W / 2, Hh * 0.76);
  }
}

function kartDrawTimeUp(g, W, Hh) {
  g.fillStyle = 'rgba(10,2,2,0.55)';
  g.fillRect(0, 0, W, Hh);
  g.textAlign = 'center';
  g.font = '900 ' + Math.min(30, W * 0.09) + 'px Impact, "Arial Black", sans-serif';
  g.fillStyle = '#ff3d3d';
  g.fillText('TIME UP', W / 2, Hh * 0.4);
  g.font = '700 10px Consolas, monospace';
  g.fillStyle = '#eef2ff';
  g.fillText('the order went cold. the meter didn\'t.', W / 2, Hh * 0.5);
  if (Math.floor(kart.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('X / TAP — BACK ON THE THROTTLE', W / 2, Hh * 0.62);
  }
}

// ---- input -----------------------------------------------------------------------------

function kartNitro() {
  if (kart.phase !== 'race' || kart.chilis <= 0 || kart.nitroT > 0 || kart.spinT > 0) return;
  kart.chilis--;
  kart.nitroT = KART_NITRO_SECS;
  kartBanner('🌶️ NITRO', 'go', 0.8);
}

function kartPress(code) {
  if (kart.phase === 'title' &&
    (code === 'Space' || code === 'Enter' || code === 'KeyX' || code === 'ArrowLeft' || code === 'ArrowRight')) {
    kartStartRace();
    return true;
  }
  if (kart.phase === 'timeup' && (code === 'KeyX' || code === 'Space' || code === 'Enter')) {
    kartStartRace();
    return true;
  }
  if (kart.phase !== 'race') return false;
  if (code === 'ArrowLeft' || code === 'KeyA') { kart.keys.l = true; return true; }
  if (code === 'ArrowRight' || code === 'KeyD') { kart.keys.r = true; return true; }
  if (code === 'ArrowDown' || code === 'KeyS') { kart.braking = true; return true; }
  if (code === 'Space') { kartNitro(); return true; }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (!kartActive()) return;
  if (kartPress(e.code)) e.preventDefault();
  kart.steer = (kart.keys.l ? -1 : 0) + (kart.keys.r ? 1 : 0);
});

window.addEventListener('keyup', (e) => {
  if (!kart.on) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') kart.keys.l = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') kart.keys.r = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') kart.braking = false;
  kart.steer = (kart.keys.l ? -1 : 0) + (kart.keys.r ? 1 : 0);
});

// touch / mouse: hold left/right half to steer, tap center to nitro (or start)
function kartPointer(x, down) {
  if (!kartActive()) return;
  if (!down) { kart.steer = 0; return; }
  if (kart.phase !== 'race') { kartPress('Space'); return; }
  const t = x / window.innerWidth;
  if (t < 0.38) kart.steer = -1;
  else if (t > 0.62) kart.steer = 1;
  else { kart.steer = 0; kartNitro(); }
}
kartWorld.addEventListener('mousedown', (e) => kartPointer(e.clientX, true));
window.addEventListener('mouseup', () => kart.on && kartPointer(0, false));
kartWorld.addEventListener('touchstart', (e) => { kartPointer(e.touches[0].clientX, true); e.preventDefault(); }, { passive: false });
kartWorld.addEventListener('touchmove', (e) => { kartPointer(e.touches[0].clientX, true); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend', () => kart.on && kartPointer(0, false));
