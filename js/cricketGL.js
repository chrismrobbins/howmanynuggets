// ---- 🏏 NUGGET CRICKET: THE POLYGONS --------------------------------------------------------------
// The look of Nugget Blitz's polygon pass, rebuilt for a cricket ground (js/blitz.js "THE POLYGON
// PASS" is the parent: same one-shader WebGL, rigid-part players on bones, Gouraud light, a small
// frame smeared up the screen, the 2D canvas riding on top for the HUD). Everything here is `crk`-
// prefixed and owns its own state (`cricket.gl*`): the two games never share a global (AGENTS.md:
// a later-loaded file wins a name collision — Blitz lost a whole audio file to one).
//
// World units are metres. The pitch runs along z: the striker's stumps at z = −CRK_STUMPZ, the
// bowler's at +CRK_STUMPZ. The TV camera sits behind the bowler looking down −z, so the screen's
// right is −x. A right-handed batter stands side-on facing +x: +x is the OFF side, −x the LEG side.

const CRK_STUMPZ = 10.06, CRK_CREASE = 8.84, CRK_BOUND = 58, CRK_BS = 1.18;
const CRK_CRUST = '#d99a3c', CRK_CRUST_D = '#a8691f', CRK_CRUST_L = '#f0c068';

const CRK_GL_VS = [
  'attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUV;',
  'uniform mat4 uVP; uniform mat4 uM; uniform vec3 uLight; uniform float uAmb; uniform float uLit;',
  'uniform vec3 uTint; uniform vec4 uUVX;',
  'varying vec3 vCol; varying vec2 vUV; varying float vFog;',
  'void main() {',
  '  vec4 wp = uM * vec4(aPos, 1.0);',
  '  vec3 n = normalize((uM * vec4(aNor, 0.0)).xyz);',
  '  float d = max(dot(n, uLight), 0.0);',
  '  float l = mix(1.0, uAmb + (1.0 - uAmb) * d + 0.12 * max(n.y, 0.0), uLit);',
  '  vCol = aCol * uTint * l;',
  '  vUV = aUV * uUVX.xy + uUVX.zw;',
  '  gl_Position = uVP * wp;',
  '  vFog = clamp((gl_Position.w - 90.0) / 260.0, 0.0, 0.5);',
  '}'].join('\n');
const CRK_GL_FS = [
  'precision mediump float;',
  'uniform sampler2D uTex; uniform float uUseTex; uniform vec3 uFog; uniform float uAlpha;',
  'varying vec3 vCol; varying vec2 vUV; varying float vFog;',
  'void main() {',
  '  vec4 t = vec4(1.0);',
  '  if (uUseTex > 0.5) t = texture2D(uTex, vUV);',
  '  if (t.a * uAlpha < 0.01) discard;',
  '  gl_FragColor = vec4(mix(vCol * t.rgb, uFog, vFog), t.a * uAlpha);',
  '}'].join('\n');
const CRK_UV1 = [1, 1, 0, 0];

// ---- little helpers --------------------------------------------------------------------------------
function crkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function crkHash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function crkClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function crkRGB(hex) { return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]; }
function crkK(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
function crkMix(hex, k, to) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex), b = p(to || '#ffffff');
  return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',') + ')';
}
function crkN(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function crkCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function crkGrain(g, w, h, amt, seed) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  let s = seed || 1;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = ((s / 2147483647) - 0.5) * amt;
    d[i] += n; d[i + 1] += n * 1.1; d[i + 2] += n * 0.7;
  }
  g.putImageData(id, 0, 0);
}
// a bone frame: Y along the bone, Z = `ref` squared against it (falls back to `alt`)
function crkFrame(Y, ref, alt) {
  let d = ref[0] * Y[0] + ref[1] * Y[1] + ref[2] * Y[2];
  let Z = [ref[0] - d * Y[0], ref[1] - d * Y[1], ref[2] - d * Y[2]];
  if (Math.hypot(Z[0], Z[1], Z[2]) < 0.25) { d = alt[0] * Y[0] + alt[1] * Y[1] + alt[2] * Y[2]; Z = [alt[0] - d * Y[0], alt[1] - d * Y[1], alt[2] - d * Y[2]]; }
  Z = crkN(Z);
  return [crkCross(Y, Z), Y, Z];
}

