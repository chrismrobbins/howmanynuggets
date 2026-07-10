// Blaster — co-op multiplayer, matching the single-player game mechanics:
// cannons shoot travelling bolts, power-up crates drop (⚡ rapid fire, 🔱 triple
// shot, 🛡️ team city shield), everyone defends one shared city, golden nuggets
// pay 10x, and the city rebuilds after it's flattened. Server-authoritative in a
// fixed 1280x720 virtual world so every client agrees.

const WORLD_W = 1280;
const WORLD_H = 720;
const CITY_BUILDINGS = 7;
const BUILDING_HP = 3;
const NUGGET_SIZE = 48;
const NUGGET_FALL = 150;        // world px/s base fall speed
const GOLDEN_CHANCE = 0.02;
const GOLDEN_MULT = 10;
const SPAWN_BASE = 1.15;        // s between nugget spawns early on
const SPAWN_MIN = 0.35;
const BOLT_SPEED = 950;         // world px/s upward
const FIRE_COOLDOWN = 0.16;     // s between shots
const RAPID_COOLDOWN = 0.06;    // ...with ⚡ rapid fire
const POWERUP_DURATION = 8;     // s a power-up lasts
const CITY_REBUILD_SECS = 3;
const DROP_SPEED = 110;         // crate fall speed
const DROP_MIN_GAP = 7;         // s between crates
const DROP_MAX_GAP = 13;
const SHIELD_HEIGHT = 170;      // shield line height above the bottom
const TRIPLE_SPREAD = [-150, 0, 150];
const POWER_KINDS = ['rapid', 'triple', 'shield'];

export class BlasterGame {
  static maxPlayers = 4;

  constructor(room) {
    this.room = room;
    this.nuggets = [];
    this.bolts = [];
    this.crates = [];
    this.city = [];
    this.cannons = new Map();   // playerId -> { x, name, cd, power:{kind,t}|null }
    this.spawnT = 0;
    this.dropT = 4;             // first crate shows up quickly
    this.elapsed = 0;
    this.waves = 0;
    this.rebuildT = 0;
    this.shieldT = 0;          // team-wide shield timer
    this.nid = 1; this.bid = 1; this.cid = 1;
  }

  onStart(players) {
    this.buildCity();
    const n = players.length;
    players.forEach((p, i) => {
      const frac = n === 1 ? 0.5 : 0.15 + 0.7 * (i / (n - 1));
      this.cannons.set(p.id, { x: WORLD_W * frac, name: p.name, cd: 0, power: null });
    });
  }

  onPlayerJoin(pid, player) {
    if (this.cannons.has(pid)) return;
    this.cannons.set(pid, { x: WORLD_W * (0.2 + 0.6 * this.room.rand()), name: player.name, cd: 0, power: null });
  }

  onPlayerLeave(pid) { this.cannons.delete(pid); }

  onInput(pid, msg) {
    const c = this.cannons.get(pid);
    if (!c) return;
    if (msg.t === 'input' && typeof msg.x === 'number') {
      c.x = Math.max(0, Math.min(WORLD_W, msg.x));
    } else if (msg.t === 'fire') {
      this.fire(pid);
    }
  }

  fire(pid) {
    const c = this.cannons.get(pid);
    if (!c || c.cd > 0) return;
    c.cd = (c.power && c.power.kind === 'rapid') ? RAPID_COOLDOWN : FIRE_COOLDOWN;
    const spread = (c.power && c.power.kind === 'triple') ? TRIPLE_SPREAD : [0];
    const by = WORLD_H - 46;
    for (const vx of spread) this.bolts.push({ id: this.bid++, x: c.x, y: by, vx, owner: pid });
  }

  buildCity() {
    this.city = [];
    const slot = WORLD_W / CITY_BUILDINGS;
    for (let i = 0; i < CITY_BUILDINGS; i++) {
      const bw = slot * (0.55 + this.room.rand() * 0.3);
      const bx = i * slot + (slot - bw) / 2;
      const bh = 70 + this.room.rand() * 90;
      this.city.push({ x: bx, w: bw, h: bh, hp: BUILDING_HP });
    }
  }

  activate(owner, kind) {
    if (kind === 'shield') {
      this.shieldT = POWERUP_DURATION;
    } else {
      const c = this.cannons.get(owner);
      if (c) c.power = { kind, t: POWERUP_DURATION };
    }
    this.room.event({ kind: 'power', power: kind, by: owner });
  }

  tick(dtMs) {
    const dt = dtMs / 1000;
    this.elapsed += dt;

    if (this.rebuildT > 0) { this.rebuildT -= dt; if (this.rebuildT <= 0) this.buildCity(); }
    if (this.shieldT > 0) this.shieldT -= dt;
    for (const c of this.cannons.values()) {
      if (c.cd > 0) c.cd -= dt;
      if (c.power) { c.power.t -= dt; if (c.power.t <= 0) c.power = null; }
    }

    // spawn nuggets
    const players = Math.max(1, this.cannons.size);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.rebuildT <= 0) {
      this.nuggets.push({ id: this.nid++, x: 40 + this.room.rand() * (WORLD_W - 80), y: -30, golden: this.room.rand() < GOLDEN_CHANCE, dead: false });
      const ramp = Math.min(this.elapsed / 90, 1);
      this.spawnT = (SPAWN_BASE - (SPAWN_BASE - SPAWN_MIN) * ramp) / (0.6 + 0.4 * players);
    }

