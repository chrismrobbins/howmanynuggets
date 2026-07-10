# Build Plan: Multiplayer Framework (+ Blaster as first game)

A **reusable** real-time multiplayer framework on Cloudflare Durable Objects +
WebSockets, reusing the existing Worker + D1 backend. Games plug in as modules;
the transport, lobby, rooms, tick loop, and persistence are game-agnostic.
**Blaster is the reference implementation.** Adding another game later = one
server module + one client adapter, no plumbing rewrite.

## Non-negotiables
- Single-player for every game stays untouched. Multiplayer is an additive path
  that only activates when you join a room. Backend unreachable ⇒ SP as today.
- Server-authoritative world (shared state, server-computed scores) — matches
  the existing anti-cheat posture.
- Framework is game-agnostic; game specifics live only in game modules/adapters.

## Cost
SQLite-backed Durable Objects run on the **Workers Free plan** (100k req/day,
13,000 GB-s/day). No upgrade needed to start.

## Architecture
```
Browser ─POST /rooms {game} (Bearer)──▶ Worker → room code + join ticket
Browser ─wss /room/CODE?ticket=…──────▶ Worker → getByName(CODE) → GameRoom DO
                                                   ├ generic: sockets, roster, phase,
                                                   │  ready/start, ~20Hz tick, broadcast,
                                                   │  reconnection, D1 match persistence
                                                   └ delegates game logic → GameModule
                                                      (blaster, later: run, knight…)
```

## The framework seam

### Server: `GameRoom` Durable Object (generic, one per room)
Owns sockets, `players` (id, userId, name, ready, score), `phase`
(lobby→playing→over), the tick alarm, broadcasting, and D1 writes. Delegates all
game logic to a **GameModule** chosen by the room's `game` field via a registry.

**GameModule interface** (server):
```
class GameModule {
  static maxPlayers
  constructor(room)              // room API: addScore(pid,n), players, broadcast, event()
  onStart(players)               // build the world in VIRTUAL world units
  onInput(playerId, msg)         // game-specific inputs ({t:'input'}, {t:'fire'}…)
  onPlayerLeave(playerId)
  tick(dtMs)                     // advance authoritative world
  snapshot()                     // -> serializable state broadcast to clients
  isOver()                       // bool
  results()                      // -> [{userId, score}] + shared stats
}
```

### Client: `js/net.js` (generic)
WebSocket client: `createRoom(game)`, `joinRoom(code)`, ticket auth, JSON
dispatch, auto-reconnect, `net.active`, `net.snapshot`, roster/phase, event
callbacks, throttled `send()`. Game-independent.

### Client: `js/lobby.js` + `css/lobby.css` (generic)
Create/join by code, roster, ready, start — parameterized by game id.

### Per-game client adapter
Renders `net.snapshot` into that game's visuals and produces inputs. For Blaster
this lives behind a LOCAL/REMOTE seam in `blaster.js` (SP path unchanged).

## Virtual coordinate space
Players have different window sizes, so the authoritative sim runs in a fixed
**virtual world** (e.g., 1280×720 units); each client scales world→screen. Games
declare their world size. Baked in from the start (framework concern).

## Single-player preservation
`blaster.js` gains one branch: `if (net.active) { render server snapshot + send
inputs } else { existing local simulation }`. SP is the default fall-through.
Drawing helpers (cannon, city from HP array, bolts, crates) are shared; only
authority differs.

## Backend files
- `worker/wrangler.toml`: DO binding `GAME_ROOMS` + migration `new_sqlite_classes=["GameRoom"]`.
- `worker/src/gameRoom.js` (new): generic `GameRoom` DO.
- `worker/src/games/registry.js` (new): `{ blaster: BlasterGame }`.
- `worker/src/games/blaster.js` (new): the Blaster game module.
- `worker/src/index.js`: export `GameRoom`; routes `POST /rooms`,
  `POST /rooms/:code/ticket`, `GET /room/:code` (WS upgrade).
- `worker/schema.sql`: `matches`, `match_players`.

## Frontend files
- `js/net.js` (new): generic WS client.
- `js/lobby.js` + `css/lobby.css` (new): generic lobby.
- `js/blaster.js`: LOCAL/REMOTE seam + snapshot renderer/input sender.
- `index.html`: lobby markup, includes, "Play with friends" entry.

## WebSocket protocol (JSON)
- Client→server (generic): `{t:"ready",ready}` · `{t:"start"}`
- Client→server (game): `{t:"input",…}` · `{t:"fire",…}` (forwarded to module)
- Server→client: `{t:"welcome",you,game,phase,players}` · `{t:"roster",players}` ·
  `{t:"started"}` · `{t:"snapshot",s,scores}` (20Hz) · `{t:"event",kind,…}` ·
  `{t:"gameover",results}`

## Netcode
20Hz snapshots; client interpolates ~100ms behind. Own inputs local/instant;
others interpolated. Blaster shots use server hitscan (find lowest nugget in the
column) with a local muzzle-flash for feel. Cooldowns enforced server-side.

## Phasing
- **Phase 1 (MVP):** framework (GameRoom DO + registry + net.js + lobby) +
  Blaster module + Blaster client adapter. Create/join by code, 2–4 players,
  shared authoritative city + nuggets, per-player cannons/shooting, server
  scoring, endless-with-rebuild, results to D1.
- **Phase 2:** power-ups (personal ⚡/🔱, team 🛡️), difficulty scaling, reconnection
  polish, end-of-round summary.
- **Phase 3:** quick-match pool, spectating, co-op leaderboard; second game
  module (run or knight) to prove framework reuse.

## Verification
- DO unit tests (`@cloudflare/vitest-pool-workers`).
- Local e2e: `wrangler dev` + two tabs joining the same code.
- SP regression: headless-Chrome smoke proving each game works with
  `net.active === false`.

## Open decisions
- Tick via alarm (durable, ~50ms) vs. in-memory loop — recommend live in-memory
  tick during a match, hibernate idle lobbies.
- WS auth: ticket-in-query (chosen).
