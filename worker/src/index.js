// How Many Nuggets — users & high-scores API (Cloudflare Worker + D1).
//
// Endpoints (all JSON):
//   POST /api/register      { username, displayName, password }  -> { token, user }
//   POST /api/login         { username, password }               -> { token, user }
//   POST /api/logout        (Bearer)                             -> { ok }
//   GET  /api/me            (Bearer)                             -> { user, scores }
//   POST /api/score         (Bearer) { game, score }             -> { ok, best }
//   GET  /api/scores/me     (Bearer)                             -> { scores }
//   GET  /api/leaderboard?game=catch&limit=25  (Bearer optional) -> { game, top, mine }
//
// Security notes:
//   - Passwords are hashed with PBKDF2-SHA256 (never stored in plaintext).
//   - All SQL uses bound parameters (no string concatenation).
//   - Sessions are opaque random bearer tokens with a 30-day expiry.
//   - This is a hobby project; users are warned not to reuse real passwords.

const ALLOWED_ORIGINS = new Set([
  'https://howmanynuggets.com',
  'https://www.howmanynuggets.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5173',
]);

const GAMES = new Set(['catch', 'blaster', 'flappy', 'dunk', 'sim', 'run', 'knight', 'brawl', 'ranch', 'kart', 'reel', 'gta', 'beat']);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITERATIONS = 100000;
const MAX_SCORE = 1e15; // absolute backstop (per-game caps below are the real gate)

// Anti-cheat: per-game plausibility ceilings. The frontend clamps storms at the
// $10M-equivalent (~13M nuggets); with golden multipliers the burst games top
// out well under 20M per session. Time-accruing games get generous multi-hour
// ceilings. Anything beyond these did not come from the game.
const GAME_MAX_SCORE = {
  catch: 20e6, blaster: 20e6,       // one storm, ~13M nugs, golden 10x headroom
  flappy: 40e6, dunk: 40e6,         // gate/dunk banking over a very long session
  sim: 2e6,                         // 1 wisdom/sec + events — covers ~10 days
  run: 2e6,                         // ~68k/hour at max speed + pickups
  knight: 30e6,                     // kills + wave bonuses; NUGGMARE oath pays 3x
  brawl: 30e6,                      // campaign KOs + act bonuses; HELL heat pays 3x (knight parity)
  ranch: 5e6,                       // ~28 nugs/hen shipped over a long farming session
  kart: 40e6,                       // distance banking like flappy/dunk; X-restart keeps runs going
  reel: 40e6,                       // catches bank forever; THE STORM jackpot is 1000× perFlyer (~5.6M max)
  gta: 40e6,                        // open-world banking: distance trickle + crates over a long joyride
  beat: 40e6,                       // rhythm sets bank like dunk; FEVER + encore 2× headroom
};
const MIN_SUBMIT_INTERVAL_MS = 10000; // one score per 10s per account

// ---- CORS / JSON helpers ----------------------------------------------------
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://howmanynuggets.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ---- Password hashing (PBKDF2 via WebCrypto) --------------------------------
function b64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
function unb64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
  );
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iterStr, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const bits = await deriveBits(password, unb64(saltB64), Number(iterStr));
  const a = new Uint8Array(bits);
  const b = unb64(hashB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; // constant-time compare
  return diff === 0;
}

function newToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---- Validation -------------------------------------------------------------
const validUsername = (u) => typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
const validDisplay = (d) => typeof d === 'string' && d.trim().length >= 1 && d.trim().length <= 40;
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

// ---- Sessions ---------------------------------------------------------------
async function getUserByToken(env, token) {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, username: row.username, displayName: row.display_name, token };
}

async function getSessionUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return getUserByToken(env, token);
}

async function scoresForUser(env, userId) {
  const { results } = await env.DB.prepare(
    'SELECT game, best_score FROM scores WHERE user_id = ?'
  ).bind(userId).all();
  const map = { catch: 0, blaster: 0, flappy: 0, dunk: 0, sim: 0, run: 0, knight: 0, brawl: 0, ranch: 0, kart: 0, reel: 0, gta: 0, beat: 0 };
  for (const r of results) map[r.game] = r.best_score;
  return map;
}

