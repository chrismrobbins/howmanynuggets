/* js/nugHero.js — 🍗 THE HERO NUGGET.
 *
 * The converter's 56px nugget.png, made of nugget. A live three.js stage in the
 * result panel that listens to the number you type:
 *
 *   • alone, it breathes and turns a little on its plate
 *   • every keystroke, it hops
 *   • the count builds a PILE behind it — one nugget per nugget up to a box of
 *     sixteen, then logarithmic, so a six-piece reads as six and a thousand
 *     still fits on the plate
 *   • at storm money (a million nuggets and up) the pile lifts off and turns into
 *     THE STORM around it — golden at the edges, per docs/casefile.md fact 4 —
 *     and past the "not for you" line it gets mean about it
 *
 * The four shapes are McDonald's real four — BELL, BALL, BOOT and BONE — and the
 * geometry is GENERATED here by the same code that built them in the Spline file
 * (blender/../spline: "HowManyNugs — nuggets & regulars"), so the site ships zero
 * bytes of mesh and every nugget in a pile can wear its own lumps. The breading
 * is not a texture: it is cellular grain + fbm in OBJECT space in the fragment
 * shader (see NH_GLSL), faded out per octave by the pixel footprint so a small
 * canvas never shimmers.
 *
 * 🚪 THE DOORMAN'S RULES (AGENTS.md → THE DOORMAN): the landing page decodes 0MB
 * on a phone and this must not change that. So: nothing loads until the page has
 * loaded AND gone idle; three.js (600KB parse, ~0 decoded pixels) is injected,
 * never in index.html; handhelds get a smaller pile, DPR 1.5 and a 512 shadow;
 * the loop sleeps whenever the canvas is offscreen, the tab is hidden, or the
 * arcade/storm owns the screen. Anything that fails leaves nugget.png exactly
 * where it was — the PNG is the poster and the fallback, never removed.
 *
 *   NugHero.setCount(nuggets, dollars)   app.js update()
 *   NugHero.poke()                       app.js formatAmount() — the hop
 *   NugHero.state()                      for tests
 *   NugHero.debug = { clock, freeze }    pin the clock for screenshots
 *
 * Off switches: localStorage.nugHero3d = '0', no WebGL2, prefers-reduced-data.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var HERO = {
    ready: false, failed: false, count: 0, dollars: 0,
    debug: { clock: null },
  };

  // ---- the four shapes ------------------------------------------------------------
  // Outlines in nugget units (≈1 wide), lying flat in XZ, thickness on Y. Same
  // control points as the Spline build; keep the two in step.
  var NH_SHAPES = {
    bell: { size: 1.00, thick: 0.215, pts: [[-0.55,-0.42],[0,-0.5],[0.55,-0.42],[0.52,-0.08],[0.33,0.2],[0.24,0.44],[0,0.56],[-0.24,0.44],[-0.33,0.2],[-0.52,-0.08]] },
    ball: { size: 1.00, thick: 0.235, pts: [[0,-0.5],[0.36,-0.4],[0.5,-0.05],[0.44,0.3],[0.15,0.5],[-0.2,0.48],[-0.46,0.25],[-0.5,-0.1],[-0.34,-0.42]] },
    boot: { size: 1.00, thick: 0.205, ctr: [-0.17, -0.22], pts: [[-0.42,0.58],[-0.05,0.6],[0.08,0.32],[0.1,0.02],[0.42,-0.02],[0.62,-0.18],[0.56,-0.42],[0.2,-0.5],[-0.25,-0.5],[-0.46,-0.3],[-0.48,0.15]] },
    bone: { size: 0.92, thick: 0.200, pts: [[-0.62,0.38],[-0.38,0.3],[-0.12,0.17],[0.12,0.17],[0.38,0.3],[0.62,0.38],[0.7,0.02],[0.62,-0.36],[0.38,-0.3],[0.12,-0.17],[-0.12,-0.17],[-0.38,-0.3],[-0.62,-0.36],[-0.7,-0.02]] },
  };
  var NH_ORDER = ['bell', 'ball', 'boot', 'bone'];

  function nhHash(x, y, z) {
    var h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function nhNoise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var sm = function (t) { return t * t * (3 - 2 * t); };
    var xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi), r = 0;
    for (var dx = 0; dx < 2; dx++) for (var dy = 0; dy < 2; dy++) for (var dz = 0; dz < 2; dz++) {
      r += (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf) * nhHash(xi + dx, yi + dy, zi + dz);
    }
    return r * 2 - 1;
  }
  function nhCat(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  // A breaded pillow: the outline is swept over a squashed sphere — rims full
  // (cos^0.5), faces flat-ish (sin^0.85), the underside flatter than the top
  // because it sat in the fryer basket — then lumped by two octaves of noise.
  // `res` 1 = hero quality, 0.5 = pile quality (a quarter of the triangles).
  function nhNugGeo(THREE, shape, seed, res) {
    var S = NH_SHAPES[shape], N = Math.round(112 * res), M = Math.round(36 * res);
    var pts = S.pts, k = pts.length, ol = [];
    // Outlines are typed by hand and two of the four ran clockwise — which turned
    // the boot and the bone inside out (a hole in the top, curled shells in the
    // pile). Normalise by signed area instead of trusting the typist.
    var area = 0;
    for (var w = 0; w < k; w++) { var q0 = pts[w], q1 = pts[(w + 1) % k]; area += q0[0] * q1[1] - q1[0] * q0[1]; }
    if (area < 0) pts = pts.slice().reverse();
    // The sweep shrinks the outline toward a centre, which only stays clean if
    // that centre can SEE every point of the outline. The boot's origin sits in
    // the inner corner of its L, so it shrinks about a point in the heel.
    var cx = S.ctr ? S.ctr[0] : 0, cz = S.ctr ? S.ctr[1] : 0;
    pts = pts.map(function (q) { return [q[0] - cx, q[1] - cz]; });
    for (var j = 0; j < N; j++) {
      var u = (j / N) * k, i0 = Math.floor(u), t = u - i0;
      var a = pts[(i0 - 1 + k) % k], b = pts[i0 % k], c = pts[(i0 + 1) % k], d = pts[(i0 + 2) % k];
      ol.push([nhCat(a[0], b[0], c[0], d[0], t), nhCat(a[1], b[1], c[1], d[1], t)]);
    }
    var pos = new Float32Array((M + 1) * N * 3), idx = [], p = 0;
    var size = S.size, thick = S.thick;
    for (var i = 0; i <= M; i++) {
      var ang = -Math.PI / 2 + Math.PI * i / M, ca = Math.cos(ang), sa = Math.sin(ang);
      var rho = Math.pow(Math.max(ca, 0), 0.5);
      var hgt = (sa >= 0 ? 1.0 : 0.72) * thick * (sa < 0 ? -1 : 1) * Math.pow(Math.abs(sa), 0.85);
      for (j = 0; j < N; j++) {
        var x = ol[j][0] * size * rho, z = ol[j][1] * size * rho, y = hgt;
        var n1 = nhNoise(x / 0.26 + seed, y / 0.26, z / 0.26 - seed);
        var n2 = nhNoise(x / 0.09 - seed, y / 0.09 + 3, z / 0.09 + seed);
        var n3 = nhNoise(x / 0.045 + 9, y / 0.045 - seed, z / 0.045);
        var kk = 1 + 0.07 * n1 + 0.035 * n2 + 0.012 * n3;
        x *= kk; z *= kk; y = y * (1 + 0.10 * n1) + (0.026 * n2 + 0.010 * n3) * rho;
        pos[p++] = x + cx * size; pos[p++] = y + thick * 0.72; pos[p++] = z + cz * size;
      }
    }
    for (i = 0; i < M; i++) for (j = 0; j < N; j++) {
      var A = i * N + j, B = i * N + (j + 1) % N, C = (i + 1) * N + j, D = (i + 1) * N + (j + 1) % N;
      idx.push(A, C, B, B, C, D); // outward — verified by winding test, not by eye
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // The poles are N coincident vertices each averaging only its own two
    // triangles — a faint asterisk on top of every nugget. They point straight
    // up and straight down; say so.
    var nrm = g.attributes.normal;
    for (j = 0; j < N; j++) { nrm.setXYZ(j, 0, -1, 0); nrm.setXYZ(M * N + j, 0, 1, 0); }
    g.computeBoundingSphere();
    return g;
  }

  // ---- the breading ---------------------------------------------------------------
  var NH_GLSL = [
    'varying vec3 vNhObj;',
    'varying vec3 vNhObjN;',
    'uniform float uNhStorm;',
    'uniform float uNhTime;',
    'float nhH(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float nhN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(nhH(i), nhH(i + vec3(1,0,0)), f.x), mix(nhH(i + vec3(0,1,0)), nhH(i + vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(nhH(i + vec3(0,0,1)), nhH(i + vec3(1,0,1)), f.x), mix(nhH(i + vec3(0,1,1)), nhH(i + vec3(1,1,1)), f.x), f.y), f.z); }',
    'float nhFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * nhN(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }',
    // F1 cellular: a crumb is a grain, and value noise has no grains in it.
    // 2x2x2 search (8 cells, not 27): ANGLE's D3D compiler unrolls every loop,
    // and the 27-cell version cost seconds of frozen tab per program. Jitter is
    // kept to [0.15, 0.85] so the nearest point is always in the 8 searched.
    'float nhCell(vec3 x){ vec3 i = floor(x - 0.5); float d = 8.0;',
    '  for (int a = 0; a <= 1; a++) for (int b = 0; b <= 1; b++) for (int c = 0; c <= 1; c++){',
    '    vec3 o = i + vec3(float(a), float(b), float(c)); vec3 r = o + 0.15 + 0.7 * vec3(nhH(o), nhH(o + 31.0), nhH(o + 57.0)) - x;',
    '    d = min(d, dot(r, r)); }',
    '  return sqrt(d); }',
    // Height of the crust, with each octave faded by the pixel footprint `w` —
    // a 2px grain is not detail, it is shimmer.
    // Breading is RAISED crumbs, not dimples: domain-warp the space so no two
    // grains line up, then peak the cellular field (1-F1)^k so each cell is a
    // lump with a crevice around it. Each octave fades with the pixel footprint.
    'float nhCrumbs;',
    'float nhCrust(vec3 p, float w){',
    '  vec3 q = p + 0.07 * vec3(nhFbm(p * 6.0), nhFbm(p * 6.0 + 5.2), nhFbm(p * 6.0 + 9.7));',
    '  float g1 = smoothstep(0.55, 0.12, w * 26.0), g2 = smoothstep(0.55, 0.12, w * 60.0);',
    // skip the cellular work outright once an octave has faded: a monster's
    // plates are ~20px each and were paying full price to multiply it by zero
    '  float c1 = g1 > 0.002 ? pow(max(0.0, 1.0 - nhCell(q * 26.0)), 2.4) : 0.0;',
    '  float c2 = g2 > 0.002 ? pow(max(0.0, 1.0 - nhCell(q * 60.0 + 7.0)), 2.0) : 0.0;',
    '  nhCrumbs = g1 * c1;',
    '  return 0.38 * nhFbm(p * 8.0) + 0.62 * g1 * c1 + 0.26 * g2 * c2; }',
    'vec3 nhBump(vec3 surf_pos, vec3 surf_norm, float h, float faceDir){',
    '  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);',
    '  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);',
    '  float det = dot(sx, r1) * faceDir;',
    '  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);',
    '  return normalize(abs(det) * surf_norm - grad); }',
  ].join('\n');

  function nhSrgb(THREE, hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  function nhMaterial(THREE, shared) {
    var m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.62, metalness: 0,
      sheen: 0.28, sheenRoughness: 0.8, sheenColor: nhSrgb(THREE, '#ffc27a'),
      clearcoat: 0.12, clearcoatRoughness: 0.55,
      specularIntensity: 0.55, envMapIntensity: 0.32,
    });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uNhStorm = shared.storm;
      sh.uniforms.uNhTime = shared.time;
      sh.uniforms.uNhPale = { value: nhSrgb(THREE, '#ecc47c') };
      sh.uniforms.uNhGold = { value: nhSrgb(THREE, '#a9773d') };
      sh.uniforms.uNhToast = { value: nhSrgb(THREE, '#6b3410') };
      sh.uniforms.uNhRim = { value: nhSrgb(THREE, '#ffcf5a') };
      sh.vertexShader = 'varying vec3 vNhObj;\nvarying vec3 vNhObjN;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvNhObj = position;\nvNhObjN = normal;');
      sh.fragmentShader = NH_GLSL + '\nuniform vec3 uNhPale;\nuniform vec3 uNhGold;\nuniform vec3 uNhToast;\nuniform vec3 uNhRim;\nfloat nhHt;\nfloat nhW;\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', [
            '#include <color_fragment>',
            'nhW = length(fwidth(vNhObj));',
            'nhHt = nhCrust(vNhObj, nhW);',
            // big pale/gold patches, toasted crumb peaks, darker where the rim fried thin
            // broad toasted patches; pale crumb PEAKS, browner crevices; the
            // thin rim fried darkest; then a grain of speckle so nothing is flat
            'float nhPatch = smoothstep(0.35, 0.80, nhFbm(vNhObj * 3.0 + 11.0));',
            'vec3 nhAlb = mix(uNhGold, uNhToast, nhPatch * 0.38);',
            'nhAlb = mix(nhAlb, uNhPale, smoothstep(0.15, 0.95, nhCrumbs) * 0.34);',
            'nhAlb = mix(nhAlb, uNhToast, (1.0 - smoothstep(0.15, 0.45, nhHt)) * 0.30);',
            'float nhEdge = 1.0 - abs(normalize(vNhObjN).y);',
            'nhAlb = mix(nhAlb, uNhToast, nhEdge * nhEdge * 0.30);',
            'nhAlb *= 1.0 + (0.30 * nhN(vNhObj * 75.0) - 0.15) * smoothstep(0.5, 0.15, nhW * 75.0);',
            'diffuseColor.rgb *= nhAlb;',
          ].join('\n'))
          .replace('#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.42 + nhCrumbs * 0.4 + nhHt * 0.1, 0.32, 0.92);')
          .replace('#include <normal_fragment_maps>',
            '#include <normal_fragment_maps>\nnormal = nhBump(-vViewPosition, normal, nhHt * 0.022, faceDirection);')
          .replace('#include <emissivemap_fragment>', [
            '#include <emissivemap_fragment>',
            // THE STORM: golden at the edges. Literally — a fresnel rim.
            'float nhFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);',
            'totalEmissiveRadiance += uNhRim * nhFr * uNhStorm * (1.6 + 0.6 * sin(uNhTime * 3.0 + vNhObj.x * 9.0));',
          ].join('\n'));
    };
    m.customProgramCacheKey = function () { return 'nh-breading-1'; };
    return m;
  }

  // ---- gates ----------------------------------------------------------------------
  function nhAllowed() {
    try { if (global.localStorage && localStorage.getItem('nugHero3d') === '0') return false; } catch (e) { }
    try {
      var c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
    } catch (e) { }
    try {
      var cv = doc.createElement('canvas');
      if (!cv.getContext('webgl2')) return false;
    } catch (e) { return false; }
    return true;
  }
  function nhReduced() {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function nhHandheld() {
    try { return !!(global.HallBoot && HallBoot.handheld()); } catch (e) { return false; }
  }
  // The stage sleeps whenever somebody else owns the screen.
  function nhBusy() {
    try {
      if (doc.hidden) return true;
      if (typeof NuggetArcade !== 'undefined' && NuggetArcade.active) return true;
      if (typeof storm !== 'undefined' && storm.running) return true;
      if (global.RegularsLayer && RegularsLayer.active) return true;
    } catch (e) { }
    return false;
  }

  // ---- the stage ------------------------------------------------------------------
  var T, R, scene, cam, canvas, wrap, img, heroMesh, glow, pile = [], slots = [], shared;
  var CAP = 72, STORM_CAP = 80, visible = true, raf = 0, last = 0, clock = 0;
  var hop = { y: 0, v: 0, squash: 0, spin: 0 }, stormK = 0, stormWant = 0, stormMean = 0;

  // count → how many nuggets the plate shows besides the hero
  function nhExtras(n) {
    if (n <= 1) return 0;
    if (n >= MON_AT && mon) return mon.plates.length;
    if (n >= 1000000) return STORM_CAP;
    if (n <= 16) return n - 1;
    return Math.min(CAP, Math.round(15 + 14 * Math.log10(n / 16)));
  }

  function nhRng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Pile slots: a mound that grows BEHIND and beside the hero (the camera looks
  // from +z), early slots low and wide, later ones higher and tighter, so a
  // small count is a scatter and a big one is a heap.
  function nhSlots(n) {
    var r = nhRng(91), out = [];
    for (var k = 0; k < n; k++) {
      var layer = Math.floor(k / 14);
      var a = Math.PI * (0.92 + 1.16 * r());              // mostly the back half
      if (k < 6) a = Math.PI * (0.90 + 1.20 * (k / 5)) + (r() - 0.5) * 0.12; // a six-piece fans round behind
      var rad = k < 6 ? 1.0 + r() * 0.18 : Math.max(0.6, 1.05 + r() * 0.85 - layer * 0.15);
      var x = Math.cos(a) * rad * 1.15, z = Math.sin(a) * rad * 0.85 - 0.15;
      var y = layer * 0.13 + r() * 0.05;
      out.push({
        x: x, y: y, z: z,
        rx: (r() - 0.5) * 0.7, ry: r() * Math.PI * 2, rz: (r() - 0.5) * 0.7,
        s: 0.78 + r() * 0.2,
        // the storm orbit this nugget joins when the money gets silly
        orbR: 0, orbY: 0.05 + Math.pow(r(), 0.8) * 2.3, orbA: r() * Math.PI * 2,
        orbW: 0.0, spinA: r() * 6.28, spinW: (r() - 0.5) * 5,
        shape: NH_ORDER[k % 4],
      });
    }
    // THE STORM is a funnel, not a cloud: radius widens with height, the bottom
    // spins fastest, and the hero sits in the eye.
    for (k = 0; k < n; k++) {
      out[k].orbR = 0.5 + out[k].orbY * 0.62 + (r() - 0.5) * 0.22;
      out[k].orbW = 1.6 / Math.sqrt(out[k].orbR);
    }
    return out;
  }

  function nhBuild() {
    T = global.THREE;
    var hand = nhHandheld();
    if (hand) { CAP = 40; STORM_CAP = 48; }

    wrap = doc.querySelector('.result');
    img = wrap && wrap.querySelector('.nugget-hero');
    if (!wrap || !img) throw new Error('no result panel');

    canvas = doc.createElement('canvas');
    canvas.className = 'nug3d';
    canvas.setAttribute('aria-hidden', 'true');
    wrap.insertBefore(canvas, img);

    R = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    R.setPixelRatio(Math.min(global.devicePixelRatio || 1, hand ? 1.5 : 2));
    R.outputEncoding = T.sRGBEncoding;
    R.toneMapping = T.ACESFilmicToneMapping;
    R.toneMappingExposure = 0.92;
    R.shadowMap.enabled = true;
    R.shadowMap.type = T.PCFSoftShadowMap;
    R.setClearColor(0x000000, 0);
    // no synchronous info-log reads: the breading program compiled on the main
    // thread froze the converter for ~1-2s right after load (see AGENTS.md)
    R.debug.checkShaderErrors = false;

    scene = new T.Scene();
    if (T.RoomEnvironment) {
      var pm = new T.PMREMGenerator(R);
      scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }

    cam = new T.PerspectiveCamera(26, 2, 0.1, 50);

    // light: a warm key from the upper left, a cool rim from behind that matches
    // the card's navy, and an amber kick off the "plate" so the underside isn't dead
    scene.add(new T.HemisphereLight(nhSrgb(T, '#b9c8ff'), nhSrgb(T, '#3b2512'), 0.45));
    var key = keyL = new T.DirectionalLight(nhSrgb(T, '#ffe1b5'), 2.3);
    key.position.set(-2.4, 4.2, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.set(hand ? 512 : 1024, hand ? 512 : 1024);
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
    key.shadow.radius = 4; key.shadow.bias = -0.0008; key.shadow.normalBias = 0.01;
    scene.add(key);
    var rim = new T.DirectionalLight(nhSrgb(T, '#a9c1ff'), 1.35);
    rim.position.set(2.6, 2.2, -3.4);
    scene.add(rim);
    var kick = kickL = new T.PointLight(nhSrgb(T, '#ff9a3c'), 0.9, 6, 2);
    kick.position.set(0.2, 0.35, 1.9);
    scene.add(kick);

    // depthWrite off: a shadow catcher is a picture of a floor, and it must not
    // slice the storm's glow off at a hard horizon
    var ground = new T.Mesh(new T.PlaneGeometry(12, 12), new T.ShadowMaterial({ opacity: 0.42, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // the eye of the storm: one additive sprite, golden, only there when it is
    var gc = doc.createElement('canvas'); gc.width = gc.height = 64;
    var gx = gc.getContext('2d'), gg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gg.addColorStop(0, 'rgba(255,200,90,0.85)'); gg.addColorStop(0.3, 'rgba(255,150,40,0.32)'); gg.addColorStop(1, 'rgba(255,120,20,0)');
    gx.fillStyle = gg; gx.fillRect(0, 0, 64, 64);
    glow = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(gc), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
    glow.position.set(0, 1.05, 0.2);
    scene.add(glow);

    shared = { storm: { value: 0 }, time: { value: 0 } };
    var mat = mat0 = nhMaterial(T, shared);

    heroMesh = new T.Mesh(nhNugGeo(T, 'ball', 3.3, 1), mat);
    heroMesh.castShadow = true; heroMesh.receiveShadow = true;
    heroMesh.scale.setScalar(1.12);
    scene.add(heroMesh);

    mon = nhMonBuild(mat);
    slots = nhSlots(Math.max(CAP, STORM_CAP, mon.plates.length));
    var per = Math.ceil(slots.length / 4);
    pile = NH_ORDER.map(function (shape, si) {
      var im = new T.InstancedMesh(nhNugGeo(T, shape, 1.7 + si * 2.9, 0.4), mat, per);
      im.castShadow = true; im.receiveShadow = true;
      im.count = 0;
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      // a little per-nugget colour drift: some came out of the fryer later
      var rr = nhRng(400 + si), col = new T.Color();
      for (var q = 0; q < per; q++) {
        var t = rr();
        col.setRGB(1.0 - t * 0.10, 0.96 - t * 0.16, 0.92 - t * 0.24);
        im.setColorAt(q, col);
        var sk = q * 4 + si; if (slots[sk]) slots[sk].col = col.clone();
      }
      scene.add(im);
      return { mesh: im, items: [] };
    });
    // per-slot live state
    for (var k = 0; k < slots.length; k++) {
      var sl = slots[k];
      sl.on = false; sl.t0 = -1; sl.out = -1;
      sl.bucket = pile[k % 4]; sl.bi = Math.floor(k / 4);
      sl.mb = 0; sl.mt0 = 0; sl.plate = mon.plates[k] || null; sl.M = new T.Matrix4(); sl.d = 0;
    }

    nhResize();
    global.addEventListener('resize', nhResize);
    // the canvas GROWS into place (css: .nug3d height transition) — follow it
    if ('ResizeObserver' in global) new ResizeObserver(function () { nhResize(); nhKick(); }).observe(canvas);
    if ('IntersectionObserver' in global) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting; if (visible) nhKick();
      }).observe(canvas);
    } else visible = true;
    doc.addEventListener('visibilitychange', nhKick);

    // Compile in the GPU's own time; the PNG stays up until it's done.
    R.compile(scene, cam);
    nhWaitPrograms(function () {
      HERO.ready = true;
      nhApplyCount();
      // the tray comes up after the hero, so their compiles never overlap
      setTimeout(function () { if (global.NugTray) NugTray.boot(); }, 400);
      nhKick();
      // crossfade from the poster once the first real frame is on screen
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { wrap.classList.add('has-nug3d'); });
      });
    });
  }

  function nhWaitPrograms(cb) {
    var gl = R.getContext(), ext = gl.getExtension('KHR_parallel_shader_compile'), t0 = performance.now();
    if (!ext) return cb();
    (function poll() {
      var ps = (R.info && R.info.programs) || [], done = 0;
      for (var i = 0; i < ps.length; i++) if (gl.getProgramParameter(ps[i].program, ext.COMPLETION_STATUS_KHR)) done++;
      if (done >= ps.length || performance.now() - t0 > 20000) return cb();
      setTimeout(poll, 50);
    }());
  }

  function nhResize() {
    if (!R) return;
    var w = canvas.clientWidth || 300, h = canvas.clientHeight || 170;
    R.setSize(w, h, false);
    cam.aspect = w / h;
    // Fit the plate, not the hero: the heap and the storm must stay in frame at
    // any aspect, so pull back when the canvas is narrow.
    camBase = Math.max(6.4, 10.5 / cam.aspect);
    nhAim(0);
    cam.updateProjectionMatrix();
  }

  // The storm needs more sky than the plate does: pull back and look up as it rises.
  var camBase = 7;
  function nhAim(k, m, f) {
    m = m || 0; f = f || 0;
    var dist = camBase * (1 + 0.38 * k) * (1 + 0.5 * m) * (1 + 0.32 * f);
    var el = (24 - 10 * k + 2 * m - 1 * f) * Math.PI / 180;
    var sx = shake ? (Math.random() - 0.5) * shake * dist * 0.05 : 0, sy = shake ? (Math.random() - 0.5) * shake * dist * 0.05 : 0;
    cam.position.set(sx, Math.sin(el) * dist + 0.35 + sy, Math.cos(el) * dist);
    cam.lookAt(sx * 0.5, 0.42 + 0.72 * k * (1 - m) + m * 2.9 - f * 0.2, -0.3 + 0.3 * k * (1 - m) - f * 0.8);
  }

  function nhApplyCount() {
    if (!HERO.ready) return;
    var want = nhExtras(HERO.count), now = nhNow();
    for (var k = 0; k < slots.length; k++) {
      var sl = slots[k], should = k < want;
      if (should && !sl.on) { sl.on = true; sl.out = -1; sl.t0 = now + Math.min(k, 40) * 0.028; }
      else if (!should && sl.on) { sl.on = false; sl.out = now; }
    }
    stormWant = HERO.count >= 1000000 ? 1 : 0;
    stormMean = HERO.dollars > 10000000 ? 1 : 0;
    var mw = HERO.count >= MON_AT ? 1 : 0;
    if (mw && !monWant) {
      // the plates rise feet first, head last, over about a second and a half
      for (k = 0; k < slots.length; k++) {
        var pl = slots[k].plate;
        if (pl) slots[k].mt0 = now + 0.35 + (pl.y / 6.8) * 1.5 + Math.random() * 0.15;
      }
    }
    monWant = mw;
    feastWant = HERO.count >= FEAST_AT ? 1 : 0;
    if (feastWant && mon && !mon.city) mon.city = nhCityBuild();
    wrap.classList.toggle('nug-monster', !!monWant);
    nhKick();
  }

  function nhNow() {
    return HERO.debug.clock != null ? HERO.debug.clock : performance.now() / 1000;
  }

  function nhKick() {
    if (!raf && HERO.ready) { last = 0; raf = requestAnimationFrame(nhFrame); }
  }

  // easeOutBounce, damped — a nugget lands, it doesn't sproing
  function nhLand(t) {
    if (t >= 1) return 1;
    var n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return 1 - (1 - (n * t * t + 0.75)) * 0.45; }
    t -= 2.625 / d; return 1 - (1 - (n * t * t + 0.984375)) * 0.25;
  }

  var M4, Q, E, V3, S3, PW, PV, PQ, PS;
  function nhFrame(ts) {
    raf = 0;
    if (!HERO.ready) return;
    if (!visible || nhBusy()) return; // sleeps; nhKick() wakes it
    var now = nhNow();
    var dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now; clock += dt;
    var rm = nhReduced();
    if (!M4) { M4 = new T.Matrix4(); Q = new T.Quaternion(); E = new T.Euler(); V3 = new T.Vector3(); S3 = new T.Vector3(); PW = new T.Matrix4(); PV = new T.Vector3(); PQ = new T.Quaternion(); PS = new T.Vector3(); }

    // the storm fades in/out over about a second
    stormK += (stormWant - stormK) * Math.min(1, dt * 1.6);
    shared.storm.value = stormK * (0.65 + 0.35 * stormMean);
    monK += (monWant - monK) * Math.min(1, dt * 0.9);
    feastK += (feastWant - feastK) * Math.min(1, dt * 0.7);
    if (Math.abs(monK - monWant) < 0.002) monK = monWant;
    var monE = monK * monK * (3 - 2 * monK), feastE = feastK * feastK * (3 - 2 * feastK);
    if (monK > 0.001 || mon.g.visible) nhMonAnimate(now, dt, rm);
    if (mon.city) nhCityTick(now, dt, feastK);
    shake *= Math.pow(0.03, dt); if (shake < 0.002 || rm) shake = 0;
    // a monster needs a much bigger shadow than a plate does
    var big = monK > 0.5;
    var wantDpr = Math.min(global.devicePixelRatio || 1, nhHandheld() ? 1.5 : (monWant ? 1.5 : 2));
    if (R.getPixelRatio() !== wantDpr) { R.setPixelRatio(wantDpr); nhResize(); }
    if (big !== !!keyL.userData.big) {
      keyL.userData.big = big;
      var b = big ? 9 : 3, sc0 = big ? 3.2 : 1;
      keyL.shadow.camera.left = -b; keyL.shadow.camera.right = b; keyL.shadow.camera.top = b + (big ? 3 : 0); keyL.shadow.camera.bottom = -b;
      keyL.shadow.camera.far = big ? 45 : 14; keyL.position.set(-2.4 * sc0, 4.2 * sc0, 3.0 * sc0);
      keyL.shadow.camera.updateProjectionMatrix();
    }
    kickL.intensity = 0.9 + feastE * 2.5;
    nhAim(stormK * stormK * (3 - 2 * stormK), monE, feastE);
    glow.material.opacity = (1 - monE) * stormK * (0.55 + 0.25 * stormMean) * (0.85 + 0.15 * Math.sin(now * 2.3));
    glow.scale.setScalar(1.6 + stormK * 0.9 + stormMean * 0.5);
    shared.time.value = now;

    // ---- the hero: breathe, sway, hop ----
    hop.v -= 9.8 * dt; hop.y += hop.v * dt;
    if (hop.y <= 0) { if (hop.v < -1.0) hop.squash = Math.min(1, -hop.v * 0.35); hop.y = 0; hop.v = 0; }
    hop.squash *= Math.pow(0.002, dt);
    hop.spin *= Math.pow(0.05, dt);
    var bob = rm ? 0 : Math.sin(now * 1.6) * 0.012;
    var lift = stormK * (0.55 + Math.sin(now * 1.1) * 0.06);
    heroMesh.position.set(0, hop.y + bob + lift, 0.35);
    var sway = rm ? 0 : Math.sin(now * 0.45) * 0.22;
    heroMesh.rotation.set(0.10 + stormK * 0.25, 0.35 + sway + hop.spin + stormK * now * (0.6 + stormMean * 0.8), 0);
    var sq = hop.squash * 0.22, br = rm ? 0 : Math.sin(now * 1.6 + 1) * 0.008;
    heroMesh.scale.set(1.12 * (1 + sq * 0.5 + br), 1.12 * (1 - sq - br), 1.12 * (1 + sq * 0.5 + br));
    if (monE > 0.001) {
      // the hero is the monster's heart: a golden nugget in its chest
      var heart = mon.J.torso.localToWorld(new T.Vector3(0, 1.08, 1.12));
      heroMesh.position.lerp(heart, monE);
      heroMesh.rotation.set(1.35 * monE + heroMesh.rotation.x * (1 - monE), heroMesh.rotation.y + now * 0.4 * monE, 0);
      heroMesh.scale.multiplyScalar(1 - 0.25 * monE * (1 - Math.abs(Math.sin(now * 2.6)) * 0.15));
    }

    // ---- the pile / the storm ----
    var draw = [[], [], [], []], settled = true;
    var spinMul = 1 + stormMean * 1.3;
    for (var k = 0; k < slots.length; k++) {
      var sl = slots[k], b = sl.bucket;
      var out = 0;
      if (!sl.on) {
        if (sl.out < 0) continue;
        out = Math.min(1, (now - sl.out) / 0.22);
        if (out >= 1) { sl.out = -1; continue; }
        settled = false;
      }
      var tt = rm ? 1 : Math.max(0, (now - sl.t0) / 0.6);
      if (tt < 1) settled = false;
      var land = nhLand(Math.min(1, tt));
      var dropH = 1.6 + (k % 5) * 0.25;
      var py = sl.y + (1 - land) * dropH, px = sl.x, pz = sl.z;
      var tumble = (1 - Math.min(1, tt)) * 3.0;
      E.set(sl.rx + tumble, sl.ry + tumble * 0.7, sl.rz);
      // storm pose: orbit the hero, tilted ring, nuggets spinning on themselves
      if (stormK > 0.001) {
        var oa = sl.orbA + now * sl.orbW * spinMul;
        var ox = Math.cos(oa) * sl.orbR * 1.15, oz = Math.sin(oa) * sl.orbR * 0.9 + 0.2;
        var oy = sl.orbY + 0.12 + Math.sin(oa * 2 + k) * 0.06;
        var e = stormK * stormK * (3 - 2 * stormK);
        px += (ox - px) * e; py += (oy - py) * e; pz += (oz - pz) * e;
        var sp = sl.spinA + now * sl.spinW * spinMul * e;
        E.set(E.x + sp * e, E.y + sp * 0.6 * e, E.z + sp * 0.3 * e);
        settled = false;
      }
      var sc = sl.s * (sl.on ? Math.min(1, 0.2 + tt * 3) : (1 - out)) * (1 - 0.42 * stormK);
      Q.setFromEuler(E); V3.set(px, py, pz); S3.set(sc, sc, sc);
      if (sl.plate && (sl.mb > 0 || monWant)) {
        // fly from wherever the storm had it to its plate on the monster
        var tgt = (monWant && sl.on && now >= sl.mt0) ? 1 : 0;
        sl.mb = Math.max(0, Math.min(1, sl.mb + (tgt ? dt * 1.1 : -dt * 1.6)));
        var eb = sl.mb * sl.mb * (3 - 2 * sl.mb);
        if (eb > 0) {
          PW.multiplyMatrices(sl.plate.j.matrixWorld, sl.plate.m).decompose(PV, PQ, PS);
          V3.lerp(PV, eb); V3.y += Math.sin(eb * Math.PI) * 1.4;
          Q.slerp(PQ, eb); S3.lerp(PS, eb);
          settled = false;
        }
      }
      sl.M.compose(V3, Q, S3);
      sl.d = V3.distanceToSquared(cam.position);
      draw[k % 4].push(sl);
    }
    // FRONT TO BACK. Instances draw in buffer order and the breading shader is
    // heavy: 250 overlapping monster plates in slot order shaded most pixels 3-4
    // times (36fps). Sorted nearest-first, early-z throws the hidden ones away.
    // The tint rides with its nugget, or the colours would swap every frame.
    for (var p = 0; p < 4; p++) {
      var mesh = pile[p].mesh, L = draw[p];
      L.sort(function (a, b) { return a.d - b.d; });
      for (var q = 0; q < L.length; q++) { mesh.setMatrixAt(q, L[q].M); if (L[q].col) mesh.setColorAt(q, L[q].col); }
      mesh.count = L.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    R.render(scene, cam);

    // A settled, reduced-motion stage has nothing left to draw.
    if (rm && settled && !monWant && Math.abs(stormK - stormWant) < 0.002 && hop.y === 0) return;
    raf = requestAnimationFrame(nhFrame);
  }

  // ---- 🦖 THE NUGGET MONSTER (100M+) and 🔥 THE FEAST (100B+) ------------------------
  // Beau, 2026-10-07: "anything over 100 million should create a nugget monster
  // out of these nuggets and anything over 100 billion should be the monster
  // eating something in total destruction."
  //
  // The monster is not a model with nuggets painted on — it IS the storm's
  // nuggets. A jointed skeleton carries a dark batter core, and ~240 "plates"
  // are sampled over the core's surfaces, each one a nugget lying flat on the
  // surface normal. Plate k belongs to slot k, so the same nuggets you watched
  // orbit fly in feet-first and lock into place. The hero becomes its heart.
  // At 100B it stands in a little Nuggetown and eats it, one building at a time.
  var MON_AT = 1e8, FEAST_AT = 1e11;
  var mon = null, monK = 0, monWant = 0, feastK = 0, feastWant = 0, shake = 0, keyL, kickL, mat0 = null;

  function nhMonBuild(mat) {
    var hand = nhHandheld(), dens = hand ? 0.72 : 1;
    var g = new T.Group(); scene.add(g);
    var J = {};
    function joint(name, parent, x, y, z) { var o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); J[name] = o; return o; }
    joint('root', g, 0, 0, 0);
    joint('hips', J.root, 0, 2.42, 0);
    joint('torso', J.hips, 0, 0.3, 0);
    joint('head', J.torso, 0, 1.85, 0.3);
    joint('jaw', J.head, 0, -0.15, 0.05);
    [-1, 1].forEach(function (sx) {
      var s = sx < 0 ? 'L' : 'R';
      joint('arm' + s, J.torso, sx * 1.45, 1.1, 0.1);
      joint('fore' + s, J['arm' + s], sx * 0.55, -1.0, 0.3);
      joint('leg' + s, J.hips, sx * 0.7, -0.1, 0);
    });
    // the body: [joint, kind, ...] — ellipsoid: centre, radii, plates; capsule: a, b, r, plates
    var B = [
      // the chest leaves a window for the heart (the hero nugget, glowing)
      ['torso', 'e', [0, 0.75, 0], [1.5, 1.55, 1.15], 66, function (n, p) { return n.z > 0.62 && Math.abs(n.x) < 0.45 && p.y > -0.05 && p.y < 0.85; }],
      ['hips', 'e', [0, 0.05, 0.15], [1.22, 0.85, 0.86], 24],
      // the FACE is bare batter — plates stop at the brow and the cheeks, so the
      // eyes and the mouth read. (First cut plated over everything: a lump.)
      ['head', 'e', [0, 0.15, 0.1], [0.95, 0.78, 0.9], 40, function (n) { return n.z > 0.5 && n.y < 0.5 && n.y > -0.75 && Math.abs(n.x) < 0.72; }],
      ['jaw', 'e', [0, -0.25, 0.35], [0.8, 0.32, 0.72], 14],
    ];
    [-1, 1].forEach(function (sx) {
      var s = sx < 0 ? 'L' : 'R';
      B.push(['arm' + s, 'c', [0, 0, 0], [sx * 0.55, -1.0, 0.3], 0.45, 13]);
      B.push(['fore' + s, 'c', [0, 0, 0], [sx * 0.1, -1.0, 0.45], 0.40, 11]);
      B.push(['fore' + s, 'e', [sx * 0.1, -1.15, 0.5], [0.5, 0.45, 0.5], 8]);
      B.push(['leg' + s, 'c', [0, 0, 0], [sx * 0.15, -1.85, 0.1], 0.58, 15]);
      B.push(['leg' + s, 'e', [sx * 0.2, -2.0, 0.35], [0.62, 0.32, 0.8], 8]);
    });
    // a dark fried-batter core under the plates, so gaps read as body, not sky.
    // Same breading program as every other nugget: no new shader to compile.
    var core = nhMaterial(T, shared);
    core.color = new T.Color(0.42, 0.3, 0.22);
    var cores = [], plates = [], r = nhRng(777);
    var up = new T.Vector3(0, 1, 0), nrm = new T.Vector3(), q = new T.Quaternion(), q2 = new T.Quaternion(), pos = new T.Vector3();
    function mkPlate(j, c, p, n) {
      // a nugget lying ON the surface: its thickness axis (+Y) along the normal,
      // spun at random about it, pushed out a touch so it sits proud
      q.setFromUnitVectors(up, n); q2.setFromAxisAngle(up, r() * Math.PI * 2); q.multiply(q2);
      var at = new T.Vector3().fromArray(c).add(p).addScaledVector(n, 0.04);
      var sc = 0.62 + r() * 0.2;
      return { j: j, m: new T.Matrix4().compose(at, q.clone(), new T.Vector3(sc, sc, sc)), y: 0 };
    }
    B.forEach(function (b) {
      var j = J[b[0]], mesh, n, i;
      if (b[1] === 'e') {
        mesh = new T.Mesh(new T.SphereGeometry(1, 28, 18), core);
        mesh.position.fromArray(b[2]); mesh.scale.fromArray(b[3]).multiplyScalar(0.94);
        n = Math.round(b[4] * dens);
        for (i = 0; i < n; i++) { // fibonacci points over the ellipsoid
          var yv = 1 - 2 * (i + 0.5) / n, rad = Math.sqrt(1 - yv * yv), th = i * 2.39996 + b[4];
          var ux = Math.cos(th) * rad, uz = Math.sin(th) * rad;
          pos.set(ux * b[3][0], yv * b[3][1], uz * b[3][2]);
          nrm.set(ux / b[3][0], yv / b[3][1], uz / b[3][2]).normalize();
          if (b[5] && b[5](nrm, pos)) continue;
          plates.push(mkPlate(j, b[2], pos, nrm));
        }
      } else {
        var a = new T.Vector3().fromArray(b[2]), e = new T.Vector3().fromArray(b[3]), ax = e.clone().sub(a), L = ax.length();
        mesh = new T.Mesh(new T.CapsuleGeometry(b[4] * 0.94, L, 6, 18), core);
        mesh.position.copy(a).addScaledVector(ax, 0.5);
        mesh.quaternion.setFromUnitVectors(up, ax.clone().normalize());
        n = Math.round(b[5] * dens);
        var rings = Math.max(2, Math.round(n / 4)), per = Math.ceil(n / rings);
        var dir = ax.clone().normalize();
        var side = new T.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new T.Vector3(1, 0, 0) : up).normalize();
        var side2 = new T.Vector3().crossVectors(dir, side);
        for (var ri = 0; ri < rings; ri++) for (var pi = 0; pi < per; pi++) {
          var t = (ri + 0.5) / rings, ang = (pi / per) * Math.PI * 2 + ri * 0.7;
          nrm.copy(side).multiplyScalar(Math.cos(ang)).addScaledVector(side2, Math.sin(ang)).normalize();
          pos.copy(a).addScaledVector(ax, t).addScaledVector(nrm, b[4]);
          plates.push(mkPlate(j, [0, 0, 0], pos, nrm));
        }
      }
      mesh.castShadow = true; mesh.receiveShadow = true;
      j.add(mesh); cores.push(mesh);
    });
    // eyes: the storm, looking out
    var eyeM = new T.MeshBasicMaterial({ color: new T.Color(4.0, 2.4, 0.5), toneMapped: false });
    // teeth: pale fried batter, jagged, top row on the head and bottom on the jaw
    var tooth = nhMaterial(T, shared); tooth.color = new T.Color(1.35, 1.28, 1.1);
    var tg = new T.ConeGeometry(0.1, 0.34, 7);
    for (var ti = 0; ti < 8; ti++) {
      var ta = (ti / 7 - 0.5) * 1.9, top = new T.Mesh(tg, tooth), bot = new T.Mesh(tg, tooth);
      top.position.set(Math.sin(ta) * 0.62, -0.06, 0.22 + Math.cos(ta) * 0.62); top.rotation.set(Math.PI, 0, (r() - 0.5) * 0.3); top.scale.setScalar(0.8 + r() * 0.6);
      bot.position.set(Math.sin(ta) * 0.58, -0.08, 0.28 + Math.cos(ta) * 0.6); bot.rotation.set(0, 0, (r() - 0.5) * 0.3); bot.scale.setScalar(0.7 + r() * 0.5);
      J.head.add(top); J.jaw.add(bot);
    }
    var eyes = [-1, 1].map(function (sx) {
      var ey = new T.Mesh(new T.SphereGeometry(0.15, 14, 10), eyeM);
      ey.position.set(sx * 0.33, 0.33, 0.86); ey.scale.set(1.25, 0.8, 1); J.head.add(ey);
      var gl = new T.Sprite(new T.SpriteMaterial({ map: glow.material.map, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.9 }));
      gl.scale.setScalar(0.9); ey.add(gl);
      return ey;
    });
    var hg = new T.Sprite(new T.SpriteMaterial({ map: glow.material.map, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.8 }));
    hg.position.set(0, 1.08, 1.2); hg.scale.setScalar(1.6); J.torso.add(hg);
    // the inside of the mouth is DARK, so an open jaw reads as a mouth
    var maw = new T.Mesh(new T.SphereGeometry(0.62, 16, 12), new T.MeshBasicMaterial({ color: 0x120604 }));
    maw.position.set(0, -0.12, 0.42); J.head.add(maw);
    // plates rise feet first: remember each one's height at rest for the stagger
    g.updateMatrixWorld(true);
    var tmp = new T.Vector3(), mw = new T.Matrix4();
    plates.forEach(function (p) { tmp.setFromMatrixPosition(mw.multiplyMatrices(p.j.matrixWorld, p.m)); p.y = tmp.y; });
    g.visible = false;
    return { g: g, J: J, plates: plates, cores: cores, eyes: eyes, city: null, roarT: 4, roar: 0, chomp: 0 };
  }

  // ---- THE FEAST: a little Nuggetown to eat (built the first time it's needed) ----
  function nhCityBuild() {
    var hand = nhHandheld();
    var wc = doc.createElement('canvas'); wc.width = 64; wc.height = 128;
    var wx = wc.getContext('2d'), wr = nhRng(5);
    wx.fillStyle = '#0d0f16'; wx.fillRect(0, 0, 64, 128);
    for (var yy = 4; yy < 124; yy += 10) for (var xx = 4; xx < 60; xx += 10) {
      var lit = wr();
      wx.fillStyle = lit < 0.5 ? '#ffcf7a' : lit < 0.62 ? '#8fd0ff' : '#1a1d27';
      wx.fillRect(xx, yy, 6, 6);
    }
    var wt = new T.CanvasTexture(wc); wt.encoding = T.sRGBEncoding;
    var bm = new T.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: new T.Color(1.3, 1.1, 0.9), roughness: 0.8, metalness: 0.1 });
    var N = hand ? 26 : 44, r = nhRng(42), list = [], i;
    var geo = new T.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    var im = new T.InstancedMesh(geo, bm, N); im.castShadow = true; im.receiveShadow = true;
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    var col = new T.Color();
    for (i = 0; i < N; i++) {
      // a ring of blocks round the monster's feet: deep behind, thin in front
      var a = Math.PI * (0.85 + 1.3 * r()), rad = 2.8 + r() * 4.6;
      if (i % 5 === 0) { a = Math.PI * (r() < 0.5 ? 0.06 + 0.24 * r() : 0.70 + 0.24 * r()); rad = 3.4 + r() * 3.5; }
      list.push({ x: Math.cos(a) * rad * 1.25, z: Math.sin(a) * rad * 0.85 - 0.4, w: 0.5 + r() * 0.6, d: 0.5 + r() * 0.6, h: 0.7 + r() * r() * 3.2, on: 1, burn: r() < 0.42, ph: r() * 6 });
      col.setHSL(0.6 + r() * 0.08, 0.2, 0.3 + r() * 0.25); im.setColorAt(i, col);
    }
    im.visible = false; scene.add(im);
    // the one in its hand
    var held = new T.Mesh(geo, bm); held.visible = false; held.castShadow = true;
    mon.J.foreR.add(held);
    // flames over the burning ones
    var fc = doc.createElement('canvas'); fc.width = fc.height = 64;
    var fx = fc.getContext('2d'), fg = fx.createRadialGradient(32, 40, 0, 32, 36, 30);
    fg.addColorStop(0, 'rgba(255,240,180,1)'); fg.addColorStop(0.35, 'rgba(255,140,30,0.8)'); fg.addColorStop(1, 'rgba(255,40,0,0)');
    fx.fillStyle = fg; fx.fillRect(0, 0, 64, 64);
    var ft = new T.CanvasTexture(fc);
    var fires = list.filter(function (b) { return b.burn; }).map(function (b) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: ft, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.position.set(b.x, b.h + 0.3, b.z); s.userData.b = b; scene.add(s); return s;
    });
    var fireL = new T.PointLight(nhSrgb(T, '#ff6a1a'), 0, 18, 1.6); fireL.position.set(0, 2.5, -2.5); scene.add(fireL);
    // the sky over Nuggetown, on fire: one big additive glow behind everything
    var skc = doc.createElement('canvas'); skc.width = skc.height = 64;
    var skx = skc.getContext('2d'), skg = skx.createRadialGradient(32, 44, 0, 32, 44, 34);
    skg.addColorStop(0, 'rgba(255,120,30,0.95)'); skg.addColorStop(0.45, 'rgba(210,50,12,0.45)'); skg.addColorStop(1, 'rgba(120,10,0,0)');
    skx.fillStyle = skg; skx.fillRect(0, 0, 64, 64);
    var sky = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(skc), blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
    sky.position.set(0, 2.2, -9); sky.scale.set(26, 13, 1); sky.renderOrder = -1; scene.add(sky);
    // crumbs: tiny nuggets, same breading program
    var debris = new T.InstancedMesh(nhNugGeo(T, 'ball', 9.1, 0.35), mat0, 48);
    debris.count = 0; debris.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(debris);
    var bits = []; for (i = 0; i < 48; i++) bits.push({ x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, s: 0, r: 0 });
    return { im: im, sky: sky, list: list, held: held, fires: fires, fireL: fireL, debris: debris, bits: bits, bi: 0, phase: 'reach', pt: 0, target: -1, bites: 0, stompT: 3 };
  }

  function nhBurst(at, n, sp) {
    var C = mon.city;
    for (var i = 0; i < n; i++) {
      var p = C.bits[C.bi++ % C.bits.length];
      p.x = at.x; p.y = at.y; p.z = at.z;
      p.vx = (Math.random() - 0.5) * sp; p.vy = Math.random() * sp; p.vz = Math.random() * sp * 0.6;
      p.s = 0.12 + Math.random() * 0.12;
    }
  }

  function nhCityTick(now, dt, k) {
    var C = mon.city, J = mon.J; if (!C) return;
    C.im.visible = k > 0.01;
    C.fireL.intensity = k * (5 + Math.sin(now * 17) * 1.2 + Math.sin(now * 5.3) * 1.5);
    C.sky.material.opacity = k * (0.55 + 0.08 * Math.sin(now * 3.1));
    // the city grows up out of the ground as the feast arrives
    var grow = k * k * (3 - 2 * k);
    C.list.forEach(function (b, i) {
      var h = b.on ? b.h * grow : 0;
      M4.compose(V3.set(b.x, 0, b.z), Q.set(0, 0, 0, 1), S3.set(b.w, Math.max(0.0001, h), b.d));
      C.im.setMatrixAt(i, M4);
    });
    C.im.instanceMatrix.needsUpdate = true;
    C.fires.forEach(function (s) {
      var b = s.userData.b, f = b.on ? grow * (0.9 + 0.3 * Math.sin(now * 13 + b.ph)) : 0;
      s.position.y = b.h * grow + 0.45; s.scale.set(1.3 * f + 0.0001, 2.1 * f + 0.0001, 1);
    });
    if (k < 0.5) { C.held.visible = false; mon.chomp = 0; return; }
    // THE EATING CYCLE: reach down, take a building, lift it, four bites, again
    C.pt += dt;
    var armR = J.armR, foreR = J.foreR;
    if (C.phase === 'reach') {
      if (C.target < 0) {
        var live = [];
        C.list.forEach(function (b, i) { if (b.on) live.push(i); });
        if (!live.length) { C.list.forEach(function (b, i) { b.on = 1; live.push(i); }); } // the city rebuilds. it always does.
        C.target = live[Math.floor(Math.random() * live.length)];
      }
      var e = Math.min(1, C.pt / 1.2);
      armR.rotation.set(-1.0 * e, 0, -0.5 * e); foreR.rotation.set(-0.3 * e, 0, 0);
      if (C.pt > 1.2) {
        var tb = C.list[C.target]; tb.on = 0;
        C.held.visible = true; C.held.scale.set(tb.w * 0.9, Math.max(1.2, tb.h) * 0.9, tb.d * 0.9);
        // gripped in the fist, sticking OUT along the forearm (local -y), so once
        // the arm comes up the building points at the mouth
        C.held.position.set(0.05, -1.35, 0.55); C.held.rotation.set(Math.PI, 0, 0.2);
        C.phase = 'lift'; C.pt = 0; C.bites = 0;
        nhBurst(V3.set(tb.x, 0.2, tb.z), 10, 2.5);
      }
    } else if (C.phase === 'lift') {
      var e2 = Math.min(1, C.pt / 1.0);
      armR.rotation.set(-1.0 - e2 * 1.25, 0, -0.5 + e2 * 0.9); foreR.rotation.set(-0.3 - e2 * 1.3, 0, 0);
      if (C.pt > 1.0) { C.phase = 'eat'; C.pt = 0; }
    } else if (C.phase === 'eat') {
      var bite = C.pt % 0.6;
      mon.chomp = bite < 0.3 ? bite / 0.3 : 1 - (bite - 0.3) / 0.3;
      var at = (C.bites + 1) * 0.6 - 0.3;
      if (C.pt >= at && C.pt - dt < at) {
        C.bites++; C.held.scale.y *= 0.68; shake = Math.max(shake, 0.05);
        V3.setFromMatrixPosition(J.jaw.matrixWorld); V3.y -= 0.2; V3.z += 0.7;
        nhBurst(V3, 7, 3);
      }
      if (C.bites >= 4) { C.held.visible = false; mon.chomp = 0; C.phase = 'reach'; C.pt = 0; C.target = -1; }
    }
    // a stomp now and then: the whole frame jumps
    C.stompT -= dt;
    var st = C.stompT < 0.5 && C.stompT > 0 ? Math.sin((0.5 - C.stompT) / 0.5 * Math.PI) : 0;
    J.legL.rotation.x = -st * 0.45;
    if (C.stompT <= 0) { C.stompT = 3 + Math.random() * 2; shake = Math.max(shake, 0.16); nhBurst(V3.set(-0.9, 0.1, 0.4), 8, 1.8); }
    // crumbs in the air
    var n = 0;
    C.bits.forEach(function (p) {
      if (p.s <= 0) return;
      p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 6;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; p.s -= dt * 0.6; }
      Q.setFromEuler(E.set(p.r, p.r * 0.7, 0));
      M4.compose(V3.set(p.x, p.y, p.z), Q, S3.setScalar(Math.max(0.0001, p.s)));
      C.debris.setMatrixAt(n++, M4);
    });
    C.debris.count = n; C.debris.instanceMatrix.needsUpdate = true;
  }

  // drive the skeleton (every frame while the monster is up)
  function nhMonAnimate(now, dt, rm) {
    var J = mon.J, e = monK * monK * (3 - 2 * monK);
    mon.g.visible = monK > 0.01;
    J.root.rotation.y = rm ? 0 : Math.sin(now * 0.33) * 0.18 * (1 - feastK * 0.6) - feastK * 0.12;
    J.hips.position.y = 2.42 + (rm ? 0 : Math.sin(now * 1.3) * 0.05);
    J.torso.rotation.x = 0.14 + (rm ? 0 : Math.sin(now * 1.3) * 0.03);
    var br = 1 + (rm ? 0 : Math.sin(now * 1.3) * 0.025);
    J.torso.scale.set(br, 1, br);
    // THE ROAR: every few seconds the jaw drops, the head goes back, the frame shakes
    mon.roarT -= dt;
    if (mon.roarT <= 0 && feastK < 0.5 && !rm) { mon.roarT = 6 + Math.random() * 3; mon.roar = 1.6; }
    var roar = 0;
    if (mon.roar > 0) { mon.roar -= dt; roar = Math.sin(Math.min(1, (1.6 - mon.roar) / 1.6) * Math.PI); shake = Math.max(shake, roar * 0.07); }
    var open = Math.max(roar, mon.chomp || 0);
    J.jaw.rotation.x = open * 0.6;
    J.head.rotation.set(-roar * 0.35, rm ? 0 : Math.sin(now * 0.5) * 0.28 * (1 - feastK), 0);
    if (feastK < 0.5) {
      J.armL.rotation.set(-0.15, 0, -0.25 + Math.sin(now * 1.1) * 0.08 - roar * 0.5);
      J.armR.rotation.set(-0.15, 0, 0.25 - Math.sin(now * 1.1) * 0.08 + roar * 0.5);
      J.foreL.rotation.set(-0.35, 0, 0); J.foreR.rotation.set(-0.35, 0, 0);
      J.legL.rotation.x = 0;
    } else {
      J.armL.rotation.set(-0.3, 0, -0.35 + Math.sin(now * 2) * 0.1);
    }
    mon.eyes.forEach(function (ey) { ey.scale.setScalar(0.85 + 0.25 * e + open * 0.3); });
    mon.cores.forEach(function (c) { c.visible = e > 0.35; });
    mon.g.updateMatrixWorld(true);
  }

  // ---- public ---------------------------------------------------------------------
  HERO.setCount = function (n, dollars) {
    HERO.count = Math.max(0, Math.floor(n || 0));
    HERO.dollars = dollars || 0;
    nhApplyCount();
  };
  HERO.poke = function () {
    if (!HERO.ready || nhReduced()) return;
    if (hop.y < 0.05) { hop.v = 2.1 + Math.random() * 0.4; hop.spin += (Math.random() - 0.5) * 0.5; }
    nhKick();
  };
  HERO.state = function () {
    var shown = 0;
    for (var k = 0; k < slots.length; k++) if (slots[k].on) shown++;
    return { ready: HERO.ready, failed: HERO.failed, count: HERO.count, extras: shown, storm: +stormK.toFixed(3), monster: +monK.toFixed(3), feast: +feastK.toFixed(3), plates: mon ? mon.plates.length : 0, eating: mon && mon.city ? mon.city.phase : null };
  };
  // draw one frame now (tests pin HERO.debug.clock first)
  HERO.render = function () {
    if (!HERO.ready) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    nhFrame(0);
  };
  HERO.debug.renderer = function () { return R; };
  HERO.debug.scene = function () { return scene; };
  HERO.makeNuggetGeometry = function (shape, seed, res) { return nhNugGeo(global.THREE, shape, seed, res || 1); };
  HERO.makeBreadingMaterial = function (shared) { return nhMaterial(global.THREE, shared || { storm: { value: 0 }, time: { value: 0 } }); };

  // ---- boot: after load, after idle, never before ----------------------------------
  function nhBoot() {
    if (!nhAllowed()) return;
    var go = function () {
      var inj = global.HallBoot && HallBoot.inject;
      if (!inj) return;
      inj('vendor/three.min.js', function (ok) {
        if (!ok || !global.THREE) { HERO.failed = true; return; }
        inj('vendor/RoomEnvironment.js', function () {
          try { nhBuild(); } catch (e) { HERO.failed = true; try { console.warn('nugHero:', e); } catch (_) { } }
        });
      });
    };
    var idle = global.requestIdleCallback || function (f) { return setTimeout(f, 600); };
    idle(go, { timeout: 2500 });
  }
  if (doc.readyState === 'complete') setTimeout(nhBoot, 400);
  else global.addEventListener('load', function () { setTimeout(nhBoot, 400); });

  // ---- 🍱 THE TRAY: the converter's nugget grid, made of nugget -------------------
  // Under the count, the converter used to draw up to 500 copies of nugget.png in
  // a scrolling flex grid. Now it's a tray: every nugget you can afford (to a
  // cap) lying on a paper liner, laid out in SIX-PIECE clusters so the picture
  // agrees with the "≈ N six-piece boxes" line above it. Same four shapes and
  // same breading as the hero, its own small renderer, and it only draws while
  // something is moving — once the nuggets land, the loop stops.
  var TRAY = { ready: false, cap: 300, count: 0 };
  (function () {
    var TT, RR, sc, cm, cv, wrapEl, gridEl, meshes = [], items = [], raf2 = 0, lastN = -1, sh2;
    var M = null, Qt = null, Vt = null, St = null, Et = null;

    function trayBuild() {
      TT = global.THREE;
      var hand = nhHandheld();
      TRAY.cap = hand ? 120 : 300;
      gridEl = doc.getElementById('nuggetGrid');
      if (!gridEl) throw new Error('no grid');
      wrapEl = doc.createElement('div'); wrapEl.className = 'nug-tray';
      cv = doc.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
      wrapEl.appendChild(cv);
      gridEl.parentNode.insertBefore(wrapEl, gridEl);
      RR = new TT.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
      RR.setPixelRatio(Math.min(global.devicePixelRatio || 1, hand ? 1.5 : 2));
      RR.outputEncoding = TT.sRGBEncoding; RR.toneMapping = TT.ACESFilmicToneMapping; RR.toneMappingExposure = 0.9;
      RR.shadowMap.enabled = true; RR.shadowMap.type = TT.PCFSoftShadowMap;
      RR.setClearColor(0, 0); RR.debug.checkShaderErrors = false;
      sc = new TT.Scene();
      if (TT.RoomEnvironment) { var pm = new TT.PMREMGenerator(RR); sc.environment = pm.fromScene(new TT.RoomEnvironment(), 0.04).texture; pm.dispose(); }
      cm = new TT.PerspectiveCamera(30, 2, 0.1, 200);
      sc.add(new TT.HemisphereLight(nhSrgb(TT, '#c4cfff'), nhSrgb(TT, '#3b2512'), 0.35));
      var key = new TT.DirectionalLight(nhSrgb(TT, '#ffe1b5'), 2.6);
      key.castShadow = true; key.shadow.mapSize.set(hand ? 1024 : 2048, hand ? 1024 : 2048);
      key.shadow.radius = 3; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
      sc.add(key); sc.add(key.target); TRAY.key = key;
      var rim = new TT.DirectionalLight(nhSrgb(TT, '#a9c1ff'), 0.9); rim.position.set(8, 6, -10); sc.add(rim);
      // the liner: greaseproof paper, a printed border, a few honest grease spots
      var lc = doc.createElement('canvas'); lc.width = lc.height = 512;
      var lx = lc.getContext('2d'), lr = nhRng(12);
      lx.fillStyle = '#d9c7a2'; lx.fillRect(0, 0, 512, 512);
      for (var i = 0; i < 2600; i++) { lx.fillStyle = 'rgba(120,90,50,' + (lr() * 0.05).toFixed(3) + ')'; lx.fillRect(lr() * 512, lr() * 512, 1 + lr() * 2, 1 + lr() * 2); }
      for (i = 0; i < 9; i++) {
        var gx = lr() * 512, gy = lr() * 512, gr = 14 + lr() * 40, gg = lx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        gg.addColorStop(0, 'rgba(190,140,60,0.22)'); gg.addColorStop(1, 'rgba(190,140,60,0)');
        lx.fillStyle = gg; lx.beginPath(); lx.ellipse(gx, gy, gr * 1.3, gr, lr() * 3, 0, Math.PI * 2); lx.fill();
      }
      lx.strokeStyle = 'rgba(196,58,40,0.55)'; lx.lineWidth = 6; lx.strokeRect(22, 22, 468, 468);
      lx.lineWidth = 2; lx.strokeRect(34, 34, 444, 444);
      var lt = new TT.CanvasTexture(lc); lt.encoding = TT.sRGBEncoding; lt.anisotropy = 8;
      // envMapIntensity low: a white studio room reflected in white paper blew the liner out
      TRAY.liner = new TT.Mesh(new TT.PlaneGeometry(1, 1), new TT.MeshStandardMaterial({ map: lt, roughness: 0.9, envMapIntensity: 0.25 }));
      TRAY.liner.rotation.x = -Math.PI / 2; TRAY.liner.receiveShadow = true; sc.add(TRAY.liner);
      // the tray itself: a dark rounded slab with a lip
      var shape = function (w, d, r) {
        var s = new TT.Shape(), x = -w / 2, y = -d / 2;
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
        s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
      };
      TRAY.shape = shape;
      TRAY.slabMat = new TT.MeshStandardMaterial({ color: nhSrgb(TT, '#3a2a22'), roughness: 0.45, metalness: 0.05 });
      sh2 = { storm: { value: 0 }, time: { value: 0 } };
      var mat = nhMaterial(TT, sh2);
      meshes = NH_ORDER.map(function (s, si) {
        var im = new TT.InstancedMesh(nhNugGeo(TT, s, 2.3 + si * 3.7, 0.4), mat, Math.ceil(TRAY.cap / 4) + 1);
        im.castShadow = true; im.receiveShadow = true; im.count = 0; im.instanceMatrix.setUsage(TT.DynamicDrawUsage);
        sc.add(im); return im;
      });
      M = new TT.Matrix4(); Qt = new TT.Quaternion(); Vt = new TT.Vector3(); St = new TT.Vector3(); Et = new TT.Euler();
      // Visible until told otherwise: the observer only ever PAUSES the tray. A run
      // where it never fired at all left the tray blank forever (THE TRAY, AGENTS.md).
      TRAY.vis = true;
      if ('IntersectionObserver' in global) new IntersectionObserver(function (es) { TRAY.vis = es[0].isIntersecting; if (TRAY.vis) kick2(); }).observe(wrapEl);
      global.addEventListener('resize', function () { layout(TRAY.count, true); });
      TRAY.ready = true;
      gridEl.classList.add('tray-on');
      // re-run the converter so the grid goes through the tray path: the 500
      // PNGs it drew before the tray existed go, and its note gets the tray's cap
      if (typeof update === 'function') update(); else TRAY.setCount(HERO.count);
    }

    // six-piece clusters (3 x 2), clusters in rows, the whole thing fitted to
    // the canvas: few nuggets = big nuggets, a thousand = a full tray
    function layout(n, keep) {
      var drawn = Math.min(n, TRAY.cap);
      var W = Math.max(200, wrapEl.clientWidth || gridEl.clientWidth || 380);
      var H = drawn ? Math.round(Math.max(150, Math.min(340, 112 + Math.sqrt(drawn) * 13.5))) : 0;
      wrapEl.style.height = H + 'px';
      if (!drawn) { TRAY.count = n; meshes.forEach(function (m) { m.count = 0; }); return; }
      var K = Math.ceil(drawn / 6), cwU = 3.35, cdU = 2.25, gap = 0.55;
      var A = (W / H) * 1.45;   // the camera's tilt shortens depth on screen
      var cc = Math.max(1, Math.min(K, Math.round(Math.sqrt(K * A * (cdU + gap) / (cwU + gap)))));
      var rows = Math.ceil(K / cc);
      var tw = cc * cwU + (cc - 1) * gap, td = rows * cdU + (rows - 1) * gap;
      var rng = nhRng(77), slots2 = [];
      for (var i = 0; i < drawn; i++) {
        var c = Math.floor(i / 6), j = i % 6, cr = Math.floor(c / cc), ccx = c % cc;
        // the last row centres itself instead of hugging the left edge
        var inRow = cr === rows - 1 ? K - cr * cc : cc;
        var x0 = -tw / 2 + (ccx + (cc - inRow) / 2) * (cwU + gap);
        var z0 = -td / 2 + cr * (cdU + gap);
        slots2.push({
          x: x0 + 0.55 + (j % 3) * 1.12 + (rng() - 0.5) * 0.12,
          z: z0 + 0.55 + Math.floor(j / 3) * 1.14 + (rng() - 0.5) * 0.12,
          ry: rng() * 6.28, rx: (rng() - 0.5) * 0.12, rz: (rng() - 0.5) * 0.12, s: 0.84 + rng() * 0.12,
        });
      }
      // the tray grows to fit what's on it
      var tW = tw + 1.3, tD = td + 1.3;
      // the canvas is as tall as the TRAY needs, not a guess from the count —
      // seen at 52° a tray's depth shows at about sin(52°) of its length
      H = Math.round(Math.max(130, Math.min(360, 140 + 12 * Math.sqrt(drawn), W * (tD * 0.8 + 1.3) / (tW + 1.4))));
      wrapEl.style.height = H + 'px';
      if (TRAY.slab) { sc.remove(TRAY.slab); TRAY.slab.geometry.dispose(); }
      var sg = new TT.ExtrudeGeometry(TRAY.shape(tW, tD, 0.45), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 });
      TRAY.slab = new TT.Mesh(sg, TRAY.slabMat); TRAY.slab.rotation.x = -Math.PI / 2; TRAY.slab.position.y = -0.3;
      TRAY.slab.receiveShadow = true; sc.add(TRAY.slab);
      TRAY.liner.scale.set(tW - 0.45, tD - 0.45, 1); TRAY.liner.position.y = -0.01;
      // camera: a three-quarter look down at the whole tray
      RR.setSize(W, H, false); cm.aspect = W / H;
      var el = 52 * Math.PI / 180, fov = cm.fov * Math.PI / 180;
      var fitW = (tW / 2 + 0.3) / (Math.tan(fov / 2) * cm.aspect), fitD = (tD * Math.sin(el) / 2 + 0.8) / Math.tan(fov / 2);
      var dist = Math.max(fitW * 1.2, fitD) * 1.0 + Math.cos(el) * tD * 0.08;   // the near edge projects WIDER
      cm.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist + 0.2);
      cm.lookAt(0, 0, tD * 0.1); cm.updateProjectionMatrix();   // and LOWER: aim nearer to centre it
      var k = TRAY.key, b = Math.max(tW, tD) * 0.7 + 1;
      k.position.set(-1.1 * b, b * 1.25, 0.75 * b); k.target.position.set(0, 0, 0);
      k.shadow.camera.left = -b; k.shadow.camera.right = b; k.shadow.camera.top = b; k.shadow.camera.bottom = -b;
      k.shadow.camera.far = b * 8; k.shadow.camera.updateProjectionMatrix();
      // items: the ones already lying there SLIDE to their new spot (the layout
      // re-fits as the count changes); only the new ones drop in
      var now = performance.now() / 1000, old = items;
      items = [];
      for (i = 0; i < drawn; i++) {
        var it = old[i];
        if (it) { it.fx = it.cx; it.fz = it.cz; it.mt0 = now; }
        else it = { t0: now + Math.min(i - old.length, 60) * 0.014, fx: slots2[i].x, fz: slots2[i].z, mt0: -9 };
        it.p = slots2[i]; it.shape = i % 4; items.push(it);
      }
      TRAY.count = n;
      kick2();
    }

    function kick2() { if (!raf2 && TRAY.ready) raf2 = requestAnimationFrame(frame2); }
    function frame2() {
      raf2 = 0;
      if (TRAY.vis === false || nhBusy()) return;
      var now = performance.now() / 1000, moving = false, cnt = [0, 0, 0, 0];
      var rm = nhReduced();
      items.forEach(function (it) {
        var tt = rm ? 1 : Math.max(0, Math.min(1, (now - it.t0) / 0.5));
        if (tt < 1) moving = true;
        var land = nhLand(tt), p = it.p;
        var mv = Math.min(1, (now - it.mt0) / 0.35); if (mv < 1) moving = true;
        mv = mv * mv * (3 - 2 * mv);
        it.cx = it.fx + (p.x - it.fx) * mv; it.cz = it.fz + (p.z - it.fz) * mv;
        Et.set(p.rx + (1 - tt) * 2.2, p.ry + (1 - tt) * 1.5, p.rz);
        Qt.setFromEuler(Et); Vt.set(it.cx, (1 - land) * 3.2, it.cz);
        var s = p.s * Math.min(1, 0.25 + tt * 3); St.set(s, s, s);
        M.compose(Vt, Qt, St);
        meshes[it.shape].setMatrixAt(cnt[it.shape]++, M);
      });
      meshes.forEach(function (m, i) { m.count = cnt[i]; m.instanceMatrix.needsUpdate = true; });
      RR.render(sc, cm);
      if (moving) raf2 = requestAnimationFrame(frame2);   // otherwise: settled, the loop stops
    }

    TRAY.setCount = function (n) {
      n = Math.max(0, Math.floor(n || 0));
      if (!TRAY.ready) { TRAY.count = n; return; }
      var d = Math.min(n, TRAY.cap);
      if (d === lastN) return;
      // fewer than before: keep the survivors where they lie (no re-drop)
      layout(n, true);
      lastN = d;
    };
    TRAY.boot = function () {
      if (TRAY.ready || TRAY.failed || !global.THREE) return;
      try { trayBuild(); } catch (e) { TRAY.failed = true; try { console.warn('nugTray:', e); } catch (_) { } }
    };
  }());
  global.NugTray = TRAY;

  global.NugHero = HERO;
}(typeof window !== 'undefined' ? window : this));
