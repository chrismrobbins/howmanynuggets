// ---- ⚽ NUGGET SOCCER — the renderer -----------------------------------------------------------------------
// Nugget Alert's renderer (js/alertGL.js), retargeted for a stadium and kept in its OWN state (`sgl`) so the two
// games never trample each other's GL context:
//   • a PERSPECTIVE broadcast camera (Alert is orthographic)
//   • kit colours: a model's vertex alpha says which of the team's three colours a surface takes — 1.0 shirt,
//     0.5 shorts, 0.25 socks (blender/alertrig.py export: team 1/2/3 → 255/128/64)
//   • textured draws for the pitch and the advertising boards
//   • one sun, a 2048 shadow map fitted to what the camera sees of the pitch, a hemisphere fill, a little spec
//   • the Blender models' surface texture array (alertArt.js alrMatLayers: concrete, fabric, steel …)
//   • one batched billboard pass (confetti, turf spray, flash bulbs) — additive or alpha
// Math helpers (alrM4 / alrMul / alrTRS / alrLookAt / alrN3 …) are shared with Alert: they're pure functions.

const SGL_SHADOW = 2048;
const sgl = { gl: null, ok: false };

function sglPersp(fovY, aspect, n, f) {
  const t = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
  m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
  return m;
}

const SGL_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=3) in vec2 aUV;
uniform mat4 uVP, uM, uLVP;
out vec3 vN; out vec4 vC; out vec3 vW; out vec4 vL; out vec2 vUV; out vec3 vP; out vec3 vON;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vW = w.xyz; vN = mat3(uM) * aNor; vC = aCol; vUV = aUV; vL = uLVP * w; vP = aPos; vON = aNor;
  gl_Position = uVP * w;
}`;
const SGL_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow; precision highp sampler2DArray;
in vec3 vN; in vec4 vC; in vec3 vW; in vec4 vL; in vec2 vUV; in vec3 vP; in vec3 vON;
uniform sampler2DShadow uShadow; uniform sampler2D uTex;
uniform sampler2DArray uMat; uniform float uMatOn; uniform float uMatS[20]; uniform float uMatSpec[20];
uniform vec3 uSun, uSunCol, uSky, uGround, uK1, uK2, uK3, uEye, uAdd, uFog;
uniform float uUseTex, uSpec, uAlpha, uTexel, uFogD;
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
  p.z -= 0.0009;
  float d = uTexel * 0.9, s = 0.0;
  s += texture(uShadow, vec3(p.xy + vec2(-d, -d), p.z));
  s += texture(uShadow, vec3(p.xy + vec2( d, -d), p.z));
  s += texture(uShadow, vec3(p.xy + vec2(-d,  d), p.z));
  s += texture(uShadow, vec3(p.xy + vec2( d,  d), p.z));
  return s * 0.25;
}
void main() {
  vec3 base = vC.rgb;
  float lum = dot(vC.rgb, vec3(0.3, 0.59, 0.11));
  // the kit: alpha 1 = shirt, 0.5 = shorts, 0.25 = socks (the colour keeps the surface's own luminance)
  if (vC.a > 0.12) {
    vec3 k = vC.a > 0.75 ? uK1 : vC.a > 0.37 ? uK2 : uK3;
    base = k * (0.22 + 1.1 * lum);
  }
  float mspec = 1.0;
  if (uUseTex > 0.5) {
    base = texture(uTex, vUV).rgb * vC.rgb;
  } else if (uMatOn > 0.5 && vUV.x > 0.5) {
    int cls = int(vUV.x + 0.5);
    vec3 an = abs(normalize(vON)); vec3 tw = an * an * an * an; tw /= (tw.x + tw.y + tw.z);
    vec3 q = vP * uMatS[cls] * 1.4;
    float L = float(cls - 1);
    vec3 tx = texture(uMat, vec3(q.zy, L)).rgb * tw.x + texture(uMat, vec3(q.xz, L)).rgb * tw.y + texture(uMat, vec3(q.xy, L)).rgb * tw.z;
    base *= mix(vec3(1.0), tx * 2.0, 0.75);
    base = mix(base, base * vec3(0.8, 0.76, 0.7), clamp((vUV.y - 0.4) * 1.6, 0.0, 1.0) * 0.6);
    mspec = uMatSpec[cls] * (0.4 + 1.2 * dot(tx, vec3(0.33)));
  } else {
    float g = vnoise(vW * 5.0) * 0.6 + vnoise(vW * 17.0) * 0.4;
    base *= 0.94 + 0.12 * g;
  }
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = max(dot(n, uSun), 0.0);
  float sh = shade();
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 c = base * (amb + uSunCol * ndl * mix(0.35, 1.0, sh));
  vec3 v = normalize(uEye - vW);
  vec3 h = normalize(uSun + v);
  c += uSunCol * pow(max(dot(n, h), 0.0), 32.0) * uSpec * mspec * sh;
  c += uAdd;
  // the far stands sit back in a little haze (it reads as distance on a broadcast)
  float fd = clamp((length(uEye - vW) - uFogD) / (uFogD * 2.5), 0.0, 0.5);
  c = mix(c, uFog, fd);
  o = vec4(c, uAlpha);
}`;
const SGL_SVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP, uM;
void main() { gl_Position = uLVP * uM * vec4(aPos, 1.0); }`;
const SGL_SFS = `#version 300 es
precision mediump float; out vec4 o; void main() { o = vec4(1.0); }`;
const SGL_PVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aOff; layout(location=2) in vec2 aUV; layout(location=3) in vec4 aCol;
uniform mat4 uVP; uniform vec3 uRight, uUp;
out vec2 vUV; out vec4 vC;
void main() { vec3 w = aPos + uRight * aOff.x + uUp * aOff.y; vUV = aUV; vC = aCol; gl_Position = uVP * vec4(w, 1.0); }`;
const SGL_PFS = `#version 300 es
precision highp float; in vec2 vUV; in vec4 vC; uniform sampler2D uAtlas; out vec4 o;
void main() { vec4 t = texture(uAtlas, vUV); o = vec4(t.rgb * vC.rgb, t.a * vC.a); }`;