// ---- mesh building (the Blitz recipes) ---------------------------------------------------------------
function crkMesh() { return { v: [], i: [], n: 0 }; }
function crkV(m, x, y, z, nx, ny, nz, c, u, v) { m.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], u || 0, v || 0); return m.n++; }
function crkQ(m, a, b, c, d) { m.i.push(a, b, c, a, c, d); }
function crkMQuad(m, p, n, c, uv) {
  const k = [0, 1, 2, 3].map((i) => crkV(m, p[i][0], p[i][1], p[i][2], n[0], n[1], n[2], Array.isArray(c[0]) ? c[i] : c, uv ? uv[i][0] : 0, uv ? uv[i][1] : 0));
  crkQ(m, k[0], k[1], k[2], k[3]);
}
function crkMBox(m, cx, cy, cz, hx, hy, hz, col, faceUV) {
  const F = [
    [[1, 0, 0], [[1, 1, -1], [1, 1, 1], [1, -1, 1], [1, -1, -1]]],
    [[-1, 0, 0], [[-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, -1, 1]]],
    [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
    [[0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
    [[0, 0, 1], [[1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1]]],
    [[0, 0, -1], [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]]],
  ];
  F.forEach(([n, cs], fi) => {
    const r = faceUV && faceUV[fi];
    const uv = r ? [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] : null;
    crkMQuad(m, cs.map((s) => [cx + s[0] * hx, cy + s[1] * hy, cz + s[2] * hz]), n, Array.isArray(col[0]) ? col[fi] : col, uv);
  });
}
function crkMTube(m, L, r0, r1, seg, rings, colFn, cap1) {
  const base = m.n, slope = ((r0[0] + r0[1]) - (r1[0] + r1[1])) * 0.5 / L;
  rings.forEach((t, ri) => {
    const rx = r0[0] + (r1[0] - r0[0]) * t, rz = r0[1] + (r1[1] - r0[1]) * t;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      const n = crkN([sa / rx, slope, ca / rz]);
      crkV(m, sa * rx, t * L, ca * rz, n[0], n[1], n[2], colFn(ri, a, t), s / seg, t);
    }
  });
  for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < seg; s++) { const a = base + r * (seg + 1) + s; crkQ(m, a, a + 1, a + seg + 2, a + seg + 1); }
  if (cap1) {
    const top = base + (rings.length - 1) * (seg + 1), c = crkV(m, 0, L, 0, 0, 1, 0, colFn(rings.length - 1, 0, 1));
    for (let s = 0; s < seg; s++) m.i.push(top + s, top + s + 1, c);
  }
}
function crkMEllip(m, cx, cy, cz, rx, ry, rz, lat, lon, colFn) {
  const base = m.n;
  for (let i = 0; i <= lat; i++) {
    const th = i / lat * Math.PI, sy = Math.cos(th), sr = Math.sin(th);
    for (let j = 0; j <= lon; j++) {
      const ph = j / lon * Math.PI * 2, ux = Math.sin(ph) * sr, uz = Math.cos(ph) * sr;
      const n = crkN([ux / rx, sy / ry, uz / rz]);
      crkV(m, cx + ux * rx, cy + sy * ry, cz + uz * rz, n[0], n[1], n[2], colFn ? colFn(ux, sy, uz) : [1, 1, 1], j / lon, i / lat);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const a = base + i * (lon + 1) + j; crkQ(m, a, a + 1, a + lon + 2, a + lon + 1); }
}
function crkMTorso(m) {
  const R = [[0, 0.19, 0.13], [0.2, 0.21, 0.14], [0.42, 0.25, 0.15], [0.58, 0.26, 0.15], [0.68, 0.17, 0.11]];
  const seg = 8, se = (c) => Math.sign(c) * Math.pow(Math.abs(c), 0.7);
  for (const half of [1, -1]) {
    const base = m.n;
    for (const [y, rx, rz] of R) for (let s = 0; s <= seg; s++) {
      const a = -Math.PI / 2 + s / seg * Math.PI, xa = Math.sin(a), za = Math.cos(a) * half;
      const x = se(xa) * rx, z = se(za) * rz, n = crkN([xa / rx, 0.04, za / rz]);
      crkV(m, x, y, z, n[0], n[1], n[2], [1, 1, 1], 0.5 + (half > 0 ? -x : x) / (2 * 0.6), (0.7 - y) / 0.7);
    }
    for (let r = 0; r < R.length - 1; r++) for (let s = 0; s < seg; s++) { const a = base + r * (seg + 1) + s; crkQ(m, a, a + 1, a + seg + 2, a + seg + 1); }
    const top = base + (R.length - 1) * (seg + 1), c = crkV(m, 0, 0.7, 0, 0, 1, 0, [1, 1, 1], 0.5, 0.02);
    for (let s = 0; s < seg; s++) m.i.push(top + s, top + s + 1, c);
  }
}
// a flat ring in the xz plane (the boundary rope, the 30-yard circle, the stands' lip)
function crkMRing(m, r0, r1, y, seg, col, dash) {
  for (let s = 0; s < seg; s++) {
    if (dash && s % 2) continue;
    const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
    crkMQuad(m, [[Math.sin(a0) * r0, y, Math.cos(a0) * r0], [Math.sin(a1) * r0, y, Math.cos(a1) * r0], [Math.sin(a1) * r1, y, Math.cos(a1) * r1], [Math.sin(a0) * r1, y, Math.cos(a0) * r1]], [0, 1, 0], col);
  }
}

// ---- the GL context ------------------------------------------------------------------------------------
function crkGLInit() {
  const C = cricket;
  if (C.glTried) return !!C.gl;
  C.glTried = true;
  const cv = document.createElement('canvas');
  let gl = null;
  const attrs = { alpha: false, antialias: true, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  try { gl = cv.getContext('webgl', attrs) || cv.getContext('experimental-webgl', attrs); } catch (e) { gl = null; }
  if (!gl) return false;
  const P = crkGLProgram(gl);
  if (!P) return false;
  C.gl = gl; C.glCv = cv;
  C.glr = { P, key: '', ids: 0, last: null, pool: [], pi: 0, draws: [], tex: {}, team: [null, null], sh: null, s: null, cells: [],
    aniso: gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'),
    vp: new Float32Array(16), I: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
  for (const k of ['aPos', 'aNor', 'aCol', 'aUV']) if (P.a[k] >= 0) gl.enableVertexAttribArray(P.a[k]);
  cv.className = 'crk-gl';
  cricketWorld.insertBefore(cv, C.cv || null);
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); C.gl = null; C.glr = null; });
  cv.addEventListener('webglcontextrestored', () => { cv.remove(); C.glCv = null; C.glTried = false; crkGLInit(); });
  crkGLShared();
  return true;
}
function crkGLProgram(gl) {
  const mk = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn('cricket shader:', gl.getShaderInfoLog(sh)); return null; }
    return sh;
  };
  const v = mk(gl.VERTEX_SHADER, CRK_GL_VS), f = mk(gl.FRAGMENT_SHADER, CRK_GL_FS);
  if (!v || !f) return null;
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  const P = { p, a: {}, u: {} };
  for (const k of ['aPos', 'aNor', 'aCol', 'aUV']) P.a[k] = gl.getAttribLocation(p, k);
  for (const k of ['uVP', 'uM', 'uLight', 'uAmb', 'uLit', 'uTint', 'uUVX', 'uTex', 'uUseTex', 'uFog', 'uAlpha']) P.u[k] = gl.getUniformLocation(p, k);
  return P;
}
function crkGLUpload(m) {
  const gl = cricket.gl;
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.i), gl.STATIC_DRAW);
  cricket.glr.last = null;
  return { vb, ib, n: m.i.length, id: ++cricket.glr.ids };
}
function crkGLFree(o) {
  const gl = cricket.gl;
  if (!o) return;
  for (const k in o) { const v = o[k]; if (v && v.vb) { gl.deleteBuffer(v.vb); gl.deleteBuffer(v.ib); } }
}
function crkGLTex(src, repeat) {
  const gl = cricket.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const pot = (n) => (n & (n - 1)) === 0, mip = pot(src.width) && pot(src.height);
  const wrap = repeat && mip ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat === 'u' ? gl.CLAMP_TO_EDGE : wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  const an = cricket.glr.aniso;
  if (an && mip) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}

// ---- textures ------------------------------------------------------------------------------------------
// the outfield: mown stripes across the ground, grainy like an N64 texture
function crkPaintGrass(night) {
  const c = crkCanvas(512, 512), g = c.getContext('2d');
  const a = night ? '#1f4a1c' : '#3c8a2c', b = night ? '#1a4018' : '#347a26';
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 128, 512, 128); }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = crkHash(i * 1.3) > 0.5 ? 'rgba(255,255,200,0.06)' : 'rgba(0,30,0,0.08)';
    g.fillRect(crkHash(i * 2.7) * 512, crkHash(i * 4.1) * 512, 2, 3);
  }
  crkGrain(g, 512, 512, 18, 3);
  return c;
}
// the pitch: a dry strip with the creases painted on (uv: u across 0..1 = x −1.52..1.52, v along 0..1 = z −11..11)
function crkPaintPitch() {
  const w = 256, h = 1024, c = crkCanvas(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, '#b8a070'); gr.addColorStop(0.5, '#d8c494'); gr.addColorStop(1, '#b8a070');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // the rough at each end where the bowlers land, the cracks
  for (const zc of [0.1, 0.9]) { g.fillStyle = 'rgba(120,90,50,0.35)'; g.beginPath(); g.ellipse(w / 2, zc * h, w * 0.32, h * 0.08, 0, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(90,70,40,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = crkHash(i) * w, y = crkHash(i * 3.3) * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (crkHash(i * 7) - 0.5) * 30, y + (crkHash(i * 9) - 0.5) * 30); g.stroke(); }
  crkGrain(g, w, h, 20, 7);
  // creases: z → v = (z + 11) / 22; x → u = (x + 1.524) / 3.048
  const V = (z) => (z + 11) / 22 * h, U = (x) => (x + 1.524) / 3.048 * w;
  g.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    g.fillRect(0, V(s * CRK_CREASE) - 2, w, 4);                          // the popping crease (full width)
    g.fillRect(U(-1.32), V(s * CRK_STUMPZ) - 2, U(1.32) - U(-1.32), 4);   // the bowling crease
    for (const rx of [-1.32, 1.32]) g.fillRect(U(rx) - 2, Math.min(V(s * CRK_CREASE), V(s * 10.95)), 4, Math.abs(V(s * 10.95) - V(s * CRK_CREASE)));   // return creases
  }
  return c;
}
function crkPaintCrowd(A, B) {
  const w = 256, h = 256, c = crkCanvas(w, h), g = c.getContext('2d');
  const pal = [A.c1, A.c1, A.c2, B.c1, B.c1, B.c2, '#e8e0d0', '#f0d860', '#3a6ad8', '#d84a3a', '#2a2a3a', '#8a5aa8', '#ff9a2a', '#2aa84a', '#ffffff'];
  g.fillStyle = '#2a2632'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = '#48404e'; g.fillRect(0, y + 6, w, 2);
    for (let x = 0; x < w; x += 4) {
      if ((x % 64) >= 28 && (x % 64) < 36) continue;
      const r = crkHash(x * 3.7 + y * 11.3 + 0.5);
      if (r < 0.04) continue;
      const shirt = pal[(crkHash(x * 1.9 + y * 7.1) * pal.length) | 0];
      g.fillStyle = shirt; g.fillRect(x, y + 3, 4, 4);
      g.fillStyle = r < 0.65 ? CRK_CRUST : r < 0.85 ? CRK_CRUST_D : '#f0e0b8';
      g.fillRect(x + 1, y + (r > 0.5 ? 0 : 1), 2, 3);
    }
  }
  for (let ax = 28; ax < w; ax += 64) { g.fillStyle = '#9a9aa8'; g.fillRect(ax, 0, 8, h); }
  crkGrain(g, w, h, 14, 5);
  return c;
}
const CRK_ADS = [['NUGGET CRICKET', '#ffd23a', '#7a1a10'], ['DIP HOP NIGHTLY', '#1a1a2a', '#ff5ad8'], ['FRYER OIL CO.', '#e8401a', '#ffffff'],
  ['HOWMANYNUGGETS.COM', '#ffffff', '#c8321f'], ['MASALA DIP', '#2a8a3a', '#fff2a8'], ['NO BALL? NO PROBLEM', '#16307a', '#ffffff'], ['SIX = NUGGETS', '#ff9a2a', '#1a1a1a'], ['GREASE GARAGE', '#3a2a1a', '#ffd23a']];
