/* js/hallBoot.js — the arcade's asset ledger.
 *
 * The hall used to be free: procedural canvases, boxes made of numbers, one
 * 278KB nugget.png for the whole site. It is not free anymore. Blender-rendered
 * paint, Blender-authored geometry and (from THE POWER PLANT on) full material
 * map sets are megabytes of payload, and the decision on record is that this is
 * FINE — spend the bytes on quality and move them off the critical path.
 *
 * "Off the critical path" needs somewhere to put the waiting, and that is the
 * arcade's boot screen. Every heavy payload registers a job here before it
 * starts loading; the loader overlay in js/arcade.js reads the ledger to draw a
 * bar that is telling the truth instead of animating a lie.
 *
 * Nothing here ever blocks the CONVERTER. The calculator is the product; the
 * arcade is the thing behind the door, and the door is where people wait.
 *
 *   HallBoot.job(key, label, weight)  -> handle; call .done(ok) when settled
 *   HallBoot.progress()               -> {frac, label, done, total, settled}
 *   HallBoot.onChange(cb)             -> called on every job settle
 *   HallBoot.whenAll(cb)              -> called once everything has settled
 *   HallBoot.inject(url, onDone)      -> async <script>, resolved next to this file
 *   HallBoot.handheld()               -> is this a phone/tablet (see THE DOORMAN'S GLANCE)
 *   HallBoot.warm()                   -> start every hall payload (call on door intent)
 *
 * `inject` uses a <script> and not fetch() on purpose: this site must work from
 * disk, where fetch is blocked by origin rules (blender/HANDOFF.md §9).
 */
(function (global) {
  'use strict';

  var jobs = [], listeners = [], allCbs = [];

  function settledAll() {
    for (var i = 0; i < jobs.length; i++) if (!jobs[i].settled) return false;
    return true;
  }

  function fire() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* a bar must never break a boot */ }
    }
    if (jobs.length && settledAll()) {
      var cbs = allCbs; allCbs = [];
      for (var j = 0; j < cbs.length; j++) { try { cbs[j](); } catch (e) { } }
    }
  }

  function job(key, label, weight) {
    var j = {
      key: key,
      label: label || key,
      weight: weight > 0 ? weight : 1,
      settled: false,
      ok: false,
      // Some payloads land in two acts (bytes arrive, then the image decodes).
      // A job can report partial credit so the bar keeps moving through act two.
      part: 0,
      step: function (frac) {
        if (this.settled) return;
        this.part = Math.max(this.part, Math.min(1, frac || 0));
        fire();
      },
      done: function (ok) {
        if (this.settled) return;
        this.settled = true; this.ok = !!ok; this.part = 1;
        fire();
      },
    };
    jobs.push(j);
    fire();
    return j;
  }

  function progress() {
    var total = 0, got = 0, label = '', pending = 0;
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      total += j.weight;
      got += j.weight * (j.settled ? 1 : j.part);
      if (!j.settled) { pending++; if (!label) label = j.label; }
    }
    return {
      frac: total ? got / total : 1,
      label: label,
      done: jobs.length - pending,
      total: jobs.length,
      settled: settledAll(),
    };
  }

  // Resolve a sibling URL against wherever this script actually lives, so the
  // page still finds its assets from a subdirectory or from file://.
  var BASE = (function () {
    try {
      var here = document.currentScript && document.currentScript.src;
      if (here) return here.replace(/[^/]*$/, '');
    } catch (e) { }
    return 'js/';
  }());

  function inject(url, onDone, timeoutMs) {
    var fired = false;
    function settle(ok) { if (fired) return; fired = true; onDone(ok); }
    try {
      var s = document.createElement('script');
      s.src = /^[a-z]+:|^\//i.test(url) ? url : BASE + url;
      s.async = true;
      s.onload = function () { settle(true); };
      s.onerror = function () { settle(false); };
      document.head.appendChild(s);
      setTimeout(function () { settle(false); }, timeoutMs || 30000);
    } catch (err) {
      settle(false);
    }
  }

  // 📱 THE DOORMAN'S GLANCE — is the machine at the door a handheld?
  //
  // Every signal perfTier() reads is BLIND on iOS Safari. navigator.deviceMemory
  // is not implemented there at all, so its `|| 8` default calls every iPhone an
  // eight-gigabyte workstation; hardwareConcurrency reports 4 or more; and the
  // renderer string is "Apple GPU", which matches none of the software-rasteriser
  // patterns. An iPhone therefore graded 'high' — the full desktop hall, three
  // 4096² atlas pages — and Safari killed the tab for it rather than paint it.
  // (A friend of Beau's, 2026-09-11: "A problem repeatedly occurred". That is
  // not a script error, it is the WebContent process being taken out and shot.)
  //
  // So ask the question the DISPLAY will answer instead of the one the GPU
  // won't: a coarse primary pointer on a stack that has touch events is a phone
  // or a tablet, on every engine, with no vendor sniffing and no UA string.
  // A touchscreen laptop driven by a mouse reports `fine` and stays a desktop.
  var handheldMemo = null;
  function handheld() {
    if (handheldMemo !== null) return handheldMemo;
    var r = false;
    try {
      var touch = ('ontouchstart' in global) || (global.navigator || {}).maxTouchPoints > 0;
      var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
      r = !!(touch && coarse);
    } catch (e) { r = false; /* anything that throws is a desktop */ }
    handheldMemo = r;
    return r;
  }

  // 🚪 THE PAYLOAD STARTS AT THE DOOR, NOT AT THE CURB.
  //
  // These four loaders used to call load() at parse time — "off the critical
  // path", which was true of TIME and never true of MEMORY. The converter page
  // decoded 198MB of pixels (two 4096² map pages, a 4096×3380 sheet, a 4096×512
  // panorama) for every visitor, including the ones who came to divide a number
  // by five dollars and left. Off the critical path is not off the heap.
  //
  // Nothing is lost by waiting: enter() has always kicked every loader through
  // whenReady() and held the boot screen until they settle. warm() just moves
  // that kick one beat earlier — to the first sign the player is reaching for
  // the door — so the people who DO walk in don't pay for the deferral.
  //
  // ⚠️ BARE IDENTIFIERS, not global.HallArt — three of these four loaders are a
  // top-level `const` in a classic script, and a script-level const/let lives in
  // the global LEXICAL environment, never as a property of window. `global.HallArt`
  // is undefined; `HallArt` resolves fine up the scope chain at call time. The
  // first cut of this function used global.* and silently warmed only HallMesh
  // (the one file that assigns itself onto global explicitly) — the hall still
  // came up, because enter() kicks the rest through whenReady(), which is exactly
  // the kind of half-working that never shows up in a screenshot.
  function warm() {
    try { if (typeof HallArt !== 'undefined' && HallArt.load) HallArt.load(); } catch (e) { }
    try { if (typeof HallMaps !== 'undefined' && HallMaps.load) HallMaps.load(); } catch (e) { }
    try { if (typeof HallMesh !== 'undefined' && HallMesh.load) HallMesh.load(); } catch (e) { }
    try { if (typeof HallSky !== 'undefined' && HallSky.load) HallSky.load(); } catch (e) { }
  }

  global.HallBoot = {
    job: job,
    handheld: handheld,
    warm: warm,
    progress: progress,
    inject: inject,
    jobs: function () { return jobs.slice(); },
    onChange: function (cb) { listeners.push(cb); },
    whenAll: function (cb) {
      if (jobs.length && settledAll()) return cb();
      allCbs.push(cb);
    },
  };
}(typeof window !== 'undefined' ? window : this));
