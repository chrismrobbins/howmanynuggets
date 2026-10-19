// ---- 🚨 NUGGET ALERT — the renderer ---------------------------------------------------------------
// "try to get graphics quality to at least RA2 standards" — Chris, 2026-10-19.
//
// RA2's look was pre-rendered: voxel tanks and ray-traced buildings, lit by one hard sun from the
// upper left, on a 2:1 isometric grid. We draw it live instead, and higher-res:
//   • an ORTHOGRAPHIC camera at the cart's angle (yaw 45°, pitch ~32°) — no perspective, like the
//     original, so the grid reads and every tank is the same size anywhere on screen
//   • one SUN with a 2048 shadow map (hardware PCF, 4 taps) + a sky/ground hemisphere fill + a little
//     specular on the metal — the "rendered in 3D Studio" sheen
//   • faceted, BEVELED models (AlrMB.box chamfers every edge: light catches the bevels the way it
//     did on the pre-renders) with a per-vertex team-color mask
//   • a soft SHROUD sampled per pixel (world xz → an N×N texture), so the edge of the known world
//     fades instead of stepping
//   • one batched billboard pass for fire, smoke, sparks, tesla bolts, tracers and ground decals
// WebGL2 only (no libraries); without it the game says so instead of starting.

const ALR_SHADOW = 2048;

// ---- math (column-major 4×4, Float32Array) ---------------------------------------------------------
function alrM4() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function alrMul(a, b, o) {
  o = o || new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function alrOrtho(l, r, b, t, n, f) {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
  return m;
}
function alrN3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function alrCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function alrDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function alrLookAt(eye, at, up) {
  const z = alrN3([eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]]), x = alrN3(alrCross(up, z)), y = alrCross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -alrDot(x, eye);
  m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -alrDot(y, eye);
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -alrDot(z, eye);
  m[15] = 1;
  return m;
}
// translate · rotateY(yaw) · rotateX(pitch) · scale — every placement in the game is one of these
function alrTRS(x, y, z, yaw, sx, sy, sz, pitch, roll) {
  const cy = Math.cos(yaw || 0), syw = Math.sin(yaw || 0);
  const cp = Math.cos(pitch || 0), sp = Math.sin(pitch || 0);
  const cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
  sx = sx == null ? 1 : sx; sy = sy == null ? sx : sy; sz = sz == null ? sx : sz;
  // R = Ry · Rx · Rz
  const r00 = cy * cr + syw * sp * sr, r01 = -cy * sr + syw * sp * cr, r02 = syw * cp;
  const r10 = cp * sr, r11 = cp * cr, r12 = -sp;
  const r20 = -syw * cr + cy * sp * sr, r21 = syw * sr + cy * sp * cr, r22 = cy * cp;
  const m = new Float32Array(16);
  m[0] = r00 * sx; m[1] = r10 * sx; m[2] = r20 * sx;
  m[4] = r01 * sy; m[5] = r11 * sy; m[6] = r21 * sy;
  m[8] = r02 * sz; m[9] = r12 * sz; m[10] = r22 * sz;
  m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
  return m;
}
function alrXform(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }

// ---- the mesh builder -------------------------------------------------------------------------------
// Positions, normals (flat per face), colors (rgb + a = team mask). A small transform stack places
// parts; every primitive is built in local space and pushed through it.
class AlrMB {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.M = alrM4(); this.st = []; this.col = [1, 1, 1, 0]; }
  color(hex, team, mul) {
    const v = typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex, m = mul == null ? 1 : mul;
    this.col = [((v >> 16) & 255) / 255 * m, ((v >> 8) & 255) / 255 * m, (v & 255) / 255 * m, team ? team : 0];
    return this;
  }
  push() { this.st.push(this.M); this.M = new Float32Array(this.M); return this; }
  pop() { this.M = this.st.pop(); return this; }
  at(x, y, z, yaw, pitch, roll) { this.M = alrMul(this.M, alrTRS(x, y, z, yaw || 0, 1, 1, 1, pitch || 0, roll || 0)); return this; }
  scale(sx, sy, sz) { this.M = alrMul(this.M, alrTRS(0, 0, 0, 0, sx, sy == null ? sx : sy, sz == null ? sx : sz)); return this; }
  // a face: points in local space, auto normal, fan-triangulated (convex)
  face(pts, uv) {
    const M = this.M, w = pts.map((q) => alrXform(M, q));
    // Newell's normal: sums over every edge, so a face with a repeated point (a cone's apex) still gets
    // a real normal — the cross of its first two edges was zero there, NaN after normalizing, and black
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < w.length; k++) {
      const a = w[k], b = w[(k + 1) % w.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 1e-12) return this;
    const nrm = alrN3([nx, ny, nz]);
    const b = this.p.length / 3;
    w.forEach((q, k) => { this.p.push(q[0], q[1], q[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(...this.col); this.u.push(uv ? uv[k][0] : 0, uv ? uv[k][1] : 0); });
    for (let k = 1; k < w.length - 1; k++) this.i.push(b, b + k, b + k + 1);
    return this;
  }
  // a box centered at (x,y,z) with half sizes, every edge chamfered by e (the pre-render look)
  box(x, y, z, hx, hy, hz, e) {
    e = Math.min(e == null ? 0.02 : e, hx * 0.45, hy * 0.45, hz * 0.45);
    const P = (sx, sy, sz, ox, oy, oz) => [x + sx * (hx - ox), y + sy * (hy - oy), z + sz * (hz - oz)];
    if (e <= 0.0005) {
      const f = (a, b, c, d) => this.face([a, b, c, d]);
      const v = (sx, sy, sz) => [x + sx * hx, y + sy * hy, z + sz * hz];
      f(v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)); f(v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), v(-1, -1, -1));
      f(v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)); f(v(-1, -1, 1), v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1));
      f(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)); f(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1));
      return this;
    }
    // six faces, inset
    const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    for (const [ax, s] of faces) {
      const q = [];
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const sv = [0, 0, 0], ov = [e, e, e]; sv[ax] = s; ov[ax] = 0; sv[a1] = u; sv[a2] = v;
        q.push(P(sv[0], sv[1], sv[2], ov[0], ov[1], ov[2]));
      }
      if (s < 0) q.reverse();
      this.face(q);
    }
    // twelve edge bevels
    for (let ax = 0; ax < 3; ax++) {
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        const q = [];
        for (const [t, k] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
          const sv = [0, 0, 0], ov = [0, 0, 0];
          sv[ax] = t; ov[ax] = e; sv[a1] = s1; sv[a2] = s2;
          if (k === 0) { ov[a1] = 0; ov[a2] = e; } else { ov[a1] = e; ov[a2] = 0; }
          q.push(P(sv[0], sv[1], sv[2], ov[0], ov[1], ov[2]));
        }
        if (s1 * s2 < 0) q.reverse();
        this.face(q);
      }
    }
    // eight corners
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const t = [P(sx, sy, sz, 0, e, e), P(sx, sy, sz, e, 0, e), P(sx, sy, sz, e, e, 0)];
      if (sx * sy * sz < 0) t.reverse();
      this.face(t);
    }
    return this;
  }
  // a cylinder / frustum along local Y from y0 to y1, radii r0 → r1, n sides (faceted, flat-shaded)
  cyl(x, y0, z, r0, y1, r1, n, caps) {
    n = n || 12; caps = caps == null ? 3 : caps;
    const ring = (y, r) => { const a = []; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; a.push([x + Math.cos(t) * r, y, z + Math.sin(t) * r]); } return a; };
    const A = ring(y0, r0), B = ring(y1, r1);
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; this.face([A[k], B[k], B[k2], A[k2]]); }
    if (caps & 2 && r1 > 0.001) this.face(B.slice().reverse());
    if (caps & 1 && r0 > 0.001) this.face(A.slice());
    return this;
  }
  // a cylinder lying along local X (wheels, barrels, pipes): centered, length L
  rod(x, y, z, r, L, n, axis) {
    this.push();
    if (axis === 'z') this.at(x, y, z, 0, Math.PI / 2, 0); else this.at(x, y, z, 0, 0, Math.PI / 2);
    this.cyl(0, -L / 2, 0, r, L / 2, r, n || 10);
    this.pop();
    return this;
  }
  // a low-poly sphere (ico-ish, lat/long with few bands)
  ball(x, y, z, r, seg, ry) {
    seg = seg || 8; ry = ry == null ? r : ry;
    const rows = Math.max(3, seg >> 1);
    const pt = (i, j) => { const th = i / rows * Math.PI, ph = j / seg * Math.PI * 2; return [x + Math.sin(th) * Math.cos(ph) * r, y + Math.cos(th) * ry, z + Math.sin(th) * Math.sin(ph) * r]; };
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (i === 0) this.face([a, c, b]); else if (i === rows - 1) this.face([a, d, b]); else this.face([a, d, c, b]);
    }
    return this;
  }
  // a wedge: a box whose top slopes down toward -z by drop (armor glacis, roofs)
  wedge(x, y, z, hx, hy, hz, drop) {
    const v = (sx, sy, sz) => [x + sx * hx, y + sy * hy - (sy > 0 && sz < 0 ? drop : 0), z + sz * hz];
    const f = (a, b, c, d) => this.face([a, b, c, d]);
    f(v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)); f(v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), v(-1, -1, -1));
    f(v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)); f(v(-1, -1, 1), v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1));
    f(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)); f(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1));
    return this;
  }
  bake(gl) { return alrGLMesh(this); }
}