function crkPaintAds() {
  const c = crkCanvas(1024, 64), g = c.getContext('2d'), sw = 1024 / CRK_ADS.length;
  CRK_ADS.forEach((ad, i) => {
    const x = i * sw;
    g.fillStyle = ad[1]; g.fillRect(x, 0, sw, 64);
    g.font = '900 italic 24px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = ad[2]; g.fillText(ad[0], x + sw / 2, 33, sw - 14);
  });
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 0, 1024, 3);
  return c;
}
// shirts: one cell per player (team × 13), a number and a name stripe, coloured-clothing style
function crkPaintShirts() {
  const C = cricket, c = crkCanvas(1024, 512), g = c.getContext('2d');
  for (let t = 0; t < 2; t++) {
    const T = crkTeam(t), R = C.rosters[t] || [];
    for (let i = 0; i < 16; i++) {
      const idx = t * 16 + i, x = (idx % 8) * 128, y = ((idx / 8) | 0) * 128;
      g.fillStyle = T.c1; g.fillRect(x, y, 128, 128);
      g.fillStyle = T.c2; g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + 128, y + 70); g.lineTo(x + 128, y + 84); g.lineTo(x, y + 44); g.fill();   // the sash
      g.fillStyle = crkMix(T.c1, 0.3, '#000000'); g.fillRect(x, y, 128, 8);
      const num = R[i] ? String(R[i].num) : '';
      if (!num) continue;
      g.font = '900 44px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(num, x + 64, y + 66);
      g.fillStyle = T.num; g.fillText(num, x + 64, y + 66);
    }
  }
  return c;
}
function crkPaintHelmet(T) {
  const w = 256, h = 128, c = crkCanvas(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, crkMix(T.c1, 0.35)); gr.addColorStop(0.5, T.c1); gr.addColorStop(1, crkMix(T.c1, 0.45, '#000000'));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // the badge on the front, the face (a breaded face behind the grille) wrapping the u = 0 seam
  for (const ox of [0, w]) {
    g.fillStyle = '#2a1a0a'; g.beginPath(); g.ellipse(ox, h * 0.66, 36, 22, 0, 0, 7); g.fill();
    g.fillStyle = CRK_CRUST; g.beginPath(); g.ellipse(ox, h * 0.66, 32, 19, 0, 0, 7); g.fill();
    for (const ex of [-11, 11]) { g.fillStyle = '#fff8e8'; g.fillRect(ox + ex - 5, h * 0.6, 10, 8); g.fillStyle = '#141418'; g.fillRect(ox + ex - 2, h * 0.62, 5, 5); }
  }
  g.fillStyle = T.c2; g.beginPath(); g.ellipse(w / 2, h * 0.36, 16, 14, 0, 0, 7); g.fill();
  g.font = '900 italic 20px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = T.c1; g.fillText(T.logo, w / 2, h * 0.37);
  return c;
}
function crkPaintFace() {
  const w = 256, h = 128, c = crkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = CRK_CRUST; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = crkHash(i * 3.3) > 0.5 ? CRK_CRUST_D : CRK_CRUST_L;
    g.beginPath(); g.arc(crkHash(i * 1.7) * w, crkHash(i * 5.3) * h, 1 + crkHash(i * 7.1) * 3, 0, 7); g.fill();
  }
  for (const ox of [0, w]) {
    for (const ex of [-1, 1]) {
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ox + ex * 11, h * 0.45, 8, 9.5, 0, 0, 7); g.fill();
      g.fillStyle = '#141418'; g.beginPath(); g.arc(ox + ex * 13, h * 0.47, 4, 0, 7); g.fill();
      g.strokeStyle = '#5a3008'; g.lineWidth = 3; g.beginPath(); g.moveTo(ox + ex * 5, h * 0.33); g.lineTo(ox + ex * 18, h * 0.3); g.stroke();
    }
    g.fillStyle = '#5a1a0a'; g.beginPath(); g.ellipse(ox, h * 0.66, 12, 7, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#fff'; g.fillRect(ox - 9, h * 0.66, 18, 3);
  }
  return c;
}
function crkPaintBlob() {
  const c = crkCanvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// the aim marker the human bowls at, and the ring under the man you control
function crkPaintMark() {
  const c = crkCanvas(128, 128), g = c.getContext('2d');
  g.lineWidth = 10; g.strokeStyle = 'rgba(255,220,60,0.95)'; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke();
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,90,40,0.9)'; g.beginPath(); g.arc(64, 64, 14, 0, 7); g.fill();
  return c;
}