async function createSession(env, userId) {
  const now = Date.now();
  const token = newToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, now, now + SESSION_TTL_MS).run();
  return token;
}

// ---- Handlers ---------------------------------------------------------------
async function register(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const displayName = (body.displayName || '').trim();
  const password = body.password || '';

  if (!validUsername(username)) return json({ error: 'Username must be 3–20 letters, numbers, or underscores.' }, 400, origin);
  if (!validDisplay(displayName)) return json({ error: 'Display name must be 1–40 characters.' }, 400, origin);
  if (!validPassword(password)) return json({ error: 'Password must be at least 8 characters.' }, 400, origin);

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE'
  ).bind(username).first();
  if (existing) return json({ error: 'That username is taken.' }, 409, origin);

  const hash = await hashPassword(password);
  const res = await env.DB.prepare(
    'INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).bind(username, displayName, hash, Date.now()).run();

  const token = await createSession(env, res.meta.last_row_id);
  return json({ token, user: { username, displayName } }, 201, origin);
}

async function login(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const username = (body.username || '').trim();
  const password = body.password || '';

  const user = await env.DB.prepare(
    'SELECT id, username, display_name, password_hash FROM users WHERE username = ? COLLATE NOCASE'
  ).bind(username).first();

  if (!user) {
    // Burn similar CPU on the miss path to blunt username-timing enumeration.
    await hashPassword(password);
    return json({ error: 'Invalid username or password.' }, 401, origin);
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    return json({ error: 'Invalid username or password.' }, 401, origin);
  }

  const token = await createSession(env, user.id);
  return json({ token, user: { username: user.username, displayName: user.display_name } }, 200, origin);
}

async function logout(request, env, origin) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json({ ok: true }, 200, origin);
}

async function me(request, env, origin) {
  const u = await getSessionUser(request, env);
  if (!u) return json({ error: 'Not authenticated' }, 401, origin);
  return json({ user: { username: u.username, displayName: u.displayName }, scores: await scoresForUser(env, u.id) }, 200, origin);
}

async function submitScore(request, env, origin) {
  const u = await getSessionUser(request, env);
  if (!u) return json({ error: 'Not authenticated' }, 401, origin);
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  let score = Math.floor(Number(body.score));
  if (!GAMES.has(game)) return json({ error: 'Unknown game' }, 400, origin);
  if (!Number.isFinite(score) || score < 0) return json({ error: 'Invalid score' }, 400, origin);
  if (score > MAX_SCORE) score = MAX_SCORE;

  // Plausibility cap: the game cannot produce this number.
  if (score > GAME_MAX_SCORE[game]) {
    return json({ error: 'Score exceeds what this game can produce. The Nugget Council has reviewed your submission and voted no.' }, 422, origin);
  }

  // Rate limit: scores land when a session ends, which takes longer than 10s.
  // (Every submission bumps updated_at via the upsert, so MAX() is "last submit".)
  const lastSub = await env.DB.prepare(
    'SELECT MAX(updated_at) AS t FROM scores WHERE user_id = ?'
  ).bind(u.id).first();
  if (lastSub && lastSub.t && Date.now() - lastSub.t < MIN_SUBMIT_INTERVAL_MS) {
    return json({ error: 'Easy there, sharpshooter — one score every 10 seconds.' }, 429, origin);
  }

  await env.DB.prepare(
    `INSERT INTO scores (user_id, game, best_score, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, game) DO UPDATE SET
         best_score = MAX(best_score, excluded.best_score),
         updated_at = excluded.updated_at`
  ).bind(u.id, game, score, Date.now()).run();

  const row = await env.DB.prepare(
    'SELECT best_score FROM scores WHERE user_id = ? AND game = ?'
  ).bind(u.id, game).first();
  return json({ ok: true, best: row.best_score }, 200, origin);
}

async function myScores(request, env, origin) {
  const u = await getSessionUser(request, env);
  if (!u) return json({ error: 'Not authenticated' }, 401, origin);
  return json({ scores: await scoresForUser(env, u.id) }, 200, origin);
}

