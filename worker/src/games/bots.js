// 🤖 BATTEREDBOTS online — CLUCKED METAL (game 17, mode `bots`).
//
// Server-AUTHORITATIVE, unlike GTN's relay: PvP damage needs a referee. The
// referee is the exact same rulebook the browser runs — js/botsSim.js is
// side-effect-imported below and read off globalThis, so a rule changed there
// is changed here (one physics, three jobs). The room ticks at 20 Hz; we step
// the sim at 60 Hz inside each tick and broadcast one snapshot per tick with
// the events that fired since the last one.
//
// Flow inside a match: 'setup' (everyone picks a chassis, the host picks the
// league + floor, 12 s max) → the sim's own drop/fight/over/pitstop/done →
// 8 s of results → isOver(). Humans who join mid-match spectate until the next
// round; humans who leave hand their bot to the AI so the match finishes.
import '../../../js/botsSim.js';

const Sim = globalThis.BotsSim;
const SETUP_SECS = 12;
const RESULTS_SECS = 8;
const MIN_BOTS = 4;           // AI fills the field up to this many
const PER_FLYER = 1000;       // online scores land on the SP leaderboard's scale (pts/100 × perFlyer × tier)
const AI_NAMES = ['JOSH', 'NATHAN', 'CHRIS', 'BIG CRUMB', 'THE HOOD', 'GRAVY J.', 'HENRIETTA', 'DJ DRIP'];

const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

export class BotsGame {
  static maxPlayers = 6;

  constructor(room) {
    this.room = room;
    this.phase = 'setup';       // setup | play | results
    this.setupT = 0;
    this.picks = {};            // pid -> cls
    this.cfg = { tier: 'league', arena: 'pit' };
    this.m = null;
    this.inputs = {};           // pid -> latest input
    this.seq = {};              // pid -> last input seq applied
    this.acc = 0;
    this.events = [];
    this.credited = {};         // pid -> score already pushed to room.addScore
    this.resultsT = 0;
    this.players = new Map();   // pid -> { userId, name, joinedMid }
    this.done = false;
    this.seed = (Math.floor(room.rand() * 0xffffffff)) >>> 0;
  }

  onStart(players) {
    for (const p of players) this.players.set(p.id, { userId: p.userId, name: p.name, mid: false });
    this.phase = 'setup';
  }

  onPlayerJoin(pid, p) {
    this.players.set(pid, { userId: p.userId, name: p.name, mid: this.phase !== 'setup' });
    if (this.phase === 'play' && this.m) {
      // spectate until the next round starts (the sim skips spectating bots)
      const b = Sim.addBot(this.m, { id: pid, name: p.name, cls: 'dicer', ai: false, spectating: true }, this.m.bots.length);
      b.alive = false; b.gone = true; b.pending = true;
    }
  }

  onPlayerLeave(pid) {
    this.players.delete(pid);
    delete this.inputs[pid]; delete this.picks[pid];
    if (this.m) {
      const b = Sim.botById(this.m, pid);
      if (b) { b.ai = this.m.aiLevel; b.name = (b.name || 'NUG').slice(0, 10) + ' (AI)'; }
    }
  }

