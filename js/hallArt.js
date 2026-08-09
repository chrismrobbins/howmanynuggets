// ---- HALL ART DEPARTMENT (loader) --------------------------------------------
// "The lease said AS-IS. We said OTHERWISE." — THE GRAND REOPENING
//
// Every surface in the Nugget Arcade hall — and the street outside, and the
// regulars who loiter on it — was modeled and lit in Blender (blender/
// hallrig.py), rendered at 4x and packed into one sheet. The painters in
// js/arcade-art.js blit their regions from it and keep their procedural rigs as
// fallback: if the sheet fails to decode, the hall degrades to the old paint,
// never to black. Text stays runtime-crisp on top.
//
// THIS FILE IS THE LOADER, and it is the only part in index.html. The sheet
// itself lives in js/hallArtData.js (~450KB of base64) and is injected as an
// async <script> after first paint, exactly like the geometry in js/hallMesh.js
// — the CONVERTER is the product and must never wait on arcade art. The wait
// happens at the arcade door instead, on the boot screen (js/hallBoot.js).
//
// A <script> and not fetch(): the site must work from disk, where fetch is
// blocked by origin rules.
//
// Regeneration: blender/hallrig.py (render_all) -> blender/pack_hall.py, which
// writes BOTH this file's data sibling and the region table inside it.
// Regions are [x, y, w, h] in sheet pixels.

const HallArt = (() => {
  const img = new Image();
  let regions = {};
  let ok = false, state = 'idle';
  const waiting = [];

  function settle(good) {
    if (state === 'done' || state === 'failed') return;
    state = good ? 'done' : 'failed';
    ok = !!good;
    if (job) job.done(ok);
    if (api.onReady) { try { api.onReady(); } catch (e) { /* never break init */ } }
    const w = waiting.splice(0);
    for (const cb of w) { try { cb(); } catch (e) { } }
  }

  const job = (typeof HallBoot !== 'undefined')
    ? HallBoot.job('art', 'STRIPPING THE WALLPAPER', 3) : null;

  function load() {
    if (state !== 'idle') return;
    state = 'loading';
    const start = (data) => {
      regions = data.r || {};
      api.R = regions;
      if (job) job.step(0.55);          // bytes are in; the decode is act two
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      img.src = 'data:image/jpeg;base64,' + data.s;
    };
    if (window.__HALL_ART__) return start(window.__HALL_ART__);
    if (typeof HallBoot === 'undefined') return settle(false);
    HallBoot.inject('hallArtData.js', (got) => {
      if (got && window.__HALL_ART__) start(window.__HALL_ART__);
      else settle(false);
    });
  }

  // Fill the current painter's region (painters run inside a translate+clip,
  // so the destination is always 0,0..w,h). Returns false -> caller paints
  // its procedural fallback.
  function blit(g, name, w, h) {
    const r = regions[name];
    if (!api.on() || !r) return false;
    g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, w, h);
    return true;
  }

  const api = {
    on: () => ok,
    blit,
    img,
    R: regions,
    onReady: null,
    ready: () => state === 'done',
    settled: () => state === 'done' || state === 'failed',
    whenReady: (cb) => { if (api.settled()) return cb(); waiting.push(cb); load(); },
    load,
  };

  // Start immediately, but off the critical path.
  if (typeof document !== 'undefined') load();
  return api;
})();
