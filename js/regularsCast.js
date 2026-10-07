/* js/regularsCast.js — 🧍 THE REGULARS, as geometry.
 *
 * The five street regulars from js/arcade.js, rebuilt for THE REGULARS layer
 * (js/regulars.js). Every number here is a port of blender/hallmesh.py's
 * build_crumb / build_dill / build_gravy / build_hood / build_hen, so the
 * figurines are the same people the hall has been talking to since §17 — and
 * the same generator, pasted into Spline's DSL, built the editable figurines in
 * the Spline file ("HowManyNugs — regulars"). One description, three homes.
 *
 * Coordinates are written in BLENDER space (metres, Z up, −Y is the face) so
 * they can be checked line for line against hallmesh.py; `bv()` converts to
 * three.js (Y up, +Z faces the camera) once, at the vertex.
 *
 * Output: RegularsCast.build(THREE, name, matFn) → THREE.Group whose children
 * are PART groups positioned at their pivots (the CAST table in hallmesh.py),
 * each holding one mesh per material key. matFn(key) supplies the material, so
 * the look lives in regulars.js and this file stays pure shape.
 */
(function (global) {
  'use strict';

  // Blender (x, y, z) → three (x, z, −y): a proper rotation, so winding survives.
  function bv(p) { return [p[0], p[2], -p[1]]; }

  // Monotone cubic (PCHIP) through [(t, v)…] — hallmesh.pw(), ported. Never
  // overshoots, so a profile's plateau stays a plateau.
  function pw(t, K) {
    var n = K.length;
    if (n === 1 || t <= K[0][0]) return K[0][1];
    if (t >= K[n - 1][0]) return K[n - 1][1];
    var xs = [], ys = [], h = [], d = [], m = [], i;
    for (i = 0; i < n; i++) { xs.push(K[i][0]); ys.push(K[i][1]); m.push(0); }
    for (i = 0; i < n - 1; i++) { h.push(Math.max(xs[i + 1] - xs[i], 1e-9)); d.push((ys[i + 1] - ys[i]) / h[i]); }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else { var w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    }
    i = 0; while (i < n - 2 && t > xs[i + 1]) i++;
    var s = (t - xs[i]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  }

  function ring(n, f) { var r = []; for (var j = 0; j < n; j++) r.push(f(j / n * Math.PI * 2, j)); return r; }
  function collapsed(r) {
    var a = r[0];
    for (var j = 1; j < r.length; j++) if (Math.abs(r[j][0] - a[0]) + Math.abs(r[j][1] - a[1]) + Math.abs(r[j][2] - a[2]) > 1e-7) return false;
    return true;
  }

  // Skin rings into an indexed, OUTWARD-wound mesh. A ring that came to a point
  // becomes ONE vertex and a fan — N coincident pole vertices each average only
  // their own two triangles and leave an asterisk on every cap (the hero nugget
  // learned this). Orientation is decided by signed volume, never by the typist.
  // `faceKey(i, j)` may split faces between materials (the Hood's cowl lining).
  function skin(rings, wrap, faceKey) {
    var V = [], idx = [], n = rings[0].length, R = rings.length, i, j;
    for (i = 0; i < R; i++) {
      if (collapsed(rings[i])) { var p = bv(rings[i][0]); idx.push([V.length / 3]); V.push(p[0], p[1], p[2]); }
      else {
        var row = [];
        for (j = 0; j < n; j++) { var q = bv(rings[i][j]); row.push(V.length / 3); V.push(q[0], q[1], q[2]); }
        idx.push(row);
      }
    }
    var tris = {}, all = [];
    function put(key, a, b, c) { (tris[key] = tris[key] || []).push(a, b, c); all.push(a, b, c); }
    var last = wrap ? R : R - 1;
    for (i = 0; i < last; i++) {
      var A = idx[i], B = idx[(i + 1) % R];
      for (j = 0; j < n; j++) {
        var j2 = (j + 1) % n, key = faceKey ? faceKey(i, j) : '_';
        if (key === null) continue;
        var a = A.length === 1 ? A[0] : A[j], b = A.length === 1 ? A[0] : A[j2];
        var c = B.length === 1 ? B[0] : B[j2], d = B.length === 1 ? B[0] : B[j];
        if (A.length === 1 && B.length === 1) continue;
        if (A.length === 1) put(key, a, c, d);
        else if (B.length === 1) put(key, a, b, c);
        else { put(key, a, b, c); put(key, a, c, d); }
      }
    }
    var vol = 0;
    for (i = 0; i < all.length; i += 3) {
      var x = all[i] * 3, y = all[i + 1] * 3, z = all[i + 2] * 3;
      vol += V[x] * (V[y + 1] * V[z + 2] - V[y + 2] * V[z + 1]) - V[x + 1] * (V[y] * V[z + 2] - V[y + 2] * V[z]) + V[x + 2] * (V[y] * V[z + 1] - V[y + 1] * V[z]);
    }
    var out = {};
    for (var k in tris) {
      var t = tris[k];
      if (vol < 0) for (i = 0; i < t.length; i += 3) { var s = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = s; }
      out[k] = { V: V, I: t };
    }
    return faceKey ? out : out._;
  }

  // ---- primitives (hallmesh.Part, ported) --------------------------------------
  var DEF_PROF = [[0, 0], [0.10, 0.62], [0.35, 0.98], [0.62, 1.0], [0.85, 0.78], [1.0, 0.0]];

  // An ovoid whose radius follows `prof` up its height. Origin at the BOTTOM.
  function blob(c, sz, o) {
    o = o || {};
    var prof = o.prof || DEF_PROF, st = o.st || 26, sl = o.sl || 32;
    var lump = o.lump || 0, seed = o.seed || 0, flat = o.flat || 1, rings = [];
    rings.push(ring(sl, function () { return [c[0], c[1], c[2]]; }));
    for (var i = 0; i <= st; i++) {
      var v = i / st, r = pw(v, prof);
      rings.push(ring(sl, function (a) {
        var k = 1;
        if (lump) k += lump * (Math.sin(a * 3 + seed) * Math.cos(v * 5.5 + seed * 1.7) + 0.6 * Math.sin(v * 3 + a * 2 + seed));
        return [c[0] + Math.cos(a) * r * sz[0] * 0.5 * k, c[1] + Math.sin(a) * r * sz[1] * 0.5 * flat * k, c[2] + v * sz[2]];
      }));
    }
    rings.push(ring(sl, function () { return [c[0], c[1], c[2] + sz[2]]; }));
    return skin(rings, false);
  }

  function cross(p, q) { return [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]; }
  function norm(p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; }

  // A tapered capsule from A to B. cap:false = a flat-ended frustum (collars,
  // hat bands, a neck). fy squashes one cross axis (a bow-tie wedge).
  function limb(A, B, r0, r1, o) {
    o = o || {};
    var sl = o.sl || 20, cap = o.cap !== false, fy = o.fy || 1;
    var dd = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(dd[0], dd[1], dd[2]);
    var u = [dd[0] / L, dd[1] / L, dd[2] / L];
    var ax = norm(cross(u, Math.abs(u[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0])), ay = norm(cross(u, ax));
    function at(off, rr) {
      return ring(sl, function (a) {
        var ca = Math.cos(a) * rr * fy, sa = Math.sin(a) * rr;
        return [A[0] + u[0] * off + ax[0] * ca + ay[0] * sa, A[1] + u[1] * off + ax[1] * ca + ay[1] * sa, A[2] + u[2] * off + ax[2] * ca + ay[2] * sa];
      });
    }
    var rings = [], K = 6, k, ph;
    if (cap) {
      for (k = 0; k <= K; k++) { ph = k / K * Math.PI / 2; rings.push(at(-r0 * Math.cos(ph) * 0.8, r0 * Math.sin(ph))); }
      for (k = 0; k <= K; k++) { ph = Math.PI / 2 + k / K * Math.PI / 2; rings.push(at(L - r1 * Math.cos(ph) * 0.8, r1 * Math.sin(ph))); }
    } else {
      rings.push(at(0, 0)); rings.push(at(0, r0)); rings.push(at(L, r1)); rings.push(at(L, 0));
    }
    return skin(rings, false);
  }

  function box(c, sz, taper) {
    taper = taper || 1;
    var hx = sz[0] / 2, hy = sz[1] / 2, hz = sz[2] / 2;
    function sq(k, z) { return [[c[0] - hx * k, c[1] - hy * k, z], [c[0] + hx * k, c[1] - hy * k, z], [c[0] + hx * k, c[1] + hy * k, z], [c[0] - hx * k, c[1] + hy * k, z]]; }
    function pt(z) { return [[c[0], c[1], z], [c[0], c[1], z], [c[0], c[1], z], [c[0], c[1], z]]; }
    return skin([pt(c[2] - hz), sq(1, c[2] - hz), sq(taper, c[2] + hz), pt(c[2] + hz)], false);
  }

  // A hat brim: an annulus with real thickness that dips at the front (−y).
  function brim(c, rin, rout, thick, tilt, sl) {
    sl = sl || 40;
    function rz(a) { return c[2] + tilt * Math.cos(a + Math.PI / 2) * -1; }
    var sec = [[rin, thick / 2], [rout, 0], [rout, -thick * 0.35], [rin, -thick / 2]];
    var rings = sec.map(function (s) { return ring(sl, function (a) { return [c[0] + Math.cos(a) * s[0], c[1] + Math.sin(a) * s[0], rz(a) + s[1]]; }); });
    return skin(rings, true);
  }

  function merge(gs) {
    var V = [], I = [];
    gs.forEach(function (g) {
      var o = V.length / 3;
      for (var i = 0; i < g.V.length; i++) V.push(g.V[i]);
      for (i = 0; i < g.I.length; i++) I.push(g.I[i] + o);
    });
    return { V: V, I: I };
  }

  // Eyes set INTO the face: squashed front-to-back, centre behind the surface.
  function eyes(y, z, sep, r) {
    return merge([-1, 1].map(function (sx) { return blob([sx * sep, y + r * 0.40, z], [r * 2, r * 1.6, r * 2], { st: 12, sl: 18 }); }));
  }

  // ---- the five ------------------------------------------------------------------
  // Each returns { parts: { name: { pivot: [bx,by,bz] (blender), meshes: { matKey: geo } } } }.
  function P(pivot) { return { pivot: pivot || [0, 0, 0], meshes: {} }; }
  function add(part, key, g) { part.meshes[key] = part.meshes[key] ? merge([part.meshes[key], g]) : g; }

  function crumb() {
    var NUG = [[0, 0], [0.05, 0.55], [0.16, 0.82], [0.30, 0.96], [0.46, 1.0], [0.63, 0.98], [0.78, 0.90], [0.88, 0.74], [0.95, 0.50], [0.99, 0.18], [1.0, 0]];
    var HW = 0.43, SHADE = [[0, 0.5], [0.4, 1.0], [0.75, 1.0], [1.0, 0.45]];
    var body = P(), parts = { body: body };
    add(body, 'nug', blob([0, 0, 0.115], [0.86, 0.60, 0.855], { prof: NUG, lump: 0.055, seed: 1.7, st: 40, sl: 48 }));
    add(body, 'shades', merge([
      limb([-0.335, -0.235, 0.700], [0.335, -0.235, 0.700], 0.032, 0.032, { sl: 12 }),
      blob([-0.160, -0.262, 0.640], [0.265, 0.130, 0.125], { prof: SHADE, st: 10, sl: 24 }),
      blob([0.160, -0.262, 0.640], [0.265, 0.130, 0.125], { prof: SHADE, st: 10, sl: 24 }),
      limb([-0.320, -0.245, 0.702], [-0.395, 0.060, 0.678], 0.026, 0.020, { sl: 10 }),
      limb([0.320, -0.245, 0.702], [0.395, 0.060, 0.678], 0.026, 0.020, { sl: 10 }),
    ]));
    add(body, 'satin', merge([
      limb([-0.02, -0.288, 0.512], [-0.175, -0.272, 0.528], 0.022, 0.075, { fy: 0.45, sl: 16 }),
      limb([0.02, -0.288, 0.512], [0.175, -0.272, 0.528], 0.022, 0.075, { fy: 0.45, sl: 16 }),
    ]));
    add(body, 'knot', blob([0, -0.292, 0.478], [0.085, 0.085, 0.085], { st: 10, sl: 16 }));
    [[-1, 'L'], [1, 'R']].forEach(function (s) {
      var sx = s[0], foot = P([sx * 0.170, 0.000, 0.020]), arm = P([sx * 0.410, -0.020, 0.470]);
      add(foot, 'nugDark', blob([sx * 0.170, -0.045, 0.0], [0.235, 0.340, 0.135], { prof: [[0, 0.75], [0.5, 1.0], [1.0, 0.55]], st: 12, sl: 24 }));
      add(arm, 'nug', merge([
        limb([sx * (HW - 0.02), -0.02, 0.470], [sx * (HW + 0.070), -0.10, 0.330], 0.092, 0.080),
        limb([sx * (HW + 0.070), -0.10, 0.330], [-sx * 0.095, -0.265, 0.352], 0.080, 0.065),
      ]));
      add(arm, 'nugDark', blob([-sx * 0.110, -0.280, 0.305], [0.145, 0.145, 0.125], { st: 12, sl: 18 }));
      parts['foot' + s[1]] = foot; parts['arm' + s[1]] = arm;
    });
    return parts;
  }

  function dill() {
    var PICKLE = [[0, 0], [0.04, 0.62], [0.14, 0.88], [0.30, 0.99], [0.50, 1.0], [0.68, 0.96], [0.82, 0.86], [0.92, 0.66], [0.98, 0.32], [1.0, 0]];
    var body = P(), hat = P([0, -0.010, 0.940]), arm = P([0.170, -0.020, 0.635]);
    add(body, 'pickle', blob([0, 0, 0.04], [0.40, 0.36, 0.92], { prof: PICKLE, lump: 0.05, seed: 4.1, st: 44, sl: 40 }));
    add(body, 'felt', merge([
      limb([0, -0.005, 0.700], [0, -0.005, 0.605], 0.150, 0.215, { cap: false, sl: 40 }),
      limb([-0.170, -0.02, 0.635], [-0.215, -0.145, 0.50], 0.062, 0.052),
    ]));
    add(body, 'feltDk', limb([0, -0.005, 0.712], [0, -0.005, 0.660], 0.152, 0.160, { cap: false, sl: 40 }));
    add(body, 'pickleDk', blob([-0.215, -0.165, 0.455], [0.10, 0.10, 0.095], { st: 12, sl: 18 }));
    add(body, 'badge', blob([0.115, -0.155, 0.585], [0.085, 0.045, 0.105], { st: 10, sl: 18 }));
    add(body, 'eyes', eyes(-0.145, 0.735, 0.080, 0.038));
    add(arm, 'felt', limb([0.170, -0.02, 0.635], [0.175, -0.175, 0.545], 0.062, 0.052));
    add(arm, 'pickleDk', blob([0.175, -0.195, 0.505], [0.10, 0.10, 0.095], { st: 12, sl: 18 }));
    add(arm, 'paper', merge([box([0.185, -0.235, 0.545], [0.115, 0.020, 0.145]), box([0.185, -0.245, 0.612], [0.115, 0.016, 0.030], 0.9)]));
    add(hat, 'felt', merge([
      brim([0, -0.01, 0.955], 0.115, 0.275, 0.026, -0.030),
      blob([0, -0.01, 0.945], [0.325, 0.315, 0.175], { prof: [[0, 1.0], [0.55, 0.97], [0.82, 0.80], [1.0, 0.42]], st: 14, sl: 40 }),
      blob([-0.085, -0.01, 1.070], [0.115, 0.20, 0.075], { st: 10, sl: 18 }),
      blob([0.085, -0.01, 1.070], [0.115, 0.20, 0.075], { st: 10, sl: 18 }),
    ]));
    add(hat, 'feltDk', limb([0, -0.01, 0.975], [0, -0.01, 1.020], 0.171, 0.169, { cap: false, sl: 40 }));
    return { body: body, hat: hat, arm: arm };
  }

  function gravy() {
    var body = P(), lid = P([-0.185, -0.020, 0.556]);
    // The cup is closed on purpose (signed-volume orientation needs a solid):
    // outer wall up, over the rolled rim, inner wall down to an inner floor.
    var prof = [[0.00, 0.150, 0.000], [0.10, 0.158, 0.055], [0.45, 0.180, 0.245], [0.80, 0.198, 0.420], [0.94, 0.205, 0.480], [1.00, 0.212, 0.505]];
    var rings = [ring(36, function () { return [0, 0, 0]; })];
    prof.forEach(function (p) {
      rings.push(ring(36, function (a) {
        var dent = 1.0 - 0.055 * Math.exp(-Math.pow(Math.cos(a - 2.2) - 1, 2) * 6) * (1 - p[0]);
        return [Math.cos(a) * p[1] * dent, Math.sin(a) * p[1] * dent, p[2]];
      }));
    });
    rings.push(ring(36, function (a) { return [Math.cos(a) * 0.214, Math.sin(a) * 0.214, 0.518]; }));
    rings.push(ring(36, function (a) { return [Math.cos(a) * 0.206, Math.sin(a) * 0.206, 0.528]; }));
    rings.push(ring(36, function (a) { return [Math.cos(a) * 0.196, Math.sin(a) * 0.196, 0.515]; }));
    rings.push(ring(36, function (a) { return [Math.cos(a) * 0.188, Math.sin(a) * 0.188, 0.47]; }));
    rings.push(ring(36, function () { return [0, 0, 0.47]; }));
    add(body, 'cup', skin(rings, false));
    // the sauce tide-line, proud of the wall so it can't z-fight it
    add(body, 'sauce', limb([0, 0, 0.300], [0, 0, 0.318], 0.1905, 0.1915, { cap: false, sl: 36 }));
    add(body, 'eyes', eyes(-0.170, 0.348, 0.064, 0.042));
    // heavy lids: a HOOD over the top third of each eye
    add(body, 'cup', merge([-1, 1].map(function (sx) {
      return blob([sx * 0.064, -0.182, 0.402], [0.112, 0.070, 0.038], { prof: [[0, 0.9], [0.55, 1.0], [1.0, 0.55]], st: 8, sl: 18 });
    })));
    add(lid, 'lid', merge([
      brim([0.015, -0.02, 0.560], 0.0, 0.215, 0.030, 0.038, 36),
      limb([0.015, -0.02, 0.545], [0.015, -0.02, 0.566], 0.200, 0.212, { cap: false, sl: 36 }),
    ]));
    return { body: body, lid: lid };
  }

  function hood() {
    var body = P(), head = P([0, 0, 0.545]);
    var ROBE = [[0.0, 1.0], [0.20, 0.86], [0.48, 0.74], [0.72, 0.70], [0.88, 0.66], [1.0, 0.58]];
    var rings = [ring(40, function () { return [0, 0, 0]; })];
    for (var i = 0; i <= 14; i++) {
      var v = i / 14, r = pw(v, ROBE);
      rings.push(ring(40, function (a) {
        var fold = 1 + 0.045 * Math.sin(a * 6 + 0.4) * (0.4 + 0.6 * (1 - v));
        return [Math.cos(a) * 0.310 * r * fold, Math.sin(a) * 0.265 * r * fold, v * 0.700];
      }));
    }
    rings.push(ring(40, function () { return [0, 0, 0.70]; }));
    add(body, 'cloth', merge([skin(rings, false), limb([-0.205, 0, 0.600], [0.205, 0, 0.600], 0.140, 0.140, { sl: 20 })]));
    // THE COWL: a closed teardrop with a cave pushed into the front. Closed all
    // the way to both poles here (hallmesh left pinholes — fine for a baked
    // hall, not for a figurine you can orbit), and the cave faces are split off
    // as their own darker lining.
    var CZ0 = 0.560, CH = 0.520, SL = 36, ST = 22, FRONT = -Math.PI / 2;
    function cowlPt(v, a) {
      var ph = Math.PI * v, rr = Math.sin(ph), zz = CZ0 + CH * (0.5 - Math.cos(ph) * 0.5);
      var da = Math.atan2(Math.sin(a - FRONT), Math.cos(a - FRONT));
      var fa = Math.max(0, 1 - Math.pow(Math.abs(da) / 1.05, 2)), fv = Math.max(0, 1 - Math.pow((v - 0.44) / 0.40, 2));
      var dish = 1 - 0.62 * fa * fv;
      return [Math.cos(a) * 0.300 * rr * dish, Math.sin(a) * 0.285 * rr * dish - 0.030 * (1 - v), zz];
    }
    var cr = [];
    for (i = 0; i <= ST; i++) { var vv = i / ST; cr.push(ring(SL, function (a) { return cowlPt(vv, a); })); }
    var cowl = skin(cr, false, function (ri, j) {
      var v2 = (ri + 0.5) / ST, a2 = ((j + 0.5) / SL) * Math.PI * 2;
      var da = Math.atan2(Math.sin(a2 - FRONT), Math.cos(a2 - FRONT));
      return (Math.abs(da) < 0.80 && v2 > 0.16 && v2 < 0.72) ? 'clothDk' : 'cloth';
    });
    add(head, 'cloth', cowl.cloth);
    add(head, 'clothDk', cowl.clothDk);
    add(head, 'nugDark', blob([0, -0.020, 0.640], [0.270, 0.245, 0.310], { st: 16, sl: 24 }));
    add(head, 'glow', merge([-1, 1].map(function (sx) { return blob([sx * 0.072, -0.150, 0.660], [0.056, 0.050, 0.068], { st: 10, sl: 14 }); })));
    return { body: body, head: head };
  }

  function hen() {
    var body = P(), head = P([0, -0.045, 0.400]);
    add(body, 'hen', blob([0, 0.03, 0.155], [0.30, 0.40, 0.375], { prof: [[0, 0], [0.10, 0.68], [0.34, 0.96], [0.60, 1.0], [0.82, 0.82], [1.0, 0]], st: 24, sl: 32 }));
    add(body, 'henDark', merge([-1, 1].map(function (sx) {
      return blob([sx * 0.150, 0.020, 0.195], [0.075, 0.320, 0.260], { prof: [[0, 0.35], [0.4, 1.0], [0.75, 0.92], [1.0, 0.30]], st: 12, sl: 20 });
    })));
    add(body, 'hen', merge([-1, 0, 1].map(function (sx) {
      return blob([sx * 0.075, 0.290 + Math.abs(sx) * 0.02, 0.330 - Math.abs(sx) * 0.04], [0.075, 0.240, 0.300], { prof: [[0, 0.30], [0.45, 1.0], [1.0, 0.22]], st: 12, sl: 16 });
    })));
    var legs = [];
    [-1, 1].forEach(function (sx) {
      legs.push(limb([sx * 0.075, -0.010, 0.150], [sx * 0.082, -0.020, 0.030], 0.030, 0.024, { sl: 10 }));
      [[-0.075, 0.0], [-0.050, 0.045], [-0.050, -0.045]].forEach(function (t) {
        legs.push(limb([sx * 0.082, -0.020, 0.024], [sx * 0.082 + t[1], t[0], 0.014], 0.020, 0.010, { sl: 8 }));
      });
    });
    add(body, 'beak', merge(legs));
    add(head, 'hen', merge([
      limb([0, -0.045, 0.400], [0, -0.100, 0.545], 0.098, 0.082, { cap: false, sl: 20 }),
      blob([0, -0.115, 0.475], [0.185, 0.195, 0.215], { st: 18, sl: 24 }),
    ]));
    add(head, 'comb', merge([
      blob([0, -0.055, 0.640], [0.030, 0.084, 0.088], { st: 10, sl: 14 }),
      blob([0, -0.115, 0.648], [0.030, 0.104, 0.109], { st: 10, sl: 14 }),
      blob([0, -0.170, 0.632], [0.030, 0.076, 0.080], { st: 10, sl: 14 }),
      blob([0, -0.185, 0.470], [0.055, 0.048, 0.090], { st: 10, sl: 14 }),
    ]));
    add(head, 'beak', limb([0, -0.180, 0.560], [0, -0.290, 0.545], 0.052, 0.010, { sl: 12 }));
    add(head, 'eyes', eyes(-0.205, 0.588, 0.072, 0.030));
    return { body: body, head: head };
  }

  var BUILDERS = { crumb: crumb, dill: dill, gravy: gravy, hood: hood, hen: hen };

  function toGeometry(THREE, g, pivot3) {
    var pos = new Float32Array(g.V.length);
    for (var i = 0; i < g.V.length; i += 3) {
      pos[i] = g.V[i] - pivot3[0]; pos[i + 1] = g.V[i + 1] - pivot3[1]; pos[i + 2] = g.V[i + 2] - pivot3[2];
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(g.I);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  // name → THREE.Group { children: part groups at their pivots }. Part groups are
  // reachable as group.userData.parts[partName]; meshes carry userData.mat.
  function build(THREE, name, matFn) {
    var parts = BUILDERS[name](), root = new THREE.Group();
    root.name = name;
    root.userData.parts = {};
    Object.keys(parts).forEach(function (pn) {
      var part = parts[pn], piv = bv(part.pivot), grp = new THREE.Group();
      grp.name = name + ':' + pn;
      grp.position.set(piv[0], piv[1], piv[2]);
      Object.keys(part.meshes).forEach(function (mk) {
        var m = new THREE.Mesh(toGeometry(THREE, part.meshes[mk], piv), matFn(mk, name));
        m.name = name + ':' + pn + ':' + mk;
        m.userData.mat = mk;
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
      });
      root.add(grp);
      root.userData.parts[pn] = grp;
    });
    return root;
  }

  global.RegularsCast = { build: build, names: Object.keys(BUILDERS), _raw: BUILDERS };
}(typeof window !== 'undefined' ? window : this));
