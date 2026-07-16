// ---- GRAND THEFT NUGGET ------------------------------------------------------------
// "WELCOME TO NUGGETOWN. POPULATION: CRISPY."
//
// A top-down open-world crime game in the GTA 1/2 mold (mode key: gta).
// Sprint 1 (IGNITION): one drivable district of Nuggetown after dark — seeded
// tile city, arcade car physics with a real handbrake, headlights, rain,
// street lamps, neon, nug-crate pickups, and distance pay. The syndicate,
// the NPD, and the rest of the city arrive in later sprints (see GTA_SPRINTS.md).
//
// Rendering is the low-res pixel canvas trick from Battered Brawlers / Fast
// Food: a ~300px-tall backing store scaled up with image-rendering: pixelated.
// The camera is north-up with velocity look-ahead; the car rotates, the city
// doesn't. Scoring mirrors the other games: crates, golden nugs, and distance
// pay perFlyer-scaled $$$ into storm.caught (golden 10x territory).

const gtaWorld = document.getElementById('gtaWorld');

const GTA_TILE = 24;              // world px per tile
const GTA_W = 96, GTA_H = 96;     // starter district, tiles (sprint 2 grows this)
const GTA_MAX_FWD = 210;          // top speed, world px/sec
const GTA_MAX_REV = 80;
const GTA_ACCEL = 150;
const GTA_BRAKE = 300;
const GTA_DRAG = 0.55;            // /sec, rolling resistance
const GTA_GRIP = 7.5;             // /sec, lateral velocity kill (tires holding)
const GTA_DRIFT_GRIP = 1.5;       // /sec, lateral kill with the handbrake down
const GTA_STEER = 3.1;            // rad/sec at speed
const GTA_CAR_R = 7;              // collision radius vs buildings

// Tile kinds
const GT_BLDG = 0, GT_ROAD = 1, GT_WALK = 2, GT_GRASS = 3;

const gta = {
  on: false,
  cv: null, g: null, banner: null,
  W: 0, Hh: 0, scale: 1,
  phase: 'title',        // title | play
  t: 0,
  map: null,             // Uint8Array GTA_W * GTA_H
  vRoad: null, hRoad: null, vDash: null, hDash: null,
  blockCol: null,        // per-block rooftop palette index
  car: { x: 0, y: 0, a: -Math.PI / 2, vx: 0, vy: 0 },
  cam: { x: 0, y: 0 },
  keys: {},
  handbrake: false,
  pickups: [],           // {c, r, gold, taken, respawn}
  skids: [],             // ring buffer of {x, y, a, life}
  crates: 0,
  dist: 0, distPay: 0,
  toastT: 0, toastMsg: '',
  rain: [],
};

function gtaActive() {
  return storm.mode === 'gta' && storm.running;
}

function gtaTally() {
  if (gta.phase === 'title') return '"welcome to nuggetown"';
  const spd = Math.round(Math.hypot(gta.car.vx, gta.car.vy) * 0.6);
  return '📦 ' + gta.crates + ' · ' + spd + ' NPH · DOWNTOWN';
}

// ---- city generation (seeded — everyone drives the same Nuggetown) -------------------

