/* js/hallMaps.js — loader for the hall's MATERIAL maps (THE POWER PLANT).
 *
 * js/hallArt.js ships what every surface looks like. This ships the rest of
 * what Blender knows about it:
 *
 *   'n'  tangent-space NORMAL map  — baked from the same 3D geometry that
 *        hallrig.py renders the colour pass from, so the relief is real
 *        modelling and not a filter run over a photo of itself.
 *   's'  the ORM page — r = roughness, g = metalness, b = how much of the
 *        WebGL2 material shader this region has opted into (see the migration
 *        note in blender/HANDOFF.md §10). b = 0 means "render me exactly the
 *        way the hall did last year", which is what everything unmapped gets.
 *
 * Normals ship LOSSLESS (PNG). A JPEG normal map's block artifacts turn into
 * lighting that swims when the camera moves — the one place in this repo where
 * the payload rule bends, and it bends toward more bytes, not fewer.
 *
 * Loaded async through the boot ledger like everything else heavy. If it never
 * lands, ArcadeArt paints flat normals and an inert ORM page and the hall looks
 * exactly as it did before this file existed. Nothing here can break the hall.
 *
 *   HallMaps.on()                       -> are the maps usable
 *   HallMaps.blit(kind, g, name, w, h)  -> false = caller paints its default
 *
 * Regeneration: blender/hallrig.py (render_maps) -> blender/pack_maps.py.
 */
const HallMaps = (() => {
  const imgs = { n: new Image(), s: new Image() };
  let regions = {};
  let ok = false, state = 'idle', pending = 0;
  const waiting = [];

  const job = (typeof HallBoot !== 'undefined')
    ? HallBoot.job('maps', 'HANGING THE LIGHTS', 3) : null;

  function settle(good) {
    if (state === 'done' || state === 'failed') return;
    state = good ? 'done' : 'failed';
    ok = !!good;
    if (job) job.done(ok);
    const w = waiting.splice(0);
    for (const cb of w) { try { cb(); } catch (e) { } }
  }

  function start(data) {
    regions = data.r || {};
    api.R = regions;
    const kinds = ['n', 's'].filter((k) => data[k]);
    if (!kinds.length) return settle(false);
    pending = kinds.length;
    if (job) job.step(0.5);
    let bad = false;
    for (const k of kinds) {
      imgs[k].onload = () => { if (!--pending) settle(!bad); };
      imgs[k].onerror = () => { bad = true; if (!--pending) settle(false); };
      imgs[k].src = 'data:image/png;base64,' + data[k];
    }
  }

  function load() {
    if (state !== 'idle') return;
    state = 'loading';
    if (window.__HALL_MAPS__) return start(window.__HALL_MAPS__);
    if (typeof HallBoot === 'undefined') return settle(false);
    HallBoot.inject('hallMapsData.js', (got) => {
      if (got && window.__HALL_MAPS__) start(window.__HALL_MAPS__);
      else settle(false);
    });
  }

  // Painters run inside a translate+clip, so the destination is always 0,0..w,h.
  function blit(kind, g, name, w, h) {
    const r = regions[name];
    if (!api.on() || !r || !imgs[kind]) return false;
    g.drawImage(imgs[kind], r[0], r[1], r[2], r[3], 0, 0, w, h);
    return true;
  }

  const api = {
    on: () => ok,
    blit,
    imgs,
    R: regions,
    ready: () => state === 'done',
    settled: () => state === 'done' || state === 'failed',
    whenReady: (cb) => { if (api.settled()) return cb(); waiting.push(cb); load(); },
    load,
  };

  if (typeof document !== 'undefined') load();
  return api;
})();