function sglProgram(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('soccer shader', gl.getShaderInfoLog(s)); return null; } return s; };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('soccer link', gl.getProgramInfoLog(p)); return null; }
  const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) { const a = gl.getActiveUniform(p, k); U[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, U };
}
// a mesh from {p, n, c, u, i} float arrays (the same shape AlrMB builds and the Blender packer decodes to)
function sglMesh(mb) {
  const gl = sgl.gl;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = (data, loc, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
  buf(mb.p, 0, 3); buf(mb.n, 1, 3); buf(mb.c, 2, 4); buf(mb.u, 3, 2);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  const big = mb.p.length / 3 > 65535;
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(mb.i) : new Uint16Array(mb.i), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, n: mb.i.length, it: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, tris: mb.i.length / 3 };
}
function sglInit(cv) {
  let gl = null;
  try { gl = cv.getContext('webgl2', { antialias: true, alpha: false, depth: true, premultipliedAlpha: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  const G = sgl;
  G.gl = gl;
  G.lit = sglProgram(gl, SGL_VS, SGL_FS); G.sh = sglProgram(gl, SGL_SVS, SGL_SFS); G.part = sglProgram(gl, SGL_PVS, SGL_PFS);
  if (!G.lit || !G.sh || !G.part) return false;
  G.shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.shTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SGL_SHADOW, SGL_SHADOW);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  G.shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, G.shFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, G.shTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  G.white = sglTexData(1, 1, new Uint8Array([255, 255, 255, 255]));
  G.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  G.pCap = 40000;
  G.pVao = gl.createVertexArray(); gl.bindVertexArray(G.pVao);
  G.pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.pBuf); gl.bufferData(gl.ARRAY_BUFFER, G.pCap * 11 * 4, gl.DYNAMIC_DRAW);
  const st = 11 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, st, 28);
  gl.bindVertexArray(null);
  // the sprite atlas: Alert's (glow, smoke, beam, solid, ring, scorch, spark, flame) — a pure canvas painter
  if (typeof alrAtlasCanvas === 'function') G.atlas = sglTexCanvas(alrAtlasCanvas(), true);
  // the Blender models' surface textures (Alert's painter, our context)
  if (typeof alrMatLayers === 'function' && typeof ALR_MAT_SCALE !== 'undefined') {
    const S = 256, L = alrMatLayers(S), t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, S, S, L.layers.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    L.layers.forEach((px, k) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, S, S, 1, gl.RGBA, gl.UNSIGNED_BYTE, px));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    G.mat = t; G.matS = new Float32Array(20); G.matSpec = new Float32Array(20);
    ALR_MAT_SCALE.forEach((v, k) => { G.matS[k] = v; }); ALR_MAT_SPEC.forEach((v, k) => { G.matSpec[k] = v; });
  }
  G.queue = []; G.pvA = []; G.pvB = [];
  G.ok = true;
  return true;
}
function sglTexData(w, h, data) {
  const gl = sgl.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}
