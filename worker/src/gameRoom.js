// Generic multiplayer room — the reusable heart of the framework.
//
// One GameRoom Durable Object instance per room (routed by code via
// getByName(code)). It owns everything game-agnostic: WebSocket connections,
// the player roster, lobby → playing → over phase, the game loop, snapshot
// broadcasting, and writing match results to D1. All game-specific logic lives
// in a GameModule (see games/registry.js) that this room drives.
//
// Real-time note: we use plain (non-hibernating) WebSockets and an in-memory
// setInterval loop while a match is live. Open sockets keep the DO resident, so
// the loop ticks smoothly with no per-tick storage writes. (An earlier version
// used alarms for the loop — that was durable but far too slow for 20Hz.)
//
// A game module implements:
//   static maxPlayers
//   constructor(room)          room API: addScore(pid,n), players(), event(obj), rand()
//   onStart(players)           build the world (in the module's virtual units)
//   onInput(playerId, msg)     game-specific inputs, e.g. {t:'input'} / {t:'fire'}
//   onPlayerJoin(playerId, p)  a player joined mid-match
//   onPlayerLeave(playerId)
//   tick(dtMs)                 advance the authoritative world
//   snapshot()                 -> serializable state broadcast to clients
//   isOver()                   -> boolean
//   results()                  -> { waves, players:[{userId, score}] }

import { DurableObject } from 'cloudflare:workers';
import { GAME_MODULES } from './games/registry.js';

const TICK_MS = 50; // ~20 Hz

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.mod = null;
    this.game = null;
    this.code = null;
    this.hostUserId = 0;
    this.phase = 'lobby';        // 'lobby' | 'playing' | 'over'
    this.startedAt = 0;
    this.timer = null;
    // playerId -> { id, userId, name, ready, score, host, ws }
    this.players = new Map();

    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
      const row = ctx.storage.sql.exec(`SELECT v FROM meta WHERE k='room'`).toArray()[0];
      if (row) {
        const s = JSON.parse(row.v);
        this.game = s.game; this.code = s.code; this.hostUserId = s.hostUserId || 0;
      }
    });
  }

  // Called by the Worker right after a room is created. The creator is the host.
  configure(code, game, hostUserId) {
    this.code = code;
    this.game = game;
    this.hostUserId = hostUserId || 0;
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO meta (k, v) VALUES ('room', ?)`,
      JSON.stringify({ code, game, hostUserId: this.hostUserId })
    );
    return { ok: true };
  }

  // ---- WebSocket connect ----
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    if (!this.game || !GAME_MODULES[this.game]) {
      return new Response('unknown room', { status: 404 });
    }
    const userId = Number(url.searchParams.get('uid')) || 0;
    const name = (url.searchParams.get('name') || 'Nugget').slice(0, 40);

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    const playerId = crypto.randomUUID();
    const host = userId !== 0 && userId === this.hostUserId;
    const player = { id: playerId, userId, name, ready: false, score: 0, host, ws: server };
    this.players.set(playerId, player);

    // Late joiners (and reconnects) fold into a match already in progress.
    if (this.phase === 'playing' && this.mod) this.mod.onPlayerJoin?.(playerId, player);

    server.addEventListener('message', (ev) => this.onMessage(player, ev.data));
    server.addEventListener('close', () => this.onClose(player));
    server.addEventListener('error', () => this.onClose(player));

    server.send(JSON.stringify({
      t: 'welcome', you: playerId, game: this.game, code: this.code,
      phase: this.phase, host, players: this.roster(),
    }));
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(player, raw) {
    if (!this.players.has(player.id)) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'ready') { player.ready = !!msg.ready; this.broadcastRoster(); this.maybeAutoStart(); return; }
    if (msg.t === 'start') { if (player.host) this.startMatch(); return; }
    if (msg.t === 'ping') { try { player.ws.send(JSON.stringify({ t: 'pong' })); } catch {} return; }
    if (this.phase === 'playing' && this.mod) this.mod.onInput(player.id, msg);
  }

  onClose(player) {
    if (!this.players.has(player.id)) return;
    this.players.delete(player.id);
    if (this.mod) this.mod.onPlayerLeave?.(player.id);
    this.broadcastRoster();
    if (this.players.size === 0) this.endMatch(false);
  }

  // ---- Match lifecycle ----
  maybeAutoStart() {
    const all = [...this.players.values()];
    if (this.phase === 'lobby' && all.length >= 1 && all.every((p) => p.ready)) this.startMatch();
  }

  startMatch() {
    if (this.phase === 'playing') return;
    const Mod = GAME_MODULES[this.game];
    if (!Mod) return;
    this.mod = new Mod(this.roomApi());
    this.phase = 'playing';
    this.startedAt = Date.now();
    for (const p of this.players.values()) { p.score = 0; p.ready = false; }
    this.mod.onStart([...this.players.values()]);
    this.broadcast({ t: 'started', game: this.game });
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    if (this.phase !== 'playing' || !this.mod) return;
    this.mod.tick(TICK_MS);
    this.broadcast({ t: 'snapshot', s: this.mod.snapshot(), scores: this.scores() });
    if (this.mod.isOver()) this.endMatch(true);
  }

  async endMatch(completed) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    const results = this.mod ? this.mod.results() : { waves: 0, players: [] };
    await this.persistResults(results).catch(() => {});
    this.broadcast({ t: 'gameover', completed, results });
    this.mod = null;
    for (const p of this.players.values()) p.ready = false;
    this.phase = 'lobby';
    this.broadcastRoster();
  }

  async persistResults(results) {
    if (!results || !results.players || !results.players.length) return;
    const now = Date.now();
    const row = await this.env.DB.prepare(
      `INSERT INTO matches (game, code, waves, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`
    ).bind(this.game, this.code, results.waves ?? null, this.startedAt || now, now).first();
    const matchId = row.id;
    for (const r of results.players) {
      if (!r.userId) continue;
      const score = Math.max(0, Math.floor(r.score) || 0);
      await this.env.DB.prepare(
        `INSERT OR REPLACE INTO match_players (match_id, user_id, score) VALUES (?, ?, ?)`
      ).bind(matchId, r.userId, score).run();
      await this.env.DB.prepare(
        `INSERT INTO scores (user_id, game, best_score, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, game) DO UPDATE SET
             best_score = MAX(best_score, excluded.best_score),
             updated_at = excluded.updated_at`
      ).bind(r.userId, this.game, score, now).run();
    }
  }

  // ---- Room API for game modules ----
  roomApi() {
    return {
      players: () => [...this.players.values()],
      addScore: (pid, n) => { const p = this.players.get(pid); if (p) p.score += n; },
      event: (obj) => this.broadcast({ t: 'event', ...obj }),
      rand: () => Math.random(),
    };
  }

  // ---- Helpers ----
  roster() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, ready: p.ready, host: p.host }));
  }
  scores() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score }));
  }
  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) { try { p.ws.send(s); } catch {} }
  }
  broadcastRoster() {
    this.broadcast({ t: 'roster', phase: this.phase, players: this.roster() });
  }
}