    // spawn power-up crates
    this.dropT -= dt;
    if (this.dropT <= 0) {
      this.crates.push({ id: this.cid++, x: 40 + this.room.rand() * (WORLD_W - 80), y: -30, kind: POWER_KINDS[Math.floor(this.room.rand() * POWER_KINDS.length)] });
      this.dropT = DROP_MIN_GAP + this.room.rand() * (DROP_MAX_GAP - DROP_MIN_GAP);
    }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const cr = this.crates[i];
      cr.y += DROP_SPEED * dt;
      if (cr.y > WORLD_H + 30) this.crates.splice(i, 1);
    }

    // bolts move up; hit crates (activate) or nuggets (score)
    const r = NUGGET_SIZE / 2;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.y -= BOLT_SPEED * dt;
      b.x += b.vx * dt;
      if (b.y < -30 || b.x < -30 || b.x > WORLD_W + 30) { this.bolts.splice(i, 1); continue; }
      const ci = this.crates.findIndex((cr) => Math.abs(cr.x - b.x) < 28 && Math.abs(cr.y - b.y) < 28);
      if (ci !== -1) { this.activate(b.owner, this.crates[ci].kind); this.crates.splice(ci, 1); this.bolts.splice(i, 1); continue; }
      const ni = this.nuggets.findIndex((n) => !n.dead && Math.abs(n.x - b.x) < r + 8 && Math.abs(n.y - b.y) < r + 10);
      if (ni !== -1) {
        const n = this.nuggets[ni];
        n.dead = true;
        const worth = n.golden ? GOLDEN_MULT : 1;
        this.room.addScore(b.owner, worth);
        this.room.event({ kind: 'kill', x: Math.round(n.x), y: Math.round(n.y), golden: n.golden });
        this.bolts.splice(i, 1);
      }
    }

    // nuggets fall; fizzle on shield, else damage the city
    const fall = NUGGET_FALL * (1 + Math.min(this.elapsed / 120, 1));
    const shieldY = WORLD_H - SHIELD_HEIGHT;
    for (let i = this.nuggets.length - 1; i >= 0; i--) {
      const n = this.nuggets[i];
      if (n.dead) { this.nuggets.splice(i, 1); continue; }
      n.y += fall * dt;
      if (this.shieldT > 0 && n.y + r >= shieldY) {
        this.room.event({ kind: 'fizzle', x: Math.round(n.x), y: shieldY });
        this.nuggets.splice(i, 1);
        continue;
      }
      if (this.rebuildT <= 0) {
        const b = this.city.find((bd) => bd.hp > 0 && n.x >= bd.x && n.x <= bd.x + bd.w && n.y + r >= WORLD_H - bd.h);
        if (b) {
          b.hp--;
          this.room.event({ kind: 'cityhit', x: Math.round(n.x) });
          if (this.city.every((c) => c.hp <= 0)) {
            this.rebuildT = CITY_REBUILD_SECS;
            this.waves++;
            this.room.event({ kind: 'citydown' });
          }
          this.nuggets.splice(i, 1);
          continue;
        }
      }
      if (n.y > WORLD_H + 40) this.nuggets.splice(i, 1);
    }
  }

  snapshot() {
    return {
      w: WORLD_W, h: WORLD_H, waves: this.waves,
      rebuilding: this.rebuildT > 0, shield: this.shieldT > 0, shieldY: WORLD_H - SHIELD_HEIGHT, nugSize: NUGGET_SIZE,
      nuggets: this.nuggets.filter((n) => !n.dead).map((n) => ({ i: n.id, x: Math.round(n.x), y: Math.round(n.y), g: n.golden ? 1 : 0 })),
      bolts: this.bolts.map((b) => ({ i: b.id, x: Math.round(b.x), y: Math.round(b.y) })),
      crates: this.crates.map((c) => ({ i: c.id, x: Math.round(c.x), y: Math.round(c.y), k: c.kind })),
      city: this.city.map((b) => ({ x: Math.round(b.x), w: Math.round(b.w), h: Math.round(b.h), hp: b.hp })),
      cannons: [...this.cannons.entries()].map(([id, c]) => ({ id, x: Math.round(c.x), name: c.name, p: c.power ? c.power.kind : null, pt: c.power ? Math.ceil(c.power.t) : 0 })),
    };
  }

  isOver() { return false; } // endless-with-rebuild; room ends the match when empty

  results() {
    return {
      waves: this.waves,
      players: this.room.players().map((p) => ({ userId: p.userId, score: p.score })),
    };
  }
}