async function leaderboard(request, env, origin) {
  const url = new URL(request.url);
  const game = url.searchParams.get('game');
  let limit = parseInt(url.searchParams.get('limit') || '25', 10);
  if (!GAMES.has(game)) return json({ error: 'Unknown game' }, 400, origin);
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  limit = Math.min(limit, 100);

  const { results } = await env.DB.prepare(
    `SELECT u.username, u.display_name, s.best_score
       FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.game = ?
      ORDER BY s.best_score DESC, s.updated_at ASC
      LIMIT ?`
  ).bind(game, limit).all();
  const top = results.map((r, i) => ({
    rank: i + 1, username: r.username, displayName: r.display_name, score: r.best_score,
  }));

  // If authenticated, surface this user's own rank even when outside the top N.
  let mine = null;
  const u = await getSessionUser(request, env);
  if (u) {
    const row = await env.DB.prepare(
      'SELECT best_score FROM scores WHERE user_id = ? AND game = ?'
    ).bind(u.id, game).first();
    if (row) {
      const higher = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM scores WHERE game = ? AND best_score > ?'
      ).bind(game, row.best_score).first();
      mine = { rank: higher.c + 1, username: u.username, displayName: u.displayName, score: row.best_score };
    }
  }
  return json({ game, top, mine }, 200, origin);
}

// ---- Multiplayer rooms ------------------------------------------------------
// The GameRoom Durable Object must be exported from the Worker entry so wrangler
// can bind it (see wrangler.toml).
export { GameRoom } from './gameRoom.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
function newRoomCode() {
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) s += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return s;
}

// POST /api/rooms { game } — create a room, configure its DO, return the code.
async function createRoom(request, env, origin) {
  const u = await getSessionUser(request, env);
  if (!u) return json({ error: 'Sign in to host a room.' }, 401, origin);
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  if (!MULTIPLAYER_GAMES.has(game)) return json({ error: 'That game has no multiplayer yet.' }, 400, origin);

  const code = newRoomCode();
  const stub = env.GAME_ROOMS.getByName(code);
  await stub.configure(code, game, u.id); // the creator is the host
  return json({ code, game }, 201, origin);
}

// GET /room/:code (WebSocket upgrade). Browsers can't send auth headers on a WS
// handshake, so the session token rides in the query string; the Worker
// validates it here and forwards only the user id + name to the DO.
async function joinRoom(request, env, url) {
  const code = url.pathname.split('/')[2] || '';
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return new Response('bad room code', { status: 400 });
  const user = await getUserByToken(env, url.searchParams.get('token') || '');
  if (!user) return new Response('unauthorized', { status: 401 });

  const stub = env.GAME_ROOMS.getByName(code);
  const fwd = new URL(request.url);
  fwd.searchParams.set('uid', String(user.id));
  fwd.searchParams.set('name', user.displayName);
  fwd.searchParams.delete('token');
  return stub.fetch(new Request(fwd.toString(), request));
}

// Which games currently have a multiplayer module (mirrors games/registry.js).
const MULTIPLAYER_GAMES = new Set(['blaster', 'gta']);

// ---- Router -----------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // WebSocket upgrades bypass CORS/JSON handling entirely.
    if (path.startsWith('/room/') && request.headers.get('Upgrade') === 'websocket') {
      return joinRoom(request, env, url);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const m = request.method;
      if (path === '/api/register' && m === 'POST') return await register(request, env, origin);
      if (path === '/api/login' && m === 'POST') return await login(request, env, origin);
      if (path === '/api/logout' && m === 'POST') return await logout(request, env, origin);
      if (path === '/api/me' && m === 'GET') return await me(request, env, origin);
      if (path === '/api/score' && m === 'POST') return await submitScore(request, env, origin);
      if (path === '/api/scores/me' && m === 'GET') return await myScores(request, env, origin);
      if (path === '/api/leaderboard' && m === 'GET') return await leaderboard(request, env, origin);
      if (path === '/api/rooms' && m === 'POST') return await createRoom(request, env, origin);
      if (path === '/' || path === '/api') return json({ ok: true, service: 'howmanynuggets-api' }, 200, origin);
      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      return json({ error: 'Server error' }, 500, origin);
    }
  },
};