function sglTexCanvas(cv, mips, repeat) {
  const gl = sgl.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  if (mips) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
  if (mips && sgl.aniso) gl.texParameterf(gl.TEXTURE_2D, sgl.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(sgl.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  return t;
}
// (re-upload a canvas into an existing texture: the ad boards scroll)
function sglTexUpdate(t, cv) { const gl = sgl.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.generateMipmap(gl.TEXTURE_2D); }

// ---- the camera: cam = { eye: [x,y,z], at: [x,y,z], fov (radians, vertical), w, h, dpr } ----------------------
function sglCamera(cam, shadowFit) {
  const G = sgl;
  const V = alrLookAt(cam.eye, cam.at, [0, 1, 0]);
  const P = sglPersp(cam.fov, cam.w / cam.h, 0.5, 600);
  G.V = V; G.P = P; G.VP = alrMul(P, V);
  G.right = alrN3([V[0], V[4], V[8]]); G.up = alrN3([V[1], V[5], V[9]]);
  G.fwd = alrN3([cam.at[0] - cam.eye[0], cam.at[1] - cam.eye[1], cam.at[2] - cam.eye[2]]);
  G.cam = cam;
  // the sun: high, from behind the main stand's left (long-ish evening shadows across the pitch)
  const sun = alrN3([-0.42, 0.8, 0.42]);
  G.sun = sun;
  // the shadow box: what the camera sees of the pitch (shadowFit = { x, z, r }), snapped to texels
  const f = shadowFit || { x: cam.at[0], z: cam.at[2], r: 60 };
  const R = f.r;
  const lc = [f.x, 0, f.z];
  const LV = alrLookAt([lc[0] + sun[0] * 120, sun[1] * 120, lc[2] + sun[2] * 120], lc, [0, 1, 0]);
  const texel = 2 * R / SGL_SHADOW;
  LV[12] = Math.round(LV[12] / texel) * texel; LV[13] = Math.round(LV[13] / texel) * texel;
  G.LVP = alrMul(alrOrtho(-R, R, -R, R, 1, 260), LV);
}
// world → screen px (null when behind the camera)
function sglProject(x, y, z) {
  const M = sgl.VP, cam = sgl.cam;
  const cx = M[0] * x + M[4] * y + M[8] * z + M[12], cy = M[1] * x + M[5] * y + M[9] * z + M[13], cw = M[3] * x + M[7] * y + M[11] * z + M[15];
  if (cw <= 0.01) return null;
  return [(cx / cw * 0.5 + 0.5) * cam.w, (0.5 - cy / cw * 0.5) * cam.h, cw];
}
// screen px → the ground (y = 0)
function sglPick(px, py) {
  const G = sgl, cam = G.cam, t = Math.tan(cam.fov / 2), asp = cam.w / cam.h;
  const nx = (px / cam.w) * 2 - 1, ny = 1 - (py / cam.h) * 2;
  const d = alrN3([G.fwd[0] + (G.right[0] * nx * asp + G.up[0] * ny) * t, G.fwd[1] + (G.right[1] * nx * asp + G.up[1] * ny) * t, G.fwd[2] + (G.right[2] * nx * asp + G.up[2] * ny) * t]);
  if (d[1] > -0.001) return null;
  const k = -cam.eye[1] / d[1];
  return [cam.eye[0] + d[0] * k, cam.eye[2] + d[2] * k];
}

// ---- the draw queue: o = { k1, k2, k3 (kit colours), spec, alpha, add, tex, noCast } ---------------------------
function sglDraw(mesh, M, o) { if (mesh) sgl.queue.push({ mesh, M, o: o || {} }); }
const SGL_CELL = (i) => [(i % 4) * 0.25, ((i / 4) | 0) * 0.5];
function sglSprite(x, y, z, size, rot, r, g, b, a, cell, add) {
  const G = sgl, P = add ? G.pvA : G.pvB;
  if (P.length > G.pCap * 11 - 66) return;
  const [u0, v0] = SGL_CELL(cell), du = 0.25, dv = 0.5;
  const c = Math.cos(rot), s = Math.sin(rot), hs = size / 2;
  const corner = (cx, cy, u, v) => P.push(x, y, z, (cx * c - cy * s) * hs, (cx * s + cy * c) * hs, u0 + u * du, v0 + v * dv, r, g, b, a);
  corner(-1, -1, 0.02, 0.98); corner(1, -1, 0.98, 0.98); corner(1, 1, 0.98, 0.02);
  corner(-1, -1, 0.02, 0.98); corner(1, 1, 0.98, 0.02); corner(-1, 1, 0.02, 0.02);
}
// a flat quad on the ground (a soft player shadow, the ball's, a ring under the controlled player)
function sglGround(x, z, hx, hz, rot, r, g, b, a, cell, add, y) {
  const G = sgl, P = add ? G.pvA : G.pvB, c = Math.cos(rot || 0), s = Math.sin(rot || 0), yy = y == null ? 0.015 : y;
  const [u0, v0] = SGL_CELL(cell), du = 0.25, dv = 0.5;
  const v = (lx, lz, u, vv) => P.push(x + lx * c - lz * s, yy, z + lx * s + lz * c, 0, 0, u0 + u * du, v0 + vv * dv, r, g, b, a);
  v(-hx, -hz, 0.02, 0.02); v(hx, -hz, 0.98, 0.02); v(hx, hz, 0.98, 0.98);
  v(-hx, -hz, 0.02, 0.02); v(hx, hz, 0.98, 0.98); v(-hx, hz, 0.02, 0.98);
}
function sglBegin() { const G = sgl; G.queue.length = 0; G.pvA = []; G.pvB = []; }

function sglRender(L) {
  const G = sgl, gl = G.gl, cam = G.cam;
  L = L || {};
  // 1) shadows
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.shFB);
  gl.viewport(0, 0, SGL_SHADOW, SGL_SHADOW);
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
  // 2) lit
  const dpr = cam.dpr || 1;
  gl.viewport(0, 0, Math.round(cam.w * dpr), Math.round(cam.h * dpr));
  const sky = L.clear || [0.05, 0.07, 0.1];
  gl.clearColor(sky[0], sky[1], sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const P = G.lit, U = P.U;
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(U.uVP, false, G.VP); gl.uniformMatrix4fv(U.uLVP, false, G.LVP);
  gl.uniform3fv(U.uSun, G.sun);
  gl.uniform3fv(U.uSunCol, L.sun || [1.12, 1.04, 0.92]);
  gl.uniform3fv(U.uSky, L.sky || [0.52, 0.58, 0.7]);
  gl.uniform3fv(U.uGround, L.ground || [0.26, 0.3, 0.22]);
  gl.uniform3fv(U.uEye, cam.eye);
  gl.uniform3fv(U.uFog, L.fog || [0.55, 0.6, 0.68]); gl.uniform1f(U.uFogD, L.fogD || 120);
  gl.uniform1f(U.uTexel, 1 / SGL_SHADOW);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.shTex); gl.uniform1i(U.uShadow, 0);
  gl.uniform1i(U.uTex, 1);
  // (the texture array on its own unit, always: next to the shadow sampler on unit 0 it's a type clash and WebGL
  // drops every draw — Alert's gotcha 3)
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D_ARRAY, G.mat || null); if (U.uMat) gl.uniform1i(U.uMat, 4);
  if (U.uMatOn) gl.uniform1f(U.uMatOn, G.mat ? 1 : 0);
  if (G.mat && U['uMatS[0]']) { gl.uniform1fv(U['uMatS[0]'], G.matS); gl.uniform1fv(U['uMatSpec[0]'], G.matSpec); }
  const opaque = [], ghost = [];
  for (const q of G.queue) (q.o.alpha != null && q.o.alpha < 0.99 ? ghost : opaque).push(q);
  const one = (q) => {
    const o = q.o;
    gl.uniformMatrix4fv(U.uM, false, q.M);
    gl.uniform3fv(U.uK1, o.k1 || [0.8, 0.8, 0.8]); gl.uniform3fv(U.uK2, o.k2 || o.k1 || [0.8, 0.8, 0.8]); gl.uniform3fv(U.uK3, o.k3 || o.k2 || o.k1 || [0.8, 0.8, 0.8]);
    gl.uniform1f(U.uSpec, o.spec == null ? 0.25 : o.spec);
    gl.uniform1f(U.uAlpha, o.alpha == null ? 1 : o.alpha);
    gl.uniform3fv(U.uAdd, o.add || [0, 0, 0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, o.tex || G.white);
    gl.uniform1f(U.uUseTex, o.tex ? 1 : 0);
    gl.bindVertexArray(q.mesh.vao); gl.drawElements(gl.TRIANGLES, q.mesh.n, q.mesh.it, 0);
  };
  gl.disable(gl.BLEND);
  for (const q of opaque) one(q);
  // 3) the alpha batch, the ghosts, the additive batch
  gl.enable(gl.BLEND); gl.depthMask(false);
  const PP = G.part;
  const batch = (arr, add) => {
    if (!arr.length || !G.atlas) return;
    const f = new Float32Array(arr);
    gl.useProgram(PP.p);
    gl.uniformMatrix4fv(PP.U.uVP, false, G.VP);
    gl.uniform3fv(PP.U.uRight, G.right); gl.uniform3fv(PP.U.uUp, G.up);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.atlas); gl.uniform1i(PP.U.uAtlas, 0);
    gl.bindVertexArray(G.pVao); gl.bindBuffer(gl.ARRAY_BUFFER, G.pBuf);
    const n = Math.min(f.length / 11, G.pCap);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f, 0, n * 11);
    gl.blendFunc(gl.SRC_ALPHA, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  };
  batch(G.pvB, false);
  if (ghost.length) {
    gl.useProgram(P.p); gl.depthMask(true);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.shTex);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const q of ghost) one(q);
    gl.depthMask(false);
  }
  batch(G.pvA, true);
  gl.depthMask(true); gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

