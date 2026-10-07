/* js/regulars.js — 🌙 AFTER HOURS: THE REGULARS.
 *
 * Not a game. A street corner outside the arcade at night, and the five
 * regulars living on it — each with a BRAIN of their own (Beau, 2026-10-07:
 * "instead of allowing this poke and twist motion, let's make them actually
 * have motion and have a 'brain of their own'").
 *
 * THE BRAIN is utility AI. Every regular carries a few NEEDS that drift over
 * time (energy, social, curiosity, duty), a catalogue of ACTIVITIES that each
 * score themselves against those needs and against the street (who is near,
 * who is busy, where the hen is, whether the drain is glowing), and a
 * COMMITMENT bonus so nobody dithers. The winner runs until it says it's done
 * or something better shouts. Activities can ENGAGE another regular — Dill
 * interviews, the Hood whispers — which parks the other one's brain in a
 * conversation until it's released. So the things you watch aren't scripted:
 * they fall out of five people wanting different things on one pavement.
 *
 *   Big Crumb   guards the door, patrols, shoos the hen, dozes on his feet
 *   Det. Dill   interviews anyone who'll stand still, inspects the drain,
 *               tails the Hood (and the Hood KNOWS — and leaves)
 *   The Hood    lurks where the lamp doesn't reach, whispers rumors, vanishes
 *   Gravy Jones does not get up (canon). Dozes. Talks through his lid.
 *   Henrietta   pecks, wanders, roosts on the bench, flees your cursor
 *
 * THE PASSING (docs/casefile.md facts 4/7): every minute or so the storm drain
 * glows gold and the street hears it go by underneath. Everyone reacts in
 * character. Nothing is caught. It goes back under. Case open.
 *
 * The figurines are js/regularsCast.js (ported from blender/hallmesh.py, and
 * mirrored into the Spline file). The set is built here. Lazy everything:
 * three.js + the cast are injected on the first open, never at page load.
 *
 *   RegularsLayer.open() / close()
 *   RegularsLayer.state()              brains, for tests
 *   RegularsLayer.debug = { clock, seed, passing: fn }   pin time, force the storm
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var RG = { active: false, ready: false, loading: false, debug: { clock: null, seed: null } };

  // ---- tiny utils ---------------------------------------------------------------
  var rngState = 1;
  function rnd() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function dist(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }
  function srgb(T, hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function handheld() { try { return !!(global.HallBoot && HallBoot.handheld()); } catch (e) { return false; } }
  function reduced() { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function nowS() { return RG.debug.clock != null ? RG.debug.clock : performance.now() / 1000; }
  function flag(fn) { try { return typeof global[fn] === 'function' ? !!global[fn]() : false; } catch (e) { return false; } }

  // ---- the street (three coords, metres; +z toward the camera) -------------------
  var ST = {
    wallZ: -1.62, kerbZ: 1.55, roadZ0: 1.70,
    door: { x: 0.55, w: 1.12, h: 2.14 },
    post: { x: -0.30, z: -1.02 },          // Crumb's spot, beside the door
    bench: { x: -2.15, z: -1.22, len: 1.55, seat: 0.44 },
    gravySeat: { x: -1.80, z: -1.20 },
    henRoost: { x: -2.62, z: -1.22 },
    lamp: { x: 2.55, z: 1.22 },
    box: { x: 1.78, z: -1.28 },
    grate: { x: -0.60, z: 1.86 },
    drainSpot: { x: -0.60, z: 1.18 },
    lurk: [{ x: -3.22, z: -1.38 }, { x: 3.25, z: -1.32 }],
    alley: { x: -4.4, z: -1.45 },
    bounds: { x0: -3.55, x1: 3.45, z0: -1.42, z1: 1.40 },
  };
  // circles the regulars steer around
  var OBST = [
    { x: ST.lamp.x, z: ST.lamp.z, r: 0.16 },
    { x: ST.box.x, z: ST.box.z, r: 0.34 },
    { x: ST.bench.x, z: ST.bench.z, r: 0.5 }, { x: ST.bench.x - 0.5, z: ST.bench.z, r: 0.4 }, { x: ST.bench.x + 0.5, z: ST.bench.z, r: 0.4 },
    { x: -3.05, z: 1.22, r: 0.13 }, { x: 3.05, z: 0.15, r: 0.13 },
  ];

  // ---- lines (canon: docs/casefile.md) ---------------------------------------------
  var LINES = {
    crumb: ["I heard nothing. That's what bothers me.", "Door's closed. ...It's never closed. Don't make it weird.", "Arcade's full of people who think they're good at Blaster.", "I filed a report. About the gauge. Nobody read it.", "Keep the bird off the mat."],
    dill: ["Case is open. Case stays open.", "Everything in this town is the weather.", "Every piece of paper agrees. That's what worries me.", "No crumbs. There are always crumbs.", "If you see something golden, write it down. Twice."],
    hood: ["Rumor seven: it cheered.", "The pipes hum when it goes by. Listen.", "I don't follow it. It follows the water.", "All water in this town is the same water.", "Somebody built it a door. Ask who poured the fort."],
    gravy: ["...I don't get up. The bench and me have an understanding.", "My nephew samples it, y'know. Kids.", "Mustard crowd used to own this corner. Before your time.", "...again with the drain.", "Sit down. You're making the hen nervous."],
    hen: ['bwok.', 'bwok?', 'BWOK.', '...bwok.', 'bwok bwok.'],
  };
  function lineFor(n) {
    var L = LINES[n].slice();
    if (n === 'dill' && flag('reelStormLanded')) L.push('You landed it off the pier. It went back under. They always do.');
    if (n === 'hood' && flag('drainSawStorm')) L.push('You saw it in the mains. Now you hear it everywhere.');
    if (n === 'gravy' && flag('beatEncoreDone')) L.push("You heard the boy's encore? Sampled a weather system. Proud of him. Don't tell him.");
    if (n === 'crumb' && flag('croftFoundDoor')) L.push('Cellar hatch says KEEP SHUT. Listen to the hatch.');
    return pick(L);
  }

  // ---- DOM ------------------------------------------------------------------------
  var layer, canvas, blotter, ticker, hint, bubbleBox, loadingEl;
  function buildDom() {
    layer = doc.createElement('div');
    layer.id = 'regularsWorld';
    layer.className = 'rg-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', 'After Hours — the regulars');
    layer.innerHTML =
      '<canvas class="rg-canvas"></canvas>' +
      '<div class="rg-vignette" aria-hidden="true"></div>' +
      '<div class="rg-head"><div class="rg-kicker">After Hours · Nuggetown</div><div class="rg-title">The Regulars</div>' +
      '<div class="rg-sub">nobody\'s playing. they live here.</div></div>' +
      '<button class="rg-close" type="button" aria-label="Back to the converter">✕</button>' +
      '<div class="rg-blotter" aria-live="off"><div class="rg-blotter-h">The Blotter <span>· live</span></div><ol></ol></div>' +
      '<div class="rg-ticker" aria-live="polite"></div>' +
      '<div class="rg-hint">click a regular to talk · they notice your cursor</div>' +
      '<div class="rg-bubbles" aria-hidden="true"></div>' +
      '<div class="rg-loading"><div class="rg-spin"></div><div>unlocking the street…</div></div>';
    doc.body.appendChild(layer);
    canvas = layer.querySelector('.rg-canvas');
    blotter = layer.querySelector('.rg-blotter ol');
    ticker = layer.querySelector('.rg-ticker');
    hint = layer.querySelector('.rg-hint');
    if (handheld()) hint.textContent = 'tap a regular to talk';
    bubbleBox = layer.querySelector('.rg-bubbles');
    loadingEl = layer.querySelector('.rg-loading');
    layer.querySelector('.rg-close').addEventListener('click', function () { RG.close(); });
  }

  // ---- materials ----------------------------------------------------------------
  // One bump injector for every organic surface: cellular grains in OBJECT
  // space (pickle warts, feather barbs, felt nap), faded by pixel footprint.
  var BUMP_GLSL = [
    'varying vec3 vRgObj;',
    'float rgH(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float rgN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(rgH(i), rgH(i + vec3(1,0,0)), f.x), mix(rgH(i + vec3(0,1,0)), rgH(i + vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(rgH(i + vec3(0,0,1)), rgH(i + vec3(1,0,1)), f.x), mix(rgH(i + vec3(0,1,1)), rgH(i + vec3(1,1,1)), f.x), f.y), f.z); }',
    'float rgCell(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); float d = 8.0;',
    '  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++){',
    '    vec3 o = vec3(float(a), float(b), float(c)); vec3 r = o + vec3(rgH(i + o), rgH(i + o + 31.0), rgH(i + o + 57.0)) - f;',
    '    d = min(d, dot(r, r)); }',
    '  return sqrt(d); }',
    'vec3 rgBump(vec3 sp, vec3 n, float h, float fd){ vec3 sx = dFdx(sp), sy = dFdy(sp); vec3 r1 = cross(sy, n), r2 = cross(n, sx);',
    '  float det = dot(sx, r1) * fd; vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2); return normalize(abs(det) * n - g); }',
  ].join('\n');

  function bumpy(T, params, opts) {
    var m = new T.MeshPhysicalMaterial(params);
    opts = opts || {};
    var freq = (opts.freq || 40).toFixed(2), amp = (opts.amp || 0.004).toFixed(5), stretch = opts.stretch || [1, 1, 1];
    var mode = opts.mode || 'warts';
    m.onBeforeCompile = function (sh) {
      sh.vertexShader = 'varying vec3 vRgObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRgObj = position;');
      var hExpr = mode === 'warts'
        ? 'pow(max(0.0, 1.0 - rgCell(q * ' + freq + ')), 2.0) * 0.8 + 0.25 * rgN(q * 9.0)'
        : mode === 'feather'
          ? '0.6 * rgN(q * vec3(' + freq + ' * 0.35, ' + freq + ', ' + freq + ' * 0.35)) + 0.3 * rgN(q * 7.0)'
          : '0.7 * rgN(q * ' + freq + ') + 0.3 * rgN(q * 6.0)';
      sh.fragmentShader = BUMP_GLSL + '\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 q = vRgObj * vec3(' + stretch.map(function (s) { return s.toFixed(2); }).join(',') + ');\nfloat rgW = length(fwidth(q));\nfloat rgHt = (' + hExpr + ') * smoothstep(0.6, 0.15, rgW * ' + freq + ');\ndiffuseColor.rgb *= 0.86 + 0.28 * rgN(q * 5.0 + 3.0);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = rgBump(-vViewPosition, normal, rgHt * ' + amp + ', faceDirection);');
    };
    m.customProgramCacheKey = function () { return 'rg-' + mode + freq + amp; };
    return m;
  }

  var MATS = null;
  function makeMats(T) {
    var nug = (global.NugHero && NugHero.makeBreadingMaterial) ? NugHero.makeBreadingMaterial() : new T.MeshPhysicalMaterial({ color: srgb(T, '#c88a3a'), roughness: 0.6 });
    var nugDark = (global.NugHero && NugHero.makeBreadingMaterial) ? NugHero.makeBreadingMaterial() : nug.clone();
    nugDark.color = new T.Color(0.55, 0.42, 0.34);
    var glow = new T.MeshBasicMaterial({ color: new T.Color(3.2, 1.6, 0.25), toneMapped: false });
    MATS = {
      nug: nug, nugDark: nugDark,
      pickle: bumpy(T, { color: srgb(T, '#3d6a1e'), roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: srgb(T, '#b9e07a') }, { freq: 22, amp: 0.006, mode: 'warts' }),
      pickleDk: bumpy(T, { color: srgb(T, '#365a17'), roughness: 0.4, clearcoat: 0.4 }, { freq: 30, amp: 0.006, mode: 'warts' }),
      felt: bumpy(T, { color: srgb(T, '#2b3243'), roughness: 0.92, sheen: 1.0, sheenColor: srgb(T, '#6a7799'), sheenRoughness: 0.45 }, { freq: 90, amp: 0.0012, mode: 'nap' }),
      feltDk: bumpy(T, { color: srgb(T, '#161a24'), roughness: 0.9, sheen: 0.8, sheenColor: srgb(T, '#3d4660'), sheenRoughness: 0.5 }, { freq: 90, amp: 0.001, mode: 'nap' }),
      badge: new T.MeshPhysicalMaterial({ color: srgb(T, '#e8b450'), metalness: 1, roughness: 0.28, clearcoat: 0.6 }),
      eyes: new T.MeshPhysicalMaterial({ color: srgb(T, '#060608'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
      shades: new T.MeshPhysicalMaterial({ color: srgb(T, '#050507'), roughness: 0.06, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 }),
      satin: new T.MeshPhysicalMaterial({ color: srgb(T, '#b3241a'), roughness: 0.34, sheen: 1, sheenColor: srgb(T, '#ff7a66'), sheenRoughness: 0.3 }),
      knot: new T.MeshPhysicalMaterial({ color: srgb(T, '#7b1a12'), roughness: 0.45, sheen: 0.6, sheenColor: srgb(T, '#ff7a66') }),
      paper: bumpy(T, { color: srgb(T, '#ece5d2'), roughness: 0.95 }, { freq: 120, amp: 0.0006, mode: 'nap' }),
      cup: bumpy(T, { color: srgb(T, '#e7e0cf'), roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 }, { freq: 60, amp: 0.0008, mode: 'nap' }),
      sauce: new T.MeshPhysicalMaterial({ color: srgb(T, '#9a3418'), roughness: 0.3, clearcoat: 0.8 }),
      lid: new T.MeshPhysicalMaterial({ color: srgb(T, '#f1ede2'), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
      cloth: bumpy(T, { color: srgb(T, '#161a26'), roughness: 0.96, sheen: 1, sheenColor: srgb(T, '#4a5677'), sheenRoughness: 0.5 }, { freq: 70, amp: 0.0012, mode: 'nap' }),
      clothDk: new T.MeshPhysicalMaterial({ color: srgb(T, '#0b0c10'), roughness: 1, side: T.DoubleSide }),
      glow: glow,
      hen: bumpy(T, { color: srgb(T, '#efe8d8'), roughness: 0.82, sheen: 1, sheenColor: srgb(T, '#ffffff'), sheenRoughness: 0.6 }, { freq: 55, amp: 0.0022, mode: 'feather', stretch: [1, 1, 1] }),
      henDark: bumpy(T, { color: srgb(T, '#cbc1ad'), roughness: 0.85, sheen: 0.8, sheenColor: srgb(T, '#ffffff') }, { freq: 60, amp: 0.0024, mode: 'feather' }),
      comb: bumpy(T, { color: srgb(T, '#b52320'), roughness: 0.5, clearcoat: 0.3, sheen: 0.4, sheenColor: srgb(T, '#ff8a7a') }, { freq: 40, amp: 0.002, mode: 'nap' }),
      beak: new T.MeshPhysicalMaterial({ color: srgb(T, '#de9628'), roughness: 0.42, clearcoat: 0.4 }),
    };
    // the hood's cowl is an open-fronted shell; let the lining show from inside
    MATS.cloth.side = T.DoubleSide;
    return MATS;
  }

  // ---- procedural textures ----------------------------------------------------------
  function canvasTex(T, w, h, draw, repeat) {
    var c = doc.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    return t;
  }
  function texRng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function brickTex(T, bump) {
    return canvasTex(T, 512, 512, function (g, w, h) {
      var r = texRng(7), bw = 64, bh = 22, mortar = 3;
      g.fillStyle = bump ? '#606060' : '#3b3330'; g.fillRect(0, 0, w, h);
      for (var row = 0; row < h / bh; row++) {
        var off = (row % 2) * bw / 2;
        for (var col = -1; col < w / bw + 1; col++) {
          var x = col * bw + off, y = row * bh, t = r();
          if (bump) { var v = 150 + Math.floor(r() * 60); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; }
          else {
            var base = t < 0.12 ? [52, 28, 24] : t < 0.2 ? [96, 60, 44] : [78 + r() * 18, 40 + r() * 12, 32 + r() * 9];
            g.fillStyle = 'rgb(' + base.map(Math.floor).join(',') + ')';
          }
          g.fillRect(x + mortar / 2, y + mortar / 2, bw - mortar, bh - mortar);
          if (!bump) {
            for (var k = 0; k < 18; k++) { g.fillStyle = 'rgba(0,0,0,' + (r() * 0.18).toFixed(3) + ')'; g.fillRect(x + r() * bw, y + r() * bh, 2 + r() * 5, 1 + r() * 3); }
          }
        }
      }
      if (!bump) { // grime running down from the top
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,8,6,0.25)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    }, [5.2, 2.2]);
  }
  function paveTex(T, kind) {
    // kind: 'color' | 'rough' | 'bump'
    return canvasTex(T, 512, 512, function (g, w, h) {
      var r = texRng(11), n = 4, s = w / n;
      g.fillStyle = kind === 'rough' ? '#8a8a8a' : kind === 'bump' ? '#808080' : '#2e3036'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var t = r();
        if (kind === 'color') { var v = 52 + t * 18; g.fillStyle = 'rgb(' + Math.floor(v) + ',' + Math.floor(v + 2) + ',' + Math.floor(v + 7) + ')'; }
        else if (kind === 'rough') { var q = 150 + t * 60; g.fillStyle = 'rgb(' + Math.floor(q) + ',' + Math.floor(q) + ',' + Math.floor(q) + ')'; }
        else g.fillStyle = '#b0b0b0';
        g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        for (var k = 0; k < 40; k++) { // speckle / gum / grit
          g.fillStyle = kind === 'color' ? 'rgba(20,20,24,' + (r() * 0.25).toFixed(2) + ')' : 'rgba(0,0,0,' + (r() * 0.2).toFixed(2) + ')';
          g.fillRect(i * s + r() * s, j * s + r() * s, 1 + r() * 4, 1 + r() * 4);
        }
      }
      // wet patches: darker colour, much smoother
      for (var p = 0; p < 7; p++) {
        var cx = r() * w, cy = r() * h, rad = 20 + r() * 60;
        var gg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        if (kind === 'rough') { gg.addColorStop(0, 'rgba(10,10,10,0.95)'); gg.addColorStop(1, 'rgba(10,10,10,0)'); }
        else if (kind === 'color') { gg.addColorStop(0, 'rgba(15,18,26,0.45)'); gg.addColorStop(1, 'rgba(15,18,26,0)'); }
        else { gg.addColorStop(0, 'rgba(128,128,128,0.8)'); gg.addColorStop(1, 'rgba(128,128,128,0)'); }
        g.fillStyle = gg; g.beginPath(); g.ellipse(cx, cy, rad * 1.6, rad, r() * 3, 0, Math.PI * 2); g.fill();
      }
    }, [3.6, 1.6]);
  }
  function roadTex(T, kind) {
    return canvasTex(T, 512, 256, function (g, w, h) {
      var r = texRng(23);
      g.fillStyle = kind === 'rough' ? '#8a8a8a' : '#1d1f24'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 4000; k++) {
        var v = kind === 'rough' ? 110 + r() * 90 : 20 + r() * 26;
        g.fillStyle = 'rgb(' + Math.floor(v) + ',' + Math.floor(v) + ',' + Math.floor(v + (kind === 'rough' ? 0 : 3)) + ')';
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      for (var p = 0; p < 9; p++) { // puddles: near-mirror
        var cx = r() * w, cy = r() * h, rad = 18 + r() * 46;
        var gg = g.createRadialGradient(cx, cy, rad * 0.5, cx, cy, rad);
        gg.addColorStop(0, kind === 'rough' ? 'rgba(4,4,4,1)' : 'rgba(8,10,16,0.75)'); gg.addColorStop(1, 'rgba(8,10,16,0)');
        g.fillStyle = gg; g.beginPath(); g.ellipse(cx, cy, rad * 1.9, rad, 0, 0, Math.PI * 2); g.fill();
      }
    }, [2.2, 1]);
  }
  function glowTex(T, inner, outer) {
    var t = canvasTex(T, 128, 128, function (g, w) {
      var gg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gg.addColorStop(0, inner); gg.addColorStop(0.3, outer); gg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gg; g.fillRect(0, 0, w, w);
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  }
  function neonTex(T) {
    var t = canvasTex(T, 2048, 512, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.font = '900 300px "Arial Black", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      for (var pass = 0; pass < 3; pass++) {
        g.shadowColor = 'rgba(255,60,170,1)'; g.shadowBlur = [70, 30, 8][pass];
        g.strokeStyle = pass === 2 ? '#fff0f8' : '#ff4fb0'; g.lineWidth = [26, 16, 6][pass];
        g.strokeText('ARCADE', w / 2, h / 2 + 6);
      }
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  }
  function doorTex(T) {
    var t = canvasTex(T, 256, 512, function (g, w, h) {
      var gg = g.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#3a2a40'); gg.addColorStop(0.6, '#d07a3a'); gg.addColorStop(1, '#5a3420');
      g.fillStyle = gg; g.fillRect(0, 0, w, h);
      // cabinets inside, silhouetted, screens lit
      var cols = ['#38e0ff', '#ff4fb0', '#ffd34a', '#7cff6a'];
      for (var i = 0; i < 4; i++) {
        var x = 14 + i * 60; g.fillStyle = 'rgba(18,10,18,0.92)'; g.fillRect(x, 230, 44, 260);
        g.fillStyle = cols[i]; g.globalAlpha = 0.85; g.fillRect(x + 6, 262, 32, 26); g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(0, 0, w, 60);
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  }

  // ---- scene ------------------------------------------------------------------------
  var T, R, scene, cam, agents = [], byName = {}, world = {}, raf = 0, lastT = 0, hand = false;
  var ray, mouseNdc, groundPlane, cursor = { x: 0, z: 0, on: false, moved: 0 }, camDrift = { x: 0, y: 0 };

  function buildSet() {
    var g = new T.Group(); scene.add(g);
    function mesh(geo, mat, x, y, z, cast, recv) {
      var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = !!cast; m.receiveShadow = recv !== false; g.add(m); return m;
    }
    var iron = new T.MeshPhysicalMaterial({ color: srgb(T, '#1b1e24'), roughness: 0.45, metalness: 0.7, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    var concrete = new T.MeshPhysicalMaterial({ color: srgb(T, '#6f7178'), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 });

    // pavement
    var pave = new T.MeshPhysicalMaterial({ map: paveTex(T, 'color'), roughnessMap: paveTex(T, 'rough'), bumpMap: paveTex(T, 'bump'), bumpScale: 0.006, roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.2 });
    pave.map.encoding = T.sRGBEncoding;
    var pv = mesh(new T.PlaneGeometry(9.6, ST.kerbZ - ST.wallZ + 0.2), pave, 0, 0, (ST.kerbZ + ST.wallZ) / 2 - 0.05);
    pv.rotation.x = -Math.PI / 2;
    // kerb
    mesh(new T.BoxGeometry(9.6, 0.16, 0.16), concrete, 0, -0.02, ST.kerbZ + 0.07, false);
    // road (wet, puddled)
    var road = new T.MeshPhysicalMaterial({ map: roadTex(T, 'color'), roughnessMap: roadTex(T, 'rough'), roughness: 1, clearcoat: 0.8, clearcoatRoughness: 0.08 });
    road.map.encoding = T.sRGBEncoding;
    var rd = mesh(new T.PlaneGeometry(9.6, 3.2), road, 0, -0.14, ST.roadZ0 + 1.5);
    rd.rotation.x = -Math.PI / 2;
    // road paint: a stop line that's seen better days
    var paint = new T.MeshPhysicalMaterial({ color: srgb(T, '#c9c3a8'), roughness: 0.6, clearcoat: 0.6 });

    // the wall: brick, with the arcade door cut into it
    var brick = new T.MeshPhysicalMaterial({ map: brickTex(T, false), bumpMap: brickTex(T, true), bumpScale: 0.012, roughness: 0.88 });
    brick.map.encoding = T.sRGBEncoding;
    var D = ST.door, wallH = 3.4, x0 = -3.05, x1 = 4.8;
    function wallSeg(xa, xb, ya, yb) {
      var w = xb - xa, h = yb - ya;
      var geo = new T.PlaneGeometry(w, h);
      var uv = geo.attributes.uv; // keep brick scale constant across segments
      for (var i = 0; i < uv.count; i++) uv.setXY(i, (xa + uv.getX(i) * w) / 7.85 + 0.5, (ya + uv.getY(i) * h) / wallH);
      mesh(geo, brick, xa + w / 2, ya + h / 2, ST.wallZ);
    }
    wallSeg(x0, D.x - D.w / 2 - 0.14, 0, wallH);
    wallSeg(D.x + D.w / 2 + 0.14, x1, 0, wallH);
    wallSeg(D.x - D.w / 2 - 0.14, D.x + D.w / 2 + 0.14, D.h + 0.1, wallH);
    // alley: the wall ends, a deeper wall far behind in the dark
    var alleyWall = mesh(new T.PlaneGeometry(2.4, wallH), brick, -4.3, wallH / 2, ST.wallZ - 1.4);
    alleyWall.material = brick;
    var side = mesh(new T.PlaneGeometry(1.4, wallH), brick, x0, wallH / 2, ST.wallZ - 0.7); side.rotation.y = Math.PI / 2;
    // door: recess, frame, lit glass
    var frameM = new T.MeshPhysicalMaterial({ color: srgb(T, '#2a1a12'), roughness: 0.5, clearcoat: 0.6 });
    mesh(new T.BoxGeometry(D.w + 0.28, 0.14, 0.3), frameM, D.x, D.h + 0.05, ST.wallZ - 0.02, true);
    mesh(new T.BoxGeometry(0.14, D.h + 0.1, 0.3), frameM, D.x - D.w / 2 - 0.07, (D.h + 0.1) / 2, ST.wallZ - 0.02, true);
    mesh(new T.BoxGeometry(0.14, D.h + 0.1, 0.3), frameM, D.x + D.w / 2 + 0.07, (D.h + 0.1) / 2, ST.wallZ - 0.02, true);
    var glass = new T.MeshBasicMaterial({ map: doorTex(T), color: new T.Color(1.25, 1.1, 1.0), toneMapped: true });
    glass.map.encoding = T.sRGBEncoding;
    mesh(new T.PlaneGeometry(D.w, D.h), glass, D.x, D.h / 2, ST.wallZ - 0.16, false, false);
    mesh(new T.BoxGeometry(0.05, D.h, 0.06), frameM, D.x, D.h / 2, ST.wallZ - 0.13, false); // the mullion
    // door mat
    var matM = new T.MeshPhysicalMaterial({ color: srgb(T, '#3a1d22'), roughness: 1 });
    var dm = mesh(new T.PlaneGeometry(1.1, 0.6), matM, D.x, 0.006, ST.wallZ + 0.36); dm.rotation.x = -Math.PI / 2;
    // the neon
    var neon = new T.Mesh(new T.PlaneGeometry(1.9, 0.48), new T.MeshBasicMaterial({ map: neonTex(T), transparent: true, depthWrite: false, toneMapped: false, color: new T.Color(1.6, 1.6, 1.6) }));
    neon.position.set(D.x, D.h + 0.5, ST.wallZ + 0.04); g.add(neon);
    world.neon = neon;

    // bench
    var wood = new T.MeshPhysicalMaterial({ color: srgb(T, '#5a3a22'), roughness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    var B = ST.bench;
    for (var s = 0; s < 3; s++) mesh(new T.BoxGeometry(B.len, 0.04, 0.12), wood, B.x, B.seat - 0.02, B.z + 0.13 - s * 0.14, true);
    for (s = 0; s < 2; s++) { var bk = mesh(new T.BoxGeometry(B.len, 0.11, 0.035), wood, B.x, B.seat + 0.2 + s * 0.15, B.z - 0.23, true); bk.rotation.x = -0.12; }
    [-1, 1].forEach(function (sx) {
      mesh(new T.BoxGeometry(0.05, B.seat, 0.05), iron, B.x + sx * (B.len / 2 - 0.12), B.seat / 2, B.z + 0.12, true);
      mesh(new T.BoxGeometry(0.05, B.seat + 0.4, 0.05), iron, B.x + sx * (B.len / 2 - 0.12), (B.seat + 0.4) / 2, B.z - 0.22, true);
      mesh(new T.BoxGeometry(0.05, 0.04, 0.42), iron, B.x + sx * (B.len / 2 - 0.12), B.seat - 0.06, B.z - 0.05, true);
    });

    // the streetlamp, sodium
    var L = ST.lamp;
    mesh(new T.CylinderGeometry(0.11, 0.14, 0.32, 20), iron, L.x, 0.16, L.z, true);
    mesh(new T.CylinderGeometry(0.045, 0.06, 3.6, 16), iron, L.x, 1.8, L.z, true);
    var arm = mesh(new T.CylinderGeometry(0.03, 0.03, 1.05, 10), iron, L.x - 0.5, 3.55, L.z - 0.05, true); arm.rotation.z = Math.PI / 2 - 0.12;
    mesh(new T.CylinderGeometry(0.08, 0.26, 0.2, 20), iron, L.x - 0.98, 3.48, L.z - 0.05, true);
    var bulb = mesh(new T.SphereGeometry(0.12, 16, 10), new T.MeshBasicMaterial({ color: new T.Color(4.0, 2.2, 0.8), toneMapped: false }), L.x - 0.98, 3.36, L.z - 0.05, false, false);
    bulb.scale.y = 0.45;
    world.lampHead = new T.Vector3(L.x - 0.98, 3.34, L.z - 0.05);
    // a fake volumetric cone under the head
    var coneMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uCol: { value: new T.Color(1.0, 0.55, 0.2) }, uK: { value: 0.16 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 1.5); float a = uK * vY * vY * f; gl_FragColor = vec4(uCol * a, a); }',
    });
    var cone = mesh(new T.CylinderGeometry(0.12, 1.55, 3.35, 32, 1, true), coneMat, L.x - 0.98, 3.36 - 3.35 / 2, L.z - 0.05, false, false);
    world.cone = cone;

    // newspaper box
    var blue = new T.MeshPhysicalMaterial({ color: srgb(T, '#1e4f8f'), roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    var bx = ST.box;
    mesh(new T.BoxGeometry(0.5, 0.95, 0.42), blue, bx.x, 0.6, bx.z, true);
    mesh(new T.BoxGeometry(0.34, 0.2, 0.02), new T.MeshPhysicalMaterial({ color: srgb(T, '#d9d4c2'), roughness: 0.9, emissive: srgb(T, '#2a2418') }), bx.x, 0.82, bx.z + 0.215, false);
    [-1, 1].forEach(function (sx) { mesh(new T.BoxGeometry(0.04, 0.14, 0.04), iron, bx.x + sx * 0.2, 0.07, bx.z, true); });

    // bollards
    var band = new T.MeshPhysicalMaterial({ color: srgb(T, '#d9a520'), roughness: 0.5, clearcoat: 0.5 });
    [[-3.05, 1.22], [3.05, 0.15]].forEach(function (p) {
      mesh(new T.CylinderGeometry(0.1, 0.12, 0.85, 18), iron, p[0], 0.425, p[1], true);
      mesh(new T.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), iron, p[0], 0.85, p[1], true);
      mesh(new T.CylinderGeometry(0.103, 0.103, 0.06, 18), band, p[0], 0.7, p[1], false);
    });

    // THE GRATE — in the gutter, gold underneath when it passes
    var G = ST.grate;
    var under = mesh(new T.PlaneGeometry(0.8, 0.36), new T.MeshBasicMaterial({ color: new T.Color(0, 0, 0), toneMapped: false }), G.x, -0.2, G.z);
    under.rotation.x = -Math.PI / 2; world.under = under;
    for (var k = 0; k < 9; k++) {
      var bar = mesh(new T.BoxGeometry(0.035, 0.03, 0.36), iron, G.x - 0.36 + k * 0.09, -0.125, G.z, false);
      void bar;
    }
    mesh(new T.BoxGeometry(0.86, 0.03, 0.04), iron, G.x, -0.125, G.z - 0.19, false);
    mesh(new T.BoxGeometry(0.86, 0.03, 0.04), iron, G.x, -0.125, G.z + 0.19, false);
    var dg = new T.Sprite(new T.SpriteMaterial({ map: glowTex(T, 'rgba(255,205,90,1)', 'rgba(255,150,30,0.35)'), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
    dg.position.set(G.x, 0.12, G.z - 0.1); dg.scale.set(3.4, 1.7, 1); g.add(dg); world.drainGlow = dg;

    // glows: lamp head, door spill, neon halo
    function halo(pos, size, inner, outer, op) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex(T, inner, outer), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: op, toneMapped: false }));
      sp.position.copy(pos); sp.scale.set(size, size, 1); g.add(sp); return sp;
    }
    halo(world.lampHead, 1.6, 'rgba(255,200,120,0.9)', 'rgba(255,140,50,0.25)', 0.9);
    world.neonHalo = halo(new T.Vector3(D.x, D.h + 0.5, ST.wallZ + 0.1), 3.0, 'rgba(255,80,180,0.5)', 'rgba(255,40,160,0.12)', 0.75);
    return g;
  }

  function buildLights() {
    scene.add(new T.HemisphereLight(srgb(T, '#33416b'), srgb(T, '#0c0806'), 0.2));
    // the moon, cool, from behind-left: rims everyone
    var moon = new T.DirectionalLight(srgb(T, '#8aa6ff'), 0.5);
    moon.position.set(-3, 5, -4); scene.add(moon);
    // THE KEY: the sodium lamp. A spot, shadow-casting.
    var lamp = new T.SpotLight(srgb(T, '#ffb35e'), 46, 10, 0.72, 0.7, 1.7);
    lamp.position.copy(world.lampHead);
    lamp.target.position.set(0.9, 0, 0.35);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(hand ? 1024 : 2048, hand ? 1024 : 2048);
    lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.03; lamp.shadow.radius = 4;
    lamp.shadow.camera.near = 0.5; lamp.shadow.camera.far = 12;
    scene.add(lamp); scene.add(lamp.target);
    // a wide, dim, shadowless spill so the wet road catches the sodium too
    var spill = new T.SpotLight(srgb(T, '#ff9f45'), 10, 9, 1.15, 0.9, 1.6);
    spill.position.copy(world.lampHead); spill.target.position.set(0.6, -0.14, 2.6);
    scene.add(spill); scene.add(spill.target);
    world.lamp = lamp;
    // the door spills warm across the mat
    var door = new T.PointLight(srgb(T, '#ff9e57'), 5.5, 4.5, 2);
    door.position.set(ST.door.x, 1.3, ST.wallZ + 0.45); scene.add(door); world.doorLight = door;
    // the neon washes pink down the brick
    var neonL = new T.PointLight(srgb(T, '#ff4fb0'), 4.0, 4.0, 2);
    neonL.position.set(ST.door.x, ST.door.h + 0.5, ST.wallZ + 0.35); scene.add(neonL); world.neonLight = neonL;
    // the drain: off until it passes
    var drain = new T.PointLight(srgb(T, '#ffc04a'), 0, 4.6, 1.6);
    drain.position.set(ST.grate.x, 0.15, ST.grate.z - 0.1); scene.add(drain); world.drainLight = drain;
  }

  // A night environment for reflections: dark dome, the lamp, the neon, the
  // door. Wet surfaces then mirror THIS street, not a white studio.
  function buildEnv() {
    var es = new T.Scene();
    es.add(new T.Mesh(new T.SphereGeometry(20, 24, 12), new T.MeshBasicMaterial({ color: srgb(T, '#0b0f1c'), side: T.BackSide })));
    function panel(col, x, y, z, w, h) { var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: col, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 1, 0); es.add(m); }
    panel(new T.Color(9, 5, 2), 2.0, 4, 1.5, 0.8, 0.4);
    panel(new T.Color(6, 1, 3.5), 0.5, 2.6, -2.5, 2.4, 0.6);
    panel(new T.Color(3, 1.8, 1.0), 0.5, 1.1, -2.5, 1.2, 2.0);
    panel(new T.Color(0.5, 0.6, 1.0), -6, 6, -6, 8, 3);
    var pm = new T.PMREMGenerator(R);
    var tex = pm.fromScene(es, 0.02).texture;
    pm.dispose();
    return tex;
  }

  // ---- rain -----------------------------------------------------------------------
  function buildRain() {
    var N = hand ? 260 : 560, pos = new Float32Array(N * 6), drops = [];
    for (var i = 0; i < N; i++) drops.push({ x: rr(-5, 5), y: rr(0, 6), z: rr(-1.6, 4), v: rr(7, 9.5) });
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var lines = new T.LineSegments(geo, new T.LineBasicMaterial({ color: srgb(T, '#a9bde6'), transparent: true, opacity: 0.28, depthWrite: false }));
    lines.frustumCulled = false; scene.add(lines);
    // ripples on the wet ground
    var rip = [], rm = new T.MeshBasicMaterial({ color: srgb(T, '#b9c9ee'), transparent: true, opacity: 0, depthWrite: false });
    for (i = 0; i < 26; i++) {
      var m = new T.Mesh(new T.RingGeometry(0.03, 0.04, 24), rm.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      rip.push({ m: m, t: 1 });
    }
    world.rain = { drops: drops, geo: geo, rip: rip, ri: 0 };
  }
  function tickRain(dt) {
    var W = world.rain; if (!W) return;
    var p = W.geo.attributes.position.array, d, i;
    for (i = 0; i < W.drops.length; i++) {
      d = W.drops[i]; d.y -= d.v * dt; d.x -= dt * 0.6;
      var floorY = d.z > ST.kerbZ ? -0.14 : 0;
      if (d.y < floorY) {
        if (rnd() < 0.18) { var r = W.rip[W.ri++ % W.rip.length]; r.t = 0; r.m.position.set(d.x, floorY + 0.004, d.z); r.m.visible = true; }
        d.y = rr(4.5, 6); d.x = rr(-5, 5.5); d.z = rr(-1.6, 4);
      }
      p[i * 6] = d.x; p[i * 6 + 1] = d.y; p[i * 6 + 2] = d.z;
      p[i * 6 + 3] = d.x + 0.06 * 0.6 / 8; p[i * 6 + 4] = d.y + 0.22; p[i * 6 + 5] = d.z;
    }
    W.geo.attributes.position.needsUpdate = true;
    for (i = 0; i < W.rip.length; i++) {
      var q = W.rip[i]; if (q.t >= 1) continue;
      q.t = Math.min(1, q.t + dt * 1.8);
      q.m.scale.setScalar(1 + q.t * 4.5); q.m.material.opacity = 0.35 * (1 - q.t);
      if (q.t >= 1) q.m.visible = false;
    }
  }

  // ---- the regulars ------------------------------------------------------------------
  var NAMES = { crumb: 'Big Crumb', dill: 'Det. Dill', hood: 'The Hooded Nug', gravy: 'Gravy Jones', hen: 'Henrietta' };
  var ICON = { crumb: '🕶️', dill: '🥒', hood: '🧥', gravy: '🥫', hen: '🐔' };

  function makeAgent(name, x, z, yaw, o) {
    var root = RegularsCast.build(T, name, function (k) { return MATS[k] || MATS.nug; });
    scene.add(root);
    var a = {
      name: name, root: root, parts: root.userData.parts,
      x: x, z: z, y: 0, yaw: yaw, vx: 0, vz: 0, speed: 0,
      maxSpeed: o.speed, radius: o.radius, h: o.h,
      act: null, actT: 0, thinkT: rr(0.2, 1.2), plan: null,
      needs: { energy: rr(0.6, 1), social: rr(0.2, 0.6), curiosity: rr(0.2, 0.6), duty: rr(0.4, 0.8) },
      look: null, headYaw: 0, gesture: 0, talk: 0, walkPh: rnd() * 6, moving: 0,
      engagedBy: null, cooldown: {}, hidden: false, label: '', bubble: null,
    };
    // pose the rest state of each part so animation is an OFFSET, never a reset
    Object.keys(a.parts).forEach(function (k) { var p = a.parts[k]; p.userData.rest = p.position.clone(); });
    agents.push(a); byName[name] = a;
    return a;
  }

  // steering: arrive at (tx,tz), around the furniture and each other
  function steer(a, tx, tz, dt, mul) {
    var dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    var want = a.maxSpeed * (mul || 1) * clamp(d / 0.6, 0, 1);
    var ux = d > 1e-4 ? dx / d : 0, uz = d > 1e-4 ? dz / d : 0;
    var fx = ux * want, fz = uz * want;
    function push(ox, oz, orad, k) {
      var ex = a.x - ox, ez = a.z - oz, e = Math.hypot(ex, ez), lim = orad + a.radius + 0.12;
      if (e < lim && e > 1e-4) { var s = (lim - e) / lim * k; fx += ex / e * s; fz += ez / e * s; }
    }
    OBST.forEach(function (o) { push(o.x, o.z, o.r, 2.2); });
    agents.forEach(function (b) { if (b !== a && !b.hidden) push(b.x, b.z, b.radius, 1.6); });
    var k = Math.min(1, dt * 6);
    a.vx += (fx - a.vx) * k; a.vz += (fz - a.vz) * k;
    a.x += a.vx * dt; a.z += a.vz * dt;
    if (!a.offstage) { a.x = clamp(a.x, ST.bounds.x0, ST.bounds.x1); a.z = clamp(a.z, ST.bounds.z0, ST.bounds.z1); }
    a.speed = Math.hypot(a.vx, a.vz);
    if (a.speed > 0.05) a.yawWant = Math.atan2(a.vx, a.vz);
    return d;
  }
  function face(a, tx, tz) { a.yawWant = Math.atan2(tx - a.x, tz - a.z); }
  function stand(a, dt) { a.vx *= Math.pow(0.02, dt); a.vz *= Math.pow(0.02, dt); a.x += a.vx * dt; a.z += a.vz * dt; a.speed = Math.hypot(a.vx, a.vz); }

  // ---- THE BRAIN -------------------------------------------------------------------
  // An activity: { id, label(a), emoji, score(a) → number, begin(a), tick(a, dt) → true when done }
  function free(b) { return b && !b.hidden && !b.engagedBy && !(b.act && b.act.busy); }

  function engage(by, target, label) {
    target.engagedBy = by;
    target.prev = target.act;
    setAct(target, {
      id: 'engaged', busy: true, label: function () { return label; }, emoji: '',
      begin: function () { }, tick: function (t, dt) { if (!t.engagedBy) return true; stand(t, dt); face(t, t.engagedBy.x, t.engagedBy.z); t.talk = Math.max(t.talk, t.engagedBy.speaking ? 0 : 0.6); return false; },
    });
  }
  function release(target) { if (!target) return; target.engagedBy = null; target.act = null; target.thinkT = 0; }

  function goThenDo(a, tx, tz, mul, then) {
    // a small helper: walk there, then run `then(a, dt, t)` until it returns true
    var st = { phase: 'go', t: 0 };
    return function (a2, dt) {
      if (st.phase === 'go') {
        if (steer(a2, tx, tz, dt, mul) < 0.08 || st.t > 12) { st.phase = 'do'; st.t = 0; }
        st.t += dt; return false;
      }
      st.t += dt; stand(a2, dt);
      return then(a2, dt, st.t);
    };
  }

  function ACTS(name) {
    var A = byName, P = ST;
    if (name === 'crumb') return [
      { id: 'guard', emoji: '🚪', label: function () { return 'guarding the door'; },
        score: function (a) { return 0.55 + a.needs.duty * 0.5; },
        begin: function (a) { a.plan = goThenDo(a, P.post.x, P.post.z, 1, function (a2, dt, t) { face(a2, a2.x + 0.15, a2.z + 1); a2.needs.duty = Math.max(0, a2.needs.duty - dt * 0.02); return t > rr(9, 15); }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'patrol', emoji: '🚶', label: function () { return 'walking his beat'; },
        score: function (a) { return 0.2 + (1 - a.needs.duty) * 0.5; },
        begin: function (a) { var tx = pick([-1.6, 1.25, -1.0]), back = false;
          a.plan = function (a2, dt) { var d = steer(a2, back ? P.post.x : tx, back ? P.post.z : -0.95, dt, 0.8); if (d < 0.1) { if (back) return true; back = true; a2.needs.duty = 1; } return false; }; },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'shoo', emoji: '👋', label: function () { return 'shooing Henrietta off the mat'; },
        score: function (a) { var h = A.hen; return (h && !h.hidden && dist(h.x, h.z, P.post.x + 0.6, P.post.z) < 1.25 && !(a.cooldown.shoo > nowS())) ? 1.3 : 0; },
        begin: function (a) { var h = A.hen; a.cooldown.shoo = nowS() + 14; say(a, pick(['Scram.', 'Off the mat.', 'Not tonight, bird.']), 2.6);
          a.plan = function (a2, dt) { a2.gesture = Math.min(1, a2.gesture + dt * 4); var d = steer(a2, h.x, h.z, dt, 1.3); if (d < 0.75 && h.act && h.act.id !== 'flee') fleeFrom(h, a2.x, a2.z); return d < 0.7 || a2.actT > 3.5; }; },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'doze', emoji: '💤', label: function () { return 'asleep on his feet'; },
        score: function (a) { return a.needs.energy < 0.3 ? 0.95 : 0; },
        begin: function (a) { bubble(a, '💤', 'z z z', 5); a.plan = goThenDo(a, P.post.x, P.post.z, 0.8, function (a2, dt, t) { a2.needs.energy = Math.min(1, a2.needs.energy + dt * 0.08); a2.sleep = 1; return t > 12; }); },
        tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.sleep = 0; } },
    ];
    if (name === 'dill') return [
      { id: 'interview', emoji: '📝', label: function (a) { return 'interviewing ' + NAMES[a.target.name]; },
        score: function (a) { var c = ['gravy', 'crumb', 'hood'].filter(function (n) { var b = A[n]; return free(b) && !(a.cooldown[n] > nowS()); }); a.cand = c.length ? pick(c) : null; return a.cand ? 0.45 + a.needs.social * 0.6 + rnd() * 0.15 : 0; },
        begin: function (a) {
          var t = A[a.cand]; a.target = t; a.cooldown[t.name] = nowS() + 40;
          var fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), ox = t.x + fx * (t.radius + a.radius + 0.25), oz = t.z + fz * (t.radius + a.radius + 0.25);
          ox = clamp(ox, P.bounds.x0, P.bounds.x1); oz = clamp(oz, P.bounds.z0 + 0.15, P.bounds.z1);
          var asked = false, refused = false;
          a.plan = function (a2, dt) {
            if (!asked) {
              if (t.hidden) return true;
              if (steer(a2, ox, oz, dt, 1) > 0.12 && a2.actT < 10) return false;
              asked = true;
              if (t.name === 'hood' && rnd() < 0.55) { refused = true; say(t, pick(['No comment.', 'Ask the water.', "You're tailing the wrong weather."]), 2.6); setAct(t, find(t, 'vanish')); return true; }
              if (!free(t)) return true;
              engage(a2, t, 'giving a statement to Det. Dill');
              bubble(a2, '📝', pick(['Where were you at 3:04?', 'Walk me through it.', 'Anything golden tonight?', 'Did you hear the pipes?']), 3.2);
              a2.convoT = 0;
            }
            stand(a2, dt); face(a2, t.x, t.z); a2.writing = 1;
            a2.convoT += dt;
            if (a2.convoT > 3.3 && !a2.answered) { a2.answered = true; say(t, lineFor(t.name), 3.4); }
            a2.needs.social = Math.max(0, a2.needs.social - dt * 0.08);
            return a2.convoT > 7.5;
          };
          a.answered = false; void refused;
        },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { a.writing = 0; if (a.target && a.target.engagedBy === a) release(a.target); } },
      { id: 'inspect', emoji: '🔎', label: function () { return 'inspecting the storm drain'; },
        score: function (a) { return 0.25 + a.needs.curiosity * 0.6; },
        begin: function (a) { a.plan = goThenDo(a, P.drainSpot.x + 0.1, P.drainSpot.z, 1, function (a2, dt, t) { face(a2, P.grate.x, P.grate.z); a2.stoop = Math.min(1, t * 1.5); a2.writing = t > 2 ? 1 : 0; a2.needs.curiosity = Math.max(0, a2.needs.curiosity - dt * 0.07); return t > 8; }); },
        tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.stoop = 0; a.writing = 0; } },
      { id: 'tail', emoji: '👀', label: function () { return 'tailing the Hooded Nug'; },
        score: function (a) { var h = A.hood; return (h && !h.hidden && h.speed > 0.15 && !(a.cooldown.tail > nowS())) ? 0.75 + rnd() * 0.2 : 0; },
        begin: function (a) { a.cooldown.tail = nowS() + 30; bubble(a, '👀', '', 2);
          a.plan = function (a2, dt) { var h = A.hood; if (h.hidden) { say(a2, pick(['...gone again.', 'Of course.', 'Underlined twice.']), 2.6); return true; }
            var dx = h.x - a2.x, dz = h.z - a2.z, d = Math.hypot(dx, dz);
            if (d > 1.7) steer(a2, h.x - dx / d * 1.5, h.z - dz / d * 1.5, dt, 0.9); else { stand(a2, dt); face(a2, h.x, h.z); a2.writing = 1; }
            return a2.actT > 16; }; },
        tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.writing = 0; } },
      { id: 'pace', emoji: '🤔', label: function () { return 'thinking it through'; },
        score: function () { return 0.22 + rnd() * 0.1; },
        begin: function (a) { var tx = rr(-1.5, 1.6), tz = rr(-0.6, 1.0); if (rnd() < 0.4) bubble(a, '🤔', pick(['3:04 AM...', 'the pipes...', 'no crumbs...']), 2.4);
          a.plan = goThenDo(a, tx, tz, 0.7, function (a2, dt, t) { a2.writing = 1; return t > 4; }); },
        tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.writing = 0; } },
    ];
    if (name === 'hood') return [
      { id: 'lurk', emoji: '🌑', label: function () { return 'lurking where the lamp doesn\'t reach'; },
        score: function () { return 0.5 + rnd() * 0.15; },
        begin: function (a) { var s = pick(P.lurk); a.plan = goThenDo(a, s.x, s.z, 0.8, function (a2, dt, t) { face(a2, 0, 0.5); return t > rr(10, 16); }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'whisper', emoji: '🤫', label: function (a) { return 'whispering to ' + NAMES[a.target.name]; },
        score: function (a) { var c = ['gravy', 'crumb'].filter(function (n) { return free(A[n]) && !(a.cooldown[n] > nowS()); }); a.cand = c.length ? pick(c) : null; return a.cand ? 0.3 + a.needs.social * 0.6 : 0; },
        begin: function (a) {
          var t = A[a.cand]; a.target = t; a.cooldown[t.name] = nowS() + 45;
          var side = t.x > 0 ? -1 : 1, ox = t.x + side * (t.radius + a.radius + 0.12), oz = t.z + 0.25, asked = false;
          a.plan = function (a2, dt) {
            if (!asked) { if (steer(a2, ox, oz, dt, 0.9) > 0.12 && a2.actT < 10) return false; asked = true; if (!free(t)) return true; engage(a2, t, 'hearing a rumor'); bubble(a2, '🤫', lineFor('hood'), 3.6); a2.convoT = 0; }
            stand(a2, dt); face(a2, t.x, t.z); a2.lean = Math.min(1, a2.convoT * 2); a2.convoT += dt;
            a2.needs.social = Math.max(0, a2.needs.social - dt * 0.1);
            if (a2.convoT > 4 && !a2.heard) { a2.heard = true; say(t, t.name === 'gravy' ? pick(['...huh.', '...you don\'t say.', 'mm.']) : pick(['Didn\'t hear that.', '...noted.']), 2.4); }
            return a2.convoT > 6.5;
          };
          a.heard = false;
        },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { a.lean = 0; if (a.target && a.target.engagedBy === a) release(a.target); } },
      { id: 'watch', emoji: '🌀', label: function () { return 'listening to the drain'; },
        score: function (a) { return 0.2 + a.needs.curiosity * 0.5; },
        begin: function (a) { a.plan = goThenDo(a, P.drainSpot.x - 0.7, P.drainSpot.z - 0.15, 0.8, function (a2, dt, t) { face(a2, P.grate.x, P.grate.z); a2.needs.curiosity = Math.max(0, a2.needs.curiosity - dt * 0.06); return t > 9; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'vanish', emoji: '', label: function () { return a2label(byName.hood); },
        score: function (a) { var d = byName.dill; return (d && d.act && d.act.id === 'tail') ? 1.4 : 0.08; },
        begin: function (a) { var gone = 0;
          a.plan = function (a2, dt) {
            if (!a2.hidden) { a2.offstage = true; if (steer(a2, P.alley.x, P.alley.z, dt, 1.25) < 0.25) { a2.hidden = true; a2.root.visible = false; gone = rr(12, 22); } return false; }
            gone -= dt; if (gone > 0) return false;
            a2.x = P.alley.x + 0.4; a2.z = P.alley.z; a2.root.visible = true; a2.hidden = false;
            return true; }; },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { a.offstage = false; a.hidden = false; a.root.visible = true; } },
    ];
    if (name === 'gravy') return [
      { id: 'sit', emoji: '', label: function () { return 'on his bench. not getting up.'; },
        score: function () { return 0.5; }, begin: function () { },
        tick: function (a, dt) { stand(a, dt); face(a, a.x + 0.3, a.z + 1); a.needs.energy -= dt * 0.012; return a.actT > rr(8, 14); } },
      { id: 'doze', emoji: '💤', label: function () { return 'dozing'; },
        score: function (a) { return a.needs.energy < 0.4 ? 0.9 : 0.05; },
        begin: function (a) { bubble(a, '💤', '', 4); }, tick: function (a, dt) { a.sleep = 1; a.needs.energy = Math.min(1, a.needs.energy + dt * 0.06); return a.actT > 14; }, end: function (a) { a.sleep = 0; } },
      { id: 'mutter', emoji: '💬', label: function () { return 'talking to nobody in particular'; },
        score: function (a) { return 0.15 + a.needs.social * 0.4; },
        begin: function (a) { say(a, lineFor('gravy'), 3.4); a.needs.social = 0; }, tick: function (a) { return a.actT > 4; } },
    ];
    if (name === 'hen') return [
      { id: 'peck', emoji: '🌾', label: function () { return 'pecking at crumbs'; },
        score: function () { return 0.5 + rnd() * 0.2; },
        begin: function (a) { var tx = rr(-2.8, 2.6), tz = rr(-0.9, 1.3); a.plan = goThenDo(a, tx, tz, 0.8, function (a2, dt, t) { a2.peck = 1; return t > rr(3, 6); }); },
        tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.peck = 0; } },
      { id: 'roost', emoji: '🪺', label: function () { return 'roosting next to Gravy'; },
        score: function (a) { return a.cooldown.roost > nowS() ? 0 : 0.28; },
        begin: function (a) { a.cooldown.roost = nowS() + 50; var up = 0;
          a.plan = function (a2, dt) {
            if (up === 0) { if (steer(a2, P.henRoost.x, P.henRoost.z + 0.55, dt, 0.9) > 0.1) return false; up = 0.001; }
            if (up < 1) { up = Math.min(1, up + dt * 1.6); a2.x = lerp(a2.x, P.henRoost.x, up); a2.z = lerp(a2.z, P.henRoost.z + 0.05, up); a2.y = P.bench.seat * up + Math.sin(up * Math.PI) * 0.35; face(a2, a2.x + 0.6, a2.z + 1); return false; }
            stand(a2, dt); a2.y = P.bench.seat; a2.sleep = a2.actT > 6 ? 1 : 0; return a2.actT > rr(12, 18); }; },
        tick: function (a, dt) { return a.plan(a, dt); },
        end: function (a) { a.sleep = 0; a.y = 0; a.z = Math.max(a.z, ST.bench.z + 0.55); } },
      { id: 'follow', emoji: '❔', label: function () { return 'following Det. Dill around'; },
        score: function () { var d = byName.dill; return d && d.speed > 0.2 ? 0.3 : 0.05; },
        begin: function (a) { a.plan = function (a2, dt) { var d = byName.dill, dx = d.x - a2.x, dz = d.z - a2.z, dd = Math.hypot(dx, dz); if (dd > 0.9) steer(a2, d.x - dx / dd * 0.7, d.z - dz / dd * 0.7, dt, 1.1); else stand(a2, dt); return a2.actT > 10; }; },
        tick: function (a, dt) { return a.plan(a, dt); } },
      { id: 'wander', emoji: '', label: function () { return 'wandering'; },
        score: function () { return 0.25; },
        begin: function (a) { a.plan = goThenDo(a, rr(-3, 3), rr(-1, 1.3), 0.6, function (a2, dt, t) { return t > 2; }); },
        tick: function (a, dt) { return a.plan(a, dt); } },
    ];
    return [];
  }
  function a2label() { return 'somewhere else'; }

  function find(a, id) { for (var i = 0; i < a.acts.length; i++) if (a.acts[i].id === id) return a.acts[i]; return null; }
  function setAct(a, act) {
    if (a.act && a.act.end) a.act.end(a);
    a.act = act; a.actT = 0;
    if (act) { act.begin && act.begin(a); a.label = act.label(a); }
  }

  // flee is an interrupt any agent can impose on the hen
  function fleeFrom(h, fx, fz) {
    if (h.y > 0.05) return; // she's up on the bench; safe
    setAct(h, { id: 'flee', emoji: '❗', label: function () { return 'running for it'; },
      begin: function (a) { bubble(a, '❗', pick(['BWOK!', 'bwok!!']), 1.6); },
      tick: function (a, dt) { var dx = a.x - fx, dz = a.z - fz, d = Math.hypot(dx, dz) || 1; steer(a, a.x + dx / d * 2, a.z + dz / d * 2, dt, 2.2); a.flap = 1; return a.actT > 1.6; },
      end: function (a) { a.flap = 0; } });
  }

  function think(a) {
    if (a.engagedBy) return;
    var best = null, bs = -1;
    a.acts.forEach(function (act) {
      var s = act.score(a);
      if (a.act && a.act.id === act.id) s += 0.35; // commitment
      if (s > bs) { bs = s; best = act; }
    });
    if (best && (!a.act || best.id !== a.act.id)) {
      setAct(a, best);
      if (best.emoji && rnd() < 0.45 && !a.bubble) bubble(a, best.emoji, '', 2.2);
    }
  }

  function tickBrains(dt) {
    var t = nowS();
    agents.forEach(function (a) {
      // needs drift
      a.needs.energy = clamp(a.needs.energy - dt * 0.004, 0, 1);
      a.needs.social = clamp(a.needs.social + dt * 0.012, 0, 1);
      a.needs.curiosity = clamp(a.needs.curiosity + dt * 0.009, 0, 1);
      a.needs.duty = clamp(a.needs.duty + dt * 0.006, 0, 1);
      a.speaking = a.bubble && a.bubble.until > t;
      if (a.act) {
        a.actT += dt;
        var done = false;
        try { done = a.act.tick(a, dt); } catch (e) { done = true; }
        if (a.act) a.label = a.act.label(a);
        if (done) { var was = a.act; if (was && was.end) was.end(a); a.act = null; a.thinkT = 0; }
      }
      a.thinkT -= dt;
      if (!a.act || (a.thinkT <= 0 && !(a.act && a.act.busy))) {
        a.thinkT = rr(2.5, 4.5);
        if (!a.act || a.act.id !== 'flee') think(a);
      }
      // the visitor: everyone glances at a nearby cursor; the hen does more than glance
      var near = cursor.on && dist(cursor.x, cursor.z, a.x, a.z) < 1.4;
      a.look = near ? { x: cursor.x, z: cursor.z } : null;
      if (a.name === 'hen' && cursor.on && cursor.moved > 0.4 && dist(cursor.x, cursor.z, a.x, a.z) < 0.7 && (!a.act || a.act.id !== 'flee') && !a.engagedBy) fleeFrom(a, cursor.x, cursor.z);
    });
    cursor.moved *= Math.pow(0.1, dt);
  }

  // ---- THE PASSING -------------------------------------------------------------------
  function passingStart() {
    world.passing = { t: 0, dur: 10 };
    world.nextPassing = nowS() + rr(55, 95);
    ticker.textContent = '🌀 Something passes under the street. The drain glows gold.';
    var D = byName.dill, H = byName.hood, C = byName.crumb, G = byName.gravy, N = byName.hen;
    function react(a, act) { if (a.engagedBy) release(a); if (a.act && a.act.end) a.act.end(a); a.act = null; setAct(a, act); }
    react(D, { id: 'rush', busy: true, emoji: '🌀', label: function () { return 'racing to the drain, notebook out'; },
      begin: function (a) { bubble(a, '🌀', pick(['THERE.', 'Write it down. Twice.', '3:04... no. Now.']), 3); a.plan = goThenDo(a, ST.drainSpot.x + 0.1, ST.drainSpot.z, 1.9, function (a2, dt, t) { face(a2, ST.grate.x, ST.grate.z); a2.stoop = 1; a2.writing = 1; return t > 7; }); },
      tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.stoop = 0; a.writing = 0; } });
    if (H.hidden) { H.x = ST.alley.x + 0.6; H.z = ST.alley.z; H.hidden = false; H.root.visible = true; H.offstage = false; }
    react(H, { id: 'nod', busy: true, emoji: '', label: function () { return 'nodding at the drain like he called it'; },
      begin: function (a) { a.plan = goThenDo(a, ST.drainSpot.x - 0.9, ST.drainSpot.z - 0.3, 0.9, function (a2, dt, t) { face(a2, ST.grate.x, ST.grate.z); a2.nod = t; if (t > 1.2 && !a2.told) { a2.told = true; say(a2, pick(['Told you.', 'Rumor eight.', 'It likes the pipes.']), 2.8); } return t > 7; }); a.told = false; },
      tick: function (a, dt) { return a.plan(a, dt); }, end: function (a) { a.nod = 0; } });
    react(C, { id: 'glance', busy: true, emoji: '', label: function () { return 'pretending he didn\'t hear that'; },
      begin: function (a) { say(a, pick(['...I heard nothing.', 'Not my door. Not my problem.']), 3); },
      tick: function (a, dt) { stand(a, dt); face(a, ST.grate.x, ST.grate.z); return a.actT > 6; } });
    react(G, { id: 'sigh', busy: true, emoji: '', label: function () { return 'sighing at the drain'; },
      begin: function (a) { setTimeout(function () { say(a, '...again with the drain.', 3); }, 1500); },
      tick: function (a, dt) { a.talk = 0.3; return a.actT > 6; } });
    fleeFrom(N, ST.grate.x, ST.grate.z);
  }
  function tickPassing(dt) {
    var P = world.passing, k = 0;
    if (P) {
      P.t += dt;
      k = P.t < 1.5 ? P.t / 1.5 : P.t > P.dur - 2 ? Math.max(0, (P.dur - P.t) / 2) : 1;
      k *= 0.85 + 0.15 * Math.sin(P.t * 9) * Math.sin(P.t * 2.3);
      if (P.t >= P.dur) { world.passing = null; ticker.textContent = '…it went back under. Case open.'; }
    } else if (nowS() > world.nextPassing && !RG.debug.noPassing) passingStart();
    world.drainLight.intensity = k * 18;
    world.drainGlow.material.opacity = k * 0.95;
    world.under.material.color.setRGB(3.2 * k, 2.0 * k, 0.4 * k);
    world.passingK = k;
  }

  // ---- animation: brains → bodies -----------------------------------------------------
  function animate(a, dt, t) {
    var P = a.parts, r = a.root, moving = clamp(a.speed / (a.maxSpeed * 0.6), 0, 1);
    a.moving += (moving - a.moving) * Math.min(1, dt * 8);
    a.walkPh += a.speed * dt * (a.name === 'hen' ? 22 : a.name === 'crumb' ? 9 : 11);
    var w = a.moving, ph = a.walkPh;
    // yaw toward intent, smoothly
    if (a.yawWant != null) a.yaw += angDiff(a.yaw, a.yawWant) * Math.min(1, dt * 5);
    r.position.set(a.x, a.y, a.z);
    r.rotation.set(0, a.yaw, 0);
    var breath = Math.sin(t * 1.7 + a.x) * 0.012;
    // head-tracking: a glance at the cursor, clamped to what the neck allows
    var lookYaw = 0;
    if (a.look) lookYaw = clamp(angDiff(a.yaw, Math.atan2(a.look.x - a.x, a.look.z - a.z)), -1.1, 1.1);
    a.headYaw += (lookYaw - a.headYaw) * Math.min(1, dt * 4);
    a.talk = Math.max(0, (a.speaking ? 1 : 0) * 0.8, a.talk - dt * 0.8);

    if (a.name === 'crumb') {
      var b = P.body, sl = a.sleep ? 1 : 0;
      b.position.y = b.userData.rest.y + Math.abs(Math.sin(ph)) * 0.035 * w;
      b.rotation.set(sl * 0.08 + w * 0.04, a.headYaw * 0.35, Math.sin(ph) * 0.06 * w);
      b.scale.set(1 - breath * 0.6, 1 + breath - sl * 0.02, 1 - breath * 0.6);
      ['L', 'R'].forEach(function (s, i) {
        var f = P['foot' + s], sg = i ? 1 : -1, step = Math.sin(ph + i * Math.PI);
        f.position.set(f.userData.rest.x, f.userData.rest.y + Math.max(0, step) * 0.06 * w, f.userData.rest.z + step * 0.09 * w);
        var arm = P['arm' + s];
        arm.position.set(arm.userData.rest.x, arm.userData.rest.y + (b.position.y - b.userData.rest.y), arm.userData.rest.z);
        arm.rotation.set(-a.gesture * 0.9, b.rotation.y, sg * a.gesture * 0.7 + b.rotation.z);
      });
      a.gesture = Math.max(0, a.gesture - dt * 1.2);
    } else if (a.name === 'dill') {
      var hop = Math.abs(Math.sin(ph)) * w;
      P.body.position.y = P.body.userData.rest.y + hop * 0.05;
      P.body.rotation.set((a.stoop || 0) * 0.32 + w * 0.06, a.headYaw * 0.3, Math.sin(ph) * 0.09 * w);
      P.body.scale.set(1 + breath * 0.5, 1 - breath + hop * 0.03, 1 + breath * 0.5);
      // hat rides the body (same transform) plus its own tip/bob
      P.hat.position.copy(P.hat.userData.rest).applyEuler(P.body.rotation);
      P.hat.position.y += P.body.position.y;
      P.hat.rotation.set(P.body.rotation.x - (a.tip || 0) * 0.35 + hop * 0.04, P.body.rotation.y, P.body.rotation.z);
      a.tip = Math.max(0, (a.tip || 0) - dt * 1.5);
      var wr = a.writing ? 1 : 0;
      a.writeK = lerp(a.writeK || 0, wr, Math.min(1, dt * 5));
      P.arm.position.copy(P.arm.userData.rest).applyEuler(P.body.rotation); P.arm.position.y += P.body.position.y;
      P.arm.rotation.set(P.body.rotation.x - a.writeK * 0.55 + Math.sin(t * 13) * 0.04 * a.writeK, P.body.rotation.y, P.body.rotation.z);
    } else if (a.name === 'hood') {
      P.body.rotation.set(0, 0, Math.sin(t * 0.9) * 0.015 + Math.sin(ph) * 0.03 * w);
      P.body.position.y = P.body.userData.rest.y + Math.sin(ph * 2) * 0.008 * w;
      var lean = a.lean || 0, nod = a.nod ? Math.max(0, Math.sin(a.nod * 2.4)) * 0.25 : 0;
      P.head.rotation.set(lean * 0.3 + nod + breath * 2, a.headYaw * 0.9, Math.sin(t * 0.7) * 0.03);
    } else if (a.name === 'gravy') {
      var lid = P.lid, open = a.talk * (0.18 + 0.12 * Math.abs(Math.sin(t * 9))) + (a.sleep ? 0 : 0.03);
      lid.rotation.set(0, 0, open);
      P.body.scale.set(1, 1 + breath * 0.5, 1);
    } else if (a.name === 'hen') {
      var bob = Math.sin(ph) * w, peck = a.peck ? Math.max(0, Math.sin(t * 7)) : 0;
      P.body.rotation.set(peck * 0.15 + (a.flap ? 0.2 : 0), 0, Math.sin(ph) * 0.1 * w);
      P.body.position.y = P.body.userData.rest.y + Math.abs(bob) * 0.025 + (a.flap ? Math.abs(Math.sin(t * 30)) * 0.04 : 0);
      P.head.position.set(P.head.userData.rest.x, P.head.userData.rest.y + Math.abs(bob) * 0.02, P.head.userData.rest.z + Math.cos(ph) * 0.035 * w);
      P.head.rotation.set(peck * 1.05 + (a.sleep ? 0.5 : 0), a.headYaw + Math.sin(t * 1.3 + 2) * 0.25 * (1 - w), 0);
    }
    if (a.name === 'gravy') { r.position.y = ST.bench.seat; }
  }

  // ---- bubbles: the brain, spoken ------------------------------------------------------
  function bubble(a, emoji, text, secs) {
    if (a.bubble && a.bubble.el) a.bubble.el.remove();
    var el = doc.createElement('div');
    el.className = 'rg-bubble rg-' + a.name + (text ? '' : ' rg-emoji-only');
    el.innerHTML = (emoji ? '<span class="rg-b-emo">' + emoji + '</span>' : '') + (text ? '<span class="rg-b-txt"></span>' : '');
    if (text) el.querySelector('.rg-b-txt').textContent = text;
    bubbleBox.appendChild(el);
    a.bubble = { el: el, until: nowS() + (secs || 2.5) };
    requestAnimationFrame(function () { el.classList.add('on'); });
  }
  function say(a, text, secs) { bubble(a, '', text, secs); a.talk = 1; }
  var V3;
  function tickBubbles() {
    var t = nowS(), w = canvas.clientWidth, h = canvas.clientHeight;
    agents.forEach(function (a) {
      var b = a.bubble; if (!b) return;
      if (t > b.until || a.hidden) {
        b.el.classList.remove('on'); var el = b.el; setTimeout(function () { el.remove(); }, 260); a.bubble = null; return;
      }
      V3.set(a.x, a.root.position.y + a.h + 0.18, a.z).project(cam);
      b.el.style.transform = 'translate(-50%, -100%) translate(' + ((V3.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-V3.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
    });
  }

  var blotterT = 0, lastLabels = {};
  function tickBlotter(dt) {
    blotterT -= dt; if (blotterT > 0) return; blotterT = 0.4;
    var html = '';
    agents.forEach(function (a) {
      var lab = a.hidden ? 'somewhere in the dark' : (a.label || '…');
      html += '<li class="rg-bl-' + a.name + '"><span class="rg-bl-i">' + ICON[a.name] + '</span><span class="rg-bl-n">' + NAMES[a.name] + '</span><span class="rg-bl-s">' + lab + '</span></li>';
      if (lastLabels[a.name] && lastLabels[a.name] !== lab && !world.passing) ticker.textContent = NAMES[a.name] + ' is ' + lab + '.';
      lastLabels[a.name] = lab;
    });
    blotter.innerHTML = html;
  }

  // ---- input -----------------------------------------------------------------------------
  function onMove(e) {
    var r = canvas.getBoundingClientRect();
    mouseNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    camDrift.x = mouseNdc.x; camDrift.y = mouseNdc.y;
    ray.setFromCamera(mouseNdc, cam);
    var hit = new T.Vector3();
    if (ray.ray.intersectPlane(groundPlane, hit)) {
      var mv = Math.hypot(hit.x - cursor.x, hit.z - cursor.z);
      cursor.x = hit.x; cursor.z = hit.z; cursor.on = hit.z < ST.kerbZ + 0.4 && hit.z > ST.wallZ; cursor.moved += mv;
    }
  }
  function onLeave() { cursor.on = false; camDrift.x = camDrift.y = 0; }
  function onClick(e) {
    onMove(e);
    var hits = ray.intersectObjects(agents.map(function (a) { return a.root; }), true);
    if (!hits.length) return;
    var o = hits[0].object, a = null;
    while (o && !a) { a = agents.find(function (x) { return x.root === o; }) || null; o = o.parent; }
    if (!a || a.hidden) return;
    // they turn to you, say their piece, and get back to it
    if (a.name === 'hen' && a.y < 0.05) { fleeFrom(a, cursor.x, cursor.z); return; }
    if (a.engagedBy) { say(a, pick(['One sec.', '...busy.']), 1.8); return; }
    var cx = cam.position.x, cz = cam.position.z;
    setAct(a, { id: 'address', busy: true, emoji: '', label: function () { return 'talking to you'; },
      begin: function (b) { say(b, lineFor(b.name), 4.2); if (b.name === 'dill') b.tip = 1; },
      tick: function (b, dt) { stand(b, dt); if (b.name !== 'gravy') face(b, cx, cz); return b.actT > 4.4; } });
    hint.classList.add('rg-used');
  }
  function onKey(e) { if (e.key === 'Escape' && RG.active) { e.stopPropagation(); RG.close(); } }

  // ---- loop -----------------------------------------------------------------------------
  function frame() {
    raf = 0;
    if (!RG.active) return;
    if (doc.hidden) { raf = requestAnimationFrame(frame); lastT = 0; return; }
    var t = nowS(), dt = lastT ? Math.min(0.05, t - lastT) : 0.016; lastT = t;
    tickPassing(dt);
    tickBrains(dt);
    agents.forEach(function (a) { animate(a, dt, t); });
    if (!reduced()) tickRain(dt);
    // camera: a slow breath plus a little parallax toward the cursor
    var base = world.camBase, rm = reduced() ? 0 : 1, fx = 0;
    if (world.portrait) { // follow the centre of whoever is on stage
      var sx = 0, n = 0; agents.forEach(function (a) { if (!a.hidden) { sx += a.x; n++; } });
      world.followX += (clamp(n ? sx / n : 0, -1.7, 1.5) - world.followX) * Math.min(1, dt * 0.6);
      fx = world.followX;
    }
    cam.position.set(base.x + fx + camDrift.x * 0.35 * rm + Math.sin(t * 0.13) * 0.12 * rm, base.y + camDrift.y * 0.18 * rm, base.z);
    cam.lookAt(world.camLook.x + fx, world.camLook.y, world.camLook.z);
    // the neon buzzes now and then
    var buzz = (Math.sin(t * 31) > 0.97 && Math.sin(t * 0.7) > 0.6) ? 0.35 : 1;
    world.neon.material.color.setScalar(1.6 * buzz); world.neonLight.intensity = 4 * buzz;
    R.render(scene, cam);
    tickBubbles();
    tickBlotter(dt);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (!R) return;
    var w = layer.clientWidth, h = layer.clientHeight;
    R.setSize(w, h, false);
    cam.aspect = w / h;
    // fit the 7m pavement: pull back on narrow screens
    // Landscape fits the whole 7m pavement. Portrait CAN'T without standing
    // 20m back in the fog (the first phone shot was a black frame), so it frames
    // ~4m and follows the action instead.
    world.portrait = cam.aspect < 0.95;
    if (world.portrait) {
      cam.fov = 48;
      var half = Math.tan(cam.fov * Math.PI / 360) * cam.aspect;
      var dP = clamp(2.3 / half, 6.5, 11.5);
      world.camBase = new T.Vector3(0, 1.2 + dP * 0.2, 0.4 + dP);
      world.camLook = new T.Vector3(0, 0.75, -0.3);
      scene.fog.density = 0.042;
    } else {
      cam.fov = 30;
      var dist0 = Math.max(8.6, 11.2 / Math.max(0.55, cam.aspect));
      world.camBase = new T.Vector3(0.0, 1.35 + dist0 * 0.22, 0.4 + dist0);
      world.camLook = new T.Vector3(-0.05, 1.05, -0.3);
      scene.fog.density = 0.075;
    }
    world.followX = world.followX || 0;
    cam.updateProjectionMatrix();
  }

  function build() {
    T = global.THREE; hand = handheld();
    rngState = (RG.debug.seed != null ? RG.debug.seed : Date.now()) >>> 0;
    R = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    // desktop supersamples to 1.5x even on a 1x panel: procedural breading and
    // pickle warts shimmer at one sample per pixel
    R.setPixelRatio(hand ? Math.min(global.devicePixelRatio || 1, 1.5) : clamp(global.devicePixelRatio || 1, 1.5, 2));
    R.outputEncoding = T.sRGBEncoding;
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 0.95;
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFShadowMap; // radius works here; PCFSoft ignores it and stair-steps
    scene = new T.Scene();
    scene.background = srgb(T, '#070b14');
    scene.fog = new T.FogExp2(srgb(T, '#0a0f1d'), 0.075);
    cam = new T.PerspectiveCamera(30, 1, 0.1, 60);
    makeMats(T);
    scene.environment = buildEnv();
    buildSet(); buildLights(); buildRain();
    ray = new T.Raycaster(); mouseNdc = new T.Vector2(); groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0); V3 = new T.Vector3();

    makeAgent('crumb', ST.post.x, ST.post.z, 0.1, { speed: 0.55, radius: 0.36, h: 1.0 });
    makeAgent('dill', 0.9, 0.35, -0.6, { speed: 0.75, radius: 0.24, h: 1.14 });
    makeAgent('hood', ST.lurk[0].x, ST.lurk[0].z, 0.5, { speed: 0.6, radius: 0.28, h: 1.1 });
    makeAgent('gravy', ST.gravySeat.x, ST.gravySeat.z, 0.25, { speed: 0, radius: 0.22, h: 0.68 });
    makeAgent('hen', -0.9, 0.7, 0.8, { speed: 0.7, radius: 0.18, h: 0.78 });
    agents.forEach(function (a) { a.acts = ACTS(a.name); a.yawWant = a.yaw; });
    world.nextPassing = nowS() + rr(18, 26); // the first one comes early: it's the show

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);
    global.addEventListener('resize', resize);
    resize();
    RG.ready = true;
  }

  // ---- open / close ---------------------------------------------------------------------
  function loadDeps(cb) {
    var inj = global.HallBoot && HallBoot.inject;
    var need = [];
    if (!global.THREE) need.push('vendor/three.min.js');
    if (!global.RegularsCast) need.push('regularsCast.js');
    (function next() {
      if (!need.length) return cb(true);
      inj(need.shift(), function (ok) { if (!ok) return cb(false); next(); });
    }());
  }

  RG.open = function () {
    if (RG.active) return;
    if (!layer) buildDom();
    RG.active = true;
    layer.classList.add('on');
    doc.documentElement.classList.add('rg-open');
    global.addEventListener('keydown', onKey, true);
    if (RG.ready) { lastT = 0; resize(); if (!raf) raf = requestAnimationFrame(frame); return; }
    if (RG.loading) return;
    RG.loading = true;
    loadDeps(function (ok) {
      RG.loading = false;
      if (!ok) { loadingEl.innerHTML = '<div>the street didn\'t load. try again in a minute.</div>'; return; }
      try { build(); } catch (e) { loadingEl.innerHTML = '<div>the street didn\'t load (' + (e && e.message) + ').</div>'; try { console.warn('regulars:', e); } catch (_) { } return; }
      loadingEl.classList.add('gone');
      if (RG.active && !raf) raf = requestAnimationFrame(frame);
    });
  };
  RG.close = function () {
    if (!RG.active) return;
    RG.active = false;
    layer.classList.remove('on');
    doc.documentElement.classList.remove('rg-open');
    global.removeEventListener('keydown', onKey, true);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try { if (global.NugHero && NugHero.render) setTimeout(function () { NugHero.setCount(NugHero.count, NugHero.dollars); }, 50); } catch (e) { }
  };
  RG.state = function () {
    return {
      ready: RG.ready, active: RG.active, passing: !!world.passing,
      agents: agents.map(function (a) { return { name: a.name, act: a.act && a.act.id, label: a.label, x: +a.x.toFixed(2), z: +a.z.toFixed(2), hidden: a.hidden, needs: a.needs }; }),
    };
  };
  RG.debug.passing = function () { if (RG.ready) passingStart(); };
  RG.debug.step = function (secs, fps) { // advance the sim deterministically (tests)
    fps = fps || 30; var n = Math.round(secs * fps), t0 = RG.debug.clock != null ? RG.debug.clock : nowS();
    for (var i = 0; i < n; i++) { RG.debug.clock = t0 + (i + 1) / fps; lastT = t0 + i / fps; var t = RG.debug.clock, dt = 1 / fps; tickPassing(dt); tickBrains(dt); agents.forEach(function (a) { animate(a, dt, t); }); }
    if (R) { R.render(scene, cam); tickBubbles(); blotterT = 0; tickBlotter(0); }
  };

  // the converter's door into it: warm the payload on intent, open on click
  function wire() {
    var btn = doc.getElementById('openRegulars');
    if (!btn) return;
    ['pointerenter', 'touchstart', 'focus'].forEach(function (ev) {
      btn.addEventListener(ev, function () { if (!global.THREE || !global.RegularsCast) loadDeps(function () { }); }, { once: true, passive: true });
    });
    btn.addEventListener('click', function () { btn.blur(); RG.open(); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', wire); else wire();

  global.RegularsLayer = RG;
}(typeof window !== 'undefined' ? window : this));