function gtaHash(c, r) {
  let h = (c * 73856093) ^ (r * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

const GTA_ROOFS = ['#191627', '#1d1a2e', '#221c2c', '#1a2030', '#241f26', '#171e2a'];
const GTA_NEON = ['#ff2fa0', '#39ff7a', '#3ad4ff', '#ffe23a', '#ff8a3d'];

function gtaBuildCity() {
  let seed = 20260715; // Nuggetown zoning committee, do not touch
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // Road lines: pairs of columns/rows, uneven seeded spacing, plus a ring road.
  const vr = [2], hr = [2];
  let c = 10 + Math.floor(rnd() * 4);
  while (c < GTA_W - 8) { vr.push(c); c += 9 + Math.floor(rnd() * 6); }
  vr.push(GTA_W - 4);
  let r = 9 + Math.floor(rnd() * 4);
  while (r < GTA_H - 7) { hr.push(r); r += 8 + Math.floor(rnd() * 5); }
  hr.push(GTA_H - 4);

  gta.vRoad = new Uint8Array(GTA_W);
  gta.hRoad = new Uint8Array(GTA_H);
  gta.vDash = new Uint8Array(GTA_W); // the second column of each pair carries the dash line
  gta.hDash = new Uint8Array(GTA_H);
  for (const v of vr) { gta.vRoad[v] = 1; gta.vRoad[v + 1] = 1; gta.vDash[v + 1] = 1; }
  for (const h of hr) { gta.hRoad[h] = 1; gta.hRoad[h + 1] = 1; gta.hDash[h + 1] = 1; }

  // Park blocks + rooftop colors, keyed by coarse block index.
  const BX = Math.ceil(GTA_W / 10), BY = Math.ceil(GTA_H / 9);
  const park = [];
  gta.blockCol = [];
  for (let i = 0; i < BX * BY; i++) {
    park.push(rnd() < 0.11);
    gta.blockCol.push(Math.floor(rnd() * GTA_ROOFS.length));
  }
  const blockAt = (tc, tr) => Math.floor(tc / 10) + Math.floor(tr / 9) * BX;

  const map = new Uint8Array(GTA_W * GTA_H);
  const road = (tc, tr) => gta.vRoad[tc] || gta.hRoad[tr];
  for (let tr = 0; tr < GTA_H; tr++) {
    for (let tc = 0; tc < GTA_W; tc++) {
      let k;
      if (road(tc, tr)) k = GT_ROAD;
      else if (road(tc - 1, tr) || road(tc + 1, tr) || road(tc, tr - 1) || road(tc, tr + 1)) k = GT_WALK;
      else k = park[blockAt(tc, tr)] ? GT_GRASS : GT_BLDG;
      map[tr * GTA_W + tc] = k;
    }
  }
  gta.map = map;

  // Pickups: nug crates on random road tiles, a few golden nugs way out there.
  gta.pickups = [];
  let placed = 0, guard = 0;
  while (placed < 42 && guard++ < 4000) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (map[tr * GTA_W + tc] !== GT_ROAD) continue;
    gta.pickups.push({ c: tc, r: tr, gold: false, taken: false, respawn: 0 });
    placed++;
  }
  for (let i = 0; i < 6 && guard < 8000; guard++) {
    const tc = Math.floor(rnd() * GTA_W), tr = Math.floor(rnd() * GTA_H);
    if (map[tr * GTA_W + tc] !== GT_ROAD) continue;
    gta.pickups.push({ c: tc, r: tr, gold: true, taken: false, respawn: 0 });
    i++;
  }

  // Spawn on the middle vertical road, pointed north, engine idling.
  const vm = vr[Math.floor(vr.length / 2)];
  const hm = hr[Math.floor(hr.length / 2)];
  gta.car.x = (vm + 1) * GTA_TILE;
  gta.car.y = (hm + 1) * GTA_TILE;
  gta.car.a = -Math.PI / 2;
  gta.car.vx = 0; gta.car.vy = 0;
  gta.cam.x = gta.car.x; gta.cam.y = gta.car.y;
}

function gtaTile(tc, tr) {
  if (tc < 0 || tr < 0 || tc >= GTA_W || tr >= GTA_H) return GT_BLDG; // city limits are solid
  return gta.map[tr * GTA_W + tc];
}

function gtaSolidAt(x, y) {
  return gtaTile(Math.floor(x / GTA_TILE), Math.floor(y / GTA_TILE)) === GT_BLDG;
}

// ---- setup ---------------------------------------------------------------------------

function gtaLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  gta.scale = Math.max(2, Math.floor(vh / 300)); // world is ~300px tall
  gta.W = Math.ceil(vw / gta.scale);
  gta.Hh = Math.ceil(vh / gta.scale);
  gta.cv.width = gta.W;
  gta.cv.height = gta.Hh;
  gta.g.imageSmoothingEnabled = false;
  gta.rain = [];
  for (let i = 0; i < 36; i++)
    gta.rain.push({ x: Math.random() * gta.W, y: Math.random() * gta.Hh, v: 100 + Math.random() * 70 });
}

