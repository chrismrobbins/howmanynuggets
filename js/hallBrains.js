/* js/hallBrains.js — 🧠 THE NEIGHBOURHOOD: the street regulars, alive.
 *
 * AFTER HOURS (js/regulars.js) proved the regulars could have brains of their
 * own on a seven-metre set. This puts the same brains on the REAL street outside
 * the hall — the forty metres of Nuggetown the player walks — so the people
 * every arcade visitor passes are not standing on marks waiting to be clicked.
 *
 * Same design, retuned for this street:
 *   NEEDS drift (energy, social, curiosity, duty) → ACTIVITIES score themselves
 *   against them and against the street → a COMMITMENT bonus stops dithering →
 *   activities can ENGAGE another regular (Dill interviews, the Hood whispers).
 *
 *   Big Crumb   guards the hall doors, walks the frontage, shoos the hen, dozes
 *   Det. Dill   interviews, crosses the road to the storm drain, works the CASE
 *               BOARD, tails the Hood — who notices, and leaves by the archway
 *   The Hood    lurks at the dark ends of the street, whispers, listens at the drain
 *   Gravy Jones does not get up (canon). Dozes. Mutters.
 *   Henrietta   pecks, wanders, roosts on Gravy's bench, follows Dill
 *
 * THE PASSING (casefile facts 4/7): every minute or two the storm-drain grate
 * blazes gold and everyone reacts. It goes back under. Case open.
 *
 * THIS FILE OWNS ONLY THE MINDS. arcade.js owns the bodies: it reads what this
 * writes on each NPC record and turns it into poses, and it moves each regular's
 * hotspot / glow / collision box to follow them.
 *
 *   written per NPC: x z yBase hidden walk walkPh heading brainYaw
 *                    bWrite bStoop bPeck bSleep bLean bNod bTalk bShoo bFlap
 *
 * The PLAYER is part of the street: a regular you walk up to stops what it is
 * doing and looks at you (nobody walks off mid-approach), and one you are
 * talking to is parked until you leave.
 *
 *   HallBrains.attach(npcs, world)    world: bounds, boxes, pois, overlay, project, flag
 *   HallBrains.step(dt, t, ctx)       ctx: { px, pz, dialogNpc, outside }
 *   HallBrains.passing()              force THE PASSING (tests)
 *   HallBrains.state()
 *   HallBrains.off                    true = everyone stays on their marks (harness)
 */