// ---- shared + per-team meshes ---------------------------------------------------------------------------
function crkSkin(seed) { const r = crkHash(seed), b = crkRGB(CRK_CRUST); return r < 0.14 ? crkK(b, 0.72) : crkK(b, 0.9 + r * 0.24); }
function crkGLShared() {
  const G = cricket.glr, sh = {};
  let m = crkMesh(); crkMTube(m, 0.21, [0.075, 0.07], [0.07, 0.065], 8, [0, 1], (ri, a) => crkSkin(a * 7 + ri)); sh.neck = crkGLUpload(m);
  m = crkMesh();
  crkMTube(m, 0.27, [0.066, 0.062], [0.054, 0.05], 8, [0, 1], (ri, a) => crkSkin(a * 13 + ri * 3));
  crkMEllip(m, 0, 0.31, 0.01, 0.056, 0.07, 0.044, 5, 8, (x, y, z) => crkSkin(x * 31 + y * 17 + z * 11));
  sh.fore = crkGLUpload(m);
  // a batting glove instead of a bare hand (white, chunky)
  m = crkMesh();
  crkMTube(m, 0.27, [0.066, 0.062], [0.056, 0.052], 8, [0, 0.75, 0.75, 1], (ri, a) => (ri >= 2 ? [0.96, 0.96, 0.94] : crkSkin(a * 9)));
  crkMEllip(m, 0, 0.31, 0.01, 0.07, 0.08, 0.06, 5, 8, () => [0.97, 0.97, 0.95]);
  sh.glove = crkGLUpload(m);
  m = crkMesh(); crkMBox(m, 0, 0.09, -0.012, 0.06, 0.12, 0.046, [0.95, 0.95, 0.95]); crkMBox(m, 0, 0.0, -0.012, 0.062, 0.012, 0.05, [0.3, 0.3, 0.32]); sh.shoe = crkGLUpload(m);
  m = crkMesh(); crkMEllip(m, 0, 0, 0.01, 0.17, 0.19, 0.18, 8, 12, null); sh.head = crkGLUpload(m);
  m = crkMesh(); crkMEllip(m, 0, 0, 0.01, 0.19, 0.18, 0.21, 8, 12, null); sh.helmet = crkGLUpload(m);
  // the grille: bars across the face
  m = crkMesh();
  for (const [y, hw] of [[-0.02, 0.12], [-0.075, 0.11], [-0.13, 0.08]]) crkMBox(m, 0, y, 0.205, hw, 0.009, 0.01, [0.75, 0.76, 0.8]);
  for (const sx of [-0.06, 0, 0.06]) crkMBox(m, sx, -0.075, 0.212, 0.008, 0.06, 0.008, [0.75, 0.76, 0.8]);
  sh.grille = crkGLUpload(m);
  // a leg pad: a white slab with the vertical rolls, worn over the shin (bone space: up = knee)
  m = crkMesh();
  for (let i = -2; i <= 2; i++) crkMBox(m, i * 0.034, 0.22, 0.07, 0.018, 0.25, 0.03, [0.97, 0.97, 0.95]);
  crkMBox(m, 0, 0.5, 0.07, 0.095, 0.05, 0.04, [0.97, 0.97, 0.95]);
  sh.pad = crkGLUpload(m);
  // the bat: handle (up the bone from the hands), the blade below, a spine down the back
  m = crkMesh();
  crkMBox(m, 0, -0.14, 0, 0.018, 0.16, 0.018, [0.12, 0.12, 0.14]);           // grip
  crkMBox(m, 0, -0.62, 0, 0.054, 0.33, 0.016, [0.92, 0.82, 0.6]);            // the blade face
  crkMBox(m, 0, -0.6, -0.022, 0.028, 0.3, 0.01, [0.82, 0.7, 0.48]);           // the spine
  crkMBox(m, 0, -0.5, 0.0175, 0.05, 0.06, 0.002, [0.85, 0.15, 0.15]);         // the sticker
  sh.bat = crkGLUpload(m);
  // a sun cap and an umpire's wide brim
  m = crkMesh(); crkMEllip(m, 0, 0.06, 0, 0.18, 0.11, 0.19, 5, 10, null); crkMBox(m, 0, 0.03, 0.2, 0.15, 0.012, 0.09, [1, 1, 1]); sh.cap = crkGLUpload(m);
  m = crkMesh(); crkMEllip(m, 0, 0.09, 0, 0.17, 0.12, 0.18, 5, 10, null); crkMRing(m, 0.17, 0.33, 0.03, 16, [1, 1, 1]); sh.brim = crkGLUpload(m);
  // the keeper's gloves (big brown mitts)
  m = crkMesh(); crkMTube(m, 0.27, [0.066, 0.062], [0.06, 0.056], 8, [0, 0.7, 0.7, 1], (ri, a) => (ri >= 2 ? [0.55, 0.36, 0.18] : crkSkin(a))); crkMEllip(m, 0, 0.32, 0.02, 0.1, 0.11, 0.07, 5, 8, () => [0.6, 0.4, 0.2]); sh.mitt = crkGLUpload(m);
  // the ball: a red cherry with a seam (a white one would vanish on the sight screen)
  m = crkMesh(); crkMEllip(m, 0, 0, 0, 1, 1, 1, 6, 10, (x, y) => (Math.abs(y) < 0.12 ? [0.98, 0.92, 0.88] : [0.78, 0.08, 0.06])); sh.ball = crkGLUpload(m);
  // a stump (one, drawn six times so they can fly) and a bail
  m = crkMesh(); crkMTube(m, 0.71, [0.018, 0.018], [0.018, 0.018], 8, [0, 1], () => [0.96, 0.92, 0.82], true); sh.stump = crkGLUpload(m);
  m = crkMesh(); crkMBox(m, 0, 0, 0, 0.055, 0.01, 0.01, [0.96, 0.92, 0.82]); sh.bail = crkGLUpload(m);
  m = crkMesh(); crkMQuad(m, [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], [0, 1, 0], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]); sh.decal = crkGLUpload(m);
  G.sh = sh;
  G.tex.blob = crkGLTex(crkPaintBlob());
  G.tex.face = crkGLTex(crkPaintFace());
  G.tex.mark = crkGLTex(crkPaintMark());
}
function crkGLTeamMeshes(t) {
  const T = crkTeam(t), c1 = crkRGB(T.c1), c2 = crkRGB(T.c2), trou = crkRGB(T.trou);
  const O = {};
  let m = crkMesh(); crkMTorso(m); O.torso = crkGLUpload(m);
  m = crkMesh(); crkMEllip(m, 0, -0.02, 0, 0.2, 0.15, 0.15, 6, 10, (x, y) => (y > 0.55 ? crkK(trou, 0.6) : trou)); O.pelvis = crkGLUpload(m);
  m = crkMesh(); crkMTube(m, 0.47, [0.115, 0.11], [0.085, 0.082], 10, [0, 1], (ri, a) => (Math.abs(Math.sin(a)) > 0.95 ? c2 : trou)); O.thigh = crkGLUpload(m);
  m = crkMesh(); crkMTube(m, 0.47, [0.08, 0.078], [0.058, 0.056], 10, [0, 1], () => trou); O.shin = crkGLUpload(m);
  m = crkMesh(); crkMTube(m, 0.3, [0.085, 0.08], [0.07, 0.066], 10, [0, 0.45, 0.45, 1], (ri, a, tt) => (ri <= 1 ? c1 : crkSkin(a * 9 + tt * 40))); O.upper = crkGLUpload(m);
  return O;
}

