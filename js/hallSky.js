// ---- THE SKYLINE (loader) ----------------------------------------------------
// "Nuggetown does not stop at the end of the street." — THE HORIZON
//
// The city behind the street used to be a GLSL function: one hash for the
// height of the block at this bearing, a second for which of its windows were
// still on. No mesh, no texture, no seam. It also looked like a bar chart.
//
// It is 156 modelled towers now — setbacks, water tanks on legs, masts,
// deco crowns, rooftop plant — rendered from blender/skyline.py as one
// equirectangular panorama and packed by blender/pack_sky.py.
//
// THE PANORAMA IS NOT A PICTURE OF THE SKY. It carries data, and the shader
// still mixes the colour from the SKY palette in js/arcade.js:
//
//   R = haze     how much air is in front of this pixel
//   G = window   lit-pane mask, with per-pane brightness in its value
//   B = shade    surface orientation against a fixed key
//   A = coverage the silhouette
//
// Only the SHAPE is baked. Retune the palette and the city retunes with it,
// which is the contract the dome, the fog, the ambient and the wet road are
// already on. See FS_SKY in js/arcade.js.
//
// THIS FILE IS THE LOADER, and it is the only part in index.html. The panorama
// itself lives in js/hallSkyData.js (base64 PNG) and is injected as an async
// <script> after first paint — a <script> and not fetch(), because the site
// must work from disk where fetch is blocked by origin rules. Same pattern as
// js/hallArt.js and js/hallMesh.js, same reason.
//
// If it never decodes, HallSky.on() is false and the shader runs the
// procedural ridge it always had. The sky is never missing.

const HallSky = (() => {
  const img = new Image();
  let ok = false, state = 'idle';
  // Latitude band the panorama covers, in radians — written by pack_sky.py
  // from skyline.py's own LAT_MIN/LAT_MAX so the two can never disagree.
  let lat = [-0.0698, 0.7330];
  const waiting = [];

  const job = (typeof HallBoot !== 'undefined')
    ? HallBoot.job('sky', 'RAISING THE SKYLINE', 4) : null;

  function settle(good) {
    if (state === 'done' || state === 'failed') return;
    state = good ? 'done' : 'failed';
    ok = !!good;
    if (job) job.done(ok);
    if (api.onReady) { try { api.onReady(); } catch (e) { /* never break init */ } }
    for (const cb of waiting.splice(0)) { try { cb(); } catch (e) { } }
  }

  function load() {
    if (state !== 'idle') return;
    state = 'loading';
    const start = (data) => {
      if (data.lat) { lat = data.lat; api.lat = lat; }
      if (job) job.step(0.55);          // bytes are in; the decode is act two
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      img.src = 'data:image/png;base64,' + data.s;
    };
    if (window.__HALL_SKY__) return start(window.__HALL_SKY__);
    if (typeof HallBoot === 'undefined') return settle(false);
    HallBoot.inject('hallSkyData.js', (got) => {
      if (got && window.__HALL_SKY__) start(window.__HALL_SKY__);
      else settle(false);
    });
  }

  const api = {
    on: () => ok,
    img,
    lat,
    onReady: null,
    ready: () => state === 'done',
    settled: () => state === 'done' || state === 'failed',
    whenReady: (cb) => { if (api.settled()) return cb(); waiting.push(cb); load(); },
    load,
  };

  if (typeof document !== 'undefined') load();
  return api;
})();
