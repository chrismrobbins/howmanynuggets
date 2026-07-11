// ---- The Nugget Arcade hall ---------------------------------------------------
// A first-person 3D arcade you walk around in, rendered with a hand-rolled
// WebGL engine (no libraries — works from disk like everything else here).
// Textures come from js/arcade-art.js. Flow:
//
//   arcade button → NuggetArcade.enter() → rainy-street intro, doors open →
//   walk the hall → activate a cabinet → camera zooms into its CRT →
//   the real minigame launches through the existing storm engine →
//   Stop (or storm complete) → window.onStormExit → back in the hall.
//
// The hall lives at z ∈ [-24, 0] (doors at z=0, deluxe Knight cabinet on the
// back wall), the rainy sidewalk at z > 0. +y is up, eye height 1.62.

const NuggetArcade = (() => {
  const EYE = 1.62;
  const FOV = (62 * Math.PI) / 180;
  const FOG = [0.023, 0.016, 0.04];
  const FOG_DENSITY = 0.04;
  // room shell: |x| < RX, RZB < z < 0 (doors at z=0), ceiling at RCH
  const RX = 7.5, RZB = -20, RCH = 4.2;

  // Cabinet placement: [mode, x, z, yaw]. Yaw 0 faces +z (toward the doors).
  // Knight is the crowd favorite, so it gets the deluxe spot on the back wall.
  const PLACEMENT = [
    ['blaster', -7.02, -5.5, Math.PI / 2],
    ['flappy', -7.02, -9.5, Math.PI / 2],
    ['dunk', -7.02, -13.5, Math.PI / 2],
    ['catch', 7.02, -5.5, -Math.PI / 2],
    ['run', 7.02, -9.5, -Math.PI / 2],
    ['sim', 7.02, -13.5, -Math.PI / 2],
    ['brawl', -7.0, -16.8, Math.PI / 2], // hides under the drape until revealed
    ['ranch', 7.02, -2.2, -Math.PI / 2], // front of the right wall, ahead of Catch
    ['knight', 0, -18.7, 0],
  ];

  // Battered Brawlers ships under the sheet: three pokes and it's yours forever.
  let brawlRevealed = false;
  try { brawlRevealed = localStorage.getItem('nugBrawlRevealed') === '1'; } catch (e) { /* ok */ }

  const H = {
    built: false,
    active: false,
    suspended: false,
    state: 'idle', // idle | intro | walk | auto | zoom | return
    root: null, canvas: null, gl: null,
    prompt: null, hint: null, fade: null, flash: null, skipBtn: null, muteBtn: null,
    t: 0, last: 0, raf: null, introT: 0,
    cam: { x: 0, y: EYE, z: 6.4, yaw: 0, pitch: 0 },
    keys: {},
    drag: null,
    bob: 0,
    doorsOpen: 0, // 0..1
    auto: null,   // { x, z, cab, launch }
    zoomAnim: null,
    promptTarget: null,
    lastCab: null,
    returnT: -1,
    best: {},
    screens: [], cabinets: [], glows: [], decalCount: 0,
    dust: [], rain: [],
    attractIdx: 0,
    isTouch: 'ontouchstart' in window,
    // iteration 2: interactive props
    hotspots: [],           // walk-up interactables that aren't cabinets
    propBoxes: [],          // extra collision boxes (vending machine, etc.)
    sparks: [],             // golden-nug celebration particles
    toast: null,            // { text, until } — transient prompt override
    lb: { data: {}, at: 0 },// cached leaderboard rows per game
    lbTimer: 0,
    mystery: { wiggle: 0, pokes: 0, pos: null },
    reveal: null, // { t } while the drape drops off the brawl cabinet
    // iteration 3: the street out front
    dialog: null,           // { npc, nodes, key, typed, doneTyping } while chatting
    dlg: null, dlgName: null, dlgText: null, dlgOpts: null, dlgHint: null,
    wentOutside: false,     // first-steps-outside toast fired this session
    stepAcc: 0,             // footstep distance accumulator
    prevZ: 99,
    lastChime: -9,
  };

  // True while any page modal (leaderboards, sign-in) covers the hall.
  function modalOpen() {
    return !!document.querySelector('.modal-overlay.active');
  }

  // ---- tiny mat4 (column-major) -------------------------------------------------

  function mIdent() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function mMul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  }
  function mTrans(x, y, z) {
    const m = mIdent();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }
  function mRotY(a) {
    const m = mIdent(), c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  }
  function mRotX(a) {
    const m = mIdent(), c = Math.cos(a), s = Math.sin(a);
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  }
  function mScale(x, y, z) {
    const m = mIdent();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  }
  function mPersp(fovy, aspect, near, far) {
    const m = new Float32Array(16), f = 1 / Math.tan(fovy / 2);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) / (near - far); m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }
  function camFwd(yaw, pitch) {
    const cp = Math.cos(pitch);
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  // ---- shaders --------------------------------------------------------------------

  const VS_LIT = `
attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUV; attribute vec2 aExtra;
uniform mat4 uProj, uView, uModel;
varying vec3 vWorld, vNormal; varying vec2 vUV, vExtra;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV; vExtra = aExtra;
  gl_Position = uProj * uView * w;
}`;

  const FS_LIT = `
precision mediump float;
varying vec3 vWorld, vNormal; varying vec2 vUV, vExtra;
uniform sampler2D uTex;
uniform vec3 uLightPos[8]; uniform vec3 uLightColor[8];
uniform vec3 uAmbient, uFogColor, uCamPos;
uniform float uFogDensity, uAlpha, uMirror, uBoost;
void main() {
  vec4 tex = texture2D(uTex, vUV);
  vec3 n = normalize(vNormal);
  vec3 light = uAmbient;
  for (int i = 0; i < 8; i++) {
    vec3 d = uLightPos[i] - vWorld;
    float dist = length(d);
    float att = 1.0 / (1.0 + 0.13 * dist + 0.026 * dist * dist);
    light += uLightColor[i] * max(dot(n, d / max(dist, 0.001)), 0.0) * att;
  }
  float e = clamp(vExtra.x * uBoost, 0.0, 1.0);
  vec3 col = tex.rgb * mix(light, vec3(1.45), e) * vExtra.y;
  float fog = clamp(1.0 - exp(-uFogDensity * distance(uCamPos, vWorld)), 0.0, 1.0);
  col = mix(col, uFogColor, fog * (1.0 - 0.7 * e)); // lit signage punches through fog
  gl_FragColor = vec4(col * uMirror, tex.a * uAlpha);
}`;

  const VS_SPR = `
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aColor;
uniform mat4 uProj, uView;
varying vec2 vUV; varying vec4 vColor;
void main() {
  vUV = aUV; vColor = aColor;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

  const FS_SPR = `
precision mediump float;
varying vec2 vUV; varying vec4 vColor;
uniform sampler2D uTex;
void main() {
  // additive pass uses blend(ONE, ONE): bake color × intensity into rgb
  float t = texture2D(uTex, vUV).a;
  gl_FragColor = vec4(vColor.rgb * vColor.a * t, 1.0);
}`;

  function makeProgram(gl, vsSrc, fsSrc) {
    function sh(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function makeTexture(gl, source, { mips = true } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mips) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return t;
  }

  // ---- mesh builder -----------------------------------------------------------------
  // Interleaved: pos(3) normal(3) uv(2) extra(2: emissive, brightness) = 10 floats.

  function Builder() {
    this.v = [];
    this.i = [];
    this.n = 0;
    this.tf = null; // optional point transform applied while building (cabinets)
  }
  Builder.prototype.quadV = function (pts, uvs, opts = {}) {
    const e = opts.e || 0, tint = opts.tint == null ? 1 : opts.tint;
    const p = pts.map((q) => (this.tf ? this.tf(q) : q));
    const ab = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const ad = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
    let nx = ab[1] * ad[2] - ab[2] * ad[1];
    let ny = ab[2] * ad[0] - ab[0] * ad[2];
    let nz = ab[0] * ad[1] - ab[1] * ad[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let k = 0; k < 4; k++)
      this.v.push(p[k][0], p[k][1], p[k][2], nx, ny, nz, uvs[k][0], uvs[k][1], e, tint);
    this.i.push(this.n, this.n + 1, this.n + 2, this.n, this.n + 2, this.n + 3);
    this.n += 4;
    return p;
  };
  // a=bottom-left, b=bottom-right, c=top-right, d=top-left as seen from the front.
  Builder.prototype.quad = function (a, b, c, d, uv, opts) {
    return this.quadV(
      [a, b, c, d],
      [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]],
      opts
    );
  };
  Builder.prototype.upload = function (gl) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.v), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.i), gl.STATIC_DRAW);
    return { vbo, ibo, count: this.i.length };
  };

  // Sub-rect of a uv region: fx0..fx1 across, fy0..fy1 down (0=top of region).
  function sub(uv, fx0, fy0, fx1, fy1) {
    const du = uv[2] - uv[0], dv = uv[3] - uv[1];
    return [uv[0] + du * fx0, uv[1] + dv * fy0, uv[0] + du * fx1, uv[1] + dv * fy1];
  }

  // Wall at constant x, tiled. Order z1→z2 sets the normal (see callers).
  function wallX(B, x, z1, z2, y0, y1, uv, tw, th, opts) {
    const dir = Math.sign(z2 - z1), len = Math.abs(z2 - z1);
    for (let zo = 0; zo < len; zo += tw) {
      const seg = Math.min(tw, len - zo);
      for (let yo = y0; yo < y1; yo += th) {
        const hSeg = Math.min(th, y1 - yo);
        const za = z1 + dir * zo, zb = z1 + dir * (zo + seg);
        B.quad(
          [x, yo, za], [x, yo, zb], [x, yo + hSeg, zb], [x, yo + hSeg, za],
          sub(uv, 0, 1 - hSeg / th, seg / tw, 1), opts
        );
      }
    }
  }
  // Wall at constant z, tiled. Order x1→x2 sets the normal.
  function wallZ(B, z, x1, x2, y0, y1, uv, tw, th, opts) {
    const dir = Math.sign(x2 - x1), len = Math.abs(x2 - x1);
    for (let xo = 0; xo < len; xo += tw) {
      const seg = Math.min(tw, len - xo);
      for (let yo = y0; yo < y1; yo += th) {
        const hSeg = Math.min(th, y1 - yo);
        const xa = x1 + dir * xo, xb = x1 + dir * (xo + seg);
        B.quad(
          [xa, yo, z], [xb, yo, z], [xb, yo + hSeg, z], [xa, yo + hSeg, z],
          sub(uv, 0, 1 - hSeg / th, seg / tw, 1), opts
        );
      }
    }
  }
  // Horizontal plane grid. flip=false → faces up (floor), true → faces down.
  function planeY(B, y, x0, x1, z0, z1, uv, tile, flip, opts) {
    for (let x = x0; x < x1; x += tile) {
      const w = Math.min(tile, x1 - x);
      for (let z = z0; z < z1; z += tile) {
        const d = Math.min(tile, z1 - z);
        const r = sub(uv, 0, 0, w / tile, d / tile);
        if (!flip)
          B.quad([x, y, z + d], [x + w, y, z + d], [x + w, y, z], [x, y, z], r, opts);
        else
          B.quad([x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d], r, opts);
      }
    }
  }

  // ---- cabinet construction ----------------------------------------------------------

  // Side view profile as [y, zFront] pairs (local: +z toward the player).
  const PROF = [
    [0.0, 0.34],   // floor
    [1.02, 0.34],  // lower front (coin door)
    [1.12, 0.46],  // deck lip
    [1.2, 0.14],   // control panel (slanted top)
    [1.68, 0.02],  // screen face (leans back)
    [1.94, 0.16],  // marquee (leans forward)
  ];
  const CAB_ZB = -0.42;

  function buildCabinet(B, uv, game, px, pz, yaw, sw, sh, sd) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    B.tf = (p) => [p[0] * c + p[2] * s + px, p[1], -p[0] * s + p[2] * c + pz];
    const W = 0.92 * sw, hw = W / 2, HH = 1.94 * sh, zb = CAB_ZB * sd;
    const prof = PROF.map(([y, z]) => [y * sh, z * sd]);
    const zMax = 0.46 * sd;
    const segUV = [
      ['cabFront', 0], ['metal', 0], ['panel_' + game.mode, 0.15],
      ['bezel', 0], ['marq_' + game.mode, 0.72], // marquee lit but not blown out
    ];
    let screenPts = null;
    for (let i = 0; i < 5; i++) {
      const [y1, z1] = prof[i], [y2, z2] = prof[i + 1];
      const [name, em] = segUV[i];
      B.quad(
        [-hw, y1, z1], [hw, y1, z1], [hw, y2, z2], [-hw, y2, z2],
        uv[name], { e: em }
      );
      if (i === 3) {
        // The CRT: inset quad floating a hair in front of the bezel face.
        const t1 = 0.1, t2 = 0.9, inx = hw * 0.8;
        // face normal (local): perpendicular to the profile segment
        let ny = -(z2 - z1), nz = y2 - y1;
        const nl = Math.hypot(ny, nz);
        ny /= nl; nz /= nl;
        const off = 0.012;
        const pt = (tt, xx) => [
          xx,
          y1 + (y2 - y1) * tt + ny * off,
          z1 + (z2 - z1) * tt + nz * off,
        ];
        screenPts = [pt(t1, -inx), pt(t1, inx), pt(t2, inx), pt(t2, -inx)].map(B.tf);
      }
    }
    // top cap, back, underside skipped (never visible)
    B.quad([-hw, HH, prof[5][1]], [hw, HH, prof[5][1]], [hw, HH, zb], [-hw, HH, zb], uv.dark, {});
    B.quad([hw, 0, zb], [-hw, 0, zb], [-hw, HH, zb], [hw, HH, zb], uv.dark, {});
    // sides: one trapezoid per profile segment, from the back plane to the profile
    const sideUV = uv['side_' + game.mode];
    const su = (z) => sideUV[0] + ((z - zb) / (zMax - zb)) * (sideUV[2] - sideUV[0]);
    const sv = (y) => sideUV[3] - (y / HH) * (sideUV[3] - sideUV[1]);
    for (let i = 0; i < 5; i++) {
      const [y1, z1] = prof[i], [y2, z2] = prof[i + 1];
      B.quadV(
        [[-hw, y1, zb], [-hw, y1, z1], [-hw, y2, z2], [-hw, y2, zb]],
        [[su(zb), sv(y1)], [su(z1), sv(y1)], [su(z2), sv(y2)], [su(zb), sv(y2)]], {}
      );
      B.quadV(
        [[hw, y1, z1], [hw, y1, zb], [hw, y2, zb], [hw, y2, z2]],
        [[su(z1), sv(y1)], [su(zb), sv(y1)], [su(zb), sv(y2)], [su(z2), sv(y2)]], {}
      );
    }
    // top edge of the marquee cap glow strip
    B.tf = null;

    // world-space metadata for interaction, zoom target, and reflections
    const cx4 = screenPts.reduce((a, p) => a + p[0], 0) / 4;
    const cy4 = screenPts.reduce((a, p) => a + p[1], 0) / 4;
    const cz4 = screenPts.reduce((a, p) => a + p[2], 0) / 4;
    const fwd = [Math.sin(yaw), 0, Math.cos(yaw)]; // cabinet facing
    // screen normal from the quad
    const e1 = [screenPts[1][0] - screenPts[0][0], screenPts[1][1] - screenPts[0][1], screenPts[1][2] - screenPts[0][2]];
    const e2 = [screenPts[3][0] - screenPts[0][0], screenPts[3][1] - screenPts[0][1], screenPts[3][2] - screenPts[0][2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    // world AABB from the rotated footprint
    const corners = [
      [-hw - 0.1, zb - 0.05], [hw + 0.1, zb - 0.05],
      [-hw - 0.1, zMax + 0.1], [hw + 0.1, zMax + 0.1],
    ].map(([x, z]) => [x * c + z * s + px, -x * s + z * c + pz]);
    const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
    const cab = {
      game, x: px, z: pz, yaw, fwd, h: HH,
      min: [Math.min(...xs), 0, Math.min(...zs)],
      max: [Math.max(...xs), HH + 0.02, Math.max(...zs)],
      screen: { pts: screenPts, center: [cx4, cy4, cz4], normal: [nx, ny, nz] },
      stand: [px + fwd[0] * 1.55, EYE, pz + fwd[2] * 1.55],
      marquee: [px + fwd[0] * 0.35, 1.82 * sh, pz + fwd[2] * 0.35],
    };
    H.cabinets.push(cab);
    return cab;
  }

  // ---- scene ---------------------------------------------------------------------------

  function buildScene(gl, uv) {
    const B = new Builder();      // static, atlas-textured
    const F = new Builder();      // floor (drawn semi-transparent over reflections)
    const SGN = new Builder();    // neon signs (flicker via uBoost)
    const DL = new Builder(), DR = new Builder(); // door leaves
    const DEC = new Builder();    // dark contact-shadow decals
    const SCR = new Builder();    // all cabinet screens (one quad each)
    const SB = new Builder();     // live leaderboard scoreboard (own texture)
    const DM = new Builder();     // draped mystery cabinet (own model matrix — it wiggles)
    const DISCO = new Builder();  // mirror ball (own model matrix — it spins)
    const FLORA = new Builder();  // alpha-blended extras (the golden nug)

    const X = RX, ZB = RZB, CH = RCH;

    // interior floor + exterior sidewalk (both reflective via the mirror pass)
    planeY(F, 0, -X, X, ZB, 0, uv.carpet, 2.125, false, {});
    planeY(F, 0, -11, 11, 0, 8, uv.sidewalk, 2.2, false, { tint: 0.9 });

    // ceiling
    planeY(B, CH, -X, X, ZB, 0, uv.ceiling, 2.125, true, { tint: 0.85 });

    // interior walls: wainscot below, panels above. Winding picked per wall so
    // normals face into the room (see wallX/wallZ).
    wallX(B, -X, 0, ZB, 0, 1.05, uv.wainscot, 2.125, 1.05, {});   // west → +x
    wallX(B, -X, 0, ZB, 1.05, CH, uv.wall, 2.125, 3.15, {});
    wallX(B, X, ZB, 0, 0, 1.05, uv.wainscot, 2.125, 1.05, {});    // east → -x
    wallX(B, X, ZB, 0, 1.05, CH, uv.wall, 2.125, 3.15, {});
    wallZ(B, ZB, -X, X, 0, 1.05, uv.wainscot, 2.125, 1.05, {});   // north → +z
    wallZ(B, ZB, -X, X, 1.05, CH, uv.wall, 2.125, 3.15, {});
    // south (entrance) wall interior: pieces around the doorway → -z (x descending)
    wallZ(B, 0, -1.25, -X, 0, 1.05, uv.wainscot, 2.125, 1.05, {});
    wallZ(B, 0, -1.25, -X, 1.05, CH, uv.wall, 2.125, 3.15, {});
    wallZ(B, 0, X, 1.25, 0, 1.05, uv.wainscot, 2.125, 1.05, {});
    wallZ(B, 0, X, 1.25, 1.05, CH, uv.wall, 2.125, 3.15, {});
    wallZ(B, 0, 1.25, -1.25, 2.6, CH, uv.wall, 2.5, 1.6, {});

    // exterior facade (brick) around the doorway → +z (x ascending)
    wallZ(B, 0, -11, -1.25, 0, 5, uv.brick, 2.2, 2.2, {});
    wallZ(B, 0, 1.25, 11, 0, 5, uv.brick, 2.2, 2.2, {});
    wallZ(B, 0, -1.25, 1.25, 2.6, 5, uv.brick, 2.5, 2.4, {});
    // doorway jambs
    wallX(B, -1.25, 0.12, -0.12, 0, 2.6, uv.dark, 0.3, 2.6, {});
    wallX(B, 1.25, -0.12, 0.12, 0, 2.6, uv.dark, 0.3, 2.6, {});
    wallZ(B, -0.12, -1.25, 1.25, 2.6, 2.72, uv.dark, 2.5, 0.2, {});

    // neon trim strips (emissive) along the side + back walls
    const strip = (bld, name) => {
      wallX(bld, -X + 0.03, -0.4, ZB + 0.4, 3.26, 3.34, uv['sw_' + name], 24, 0.1, { e: 1 });
      wallX(bld, X - 0.03, ZB + 0.4, -0.4, 3.26, 3.34, uv['sw_' + name], 24, 0.1, { e: 1 });
      wallZ(bld, ZB + 0.03, -X + 0.4, X - 0.4, 3.26, 3.34, uv.sw_magenta, 17, 0.1, { e: 1 });
    };
    strip(B, 'cyan');

    // ceiling light tubes
    for (const tz of [-4, -9, -14, -17.7]) {
      const y0 = 4.04, y1 = 4.14, x0 = -3, x1 = 3;
      B.quad([x0, y0, tz - 0.07], [x1, y0, tz - 0.07], [x1, y0, tz + 0.07], [x0, y0, tz + 0.07], uv.sw_tube, { e: 1 }); // underside
      B.quad([x0, y0, tz + 0.07], [x1, y0, tz + 0.07], [x1, y1, tz + 0.07], [x0, y1, tz + 0.07], uv.sw_tube, { e: 1 });
      B.quad([x1, y0, tz - 0.07], [x0, y0, tz - 0.07], [x0, y1, tz - 0.07], [x1, y1, tz - 0.07], uv.sw_tube, { e: 1 });
      for (let gx = -2.4; gx <= 2.4; gx += 1.2)
        H.glows.push({ p: [gx, 4.0, tz], c: [0.62, 0.72, 1], s: 0.9, a: 0.16, k: 'tube' });
    }

    // posters + wall neon
    const poster = (name, wallSide, z, y = 1.55, h = 1.4) => {
      const w = h * 0.667, x = wallSide < 0 ? -X + 0.02 : X - 0.02;
      const z1 = wallSide < 0 ? z + w / 2 : z - w / 2;
      const z2 = wallSide < 0 ? z - w / 2 : z + w / 2;
      B.quad([x, y, z1], [x, y, z2], [x, y + h, z2], [x, y + h, z1], uv[name], { tint: 1.05 });
    };
    poster('posterGolden', -1, -7.5);
    poster('posterBrawl', -1, -11.5);
    poster('posterKnight', 1, -7.5);
    poster('posterPlay', 1, -11.5);
    // back-wall flankers for the Knight throne
    B.quad([-4.4, 1.4, ZB + 0.02], [-3.4, 1.4, ZB + 0.02], [-3.4, 2.9, ZB + 0.02], [-4.4, 2.9, ZB + 0.02], uv.posterKnight, {});
    B.quad([3.4, 1.4, ZB + 0.02], [4.4, 1.4, ZB + 0.02], [4.4, 2.9, ZB + 0.02], [3.4, 2.9, ZB + 0.02], uv.posterGolden, {});

    // wall neon phrases
    SGN.quadV(
      [[-X + 0.03, 2.5, -14.2], [-X + 0.03, 2.5, -17.4], [-X + 0.03, 3.3, -17.4], [-X + 0.03, 3.3, -14.2]],
      [[uv.phrase[0], uv.phrase[3]], [uv.phrase[2], uv.phrase[3]], [uv.phrase[2], uv.phrase[1]], [uv.phrase[0], uv.phrase[1]]],
      { e: 1 }
    );
    // "★ HIGH SCORES ★" neon crowning the live scoreboard below it
    SGN.quadV(
      [[X - 0.03, 3.42, -17.0], [X - 0.03, 3.42, -14.6], [X - 0.03, 4.02, -14.6], [X - 0.03, 4.02, -17.0]],
      [[uv.highscores[0], uv.highscores[3]], [uv.highscores[2], uv.highscores[3]], [uv.highscores[2], uv.highscores[1]], [uv.highscores[0], uv.highscores[1]]],
      { e: 1 }
    );
    H.glows.push({ p: [-X + 0.2, 2.9, -15.8], c: [1, 0.18, 0.63], s: 1.6, a: 0.14, k: 'neon' });
    H.glows.push({ p: [X - 0.2, 3.7, -15.8], c: [0.22, 1, 0.48], s: 1.6, a: 0.14, k: 'neon' });

    // ---- the live scoreboard (east wall): dark frame + a screen fed by the API
    {
      const bx = X - 0.08, z1 = -14.2, z2 = -17.4, y1 = 1.7, y2 = 3.3;
      // backing frame slab (east wall normal is -x → z ascending order... board
      // faces -x, so wind z1(front-left as seen) descending like the east wall)
      // east wall faces -x → wind z ascending (z2 is the viewer's left)
      B.quad([bx + 0.02, y1 - 0.12, z2 - 0.12], [bx + 0.02, y1 - 0.12, z1 + 0.12],
        [bx + 0.02, y2 + 0.12, z1 + 0.12], [bx + 0.02, y2 + 0.12, z2 - 0.12], uv.dark, { tint: 0.7 });
      SB.quadV(
        [[bx, y1, z2], [bx, y1, z1], [bx, y2, z1], [bx, y2, z2]],
        [[0, 1], [1, 1], [1, 0], [0, 0]],
        { e: 0.85 }
      );
      H.glows.push({ p: [bx - 0.25, (y1 + y2) / 2, (z1 + z2) / 2], c: [0.25, 1, 0.5], s: 1.7, a: 0.1, k: 'neon' });
      H.hotspots.push({
        kind: 'board',
        x: bx, z: (z1 + z2) / 2, r: 3.0,
        min: [bx - 0.1, y1 - 0.2, z2], max: [X, y2 + 0.2, z1],
        stand: [bx - 1.6, EYE, (z1 + z2) / 2],
        label: 'VIEW FULL LEADERBOARDS',
        act: () => {
          const btn = document.getElementById('openLeaderboards');
          if (btn) { btn.click(); sfxBoop(880); }
        },
      });
    }

    // ---- the draped mystery cabinet (west wall, next to the phrase sign)
    {
      const mx = -7.0, mz = -16.8, myaw = Math.PI / 2;
      H.mystery.pos = [mx, mz, myaw];
      // local geometry (origin at floor center, +z is its front) — the drape
      // hangs over a lower slab and a smaller head block, like a covered cab
      const boxes = [
        [0.55, 0, 1.55, 0.47],   // halfW, y0, y1, halfD — body
        [0.47, 1.55, 2.02, 0.38] // head
      ];
      for (const [hw2, y0, y1b, hd] of boxes) {
        DM.quad([-hw2, y0, hd], [hw2, y0, hd], [hw2, y1b, hd], [-hw2, y1b, hd], sub(uv.drape, 0.05, 0.08, 0.95, 0.95), {});
        DM.quad([hw2, y0, -hd], [-hw2, y0, -hd], [-hw2, y1b, -hd], [hw2, y1b, -hd], sub(uv.drape, 0.1, 0.2, 0.9, 0.95), {});
        DM.quad([-hw2, y0, -hd], [-hw2, y0, hd], [-hw2, y1b, hd], [-hw2, y1b, -hd], sub(uv.drape, 0.15, 0.1, 0.85, 0.95), {});
        DM.quad([hw2, y0, hd], [hw2, y0, -hd], [hw2, y1b, -hd], [hw2, y1b, hd], sub(uv.drape, 0.12, 0.12, 0.88, 0.95), {});
        DM.quad([-hw2, y1b, hd], [hw2, y1b, hd], [hw2, y1b, -hd], [-hw2, y1b, -hd], sub(uv.drape, 0.2, 0.02, 0.8, 0.25), {});
      }
      DEC.quad(
        [mx - 0.75, 0.006, mz + 0.75], [mx + 0.75, 0.006, mz + 0.75],
        [mx + 0.75, 0.006, mz - 0.75], [mx - 0.75, 0.006, mz - 0.75],
        uv.sw_black, { e: 1 }
      );
      if (!brawlRevealed) {
        H.hotspots.push({
          kind: 'mystery',
          x: mx, z: mz, r: 2.4,
          min: [mx - 0.62, 0, mz - 0.62], max: [mx + 0.62, 2.1, mz + 0.62],
          stand: [mx + 1.5, EYE, mz],
          label: "WHAT'S UNDER THE SHEET?",
          act: pokeMystery,
        });
      }
    }

    // ---- entrance zone --------------------------------------------------------

    // Free-standing box against the south wall, front facing -z into the hall.
    // Windings follow the wall rules: front x-descending, sides z-asc/desc, top +y.
    function boxProp(x, z, hw2, hd, hgt, frontUV, frontE) {
      B.quad([x + hw2, 0, z - hd], [x - hw2, 0, z - hd], [x - hw2, hgt, z - hd], [x + hw2, hgt, z - hd], frontUV, { e: frontE });
      B.quad([x - hw2, 0, z - hd], [x - hw2, 0, z + hd], [x - hw2, hgt, z + hd], [x - hw2, hgt, z - hd], uv.dark, {});
      B.quad([x + hw2, 0, z + hd], [x + hw2, 0, z - hd], [x + hw2, hgt, z - hd], [x + hw2, hgt, z + hd], uv.dark, {});
      B.quad([x - hw2, hgt, z + hd], [x + hw2, hgt, z + hd], [x + hw2, hgt, z - hd], [x - hw2, hgt, z - hd], uv.dark, {});
    }

    // SAUCE-O-MATIC vending machine (right of the doors, facing the hall)
    {
      const vx = 3.1, vz = -0.55, hw2 = 0.5, hd = 0.33, vh = 1.9;
      boxProp(vx, vz, hw2, hd, vh, uv.vending, 0.35);
      DEC.quad([vx - 0.7, 0.006, vz + 0.5], [vx + 0.7, 0.006, vz + 0.5], [vx + 0.7, 0.006, vz - 0.5], [vx - 0.7, 0.006, vz - 0.5], uv.sw_black, { e: 1 });
      H.glows.push({ p: [vx, 1.2, vz - 0.5], c: [1, 0.35, 0.2], s: 1.1, a: 0.13, k: 'neon' });
      H.propBoxes.push({ min: [vx - 0.6, 0, vz - 0.45], max: [vx + 0.6, vh, vz + 0.45] });

      // the golden nug perched on top (crossed alpha quads + a secret hotspot)
      const ny = vh + 0.11, ns = 0.13;
      FLORA.quad([vx - ns, ny - ns, vz], [vx + ns, ny - ns, vz], [vx + ns, ny + ns, vz], [vx - ns, ny + ns, vz], uv.nugGold, { e: 0.35, tint: 1.2 });
      FLORA.quad([vx, ny - ns, vz + ns], [vx, ny - ns, vz - ns], [vx, ny + ns, vz - ns], [vx, ny + ns, vz + ns], uv.nugGold, { e: 0.35, tint: 1.2 });
      H.hotspots.push({
        kind: 'nug',
        x: vx, z: vz, r: 2.3,
        min: [vx - 0.2, vh - 0.05, vz - 0.2], max: [vx + 0.2, vh + 0.3, vz + 0.2],
        stand: [vx, EYE, vz - 1.3],
        label: 'A GOLDEN NUG?!',
        act: () => foundGoldenNug(vx, ny, vz),
      });
    }

    // change machine (left of the doors) — free play forever
    {
      const cx2 = -3.0, cz = -0.5;
      boxProp(cx2, cz, 0.3, 0.24, 1.5, uv.change, 0.1);
      H.propBoxes.push({ min: [cx2 - 0.4, 0, cz - 0.35], max: [cx2 + 0.4, 1.5, cz + 0.35] });
    }

    // velvet ropes guiding you in from the doors (decor — you can step over)
    for (const side of [-1, 1]) {
      const posts = [[side * 2.0, -0.8], [side * 2.6, -2.3]];
      for (const [pxp, pzp] of posts) {
        B.quad([pxp - 0.035, 0, pzp + 0.035], [pxp + 0.035, 0, pzp + 0.035], [pxp + 0.035, 0.95, pzp + 0.035], [pxp - 0.035, 0.95, pzp + 0.035], uv.metal, { tint: 0.9 });
        B.quad([pxp + 0.035, 0, pzp - 0.035], [pxp - 0.035, 0, pzp - 0.035], [pxp - 0.035, 0.95, pzp - 0.035], [pxp + 0.035, 0.95, pzp - 0.035], uv.metal, { tint: 0.9 });
        B.quad([pxp - 0.035, 0, pzp - 0.035], [pxp - 0.035, 0, pzp + 0.035], [pxp - 0.035, 0.95, pzp + 0.035], [pxp - 0.035, 0.95, pzp - 0.035], uv.metal, { tint: 0.9 });
        B.quad([pxp + 0.035, 0, pzp + 0.035], [pxp + 0.035, 0, pzp - 0.035], [pxp + 0.035, 0.95, pzp - 0.035], [pxp + 0.035, 0.95, pzp + 0.035], uv.metal, { tint: 0.9 });
        // amber ball cap
        B.quad([pxp - 0.05, 0.95, pzp + 0.05], [pxp + 0.05, 0.95, pzp + 0.05], [pxp + 0.05, 1.05, pzp], [pxp - 0.05, 1.05, pzp], uv.sw_amber, { e: 0.55 });
        B.quad([pxp + 0.05, 0.95, pzp - 0.05], [pxp - 0.05, 0.95, pzp - 0.05], [pxp - 0.05, 1.05, pzp], [pxp + 0.05, 1.05, pzp], uv.sw_amber, { e: 0.55 });
      }
      // sagging rope between the two posts (thin double-sided ribbon)
      const [a, b] = posts;
      for (let s = 0; s < 6; s++) {
        const t0 = s / 6, t1 = (s + 1) / 6;
        const sag = (tt) => 0.93 - Math.sin(tt * Math.PI) * 0.16;
        const p0 = [a[0] + (b[0] - a[0]) * t0, sag(t0), a[1] + (b[1] - a[1]) * t0];
        const p1 = [a[0] + (b[0] - a[0]) * t1, sag(t1), a[1] + (b[1] - a[1]) * t1];
        B.quad([p0[0], p0[1] - 0.022, p0[2]], [p1[0], p1[1] - 0.022, p1[2]], [p1[0], p1[1] + 0.022, p1[2]], [p0[0], p0[1] + 0.022, p0[2]], uv.sw_rope, { e: 0.2, tint: 0.95 });
        B.quad([p1[0], p1[1] - 0.022, p1[2]], [p0[0], p0[1] - 0.022, p0[2]], [p0[0], p0[1] + 0.022, p0[2]], [p1[0], p1[1] + 0.022, p1[2]], uv.sw_rope, { e: 0.2, tint: 0.95 });
      }
    }

    // mirror ball over the entrance (own buffer — it spins)
    {
      const R = 0.34, STACKS = 6, SLICES = 9;
      for (let i = 0; i < STACKS; i++) {
        const ph0 = (i / STACKS) * Math.PI, ph1 = ((i + 1) / STACKS) * Math.PI;
        for (let j = 0; j < SLICES; j++) {
          const th0 = (j / SLICES) * Math.PI * 2, th1 = ((j + 1) / SLICES) * Math.PI * 2;
          const P = (ph, th) => [Math.sin(ph) * Math.cos(th) * R, Math.cos(ph) * R, Math.sin(ph) * Math.sin(th) * R];
          DISCO.quad(P(ph1, th0), P(ph1, th1), P(ph0, th1), P(ph0, th0),
            sub(uv.metal, (j % 3) * 0.3, (i % 3) * 0.3, (j % 3) * 0.3 + 0.25, (i % 3) * 0.3 + 0.25),
            { e: 0.3, tint: 1.25 });
        }
      }
      // hanging rod
      B.quad([-0.015, 3.86, -2.6], [0.015, 3.86, -2.6], [0.015, RCH, -2.6], [-0.015, RCH, -2.6], uv.dark, {});
      B.quad([0.015, 3.86, -2.61], [-0.015, 3.86, -2.61], [-0.015, RCH, -2.61], [0.015, RCH, -2.61], uv.dark, {});
      H.glows.push({ p: [0, 3.52, -2.6], c: [0.8, 0.85, 1], s: 0.8, a: 0.14, k: 'tube' });
    }

    // exterior windows: OPEN 24/7 neon on the right, dark glass on the left
    for (const side of [-1, 1]) {
      const wx1 = side * 2.9, wx2 = side * 4.9;
      const xa = Math.min(wx1, wx2), xb = Math.max(wx1, wx2);
      B.quad([xa, 1.45, 0.03], [xb, 1.45, 0.03], [xb, 2.65, 0.03], [xa, 2.65, 0.03], uv.sw_glass, { tint: 1.1 });
      // frame
      for (const [fy1, fy2] of [[1.38, 1.45], [2.65, 2.72]])
        B.quad([xa - 0.07, fy1, 0.035], [xb + 0.07, fy1, 0.035], [xb + 0.07, fy2, 0.035], [xa - 0.07, fy2, 0.035], uv.metal, { tint: 0.8 });
      for (const fx of [xa - 0.07, xb])
        B.quad([fx, 1.45, 0.035], [fx + 0.07, 1.45, 0.035], [fx + 0.07, 2.65, 0.035], [fx, 2.65, 0.035], uv.metal, { tint: 0.8 });
      if (side === 1) {
        SGN.quad([3.05, 1.62, 0.05], [4.75, 1.62, 0.05], [4.75, 2.47, 0.05], [3.05, 2.47, 0.05], uv.open, { e: 1 });
        H.glows.push({ p: [3.9, 2.05, 0.35], c: [1, 0.3, 0.6], s: 1.3, a: 0.16, k: 'sign' });
      } else {
        H.glows.push({ p: [-3.9, 2.0, 0.3], c: [1, 0.7, 0.35], s: 1.0, a: 0.08, k: 'sign' });
      }
    }

    // the big exterior sign + a smaller one inside above the doors
    SGN.quad([-3.4, 2.75, 0.12], [3.4, 2.75, 0.12], [3.4, 4.45, 0.12], [-3.4, 4.45, 0.12], uv.sign, { e: 1 });
    SGN.quad([2.2, 2.72, -0.06], [-2.2, 2.72, -0.06], [-2.2, 3.82, -0.06], [2.2, 3.82, -0.06], uv.sign, { e: 1 });
    for (const gx of [-2.2, 0, 2.2])
      H.glows.push({ p: [gx, 3.6, 0.4], c: [1, 0.75, 0.3], s: 2.4, a: 0.2, k: 'sign' });
    H.glows.push({ p: [0, 3.3, -0.4], c: [1, 0.4, 0.6], s: 1.8, a: 0.12, k: 'sign' });

    // cabinets
    for (const [mode, px, pz, yaw] of PLACEMENT) {
      const game = ArcadeArt.GAMES.find((g) => g.mode === mode);
      const deluxe = mode === 'knight';
      const cab = buildCabinet(
        B, uv, game, px, pz, yaw,
        deluxe ? 1.55 : 1, deluxe ? 1.18 : 1, deluxe ? 1.15 : 1
      );
      if (mode === 'brawl') cab.hidden = !brawlRevealed; // under the sheet until poked free
      // screen quad (own texture per game, uploaded live)
      cab.screenIndex = SCR.i.length; // index offset for its 6 indices
      SCR.quadV(
        [cab.screen.pts[0], cab.screen.pts[1], cab.screen.pts[2], cab.screen.pts[3]],
        [[0, 1], [1, 1], [1, 0], [0, 0]],
        { e: 1 }
      );
      // contact shadow
      const m = cab.min, M = cab.max;
      DEC.quad(
        [m[0] - 0.18, 0.006, M[2] + 0.18], [M[0] + 0.18, 0.006, M[2] + 0.18],
        [M[0] + 0.18, 0.006, m[2] - 0.18], [m[0] - 0.18, 0.006, m[2] - 0.18],
        uv.sw_black, { e: 1 }
      );
      // marquee glow
      const c1 = hexRGB(game.c1);
      H.glows.push({ p: cab.marquee, c: c1, s: deluxe ? 1.7 : 1.1, a: deluxe ? 0.22 : 0.16, k: 'marq' });
      if (deluxe) {
        // torch poles flanking the throne: dark shaft, glowing ember tip
        for (const dx of [-1.45, 1.45]) {
          B.quad(
            [px + dx - 0.045, 0.2, pz + 0.3], [px + dx + 0.045, 0.2, pz + 0.3],
            [px + dx + 0.045, 2.05, pz + 0.3], [px + dx - 0.045, 2.05, pz + 0.3],
            uv.metal, { tint: 0.7 }
          );
          B.quad(
            [px + dx - 0.06, 2.05, pz + 0.3], [px + dx + 0.06, 2.05, pz + 0.3],
            [px + dx + 0.06, 2.28, pz + 0.3], [px + dx - 0.06, 2.28, pz + 0.3],
            uv.sw_amber, { e: 0.9 }
          );
          H.glows.push({ p: [px + dx, 2.2, pz + 0.35], c: [1, 0.55, 0.12], s: 1.1, a: 0.3, k: 'torch' });
        }
      }
    }

    // door leaves (hinges at x=±1.25; geometry local, animated via model matrix)
    for (const [D, x0, x1] of [[DL, 0, 1.2], [DR, -1.2, 0]]) {
      D.quad([x0, 0, 0.03], [x1, 0, 0.03], [x1, 2.6, 0.03], [x0, 2.6, 0.03], uv.door, {});   // outside face
      D.quad([x1, 0, -0.03], [x0, 0, -0.03], [x0, 2.6, -0.03], [x1, 2.6, -0.03], uv.door, {}); // inside face
    }

    // dust motes (inside) + rain (outside)
    for (let i = 0; i < 55; i++)
      H.dust.push({
        x: -6.8 + Math.random() * 13.6, y: 0.3 + Math.random() * 3.4, z: -19 + Math.random() * 18,
        vx: (Math.random() - 0.5) * 0.05, vy: 0.02 + Math.random() * 0.04, vz: (Math.random() - 0.5) * 0.05,
        s: 0.02 + Math.random() * 0.035, ph: Math.random() * 7,
      });
    for (let i = 0; i < 170; i++)
      H.rain.push({
        x: -20 + Math.random() * 40, y: Math.random() * 5, z: 0.3 + Math.random() * 13,
        v: 7 + Math.random() * 4,
      });

    return {
      static: B.upload(gl), floor: F.upload(gl), sign: SGN.upload(gl),
      doorL: DL.upload(gl), doorR: DR.upload(gl),
      decals: DEC.upload(gl), screens: SCR.upload(gl),
      board: SB.upload(gl), mystery: DM.upload(gl),
      disco: DISCO.upload(gl), flora: FLORA.upload(gl),
    };
  }

  // ---- interactive prop behaviors -------------------------------------------------

  function pokeMystery() {
    if (brawlRevealed || H.reveal) return;
    H.mystery.pokes++;
    H.mystery.wiggle = 1;
    sfxThump();
    if (H.mystery.pokes >= 3) { startBrawlReveal(); return; }
    const lines = [
      '🥊 …something jabbed back.',
      '👀 the sheet is coming loose. one more.',
    ];
    toast(lines[Math.min(H.mystery.pokes - 1, lines.length - 1)], 2.6);
  }

  // Third poke: the sheet drops, the cabinet was here the whole time.
  function startBrawlReveal() {
    H.reveal = { t: 0 };
    try { localStorage.setItem('nugBrawlRevealed', '1'); } catch (e) { /* ok */ }
    const [mx, mz] = H.mystery.pos;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.4;
      H.sparks.push({
        x: mx + (Math.random() - 0.5) * 0.9, y: 0.3 + Math.random() * 1.8, z: mz + (Math.random() - 0.5) * 0.9,
        vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 1.8, vz: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.7, max: 1.6,
      });
    }
    sfxFanfare();
    toast('🥊 BATTERED BRAWLERS — NOW SERVING', 3.2);
  }

  function finishBrawlReveal() {
    brawlRevealed = true;
    H.reveal = null;
    const cab = H.cabinets.find((c2) => c2.game.mode === 'brawl');
    if (cab) cab.hidden = false;
    const i = H.hotspots.findIndex((s) => s.kind === 'mystery');
    if (i >= 0) H.hotspots.splice(i, 1);
  }

  // ---- the street out front ---------------------------------------------------------
  // Walk out the doors: Nuggetown after dark. Shops, rain, streetlamps, and a
  // few regulars who'll talk if you will. Textures come from a SECOND atlas
  // (ArcadeArt.makeStreetAtlas) so the nearly-full main page never overflows.

  // The regulars. Each has a spot on the sidewalk and a branching conversation:
  // nodes() is rebuilt per chat so lines can react to what you've done (drape
  // revealed, golden nug found, Brawlers campaign cleared…). opts pick the
  // next node; next:null ends the chat.
  const NPCS = [
    {
      id: 'crumb', name: 'BIG CRUMB', icon: '🕶️', tex: 'npcCrumb',
      x: 2.5, z: 1.2, y0: 0, w: 0.68, h: 1.0, sdx: 0, sdz: 1.25,
      nodes: () => ({
        root: {
          line: "evening. hall's open all night. no outside sauce — house rule.",
          opts: [
            { t: "what's good in there tonight?", next: 'games' },
            { t: 'any secrets I should know about?', next: 'secrets' },
            { t: 'just getting some air.', next: 'air' },
          ],
        },
        games: {
          line: 'the KNIGHT cab gets a line on weekends. three oaths — folks say the third one changes you.',
          opts: [
            { t: 'how do I get the third oath?', next: 'oath3' },
            { t: 'what about the new brawler?', next: 'brawler' },
            { t: 'thanks, Crumb.', next: null },
          ],
        },
        oath3: { line: "survive to wave 8 on the knight's oath. THEN the skull stops being locked. you didn't hear it from me.", opts: [] },
        brawler: { line: 'BATTERED BRAWLERS. proper campaign now — three acts. bring a friend, the cab takes two sets of gloves. and when a big mayo boy guards up? uppercut.', opts: [] },
        secrets: {
          line: !brawlRevealed
            ? "you didn't hear this from me: the sheet in the back corner isn't just a sheet. it moves when you poke it. three pokes, maybe."
            : (!H.nugFound
              ? 'check the top of the sauce-o-matic sometime. something up there catches the light.'
              : "you found the nug AND the brawler cab. you're the secret now."),
          opts: [
            { t: 'my lips are sealed.', next: 'sealed' },
            { t: 'why are you telling me this?', next: 'why' },
          ],
        },
        sealed: { line: '*nods slowly and goes back to watching the rain*', opts: [] },
        why: { line: 'you look like someone who reads the walls. most people just walk past.', opts: [] },
        air: { line: "yeah. rain does the neon good. take your time — I'll hold your high scores.", opts: [] },
      }),
    },
    {
      id: 'gravy', name: 'GRAVY JONES', icon: '🥣', tex: 'npcGravy',
      x: 9.3, z: 0.78, y0: 0.42, w: 0.5, h: 0.62, sdx: 0, sdz: 1.35,
      nodes: () => {
        const cleared = typeof brawlBest === 'function' &&
          ((brawlBest().spicy || {}).clears > 0 || (brawlBest().hell || {}).clears > 0);
        return {
          root: {
            line: '*rain taps his lid* …I used to run with the mustard crowd, y\'know. penthouse security.',
            opts: [
              { t: 'you worked for DIJON?', next: 'dijon' },
              { t: 'why sit out in the rain?', next: 'rain' },
              cleared
                ? { t: "I'm the one who cleared the Sauce Works.", next: 'cleared' }
                : { t: 'take it easy, old timer.', next: 'easy' },
            ],
          },
          dijon: {
            line: 'artisanal contract. no overtime. then some nugget in red gloves came up the stairs and, well. you seen the penthouse lately?',
            opts: [
              { t: 'any advice for fighting cups?', next: 'tips' },
              { t: 'sorry about the job.', next: 'sorry' },
            ],
          },
          tips: { line: "watch for the wind-up sparkle — that's your cue to dodge. the Baron's cane comes out when you crowd him. and never stand in a shockwave lane; step UP or DOWN the belt.", opts: [] },
          sorry: { line: 'don\'t be. the tips were good and the mustard was fresh. it was honest villain work.', opts: [] },
          rain: { line: "cups don't rust, kid. and the neon looks better wet. gravy gets it.", opts: [] },
          cleared: { line: "…so YOU'RE the red gloves. the coop's still finding feathers. she'll remember you, champ. wear it proud.", opts: [] },
          easy: { line: 'easy is all I do now. bench, rain, repeat.', opts: [] },
        };
      },
    },
    {
      id: 'hood', name: 'THE HOODED NUG', icon: '👁️', tex: 'npcHood',
      x: -13.6, z: 1.35, y0: 0, w: 0.66, h: 0.95, sdx: 0, sdz: 1.3,
      nodes: () => ({
        root: {
          line: '*a hooded nugget leans against the garage shutter* you didn\'t see me.',
          opts: [
            { t: "what's with the garage?", next: 'garage' },
            { t: 'heard any rumors?', next: 'rumors' },
            { t: "you're just a weird nugget in a hood.", next: 'weird' },
          ],
        },
        garage: {
          line: "locked for years. but some nights there's an ENGINE idling in there. small one. angry. like a go-kart with opinions.",
          opts: [
            { t: 'go-karts?!', next: 'karts' },
            { t: 'sure, buddy.', next: null },
          ],
        },
        karts: { line: "grease-lightning down Sauce Street, is what I hear. maybe someday the shutter opens. keep your quarters — it'll be free play anyway.", opts: [] },
        rumors: {
          line: 'the harbor nugs say something BIG circles the pier after midnight. bring a rod, if you ever find the pier.',
          opts: [
            { t: 'anything else?', next: 'rumors2' },
            { t: "the pier isn't real.", next: 'pier' },
          ],
        },
        rumors2: { line: "a cup with turntables keeps asking around for a rhythm section. when the beat drops… you'd better drop with it.", opts: [] },
        pier: { line: "that's what they said about the arcade basement. *pause* forget I said basement.", opts: [] },
        weird: { line: "and yet you're the one out here talking to me. *taps hood* think about it.", opts: [] },
      }),
    },
    {
      id: 'hen', name: 'HENRIETTA', icon: '🐔', tex: 'npcHen',
      x: 17.8, z: 2.4, y0: 0, w: 0.58, h: 0.52, sdx: 0, sdz: 1.2,
      nodes: () => {
        const saidIt = typeof brawlHellUnlocked === 'function' && brawlHellUnlocked();
        return {
          root: {
            line: 'bwok. …what? never seen a hen outside an arcade before?',
            opts: [
              { t: 'any relation to… the Mother Clucker?', next: 'clucker' },
              { t: 'what do you think of the ranch game?', next: 'ranch' },
              { t: 'nice night, huh?', next: 'night' },
            ],
          },
          clucker: {
            line: saidIt
              ? "we are ESTRANGED. she went corporate. …word on the street is some nugget walked into her coop and said SEE YOU IN HELL. *slow clap with wings* bwok."
              : 'we are ESTRANGED. she went corporate, started "shipping product." I raise my chicks honest.',
            opts: [
              { t: 'will she come back?', next: 'back' },
              { t: "family's complicated.", next: 'family' },
            ],
          },
          back: { line: 'villains with themes always come back. keep your gloves oiled and bring a friend.', opts: [] },
          family: { line: '*stares into the middle distance* bwok.', opts: [] },
          ranch: { line: 'feed your birds. keep the bin full. ship the GROWN hens, not the chicks. my cousin runs that farm and she is doing FINE, thank you for asking.', opts: [] },
          night: { line: "every night's a nice night when you're not in a nugget box. no offense.", opts: [] },
        };
      },
    },
  ];

  // ---- dialogue engine (DOM panel; movement freezes while it's open) ----------------

  function openDialog(npc) {
    if (H.dialog) return;
    H.dialog = { npc, nodes: npc.nodes(), key: 'root', typed: 0, doneTyping: false, lastShown: -1 };
    H.dlgName.textContent = npc.icon + ' ' + npc.name;
    H.dlgText.textContent = '';
    H.dlgOpts.innerHTML = '';
    H.dlgHint.textContent = '';
    H.dlg.classList.add('on');
    sfxTalk();
  }

  function dialogNode() {
    const d = H.dialog;
    return d && d.nodes[d.key];
  }

  function showDialogNode() {
    const d = H.dialog;
    d.typed = 0;
    d.doneTyping = false;
    d.lastShown = -1;
    H.dlgText.textContent = '';
    H.dlgOpts.innerHTML = '';
    H.dlgHint.textContent = '';
    sfxTalk();
  }

  function stepDialog(dt) {
    const d = H.dialog;
    if (!d || d.doneTyping) return;
    const line = dialogNode().line;
    d.typed = Math.min(line.length, d.typed + dt * 46);
    const n = Math.floor(d.typed);
    if (n !== d.lastShown) {
      d.lastShown = n;
      H.dlgText.textContent = line.slice(0, n);
    }
    if (d.typed >= line.length) {
      d.doneTyping = true;
      showDialogOpts();
    }
  }

  function showDialogOpts() {
    const opts = dialogNode().opts || [];
    if (!opts.length) {
      H.dlgHint.textContent = H.isTouch ? 'TAP — done' : 'ENTER — done';
      return;
    }
    H.dlgHint.textContent = H.isTouch ? 'tap a reply' : 'press 1 · 2 · 3';
    H.dlgOpts.innerHTML = opts.map((o, i) =>
      '<button type="button" data-i="' + i + '"><span class="num">' + (i + 1) + '</span>' + o.t + '</button>').join('');
    for (const b of H.dlgOpts.querySelectorAll('button'))
      b.addEventListener('click', () => chooseDialogOpt(+b.dataset.i));
  }

  function chooseDialogOpt(i) {
    const d = H.dialog;
    if (!d || !d.doneTyping) return;
    const o = (dialogNode().opts || [])[i];
    if (!o) return;
    sfxBoop(700 + i * 90);
    if (o.next && d.nodes[o.next]) {
      d.key = o.next;
      showDialogNode();
    } else closeDialog();
  }

  // Enter/tap: finish the typewriter, or close a node with no replies left.
  function dialogAdvance() {
    const d = H.dialog;
    if (!d) return;
    if (!d.doneTyping) { d.typed = dialogNode().line.length; return; }
    if (!(dialogNode().opts || []).length) closeDialog();
  }

  function closeDialog() {
    if (!H.dialog) return;
    H.dialog = null;
    H.dlg.classList.remove('on');
    sfxBoop(494);
  }

  // ---- street geometry ----------------------------------------------------------------

  function buildStreet(gl, suv) {
    const ST = new Builder(); // opaque street set (own texture page)
    const NP = new Builder(); // NPC cutouts (alpha-blended, gentle bob)

    // block walls: facade extensions flush with the arcade front, side caps,
    // and the far side of the street. Windings follow the interior wall rules.
    wallZ(ST, 0, -21.5, -11, 0, 5, suv.brick, 2.2, 2.2, {});
    wallZ(ST, 0, 11, 21.5, 0, 5, suv.brick, 2.2, 2.2, {});
    wallX(ST, -21.5, 13.9, 0, 0, 6, suv.brick, 2.2, 2.2, {});  // west cap → +x
    wallX(ST, 21.5, 0, 13.9, 0, 6, suv.brick, 2.2, 2.2, {});   // east cap → -x
    wallZ(ST, 13.9, 21.5, -21.5, 0, 5.4, suv.across, 21.5, 5.4, { e: 0.22 }); // faces -z

    // storefronts sit proud of the brick
    const shop = (x0, x1, name, e) =>
      ST.quad([x0, 0, 0.04], [x1, 0, 0.04], [x1, 4.4, 0.04], [x0, 4.4, 0.04], suv[name], { e });
    shop(-21.3, -17.5, 'shopLaundro', 0.3);
    shop(-17.1, -12.1, 'shopGarage', 0.12);
    shop(12.1, 17.1, 'shopNoodle', 0.3);

    // the road + curb (sidewalk itself is the reflective floor plane)
    planeY(ST, 0.004, -21.5, 21.5, 8, 13.9, suv.road, 4.3, false, {});
    wallZ(ST, 8, 21.5, -21.5, 0, 0.09, suv.sw_curb, 4, 0.09, {}); // curb face → -z
    planeY(ST, 0.09, -21.5, 21.5, 7.72, 8.01, suv.sw_curb, 4, false, {});

    // streetlamps down the curb line
    for (const lx of [-15, -5.5, 5, 15]) {
      const lz = 7.3;
      ST.quad([lx - 0.07, 0, lz + 0.07], [lx + 0.07, 0, lz + 0.07], [lx + 0.07, 3.2, lz + 0.07], [lx - 0.07, 3.2, lz + 0.07], suv.sw_iron, { tint: 0.85 });
      ST.quad([lx + 0.07, 0, lz - 0.07], [lx - 0.07, 0, lz - 0.07], [lx - 0.07, 3.2, lz - 0.07], [lx + 0.07, 3.2, lz - 0.07], suv.sw_iron, { tint: 0.85 });
      ST.quad([lx - 0.07, 0, lz - 0.07], [lx - 0.07, 0, lz + 0.07], [lx - 0.07, 3.2, lz + 0.07], [lx - 0.07, 3.2, lz - 0.07], suv.sw_iron, { tint: 0.85 });
      ST.quad([lx + 0.07, 0, lz + 0.07], [lx + 0.07, 0, lz - 0.07], [lx + 0.07, 3.2, lz - 0.07], [lx + 0.07, 3.2, lz + 0.07], suv.sw_iron, { tint: 0.85 });
      // arm reaching over the sidewalk (both faces — it's seen from below too)
      ST.quad([lx - 0.045, 3.14, lz], [lx + 0.045, 3.14, lz], [lx + 0.045, 3.2, lz - 0.6], [lx - 0.045, 3.2, lz - 0.6], suv.sw_iron, { tint: 0.85 });
      ST.quad([lx + 0.045, 3.14, lz], [lx - 0.045, 3.14, lz], [lx - 0.045, 3.2, lz - 0.6], [lx + 0.045, 3.2, lz - 0.6], suv.sw_iron, { tint: 0.85 });
      ST.quad([lx + 0.16, 2.98, lz - 0.72], [lx - 0.16, 2.98, lz - 0.72], [lx - 0.16, 3.12, lz - 0.72], [lx + 0.16, 3.12, lz - 0.72], suv.sw_amber, { e: 1 });
      ST.quad([lx - 0.16, 2.98, lz - 0.42], [lx + 0.16, 2.98, lz - 0.42], [lx + 0.16, 3.12, lz - 0.42], [lx - 0.16, 3.12, lz - 0.42], suv.sw_amber, { e: 1 });
      ST.quad([lx - 0.16, 2.98, lz - 0.72], [lx - 0.16, 2.98, lz - 0.42], [lx - 0.16, 3.12, lz - 0.42], [lx - 0.16, 3.12, lz - 0.72], suv.sw_amber, { e: 1 });
      ST.quad([lx + 0.16, 2.98, lz - 0.42], [lx + 0.16, 2.98, lz - 0.72], [lx + 0.16, 3.12, lz - 0.72], [lx + 0.16, 3.12, lz - 0.42], suv.sw_amber, { e: 1 });
      ST.quad([lx - 0.16, 2.98, lz - 0.72], [lx + 0.16, 2.98, lz - 0.72], [lx + 0.16, 2.98, lz - 0.42], [lx - 0.16, 2.98, lz - 0.42], suv.sw_amber, { e: 1 }); // underside faces down
      H.glows.push({ p: [lx, 3.0, lz - 0.57], c: [1, 0.72, 0.35], s: 1.5, a: 0.2, k: 'sign' });
      H.propBoxes.push({ min: [lx - 0.15, 0, lz - 0.15], max: [lx + 0.15, 3.3, lz + 0.15] });
    }

    // a bench for Gravy (seat + back + legs)
    {
      const bx0 = 8.3, bx1 = 10.3, bz = 0.62;
      planeY(ST, 0.45, bx0, bx1, bz, bz + 0.42, suv.sw_wood, 2.2, false, {});
      ST.quad([bx0, 0.45, bz], [bx1, 0.45, bz], [bx1, 0.95, bz], [bx0, 0.95, bz], suv.sw_wood, { tint: 0.9 });
      ST.quad([bx1, 0.45, bz - 0.02], [bx0, 0.45, bz - 0.02], [bx0, 0.95, bz - 0.02], [bx1, 0.95, bz - 0.02], suv.sw_wood, { tint: 0.75 });
      for (const lx2 of [bx0 + 0.15, bx1 - 0.15]) {
        ST.quad([lx2 - 0.04, 0, bz + 0.42], [lx2 + 0.04, 0, bz + 0.42], [lx2 + 0.04, 0.45, bz + 0.42], [lx2 - 0.04, 0.45, bz + 0.42], suv.sw_woodDark, {});
        ST.quad([lx2 + 0.04, 0, bz + 0.02], [lx2 - 0.04, 0, bz + 0.02], [lx2 - 0.04, 0.45, bz + 0.02], [lx2 + 0.04, 0.45, bz + 0.02], suv.sw_woodDark, {});
      }
      H.propBoxes.push({ min: [bx0, 0, bz - 0.05], max: [bx1, 0.95, bz + 0.5] });
    }

    // hydrant
    {
      const hx = -7.5, hz = 0.95;
      // outward box faces: z+ x-asc, z- x-desc, x- z-asc, x+ z-desc
      for (const [a, b] of [[[hx - 0.14, hz + 0.14], [hx + 0.14, hz + 0.14]], [[hx + 0.14, hz - 0.14], [hx - 0.14, hz - 0.14]],
        [[hx - 0.14, hz - 0.14], [hx - 0.14, hz + 0.14]], [[hx + 0.14, hz + 0.14], [hx + 0.14, hz - 0.14]]])
        ST.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 0.52, b[1]], [a[0], 0.52, a[1]], suv.sw_red, { tint: 0.9 });
      ST.quad([hx - 0.09, 0.52, hz + 0.09], [hx + 0.09, 0.52, hz + 0.09], [hx + 0.09, 0.66, hz], [hx - 0.09, 0.66, hz], suv.sw_red, { tint: 0.8 });
      ST.quad([hx + 0.09, 0.52, hz - 0.09], [hx - 0.09, 0.52, hz - 0.09], [hx - 0.09, 0.66, hz], [hx + 0.09, 0.66, hz], suv.sw_red, { tint: 0.8 });
      H.propBoxes.push({ min: [hx - 0.2, 0, hz - 0.2], max: [hx + 0.2, 0.7, hz + 0.2] });
    }

    // crates by the noodle shop (Henrietta's turf)
    for (const [cx2, cz2, s] of [[19.4, 0.9, 0.55], [19.55, 0.9 + 0.06, 0.4]]) {
      const y0 = cx2 === 19.4 ? 0 : 0.55;
      for (const [a, b] of [[[cx2 - s / 2, cz2 + s / 2], [cx2 + s / 2, cz2 + s / 2]], [[cx2 + s / 2, cz2 - s / 2], [cx2 - s / 2, cz2 - s / 2]],
        [[cx2 - s / 2, cz2 - s / 2], [cx2 - s / 2, cz2 + s / 2]], [[cx2 + s / 2, cz2 + s / 2], [cx2 + s / 2, cz2 - s / 2]]])
        ST.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0 + s, b[1]], [a[0], y0 + s, a[1]], suv.sw_wood, { tint: 0.9 });
      planeY(ST, y0 + s, cx2 - s / 2, cx2 + s / 2, cz2 - s / 2, cz2 + s / 2, suv.sw_woodDark, s, false, {});
    }
    H.propBoxes.push({ min: [19.0, 0, 0.5], max: [19.9, 1.1, 1.3] });

    // the bus stop: your ride back to the calculator
    {
      const sx = -4.2, sz = 7.3;
      ST.quad([sx - 0.04, 0, sz], [sx + 0.04, 0, sz], [sx + 0.04, 2.4, sz], [sx - 0.04, 2.4, sz], suv.sw_iron, { tint: 0.85 });
      ST.quad([sx + 0.04, 0, sz - 0.01], [sx - 0.04, 0, sz - 0.01], [sx - 0.04, 2.4, sz - 0.01], [sx + 0.04, 2.4, sz - 0.01], suv.sw_iron, { tint: 0.85 });
      ST.quad([sx - 0.36, 1.5, sz + 0.02], [sx + 0.36, 1.5, sz + 0.02], [sx + 0.36, 2.42, sz + 0.02], [sx - 0.36, 2.42, sz + 0.02], suv.busSign, { e: 0.3 });
      ST.quad([sx + 0.36, 1.5, sz - 0.02], [sx - 0.36, 1.5, sz - 0.02], [sx - 0.36, 2.42, sz - 0.02], [sx + 0.36, 2.42, sz - 0.02], suv.busSign, { e: 0.3 });
      H.propBoxes.push({ min: [sx - 0.12, 0, sz - 0.12], max: [sx + 0.12, 2.5, sz + 0.12] });
      H.hotspots.push({
        kind: 'bus',
        x: sx, z: sz, r: 2.4,
        min: [sx - 0.42, 0, sz - 0.15], max: [sx + 0.42, 2.5, sz + 0.15],
        stand: [sx, EYE, sz - 1.2],
        label: 'CALL IT A NIGHT — BACK TO THE CALCULATOR',
        act: () => exit(),
      });
    }

    // the regulars themselves: crossed alpha quads + a prompt hotspot each
    for (const npc of NPCS) {
      const hw = npc.w / 2, y0 = npc.y0, y1 = npc.y0 + npc.h;
      const u = suv[npc.tex];
      NP.quad([npc.x - hw, y0, npc.z], [npc.x + hw, y0, npc.z], [npc.x + hw, y1, npc.z], [npc.x - hw, y1, npc.z], u, { e: 0.18, tint: 1.05 });
      NP.quad([npc.x + hw, y0, npc.z], [npc.x - hw, y0, npc.z], [npc.x - hw, y1, npc.z], [npc.x + hw, y1, npc.z], u, { e: 0.18, tint: 1.05 });
      NP.quad([npc.x, y0, npc.z + hw], [npc.x, y0, npc.z - hw], [npc.x, y1, npc.z - hw], [npc.x, y1, npc.z + hw], u, { e: 0.18, tint: 1.05 });
      NP.quad([npc.x, y0, npc.z - hw], [npc.x, y0, npc.z + hw], [npc.x, y1, npc.z + hw], [npc.x, y1, npc.z - hw], u, { e: 0.18, tint: 1.05 });
      H.glows.push({ p: [npc.x, y1 + 0.14, npc.z], c: [1, 0.85, 0.5], s: 0.3, a: 0.09, k: 'neon' });
      H.propBoxes.push({ min: [npc.x - 0.22, 0, npc.z - 0.22], max: [npc.x + 0.22, y1, npc.z + 0.22] });
      H.hotspots.push({
        kind: 'npc',
        x: npc.x, z: npc.z, r: 2.3,
        min: [npc.x - 0.35, y0, npc.z - 0.35], max: [npc.x + 0.35, y1 + 0.1, npc.z + 0.35],
        stand: [npc.x + npc.sdx, EYE, npc.z + npc.sdz],
        label: 'TALK TO ' + npc.name,
        act: () => openDialog(npc),
      });
    }

    return { solid: ST.upload(gl), npc: NP.upload(gl) };
  }

  function foundGoldenNug(x, y, z) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.1;
      H.sparks.push({
        x: x + (Math.random() - 0.5) * 0.1, y: y + (Math.random() - 0.5) * 0.1, z: z + (Math.random() - 0.5) * 0.1,
        vx: Math.cos(a) * sp, vy: 1.0 + Math.random() * 1.6, vz: Math.sin(a) * sp,
        life: 0.8 + Math.random() * 0.6, max: 1.4,
      });
    }
    sfxShimmer();
    toast(H.nugFound ? '✨ still golden. still yours in spirit.' : '✨ THE GOLDEN NUG! worth 10× respect.', 2.6);
    H.nugFound = true;
  }

  function toast(text, secs) {
    H.toast = { text, until: H.t + secs };
  }

  // Pull real top-5s for the scoreboard. Signed-out and offline both fine —
  // the board just says so. Cached for a minute across hall entries.
  function fetchLeaderboards() {
    if (!window.NuggetAPI || Date.now() - H.lb.at < 60000) return;
    H.lb.at = Date.now();
    for (const game of ArcadeArt.GAMES) {
      NuggetAPI.leaderboard(game.mode, 5)
        .then((d) => { H.lb.data[game.mode] = (d && d.top) || []; })
        .catch(() => { if (!Array.isArray(H.lb.data[game.mode])) H.lb.data[game.mode] = 'error'; });
    }
  }

  function hexRGB(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Eight point lights; intensities animated each frame.
  const LIGHTS = [
    { p: [0, 3.6, 1.4], c: [1.5, 1.1, 0.5], k: 'sign' },
    { p: [0, 3.8, -4], c: [0.75, 0.9, 1.35], k: 'tube' },
    { p: [0, 3.8, -9], c: [0.75, 0.9, 1.35], k: 'tube' },
    { p: [0, 3.8, -14], c: [0.75, 0.9, 1.35], k: 'tube' },
    { p: [0, 2.6, -17.9], c: [1.5, 0.85, 0.35], k: 'torch' },
    { p: [-5.8, 2.3, -9.5], c: [1.1, 0.35, 0.75], k: 'neon' },
    { p: [5.8, 2.3, -9.5], c: [0.35, 0.95, 1.15], k: 'neon' },
    { p: [0, 2.8, -1.6], c: [0.6, 0.55, 0.8], k: 'door' },
  ];

  // ---- init ---------------------------------------------------------------------------

  function build() {
    if (H.built) return true;
    const root = document.getElementById('arcadeHall');
    root.innerHTML =
      '<canvas></canvas>' +
      '<div class="hall-vignette"></div>' +
      '<div class="hall-prompt"></div>' +
      '<div class="hall-hint"></div>' +
      '<button class="hall-mute" type="button" title="Sound on/off">🔊</button>' +
      '<button class="hall-skip" type="button">▶ skip intro</button>' +
      '<div class="hall-dialog"><div class="hd-name"></div><div class="hd-text"></div><div class="hd-opts"></div><div class="hd-hint"></div></div>' +
      '<div class="hall-flash"></div>' +
      '<div class="hall-fade"></div>';
    H.root = root;
    H.canvas = root.querySelector('canvas');
    H.prompt = root.querySelector('.hall-prompt');
    H.hint = root.querySelector('.hall-hint');
    H.fade = root.querySelector('.hall-fade');
    H.flash = root.querySelector('.hall-flash');
    H.skipBtn = root.querySelector('.hall-skip');
    H.muteBtn = root.querySelector('.hall-mute');
    H.dlg = root.querySelector('.hall-dialog');
    H.dlgName = root.querySelector('.hd-name');
    H.dlgText = root.querySelector('.hd-text');
    H.dlgOpts = root.querySelector('.hd-opts');
    H.dlgHint = root.querySelector('.hd-hint');

    const gl = H.canvas.getContext('webgl', { antialias: true });
    if (!gl) return false;
    H.gl = gl;

    H.progLit = makeProgram(gl, VS_LIT, FS_LIT);
    H.progSpr = makeProgram(gl, VS_SPR, FS_SPR);
    H.uni = {};
    for (const name of ['uProj', 'uView', 'uModel', 'uTex', 'uLightPos', 'uLightColor',
      'uAmbient', 'uFogColor', 'uCamPos', 'uFogDensity', 'uAlpha', 'uMirror', 'uBoost'])
      H.uni[name] = gl.getUniformLocation(H.progLit, name);
    H.uniS = {};
    for (const name of ['uProj', 'uView', 'uTex'])
      H.uniS[name] = gl.getUniformLocation(H.progSpr, name);
    H.attr = {
      aPos: gl.getAttribLocation(H.progLit, 'aPos'),
      aNormal: gl.getAttribLocation(H.progLit, 'aNormal'),
      aUV: gl.getAttribLocation(H.progLit, 'aUV'),
      aExtra: gl.getAttribLocation(H.progLit, 'aExtra'),
    };
    H.attrS = {
      aPos: gl.getAttribLocation(H.progSpr, 'aPos'),
      aUV: gl.getAttribLocation(H.progSpr, 'aUV'),
      aColor: gl.getAttribLocation(H.progSpr, 'aColor'),
    };

    const atlas = ArcadeArt.makeAtlas();
    H.texAtlas = makeTexture(gl, atlas.canvas);
    H.texGlow = makeTexture(gl, ArcadeArt.makeGlow());
    H.bufs = buildScene(gl, atlas.uv);
    const street = ArcadeArt.makeStreetAtlas();
    H.texStreet = makeTexture(gl, street.canvas);
    H.bufsStreet = buildStreet(gl, street.uv);

    // live attract-mode screens: one canvas + texture per game
    H.screenTex = {};
    H.screenCv = {};
    for (const game of ArcadeArt.GAMES) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 192;
      H.screenCv[game.mode] = c;
      H.screenTex[game.mode] = makeTexture(gl, c, { mips: false });
    }

    // live leaderboard scoreboard texture
    H.boardCv = document.createElement('canvas');
    H.boardCv.width = 512;
    H.boardCv.height = 256;
    H.boardTex = makeTexture(gl, H.boardCv, { mips: false });

    // dynamic sprite buffer
    H.sprVbo = gl.createBuffer();

    bindInput();
    H.muteBtn.addEventListener('click', () => setMuted(!AC.muted));
    H.skipBtn.addEventListener('click', skipIntro);
    H.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); exit(true); });

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(FOG[0], FOG[1], FOG[2], 1);

    H.built = true;
    return true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = (innerWidth * dpr) | 0, hh = (innerHeight * dpr) | 0;
    if (H.canvas.width !== w || H.canvas.height !== hh) {
      H.canvas.width = w;
      H.canvas.height = hh;
    }
  }

  // ---- input ---------------------------------------------------------------------------

  const KEYMAP = {
    KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  };

  function bindInput() {
    // capture phase: see the keystroke BEFORE account.js's document listener
    // closes a modal, so Esc closes the leaderboards without also exiting the hall
    window.addEventListener('keydown', (e) => {
      if (!H.active || H.suspended) return;
      if (modalOpen()) return; // a page modal owns the keyboard right now
      if (H.dialog) {
        // a conversation owns the keys: numbers pick, enter advances, esc bails
        e.preventDefault();
        if (e.code === 'Escape' || e.code === 'KeyQ') closeDialog();
        else if (e.code.startsWith('Digit')) chooseDialogOpt(Number(e.code.slice(-1)) - 1);
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') dialogAdvance();
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (H.state === 'intro') skipIntro();
        else exit();
        return;
      }
      if (H.state === 'intro' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        skipIntro();
        return;
      }
      if (KEYMAP[e.code]) { H.keys[KEYMAP[e.code]] = true; e.preventDefault(); }
      if ((e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') && H.state === 'walk') {
        // preventDefault so Enter/Space can't re-activate a still-focused page
        // button (the arcade button!) or scroll the page behind the hall
        e.preventDefault();
        activatePrompt();
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (KEYMAP[e.code]) H.keys[KEYMAP[e.code]] = false;
    });

    const cv = H.canvas;
    cv.addEventListener('mousedown', (e) => {
      if (H.suspended || modalOpen()) return;
      H.drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), touch: false };
      cv.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!H.drag || H.drag.touch || H.suspended) return;
      look(e.clientX - H.drag.x, e.clientY - H.drag.y);
      H.drag.moved += Math.abs(e.clientX - H.drag.x) + Math.abs(e.clientY - H.drag.y);
      H.drag.x = e.clientX; H.drag.y = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      cv.classList.remove('dragging');
      if (!H.drag || H.drag.touch) { H.drag = null; return; }
      const tap = H.drag.moved < 6 && performance.now() - H.drag.t < 400;
      H.drag = null;
      if (tap && !H.suspended) handleTap(e.clientX, e.clientY, false);
    });
    cv.addEventListener('wheel', (e) => {
      if (H.state !== 'walk' && H.state !== 'auto') return;
      e.preventDefault();
      moveCam(-e.deltaY * 0.003, 0);
      H.state = 'walk'; H.auto = null;
    }, { passive: false });

    cv.addEventListener('touchstart', (e) => {
      if (H.suspended || modalOpen()) return;
      const t = e.touches[0];
      H.drag = { x: t.clientX, y: t.clientY, moved: 0, t: performance.now(), touch: true };
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (!H.drag || H.suspended) return;
      const t = e.touches[0];
      if (e.touches.length === 2) {
        // two-finger drag = walk forward/back
        moveCam((H.drag.y - t.clientY) * 0.012, 0);
        H.state = H.state === 'auto' ? 'walk' : H.state;
      } else {
        look(t.clientX - H.drag.x, t.clientY - H.drag.y);
      }
      H.drag.moved += Math.abs(t.clientX - H.drag.x) + Math.abs(t.clientY - H.drag.y);
      H.drag.x = t.clientX; H.drag.y = t.clientY;
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchend', (e) => {
      if (!H.drag) return;
      const tap = H.drag.moved < 12 && performance.now() - H.drag.t < 350;
      const x = H.drag.x, y = H.drag.y;
      H.drag = null;
      if (tap && !H.suspended) {
        if (H.state === 'intro') { skipIntro(); return; }
        handleTap(x, y, true);
      }
    });

    window.addEventListener('resize', () => { if (H.active) resize(); });
  }

  function look(dx, dy) {
    if (H.state !== 'walk' && H.state !== 'auto') return;
    H.cam.yaw -= dx * 0.0042;
    H.cam.pitch = Math.max(-0.7, Math.min(0.7, H.cam.pitch - dy * 0.0035));
  }

  function moveCam(fwdAmt, strafeAmt) {
    const sy = Math.sin(H.cam.yaw), cy = Math.cos(H.cam.yaw);
    tryMove(
      H.cam.x + -sy * fwdAmt + cy * strafeAmt,
      H.cam.z + -cy * fwdAmt + -sy * strafeAmt
    );
  }

  function posValid(x, z) {
    const inside = x > -(RX - 0.5) && x < RX - 0.5 && z > RZB + 0.6 && z < -0.1;
    const doorway = Math.abs(x) < 1.0 && z >= -0.3 && z <= 0.3 && H.doorsOpen > 0.7;
    const outside = x > -21.1 && x < 21.1 && z > 0.1 && z < 13.5; // the whole street

    if (!(inside || doorway || outside)) return false;
    for (const cab of H.cabinets)
      if (x > cab.min[0] - 0.22 && x < cab.max[0] + 0.22 && z > cab.min[2] - 0.22 && z < cab.max[2] + 0.22)
        return false;
    for (const box of H.propBoxes)
      if (x > box.min[0] - 0.18 && x < box.max[0] + 0.18 && z > box.min[2] - 0.18 && z < box.max[2] + 0.18)
        return false;
    return true;
  }

  function tryMove(nx, nz) {
    if (posValid(nx, nz)) { H.cam.x = nx; H.cam.z = nz; return; }
    if (posValid(nx, H.cam.z)) { H.cam.x = nx; return; }
    if (posValid(H.cam.x, nz)) { H.cam.z = nz; }
  }

  // Screen → world ray, then: cabinet hit → walk to it / play; floor → walk there.
  function handleTap(px, py, isTouch) {
    if (H.dialog) { dialogAdvance(); return; } // taps feed the conversation
    if (H.state !== 'walk' && H.state !== 'auto') return;
    const ndcX = (px / innerWidth) * 2 - 1;
    const ndcY = 1 - (py / innerHeight) * 2;
    const th = Math.tan(FOV / 2), aspect = innerWidth / innerHeight;
    const f = camFwd(H.cam.yaw, H.cam.pitch);
    const sy = Math.sin(H.cam.yaw), cy = Math.cos(H.cam.yaw);
    const r = [cy, 0, -sy];
    const u = [
      f[1] * r[2] - f[2] * r[1],
      f[2] * r[0] - f[0] * r[2],
      f[0] * r[1] - f[1] * r[0],
    ]; // up = fwd × right (right-handed, gives +y-ish)
    const d = [
      f[0] + r[0] * ndcX * th * aspect - u[0] * ndcY * th,
      f[1] + r[1] * ndcX * th * aspect - u[1] * ndcY * th,
      f[2] + r[2] * ndcX * th * aspect - u[2] * ndcY * th,
    ];
    const o = [H.cam.x, H.cam.y, H.cam.z];

    let hit = null, hitT = Infinity, hitSpot = null;
    for (const cab of H.cabinets) {
      if (cab.hidden) continue;
      const t = rayAABB(o, d, cab.min, cab.max);
      if (t != null && t < hitT) { hitT = t; hit = cab; hitSpot = null; }
    }
    for (const spot of H.hotspots) {
      const t = rayAABB(o, d, spot.min, spot.max);
      if (t != null && t < hitT) { hitT = t; hit = null; hitSpot = spot; }
    }
    if (hitSpot) {
      const dist = Math.hypot(hitSpot.x - o[0], hitSpot.z - o[2]);
      if (dist < hitSpot.r) hitSpot.act();
      else { H.auto = { x: hitSpot.stand[0], z: hitSpot.stand[2], spot: hitSpot, launch: true }; H.state = 'auto'; sfxBoop(); }
      return;
    }
    if (hit) {
      const dist = Math.hypot(hit.stand[0] - o[0], hit.stand[2] - o[2]);
      if (dist < 1.0) startZoom(hit);
      else H.auto = { x: hit.stand[0], z: hit.stand[2], cab: hit, launch: true }, H.state = 'auto';
      sfxBoop();
      return;
    }
    // floor
    if (d[1] < -0.05) {
      const t = -o[1] / d[1];
      const fx = o[0] + d[0] * t, fz = o[2] + d[2] * t;
      if (posValid(fx, fz)) { H.auto = { x: fx, z: fz, cab: null }; H.state = 'auto'; }
    }
  }

  function rayAABB(o, d, min, max) {
    let t0 = 0, t1 = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < min[i] || o[i] > max[i]) return null;
        continue;
      }
      let a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i];
      if (a > b) { const tmp = a; a = b; b = tmp; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return t0 > 0.001 ? t0 : null;
  }

  function activatePrompt() {
    if (H.promptTarget === 'door') {
      // stroll out into the rain (the bus stop out there goes back to the calculator)
      H.auto = { x: 0, z: 2.4, cab: null };
      H.state = 'auto';
      sfxBoop();
      return;
    }
    if (!H.promptTarget) return;
    if (H.promptTarget.act) H.promptTarget.act();
    else startZoom(H.promptTarget);
  }

  // ---- state flow -----------------------------------------------------------------------

  function enter() {
    try {
      if (!build()) { fallbackLaunch(); return; }
    } catch (err) {
      console.error('Nugget Arcade hall failed to build:', err);
      fallbackLaunch();
      return;
    }
    H.active = true;
    H.suspended = false;
    H.state = 'intro';
    H.t = 0; H.introT = 0; H.last = 0;
    H.doorsOpen = 0;
    H.cam.x = 0; H.cam.y = EYE; H.cam.z = 6.4;
    H.cam.yaw = 0; H.cam.pitch = 0.02;
    H.auto = null; H.zoomAnim = null; H.promptTarget = null;
    H.introFlags = {};
    H.toast = null;
    H.dialog = null;
    H.wentOutside = false;
    if (H.dlg) H.dlg.classList.remove('on');
    H.sparks = [];
    H.stepAcc = 0;
    H.prevZ = 99;
    readBestScores();
    fetchLeaderboards();
    H.root.classList.add('active');
    document.body.classList.add('hall-open', 'hall-session');
    H.fade.style.opacity = '1';
    H.skipBtn.classList.add('on');
    H.hint.classList.remove('on');
    resize();
    initAudio();
    requestAnimationFrame(() => { H.fade.style.opacity = '0'; });
    if (typeof updateArcadeBtn === 'function') updateArcadeBtn();
    H.raf = requestAnimationFrame(frame);
  }

  // If WebGL is unavailable, keep the old behavior: straight into the storm.
  function fallbackLaunch() {
    storm.arcade = true;
    update();
  }

  function skipIntro() {
    if (H.state !== 'intro') return;
    H.introT = 99;
    H.doorsOpen = 1;
    H.cam.x = 0; H.cam.z = -2.6; H.cam.yaw = 0; H.cam.pitch = 0;
    finishIntro();
  }

  function finishIntro() {
    H.state = 'walk';
    H.skipBtn.classList.remove('on');
    H.hint.innerHTML = H.isTouch
      ? 'DRAG — look around · TAP — walk / play / talk<br>Two-finger drag — walk · the STREET is out the doors'
      : 'WASD / ARROWS — walk · DRAG — look around<br>ENTER — play / talk · the STREET is out the doors · ESC — leave';
    H.hint.classList.add('on');
    clearTimeout(H.hintTimer);
    H.hintTimer = setTimeout(() => H.hint.classList.remove('on'), 9000);
  }

  function startZoom(cab) {
    if (H.state === 'zoom') return;
    H.state = 'zoom';
    H.auto = null;
    H.lastCab = cab;
    const sc = cab.screen.center, n = cab.screen.normal;
    const to = {
      x: sc[0] + n[0] * 0.58, y: sc[1] + n[1] * 0.58 + 0.05, z: sc[2] + n[2] * 0.58,
    };
    const d = [sc[0] - to.x, sc[1] - to.y, sc[2] - to.z];
    const dl = Math.hypot(...d);
    H.zoomAnim = {
      t: 0, dur: 1.1,
      from: { x: H.cam.x, y: H.cam.y, z: H.cam.z, yaw: H.cam.yaw, pitch: H.cam.pitch },
      to: {
        ...to,
        yaw: Math.atan2(-d[0] / dl, -d[2] / dl),
        pitch: Math.asin(d[1] / dl),
      },
    };
    sfxBoop(880);
  }

  function launchGame(mode) {
    H.suspended = true;
    if (H.raf) cancelAnimationFrame(H.raf);
    H.raf = null;
    H.root.classList.remove('active');
    H.prompt.classList.remove('on');
    setAmbient(0);
    // hand off to the storm engine — same path the old arcade button used
    storm.mode = mode;
    storm.arcade = true;
    update();
  }

  // Called by stopStorm() via window.onStormExit — walk back out of the CRT.
  function resumeHall(completed) {
    if (!H.active || !H.suspended) return;
    H.suspended = false;
    H.state = 'return';
    H.returnT = 0;
    const cab = H.lastCab || H.cabinets[0];
    H.cam.x = cab.stand[0]; H.cam.y = EYE; H.cam.z = cab.stand[2];
    const d = [cab.screen.center[0] - H.cam.x, cab.screen.center[1] - EYE, cab.screen.center[2] - H.cam.z];
    const dl = Math.hypot(...d);
    H.cam.yaw = Math.atan2(-d[0] / dl, -d[2] / dl);
    H.cam.pitch = Math.asin(d[1] / dl) * 0.6;
    H.root.classList.add('active');
    H.fade.style.opacity = '1';
    resize();
    setAmbient(1);
    requestAnimationFrame(() => { H.fade.style.opacity = '0'; });
    H.last = 0;
    H.raf = requestAnimationFrame(frame);
  }

  function exit(immediate) {
    if (!H.active) return;
    H.active = false;
    H.suspended = false;
    H.state = 'idle';
    H.dialog = null;
    if (H.dlg) H.dlg.classList.remove('on');
    const teardown = () => {
      H.root.classList.remove('active');
      document.body.classList.remove('hall-open', 'hall-session');
      if (H.raf) cancelAnimationFrame(H.raf);
      H.raf = null;
      stopAudio();
      if (typeof updateArcadeBtn === 'function') updateArcadeBtn();
    };
    if (immediate) { teardown(); return; }
    H.fade.style.opacity = '1';
    sfxBoop(392);
    setTimeout(teardown, 650);
  }

  function readBestScores() {
    const ids = {
      catch: 'myCatch', blaster: 'myBlaster', flappy: 'myFlappy', dunk: 'myDunk',
      sim: 'mySim', run: 'myRun', knight: 'myKnight', brawl: 'myBrawl', ranch: 'myRanch',
    };
    for (const [mode, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      H.best[mode] = el ? parseInt((el.textContent || '0').replace(/\D/g, ''), 10) || 0 : 0;
    }
  }

  // ---- per-frame update -------------------------------------------------------------------

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Neon sign warm-up: dead → sputtering → steady with the occasional dropout.
  function signLevel(t) {
    if (H.state === 'intro') {
      const it = H.introT;
      if (it < 0.9) return 0;
      if (it < 2.1) {
        const p = (it - 0.9) / 1.2;
        const sputter = Math.sin(it * 47) * Math.sin(it * 31) > 0.2 - p ? 1 : 0.05;
        return sputter * Math.min(1, p * 1.6);
      }
    }
    const drop = Math.sin(t * 0.7) > 0.997 ? 0.35 : 1;
    return drop * (0.96 + 0.04 * Math.sin(t * 19) * Math.sin(t * 7.3));
  }

  function stepIntro(dt) {
    H.introT += dt;
    const it = H.introT;
    if (it > 2.6 && !H.introFlags.door) { H.introFlags.door = true; sfxDoor(); }
    H.doorsOpen = it < 2.6 ? 0 : Math.min(1, (it - 2.6) / 1.0);
    if (it >= 2.8) {
      const p = easeInOut(Math.min(1, (it - 2.8) / 3.3));
      H.cam.z = 6.4 + (-2.6 - 6.4) * p;
      H.cam.y = EYE + Math.sin(p * Math.PI * 4) * 0.022;
      H.cam.pitch = 0.02 - 0.02 * p;
    }
    if (!H.introFlags.buzz && it > 0.9) { H.introFlags.buzz = true; sfxBuzz(); }
    if (it >= 6.2) finishIntro();
  }

  function stepWalk(dt) {
    if (H.dialog) { H.cam.y = EYE; return; } // feet stay planted mid-conversation
    const sp = 3.1 * dt;
    let mx = 0, mz = 0;
    if (H.keys.f) mz += 1;
    if (H.keys.b) mz -= 1;
    if (H.keys.l) mx -= 1;
    if (H.keys.r) mx += 1;
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      moveCam((mz / len) * sp, (mx / len) * sp);
      H.bob += dt * 7;
      H.auto = null;
    }
    H.cam.y = EYE + Math.sin(H.bob) * 0.028;
  }

  function stepAuto(dt) {
    const a = H.auto;
    if (!a) { H.state = 'walk'; return; }
    const dx = a.x - H.cam.x, dz = a.z - H.cam.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.14) {
      H.state = 'walk';
      const cab = a.cab, spot = a.spot;
      H.auto = null;
      if (cab && a.launch && H.isTouch) startZoom(cab);
      else if (spot && a.launch && H.isTouch) spot.act();
      return;
    }
    const sp = Math.min(3.4 * dt, dist);
    const beforeX = H.cam.x, beforeZ = H.cam.z;
    tryMove(H.cam.x + (dx / dist) * sp, H.cam.z + (dz / dist) * sp);
    if (Math.abs(H.cam.x - beforeX) + Math.abs(H.cam.z - beforeZ) < sp * 0.2) {
      H.auto = null; H.state = 'walk'; // wedged on a corner — give up gracefully
    }
    // steer the view toward the target as we go
    const wantYaw = Math.atan2(-dx / dist, -dz / dist);
    let dy = wantYaw - H.cam.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    H.cam.yaw += dy * Math.min(1, dt * 5);
    H.bob += dt * 7;
    H.cam.y = EYE + Math.sin(H.bob) * 0.028;
  }

  function stepZoom(dt) {
    const z = H.zoomAnim;
    if (!z) return; // zoom finished; waiting on the launch flash
    z.t += dt;
    const p = easeInOut(Math.min(1, z.t / z.dur));
    H.cam.x = z.from.x + (z.to.x - z.from.x) * p;
    H.cam.y = z.from.y + (z.to.y - z.from.y) * p;
    H.cam.z = z.from.z + (z.to.z - z.from.z) * p;
    let dy = z.to.yaw - z.from.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    H.cam.yaw = z.from.yaw + dy * p;
    H.cam.pitch = z.from.pitch + (z.to.pitch - z.from.pitch) * p;
    if (z.t >= z.dur + 0.08) {
      H.zoomAnim = null;
      sfxCoin();
      H.flash.classList.add('zap');
      const mode = H.lastCab.game.mode;
      setTimeout(() => {
        launchGame(mode);
        H.flash.classList.remove('zap');
        H.flash.classList.add('fadeout');
        setTimeout(() => H.flash.classList.remove('fadeout'), 500);
      }, 130);
    }
  }

  function updatePrompt() {
    if (H.dialog) { // the dialogue panel replaces the prompt while talking
      H.promptTarget = null;
      if (H.promptLabel) {
        H.promptLabel = '';
        H.prompt.classList.remove('on');
      }
      return;
    }
    let target = null, label = '';
    const key = (H.isTouch ? '<span class="key">TAP</span>' : '<span class="key">⏎</span>');
    if (H.state === 'walk' || H.state === 'auto') {
      const f = camFwd(H.cam.yaw, 0);
      let bestDot = 0.35;
      for (const cab of H.cabinets) {
        if (cab.hidden) continue;
        const dx = cab.x - H.cam.x, dz = cab.z - H.cam.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.6) continue;
        const dot = (dx / dist) * f[0] + (dz / dist) * f[2];
        if (dot > bestDot) {
          bestDot = dot;
          target = cab;
          label = key + 'PLAY ' + cab.game.title;
        }
      }
      for (const spot of H.hotspots) {
        const dx = spot.x - H.cam.x, dz = spot.z - H.cam.z;
        const dist = Math.hypot(dx, dz);
        if (dist > spot.r) continue;
        const dot = (dx / dist) * f[0] + (dz / dist) * f[2];
        if (dot > bestDot) {
          bestDot = dot;
          target = spot;
          label = key + spot.label;
        }
      }
      if (!target && H.cam.z > -1.7 && H.cam.z <= 0 && f[2] > 0.35) {
        target = 'door';
        label = (H.isTouch ? '<span class="key">TAP DOORS</span>' : key) + 'STEP OUTSIDE';
      }
    }
    // transient toasts (mystery pokes, golden nug) trump the interact label
    if (H.toast) {
      if (H.t < H.toast.until) label = H.toast.text;
      else H.toast = null;
    }
    H.promptTarget = target;
    if (label !== H.promptLabel) {
      H.promptLabel = label;
      H.prompt.innerHTML = label;
      H.prompt.classList.toggle('on', !!label);
    }
  }

  function updateAttracts() {
    const games = ArcadeArt.GAMES;
    const gl = H.gl;
    for (let k = 0; k < 3; k++) {
      const game = games[H.attractIdx % games.length];
      H.attractIdx++;
      const c = H.screenCv[game.mode];
      ArcadeArt.drawAttract(c.getContext('2d'), c.width, c.height, game, H.t, H.best[game.mode] || 0);
      gl.bindTexture(gl.TEXTURE_2D, H.screenTex[game.mode]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }
  }

  // ---- rendering ------------------------------------------------------------------------

  function bindLit(buf) {
    const gl = H.gl, a = H.attr;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.ibo);
    gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(a.aNormal, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(a.aUV, 2, gl.FLOAT, false, 40, 24);
    gl.vertexAttribPointer(a.aExtra, 2, gl.FLOAT, false, 40, 32);
  }

  function drawLit(buf, model, { alpha = 1, mirror = 1, boost = 1, offset = 0, count = null } = {}) {
    const gl = H.gl;
    gl.uniformMatrix4fv(H.uni.uModel, false, model);
    gl.uniform1f(H.uni.uAlpha, alpha);
    gl.uniform1f(H.uni.uMirror, mirror);
    gl.uniform1f(H.uni.uBoost, boost);
    bindLit(buf);
    gl.drawElements(gl.TRIANGLES, count == null ? buf.count : count, gl.UNSIGNED_SHORT, offset * 2);
  }

  function doorModels() {
    const ang = easeInOut(H.doorsOpen) * 1.85;
    return [
      mMul(mTrans(-1.25, 0, 0), mRotY(ang)),
      mMul(mTrans(1.25, 0, 0), mRotY(-ang)),
    ];
  }

  function drawScreens(model, opts) {
    const gl = H.gl;
    gl.uniformMatrix4fv(H.uni.uModel, false, model);
    gl.uniform1f(H.uni.uAlpha, opts.alpha || 1);
    gl.uniform1f(H.uni.uMirror, opts.mirror || 1);
    gl.uniform1f(H.uni.uBoost, 1);
    bindLit(H.bufs.screens);
    for (const cab of H.cabinets) {
      gl.bindTexture(gl.TEXTURE_2D, H.screenTex[cab.game.mode]);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, cab.screenIndex * 2);
    }
    gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);
  }

  function pushSprite(arr, cx, cy, cz, hw, hh, r, g, b, a, right, up) {
    const x0 = cx - right[0] * hw - up[0] * hh, y0 = cy - right[1] * hw - up[1] * hh, z0 = cz - right[2] * hw - up[2] * hh;
    const x1 = cx + right[0] * hw - up[0] * hh, y1 = cy + right[1] * hw - up[1] * hh, z1 = cz + right[2] * hw - up[2] * hh;
    const x2 = cx + right[0] * hw + up[0] * hh, y2 = cy + right[1] * hw + up[1] * hh, z2 = cz + right[2] * hw + up[2] * hh;
    const x3 = cx - right[0] * hw + up[0] * hh, y3 = cy - right[1] * hw + up[1] * hh, z3 = cz - right[2] * hw + up[2] * hh;
    arr.push(
      x0, y0, z0, 0, 1, r, g, b, a, x1, y1, z1, 1, 1, r, g, b, a, x2, y2, z2, 1, 0, r, g, b, a,
      x0, y0, z0, 0, 1, r, g, b, a, x2, y2, z2, 1, 0, r, g, b, a, x3, y3, z3, 0, 0, r, g, b, a
    );
  }

  function render() {
    const gl = H.gl;
    resize();
    gl.viewport(0, 0, H.canvas.width, H.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = H.canvas.width / H.canvas.height;
    const proj = mPersp(FOV, aspect, 0.05, 70);
    const view = mMul(
      mRotX(-H.cam.pitch),
      mMul(mRotY(-H.cam.yaw), mTrans(-H.cam.x, -H.cam.y, -H.cam.z))
    );

    gl.useProgram(H.progLit);
    for (const k of ['aPos', 'aNormal', 'aUV', 'aExtra']) gl.enableVertexAttribArray(H.attr[k]);
    gl.uniformMatrix4fv(H.uni.uProj, false, proj);
    gl.uniformMatrix4fv(H.uni.uView, false, view);
    gl.uniform3f(H.uni.uCamPos, H.cam.x, H.cam.y, H.cam.z);
    gl.uniform3f(H.uni.uAmbient, 0.22, 0.21, 0.29);
    gl.uniform3fv(H.uni.uFogColor, FOG);
    gl.uniform1f(H.uni.uFogDensity, FOG_DENSITY);
    gl.uniform1i(H.uni.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);

    // animated light intensities. Out on the street the ceiling tubes can't
    // reach, so their slots become the streetlamps + shop neon instead.
    const onStreet = H.cam.z > 0.6;
    const STREET_LIGHTS = {
      1: { p: [-15, 3.0, 6.9], c: [1.35, 0.95, 0.5], k: 'tube' },
      2: { p: [-5.5, 3.0, 6.9], c: [1.35, 0.95, 0.5], k: 'tube' },
      3: { p: [5, 3.0, 6.9], c: [1.35, 0.95, 0.5], k: 'tube' },
      5: { p: [14.5, 2.2, 0.9], c: [1.2, 0.5, 0.8], k: 'neon' },
      6: { p: [-19.4, 2.2, 0.9], c: [0.35, 0.95, 1.15], k: 'neon' },
    };
    const sl = signLevel(H.t);
    const lp = new Float32Array(24), lc = new Float32Array(24);
    LIGHTS.forEach((L0, i) => {
      const L = onStreet && STREET_LIGHTS[i] ? STREET_LIGHTS[i] : L0;
      let f = 1;
      if (L.k === 'sign') f = sl;
      else if (L.k === 'tube') f = 0.97 + 0.05 * Math.sin(H.t * 6.5 + i * 2.1);
      else if (L.k === 'torch') f = 0.85 + 0.2 * Math.sin(H.t * 9 + Math.sin(H.t * 23));
      else if (L.k === 'neon') f = 0.92 + 0.1 * Math.sin(H.t * 3 + i);
      lp.set(L.p, i * 3);
      lc.set([L.c[0] * f, L.c[1] * f, L.c[2] * f], i * 3);
    });
    gl.uniform3fv(H.uni.uLightPos, lp);
    gl.uniform3fv(H.uni.uLightColor, lc);

    const I = mIdent();
    const MIR = mScale(1, -1, 1);
    const [dl, dr] = doorModels();
    const signBoost = 0.15 + 0.85 * sl;

    // dynamic prop models: the sheet wiggles when poked, the mirror ball spins
    const wig = H.mystery.wiggle;
    const drapeUp = !brawlRevealed; // drape exists until the reveal finishes
    let MM = mMul(
      mTrans(H.mystery.pos[0], Math.abs(Math.sin(H.t * 22)) * 0.05 * wig, H.mystery.pos[1]),
      mRotY(H.mystery.pos[2] + Math.sin(H.t * 26) * 0.05 * wig)
    );
    if (H.reveal) {
      // the sheet crumples to the floor: squash down, bulge out
      const rt = easeInOut(Math.min(H.reveal.t, 1));
      MM = mMul(MM, mScale(1 + rt * 0.35, Math.max(1 - rt * 0.985, 0.015), 1 + rt * 0.35));
    }
    const DD = mMul(mTrans(0, 3.55, -2.6), mRotY(H.t * 0.5));

    function drawBoard(model, opts) {
      gl.bindTexture(gl.TEXTURE_2D, H.boardTex);
      drawLit(H.bufs.board, model, opts);
      gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);
    }

    // 1) mirrored world beneath the floor plane
    gl.frontFace(gl.CW);
    drawLit(H.bufs.static, MIR, { mirror: 0.33 });
    drawLit(H.bufs.sign, MIR, { mirror: 0.33, boost: signBoost });
    drawLit(H.bufs.doorL, mMul(MIR, dl), { mirror: 0.33 });
    drawLit(H.bufs.doorR, mMul(MIR, dr), { mirror: 0.33 });
    if (drapeUp) drawLit(H.bufs.mystery, mMul(MIR, MM), { mirror: 0.33 });
    drawLit(H.bufs.disco, mMul(MIR, DD), { mirror: 0.33 });
    drawBoard(MIR, { mirror: 0.38 });
    drawScreens(MIR, { mirror: 0.38 });
    // the street set reflects in the wet sidewalk too (own texture page)
    gl.bindTexture(gl.TEXTURE_2D, H.texStreet);
    drawLit(H.bufsStreet.solid, MIR, { mirror: 0.33 });
    gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);
    gl.frontFace(gl.CCW);

    // 2) the floor itself, slightly translucent so the reflection ghosts through
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawLit(H.bufs.floor, I, { alpha: 0.87 });
    gl.disable(gl.BLEND);

    // 3) the world proper
    drawLit(H.bufs.static, I, {});
    drawLit(H.bufs.sign, I, { boost: signBoost });
    drawLit(H.bufs.doorL, dl, {});
    drawLit(H.bufs.doorR, dr, {});
    if (drapeUp) drawLit(H.bufs.mystery, MM, {});
    drawLit(H.bufs.disco, DD, {});
    drawBoard(I, {});
    drawScreens(I, {});
    gl.bindTexture(gl.TEXTURE_2D, H.texStreet);
    drawLit(H.bufsStreet.solid, I, {});
    gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);

    // 4) contact shadows + alpha-cutout extras (the golden nug, the regulars)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawLit(H.bufs.decals, I, { alpha: 0.5 });
    gl.depthMask(false);
    drawLit(H.bufs.flora, I, {});
    gl.bindTexture(gl.TEXTURE_2D, H.texStreet);
    drawLit(H.bufsStreet.npc, mTrans(0, Math.sin(H.t * 1.7) * 0.012, 0), {});
    gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);
    gl.depthMask(true);

    // 5) additive sprites: glow halos, dust, rain
    // (disable the lit attribs BEFORE enabling sprite attribs — locations overlap)
    gl.useProgram(H.progSpr);
    for (const k of ['aPos', 'aNormal', 'aUV', 'aExtra']) gl.disableVertexAttribArray(H.attr[k]);
    for (const k of ['aPos', 'aUV', 'aColor']) gl.enableVertexAttribArray(H.attrS[k]);
    gl.uniformMatrix4fv(H.uniS.uProj, false, proj);
    gl.uniformMatrix4fv(H.uniS.uView, false, view);
    gl.uniform1i(H.uniS.uTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, H.texGlow);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);

    const right = [view[0], view[4], view[8]];
    const up = [view[1], view[5], view[9]];
    const arr = [];
    for (const gsp of H.glows) {
      let a = gsp.a * (0.9 + 0.1 * Math.sin(H.t * 2.4 + gsp.p[0] * 3 + gsp.p[2]));
      if (gsp.k === 'sign') a *= sl;
      pushSprite(arr, gsp.p[0], gsp.p[1], gsp.p[2], gsp.s, gsp.s, gsp.c[0], gsp.c[1], gsp.c[2], a, right, up);
    }
    for (const m of H.dust) {
      const tw = 0.5 + 0.5 * Math.sin(H.t * 1.7 + m.ph);
      pushSprite(arr, m.x, m.y, m.z, m.s, m.s, 0.7, 0.75, 0.9, 0.05 + 0.04 * tw, right, up);
    }
    if (H.cam.z > -3) {
      for (const rp of H.rain)
        pushSprite(arr, rp.x, rp.y, rp.z, 0.008, 0.16, 0.5, 0.6, 0.8, 0.16, right, [0, 1, 0]);
    }
    // mirror-ball spots sweeping the entrance floor
    const SPOTC = [[1, 0.4, 0.7], [0.4, 0.9, 1], [1, 0.9, 0.45], [0.65, 0.5, 1]];
    for (let k = 0; k < 8; k++) {
      const ang = H.t * 0.5 + (k * Math.PI) / 4;
      const rad = 1.6 + (k % 3) * 0.6;
      const c = SPOTC[k % 4];
      pushSprite(arr, Math.cos(ang) * rad, 0.03, -2.6 + Math.sin(ang) * rad * 0.8,
        0.34, 0.34, c[0], c[1], c[2], 0.05, [1, 0, 0], [0, 0, 1]);
    }
    // golden-nug celebration sparks
    for (const s of H.sparks) {
      const a = 0.55 * Math.min(1, s.life / 0.4);
      pushSprite(arr, s.x, s.y, s.z, 0.05, 0.05, 1, 0.85, 0.35, a, right, up);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, H.sprVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(H.attrS.aPos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(H.attrS.aUV, 2, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(H.attrS.aColor, 4, gl.FLOAT, false, 36, 20);
    gl.drawArrays(gl.TRIANGLES, 0, arr.length / 9);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    for (const k of ['aPos', 'aUV', 'aColor']) gl.disableVertexAttribArray(H.attrS[k]);
  }

  function frame(ts) {
    if (!H.active || H.suspended) return;
    if (!H.last) H.last = ts;
    const dt = Math.min((ts - H.last) / 1000, 0.05);
    H.last = ts;
    H.t += dt;

    const wasX = H.cam.x, wasZ = H.cam.z;
    if (H.state === 'intro') stepIntro(dt);
    else if (H.state === 'walk') stepWalk(dt);
    else if (H.state === 'auto') stepAuto(dt);
    else if (H.state === 'zoom') stepZoom(dt);
    else if (H.state === 'return') {
      H.returnT += dt;
      if (H.returnT > 0.55) H.state = 'walk';
    }

    // footsteps (walking states only) + the door chime when you cross inside
    if (H.state === 'walk' || H.state === 'auto') {
      H.stepAcc += Math.hypot(H.cam.x - wasX, H.cam.z - wasZ);
      if (H.stepAcc > 0.62) { H.stepAcc = 0; sfxStep(); }
    }
    if (H.prevZ > 0.05 && H.cam.z <= 0.05 && H.t - H.lastChime > 3) {
      H.lastChime = H.t;
      sfxChime();
    }
    if (H.prevZ <= 0.05 && H.cam.z > 0.05 && H.state !== 'intro') {
      if (H.t - H.lastChime > 3) { H.lastChime = H.t; sfxChime(); }
      if (!H.wentOutside) {
        H.wentOutside = true;
        toast('🌧️ NUGGETOWN AFTER DARK — the regulars will talk. the bus stop goes home.', 5);
      }
    }
    H.prevZ = H.cam.z;

    // prop life: mystery-cabinet wiggle decay + golden-nug sparks
    if (H.mystery.wiggle > 0) H.mystery.wiggle = Math.max(0, H.mystery.wiggle - dt * 1.5);
    if (H.reveal) {
      H.reveal.t += dt / 1.1;
      if (H.reveal.t >= 1.15) finishBrawlReveal();
    }
    for (let i = H.sparks.length - 1; i >= 0; i--) {
      const s = H.sparks[i];
      s.life -= dt;
      if (s.life <= 0) { H.sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.vy -= 3.2 * dt;
    }

    // live scoreboard: redraw ~6×/sec, cycling through the games
    H.lbTimer -= dt;
    if (H.lbTimer <= 0) {
      H.lbTimer = 0.16;
      const games = ArcadeArt.GAMES;
      const game = games[Math.floor(H.t / 4.5) % games.length];
      const g2 = H.boardCv.getContext('2d');
      ArcadeArt.drawScoreboard(g2, H.boardCv.width, H.boardCv.height, H.t, game, H.lb.data[game.mode], H.best[game.mode] || 0);
      const gl = H.gl;
      gl.bindTexture(gl.TEXTURE_2D, H.boardTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, H.boardCv);
    }

    // ambient particles
    for (const m of H.dust) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      if (m.y > 3.9) m.y = 0.25;
      if (m.x < -6.9) m.x = 6.9; if (m.x > 6.9) m.x = -6.9;
      if (m.z > -0.5) m.z = -19.2; if (m.z < -19.4) m.z = -0.6;
    }
    if (H.cam.z > -3)
      for (const rp of H.rain) {
        rp.y -= rp.v * dt;
        if (rp.y < 0.05) { rp.y = 4.6 + Math.random(); rp.x = -20 + Math.random() * 40; }
      }

    stepAudio(dt);
    stepDialog(dt);
    updateAttracts();
    updatePrompt();
    render();

    H.raf = requestAnimationFrame(frame);
  }

  // ---- audio ---------------------------------------------------------------------------
  // All synthesized, nothing loaded. A low room hum + rain outside, sparse
  // chiptune blips from the cabinets, and little UI stingers.

  const AC = { ctx: null, master: null, amb: null, rain: null, muted: false, nextBlip: 2 };
  try { AC.muted = localStorage.getItem('hallMuted') === '1'; } catch (e) { /* private mode */ }

  function initAudio() {
    if (!AC.ctx) {
      try {
        AC.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { return; }
      AC.master = AC.ctx.createGain();
      AC.master.connect(AC.ctx.destination);
      // room tone: two soft sines + filtered noise
      const hum = AC.ctx.createOscillator();
      hum.frequency.value = 55;
      const hum2 = AC.ctx.createOscillator();
      hum2.frequency.value = 110.4;
      const hg = AC.ctx.createGain();
      hg.gain.value = 0.02;
      const h2g = AC.ctx.createGain();
      h2g.gain.value = 0.008;
      AC.amb = AC.ctx.createGain();
      AC.amb.gain.value = 1;
      hum.connect(hg).connect(AC.amb);
      hum2.connect(h2g).connect(AC.amb);
      const noise = AC.ctx.createBufferSource();
      const buf = AC.ctx.createBuffer(1, AC.ctx.sampleRate * 2, AC.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buf;
      noise.loop = true;
      const lp = AC.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 260;
      const ng = AC.ctx.createGain();
      ng.gain.value = 0.015;
      noise.connect(lp).connect(ng).connect(AC.amb);
      // rain hiss (fades once you're inside)
      const rainSrc = AC.ctx.createBufferSource();
      rainSrc.buffer = buf;
      rainSrc.loop = true;
      const hp = AC.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2200;
      AC.rain = AC.ctx.createGain();
      AC.rain.gain.value = 0.035;
      rainSrc.connect(hp).connect(AC.rain);
      AC.amb.connect(AC.master);
      AC.rain.connect(AC.master);
      hum.start(); hum2.start(); noise.start(); rainSrc.start();
    }
    if (AC.ctx.state === 'suspended') AC.ctx.resume();
    AC.master.gain.value = AC.muted ? 0 : 0.55;
    H.muteBtn.textContent = AC.muted ? '🔇' : '🔊';
    AC.nextBlip = H.t + 2;
  }

  function setMuted(m) {
    AC.muted = m;
    try { localStorage.setItem('hallMuted', m ? '1' : '0'); } catch (e) { /* ok */ }
    if (AC.master) AC.master.gain.value = m ? 0 : 0.55;
    H.muteBtn.textContent = m ? '🔇' : '🔊';
  }

  function setAmbient(level) {
    if (AC.amb) AC.amb.gain.value = level;
    if (AC.rain) AC.rain.gain.value = 0.035 * level;
    if (AC.ctx && level === 0 && AC.ctx.state === 'running') AC.ctx.suspend();
    if (AC.ctx && level > 0 && AC.ctx.state === 'suspended') AC.ctx.resume();
  }

  function stopAudio() {
    if (AC.ctx && AC.ctx.state === 'running') AC.ctx.suspend();
  }

  function stepAudio(dt) {
    if (!AC.ctx || AC.muted) return;
    // rain volume tracks how close to the door you are
    if (AC.rain) {
      const t = Math.max(0, Math.min(1, (H.cam.z + 3) / 4));
      AC.rain.gain.value = 0.005 + 0.04 * t;
    }
    // sparse chiptune blips drifting over from the cabinets — louder when
    // you're standing near one, faint from across the room
    if (H.t > AC.nextBlip && H.state !== 'intro') {
      AC.nextBlip = H.t + 3 + Math.random() * 6;
      let near = 99;
      for (const cab of H.cabinets)
        near = Math.min(near, Math.hypot(cab.x - H.cam.x, cab.z - H.cam.z));
      const g = 0.008 + 0.028 * Math.max(0, 1 - near / 9);
      const notes = [523, 587, 659, 784, 880];
      const n = 2 + (Math.random() * 3) | 0;
      for (let i = 0; i < n; i++) {
        const t0 = AC.ctx.currentTime + i * 0.11;
        tone(notes[(Math.random() * notes.length) | 0] * (Math.random() < 0.3 ? 0.5 : 1),
          t0, 0.09, g, 'square');
      }
    }
  }

  function tone(freq, t0, dur, gain, type) {
    if (!AC.ctx || AC.muted) return;
    const o = AC.ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    const g = AC.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(g).connect(AC.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function sfxBoop(f) {
    if (!AC.ctx) return;
    tone(f || 660, AC.ctx.currentTime, 0.07, 0.05, 'square');
  }
  function sfxCoin() {
    if (!AC.ctx) return;
    const t0 = AC.ctx.currentTime;
    tone(988, t0, 0.09, 0.09, 'triangle');
    tone(1319, t0 + 0.08, 0.3, 0.09, 'triangle');
  }
  function sfxDoor() {
    if (!AC.ctx || AC.muted) return;
    const t0 = AC.ctx.currentTime;
    tone(90, t0, 0.7, 0.05, 'sine');
    tone(72, t0 + 0.12, 0.8, 0.04, 'sine');
  }
  function sfxBuzz() {
    if (!AC.ctx || AC.muted) return;
    const t0 = AC.ctx.currentTime;
    for (let i = 0; i < 6; i++)
      tone(50 + Math.random() * 12, t0 + i * 0.14 + Math.random() * 0.05, 0.09, 0.028, 'sawtooth');
  }
  function sfxStep() {
    if (!AC.ctx) return;
    H.stepFlip = !H.stepFlip;
    tone(H.stepFlip ? 82 : 74, AC.ctx.currentTime, 0.06, 0.015, 'sine');
  }
  function sfxChime() {
    if (!AC.ctx) return;
    const t0 = AC.ctx.currentTime;
    tone(784, t0, 0.18, 0.05, 'triangle');
    tone(988, t0 + 0.14, 0.32, 0.05, 'triangle');
  }
  function sfxThump() {
    if (!AC.ctx) return;
    const t0 = AC.ctx.currentTime;
    tone(70, t0, 0.12, 0.11, 'sine');
    tone(56, t0 + 0.12, 0.18, 0.08, 'sine');
  }
  function sfxTalk() {
    if (!AC.ctx) return;
    const t0 = AC.ctx.currentTime;
    tone(392, t0, 0.06, 0.03, 'square');
    tone(494, t0 + 0.07, 0.06, 0.03, 'square');
    tone(440, t0 + 0.14, 0.08, 0.025, 'square');
  }
  function sfxFanfare() {
    if (!AC.ctx) return;
    const t0 = AC.ctx.currentTime;
    [392, 523, 659, 784].forEach((f, i) => tone(f, t0 + i * 0.12, 0.28, 0.07, 'square'));
    tone(1047, t0 + 0.48, 0.55, 0.08, 'triangle');
    for (let i = 0; i < 5; i++)
      tone(1568 + Math.random() * 800, t0 + 0.5 + i * 0.06, 0.18, 0.025, 'triangle');
  }
  function sfxShimmer() {
    if (!AC.ctx) return;
    const t0 = AC.ctx.currentTime;
    const notes = [1319, 1568, 1976, 2349, 2637];
    for (let i = 0; i < 6; i++)
      tone(notes[(i + ((Math.random() * 2) | 0)) % notes.length], t0 + i * 0.06, 0.22, 0.03, 'triangle');
    tone(988, t0, 0.09, 0.07, 'triangle');
    tone(1319, t0 + 0.08, 0.3, 0.07, 'triangle');
  }

  // ---- public seam ------------------------------------------------------------------------

  window.onStormExit = (completed) => {
    if (H.active && H.suspended) setTimeout(() => resumeHall(completed), completed ? 800 : 200);
  };

  return {
    enter,
    exit,
    get active() { return H.active; },
    _H: H, // dev hook: lets test drivers position the camera deterministically
  };
})();