function syncGta() {
  const active = gtaActive();
  if (active === gta.on) return;
  gta.on = active;
  document.body.classList.toggle('gta-mode', active);
  if (active) {
    if (!gta.cv) {
      gta.cv = document.createElement('canvas');
      gta.g = gta.cv.getContext('2d');
      gtaWorld.appendChild(gta.cv);
      gta.banner = document.createElement('div');
      gta.banner.className = 'gta-banner';
      gtaWorld.appendChild(gta.banner);
    }
    gta.phase = 'title';
    gta.t = 0;
    gta.keys = {};
    gta.handbrake = false;
    gta.skids = [];
    gta.crates = 0;
    gta.dist = 0; gta.distPay = 0;
    gta.toastT = 0;
    gtaBuildCity();
    gtaLayout();
  } else {
    gta.banner && gta.banner.classList.remove('show');
  }
}

function gtaBanner(text, cls, secs) {
  gta.banner.textContent = text;
  gta.banner.className = 'gta-banner show' + (cls ? ' ' + cls : '');
  void gta.banner.offsetWidth;
  clearTimeout(gta.bannerT);
  gta.bannerT = setTimeout(() => gta.on && gta.banner.classList.remove('show'), (secs || 1.4) * 1000);
}

function gtaStart() {
  gta.phase = 'play';
  gta.toastMsg = 'DOWNTOWN · NUGGETOWN';
  gta.toastT = 3.2;
  gtaBanner('🌃 NUGGETOWN', 'go', 1.8);
}

// ---- scoring (perFlyer-scaled, like every other game) ---------------------------------

function gtaPay(mult, label, sx, sy) {
  const worth = Math.max(1, Math.round(storm.perFlyer * mult));
  storm.caught += worth;
  if (label) spawnPopLabel(sx * gta.scale, sy * gta.scale, label + ' +' + fmt.format(worth), label.includes('✨') ? 'golden' : '');
  updateStormHud();
}

// ---- update ---------------------------------------------------------------------------