// ---- the ground (static, rebuilt per matchup) -------------------------------------------------------------
function crkGLScene() {
  const S = {}, night = !!cricket.night;
  // the outfield: a big disc, textured in world space (uv = metres / 24)
  let m = crkMesh();
  const R = 76, seg = 48;
  const ctr = crkV(m, 0, 0, 0, 0, 1, 0, [1, 1, 1], 0, 0);
  for (let s = 0; s <= seg; s++) { const a = s / seg * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R; crkV(m, x, 0, z, 0, 1, 0, [1, 1, 1], x / 24, z / 24); }
  for (let s = 0; s < seg; s++) m.i.push(ctr, ctr + 1 + s, ctr + 2 + s);
  S.grass = crkGLUpload(m);
  m = crkMesh(); crkMQuad(m, [[-1.524, 0.01, -11], [1.524, 0.01, -11], [1.524, 0.01, 11], [-1.524, 0.01, 11]], [0, 1, 0], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]); S.pitch = crkGLUpload(m);
  // painted lines: the 30-yard circle (dashed) and the boundary rope
  m = crkMesh(); crkMRing(m, 27.2, 27.6, 0.02, 120, [0.95, 0.95, 0.95], true); S.circle = crkGLUpload(m);
  m = crkMesh(); crkMRing(m, CRK_BOUND, CRK_BOUND + 0.35, 0.06, 96, [0.98, 0.98, 0.98]); S.rope = crkGLUpload(m);
  // the advertising boards (a ring of slats), the fence, the stands rising to a roof, two sight screens
  const ads = crkMesh(), crowd = crkMesh(), props = crkMesh();
  const nb = 64, rb = CRK_BOUND + 4;
  for (let s = 0; s < nb; s++) {
    const a0 = s / nb * Math.PI * 2, a1 = (s + 1) / nb * Math.PI * 2;
    const p = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
    const n = crkN([-Math.sin((a0 + a1) / 2), 0, -Math.cos((a0 + a1) / 2)]);
    const u0 = (s % 8) / 8, u1 = u0 + 1 / 8;
    crkMQuad(ads, [p(a0, rb, 1.1), p(a1, rb, 1.1), p(a1, rb, 0), p(a0, rb, 0)], n, [1, 1, 1], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    // two decks of crowd, a band of boxes between
    for (const [r0, y0, r1, y1, v0] of [[rb + 3, 2.5, rb + 22, 13, 0], [rb + 25, 15, rb + 44, 27, 0]]) {
      const cu0 = s / 4, cu1 = (s + 1) / 4;
      crkMQuad(crowd, [p(a0, r0, y0), p(a1, r0, y0), p(a1, r1, y1), p(a0, r1, y1)], [0, 1, 0], [1, 1, 1], [[cu0, 1], [cu1, 1], [cu1, 0], [cu0, 0]]);
    }
    crkMQuad(props, [p(a0, rb + 22.5, 15), p(a1, rb + 22.5, 15), p(a1, rb + 22.5, 13), p(a0, rb + 22.5, 13)], n, crkRGB('#2a3a7a'));
    crkMQuad(props, [p(a0, rb + 44.5, 31), p(a1, rb + 44.5, 31), p(a1, rb + 44.5, 27), p(a0, rb + 44.5, 27)], n, crkRGB(night ? '#0a0a12' : '#1a1a26'));
    crkMQuad(props, [p(a0, rb + 3, 2.5), p(a1, rb + 3, 2.5), p(a1, rb, 1.1), p(a0, rb, 1.1)], [0, 1, 0], crkRGB('#3a4a3a'));
  }
  // floodlight towers at the four quarters
  for (const a of [0.78, 2.36, 3.93, 5.5]) {
    const x = Math.sin(a) * (rb + 48), z = Math.cos(a) * (rb + 48);
    crkMBox(props, x, 22, z, 0.8, 22, 0.8, crkRGB('#8a8a98'));
    crkMBox(props, x, 46, z, 4, 3, 0.6, crkRGB(night ? '#fff6c8' : '#e8e8f0'));
  }
  // the sight screens behind each bowler's arm (white, so the red ball reads)
  for (const s of [-1, 1]) crkMBox(props, 0, 3.5, s * (rb + 1.5), 9, 3.5, 0.4, crkRGB('#f4f4f0'));
  S.ads = crkGLUpload(ads); S.crowd = crkGLUpload(crowd); S.props = crkGLUpload(props);
  return S;
}
function crkGLBuild(key) {
  const G = cricket.glr, gl = cricket.gl;
  crkGLFree(G.s); crkGLFree(G.team[0]); crkGLFree(G.team[1]);
  for (const k of ['grass', 'pitch', 'crowd', 'ads', 'shirts', 'helm0', 'helm1']) if (G.tex[k]) { gl.deleteTexture(G.tex[k]); G.tex[k] = null; }
  G.s = crkGLScene();
  G.team = [crkGLTeamMeshes(0), crkGLTeamMeshes(1)];
  G.tex.grass = crkGLTex(crkPaintGrass(cricket.night), true);
  G.tex.pitch = crkGLTex(crkPaintPitch());
  G.tex.crowd = crkGLTex(crkPaintCrowd(crkTeam(0), crkTeam(1)), 'u');
  G.tex.ads = crkGLTex(crkPaintAds(), 'u');
  G.tex.shirts = crkGLTex(crkPaintShirts());
  G.tex.helm0 = crkGLTex(crkPaintHelmet(crkTeam(0)));
  G.tex.helm1 = crkGLTex(crkPaintHelmet(crkTeam(1)));
  G.key = key;
}

// ---- the camera, as a matrix (crkProj written out) ----------------------------------------------------------
function crkProj(X, Y, Z) {
  const c = cricket.cam;
  const wx = X - c.x, wz = Z - c.z;
  const dx = wx * c.cyw - wz * c.syw, dy = Y - c.h, dz = wx * c.syw + wz * c.cyw;
  const zc = -dy * c.s + dz * c.c;
  if (zc < 0.3) return null;
  const yc = dy * c.c + dz * c.s, k = cricket.F / zc;
  return { x: cricket.W / 2 + dx * k, y: cricket.cy - yc * k, k, zc };
}
function crkCamTrig(c) { c.s = Math.sin(c.pitch); c.c = Math.cos(c.pitch); c.cyw = Math.cos(c.yaw); c.syw = Math.sin(c.yaw); }
function crkGLMatrix() {
  const C = cricket, c = C.cam, W = C.W, H = C.H, F = C.F, m = C.glr.vp;
  const cw = c.cyw, sw = c.syw, s = c.s, cc = c.c;
  const dxR = [cw, 0, -sw, -(c.x * cw - c.z * sw)], dzR = [sw, 0, cw, -(c.x * sw + c.z * cw)], dyR = [0, 1, 0, -c.h];
  const zc = [0, 0, 0, 0], yc = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) { zc[i] = -s * dyR[i] + cc * dzR[i]; yc[i] = cc * dyR[i] + s * dzR[i]; }
  const n = 0.3, f = 900, a = (f + n) / (f - n), b = -2 * f * n / (f - n), A = 1 - 2 * C.cy / H;
  for (let i = 0; i < 4; i++) {
    m[i * 4] = (2 * F / W) * dxR[i];
    m[i * 4 + 1] = (2 * F / H) * yc[i] + A * zc[i];
    m[i * 4 + 2] = a * zc[i] + (i === 3 ? b : 0);
    m[i * 4 + 3] = zc[i];
  }
  return m;
}
function crkGLSize() {
  const cv = cricket.glCv, vw = window.innerWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
  const h = Math.max(240, Math.round(Math.min(vh * dpr, 640))), w = Math.max(240, Math.round(h * vw / vh));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
function crkGLBind(mesh) {
  const G = cricket.glr;
  if (G.last === mesh) return;
  const gl = cricket.gl, A = G.P.a;
  G.last = mesh;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
  gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 44, 0);
  if (A.aNor >= 0) gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, 44, 12);
  if (A.aCol >= 0) gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, 44, 24);
  if (A.aUV >= 0) gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 44, 36);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
}
function crkGLDraw1(mesh, M, tex, o) {
  const gl = cricket.gl, U = cricket.glr.P.u;
  crkGLBind(mesh);
  gl.uniformMatrix4fv(U.uM, false, M);
  gl.uniform1f(U.uLit, o && o.lit === 0 ? 0 : 1);
  const t = (o && o.tint) || null;
  gl.uniform3f(U.uTint, t ? t[0] : 1, t ? t[1] : 1, t ? t[2] : 1);
  const uv = (o && o.uvx) || CRK_UV1;
  gl.uniform4f(U.uUVX, uv[0], uv[1], uv[2], uv[3]);
  gl.uniform1f(U.uAlpha, o && o.alpha != null ? o.alpha : 1);
  if (tex) { gl.uniform1f(U.uUseTex, 1); gl.bindTexture(gl.TEXTURE_2D, tex); } else gl.uniform1f(U.uUseTex, 0);
  gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
}
function crkGLMat() { const G = cricket.glr; let m = G.pool[G.pi]; if (!m) m = G.pool[G.pi] = new Float32Array(16); G.pi++; return m; }
function crkGLBasis(O, X, Y, Z, sx, sy, sz) {
  const m = crkGLMat();
  m[0] = X[0] * sx; m[1] = X[1] * sx; m[2] = X[2] * sx; m[3] = 0;
  m[4] = Y[0] * sy; m[5] = Y[1] * sy; m[6] = Y[2] * sy; m[7] = 0;
  m[8] = Z[0] * sz; m[9] = Z[1] * sz; m[10] = Z[2] * sz; m[11] = 0;
  m[12] = O[0]; m[13] = O[1]; m[14] = O[2]; m[15] = 1;
  return m;
}

