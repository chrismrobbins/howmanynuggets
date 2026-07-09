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
- **$1M–$10M → 🌪️ Nugget Storm** → nuggets fly across the whole screen until the
  full count has flown by, with a live counter and a Stop button.
- **Over $10M → a friendly reality check** telling you this maybe isn't the right
  payment method.

## Running it

No build step, no dependencies — it's a single static HTML file.

Just open `index.html` in a browser, or serve the folder:

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
| `index.html` | The entire app (HTML + CSS + JS) |
| `nugget.png` | Transparent nugget image used for the hero, grid, and storm |