function stepGta(dt, w, h) {
  if (!gta.on) return;
  if (gta.cv.width !== Math.ceil(w / gta.scale) || gta.cv.height !== Math.ceil(h / gta.scale)) gtaLayout();
  gta.t += dt;

  if (gta.phase === 'play') {
    const car = gta.car;
    const cos = Math.cos(car.a), sin = Math.sin(car.a);

    // Decompose velocity into forward + lateral components.
    let vf = car.vx * cos + car.vy * sin;
    let vl = -car.vx * sin + car.vy * cos;

    // Throttle / brake / reverse
    const gas = (gta.keys.up ? 1 : 0), rev = (gta.keys.down ? 1 : 0);
    if (gas) vf = Math.min(GTA_MAX_FWD, vf + GTA_ACCEL * dt);
    if (rev) {
      if (vf > 8) vf = Math.max(0, vf - GTA_BRAKE * dt);        // rolling: brake first
      else vf = Math.max(-GTA_MAX_REV, vf - GTA_ACCEL * 0.7 * dt); // then back up
    }
    // Handbrake locks the rears: hard forward scrub, loose rear end.
    if (gta.handbrake) vf *= Math.exp(-2.6 * dt);
    vf *= Math.exp(-GTA_DRAG * dt);
    vl *= Math.exp(-(gta.handbrake ? GTA_DRIFT_GRIP : GTA_GRIP) * dt);

    // Steering scales with speed (no curb-parked pirouettes), flips in reverse.
    const steer = (gta.keys.left ? -1 : 0) + (gta.keys.right ? 1 : 0);
    const sf = Math.max(-1, Math.min(1, vf / 90));
    car.a += steer * GTA_STEER * sf * dt;

    // Recompose with the new heading — this is what makes the tail come around.
    const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
    car.vx = c2 * vf - s2 * vl;
    car.vy = s2 * vf + c2 * vl;

    // Skid marks while the rear is stepping out.
    if (Math.abs(vl) > 26 || (gta.handbrake && Math.abs(vf) > 40)) {
      gta.skids.push({ x: car.x - c2 * 6, y: car.y - s2 * 6, a: car.a, life: 4 });
      if (gta.skids.length > 220) gta.skids.shift();
    }

    // Axis-separated movement vs building tiles: cheap, stable, arcade-honest.
    const nx = car.x + car.vx * dt;
    if (gtaSolidAt(nx + Math.sign(car.vx) * GTA_CAR_R, car.y - GTA_CAR_R * 0.6) ||
        gtaSolidAt(nx + Math.sign(car.vx) * GTA_CAR_R, car.y + GTA_CAR_R * 0.6)) {
      car.vx *= -0.22; // crunch
    } else car.x = nx;
    const ny = car.y + car.vy * dt;
    if (gtaSolidAt(car.x - GTA_CAR_R * 0.6, ny + Math.sign(car.vy) * GTA_CAR_R) ||
        gtaSolidAt(car.x + GTA_CAR_R * 0.6, ny + Math.sign(car.vy) * GTA_CAR_R)) {
      car.vy *= -0.22;
    } else car.y = ny;

    // Distance pays the meter (crime does pay, slightly, per block).
    const moved = Math.hypot(car.vx, car.vy) * dt;
    gta.dist += moved;
    gta.distPay += moved;
    if (gta.distPay >= 44) {
      const chunks = Math.floor(gta.distPay / 44);
      gta.distPay -= chunks * 44;
      storm.caught += Math.max(1, Math.round(storm.perFlyer * 2)) * chunks;
    }

    // Pickups: drive over a crate, it's yours. That's the law here.
    for (const p of gta.pickups) {
      if (p.taken) {
        if (gta.t > p.respawn) p.taken = false;
        continue;
      }
      const px = (p.c + 0.5) * GTA_TILE, py = (p.r + 0.5) * GTA_TILE;
      if (Math.abs(car.x - px) < 11 && Math.abs(car.y - py) < 11) {
        p.taken = true;
        p.respawn = gta.t + 26;
        if (p.gold) gtaPay(120, '✨', gta.W / 2, gta.Hh * 0.42);
        else { gta.crates++; gtaPay(12, '📦', gta.W / 2, gta.Hh * 0.42); }
      }
    }

    for (const s of gta.skids) s.life -= dt;
    while (gta.skids.length && gta.skids[0].life <= 0) gta.skids.shift();

    // Camera: chase with velocity look-ahead so you see where you're going.
    const lookX = car.x + car.vx * 0.42, lookY = car.y + car.vy * 0.42;
    gta.cam.x += (lookX - gta.cam.x) * Math.min(1, 4.2 * dt);
    gta.cam.y += (lookY - gta.cam.y) * Math.min(1, 4.2 * dt);

    if (gta.toastT > 0) gta.toastT -= dt;
  }

  gtaDraw();
}

// ---- render ---------------------------------------------------------------------------