// ---- the body: joints from a pose (Blitz's rig, cricket's poses) --------------------------------------------
// Local space: x to his right, y up, z the way he faces; body units (× CRK_BS = metres).
const CRK_DIRS = { fwd: 1, up: 1, look: 1, chest: 1, bat: 1 };
function crkPose(p) {
  const C = cricket, t = C.t, ph = p.anim * 2.1;
  const sp = Math.hypot(p.vx, p.vz), moving = sp > 0.8 && !p.dive && p.downT <= 0;
  const J = {};
  const A = p.act || '';                       // what he's doing: bat / swing / bowl / keep / field / ump / dive / throw / celeb / walk
  let pel = 1.0, tilt = 0.08, sway = 0, twist = 0, crouch = '';
  if (moving) tilt = 0.28 + Math.min(0.2, sp * 0.02);
  if (!moving && (A === 'bat' || A === 'swing')) { crouch = 'bat'; pel = 0.9; tilt = 0.3; }
  else if (!moving && A === 'keep') { crouch = 'keep'; pel = 0.55; tilt = 0.55; }
  else if (!moving && A === 'field') { crouch = 'field'; pel = 0.86; tilt = 0.42; }
  if (A === 'celeb') { pel = 1.0 + Math.abs(Math.sin(t * 8 + p.seed)) * 0.08; tilt = -0.05; }
  if (moving) pel += Math.abs(Math.sin(ph)) * 0.05 - 0.025;
  // the swing: the trunk winds up and unwinds through the shot
  const sw = A === 'swing' && p.swing ? p.swing : null;
  if (sw) { const u = sw.u; twist = u < 0.35 ? -0.5 * (u / 0.35) : -0.5 + 1.25 * Math.min(1, (u - 0.35) / 0.4); tilt = 0.32 + (sw.loft ? -0.12 : 0.06) * Math.min(1, u * 2); }
  if (A === 'bowl' && p.bowlU != null) { const u = p.bowlU; tilt = u < 0.6 ? 0.25 : 0.25 + (u - 0.6) * 1.4; twist = u < 0.6 ? -0.6 : -0.6 + (u - 0.6) * 3; }
  const ct = Math.cos(tilt), st = Math.sin(tilt), spine = (d) => [sway, pel + d * ct, d * st];
  J.pel = [sway, pel, 0]; J.neck = spine(0.68);
  J.head = [sway, J.neck[1] + 0.21 * Math.cos(tilt * 0.45), J.neck[2] + 0.21 * Math.sin(tilt * 0.45)];
  const shc = spine(0.58);
  // eyes: on the ball (or wherever p.look points)
  J.look = [0, 0, 1];
  if (p.look) {
    const dx = p.look[0] - p.x, dz = p.look[2] - p.z, dy = p.look[1] - (p.y + 1.7);
    const lx = dx * p.fz - dz * p.fx, lz = dx * p.fx + dz * p.fz, a = Math.atan2(lx, lz), hy = crkClamp(a, -1.45, 1.45);
    const hp = crkClamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.9);
    J.look = [Math.sin(hy) * Math.cos(hp), Math.sin(hp), Math.cos(hy) * Math.cos(hp)];
    if (!sw && A !== 'bowl') twist += crkClamp((a - hy) * 0.8, -0.5, 0.5);
  }
  J.chest = [Math.sin(twist), 0, Math.cos(twist)];
  // legs
  for (const sg of [-1, 1]) {
    const phs = ph + (sg > 0 ? Math.PI : 0);
    let th = 0.05, bend = 0.1, hx = sg * 0.15 + sway;
    if (moving) { th = Math.sin(phs) * 0.8; bend = 0.3 + Math.max(0, -Math.cos(phs)) * 1.25; }
    if (crouch === 'bat') { th = sg > 0 ? 0.25 : 0.12; bend = 0.45; hx = sg * 0.24; }     // side-on, knees soft, feet apart
    else if (crouch === 'keep') { th = 1.35; bend = 2.4; hx = sg * 0.24; }
    else if (crouch === 'field') { th = 0.42; bend = 0.8; hx = sg * 0.2; }
    if (sw) { const u = sw.u; if (sg < 0) { th = sw.back ? -0.1 : 0.15 + Math.min(1, u * 2) * 0.55; bend = 0.4; } else { th = sw.back ? 0.45 : -0.05; bend = 0.3; } }   // front foot (left) strides in on a drive
    if (A === 'bowl' && p.bowlU != null && p.bowlU > 0.55) { const u = (p.bowlU - 0.55) / 0.45; th = sg < 0 ? 0.6 - u * 0.4 : -0.2 + u * 0.9; bend = sg < 0 ? 0.1 : 0.8 - u * 0.5; }
    if (A === 'celeb') { th = Math.max(0, Math.sin(t * 8 + p.seed + (sg > 0 ? 0 : Math.PI))) * 0.6; bend = th * 1.2; }
    const hip = [hx, pel, 0];
    const knee = [hx + sg * 0.02, pel - 0.47 * Math.cos(th), 0.47 * Math.sin(th)];
    const foot = [hx + sg * 0.02, knee[1] - 0.47 * Math.cos(th - bend), knee[2] + 0.47 * Math.sin(th - bend)];
    J['hip' + sg] = hip; J['knee' + sg] = knee; J['foot' + sg] = foot; J['toe' + sg] = [foot[0], foot[1] - 0.02, foot[2] + 0.2];
  }
  // arms
  for (const sg of [-1, 1]) {
    const phs = ph + (sg > 0 ? Math.PI : 0);
    const sh = [sway + sg * 0.34 * Math.cos(twist) + shc[2] * Math.sin(twist), shc[1], shc[2] * Math.cos(twist) - sg * 0.34 * Math.sin(twist)];
    const al = moving ? -Math.sin(phs) * 0.85 : 0.15, ab = moving ? 1.3 : 0.35;
    let el = [sh[0] + sg * 0.07, sh[1] - 0.3 * Math.cos(al), sh[2] + 0.3 * Math.sin(al)];
    let hd = [el[0] - sg * 0.02, el[1] - 0.27 * Math.cos(al + ab), el[2] + 0.27 * Math.sin(al + ab)];
    const at = (ex, ey, ez, qx, qy, qz) => { el = [sh[0] + sg * ex, sh[1] + ey, sh[2] + ez]; hd = [sh[0] + sg * qx, sh[1] + qy, sh[2] + qz]; };
    if (crouch === 'field') at(0.06, -0.24, 0.16, 0.02, -0.4, 0.34);
    if (crouch === 'keep') at(0.04, -0.12, 0.3, -0.14, -0.2, 0.55);
    if (A === 'ump') at(0.08, -0.28, 0.02, 0.02, -0.56, 0.06);
    if (A === 'celeb') at(0.14, 0.3, 0.05, 0.1, 0.62, 0.05);
    if (A === 'catch' || A === 'dive') at(0.0, 0.05, 0.3, -0.1, 0.15, 0.58);
    if (A === 'throw' && sg > 0) { const u = p.throwU || 0; if (u < 0.5) at(0.1, 0.2, -0.2, 0.05, 0.48, -0.36); else at(0.06, 0.08, 0.26, -0.04, -0.08, 0.56); }
    if (A === 'umpOut' && sg > 0) at(0.0, 0.3, 0.1, 0.0, 0.62, 0.08);         // the finger goes up
    // batting: both hands together on the handle (crkBatKey gives the hands' point and the bat's line)
    if (p.bat && (crouch === 'bat' || sw)) {
      const K = crkBatKey(p), H = K.h, b = K.b;
      hd = sg < 0 ? [H[0] - b[0] * 0.07, H[1] - b[1] * 0.07, H[2] - b[2] * 0.07] : [H[0] + b[0] * 0.02, H[1] + b[1] * 0.02, H[2] + b[2] * 0.02];
      el = [(sh[0] + hd[0]) / 2 + sg * 0.1, (sh[1] + hd[1]) / 2 - 0.06, (sh[2] + hd[2]) / 2 + 0.04];
    }
    // bowling: the bowling arm (right) windmills over the top at the delivery stride
    if (A === 'bowl' && p.bowlU != null) {
      const u = p.bowlU;
      if (sg > 0) {
        const a = u < 0.6 ? 0.4 : 0.4 + (u - 0.6) / 0.4 * (Math.PI * 1.15);
        el = [sh[0] + 0.06, sh[1] + 0.3 * Math.sin(a - Math.PI / 2) * -1, sh[2] - 0.3 * Math.cos(a - Math.PI / 2) * -1];
        hd = [sh[0] + 0.05, sh[1] - 0.57 * Math.cos(a), sh[2] - 0.57 * Math.sin(a) * -1];
      } else if (u > 0.5) at(0.05, 0.28, 0.12, 0.02, 0.55, 0.22);            // the front arm points up at the target
    }
    J['sh' + sg] = sh; J['el' + sg] = el; J['hd' + sg] = hd;
  }
  // the bat's line from the hands
  if (p.bat) J.bat = (crouch === 'bat' || sw) ? crkBatKey(p).b : [0.1, -0.95, 0.15];
  // dives and falls pitch the figure about the hips
  let pitch = 0, drop = 0;
  if (p.dive) { pitch = 1.35; drop = 0.55; }
  else if (p.downT > 0) { pitch = 1.45; drop = 0.75; }
  J.fwd = [0, 0, 1]; J.up = [0, 1, 0];
  if (pitch) {
    const cs = Math.cos(pitch), sn = Math.sin(pitch);
    for (const k in J) {
      if (CRK_DIRS[k]) continue;
      const v = J[k], bb = v[1] - pel;
      J[k] = [v[0], pel + bb * cs - v[2] * sn - drop, bb * sn + v[2] * cs];
    }
    J.fwd = [0, -sn, cs]; J.up = [0, cs, sn];
    for (const k of ['look', 'chest']) { const v = J[k]; J[k] = [v[0], v[1] * cs - v[2] * sn, v[1] * sn + v[2] * cs]; }
  }
  return J;
}

