# 🍗 Nugget Currency — browser extension

Sees every USD price on the web and annotates it with what it's really worth:
chicken nuggets, using the same ZIP-code regional price model as
[howmanynuggets.com](https://howmanynuggets.com).

`$29.99` becomes `$29.99 ≈ 36 🍗` — annotated, never replaced, so checkout
flows and copy-paste keep working.

## Status — ⏳ ready to publish, blocked on a Chrome dev account

The extension is code-complete and verified; it just isn't on the Chrome Web
Store yet. **To ship it, Chris needs to register a Chrome Web Store developer
account** (one-time $5 at <https://chrome.google.com/webstore/devconsole>).

Once that account exists, publishing is quick:

1. Zip the **contents** of this `extension/` folder (not the folder itself).
2. Upload the zip in the developer dashboard and fill in the listing.
3. Add listing assets: screenshots (1280×800) + a small promo tile. (Claude can
   generate these on request.)
4. Privacy disclosure is trivial — **the extension collects nothing and makes
   zero network requests**; the only stored data is the user's ZIP/preferences
   in `chrome.storage.sync`.

Until then it runs fine unpacked (see **Install** below). **Chris — ping the
dev-account setup when you get a chance so we can list it.**

## Features (v1)

- **Regional pricing** — set your ZIP in the popup; the estimate uses the
  site's REGIONS/METROS tables (`pricing.js` is shared verbatim).
- **Display units** — nuggets, six-piece boxes, or auto-scale (nugs → boxes →
  "a Nugget Storm's worth" at $1M+; over $10M is simply *not nug-payable*).
- **Dynamic pages** — a debounced MutationObserver annotates SPA/infinite-scroll
  content; capped at 600 annotations per page for performance.
- **Amazon split prices** — handled via the hidden `.a-offscreen` full price.
- **Per-site + master toggles** in the popup (changes apply on refresh).
- **Easter eggs** — the first $1M–$10M price on a page summons a mini nugget
  storm; over $10M earns the traditional roast toast.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select this `extension/` folder

## Publishing to the Chrome Web Store

The folder is store-ready: zip the contents of `extension/` (not the folder
itself) and upload via the [developer dashboard](https://chrome.google.com/webstore/devconsole)
(one-time $5 registration). Listing still needs: screenshots (1280×800), a
promo tile, and a short privacy disclosure — easy: **this extension collects
nothing**; the only stored data is your ZIP/preferences in `chrome.storage.sync`,
and it makes zero network requests.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest |
| `content.js` | Price detection, annotation, storm/roast easter eggs |
| `content.css` | Annotation + easter-egg styles |
| `pricing.js` | ZIP → regional 6-piece price model (copy of `/js/pricing.js`) |
| `popup.html/js/css` | Settings popup |
| `icons/` | 16/48/128 icons generated from `nugget.png` |
