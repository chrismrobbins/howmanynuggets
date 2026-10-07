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
    'float nhCell(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); float d = 8.0;',
    '  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++){',
    '    vec3 o = vec3(float(a), float(b), float(c)); vec3 r = o + vec3(nhH(i + o), nhH(i + o + 31.0), nhH(i + o + 57.0)) - f;',
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
    '  float c1 = pow(max(0.0, 1.0 - nhCell(q * 26.0)), 2.4);',
    '  float c2 = pow(max(0.0, 1.0 - nhCell(q * 60.0 + 7.0)), 2.0);',
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
            'nhAlb *= 0.84 + 0.30 * nhN(vNhObj * 75.0);',
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
    } catch (e) { }
    return false;
  }

  // ---- the stage ------------------------------------------------------------------
  var T, R, scene, cam, canvas, wrap, img, heroMesh, glow, pile = [], slots = [], shared;
  var CAP = 72, STORM_CAP = 80, visible = false, raf = 0, last = 0, clock = 0;
  var hop = { y: 0, v: 0, squash: 0, spin: 0 }, stormK = 0, stormWant = 0, stormMean = 0;

  // count → how many nuggets the plate shows besides the hero
  function nhExtras(n) {
    if (n <= 1) return 0;
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
    var key = new T.DirectionalLight(nhSrgb(T, '#ffe1b5'), 2.3);
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
    var kick = new T.PointLight(nhSrgb(T, '#ff9a3c'), 0.9, 6, 2);
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
    var mat = nhMaterial(T, shared);

    heroMesh = new T.Mesh(nhNugGeo(T, 'ball', 3.3, 1), mat);
    heroMesh.castShadow = true; heroMesh.receiveShadow = true;
    heroMesh.scale.setScalar(1.12);
    scene.add(heroMesh);

    slots = nhSlots(Math.max(CAP, STORM_CAP));
    var per = Math.ceil(slots.length / 4);
    pile = NH_ORDER.map(function (shape, si) {
      var im = new T.InstancedMesh(nhNugGeo(T, shape, 1.7 + si * 2.9, 0.5), mat, per);
      im.castShadow = true; im.receiveShadow = true;
      im.count = 0;
      im.instanceMatrix.setUsage(T.DynamicDrawUsage);
      // a little per-nugget colour drift: some came out of the fryer later
      var rr = nhRng(400 + si), col = new T.Color();
      for (var q = 0; q < per; q++) {
        var t = rr();
        col.setRGB(1.0 - t * 0.10, 0.96 - t * 0.16, 0.92 - t * 0.24);
        im.setColorAt(q, col);
      }
      scene.add(im);
      return { mesh: im, items: [] };
    });
    // per-slot live state
    for (var k = 0; k < slots.length; k++) {
      var sl = slots[k];
      sl.on = false; sl.t0 = -1; sl.out = -1;
      sl.bucket = pile[k % 4]; sl.bi = Math.floor(k / 4);
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

    HERO.ready = true;
    nhApplyCount();
    nhKick();
    // crossfade from the poster once the first real frame is on screen
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { wrap.classList.add('has-nug3d'); });
    });
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
  function nhAim(k) {
    var dist = camBase * (1 + 0.38 * k);
    var el = (24 - 10 * k) * Math.PI / 180;
    cam.position.set(0, Math.sin(el) * dist + 0.35, Math.cos(el) * dist);
    cam.lookAt(0, 0.42 + 0.72 * k, -0.3 + 0.3 * k);
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

  var M4, Q, E, V3, S3;
  function nhFrame(ts) {
    raf = 0;
    if (!HERO.ready) return;
    if (!visible || nhBusy()) return; // sleeps; nhKick() wakes it
    var now = nhNow();
    var dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now; clock += dt;
    var rm = nhReduced();
    if (!M4) { M4 = new T.Matrix4(); Q = new T.Quaternion(); E = new T.Euler(); V3 = new T.Vector3(); S3 = new T.Vector3(); }

    // the storm fades in/out over about a second
    stormK += (stormWant - stormK) * Math.min(1, dt * 1.6);
    shared.storm.value = stormK * (0.65 + 0.35 * stormMean);
    nhAim(stormK * stormK * (3 - 2 * stormK));
    glow.material.opacity = stormK * (0.55 + 0.25 * stormMean) * (0.85 + 0.15 * Math.sin(now * 2.3));
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

    // ---- the pile / the storm ----
    var counts = [0, 0, 0, 0], settled = true;
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
      M4.compose(V3, Q, S3);
      b.mesh.setMatrixAt(sl.bi, M4);
      var bi = k % 4; if (sl.bi + 1 > counts[bi]) counts[bi] = sl.bi + 1;
    }
    for (var p = 0; p < 4; p++) {
      // hidden slots below the high-water mark still need a matrix: zero them
      var mesh = pile[p].mesh;
      for (var q = 0; q < counts[p]; q++) {
        var s2 = slots[q * 4 + p];
        if (!s2 || (!s2.on && s2.out < 0)) { M4.makeScale(0, 0, 0); mesh.setMatrixAt(q, M4); }
      }
      mesh.count = counts[p];
      mesh.instanceMatrix.needsUpdate = true;
    }

    R.render(scene, cam);

    // A settled, reduced-motion stage has nothing left to draw.
    if (rm && settled && Math.abs(stormK - stormWant) < 0.002 && hop.y === 0) return;
    raf = requestAnimationFrame(nhFrame);
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
    return { ready: HERO.ready, failed: HERO.failed, count: HERO.count, extras: shown, storm: +stormK.toFixed(3) };
  };
  // draw one frame now (tests pin HERO.debug.clock first)
  HERO.render = function () {
    if (!HERO.ready) return;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    nhFrame(0);
  };
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

  global.NugHero = HERO;
}(typeof window !== 'undefined' ? window : this));
