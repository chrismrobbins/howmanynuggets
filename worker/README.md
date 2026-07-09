# How Many Nuggets — API (Cloudflare Worker + D1)

Backend for user accounts and arcade high scores. It's a single Cloudflare
Worker (`src/index.js`) backed by a D1 (SQLite) database (`schema.sql`).

## What it does

- Username / display-name / password accounts (passwords hashed with PBKDF2).
- "Stay logged in" via opaque bearer-token sessions (30-day expiry).
- Per-game best-score tracking for `catch`, `blaster`, and `flappy`.
- Leaderboards per game, including the signed-in user's own rank.

## One-time setup

You need the Cloudflare CLI (`wrangler`) and to be logged in:

```bash
npm install -g wrangler   # or: npx wrangler ...
wrangler login
```

1. **Create the D1 database:**
   ```bash
   wrangler d1 create howmanynuggets
   ```
   Copy the printed `database_id` into `wrangler.toml` (replace
   `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

2. **Create the tables:**
   ```bash
   # local (for `wrangler dev`)
   wrangler d1 execute howmanynuggets --local --file=./schema.sql
   # remote (production)
   wrangler d1 execute howmanynuggets --remote --file=./schema.sql
   ```

## Run locally

```bash
wrangler dev
```

This serves the API at `http://localhost:8787`. Point the frontend at it by
setting, in the browser console or before the scripts load:

```js
window.NUGGET_API_BASE = 'http://localhost:8787';
```

`http://localhost:8080` (the static site's dev server) is already allow-listed
for CORS in `src/index.js`.

## Deploy

```bash
wrangler deploy
```

By default this publishes to `https://howmanynuggets-api.<your-subdomain>.workers.dev`.
Set that URL as `window.NUGGET_API_BASE` in the frontend, **or** serve the API at
`api.howmanynuggets.com` by uncommenting the `[[routes]]` block in `wrangler.toml`
(requires the domain's zone on this Cloudflare account) — the frontend defaults to
`https://api.howmanynuggets.com`.

### Deploy from CI (recommended for collaborators)

Store a Cloudflare API token as the `CLOUDFLARE_API_TOKEN` repo secret and run
`wrangler deploy` in a GitHub Action. Then collaborators just push code; nobody
needs personal Cloudflare credentials to ship.

## Allowed origins

CORS is restricted to the list in `ALLOWED_ORIGINS` at the top of `src/index.js`.
Add any new frontend origins there.

## Security notes

- Passwords are **never** stored in plaintext — only PBKDF2-SHA256 hashes.
- All SQL uses bound parameters.
- This is a hobby project. The frontend warns users not to reuse a real
  password; treat the whole thing as best-effort, not bank-grade security.
