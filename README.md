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
| `js/app.js` | Converter wiring and input formatting |
| `nugget.png` | Transparent nugget image used everywhere |
