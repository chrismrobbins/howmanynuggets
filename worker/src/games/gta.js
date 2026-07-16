// Free-roam online relay for GRAND THEFT NUGGET (mode `gta`).
//
// Unlike Blaster — where the server simulates the whole shared world — GTN's
// city (traffic, peds, missions) is far too big and stateful to run server-side,
// and every client already runs its own full Nuggetown. So this module is a
// pure STATE RELAY: it stores each player's last-reported transform (position,
// heading, on-foot flag, car class/color) and rebroadcasts everyone's so each
// client can draw the OTHER players as ghost cars/peds in its own local city.
//
// Sprint 9 scope: sync only. No PvP damage, no server-authoritative world, no
// scoring — the match is endless free-roam (isOver() never true), and results()
// is empty so nothing is written to D1. (Sprint 10 adds online activities +
// an "minutes survived at 5★" leaderboard.)

// Vehicle classes the client knows how to draw (GTA_CLASSES in js/gta.js). A
// player reporting anything else is coerced to 'compact' so a bad/hostile
// message can't make another client throw on GTA_CLASSES[cls].
const GTA_CLASSES = new Set(['compact', 'sedan', 'sports', 'bus', 'tanker', 'cruiser', 'van']);

export class GtaGame {
  static maxPlayers = 8;

  constructor(room) {
    this.room = room;
    // playerId -> { x, y, a, onFoot, cls, col, name }
    this.states = new Map();
  }

  onStart(players) {
    for (const p of players) this.ensure(p);
  }

  onPlayerJoin(pid, player) {
    this.ensure(player);
  }

  onPlayerLeave(pid) {
    this.states.delete(pid);
    this.room.event({ kind: 'depart', pid });
  }

  ensure(p) {
    if (!this.states.has(p.id)) {
      this.states.set(p.id, {
        x: 0, y: 0, a: 0, onFoot: false, cls: 'compact', col: '#c23a3a', name: p.name, int: '',
      });
    }
  }

  onInput(pid, msg) {
    const s = this.states.get(pid);
    if (!s) return;
    if (msg.t === 'xf') {
      // Transform update. Validate loosely — the relay trusts position (there's
      // no shared authoritative world to cheat against) but sanitizes the enum
      // fields other clients index into.
      if (Number.isFinite(msg.x)) s.x = msg.x;
      if (Number.isFinite(msg.y)) s.y = msg.y;
      if (Number.isFinite(msg.a)) s.a = msg.a;
      s.onFoot = !!msg.f;
      if (typeof msg.c === 'string' && GTA_CLASSES.has(msg.c)) s.cls = msg.c;
      if (typeof msg.col === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(msg.col)) s.col = msg.col;
      // which interior the player is in ('' = street). Only compared as a string
      // on the client, never indexed — just cap the length.
      if (typeof msg.int === 'string') s.int = msg.int.slice(0, 24);
    } else if (msg.t === 'honk') {
      // Relay the horn to everyone (the sender ignores its own echo), but
      // throttle per player so a spammer can't amplify one keypress into a
      // broadcast storm across the whole city.
      const t = Date.now();
      if (t - (s.honkAt || 0) < 300) return;
      s.honkAt = t;
      this.room.event({ kind: 'honk', pid });
    }
  }

  tick() {
    // No server-side world to advance — clients simulate their own cities.
  }

  snapshot() {
    // Compact per-player transforms keyed by playerId. Names ride along so a
    // client can label ghosts without depending on roster message ordering.
    const players = {};
    for (const [pid, s] of this.states) {
      players[pid] = {
        x: Math.round(s.x), y: Math.round(s.y), a: +s.a.toFixed(3),
        f: s.onFoot ? 1 : 0, c: s.cls, col: s.col, n: s.name, int: s.int || '',
      };
    }
    return { players };
  }

  isOver() {
    return false; // free-roam: the room lives until the last player leaves
  }

  results() {
    return { waves: 0, players: [] }; // nothing to persist for free-roam
  }
}
