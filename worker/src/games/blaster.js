// Blaster — the first multiplayer game module (Missile Command, co-op).
//
// Authoritative on the server, in a fixed VIRTUAL world (1280x720) so every
// client agrees regardless of window size — each client scales world→screen.
// Everyone defends one shared city from one shared nugget storm; each player
// drives their own cannon. Shots are server hitscans (the lowest nugget in the
// aimed column), so scores can't be faked. Endless with city-rebuild; the match
// ends when the room empties (the GameRoom handles that).

const WORLD_W = 1280;
const WORLD_H = 720;
const CITY_BUILDINGS = 7;
const BUILDING_HP = 3;
const NUGGET_FALL = 150;       // world px/s base fall speed
const FIRE_TOL = 42;           // hitscan column half-width (world px)
const FIRE_COOLDOWN = 0.16;    // s between a cannon's shots
const GOLDEN_CHANCE = 0.02;
const GOLDEN_MULT = 10;
const CITY_REBUILD_SECS = 3;
const SPAWN_BASE = 1.15;       // s between spawns, early, ~1 player
const SPAWN_MIN = 0.35;

export class BlasterGame {
  static maxPlayers = 4;

  constructor(room) {
    this.room = room;
    this.nuggets = [];
    this.city = [];
    this.cannons = new Map();   // playerId -> { x, name, cd }
    this.spawnT = 0;
    this.elapsed = 0;
    this.waves = 0;
    this.rebuildT = 0;
    this.nid = 1;
  }

  onStart(players) {
    this.buildCity();
    const n = players.length;
    players.forEach((p, i) => {
      const frac = n === 1 ? 0.5 : 0.15 + 0.7 * (i / (n - 1));
      this.cannons.set(p.id, { x: WORLD_W * frac, name: p.name, cd: 0 });
    });
  }

  onPlayerJoin(pid, player) {
    if (this.cannons.has(pid)) return;
    this.cannons.set(pid, { x: WORLD_W * (0.2 + 0.6 * this.room.rand()), name: player.name, cd: 0 });
  }

  onPlayerLeave(pid) { this.cannons.delete(pid); }

  onInput(pid, msg) {
    const c = this.cannons.get(pid);
    if (!c) return;
    if (msg.t === 'input' && typeof msg.x === 'number') {
      c.x = Math.max(0, Math.min(WORLD_W, msg.x));
    } else if (msg.t === 'fire') {
      if (c.cd > 0) return;
      c.cd = FIRE_COOLDOWN;
      this.fire(pid, typeof msg.x === 'number' ? msg.x : c.x);
    }
  }

  // Hitscan: kill the lowest un-hit nugget within the aimed column.
  fire(pid, x) {
    let target = null;
    for (const n of this.nuggets) {
      if (n.dead) continue;
      if (Math.abs(n.x - x) <= FIRE_TOL && (!target || n.y > target.y)) target = n;
    }
    if (!target) return;
    target.dead = true;
    const worth = target.golden ? GOLDEN_MULT : 1;
    this.room.addScore(pid, worth);
    this.room.event({ kind: 'kill', by: pid, x: Math.round(target.x), y: Math.round(target.y), golden: target.golden });
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

  tick(dtMs) {
    const dt = dtMs / 1000;
    this.elapsed += dt;

    if (this.rebuildT > 0) {
      this.rebuildT -= dt;
      if (this.rebuildT <= 0) this.buildCity();
    }
    for (const c of this.cannons.values()) if (c.cd > 0) c.cd -= dt;

    const players = Math.max(1, this.cannons.size);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.rebuildT <= 0) {
      this.spawn();
      const ramp = Math.min(this.elapsed / 90, 1);
      this.spawnT = (SPAWN_BASE - (SPAWN_BASE - SPAWN_MIN) * ramp) / (0.6 + 0.4 * players);
    }

    const fall = NUGGET_FALL * (1 + Math.min(this.elapsed / 120, 1));
    for (let i = this.nuggets.length - 1; i >= 0; i--) {
      const n = this.nuggets[i];
      if (n.dead) { this.nuggets.splice(i, 1); continue; }
      n.y += fall * dt;

      if (this.rebuildT <= 0) {
        const b = this.city.find(
          (bd) => bd.hp > 0 && n.x >= bd.x && n.x <= bd.x + bd.w && n.y >= WORLD_H - bd.h);
        if (b) {
          b.hp--;
          this.room.event({ kind: 'cityhit', x: Math.round(n.x), hp: b.hp });
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

  spawn() {
    this.nuggets.push({
      id: this.nid++,
      x: 40 + this.room.rand() * (WORLD_W - 80),
      y: -30,
      golden: this.room.rand() < GOLDEN_CHANCE,
      dead: false,
    });
  }

  snapshot() {
    return {
      w: WORLD_W, h: WORLD_H, waves: this.waves, rebuilding: this.rebuildT > 0,
      nuggets: this.nuggets.filter((n) => !n.dead)
        .map((n) => ({ i: n.id, x: Math.round(n.x), y: Math.round(n.y), g: n.golden ? 1 : 0 })),
      city: this.city.map((b) => ({ x: Math.round(b.x), w: Math.round(b.w), h: Math.round(b.h), hp: b.hp })),
      cannons: [...this.cannons.entries()].map(([id, c]) => ({ id, x: Math.round(c.x), name: c.name })),
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