// THE SWING, as keyframes in his local space. He stands side-on facing the off side (+z local); +x
// local is his right, toward the keeper; the bowler is off his left shoulder (−x). A drive: the
// back-lift goes up toward the keeper, the bat comes down vertical past the front pad (contact),
// then follows through high over the front shoulder. A block stops at the contact frame.
const CRK_BATKEYS = {
  //         hands [x, y, z]          bat line [x, y, z]
  stance:  [[-0.04, 0.96, 0.3], [0.08, -0.95, 0.28]],
  back:    [[0.24, 1.46, 0.1], [0.5, 0.78, -0.38]],
  contact: [[-0.16, 0.92, 0.36], [-0.06, -0.97, 0.24]],
  finish:  [[-0.34, 1.58, 0.14], [-0.72, 0.62, -0.3]],
  loft:    [[-0.3, 1.72, 0.22], [-0.55, 0.8, -0.24]],
};
function crkBatKey(p) {
  const sw = p.act === 'swing' && p.swing ? p.swing : null, K = CRK_BATKEYS;
  if (!sw) return { h: K.stance[0], b: K.stance[1] };
  const u = sw.u, lerp = (A, B, k) => { const e = k * k * (3 - 2 * k); return [0, 1].map((j) => A[j].map((v, i) => v + (B[j][i] - v) * e)); };
  let r;
  if (sw.block) r = u < 0.4 ? lerp(K.stance, [[0.04, 1.08, 0.24], [0.2, -0.6, 0.1]], u / 0.4) : lerp([[0.04, 1.08, 0.24], [0.2, -0.6, 0.1]], K.contact, Math.min(1, (u - 0.4) / 0.25));
  else if (u < 0.3) r = lerp(K.stance, K.back, u / 0.3);
  else if (u < 0.45) r = lerp(K.back, K.contact, (u - 0.3) / 0.15);
  else r = lerp(K.contact, sw.loft ? K.loft : K.finish, Math.min(1, (u - 0.45) / 0.3));
  // the shot's direction swings the follow-through: off-side shots finish more out in front, leg-side more round
  const d = sw.dir || 0;
  if (u > 0.4) { r[0][2] += d * 0.12; r[1][2] += d * 0.3; }
  return { h: r[0], b: crkN(r[1]) };
}

