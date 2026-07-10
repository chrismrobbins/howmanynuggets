# 🍗 How Many Nuggets

A fun single-page web app that converts a dollar amount into how many McDonald's
Chicken McNuggets it would buy — with a ZIP-code-based local price estimate and a
few surprises for the big spenders.

## What it does

- **Enter a ZIP code** → estimates the local price of a 6-piece McNugget by US region
  (with overrides for pricier/cheaper metros).
- **Enter a dollar amount** → shows how many McNuggets that buys, plus a breakdown
  into 6-piece boxes. The amount formats with commas as you type.
- **Visualizes your nuggets** → draws an image for each nugget (capped at 500 on
  screen for performance; the exact count is always shown).
- **🕹️ The Nugget Arcade** → press the arcade button to unleash the Nugget
  Storm at any amount: nuggets fly across the whole screen with a live counter
  and a Stop button. The storm escalates through five categories with your
  dollar amount (Flurry → Squall → Cyclone → Hurricane → **The Nuggnado** at
  $8.5M+, complete with vortex swirl and card shake), and each flying nugget
  represents a batch so even a $10M storm wraps up in about a minute. Too
  broke for a storm (under 100 nuggets)? The house comps you a
  1,000,000-nug session.
- **Three games** — switch from the HUD:
  - 🧺 **Catch** — click nuggets out of the air; rare golden nugs are worth 10×.
  - 🔫 **Blaster** — Missile Command, fry-station edition: nuggets rain onto a
    skyline and every landing damages a building (three hits = rubble; lose the
    block and the city rebuilds). Slide the laser cannon (mouse or ← →), blast
    nuggets (click or space), and shoot the falling crates for power-ups —
    ⚡ rapid fire, 🔱 triple shot, 🛡️ city shield.
  - 🐤 **Flappy Nug** — pilot a nugget through scrolling towers of stacked
    nuggets; each gate banks nugs, golden gates pay 10×.
  - 🥣 **Sauce Dunk** — a timing game: nuggets ride a conveyor toward a sauce
    cup; tap SPACE (or click) to dunk each one in the sweet spot. Hit the green
    PERFECT band for double points and chain dunks for a rising combo multiplier;
    golden nuggets pay 10×.
  - 🏃 **Nugget Run** — an endless runner with the arcade's first fully
    animated character: Sprint the nugget (headband, googly eyes, floating
    sneakers) runs a late-night kitchen counter with a real phase-driven run
    cycle. Jump ketchup bottles (space/↑/click), double-jump fry-box towers —
    he does a full flip — and slide under spatula gates (hold ↓). Crashing
    scatters his limbs before he reassembles. 1 point per meter; golden
    mini-nugs +20; the counter speeds up the longer you survive.
  - ⚔️ **Nugget Knight** — hold the castle gate! Sir Nugget (helm, plume,
    round shield, and a sword with a real swing arc) defends a torchlit
    courtyard against waves of waddling sporks (+25), armored sporks (wave 5+,
    two hits, +40), and three-hit Big Forks (+100). ← → move, space jumps
    clean over enemies, click/X slashes; three hearts, brief knockout when
    they run out (and you rise at only half hearts), +50 × wave for a clear.
    **After every wave you choose one of three boons** — character upgrades
    (reach, swing speed, move speed, damage, jump, extra hearts) or castle
    defenses (one-time ember-lobbing torches, a shield that blocks hits, and
    up to four hired **nugget archers** who man the battlements and rain
    arrows) — while the waves get bigger, faster, and meaner.
  - 🧘 **Nugget Simulator** — the calm one. You are a nugget on a park bench,
    watching a full day/night cycle pass every two minutes: sunrises, drifting
    clouds, migrating birds, fireflies, shooting stars. The nugget ages —
    reading glasses at 10 days, a cane at 20 — and wisdom accrues at 1/sec
    (birds +25, shooting stars +100). Two sub-modes: 🌄 the scenic diorama, or
    🕶️ **Ultra Realistic**, which is a pitch-black screen. Nuggets cannot see.
- **Over $10M → a friendly reality check** telling you this maybe isn't the right
  payment method.

## Running it

No build step, no dependencies — plain static HTML/CSS/JS.

**Live site** (auto-deploys from `main` via GitHub Pages):
<https://chrismrobbins.github.io/howmanynuggets/>

Locally, just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## ⚠️ Disclaimer

All prices are **rough regional ESTIMATES**, not live quotes from any specific store.
They start from an assumed national 6-piece McNugget price of **$5.00** (≈ $0.83 each)
and adjust by ZIP-code region. Actual prices are set per franchise and vary by location,
promotions, and tax. This project is **not affiliated with or endorsed by McDonald's**.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup — styles and scripts live in `css/` and `js/` |
| `css/styles.css` | Base app styles |
| `css/storm.css` | Storm layer, HUD, and arcade-mode styles |
| `js/util.js` | Shared number formatters |
| `js/pricing.js` | ZIP → regional price model |
| `js/storm.js` | Storm engine, categories, HUD, mode switch |
| `js/blaster.js` | 🔫 Blaster minigame |
| `js/flappy.js` | 🐤 Flappy Nug minigame |
| `js/dunk.js` | 🥣 Sauce Dunk minigame |
| `js/sim.js` | 🧘 Nugget Simulator (SVG diorama + the void) |
| `css/sim.css` | Simulator animations and layers |
| `js/run.js` | 🏃 Nugget Run (rigged runner, parallax kitchen) |
| `css/run.css` | Runner layer, blink, golden pickups |
| `js/knight.js` | ⚔️ Nugget Knight (combat rig, wave survival) |
| `css/knight.css` | Courtyard layer, torch flicker, hit flashes |
| `js/app.js` | Converter wiring and input formatting |
| `js/api.js` | Client for the accounts + high-scores backend |
| `js/account.js` | Sign in/up UI, high-scores panel, leaderboard modal |
| `css/account.css` | Account, high-score, and leaderboard styles |
| `nugget.png` | Transparent nugget image used everywhere |

## Accounts & high scores (optional backend)

Player accounts and arcade high scores are powered by a small **Cloudflare
Worker + D1** backend under [`worker/`](worker/). It's optional — without it,
the site works exactly as before, just with no sign-in or saved scores.

- **Accounts:** username + display name + password (hashed with PBKDF2 —
  never stored in plaintext). Sessions keep you logged in across visits.
- **High scores:** best score per game (`catch`, `blaster`, `flappy`), shown in
  the "Your High Scores" panel.
- **Leaderboards:** rankings per game, including where you place.

> ⚠️ The sign-up form warns users **not to reuse a real password** — this is a
> hobby project with best-effort security.

See [`worker/README.md`](worker/README.md) for one-time setup (create the D1
database, apply `schema.sql`, deploy the Worker). The frontend talks to
`https://api.howmanynuggets.com` by default; override with
`window.NUGGET_API_BASE` for local dev.