function gtaDraw() {
  const g = gta.g, W = gta.W, Hh = gta.Hh, T = GTA_TILE;
  const ox = Math.round(gta.cam.x - W / 2), oy = Math.round(gta.cam.y - Hh / 2);

  // City tiles, only what's on screen.
  const c0 = Math.floor(ox / T) - 1, c1 = Math.floor((ox + W) / T) + 1;
  const r0 = Math.floor(oy / T) - 1, r1 = Math.floor((oy + Hh) / T) + 1;
  for (let tr = r0; tr <= r1; tr++) {
    for (let tc = c0; tc <= c1; tc++) {
      const x = tc * T - ox, y = tr * T - oy;
      const k = gtaTile(tc, tr);
      const hsh = gtaHash(tc, tr);
      if (k === GT_ROAD) {
        g.fillStyle = ((tc + tr) & 1) ? '#232330' : '#26262e';
        g.fillRect(x, y, T, T);
        // wet-night sheen streak
        if (hsh % 9 === 0) { g.fillStyle = 'rgba(120,160,220,0.05)'; g.fillRect(x, y + 4, T, 6); }
        // lane dashes down the middle of each 2-wide road (not at crossings)
        const crossing = gta.vRoad[tc] && gta.hRoad[tr];
        if (!crossing) {
          g.fillStyle = '#8a8a3a';
          if (gta.vDash[tc] && gta.vRoad[tc] && (tr & 1) === 0) g.fillRect(x, y + 3, 2, T - 10);
          if (gta.hDash[tr] && gta.hRoad[tr] && (tc & 1) === 0) g.fillRect(x + 3, y, T - 10, 2);
        }
      } else if (k === GT_WALK) {
        g.fillStyle = ((tc + tr) & 1) ? '#33333e' : '#303039';
        g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T); // pavement seams
      } else if (k === GT_GRASS) {
        g.fillStyle = ((tc + tr) & 1) ? '#122016' : '#101c14';
        g.fillRect(x, y, T, T);
        if (hsh % 5 === 0) { // a tree at night is just a rounder shadow
          g.fillStyle = '#0a140d';
          g.beginPath(); g.arc(x + T / 2, y + T / 2, 8, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#0f1a11';
          g.beginPath(); g.arc(x + T / 2 - 2, y + T / 2 - 2, 5, 0, Math.PI * 2); g.fill();
        }
      } else {
        // rooftops — this is a top-down city, buildings are lids
        const BX = Math.ceil(GTA_W / 10);
        const bi = (tc >= 0 && tr >= 0 && tc < GTA_W && tr < GTA_H)
          ? gta.blockCol[Math.floor(tc / 10) + Math.floor(tr / 9) * BX] : 0;
        g.fillStyle = GTA_ROOFS[bi];
        g.fillRect(x, y, T, T);
        // roof edge light where the roof meets a walkable tile (streetlight spill)
        g.fillStyle = 'rgba(255,255,255,0.05)';
        if (gtaTile(tc, tr - 1) !== GT_BLDG) g.fillRect(x, y, T, 2);
        if (gtaTile(tc - 1, tr) !== GT_BLDG) g.fillRect(x, y, 2, T);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        if (gtaTile(tc, tr + 1) !== GT_BLDG) g.fillRect(x, y + T - 2, T, 2);
        if (gtaTile(tc + 1, tr) !== GT_BLDG) g.fillRect(x + T - 2, y, 2, T);
        if (hsh % 7 === 0) { // AC unit / vent
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(x + 5 + (hsh % 8), y + 6 + (hsh % 6), 6, 5);
        }
        // street-facing neon: a strip of color bleeding onto the sidewalk
        if (hsh % 11 === 0) {
          const neon = GTA_NEON[hsh % GTA_NEON.length];
          g.fillStyle = neon;
          if (gtaTile(tc, tr + 1) === GT_WALK) {
            g.fillRect(x + 4, y + T - 2, T - 8, 2);
            g.globalAlpha = 0.14; g.fillRect(x + 2, y + T, T - 4, 7); g.globalAlpha = 1;
          } else if (gtaTile(tc, tr - 1) === GT_WALK) {
            g.fillRect(x + 4, y, T - 8, 2);
            g.globalAlpha = 0.14; g.fillRect(x + 2, y - 7, T - 4, 7); g.globalAlpha = 1;
          }
        }
      }
      // street lamps pool light on intersections
      if (k === GT_ROAD && gta.vRoad[tc] && gta.hRoad[tr] && hsh % 4 === 0) {
        const lg = g.createRadialGradient(x + T / 2, y + T / 2, 2, x + T / 2, y + T / 2, T * 1.1);
        lg.addColorStop(0, 'rgba(255,220,140,0.13)');
        lg.addColorStop(1, 'rgba(255,220,140,0)');
        g.fillStyle = lg;
        g.fillRect(x - T, y - T, T * 3, T * 3);
      }
    }
  }

  // Skid marks under everything that moves.
  g.fillStyle = 'rgba(8,8,12,0.5)';
  for (const s of gta.skids) {
    if (s.life <= 0) continue;
    g.globalAlpha = Math.min(0.5, s.life / 6);
    const px = s.x - ox, py = s.y - oy;
    const wx = Math.cos(s.a + Math.PI / 2) * 3, wy = Math.sin(s.a + Math.PI / 2) * 3;
    g.fillRect(px + wx - 1, py + wy - 1, 2, 2);
    g.fillRect(px - wx - 1, py - wy - 1, 2, 2);
  }
  g.globalAlpha = 1;

  // Pickups
  for (const p of gta.pickups) {
    if (p.taken) continue;
    const px = (p.c + 0.5) * T - ox, py = (p.r + 0.5) * T - oy;
    if (px < -20 || px > W + 20 || py < -20 || py > Hh + 20) continue;
    if (p.gold) {
      const r = 4 + Math.sin(gta.t * 5) * 0.7;
      const grad = g.createRadialGradient(px - 1, py - 1, 1, px, py, r + 3);
      grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.6, '#ffd23a'); grad.addColorStop(1, 'rgba(198,138,18,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(px, py, r + 3, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#6b4a26';
      g.fillRect(px - 5, py - 5, 10, 10);
      g.fillStyle = '#8a6236';
      g.fillRect(px - 5, py - 5, 10, 2);
      g.fillStyle = '#3f2b15';
      g.fillRect(px - 1, py - 5, 2, 10);
      g.fillRect(px - 5, py - 1, 10, 2);
    }
  }

  // Headlights before the car so the beams sit under the body.
  if (gta.phase === 'play') {
    const car = gta.car;
    const cx = car.x - ox, cy = car.y - oy;
    const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
    g.fillStyle = 'rgba(255,240,190,0.10)';
    for (const side of [-1, 1]) {
      const hx = cx + c2 * 8 + -s2 * side * 3, hy = cy + s2 * 8 + c2 * side * 3;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(hx + c2 * 34 - s2 * (side * 3 + 9), hy + s2 * 34 + c2 * (side * 3 + 9));
      g.lineTo(hx + c2 * 34 - s2 * (side * 3 - 9), hy + s2 * 34 + c2 * (side * 3 - 9));
      g.closePath(); g.fill();
    }
  }

  gtaDrawCar(g, ox, oy);

  // Rain, screen space, always slanting the same way — Nuggetown weather.
  g.strokeStyle = 'rgba(160,190,240,0.15)';
  g.lineWidth = 1;
  g.beginPath();
  for (const r of gta.rain) {
    r.y += r.v * 0.016; r.x -= 9 * 0.016;
    if (r.y > Hh) { r.y = -5; r.x = Math.random() * W; }
    g.moveTo(r.x, r.y); g.lineTo(r.x - 1.5, r.y + 6);
  }
  g.stroke();

  gtaDrawHud(g, W, Hh);
  if (gta.phase === 'title') gtaDrawTitle(g, W, Hh);
}

