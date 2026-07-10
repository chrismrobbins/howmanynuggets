// Generic multiplayer room — the reusable heart of the framework.
//
// One GameRoom Durable Object instance per room (routed by code via
// getByName(code)). It owns everything game-agnostic: WebSocket connections,
// the player roster, lobby → playing → over phase, the tick loop, snapshot
// broadcasting, and writing match results to D1. All game-specific logic lives
// in a GameModule (see games/registry.js) that this room drives.
//
// A game module implements:
//   static maxPlayers
//   constructor(room)          room API: addScore(pid,n), players(), event(obj), rand()
//   onStart(players)           build the world (in the module's virtual units)
//   onInput(playerId, msg)     game-specific inputs, e.g. {t:'input'} / {t:'fire'}
//   onPlayerLeave(playerId)
//   tick(dtMs)                 advance the authoritative world
//   snapshot()                 -> serializable state broadcast to clients
//   isOver()                   -> boolean
//   results()                  -> { waves, players:[{userId, score}] }

import { DurableObject } from 'cloudflare:workers';
import { GAME_MODULES } from './games/registry.js';

const TICK_MS = 50;             // ~20 Hz authoritative tick
const LOBBY_TTL_MS = 30 * 60 * 1000;

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.mod = null;            // active GameModule instance
    this.game = null;           // game id, e.g. 'blaster'
    this.code = null;
    this.phase = 'lobby';       // 'lobby' | 'playing' | 'over'
    this.startedAt = 0;
    this.matchId = null;
    // playerId -> { id, userId, name, ready, score, host }
    this.players = new Map();

    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`
      );
      const row = ctx.storage.sql.exec(`SELECT v FROM meta WHERE k = 'room'`).toArray()[0];
      if (row) {
        const saved = JSON.parse(row.v);
        this.game = saved.game;
        this.code = saved.code;
      }
    });
  }

  // ---- Called by the Worker right after a room is created ----
  configure(code, game) {
    this.code = code;
    this.game = game;
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO meta (k, v) VALUES ('room', ?)`,
      JSON.stringify({ code, game })
    );
    return { ok: true };
  }

  // ---- WebSocket lifecycle (Hibernation API) ----
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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const playerId = crypto.randomUUID();

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, userId, name });

    const host = this.players.size === 0;
    this.players.set(playerId, { id: playerId, userId, name, ready: false, score: 0, host });
    // Late joiners (and reconnects) get folded into a match already in progress.
    if (this.phase === 'playing' && this.mod) {
      this.mod.onPlayerJoin?.(playerId, this.players.get(playerId));
    }

    server.send(JSON.stringify({
      t: 'welcome', you: playerId, game: this.game, code: this.code,
      phase: this.phase, host, players: this.roster(),
    }));
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    const att = ws.deserializeAttachment();
    const p = att && this.players.get(att.playerId);
    if (!p) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Generic lobby controls.
    if (msg.t === 'ready') {
      p.ready = !!msg.ready;
      this.broadcastRoster();
      this.maybeAutoStart();
      return;
    }
    if (msg.t === 'start') {
      if (p.host) this.startMatch();
      return;
    }
    if (msg.t === 'ping') { ws.send(JSON.stringify({ t: 'pong' })); return; }

    // Game-specific inputs go to the module while a match is live.
    if (this.phase === 'playing' && this.mod) this.mod.onInput(att.playerId, msg);
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    this.players.delete(att.playerId);
    if (this.mod) this.mod.onPlayerLeave?.(att.playerId);
    this.broadcastRoster();
    if (this.players.size === 0) {
      // Everyone left — end any live match and let the room go idle.
      if (this.phase === 'playing') await this.endMatch(false);
      this.phase = 'lobby';
    }
  }

  async webSocketError(ws) { /* close handler does the cleanup */ }

  // ---- Match lifecycle ----
  maybeAutoStart() {
    const all = [...this.players.values()];
    if (this.phase === 'lobby' && all.length >= 1 && all.every((p) => p.ready)) {
      this.startMatch();
    }
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
    this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  async alarm() {
    if (this.phase !== 'playing' || !this.mod) return;
    this.mod.tick(TICK_MS);
    this.broadcast({ t: 'snapshot', s: this.mod.snapshot(), scores: this.scores() });
    if (this.mod.isOver()) { await this.endMatch(true); return; }
    this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  async endMatch(completed) {
    if (this.phase !== 'playing') return;
    this.phase = 'over';
    await this.ctx.storage.deleteAlarm();
    const results = this.mod ? this.mod.results() : { waves: 0, players: [] };
    await this.persistResults(results).catch(() => {});
    this.broadcast({ t: 'gameover', completed, results });
    this.mod = null;
    // Back to lobby so the group can rematch.
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
      if (!r.userId) continue; // signed-out guests aren't recorded
      await this.env.DB.prepare(
        `INSERT OR REPLACE INTO match_players (match_id, user_id, score) VALUES (?, ?, ?)`
      ).bind(matchId, r.userId, Math.max(0, Math.floor(r.score) || 0)).run();
      // Also fold into the solo best-score board for the game.
      await this.env.DB.prepare(
        `INSERT INTO scores (user_id, game, best_score, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, game) DO UPDATE SET
             best_score = MAX(best_score, excluded.best_score),
             updated_at = excluded.updated_at`
      ).bind(r.userId, this.game, Math.max(0, Math.floor(r.score) || 0), now).run();
    }
  }

  // ---- Room API handed to game modules ----
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
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, ready: p.ready, host: p.host,
    }));
  }
  scores() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score }));
  }
  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(s); } catch { /* socket closing */ }
    }
  }
  broadcastRoster() {
    this.broadcast({ t: 'roster', phase: this.phase, players: this.roster() });
  }
}
