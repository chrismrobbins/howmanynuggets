-- How Many Nuggets — users & high scores schema (Cloudflare D1 / SQLite)
-- Apply with:  wrangler d1 execute howmanynuggets --file=./schema.sql

-- Accounts. Passwords are stored ONLY as PBKDF2 hashes (see the Worker),
-- never in plaintext. Usernames are unique case-insensitively.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,   -- pbkdf2$<iters>$<salt>$<hash>, or 'google' for OAuth-only accounts
  created_at    INTEGER NOT NULL,   -- epoch ms
  is_admin      INTEGER NOT NULL DEFAULT 0, -- 1 = can see the admin portal + grant admin
  google_sub    TEXT,               -- Google account subject id (Sign in with Google); NULL for password accounts
  email         TEXT                -- from Google; reference/display only
);
-- One account per Google identity (partial: password accounts leave it NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub) WHERE google_sub IS NOT NULL;
-- NOTE: DBs created before these columns existed get them added lazily by the
-- Worker (ensureUserColumns), so no destructive ALTER is needed here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);

-- One best score per (user, game). Submitting a lower score never lowers the best.
CREATE TABLE IF NOT EXISTS scores (
  user_id     INTEGER NOT NULL,
  game        TEXT    NOT NULL,     -- 'catch' | 'blaster' | 'flappy' | 'dunk' | 'sim'
  best_score  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,     -- epoch ms
  PRIMARY KEY (user_id, game),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Powers the leaderboard: top scores per game, and rank-counting.
CREATE INDEX IF NOT EXISTS idx_scores_game ON scores(game, best_score DESC);

-- Login sessions ("stay logged in"). Bearer token the client presents on each
-- authenticated request. Deleted on logout or when expired.
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,     -- epoch ms
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Multiplayer match history. One row per finished co-op/versus match; one
-- match_players row per participant with their score in that match.
CREATE TABLE IF NOT EXISTS matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game        TEXT    NOT NULL,       -- 'blaster' | ...
  code        TEXT,                   -- room code
  waves       INTEGER,                -- shared co-op stat (game-defined)
  started_at  INTEGER,
  ended_at    INTEGER
);
CREATE TABLE IF NOT EXISTS match_players (
  match_id    INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);