// The hero car: a boosted Nuggetown compact. Drawn nose-up, rotated to heading.
function gtaDrawCar(g, ox, oy) {
  const car = gta.car;
  g.save();
  g.translate(car.x - ox, car.y - oy);
  g.rotate(car.a + Math.PI / 2);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(-6, -10, 12, 21);
  // wheels
  g.fillStyle = '#0c0c12';
  g.fillRect(-6, -8, 2, 4); g.fillRect(4, -8, 2, 4);
  g.fillRect(-6, 4, 2, 4); g.fillRect(4, 4, 2, 4);
  // body
  g.fillStyle = '#c23a3a';
  g.fillRect(-5, -9, 10, 18);
  g.fillStyle = '#e05252';
  g.fillRect(-5, -9, 10, 3); // hood shine
  // windshield + roof + rear glass
  g.fillStyle = '#101522';
  g.fillRect(-4, -4, 8, 3);
  g.fillStyle = '#8a2a2a';
  g.fillRect(-4, -1, 8, 5);
  g.fillStyle = '#101522';
  g.fillRect(-4, 4, 8, 2);
  // headlights
  g.fillStyle = '#ffe9a0';
  g.fillRect(-4, -9, 2, 1); g.fillRect(2, -9, 2, 1);
  // taillights (bright under braking/reverse)
  g.fillStyle = (gta.keys.down || gta.handbrake) ? '#ff5252' : '#7a1d1d';
  g.fillRect(-4, 8, 2, 1); g.fillRect(2, 8, 2, 1);
  g.restore();
}

function gtaDrawHud(g, W, Hh) {
  if (gta.phase !== 'play') return;
  const spd = Math.round(Math.hypot(gta.car.vx, gta.car.vy) * 0.6);
  g.textAlign = 'right';
  g.font = '900 10px Consolas, monospace';
  g.fillStyle = gta.handbrake ? '#ffe23a' : '#9aa3c7';
  g.fillText(spd + ' NPH', W - 6, Hh - 8);
  g.textAlign = 'left';
  g.fillStyle = '#39ff7a';
  g.fillText('📦 ' + gta.crates, 6, Hh - 8);
  // district toast
  if (gta.toastT > 0) {
    g.globalAlpha = Math.min(1, gta.toastT);
    g.textAlign = 'center';
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#eef2ff';
    g.fillText(gta.toastMsg, W / 2, 18);
    g.globalAlpha = 1;
  }
}

