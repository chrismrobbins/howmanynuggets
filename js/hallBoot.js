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

  global.HallBoot = {
    job: job,
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