  onInput(pid, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'pick') {
      if (this.phase !== 'setup') return;
      if (Sim.CLASSES[msg.cls]) this.picks[pid] = msg.cls;
      return;
    }
    if (msg.t === 'setup') {
      // host only: league + floor
      const me = this.room.players().find((p) => p.id === pid);
      if (!me || !me.host || this.phase !== 'setup') return;
      if (Sim.TIERS.some((t) => t.key === msg.tier)) this.cfg.tier = msg.tier;
      if (Sim.ARENAS[msg.arena]) this.cfg.arena = msg.arena;
      this.cfg.ready = true;
      return;
    }
    if (msg.t === 'in') {
      if (this.phase !== 'play') return;
      this.inputs[pid] = {
        dx: num(msg.dx, -1, 1, 0), dy: num(msg.dy, -1, 1, 0),
        ax: num(msg.ax, -1, 1, 1), ay: num(msg.ay, -1, 1, 0), ad: num(msg.ad, 0, 400, 0),
        fire: !!msg.fire, spec: !!msg.spec, nitro: !!msg.nitro, tank: !!msg.tank,
      };
      if (Number.isFinite(msg.seq)) this.seq[pid] = msg.seq;
      return;
    }
    if (msg.t === 'boon') {
      if (this.m && this.m.phase === 'pitstop' && typeof msg.key === 'string') Sim.pickBoon(this.m, pid, msg.key);
      return;
    }
  }

  startMatch() {
    const humans = [...this.players.keys()];
    const players = humans.map((pid, i) => ({ id: pid, name: this.players.get(pid).name, cls: this.picks[pid] || Sim.CLASS_KEYS[i % 3], ai: false }));
    const names = AI_NAMES.filter((n) => !players.some((p) => p.name.toUpperCase() === n)).sort(() => this.room.rand() - 0.5);
    for (let i = 0; players.length < MIN_BOTS; i++) players.push({ id: 'ai' + i, name: names[i % names.length], cls: Sim.CLASS_KEYS[(i + humans.length) % 3], ai: true });
    this.m = Sim.createMatch({ arena: this.cfg.arena, tier: this.cfg.tier, seed: this.seed, players });
    Sim.startRound(this.m);
    this.phase = 'play';
    this.acc = 0;
    this.room.event({ kind: 'botsmatch', tier: this.cfg.tier, arena: this.cfg.arena });
  }

  tick(dtMs) {
    const dt = dtMs / 1000;
    if (this.phase === 'setup') {
      this.setupT += dt;
      const humans = [...this.players.keys()];
      const allPicked = humans.length > 0 && humans.every((pid) => this.picks[pid]);
      if ((allPicked && this.cfg.ready) || this.setupT >= SETUP_SECS) this.startMatch();
      return;
    }
    if (this.phase === 'results') { this.resultsT += dt; if (this.resultsT >= RESULTS_SECS) this.done = true; return; }
    const m = this.m;
    // late joiners get a seat at the next round
    if (m.phase === 'pitstop' || m.phase === 'over') for (const b of m.bots) if (b.pending) { b.pending = false; b.spectating = false; }
    this.acc += dt;
    let n = 0;
    while (this.acc >= 1 / 60 && n < 6) { Sim.step(m, this.inputs, 1 / 60); this.acc -= 1 / 60; n++; }
    if (n === 6) this.acc = 0;
    const evs = Sim.drainEvents(m);
    if (evs.length) this.events = this.events.concat(evs).slice(-120);
    // score: push deltas into the room so the roster/results see them live
    for (const b of m.bots) {
      if (!this.players.has(b.id)) continue;
      const have = this.credited[b.id] || 0;
      if (b.score > have) { this.room.addScore(b.id, this.scaled(b.score - have)); this.credited[b.id] = b.score; }
    }
    if (m.phase === 'done') { this.phase = 'results'; this.resultsT = 0; }
  }

  scaled(pts) { return Math.round(pts / 100 * PER_FLYER * (this.m ? this.m.mult : 1)); }

  snapshot() {
    const ev = this.events; this.events = [];
    if (this.phase === 'setup') {
      return { ph: 'setup', t: +this.setupT.toFixed(2), left: Math.max(0, SETUP_SECS - this.setupT), picks: this.picks, cfg: { tier: this.cfg.tier, arena: this.cfg.arena, ready: !!this.cfg.ready }, ev };
    }
    const s = Sim.snapshot(this.m);
    s.ph2 = this.phase;   // 'play' | 'results'
    s.seq = this.seq;
    s.ev = ev;
    return s;
  }

  isOver() { return this.done; }

  results() {
    const players = [];
    for (const [pid, p] of this.players) {
      const b = this.m ? Sim.botById(this.m, pid) : null;
      players.push({ userId: p.userId, score: b ? this.scaled(b.score) : 0 });
    }
    return { waves: this.m ? this.m.roundNum : 0, players };
  }
}