function gtaDrawTitle(g, W, Hh) {
  g.fillStyle = 'rgba(4,4,12,0.66)';
  g.fillRect(0, 0, W, Hh);
  // GTA-style logo card: white plate, black frame, stacked type
  const pw = Math.min(190, W * 0.6), ph = 64;
  const px = W / 2 - pw / 2, py = Hh * 0.22;
  g.fillStyle = '#0a0a12';
  g.fillRect(px - 3, py - 3, pw + 6, ph + 6);
  g.fillStyle = '#eef2ff';
  g.fillRect(px, py, pw, ph);
  g.textAlign = 'center';
  g.fillStyle = '#0a0a12';
  g.font = 'italic 900 13px Georgia, "Times New Roman", serif';
  g.fillText('GRAND THEFT', W / 2, py + 20);
  g.font = 'italic 900 30px Georgia, "Times New Roman", serif';
  g.fillText('NUGGET', W / 2, py + 50);
  g.font = '700 10px Consolas, monospace';
  g.fillStyle = '#9aa3c7';
  g.fillText('welcome to nuggetown. population: crispy.', W / 2, Hh * 0.56);
  g.fillStyle = '#eef2ff';
  g.fillText('↑↓ drive · ← → steer · SPACE handbrake', W / 2, Hh * 0.64);
  if (Math.floor(gta.t * 2.2) % 2 === 0) {
    g.font = '900 12px Consolas, monospace';
    g.fillStyle = '#ffe23a';
    g.fillText('PRESS SPACE / TAP — BOOST IT', W / 2, Hh * 0.78);
  }
}

// ---- input -----------------------------------------------------------------------------

function gtaPress(code) {
  if (gta.phase === 'title' &&
    (code === 'Space' || code === 'Enter' || code === 'KeyX' ||
     code === 'ArrowUp' || code === 'KeyW')) {
    gtaStart();
    return true;
  }
  if (gta.phase !== 'play') return false;
  if (code === 'ArrowUp' || code === 'KeyW') { gta.keys.up = true; return true; }
  if (code === 'ArrowDown' || code === 'KeyS') { gta.keys.down = true; return true; }
  if (code === 'ArrowLeft' || code === 'KeyA') { gta.keys.left = true; return true; }
  if (code === 'ArrowRight' || code === 'KeyD') { gta.keys.right = true; return true; }
  if (code === 'Space') { gta.handbrake = true; return true; }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (!gtaActive()) return;
  if (gtaPress(e.code)) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if (!gta.on) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') gta.keys.up = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') gta.keys.down = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') gta.keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') gta.keys.right = false;
  if (e.code === 'Space') gta.handbrake = false;
});

// touch / mouse: hold to drive, left/right thirds steer, second finger = handbrake
function gtaPointer(x, down) {
  if (!gtaActive()) return;
  if (!down) { gta.keys.up = false; gta.keys.left = false; gta.keys.right = false; return; }
  if (gta.phase !== 'play') { gtaPress('Space'); return; }
  gta.keys.up = true;
  const t = x / window.innerWidth;
  gta.keys.left = t < 0.38;
  gta.keys.right = t > 0.62;
}
gtaWorld.addEventListener('mousedown', (e) => gtaPointer(e.clientX, true));
window.addEventListener('mouseup', () => gta.on && gtaPointer(0, false));
gtaWorld.addEventListener('touchstart', (e) => {
  gta.handbrake = e.touches.length > 1;
  gtaPointer(e.touches[0].clientX, true);
  e.preventDefault();
}, { passive: false });
gtaWorld.addEventListener('touchmove', (e) => { gtaPointer(e.touches[0].clientX, true); e.preventDefault(); }, { passive: false });
window.addEventListener('touchend', (e) => {
  if (!gta.on) return;
  gta.handbrake = e.touches.length > 1;
  if (e.touches.length === 0) gtaPointer(0, false);
});