(function (global) {
  'use strict';

  var HB = { off: false, ready: false };
  var A = [], by = {}, W = null, T = 0, doc = global.document;

  // ---- utils ----------------------------------------------------------------------
  var seed = 7;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }
  function flag(fn) { try { return W && W.flag ? !!W.flag(fn) : false; } catch (e) { return false; } }

  var NAMES = { crumb: 'Big Crumb', dill: 'Det. Dill', hood: 'the Hooded Nug', gravy: 'Gravy Jones', hen: 'Henrietta' };
  var LINES = {
    crumb: ["I heard nothing. That's what bothers me.", "Hall's open. No outside sauce.", 'Keep the bird off the mat.', 'I filed a report. Nobody read it.'],
    dill: ['Case is open. Case stays open.', 'Everything in this town is the weather.', 'No crumbs. There are always crumbs.', 'If it glows, write it down. Twice.'],
    hood: ['Rumor seven: it cheered.', 'The pipes hum when it goes by.', 'All water in this town is the same water.', 'Ask who poured the fort.'],
    gravy: ['...I don\'t get up.', 'My nephew samples it. Kids.', '...again with the drain.', 'Mustard crowd owned this corner once.'],
    hen: ['bwok.', 'bwok?', '...bwok.'],
  };
  function lineFor(n) {
    var L = LINES[n].slice();
    if (n === 'dill' && flag('reelStormLanded')) L.push('You landed it off the pier. It went back under.');
    if (n === 'hood' && flag('drainSawStorm')) L.push('You saw it in the mains. Now you hear it.');
    if (n === 'gravy' && flag('beatEncoreDone')) L.push("Heard the boy's encore? Proud of him. Don't tell him.");
    return pick(L);
  }

  // ---- bubbles (DOM, projected by arcade.js's camera) ------------------------------
  function bubble(a, emoji, text, secs) {
    if (!W || !W.overlay) return;
    if (a.bub && a.bub.el) a.bub.el.remove();
    var el = doc.createElement('div');
    el.className = 'rg-bubble rg-' + a.n.id + (text ? '' : ' rg-emoji-only');
    el.innerHTML = (emoji ? '<span class="rg-b-emo">' + emoji + '</span>' : '') + (text ? '<span class="rg-b-txt"></span>' : '');
    if (text) el.querySelector('.rg-b-txt').textContent = text;
    W.overlay.appendChild(el);
    a.bub = { el: el, until: T + (secs || 2.5) };
    requestAnimationFrame(function () { el.classList.add('on'); });
  }
  function say(a, text, secs) { bubble(a, '', text, secs); a.n.bTalk = 1; }
  function tickBubbles(ctx) {
    A.forEach(function (a) {
      var b = a.bub; if (!b) return;
      var gone = T > b.until || a.n.hidden || (ctx.dialogNpc === a.n);
      if (gone) { b.el.classList.remove('on'); var el = b.el; setTimeout(function () { el.remove(); }, 260); a.bub = null; return; }
      var p = W.project(a.n.x, (a.n.yBase || 0) + (a.n.h || 1) + 0.22, a.n.z);
      // hide behind the camera, too far away, or off the edge — a bubble for
      // someone forty metres down the street is noise
      var far = dist(ctx.px, ctx.pz, a.n.x, a.n.z) > 16;
      if (!p || far) { b.el.style.visibility = 'hidden'; return; }
      b.el.style.visibility = '';
      b.el.style.transform = 'translate(-50%, -100%) translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
    });
  }

  // ---- steering ----------------------------------------------------------------------
  // Arrive at (tx,tz) around the street's prop boxes, each other and the player.
  function steer(a, tx, tz, dt, mul) {
    var n = a.n, dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    var want = a.speed * (mul || 1) * clamp(d / 0.7, 0, 1);
    var fx = d > 1e-4 ? dx / d * want : 0, fz = d > 1e-4 ? dz / d * want : 0;
    function pushPoint(px, pz, rad, k) {
      var ex = n.x - px, ez = n.z - pz, e = Math.hypot(ex, ez), lim = rad + a.r + 0.15;
      if (e < lim && e > 1e-4) { var s = (lim - e) / lim * k; fx += ex / e * s; fz += ez / e * s; }
    }
    var boxes = W.boxes();
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b === n.box || b.max[1] < 0.25) continue;   // not my own box; kerbs and mats aren't walls
      var cx = clamp(n.x, b.min[0], b.max[0]), cz = clamp(n.z, b.min[2], b.max[2]);
      pushPoint(cx, cz, 0.05, 2.4);
    }
    A.forEach(function (o) { if (o !== a && !o.n.hidden) pushPoint(o.n.x, o.n.z, o.r, 1.6); });
    if (a.ctx) pushPoint(a.ctx.px, a.ctx.pz, 0.35, 2.0);
    var k = Math.min(1, dt * 5);
    a.vx += (fx - a.vx) * k; a.vz += (fz - a.vz) * k;
    n.x += a.vx * dt; n.z += a.vz * dt;
    if (!a.offstage) { var B = W.bounds; n.x = clamp(n.x, B.x0, B.x1); n.z = clamp(n.z, B.z0, B.z1); }
    var sp = Math.hypot(a.vx, a.vz);
    n.walk = clamp(sp / a.speed, 0, 1);
    if (sp > 0.06) n.heading = Math.atan2(a.vx, a.vz);
    n.walkPh = (n.walkPh || 0) + sp * dt * a.gait;
    return d;
  }
  function stand(a, dt) {
    a.vx *= Math.pow(0.02, dt); a.vz *= Math.pow(0.02, dt);
    a.n.x += a.vx * dt; a.n.z += a.vz * dt;
    var sp = Math.hypot(a.vx, a.vz);
    a.n.walk = clamp(sp / Math.max(0.01, a.speed), 0, 1);
    a.n.walkPh = (a.n.walkPh || 0) + sp * dt * a.gait;
  }
  function face(a, x, z) { a.n.brainYaw = Math.atan2(x - a.n.x, z - a.n.z); }
  function goThenDo(tx, tz, mul, then) {
    var st = { go: true, t: 0 };
    return function (a, dt) {
      st.t += dt;
      if (st.go) { if (steer(a, tx, tz, dt, mul) < 0.12 || st.t > 22) { st.go = false; st.t = 0; } return false; }
      stand(a, dt);
      return then(a, dt, st.t);
    };
  }
  function clearFlags(n) { n.bWrite = n.bStoop = n.bPeck = n.bSleep = n.bLean = n.bNod = n.bShoo = n.bFlap = 0; }

  // ---- the brain ---------------------------------------------------------------------
  function free(b) { return b && !b.n.hidden && !b.engagedBy && !(b.act && b.act.busy) && !b.byPlayer; }
  function setAct(a, act) {
    if (a.act && a.act.end) a.act.end(a);
    clearFlags(a.n); a.n.brainYaw = null;
    a.act = act; a.actT = 0;
    if (act && act.begin) act.begin(a);
  }
  function engage(by, t) {
    t.engagedBy = by;
    setAct(t, { id: 'engaged', busy: true, tick: function (x, dt) { if (!x.engagedBy) return true; stand(x, dt); face(x, x.engagedBy.n.x, x.engagedBy.n.z); return false; } });
  }
  function release(t) { if (!t) return; t.engagedBy = null; if (t.act && t.act.id === 'engaged') t.act = null; t.thinkT = 0; }
  function find(a, id) { for (var i = 0; i < a.acts.length; i++) if (a.acts[i].id === id) return a.acts[i]; return null; }

  function fleeFrom(h, fx, fz) {
    if ((h.n.yBase || 0) > 0.05) return; // up on the bench: safe
    setAct(h, { id: 'flee', busy: true,
      begin: function (a) { bubble(a, '❗', pick(['BWOK!', 'bwok!!']), 1.5); },
      tick: function (a, dt) { var dx = a.n.x - fx, dz = a.n.z - fz, d = Math.hypot(dx, dz) || 1; steer(a, a.n.x + dx / d * 3, a.n.z + dz / d * 3, dt, 2.4); a.n.bFlap = 1; return a.actT > 1.8; } });
  }

  function ACTS(id) {
    var P = W.pois;
    if (id === 'crumb') return [
      { id: 'guard', score: function (a) { return 0.55 + a.needs.duty * 0.5; },
        begin: function (a) { a.plan = goThenDo(a.home.x, a.home.z, 1, function (x, dt, t) { x.n.brainYaw = null; x.needs.duty = Math.max(0, x.needs.duty - dt * 0.02); return t > rr(10, 18); }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'patrol', score: function (a) { return 0.2 + (1 - a.needs.duty) * 0.5; },
        begin: function (a) { var tx = a.home.x + pick([-5.5, -3, 3.5, 5.5]), back = false;
          a.plan = function (x, dt) { var d = steer(x, back ? x.home.x : tx, back ? x.home.z : x.home.z + 0.6, dt, 0.8); if (d < 0.15) { if (back) return true; back = true; x.needs.duty = 1; } return false; }; },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'shoo', score: function (a) { var h = by.hen; return (h && !h.n.hidden && (h.n.yBase || 0) < 0.05 && dist(h.n.x, h.n.z, a.home.x, a.home.z) < 1.8 && !(a.cool.shoo > T)) ? 1.3 : 0; },
        begin: function (a) { a.cool.shoo = T + 18; say(a, pick(['Scram.', 'Off the mat.', 'Not tonight, bird.']), 2.6);
          a.plan = function (x, dt) { var h = by.hen; x.n.bShoo = 1; var d = steer(x, h.n.x, h.n.z, dt, 1.25); if (d < 0.9 && (!h.act || h.act.id !== 'flee')) fleeFrom(h, x.n.x, x.n.z); return d < 0.85 || x.actT > 4; }; },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'doze', score: function (a) { return a.needs.energy < 0.28 ? 0.95 : 0; },
        begin: function (a) { bubble(a, '💤', '', 5); a.plan = goThenDo(a.home.x, a.home.z, 0.8, function (x, dt, t) { x.n.bSleep = 1; x.needs.energy = Math.min(1, x.needs.energy + dt * 0.07); return t > 14; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
    ];
    if (id === 'dill') return [
      { id: 'interview', score: function (a) {
          var c = ['gravy', 'crumb', 'hood'].filter(function (k) { var b = by[k]; return free(b) && !(a.cool[k] > T) && dist(b.n.x, b.n.z, a.n.x, a.n.z) < 26; });
          a.cand = c.length ? pick(c) : null; return a.cand ? 0.42 + a.needs.social * 0.6 + rnd() * 0.12 : 0; },
        begin: function (a) {
          var t = by[a.cand]; a.target = t; a.cool[t.id] = T + 50;
          var asked = false; a.answered = false;
          a.plan = function (x, dt) {
            if (!asked) {
              if (t.n.hidden) return true;
              var fx = Math.sin(t.n.curYaw || 0), fz = Math.cos(t.n.curYaw || 0), gap = t.r + x.r + 0.35;
              var ox = clamp(t.n.x + fx * gap, W.bounds.x0, W.bounds.x1), oz = clamp(t.n.z + fz * gap, W.bounds.z0, W.bounds.z1);
              if (steer(x, ox, oz, dt, 1) > 0.18 && x.actT < 20) return false;
              asked = true;
              if (t.id === 'hood' && rnd() < 0.55) { say(t, pick(['No comment.', 'Ask the water.']), 2.6); setAct(t, find(t, 'vanish')); return true; }
              if (!free(t)) return true;
              engage(x, t); x.convo = 0;
              bubble(x, '📝', pick(['Where were you at 3:04?', 'Walk me through it.', 'Anything golden tonight?', 'Hear the pipes?']), 3.2);
            }
            stand(x, dt); face(x, t.n.x, t.n.z); x.n.bWrite = 1; x.convo += dt;
            if (x.convo > 3.4 && !x.answered) { x.answered = true; say(t, lineFor(t.id), 3.4); }
            x.needs.social = Math.max(0, x.needs.social - dt * 0.08);
            return x.convo > 7.6;
          };
        },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { if (a.target && a.target.engagedBy === a) release(a.target); } },
      { id: 'drain', score: function (a) { return P.drain ? 0.22 + a.needs.curiosity * 0.6 : 0; },
        begin: function (a) { a.plan = goThenDo(P.drain.x + 0.3, P.drain.z - 1.15, 1, function (x, dt, t) { face(x, P.drain.x, P.drain.z); x.n.bStoop = Math.min(1, t * 1.5); x.n.bWrite = t > 2 ? 1 : 0; x.needs.curiosity = Math.max(0, x.needs.curiosity - dt * 0.06); return t > 9; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'board', score: function (a) { return P.board ? 0.18 + a.needs.duty * 0.45 : 0; },
        begin: function (a) { if (rnd() < 0.5) bubble(a, '🗂️', pick(['Exhibit pending.', 'One more string.', 'Still open.']), 2.6);
          a.plan = goThenDo(P.board.x, P.board.z + 0.95, 1, function (x, dt, t) { face(x, P.board.x, P.board.z); x.n.bWrite = 1; x.needs.duty = Math.max(0, x.needs.duty - dt * 0.05); return t > 8; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'tail', score: function (a) { var h = by.hood; return (h && !h.n.hidden && h.n.walk > 0.3 && !(a.cool.tail > T)) ? 0.8 + rnd() * 0.2 : 0; },
        begin: function (a) { a.cool.tail = T + 40; bubble(a, '👀', '', 2);
          a.plan = function (x, dt) { var h = by.hood; if (h.n.hidden) { say(x, pick(['...gone again.', 'Of course.', 'Underlined twice.']), 2.6); return true; }
            var dx = h.n.x - x.n.x, dz = h.n.z - x.n.z, d = Math.hypot(dx, dz);
            if (d > 2.4) steer(x, h.n.x - dx / d * 2.1, h.n.z - dz / d * 2.1, dt, 0.95); else { stand(x, dt); face(x, h.n.x, h.n.z); x.n.bWrite = 1; }
            return x.actT > 22; }; },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'pace', score: function () { return 0.2 + rnd() * 0.1; },
        begin: function (a) { var tx = a.home.x + rr(-4, 4), tz = rr(1.2, 5.5); if (rnd() < 0.4) bubble(a, '🤔', pick(['3:04 AM...', 'the pipes...', 'no crumbs...']), 2.4);
          a.plan = goThenDo(tx, tz, 0.7, function (x, dt, t) { x.n.bWrite = 1; return t > 4; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
    ];
    if (id === 'hood') return [
      { id: 'lurk', score: function () { return 0.5 + rnd() * 0.15; },
        begin: function (a) { var s = pick(P.lurk); a.plan = goThenDo(s.x, s.z, 0.8, function (x, dt, t) { x.n.brainYaw = null; return t > rr(12, 20); }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'whisper', score: function (a) { var c = ['gravy', 'crumb'].filter(function (k) { return free(by[k]) && !(a.cool[k] > T); }); a.cand = c.length ? pick(c) : null; return a.cand ? 0.28 + a.needs.social * 0.6 : 0; },
        begin: function (a) {
          var t = by[a.cand]; a.target = t; a.cool[t.id] = T + 60; var asked = false; a.heard = false;
          a.plan = function (x, dt) {
            if (!asked) { var side = x.n.x < t.n.x ? -1 : 1, ox = t.n.x + side * (t.r + x.r + 0.15), oz = t.n.z + 0.35;
              if (steer(x, ox, oz, dt, 0.9) > 0.18 && x.actT < 20) return false; asked = true; if (!free(t)) return true;
              engage(x, t); bubble(x, '🤫', lineFor('hood'), 3.6); x.convo = 0; }
            stand(x, dt); face(x, t.n.x, t.n.z); x.n.bLean = Math.min(1, x.convo * 2); x.convo += dt;
            x.needs.social = Math.max(0, x.needs.social - dt * 0.1);
            if (x.convo > 4 && !x.heard) { x.heard = true; say(t, t.id === 'gravy' ? pick(['...huh.', '...you don\'t say.', 'mm.']) : pick(["Didn't hear that.", '...noted.']), 2.4); }
            return x.convo > 6.6;
          };
        },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { if (a.target && a.target.engagedBy === a) release(a.target); } },
      { id: 'watch', score: function (a) { return P.drain ? 0.18 + a.needs.curiosity * 0.5 : 0; },
        begin: function (a) { a.plan = goThenDo(P.drain.x - 1.3, P.drain.z - 1.5, 0.8, function (x, dt, t) { face(x, P.drain.x, P.drain.z); x.needs.curiosity = Math.max(0, x.needs.curiosity - dt * 0.05); return t > 10; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'vanish', score: function () { var d = by.dill; return (d && d.act && d.act.id === 'tail') ? 1.4 : 0.06; },
        begin: function (a) { var gone = 0, phase = 0;
          a.plan = function (x, dt) {
            if (phase === 0) { if (steer(x, P.exit.door.x, P.exit.door.z, dt, 1.2) < 0.4 || x.actT > 30) phase = 1; return false; }
            if (phase === 1) { x.offstage = true; if (steer(x, P.exit.out.x, P.exit.out.z, dt, 1.2) < 0.4 || x.actT > 40) { x.n.hidden = true; phase = 2; gone = rr(15, 30); } return false; }
            gone -= dt; if (gone > 0) return false;
            x.n.x = P.exit.door.x; x.n.z = P.exit.door.z; x.n.hidden = false; x.offstage = false;
            return true; }; },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { a.offstage = false; a.n.hidden = false; } },
    ];
    if (id === 'gravy') return [
      { id: 'sit', score: function () { return 0.5; }, tick: function (a, dt) { stand(a, dt); a.needs.energy -= dt * 0.012; return a.actT > rr(8, 14); } },
      { id: 'doze', score: function (a) { return a.needs.energy < 0.4 ? 0.9 : 0.04; },
        begin: function (a) { bubble(a, '💤', '', 4); }, tick: function (a, dt) { a.n.bSleep = 1; a.needs.energy = Math.min(1, a.needs.energy + dt * 0.06); return a.actT > 15; } },
      { id: 'mutter', score: function (a) { return 0.12 + a.needs.social * 0.4; },
        begin: function (a) { say(a, lineFor('gravy'), 3.4); a.needs.social = 0; }, tick: function (a) { return a.actT > 4; } },
    ];
    if (id === 'hen') return [
      { id: 'peck', score: function () { return 0.5 + rnd() * 0.2; },
        begin: function (a) { var tx = clamp(a.home.x + rr(-6, 6), W.bounds.x0, W.bounds.x1), tz = rr(0.8, 6.5);
          a.plan = goThenDo(tx, tz, 0.8, function (x, dt, t) { x.n.bPeck = 1; return t > rr(3, 7); }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'roost', score: function (a) { return (P.roost && !(a.cool.roost > T)) ? 0.26 : 0; },
        begin: function (a) { a.cool.roost = T + 60; var up = 0;
          a.plan = function (x, dt) {
            if (up === 0) { if (steer(x, P.roost.x, P.roost.z + 0.65, dt, 0.9) > 0.15 && x.actT < 25) return false; up = 0.001; }
            if (up < 1) { up = Math.min(1, up + dt * 1.5); x.n.x += (P.roost.x - x.n.x) * up; x.n.z += (P.roost.z - x.n.z) * up; x.n.yBase = P.roost.y * up + Math.sin(up * Math.PI) * 0.4; x.n.bFlap = 1; return false; }
            stand(x, dt); x.n.yBase = P.roost.y; x.n.bFlap = 0; x.n.bSleep = x.actT > 7 ? 1 : 0; return x.actT > rr(14, 22); }; },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { a.n.yBase = 0; a.n.z = Math.max(a.n.z, P.roost.z + 0.6); } },
      { id: 'follow', score: function () { var d = by.dill; return d && d.n.walk > 0.3 ? 0.3 : 0.04; },
        begin: function () { }, tick: function (a, dt) { var d = by.dill, dx = d.n.x - a.n.x, dz = d.n.z - a.n.z, dd = Math.hypot(dx, dz); if (dd > 1.1) steer(a, d.n.x - dx / dd * 0.9, d.n.z - dz / dd * 0.9, dt, 1.1); else stand(a, dt); return a.actT > 12; } },
      { id: 'wander', score: function () { return 0.22; },
        begin: function (a) { a.plan = goThenDo(clamp(a.n.x + rr(-5, 5), W.bounds.x0, W.bounds.x1), rr(0.8, 6), 0.6, function (x, dt, t) { return t > 2; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
    ];
    return [];
  }

  function think(a) {
    if (a.engagedBy || a.byPlayer) return;
    var best = null, bs = -1;
    a.acts.forEach(function (act) {
      var s = act.score(a);
      if (a.act && a.act.id === act.id) s += 0.35;
      if (s > bs) { bs = s; best = act; }
    });
    if (best && (!a.act || best.id !== a.act.id)) {
      setAct(a, best);
      var EMO = { patrol: '🚶', doze: '💤', drain: '🔎', board: '🗂️', pace: '🤔', lurk: '🌑', watch: '🌀', peck: '🌾', roost: '🪺' };
      if (EMO[best.id] && rnd() < 0.4 && !a.bub) bubble(a, EMO[best.id], '', 2.2);
    }
  }

  // ---- THE PASSING ------------------------------------------------------------------
  var pass = null, nextPass = 0;
  function passingStart() {
    var P = W.pois; if (!P.drain) return;
    pass = { t: 0, dur: 11 };
    nextPass = T + rr(70, 130);
    function react(a, act) { if (a.byPlayer) return; if (a.engagedBy) release(a); setAct(a, act); }
    var D = by.dill, H = by.hood, C = by.crumb, G = by.gravy, N = by.hen;
    if (D) react(D, { id: 'rush', busy: true,
      begin: function (a) { bubble(a, '🌀', pick(['THERE.', 'Write it down. Twice.', 'Now. Not 3:04. NOW.']), 3); a.plan = goThenDo(P.drain.x + 0.3, P.drain.z - 1.15, 2.0, function (x, dt, t) { face(x, P.drain.x, P.drain.z); x.n.bStoop = 1; x.n.bWrite = 1; return t > 7; }); },
      tick: function (a, dt) { return a.plan(a, dt); } });
    if (H) {
      if (H.n.hidden) { H.n.x = P.exit.door.x; H.n.z = P.exit.door.z; H.n.hidden = false; H.offstage = false; }
      react(H, { id: 'nod', busy: true,
        begin: function (a) { a.told = false; a.plan = goThenDo(P.drain.x - 1.5, P.drain.z - 1.8, 1.7, function (x, dt, t) { face(x, P.drain.x, P.drain.z); x.n.bNod = t; if (t > 1.2 && !x.told) { x.told = true; say(x, pick(['Told you.', 'Rumor eight.', 'It likes the pipes.']), 2.8); } return t > 8; }); },
        tick: function (a, dt) { return a.plan(a, dt); } });
    }
    if (C) react(C, { id: 'glance', busy: true, begin: function (a) { say(a, pick(['...I heard nothing.', 'Not my door. Not my problem.']), 3); },
      tick: function (a, dt) { stand(a, dt); face(a, P.drain.x, P.drain.z); return a.actT > 7; } });
    if (G) react(G, { id: 'sigh', busy: true, begin: function (a) { a.sighed = false; }, tick: function (a) { if (a.actT > 1.5 && !a.sighed) { a.sighed = true; say(a, '...again with the drain.', 3); } return a.actT > 7; } });
    if (N) fleeFrom(N, P.drain.x, P.drain.z);
  }
  function tickPassing(dt) {
    var k = 0;
    if (pass) {
      pass.t += dt;
      k = pass.t < 1.5 ? pass.t / 1.5 : pass.t > pass.dur - 2.5 ? Math.max(0, (pass.dur - pass.t) / 2.5) : 1;
      k *= 0.85 + 0.15 * Math.sin(pass.t * 9) * Math.sin(pass.t * 2.3);
      if (pass.t >= pass.dur) pass = null;
    } else if (T > nextPass && W.pois.drain) passingStart();
    if (W.onPassing) W.onPassing(k);
    HB.passingK = k;
  }

  // ---- public -------------------------------------------------------------------------
  var GAIT = { crumb: 9, dill: 11, hood: 7, gravy: 0, hen: 22 };
  var SPEED = { crumb: 0.85, dill: 1.05, hood: 0.9, gravy: 0, hen: 0.95 };
  var RAD = { crumb: 0.38, dill: 0.26, hood: 0.3, gravy: 0.24, hen: 0.2 };

  HB.attach = function (npcs, world) {
    W = world; A = []; by = {};
    seed = (world.seed != null ? world.seed : Date.now()) >>> 0;
    npcs.forEach(function (n) {
      if (!SPEED.hasOwnProperty(n.id)) return;
      var a = { id: n.id, n: n, home: { x: n.x, z: n.z }, speed: SPEED[n.id], r: RAD[n.id], gait: GAIT[n.id],
        vx: 0, vz: 0, act: null, actT: 0, thinkT: rr(0.5, 3), cool: {}, byPlayer: false,
        needs: { energy: rr(0.6, 1), social: rr(0.2, 0.6), curiosity: rr(0.2, 0.6), duty: rr(0.4, 0.8) } };
      n.walk = 0; n.walkPh = rnd() * 6; n.heading = n.baseYaw; n.brainYaw = null; clearFlags(n); n.bTalk = 0;
      A.push(a); by[n.id] = a;
    });
    A.forEach(function (a) { a.acts = ACTS(a.id); });
    nextPass = rr(30, 45);
    HB.ready = true;
  };

  HB.step = function (dt, t, ctx) {
    if (!HB.ready || HB.off) return;
    T = t;
    tickPassing(dt);
    A.forEach(function (a) {
      var n = a.n; a.ctx = ctx;
      a.needs.energy = clamp(a.needs.energy - dt * 0.004, 0, 1);
      a.needs.social = clamp(a.needs.social + dt * 0.011, 0, 1);
      a.needs.curiosity = clamp(a.needs.curiosity + dt * 0.008, 0, 1);
      a.needs.duty = clamp(a.needs.duty + dt * 0.006, 0, 1);
      n.bTalk = Math.max(0, (n.bTalk || 0) - dt * 0.6);
      // THE PLAYER. Talking to someone parks their brain; walking up to someone
      // makes them stop and look. Nobody walks off mid-approach.
      var near = !n.hidden && ctx.outside && dist(ctx.px, ctx.pz, n.x, n.z) < 2.7;
      var talking = ctx.dialogNpc === n;
      a.byPlayer = talking || (near && !(a.act && a.act.busy));
      if (a.byPlayer) {
        stand(a, dt);
        if (!talking) face(a, ctx.px, ctx.pz);
        a.thinkT = Math.min(a.thinkT, 1.0);
        return;
      }
      if (a.act) {
        a.actT += dt;
        var done = false;
        try { done = a.act.tick(a, dt); } catch (e) { done = true; }
        if (done) { var was = a.act; if (was && was.end) was.end(a); a.act = null; a.thinkT = 0; clearFlags(n); n.brainYaw = null; }
      } else stand(a, dt);
      a.thinkT -= dt;
      if (!a.act || (a.thinkT <= 0 && !(a.act && a.act.busy))) {
        a.thinkT = rr(3, 5.5);
        if (!a.act || a.act.id !== 'flee') think(a);
      }
    });
    if (W.overlay) tickBubbles(ctx);
  };

  HB.passing = function () { if (HB.ready) passingStart(); };
  HB.clearBubbles = function () { A.forEach(function (a) { if (a.bub) { a.bub.el.remove(); a.bub = null; } }); };
  HB.state = function () {
    return { passing: !!pass, agents: A.map(function (a) { return { id: a.id, act: a.act && a.act.id, x: +a.n.x.toFixed(2), z: +a.n.z.toFixed(2), hidden: !!a.n.hidden, byPlayer: a.byPlayer }; }) };
  };

  global.HallBrains = HB;
}(typeof window !== 'undefined' ? window : this));