// ---- the Blender meshes (window.SOC_MESH_DATA, js/soccerMeshData.js, injected when the game opens) ----------------
// Each model: { v, s (position scale: int16 / s = metres), p, n, c, u, i (base64), big }. Older packs carry one
// global `pscale` instead of a per-model `s`.
function sglDecodeModels(D) {
  const raw = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return u.buffer; };
  const out = {};
  for (const name in D.models) {
    const M = D.models[name], s = M.s || D.pscale || 8000;
    const pi = new Int16Array(raw(M.p)), ni = new Int8Array(raw(M.n)), ci = new Uint8Array(raw(M.c));
    const p = new Float32Array(pi.length), n = new Float32Array(ni.length), c = new Float32Array(ci.length);
    for (let k = 0; k < pi.length; k++) p[k] = pi[k] / s;
    for (let k = 0; k < ni.length; k++) n[k] = ni[k] / 127;
    for (let k = 0; k < ci.length; k++) c[k] = ci[k] / 255;
    const i = M.big ? new Uint32Array(raw(M.i)) : new Uint16Array(raw(M.i));
    const u = new Float32Array(M.v * 2);
    if (M.u) { const ui = new Uint8Array(raw(M.u)); for (let k = 0; k < ui.length; k += 2) { u[k] = ui[k]; u[k + 1] = ui[k + 1] / 255; } }
    out[name] = { p, n, c, u, i };
  }
  return out;
}
// many copies of a model merged into ONE mesh (the crowd: thousands of fans, one draw), each with its own transform
// and a kit-1 colour override baked into its vertex colours
function sglMerge(parts) {
  let nv = 0, ni = 0; for (const q of parts) { nv += q.src.p.length / 3; ni += q.src.i.length; }
  const p = new Float32Array(nv * 3), n = new Float32Array(nv * 3), c = new Float32Array(nv * 4), u = new Float32Array(nv * 2), i = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const q of parts) {
    const S = q.src, M = q.M, k1 = q.k1, nvq = S.p.length / 3;
    for (let k = 0; k < nvq; k++) {
      const x = S.p[k * 3], y = S.p[k * 3 + 1], z = S.p[k * 3 + 2];
      p[(ov + k) * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; p[(ov + k) * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; p[(ov + k) * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
      const nx = S.n[k * 3], ny = S.n[k * 3 + 1], nz = S.n[k * 3 + 2];
      n[(ov + k) * 3] = M[0] * nx + M[4] * ny + M[8] * nz; n[(ov + k) * 3 + 1] = M[1] * nx + M[5] * ny + M[9] * nz; n[(ov + k) * 3 + 2] = M[2] * nx + M[6] * ny + M[10] * nz;
      let r = S.c[k * 4], g = S.c[k * 4 + 1], b = S.c[k * 4 + 2], a = S.c[k * 4 + 3];
      if (a > 0.12 && k1) { const lum = r * 0.3 + g * 0.59 + b * 0.11, m = 0.22 + 1.1 * lum; r = k1[0] * m; g = k1[1] * m; b = k1[2] * m; a = 0; }
      c[(ov + k) * 4] = r; c[(ov + k) * 4 + 1] = g; c[(ov + k) * 4 + 2] = b; c[(ov + k) * 4 + 3] = a;
      u[(ov + k) * 2] = S.u[k * 2]; u[(ov + k) * 2 + 1] = S.u[k * 2 + 1];
    }
    for (let k = 0; k < S.i.length; k++) i[oi + k] = S.i[k] + ov;
    ov += nvq; oi += S.i.length;
  }
  return { p, n, c, u, i };
}