// every part of one man, as draws
function crkGLPlayer(p, out) {
  const C = cricket, G = C.glr, TM = G.team[p.team];
  const J = crkPose(p), sz = CRK_BS * (p.big ? 1.06 : 1);
  const fx = p.fx, fz = p.fz, rx = fz, rz = -fx;
  const Wp = (v) => [p.x + (rx * v[0] + fx * v[2]) * sz, p.y + v[1] * sz, p.z + (rz * v[0] + fz * v[2]) * sz];
  const Dv = (v) => crkN([rx * v[0] + fx * v[2], v[1], rz * v[0] + fz * v[2]]);
  const fwd = Dv(J.fwd), up = Dv(J.up);
  const P = {};
  for (const k in J) if (!CRK_DIRS[k]) P[k] = Wp(J[k]);
  const put = (mesh, O, F, s, sy, tex, uvx, tint) => out.push({ mesh, m: crkGLBasis(O, F[0], F[1], F[2], s, sy, s), tex: tex || null, uvx: uvx || null, tint: tint || null });
  const bone = (a, b, mesh, L0, ref, alt) => {
    const A = P[a], B = P[b], d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], len = Math.hypot(d[0], d[1], d[2]) || 1e-3;
    put(mesh, A, crkFrame([d[0] / len, d[1] / len, d[2] / len], ref, alt), sz, len / L0);
  };
  const spine = crkN([P.neck[0] - P.pel[0], P.neck[1] - P.pel[1], P.neck[2] - P.pel[2]]);
  const tF = crkFrame(spine, fwd, up), cF = J.chest[0] ? crkFrame(spine, Dv(J.chest), up) : tF;
  const ump = p.role === 'ump';
  const cell = ump ? null : (G.cells[p.team * 16 + p.idx] || (G.cells[p.team * 16 + p.idx] = [1 / 8, 1 / 4, ((p.team * 16 + p.idx) % 8) / 8, (((p.team * 16 + p.idx) / 8) | 0) / 4]));
  if (ump) {
    // the umpire: a white coat, dark trousers, the wide hat
    put(TM.torso, P.pel, cF, sz * 1.05, sz, null, null, [0.96, 0.96, 0.94]);
  } else put(TM.torso, P.pel, cF, sz, sz, G.tex.shirts, cell);
  put(TM.pelvis, P.pel, tF, sz, sz, null, null, ump ? [0.25, 0.25, 0.3] : null);
  bone('neck', 'head', G.sh.neck, 0.21, fwd, up);
  const hF = crkFrame(crkN([P.head[0] - P.neck[0], P.head[1] - P.neck[1], P.head[2] - P.neck[2]]), J.look[0] || J.look[1] ? Dv(J.look) : fwd, up);
  const capAt = (k) => [P.head[0] + hF[1][0] * k * sz, P.head[1] + hF[1][1] * k * sz, P.head[2] + hF[1][2] * k * sz];
  if (p.helmet) { put(G.sh.helmet, P.head, hF, sz, sz, p.team ? G.tex.helm1 : G.tex.helm0); put(G.sh.grille, P.head, hF, sz, sz); }
  else {
    put(G.sh.head, P.head, hF, sz, sz, G.tex.face);
    if (ump) put(G.sh.brim, capAt(0.1), hF, sz, sz, null, null, [0.95, 0.95, 0.92]);
    else if (p.role !== 'bowl') put(G.sh.cap, capAt(0.1), hF, sz, sz, null, null, crkRGB(crkTeam(p.team).c1));
  }
  const hand = p.keeper ? G.sh.mitt : p.bat ? G.sh.glove : G.sh.fore;
  for (const sg of [-1, 1]) {
    bone('sh' + sg, 'el' + sg, TM.upper, 0.3, fwd, up);
    bone('el' + sg, 'hd' + sg, hand, 0.27, fwd, up);
    bone('hip' + sg, 'knee' + sg, ump ? TM.thigh : TM.thigh, 0.47, fwd, up);
    bone('knee' + sg, 'foot' + sg, TM.shin, 0.47, fwd, up);
    if (p.pads) bone('foot' + sg, 'knee' + sg, G.sh.pad, 0.47, fwd, up);
    bone('foot' + sg, 'toe' + sg, G.sh.shoe, 0.2, up, fwd);
  }
  // the bat, from the hands
  if (p.bat && J.bat) {
    const H = [(P.hd1[0] + P['hd-1'][0]) / 2, (P.hd1[1] + P['hd-1'][1]) / 2, (P.hd1[2] + P['hd-1'][2]) / 2];
    const d = Dv(J.bat);
    put(G.sh.bat, H, crkFrame([-d[0], -d[1], -d[2]], fwd, up), sz, sz);
  }
}

// ---- one frame -------------------------------------------------------------------------------------------
function crkGLRender() {
  const C = cricket, gl = C.gl, G = C.glr;
  if (!gl || !G) return false;
  crkGLSize();
  const key = C.teams.join('|') + (C.night ? 'n' : '');
  if (G.key !== key) crkGLBuild(key);
  const night = !!C.night, U = G.P.u;
  const fog = night ? [0.04, 0.05, 0.1] : [0.68, 0.8, 0.94];
  gl.viewport(0, 0, C.glCv.width, C.glCv.height);
  gl.clearColor(fog[0], fog[1], fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  gl.useProgram(G.P.p);
  gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uTex, 0);
  gl.uniformMatrix4fv(U.uVP, false, crkGLMatrix());
  const L = crkN([-0.4, 0.84, 0.36]);
  gl.uniform3f(U.uLight, L[0], L[1], L[2]);
  gl.uniform1f(U.uAmb, night ? 0.42 : 0.52);
  gl.uniform3f(U.uFog, fog[0], fog[1], fog[2]);
  G.last = null; G.pi = 0;
  const I = G.I, S = G.s;
  crkGLDraw1(S.grass, I, G.tex.grass, { lit: 0 });
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
  crkGLDraw1(S.pitch, I, G.tex.pitch, { lit: 0 });
  crkGLDraw1(S.circle, I, null, { lit: 0 });
  crkGLDraw1(S.rope, I, null, { lit: 0 });
  gl.disable(gl.POLYGON_OFFSET_FILL);
  crkGLDraw1(S.crowd, I, G.tex.crowd, { lit: 0, tint: night ? [0.6, 0.6, 0.7] : null, uvx: [1, 1, 0, Math.sin(C.t * 15) * 0.004 * Math.min(1, C.crowdJump || 0)] });
  crkGLDraw1(S.ads, I, G.tex.ads, { lit: 0 });
  crkGLDraw1(S.props, I, null, {});
  // the stumps: six of them, each its own transform (they fly when he's bowled)
  for (const st of C.stumps) {
    const up = crkN([Math.sin(st.ax) * Math.cos(st.az) , Math.cos(st.ax) * Math.cos(st.az), Math.sin(st.az)]);
    crkGLDraw1(G.sh.stump, crkGLBasis([st.x, st.y, st.z], crkN(crkCross(up, [0, 0, 1])), up, [0, 0, 1], 1, 1, 1), null, {});
  }
  for (const b of C.bails) crkGLDraw1(G.sh.bail, crkGLBasis([b.x, b.y, b.z], [Math.cos(b.r), Math.sin(b.r), 0], [-Math.sin(b.r), Math.cos(b.r), 0], [0, 0, 1], 1, 1, 1), null, {});
  // shadows, the bowler's aim marker
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4);
  for (const p of C.players) {
    const s = CRK_BS * (p.dive || p.downT > 0 ? 0.95 : 0.55), l = p.dive || p.downT > 0 ? 1.6 : 1;
    crkGLDraw1(G.sh.decal, crkGLBasis([p.x, 0.02, p.z], [p.fz, 0, -p.fx], [0, 1, 0], [p.fx, 0, p.fz], s, 1, s * l), G.tex.blob, { lit: 0 });
  }
  const B = C.ball;
  if (B && B.on) crkGLDraw1(G.sh.decal, crkGLBasis([B.x, 0.02, B.z], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.16 / (1 + B.y * 0.3), 1, 0.16 / (1 + B.y * 0.3)), G.tex.blob, { lit: 0 });
  if (C.aim && C.aim.show) { const pulse = 0.55 + Math.sin(C.t * 8) * 0.05; crkGLDraw1(G.sh.decal, crkGLBasis([C.aim.x, 0.03, C.aim.z], [1, 0, 0], [0, 1, 0], [0, 0, 1], pulse, 1, pulse), G.tex.mark, { lit: 0 }); }
  gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.POLYGON_OFFSET_FILL);
  // the men, grouped by mesh
  const out = G.draws; out.length = 0;
  for (const p of C.players) crkGLPlayer(p, out);
  out.sort((a, b) => a.mesh.id - b.mesh.id);
  for (const d of out) crkGLDraw1(d.mesh, d.m, d.tex, { uvx: d.uvx, tint: d.tint });
  // the ball (a touch oversized so you can follow it, like every cricket game)
  if (B && B.on) {
    const r = 0.11;
    crkGLDraw1(G.sh.ball, crkGLBasis([B.x, B.y, B.z], [1, 0, 0], [0, Math.cos(C.t * 30), Math.sin(C.t * 30)], [0, -Math.sin(C.t * 30), Math.cos(C.t * 30)], r, r, r), null, { lit: 0.6 });
  }
  return true;
}