// ---- GL plumbing ------------------------------------------------------------------------------------
const alrGL = { gl: null, ok: false };

const ALR_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=3) in vec2 aUV;
uniform mat4 uVP, uM, uLVP;
out vec3 vN; out vec4 vC; out vec3 vW; out vec4 vL; out vec2 vUV;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vW = w.xyz; vN = mat3(uM) * aNor; vC = aCol; vUV = aUV; vL = uLVP * w;
  gl_Position = uVP * w;
}`;
const ALR_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec4 vC; in vec3 vW; in vec4 vL; in vec2 vUV;
uniform sampler2DShadow uShadow; uniform sampler2D uTex; uniform sampler2D uShroud; uniform sampler2D uDetail;
uniform vec3 uSun, uSunCol, uSky, uGround, uTeam, uView, uAdd;
uniform float uUseTex, uSpec, uAlpha, uN, uTexel, uNoShroud, uDesat;
out vec4 o;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float shade() {
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  p.z -= 0.0012;
  float d = uTexel * 0.85, s = 0.0;
  s += texture(uShadow, vec3(p.xy + vec2(-d, -d), p.z));
  s += texture(uShadow, vec3(p.xy + vec2( d, -d), p.z));
  s += texture(uShadow, vec3(p.xy + vec2(-d,  d), p.z));
  s += texture(uShadow, vec3(p.xy + vec2( d,  d), p.z));
  return s * 0.25;
}
void main() {
  vec3 base = vC.rgb;
  float lum = dot(vC.rgb, vec3(0.3, 0.59, 0.11));
  base = mix(base, uTeam * (0.25 + 1.05 * lum), vC.a);
  if (uUseTex > 0.5) {
    base = texture(uTex, vUV).rgb * vC.rgb;
    // the close-up grain: a tiled detail texture over the painted ground
    float dt = texture(uDetail, vW.xz * 0.45).r * 0.6 + texture(uDetail, vW.xz * 0.13 + 0.37).r * 0.4;
    base *= 0.64 + 0.72 * dt;
  } else {
    // weathering: two octaves of world-space noise so no panel is a flat color, and the grime that
    // collects low on every wall (the pre-renders were never clean)
    float g = vnoise(vW * 9.0) * 0.6 + vnoise(vW * 31.0) * 0.4;
    base *= 0.9 + 0.2 * g;
    base *= mix(0.72, 1.0, clamp(vW.y / 0.22, 0.0, 1.0));
  }
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = max(dot(n, uSun), 0.0);
  float sh = shade();
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 c = base * (amb + uSunCol * ndl * sh);
  vec3 h = normalize(uSun + uView);
  c += uSunCol * pow(max(dot(n, h), 0.0), 28.0) * uSpec * sh;
  c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uDesat);
  c += uAdd;
  vec2 su = vW.xz / uN;
  float f = 1.0;
  if (uNoShroud < 0.5) f = (su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) ? 0.0 : texture(uShroud, su).r;
  o = vec4(c * f, uAlpha);
}`;
const ALR_SVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP, uM;
void main() { gl_Position = uLVP * uM * vec4(aPos, 1.0); }`;
const ALR_SFS = `#version 300 es
precision mediump float; out vec4 o; void main() { o = vec4(1.0); }`;
// billboards + world quads: CPU builds every vertex; the VS only expands camera-facing ones
const ALR_PVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aOff; layout(location=2) in vec2 aUV; layout(location=3) in vec4 aCol;
uniform mat4 uVP; uniform vec3 uRight, uUp;
out vec2 vUV; out vec4 vC; out vec3 vW;
void main() {
  vec3 w = aPos + uRight * aOff.x + uUp * aOff.y;
  vUV = aUV; vC = aCol; vW = w;
  gl_Position = uVP * vec4(w, 1.0);
}`;
const ALR_PFS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vC; in vec3 vW;
uniform sampler2D uAtlas; uniform sampler2D uShroud; uniform float uN;
out vec4 o;
void main() {
  vec4 t = texture(uAtlas, vUV);
  vec2 su = vW.xz / uN;
  float f = (su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) ? 0.0 : texture(uShroud, su).r;
  o = vec4(t.rgb * vC.rgb, t.a * vC.a) * vec4(vec3(f), 1.0);
  o.a *= f;
}`;

function alrGLProgram(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('alert shader', gl.getShaderInfoLog(s)); return null; } return s; };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('alert link', gl.getProgramInfoLog(p)); return null; }
  const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) { const a = gl.getActiveUniform(p, k); U[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, U };
}

function alrGLMesh(mb) {
  const gl = alrGL.gl;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = (data, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
  buf(mb.p, 0, 3); buf(mb.n, 1, 3); buf(mb.c, 2, 4); buf(mb.u, 3, 2);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  const big = mb.p.length / 3 > 65535;
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(mb.i) : new Uint16Array(mb.i), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, n: mb.i.length, it: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, tris: mb.i.length / 3 };
}

function alrGLInit(cv) {
  let gl = null;
  try { gl = cv.getContext('webgl2', { antialias: true, alpha: false, depth: true, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  const G = alrGL;
  G.gl = gl;
  G.lit = alrGLProgram(gl, ALR_VS, ALR_FS);
  G.sh = alrGLProgram(gl, ALR_SVS, ALR_SFS);
  G.part = alrGLProgram(gl, ALR_PVS, ALR_PFS);
  if (!G.lit || !G.sh || !G.part) return false;
  // the shadow map
  G.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.shTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, ALR_SHADOW, ALR_SHADOW);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  G.shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.shFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, G.shTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // a 1×1 white texture for untextured draws
  G.white = alrGLTexData(1, 1, new Uint8Array([255, 255, 255, 255]), false);
  G.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  // the particle batch
  G.pCap = 60000; G.pData = new Float32Array(G.pCap * 11); G.pn = 0; G.pAdd = 0;
  G.pVao = gl.createVertexArray(); gl.bindVertexArray(G.pVao);
  G.pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.pBuf); gl.bufferData(gl.ARRAY_BUFFER, G.pData.byteLength, gl.DYNAMIC_DRAW);
  const st = 11 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, st, 28);
  gl.bindVertexArray(null);
  G.atlas = alrGLTexCanvas(alrAtlasCanvas(), true);
  G.detail = alrGLTexCanvas(alrDetailCanvas(), true);
  gl.bindTexture(gl.TEXTURE_2D, G.detail); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  G.queue = []; G.shroud = null;
  G.ok = true;
  return true;
}

function alrGLTexData(w, h, data, linear) {
  const gl = alrGL.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function alrGLTexCanvas(cv, mips) {
  const gl = alrGL.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  if (mips) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (mips && alrGL.aniso) gl.texParameterf(gl.TEXTURE_2D, alrGL.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  return t;
}
// the shroud: one byte per tile, linear-filtered so the edge is soft
function alrGLShroud(N, bytes) {
  const gl = alrGL.gl, G = alrGL;
  if (!G.shroud || G.shroudN !== N) {
    G.shroud = gl.createTexture(); G.shroudN = N;
    gl.bindTexture(gl.TEXTURE_2D, G.shroud);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return;
  }
  gl.bindTexture(gl.TEXTURE_2D, G.shroud);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RED, gl.UNSIGNED_BYTE, bytes);
}

// The particle atlas: 4×2 cells of 128px. 0 glow · 1 smoke · 2 beam · 3 solid · 4 ring · 5 scorch · 6 spark · 7 flame
function alrAtlasCanvas() {
  const S = 128, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S * 2;
  const g = cv.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * S, ((i / 4) | 0) * S); fn(g); g.restore(); };
  cell(0, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 62); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); });
  cell(1, (g) => {
    // a lumpy smoke puff: overlapping soft blobs
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 26; k++) {
      const a = rnd() * 6.283, d = rnd() * 30, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, rr = 18 + rnd() * 22;
      const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,0.32)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, S, S);
    }
  });
  cell(2, (g) => { const r = g.createLinearGradient(0, 0, 0, S); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.42, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(0.58, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); });
  cell(3, (g) => { g.fillStyle = '#fff'; g.fillRect(2, 2, S - 4, S - 4); });
  cell(4, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); });
  cell(5, (g) => {
    let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 62); r.addColorStop(0, 'rgba(20,14,10,0.9)'); r.addColorStop(0.6, 'rgba(25,18,12,0.55)'); r.addColorStop(1, 'rgba(30,20,12,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(10,8,6,0.5)';
    for (let k = 0; k < 18; k++) { const a = rnd() * 6.283, d = 20 + rnd() * 40; g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + rnd() * 7, 2 + rnd() * 3, a, 0, 7); g.fill(); }
  });
  cell(6, (g) => { const r = g.createLinearGradient(0, 64, S, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(64, 64, 62, 9, 0, 0, 7); g.fill(); });
  cell(7, (g) => {
    let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 14; k++) {
      const x = 64 + (rnd() - 0.5) * 50, y = 70 + (rnd() - 0.5) * 50, rr = 14 + rnd() * 26;
      const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, S, S);
    }
  });
  return cv;
}
// the ground's close-up grain: 256² of tileable noise (pebbles, soil grain), grey around 0.5
function alrDetailCanvas() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), id = g.createImageData(S, S);
  let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lat = new Float32Array(32 * 32).map(() => r());
  const at = (x, y) => lat[((y & 31) << 5) | (x & 31)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / 8, v = y / 8, xi = Math.floor(u), yi = Math.floor(v), fx = u - xi, fy = v - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const n = (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
    const v8 = Math.max(0, Math.min(255, (0.35 + n * 0.3 + (r() - 0.5) * 0.28) * 255));
    const o = (y * S + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v8; id.data[o + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  // pebbles: dark specks with a light edge (wrapped so the tile repeats cleanly)
  for (let k = 0; k < 420; k++) {
    const x = r() * S, y = r() * S, rr = 0.8 + r() * 2.2;
    for (const [ox, oy] of [[0, 0], [S, 0], [0, S], [-S, 0], [0, -S]]) {
      g.fillStyle = 'rgba(40,40,40,0.55)'; g.beginPath(); g.arc(x + ox, y + oy, rr, 0, 7); g.fill();
      g.fillStyle = 'rgba(230,230,230,0.35)'; g.beginPath(); g.arc(x + ox - rr * 0.3, y + oy - rr * 0.3, rr * 0.5, 0, 7); g.fill();
    }
  }
  return cv;
}
const ALR_CELL = (i) => [(i % 4) * 0.25, ((i / 4) | 0) * 0.5];

// ---- the camera --------------------------------------------------------------------------------------
// cam = { x, z (ground target), zoom (world units of view height), yaw, pitch, w, h (px) }
function alrGLCamera(cam) {
  const G = alrGL;
  const d = 60, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const fx = Math.sin(cam.yaw) * cp, fz = Math.cos(cam.yaw) * cp;        // horizontal part of the view direction
  const eye = [cam.x - fx * d, sp * d, cam.z - fz * d];
  G.eye = eye; G.fwd = alrN3([fx, -sp, fz]);
  const V = alrLookAt(eye, [cam.x, 0, cam.z], [0, 1, 0]);
  const hh = cam.zoom / 2, hw = hh * cam.w / cam.h;
  const P = alrOrtho(-hw, hw, -hh, hh, 1, 160);
  G.V = V; G.P = P; G.VP = alrMul(P, V);
  G.right = alrN3([V[0], V[4], V[8]]); G.up = alrN3([V[1], V[5], V[9]]);
  G.cam = cam;
  // the sun: from the upper left of the screen, high (RA2's light came from the north-west)
  const sun = alrN3([-0.55, 0.78, -0.3]);
  G.sun = sun;
  // the shadow camera: an ortho box around what's on screen, snapped to texels so shadows don't crawl
  const R = Math.max(hw, hh) * 1.55 + 4;
  const lc = [cam.x, 0, cam.z];
  const LV = alrLookAt([lc[0] + sun[0] * 50, sun[1] * 50, lc[2] + sun[2] * 50], lc, [0, 1, 0]);
  const texel = 2 * R / ALR_SHADOW;
  LV[12] = Math.round(LV[12] / texel) * texel; LV[13] = Math.round(LV[13] / texel) * texel;
  G.LVP = alrMul(alrOrtho(-R, R, -R, R, 1, 110), LV);
}
// screen px → ground (y = 0)
function alrGLPick(px, py) {
  const G = alrGL, cam = G.cam;
  const hh = cam.zoom / 2, hw = hh * cam.w / cam.h;
  const nx = (px / cam.w) * 2 - 1, ny = 1 - (py / cam.h) * 2;
  const o = [G.eye[0] + G.right[0] * nx * hw + G.up[0] * ny * hh, G.eye[1] + G.right[1] * nx * hw + G.up[1] * ny * hh, G.eye[2] + G.right[2] * nx * hw + G.up[2] * ny * hh];
  const t = -o[1] / G.fwd[1];
  return [o[0] + G.fwd[0] * t, o[2] + G.fwd[2] * t];
}
// world → screen px
function alrGLProject(x, y, z) {
  const M = alrGL.VP, cam = alrGL.cam;
  const cx = M[0] * x + M[4] * y + M[8] * z + M[12], cy = M[1] * x + M[5] * y + M[9] * z + M[13];
  return [(cx * 0.5 + 0.5) * cam.w, (0.5 - cy * 0.5) * cam.h];
}

// ---- the draw queue -----------------------------------------------------------------------------------
// o = { team: [r,g,b], spec, alpha, add: [r,g,b], tex, noShadow, noCast, desat, noShroud }
function alrGLDraw(mesh, M, o) { alrGL.queue.push({ mesh, M, o: o || {} }); }

// particles: a camera-facing quad. x,y,z world · size (world) · rot · rgba · cell · additive
function alrGLSprite(x, y, z, size, rot, r, g, b, a, cell, add) {
  const G = alrGL, P = add ? G.pvA : G.pvB;
  if (P.length > G.pCap * 11 - 66) return;
  const [u0, v0] = ALR_CELL(cell), du = 0.25, dv = 0.5;
  const c = Math.cos(rot), s = Math.sin(rot), hs = size / 2;
  const corner = (cx, cy, u, v) => P.push(x, y, z, (cx * c - cy * s) * hs, (cx * s + cy * c) * hs, u0 + u * du, v0 + v * dv, r, g, b, a);
  corner(-1, -1, 0.02, 0.98); corner(1, -1, 0.98, 0.98); corner(1, 1, 0.98, 0.02);
  corner(-1, -1, 0.02, 0.98); corner(1, 1, 0.98, 0.02); corner(-1, 1, 0.02, 0.02);
}
// a beam from a to b (tesla bolts, tracers, prism light), width w, facing the camera
function alrGLBeam(a, b, w, r, g, bl, al, cell) {
  const G = alrGL, f = G.fwd;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const side = alrN3(alrCross(d, f));
  const hw = w / 2, sx = side[0] * hw, sy = side[1] * hw, sz = side[2] * hw;
  const [u0, v0] = ALR_CELL(cell == null ? 2 : cell), du = 0.25, dv = 0.5;
  const P = G.pvA;
  const v = (x, y, z, u, vv) => P.push(x, y, z, 0, 0, u0 + u * du, v0 + vv * dv, r, g, bl, al);
  v(a[0] - sx, a[1] - sy, a[2] - sz, 0.1, 0.02); v(b[0] - sx, b[1] - sy, b[2] - sz, 0.9, 0.02); v(b[0] + sx, b[1] + sy, b[2] + sz, 0.9, 0.98);
  v(a[0] - sx, a[1] - sy, a[2] - sz, 0.1, 0.02); v(b[0] + sx, b[1] + sy, b[2] + sz, 0.9, 0.98); v(a[0] + sx, a[1] + sy, a[2] + sz, 0.1, 0.98);
}
// a flat quad on the ground (decals, footprints, selection rings): center, half sizes, rotation, cell
function alrGLGround(x, z, hx, hz, rot, r, g, b, a, cell, add, y) {
  const G = alrGL, P = add ? G.pvA : G.pvB, c = Math.cos(rot || 0), s = Math.sin(rot || 0), yy = y == null ? 0.02 : y;
  const [u0, v0] = ALR_CELL(cell), du = 0.25, dv = 0.5;
  const v = (lx, lz, u, vv) => P.push(x + lx * c - lz * s, yy, z + lx * s + lz * c, 0, 0, u0 + u * du, v0 + vv * dv, r, g, b, a);
  v(-hx, -hz, 0.02, 0.02); v(hx, -hz, 0.98, 0.02); v(hx, hz, 0.98, 0.98);
  v(-hx, -hz, 0.02, 0.02); v(hx, hz, 0.98, 0.98); v(-hx, hz, 0.02, 0.98);
}

function alrGLBegin() { const G = alrGL; G.queue.length = 0; G.pvA = []; G.pvB = []; G.pn = 0; G.pAdd = 0; G.decals = []; }

// render everything queued: shadow pass, lit pass, then the decal/smoke (alpha) and glow (additive) batches
function alrGLRender(N, light) {
  const G = alrGL, gl = G.gl, cam = G.cam;
  const L = light || {};
  // 1) shadows
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.shFB);
  gl.viewport(0, 0, ALR_SHADOW, ALR_SHADOW);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 4.0);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(G.sh.p);
  gl.uniformMatrix4fv(G.sh.U.uLVP, false, G.LVP);
  for (const q of G.queue) {
    if (q.o.noCast || (q.o.alpha != null && q.o.alpha < 0.99)) continue;
    gl.uniformMatrix4fv(G.sh.U.uM, false, q.M);
    gl.bindVertexArray(q.mesh.vao); gl.drawElements(gl.TRIANGLES, q.mesh.n, q.mesh.it, 0);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // 2) the world, lit
  const dpr = cam.dpr || 1;
  gl.viewport(0, 0, Math.round(cam.w * dpr), Math.round(cam.h * dpr));
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.CULL_FACE);
  const P = G.lit, U = P.U;
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(U.uVP, false, G.VP); gl.uniformMatrix4fv(U.uLVP, false, G.LVP);
  gl.uniform3fv(U.uSun, G.sun);
  gl.uniform3fv(U.uSunCol, L.sun || [1.08, 1.0, 0.88]);
  gl.uniform3fv(U.uSky, L.sky || [0.5, 0.56, 0.66]);
  gl.uniform3fv(U.uGround, L.ground || [0.32, 0.29, 0.22]);
  gl.uniform3fv(U.uView, [-G.fwd[0], -G.fwd[1], -G.fwd[2]]);
  gl.uniform1f(U.uN, N); gl.uniform1f(U.uTexel, 1 / ALR_SHADOW);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.shTex); gl.uniform1i(U.uShadow, 0);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.shroud); gl.uniform1i(U.uShroud, 2);
  gl.uniform1i(U.uTex, 1);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.detail || G.white); gl.uniform1i(U.uDetail, 3);
  const opaque = [], ghost = [];
  for (const q of G.queue) (q.o.alpha != null && q.o.alpha < 0.99 ? ghost : opaque).push(q);
  const one = (q) => {
    const o = q.o;
    gl.uniformMatrix4fv(U.uM, false, q.M);
    gl.uniform3fv(U.uTeam, o.team || [0.8, 0.8, 0.8]);
    gl.uniform1f(U.uSpec, o.spec == null ? 0.25 : o.spec);
    gl.uniform1f(U.uAlpha, o.alpha == null ? 1 : o.alpha);
    gl.uniform3fv(U.uAdd, o.add || [0, 0, 0]);
    gl.uniform1f(U.uDesat, o.desat || 0);
    gl.uniform1f(U.uNoShroud, o.noShroud ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, o.tex || G.white);
    gl.uniform1f(U.uUseTex, o.tex ? 1 : 0);
    gl.bindVertexArray(q.mesh.vao); gl.drawElements(gl.TRIANGLES, q.mesh.n, q.mesh.it, 0);
  };
  gl.disable(gl.BLEND);
  for (const q of opaque) one(q);
  // 3) the batches: decals + smoke (alpha), then ghosts, then glow (additive)
  gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
  const PP = G.part;
  const batch = (arr, add) => {
    if (!arr.length) return;
    const f = new Float32Array(arr);
    gl.useProgram(PP.p);
    gl.uniformMatrix4fv(PP.U.uVP, false, G.VP);
    gl.uniform3fv(PP.U.uRight, G.right); gl.uniform3fv(PP.U.uUp, G.up); gl.uniform1f(PP.U.uN, N);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.atlas); gl.uniform1i(PP.U.uAtlas, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.shroud); gl.uniform1i(PP.U.uShroud, 2);
    gl.bindVertexArray(G.pVao); gl.bindBuffer(gl.ARRAY_BUFFER, G.pBuf);
    const n = Math.min(f.length / 11, G.pCap);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f, 0, n * 11);
    gl.blendFunc(gl.SRC_ALPHA, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  };
  batch(G.pvB, false);
  if (ghost.length) {
    gl.useProgram(P.p); gl.depthMask(true);
    // (the particle pass left the atlas on unit 0, where the lit shader's shadow sampler lives: a
    // non-depth texture there makes every draw silently fail — put the shadow map back)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.shTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.shroud);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const q of ghost) one(q);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
  }
  batch(G.pvA, true);
  gl.depthMask(true); gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

// ---- cameos: a model rendered once into a small picture for the sidebar --------------------------------
// parts: [{ mesh, M }], team color; returns a canvas
function alrGLCameo(parts, team, w, h, zoom, bg) {
  const G = alrGL, gl = G.gl;
  w = w || 128; h = h || 96;
  const fb = gl.createFramebuffer(), tex = gl.createTexture(), rb = gl.createRenderbuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w * 2, h * 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w * 2, h * 2);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  gl.viewport(0, 0, w * 2, h * 2);
  const c = bg || [0.1, 0.12, 0.16];
  gl.clearColor(c[0], c[1], c[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const cam = { x: 0, z: 0, zoom: zoom || 3, yaw: Math.PI * 0.25, pitch: 0.58, w, h };
  const save = { V: G.V, P: G.P, VP: G.VP, LVP: G.LVP, eye: G.eye, fwd: G.fwd, right: G.right, up: G.up, cam: G.cam, sun: G.sun };
  alrGLCamera(cam);
  const P = G.lit, U = P.U;
  gl.useProgram(P.p); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  gl.uniformMatrix4fv(U.uVP, false, G.VP); gl.uniformMatrix4fv(U.uLVP, false, alrOrtho(-1, 1, -1, 1, 1, 2));
  gl.uniform3fv(U.uSun, G.sun); gl.uniform3fv(U.uSunCol, [1.15, 1.08, 0.95]); gl.uniform3fv(U.uSky, [0.55, 0.6, 0.72]); gl.uniform3fv(U.uGround, [0.3, 0.27, 0.22]);
  gl.uniform3fv(U.uView, [-G.fwd[0], -G.fwd[1], -G.fwd[2]]);
  gl.uniform1f(U.uNoShroud, 1); gl.uniform1f(U.uAlpha, 1); gl.uniform3fv(U.uAdd, [0, 0, 0]); gl.uniform1f(U.uDesat, 0); gl.uniform1f(U.uUseTex, 0);
  gl.uniform1f(U.uTexel, 1 / ALR_SHADOW); gl.uniform1f(U.uN, 64);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.white); gl.uniform1i(U.uTex, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, G.white); gl.uniform1i(U.uShroud, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.white); gl.uniform1i(U.uDetail, 3);
  // (the shadow sampler needs SOMETHING compare-mode bound; an unbound unit reads as lit)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.shTex); gl.uniform1i(U.uShadow, 0);
  for (const pt of parts) {
    gl.uniformMatrix4fv(U.uM, false, pt.M); gl.uniform3fv(U.uTeam, team); gl.uniform1f(U.uSpec, 0.35);
    gl.bindVertexArray(pt.mesh.vao); gl.drawElements(gl.TRIANGLES, pt.mesh.n, pt.mesh.it, 0);
  }
  const px = new Uint8Array(w * 2 * h * 2 * 4);
  gl.readPixels(0, 0, w * 2, h * 2, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb); gl.deleteTexture(tex); gl.deleteRenderbuffer(rb);
  Object.assign(G, save);
  const out = document.createElement('canvas'); out.width = w * 2; out.height = h * 2;
  const g = out.getContext('2d'), id = g.createImageData(w * 2, h * 2);
  for (let y = 0; y < h * 2; y++) id.data.set(px.subarray((h * 2 - 1 - y) * w * 2 * 4, (h * 2 - y) * w * 2 * 4), y * w * 2 * 4);
  g.putImageData(id, 0, 0);
  return out;
}
