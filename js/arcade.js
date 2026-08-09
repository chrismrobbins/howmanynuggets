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
  // THE POWER PLANT dials. Per §1 of the handoff: start at a known-good
  // midpoint, not at timid. 1.0 relief and a specular that reads without
  // turning every wall into wet plastic.
  const FLAT_RIGHT = [1, 0, 0], FLAT_FWD = [0, 0, 1];
  const NRM_SCALE = 1.0;
  const SPEC_AMT = 1.15;
  const WET_AMT = 1.0;

  // ---- THE SKY -------------------------------------------------------------
  // Nuggetown is under a low sodium-lit overcast. Every street lamp and every
  // sign in the city throws its light UP into that cloud deck and it comes
  // back down warm, which is why the HORIZON is the brightest part of this sky
  // and the zenith is the dimmest — the opposite of a clear night, and the
  // reason the rain, the skyline and the roofline have anything to be seen
  // against. One palette, read by three places: the dome, the distance fog and
  // the ambient term. Change it here and the whole night changes together.
  const SKY = {
    horizon: [0.335, 0.198, 0.124],   // the deck right above the roofline
    zenith: [0.104, 0.098, 0.137],    // straight up: still not black
    glow: [0.285, 0.135, 0.046],      // the sodium core, piled on at the skyline
    ground: [0.052, 0.043, 0.054],    // what a downward ray sees: wet asphalt
    moon: [0.545, 0.420, 0.726],      // direction, normalised below
  };
  // What the sky is worth as LIGHT. Two hemisphere lobes — the overcast above,
  // the wet road's bounce below — derived from the palette itself, so retuning
  // the look retunes the lighting with it and the two can never disagree.
  const SKY_AMB_MUL = 0.46, GND_AMB_MUL = 0.85;
  const SKY_REFL = 0.62;   // how much of the sky a polished outdoor surface returns
  const MOON_DIR = (() => {
    const m = SKY.moon, L = Math.hypot(m[0], m[1], m[2]);
    return new Float32Array([m[0] / L, m[1] / L, m[2] / L]);
  })();
  // The sky lobe is the deck a little above the roofline (where most of the
  // hemisphere's solid angle actually is), not the hot sodium core.
  const SKY_AMB = new Float32Array([
    (SKY.horizon[0] * 0.55 + SKY.zenith[0] * 0.45 + SKY.glow[0] * 0.22) * SKY_AMB_MUL,
    (SKY.horizon[1] * 0.55 + SKY.zenith[1] * 0.45 + SKY.glow[1] * 0.22) * SKY_AMB_MUL,
    (SKY.horizon[2] * 0.55 + SKY.zenith[2] * 0.45 + SKY.glow[2] * 0.22) * SKY_AMB_MUL,
  ]);
  const GND_AMB = new Float32Array([
    SKY.ground[0] * GND_AMB_MUL, SKY.ground[1] * GND_AMB_MUL, SKY.ground[2] * GND_AMB_MUL,
  ]);
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
    ['brawl', -7.0, -16.8, Math.PI / 2],
    ['ranch', 7.02, -2.2, -Math.PI / 2], // front of the right wall, ahead of Catch
    ['knight', 0, -18.7, 0],
    ['kart', -7.02, -2.2, Math.PI / 2], // the 10th cabinet — the reserved spot, delivered
  ];

  // Battered Brawlers used to hide under a poke-three-times drape; community
  // verdict was "how would anyone know?" — so the cabinet greets everyone now.
  const brawlRevealed = true;

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

  // THE SKY, as GLSL. Deliberately written in the subset both ES 1.00 and
  // ES 3.00 accept (no texture fetches, no keywords that moved) so the SAME
  // source string compiles into the WebGL1 shader, the WebGL2 material shader
  // and the dome program. Three consumers, one definition of what the night
  // looks like — the alternative is a sky that does not match its own fog.
  //
  // skyBase() is the cheap half: gradient, sodium core, ground bounce. It runs
  // per-fragment on EVERY lit surface (it is the fog colour now), so it costs
  // no noise at all. skyColor() adds the cloud deck and the moon and only ever
  // runs on pixels the dome actually covers.
  const GLSL_SKY = `
uniform vec3 uSkyHorizon, uSkyZenith, uSkyGlow, uSkyGround, uMoonDir;
uniform float uSkyT;

vec3 skyTint(vec3 d) {
  float up = clamp(d.y, 0.0, 1.0);
  return mix(uSkyHorizon, uSkyZenith, pow(up, 0.42)) + uSkyGlow * exp(-up * 6.5);
}

// What the dome and the reflection see. Below the horizon there is no sky,
// there is the city's own bounce off wet ground.
vec3 skyBase(vec3 d) {
  return mix(uSkyGround, skyTint(d), smoothstep(-0.30, 0.015, d.y));
}

// FOG IS NOT THE DOME, and conflating them cost a pass. A ray at eye level
// down a street does not travel through open sky — it travels past buildings —
// so it must not pick up the full sodium horizon. The first version did, and
// painted the entire block across the road traffic-cone orange. Haze only
// earns the glow once the ray is clear of the roofline.
vec3 skyFog(vec3 d) {
  return mix(uSkyGround * 1.55, skyTint(d) * 0.66, smoothstep(-0.10, 0.46, d.y));
}

float skyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
             mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skyFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * skyNoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

// ---- THE SKYLINE ------------------------------------------------------------
// Nuggetown does not stop at the end of the street. This is the rest of it,
// written as a function of COMPASS BEARING rather than built as geometry: one
// hash decides how tall the block at this bearing is, a second decides which
// of its windows are still on at this hour. No mesh, no texture, no pole, and
// — because the slot index is an integer taken from a bearing that wraps to
// itself — no seam where atan(z, x) comes back around to where it started.
//
// It is drawn INSIDE the dome, so the street's own walls occlude it for free:
// the city appears exactly where a roofline stops and not one pixel lower.
vec3 skyRidge(vec3 col, float az, float el, float n, float lo, float hi, float haze, float seed) {
  float u = az * n;
  float i = floor(u), f = u - i;
  float h = lo + (hi - lo) * pow(skyHash(vec2(i, seed)), 2.2);   // mostly low, a few towers
  float crown = skyHash(vec2(i, seed + 3.0));
  if (crown > 0.70 && abs(f - 0.5) < 0.16) h += (hi - lo) * 0.6 * crown;  // a slim crown on some
  if (el > h) return col;

  // The body is not black — it is the haze it is standing in, which is what
  // makes a distant building read as DISTANT instead of as a hole.
  vec3 body = mix(uSkyGround * 0.5, skyTint(vec3(0.0, el, 0.0)), haze);

  // WINDOWS. The first pass filled a whole grid cell when a cell was lit,
  // which is not a window, it is a billboard — the building read as a stack
  // of tan slabs. A pane has to be smaller than its cell so there is wall
  // between the lights. They also stay well under the deck above them: a
  // window at full brightness is a hole punched in the city, not a light.
  vec2 g = vec2(f * 11.0, el * 96.0);
  vec2 gi = floor(g), gf = g - gi;
  float pane = step(0.22, gf.x) * step(gf.x, 0.78) * step(0.24, gf.y) * step(gf.y, 0.76);
  float on = step(0.80, skyHash(vec2(i * 11.0 + gi.x, gi.y + seed * 5.0)))
           * pane * step(0.07, f) * step(f, 0.93) * step(0.013, h - el);
  body += vec3(0.32, 0.238, 0.108) * on * (1.0 - haze * 0.5);
  return body;
}

vec3 skyColor(vec3 d) {
  vec3 col = skyBase(d);
  if (d.y > 0.012) {
    // The deck is projected onto a plane overhead rather than smeared across
    // the screen, so it has real perspective — it streams away toward the
    // roofline instead of sliding past like a decal.
    vec2 cp = d.xz / max(d.y, 0.115);
    float t = uSkyT * 0.0065;
    float f = skyFbm(cp * 0.82 + vec2(t, t * 0.42));
    f = f * 0.72 + skyFbm(cp * 2.35 - vec2(t * 1.9, t * 0.7)) * 0.28;
    float cloud = clamp((f - 0.345) * 2.45, 0.0, 1.0) * smoothstep(0.03, 0.34, d.y);

    // The moon sits BEHIND the deck and is dimmed by whatever drifts over it.
    // It peaks at 0.87, not 1.0, on purpose: the bloom pass turns it into the
    // brightest thing in the frame without a single clipped pixel. Painting it
    // white instead is how a blown-out sign shipped two sessions ago.
    float m = dot(d, uMoonDir);
    float disc = smoothstep(0.99936, 0.99972, m);
    float halo = pow(max(m, 0.0), 260.0) * 0.42 + pow(max(m, 0.0), 11.0) * 0.055;
    float gap = 1.0 - cloud * 0.88;
    col += (vec3(0.87, 0.86, 0.79) * disc + vec3(0.60, 0.64, 0.78) * halo) * gap;

    // lit from underneath, so the cloud BELLIES are the warm bit
    col = mix(col, uSkyHorizon * 1.30 + uSkyGlow * 0.32, cloud * 0.60);
  }

  // The city, last: it stands in FRONT of its own weather.
  float el = d.y / max(length(d.xz), 1e-4);
  if (el > -0.02 && el < 0.78) {
    float az = atan(d.z, d.x) * 0.15915494 + 0.5;
    col = skyRidge(col, az, el, 27.0, 0.05, 0.44, 0.63, 11.0);   // far ridge, hazy
    col = skyRidge(col, az, el, 43.0, 0.03, 0.30, 0.34, 57.0);   // near blocks, darker
  }
  return col;
}`;

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
uniform vec3 uAmbient, uFogColor, uCamPos, uSkyAmb, uGndAmb;
uniform float uFogDensity, uAlpha, uMirror, uBoost, uSkyAmt;
` + GLSL_SKY + `
void main() {
  vec4 tex = texture2D(uTex, vUV);
  vec3 n = normalize(vNormal);
  // OUTSIDE-NESS. The hall is a closed box with its own ceiling; the sky is
  // not allowed to light it. Beyond the doors it is the only thing lighting
  // anything that a lamp cannot reach. z is the whole test — the doorway is
  // at z=0 and the room runs negative. uSkyAmt folds in here so that setting
  // it to 0 collapses BOTH the ambient term and the fog to the exact equation
  // that shipped — the A/B seam this session is measured with.
  float outside = smoothstep(-0.6, 2.6, vWorld.z) * uSkyAmt;
  vec3 light = uAmbient
    + outside * mix(uGndAmb, uSkyAmb, clamp(0.5 + 0.5 * n.y, 0.0, 1.0));
  for (int i = 0; i < 8; i++) {
    vec3 d = uLightPos[i] - vWorld;
    float dist = length(d);
    float att = 1.0 / (1.0 + 0.13 * dist + 0.026 * dist * dist);
    light += uLightColor[i] * max(dot(n, d / max(dist, 0.001)), 0.0) * att;
  }
  float e = clamp(vExtra.x * uBoost, 0.0, 1.0);
  vec3 col = tex.rgb * mix(light, vec3(1.45), e) * vExtra.y;
  float fog = clamp(1.0 - exp(-uFogDensity * distance(uCamPos, vWorld)), 0.0, 1.0);
  // AERIAL PERSPECTIVE. Distance used to fade everything toward a near-black
  // constant, which is why the far end of the street dissolved into a hole.
  // Outside, distance now fades toward the SKY IN THAT DIRECTION, so the far
  // wall meets the horizon it is standing in front of. Indoors keeps the old
  // dark haze — a room does not have aerial perspective.
  vec3 fogCol = mix(uFogColor, skyFog(normalize(vWorld - uCamPos)), outside);
  col = mix(col, fogCol, fog * (1.0 - 0.7 * e)); // lit signage punches through fog
  gl_FragColor = vec4(col * uMirror, tex.a * uAlpha);
}`;

  // ---- THE POWER PLANT: the WebGL2 material shader ----------------------------
  // Everything above this comment is the hall as it shipped for a year: colour
  // times eight Lambert lights. It is kept EXACTLY as it was and is what a
  // WebGL1 browser still gets — the house rule is that nothing ever degrades to
  // black, and the safest fallback is the renderer that already worked.
  //
  // What follows is the same room with the rest of what Blender knows about a
  // surface: a normal map, roughness, metalness, and a real microfacet specular
  // lobe. A chrome bezel and a grimy carpet stop responding to light the same
  // way, which is the single biggest reason the hall read as flat.
  //
  // Two decisions worth keeping:
  //
  // 1. NO TANGENT ATTRIBUTE. Half this hall is hand-built quads in buildScene;
  //    adding a vertex attribute would mean touching every one. The tangent
  //    frame is derived per-pixel from screen-space derivatives instead, which
  //    costs a few ALU and works on procedural quads and Blender meshes alike.
  //
  // 2. THE BLUE CHANNEL OF THE ORM MAP IS A MIGRATION DIAL. The hall's albedo
  //    was rendered WITH a 44° key light baked into it, so it is not true base
  //    colour and cannot take full PBR without double-lighting (HANDOFF §10).
  //    orm.b says how much of this shader's new behaviour a region has opted
  //    into. At 0 — the default, and what an unmapped region gets — the maths
  //    collapses to exactly the old equation. Regions light up one at a time as
  //    the art department bakes them.

  const VS_LIT2 = `#version 300 es
in vec3 aPos; in vec3 aNormal; in vec2 aUV; in vec2 aExtra;
uniform mat4 uProj, uView, uModel;
out vec3 vWorld, vNormal; out vec2 vUV, vExtra;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV; vExtra = aExtra;
  gl_Position = uProj * uView * w;
}`;

  const FS_LIT2 = `#version 300 es
precision highp float;
in vec3 vWorld, vNormal; in vec2 vUV, vExtra;
uniform sampler2D uTex, uNrm, uOrm;
uniform vec3 uLightPos[16]; uniform vec3 uLightColor[16];
uniform vec3 uAmbient, uFogColor, uCamPos, uSkyAmb, uGndAmb;
uniform float uFogDensity, uAlpha, uMirror, uBoost, uNrmScale, uSpecAmt, uWet, uTime, uSkyAmt, uSkyRefl;
out vec4 fragColor;
` + GLSL_SKY + `
const float PI = 3.14159265;

// A tangent basis with no tangent attribute: the classic cotangent frame.
mat3 cotangent(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * du1.x + dp1perp * du2.x;
  vec3 B = dp2perp * du1.y + dp1perp * du2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-8));
  return mat3(T * inv, B * inv, N);
}

void main() {
  vec4 tex = texture(uTex, vUV);
  vec3 orm = texture(uOrm, vUV).rgb;
  float rough = clamp(orm.r, 0.05, 1.0);
  float metal = orm.g;
  float pbr = orm.b;              // how much of this shader the region opted into

  vec3 Ng = normalize(vNormal);
  vec3 N = Ng;
  if (pbr > 0.004) {
    vec3 nm = texture(uNrm, vUV).rgb * 2.0 - 1.0;
    nm.xy *= uNrmScale * pbr;
    N = normalize(cotangent(Ng, vWorld, vUV) * nm);
  }

  // IT IS RAINING OUT THERE. It has been raining out there since the street was
  // built, and until now the pavement did not know. Upward-facing ground beyond
  // the doors gets a slow ripple and a much sharper specular lobe — which is
  // the whole difference between "black floor" and "wet street at night".
  // Decided per-fragment rather than by a flag on the geometry, because the
  // street's ground is spread across several buffers built by different code.
  float wet = uWet
    * smoothstep(0.86, 0.99, Ng.y)              // faces up
    * (1.0 - smoothstep(0.12, 0.45, vWorld.y))  // is the ground, not a shelf
    * smoothstep(0.6, 2.2, vWorld.z);           // is outside the doors
  vec3 F0 = mix(vec3(0.04), tex.rgb, metal);
  if (wet > 0.002) {
    // ANISOTROPIC on purpose. A first pass rippled x and z equally and the
    // lamps landed on the pavement as hard white blobs — which is what an
    // isotropic microfacet lobe on a near-flat plane always gives you. A real
    // wet street smears its reflections along the view axis, so the ripple is
    // fine and busy ACROSS the street and lazy ALONG it: highlights stretch
    // into streaks running away from the camera instead of pooling into dots.
    float wx = vWorld.x, wz = vWorld.z, t = uTime;
    float gx = cos(wx * 11.0 + t * 1.1) * 0.55
             + cos((wx * 6.5 + wz * 1.7) - t * 1.9) * 0.35
             + cos(wx * 23.0 - t * 2.7) * 0.16;
    float gz = cos(wz * 2.3 - t * 0.6) * 0.10
             + cos((wx * 1.1 + wz * 3.1) + t * 0.8) * 0.06;
    N = normalize(N + vec3(gx, 0.0, gz) * 0.09 * wet);
    // 0.09 was a mirror and read as chrome. 0.2 keeps the streak soft-edged.
    rough = mix(rough, 0.2, wet);
    F0 = mix(F0, vec3(0.05), wet);
    pbr = max(pbr, wet);                        // wet ground gets a highlight
  }

  vec3 V = normalize(uCamPos - vWorld);
  float NdotV = max(dot(N, V), 1e-3);

  // The diffuse term is the ORIGINAL equation plus one thing it never had: a
  // SKY. Outdoors, every surface out of reach of a lamp used to get one flat
  // constant and nothing else, which is most of why two-fifths of the frame
  // read as nothing. Now it gets a hemisphere — the overcast above, the wet
  // road's bounce below, blended by which way the surface faces. Indoors is
  // untouched, and uSkyAmt = 0 collapses this back to the shipped equation.
  float outside = smoothstep(-0.6, 2.6, vWorld.z) * uSkyAmt;
  vec3 light = uAmbient
    + outside * mix(uGndAmb, uSkyAmb, clamp(0.5 + 0.5 * Ng.y, 0.0, 1.0));
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    vec3 d = uLightPos[i] - vWorld;
    float dist = length(d);
    vec3 L = d / max(dist, 0.001);
    float att = 1.0 / (1.0 + 0.13 * dist + 0.026 * dist * dist);
    float NdotL = max(dot(Ng, L), 0.0);
    light += uLightColor[i] * max(dot(N, L), 0.0) * att;
    if (pbr > 0.004 && NdotL > 0.0) {
      vec3 Hv = normalize(V + L);
      float NdotH = max(dot(N, Hv), 0.0);
      float NL = max(dot(N, L), 0.0);
      float a = rough * rough, a2 = a * a;
      float dn = NdotH * NdotH * (a2 - 1.0) + 1.0;
      float D = a2 / (PI * dn * dn);
      float k = (rough + 1.0) * (rough + 1.0) / 8.0;
      float G = (NL / (NL * (1.0 - k) + k)) * (NdotV / (NdotV * (1.0 - k) + k));
      vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(Hv, V), 0.0), 5.0);
      spec += min(uLightColor[i] * att * NL * D * G * F, vec3(2.2));
    }
  }

  // THE SKY AS A MIRROR. The street had a glow above it and a wet lobe below
  // it and nothing connecting the two, so the road stayed black under a lit
  // sky — which is not what a wet road does. It is mostly a reflection of
  // whatever is burning overhead. One skyBase along the reflection vector,
  // weighted by Fresnel and by how polished the surface is; grazing angles
  // down the road get almost all of it, which is exactly where real asphalt
  // turns into a mirror. Costs nothing indoors — the outside term gates it.
  vec3 env = vec3(0.0);
  if (outside > 0.003 && pbr > 0.004) {
    float fres = 0.045 + 0.955 * pow(1.0 - NdotV, 5.0);
    env = skyBase(reflect(-V, N)) * uSkyRefl * outside * pbr
        * mix(fres, 1.0, metal) * (1.0 - rough * 0.72);
  }

  float e = clamp(vExtra.x * uBoost, 0.0, 1.0);
  vec3 col = tex.rgb * mix(light, vec3(1.45), e) * vExtra.y;
  // Neon does not get a highlight painted on it, and neither does anything the
  // region table has not signed off on.
  col += (spec * uSpecAmt * pbr + env) * (1.0 - e) * vExtra.y;
  float fog = clamp(1.0 - exp(-uFogDensity * distance(uCamPos, vWorld)), 0.0, 1.0);
  // AERIAL PERSPECTIVE: outside, distance fades toward the sky IN THAT
  // DIRECTION instead of toward a near-black constant. The far end of the
  // street now meets the horizon it is standing in front of, and anything
  // parked beyond the lamps silhouettes instead of dissolving into a hole.
  vec3 fogCol = mix(uFogColor, skyFog(normalize(vWorld - uCamPos)), outside);
  col = mix(col, fogCol, fog * (1.0 - 0.7 * e));
  fragColor = vec4(col * uMirror, tex.a * uAlpha);
}`;

  // ---- the dome ---------------------------------------------------------------
  // There is no dome. There is a fullscreen quad pinned to the far plane with
  // depthFunc LEQUAL, so it paints exactly the pixels nothing else reached and
  // costs nothing where the hall already drew. A real sphere would need a mesh,
  // a seam, a pole, and a radius that has to stay inside the far plane; a
  // reconstructed view ray needs none of those and is exact in every direction.
  //
  // uSkyFlip mirrors the ray about y for the reflection pass. A pixel showing
  // the world scaled by (1,-1,1) shows the sky in direction (dx,-dy,dz), so
  // one sign flip buys the whole sky reflecting in the wet sidewalk.

  const VS_SKY = `
attribute vec2 aPos;
varying vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }`;

  const FS_SKY = `
precision highp float;
varying vec2 vNdc;
uniform vec3 uSkyFwd, uSkyRight, uSkyUp;
uniform vec2 uSkyScale;
uniform float uSkyFlip;
` + GLSL_SKY + `
void main() {
  vec3 d = normalize(uSkyFwd + uSkyRight * vNdc.x * uSkyScale.x
                             + uSkyUp * vNdc.y * uSkyScale.y);
  d.y *= uSkyFlip;
  // A night sky is a very long, very shallow ramp, and eight bits across it
  // BANDS — visible contour steps right across the frame, which reads cheap
  // no matter how good the colour is. One hash worth of noise under half a
  // level breaks the contours and is invisible on its own.
  vec3 c = skyColor(d) + (skyHash(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);
  gl_FragColor = vec4(c, 1.0);
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

  // ---- post chain: the reason a dark neon room reads as LIGHT -----------------
  // The hall used to draw straight to the screen, so every emissive quad was
  // just a bright rectangle. Now the scene renders into an FBO, the hot pixels
  // get extracted and blurred at quarter res, and the halo is added back —
  // neon, CRTs, the carpet confetti and the marquees actually throw light.

  const VS_POST = `
attribute vec2 aPos;
varying vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS_BRIGHT = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold, uKnee;
void main() {
  vec3 c = texture2D(uTex, vUV).rgb;
  float l = max(max(c.r, c.g), c.b);
  float f = clamp((l - uThreshold) / max(uKnee, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(c * f * f, 1.0);   // squared: soft knee, no hard edge
}`;

  const FS_BLUR = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 s = texture2D(uTex, vUV).rgb * 0.2270270;
  s += (texture2D(uTex, vUV + uDir * 1.3846).rgb + texture2D(uTex, vUV - uDir * 1.3846).rgb) * 0.3162162;
  s += (texture2D(uTex, vUV + uDir * 3.2308).rgb + texture2D(uTex, vUV - uDir * 3.2308).rgb) * 0.0702703;
  gl_FragColor = vec4(s, 1.0);
}`;

  const FS_COMP = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uScene, uBloom;
uniform float uAmount;
void main() {
  vec3 c = texture2D(uScene, vUV).rgb;
  vec3 b = texture2D(uBloom, vUV).rgb;
  c += b * uAmount;
  // a touch of extra saturation so the halos stay COLORED instead of washing
  // toward white (the sign blowout lesson, this time in the shader)
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);
  gl_FragColor = vec4(c, 1.0);
}`;

  // Allocate (or reallocate on resize) the scene target + two ping-pong blur
  // buffers. Returns false if the GPU won't give us a complete FBO — the hall
  // then renders exactly as it always did.
  function postSetup(gl, w, h) {
    if (H.post && H.post.w === w && H.post.h === h) return true;
    if (H.post === false) return false;
    try {
      if (H.post) {
        gl.deleteFramebuffer(H.post.fbo); gl.deleteTexture(H.post.tex);
        gl.deleteRenderbuffer(H.post.depth);
        for (const b of H.post.blur) { gl.deleteFramebuffer(b.fbo); gl.deleteTexture(b.tex); }
      }
      const target = (tw, th, depth) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        let rb = null;
        if (depth) {
          rb = gl.createRenderbuffer();
          gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, tw, th);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
        }
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        return ok ? { fbo, tex, depth: rb } : null;
      };
      const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
      const scene = target(w, h, true);
      const b0 = target(bw, bh, false);
      const b1 = target(bw, bh, false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!scene || !b0 || !b1) throw new Error('incomplete framebuffer');
      H.post = { ...scene, w, h, bw, bh, blur: [b0, b1] };
      return true;
    } catch (err) {
      console.warn('Nugget Arcade: bloom unavailable, rendering direct', err);
      H.post = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }
  }

  function postDraw(gl) {
    const P = H.post;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, H.quadVbo);

    const bind = (prog, aLoc) => {
      gl.useProgram(prog);
      gl.enableVertexAttribArray(aLoc);
      gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    };

    // 1) bright pass, straight into the quarter-res buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, P.blur[0].fbo);
    gl.viewport(0, 0, P.bw, P.bh);
    bind(H.progBright, H.aBright);
    gl.uniform1i(H.uniBright.uTex, 0);
    gl.uniform1f(H.uniBright.uThreshold, 0.74);
    gl.uniform1f(H.uniBright.uKnee, 0.30);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, P.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 2) separable blur, twice, for a halo wide enough to read as light
    bind(H.progBlur, H.aBlur);
    gl.uniform1i(H.uniBlur.uTex, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (const [dx, dy, src, dst] of [[1, 0, 0, 1], [0, 1, 1, 0]]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, P.blur[dst].fbo);
        gl.uniform2f(H.uniBlur.uDir, (dx * (1 + pass)) / P.bw, (dy * (1 + pass)) / P.bh);
        gl.bindTexture(gl.TEXTURE_2D, P.blur[src].tex);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    // 3) composite to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, H.canvas.width, H.canvas.height);
    bind(H.progComp, H.aComp);
    gl.uniform1i(H.uniComp.uScene, 0);
    gl.uniform1i(H.uniComp.uBloom, 1);
    gl.uniform1f(H.uniComp.uAmount, 0.92);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, P.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, P.blur[0].tex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.activeTexture(gl.TEXTURE0);
    gl.disableVertexAttribArray(H.aComp);
    gl.enable(gl.DEPTH_TEST);
  }

  // `soft: true` reports a compile/link failure as null instead of throwing —
  // used for the WebGL2 material program, whose failure means "use the old
  // renderer", not "the arcade is closed".
  function makeProgram(gl, vsSrc, fsSrc, soft) {
    function sh(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    try {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(p));
      return p;
    } catch (err) {
      if (!soft) throw err;
      console.warn('Nugget Arcade: shader program failed —', String(err).slice(0, 300));
      return null;
    }
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

  function makeSolidTexture(gl, rgba) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(rgba));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // Upload an atlas set's material pages and remember which albedo page they
  // belong to. Only WebGL2 has a shader that can read them, so WebGL1 never
  // pays for the upload.
  function registerMaps(gl, albedoTex, set) {
    if (!H.pbr || !set.nrm || !set.orm) return;
    const prev = H.mapsFor.get(albedoTex);
    if (prev) {
      gl.bindTexture(gl.TEXTURE_2D, prev.n);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, set.nrm);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, prev.s);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, set.orm);
      gl.generateMipmap(gl.TEXTURE_2D);
      return;
    }
    H.mapsFor.set(albedoTex, {
      n: makeTexture(gl, set.nrm),
      s: makeTexture(gl, set.orm),
    });
  }

  // Rebuild both atlas sets from scratch and re-upload all six pages. Called
  // when a Blender payload lands after the hall has already been built.
  function rebakeAtlases() {
    const gl = H.gl;
    const atlas = ArcadeArt.makeAtlas();
    gl.bindTexture(gl.TEXTURE_2D, H.texAtlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    const street = ArcadeArt.makeStreetAtlas();
    gl.bindTexture(gl.TEXTURE_2D, H.texStreet);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, street.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    registerMaps(gl, H.texAtlas, atlas);
    registerMaps(gl, H.texStreet, street);
    H.builtHallArt = (typeof HallArt !== 'undefined' && HallArt.on() ? 'a' : '-') +
      (typeof HallMaps !== 'undefined' && HallMaps.on() ? 'm' : '-');
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
  // Append a Blender-authored mesh (js/hallMesh.js) placed by position + yaw.
  //
  // Returns FALSE — never throws, never draws nothing — if the geometry is
  // unavailable for any reason: the file didn't load, the model isn't in it,
  // its payload is corrupt, or the live atlas is missing a region it needs.
  // That's the contract every call site relies on to fall back to its
  // procedural box rig (blender/HANDOFF.md §1.5).
  //
  // uv rects are resolved HERE, not at export: the street atlas is shelf-packed
  // at runtime, so a model ships region-relative uv and learns its atlas
  // coordinates only once the packer has run.
  //
  // Does NOT honour `this.tf` — that hook recomputes normals from transformed
  // corners, which only works for flat quads. Models carry real split normals,
  // so they rotate themselves. buildCabinet is the only tf user and it builds
  // no models.
  Builder.prototype.model = function (name, uvMap, xf) {
    if (typeof HallMesh === 'undefined' || !HallMesh || !HallMesh.on()) return false;
    const M = HallMesh.get(name);
    if (!M) return false;
    // xf.remap lets ONE model serve many instances that differ only in which
    // atlas region a surface wears — the cabinet is modelled once and each of
    // the ten games swaps in its own marquee, panel and side art.
    const remap = (xf && xf.remap) || null;
    const rects = [];
    for (let k = 0; k < M.mats.length; k++) {
      let region = M.mats[k][0];
      if (remap && remap[region]) region = remap[region];
      const r = uvMap && uvMap[region];
      if (!r) return false;   // region never allocated — bail before we emit junk uv
      rects.push(r);
    }
    xf = xf || {};
    const px = xf.x || 0, py = xf.y || 0, pz = xf.z || 0;
    const yaw = xf.yaw || 0, sc = xf.s == null ? 1 : xf.s;
    // per-axis scale: the deluxe Knight cabinet is 1.55 x 1.18 x 1.15
    const sx = xf.sx == null ? sc : xf.sx;
    const sy = xf.sy == null ? sc : xf.sy;
    const sz = xf.sz == null ? sc : xf.sz;
    // normals go through the inverse transpose — for an axis scale that is
    // just 1/s per axis, renormalised. Scaling a normal like a position tilts
    // every shading normal on a non-uniformly scaled model.
    const ix = 1 / sx, iy = 1 / sy, iz = 1 / sz;
    const c = Math.cos(yaw), sn = Math.sin(yaw);   // same handedness as mRotY
    const lo = M.lo, sp = M.span, base = this.n;
    for (let i = 0; i < M.n; i++) {
      const x = (lo[0] + (M.pos[i * 3] / 65535) * sp[0]) * sx;
      const y = (lo[1] + (M.pos[i * 3 + 1] / 65535) * sp[1]) * sy;
      const z = (lo[2] + (M.pos[i * 3 + 2] / 65535) * sp[2]) * sz;
      let nx = (M.nrm[i * 3] / 127) * ix, ny = (M.nrm[i * 3 + 1] / 127) * iy,
        nz = (M.nrm[i * 3 + 2] / 127) * iz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const mi = M.mat[i], rc = rects[mi], mm = M.mats[mi];
      this.v.push(
        x * c + z * sn + px, y + py, -x * sn + z * c + pz,
        nx * c + nz * sn, ny, -nx * sn + nz * c,
        rc[0] + (rc[2] - rc[0]) * (M.uv[i * 2] / 65535),
        rc[1] + (rc[3] - rc[1]) * (M.uv[i * 2 + 1] / 65535),
        // baked AO rides in the tint channel — the one per-vertex float this
        // format already had and never used for anything per-vertex.
        mm[1], mm[2] * (M.ao[i] / 255)
      );
    }
    for (let i = 0; i < M.idx.length; i++) this.i.push(base + M.idx[i]);
    this.n += M.n;
    return true;
  };
  Builder.prototype.upload = function (gl) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.v), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    // 32-bit indices when the buffer outgrows 16. Ten Blender cabinets are
    // ~56k vertices between them, so the hall's static buffer now sails past
    // the 65535 a Uint16 index can address — and an overflow does not error,
    // it WRAPS, stitching triangles between unrelated vertices. Which looks
    // exactly like black spikes stabbing out of the geometry.
    let type = gl.UNSIGNED_SHORT, bytes = 2;
    if (this.n > 65535) {
      if (H.uintIndex) { type = gl.UNSIGNED_INT; bytes = 4; }
      else console.warn('arcade: ' + this.n + ' vertices with no OES_element_index_uint — geometry will wrap');
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      bytes === 4 ? new Uint32Array(this.i) : new Uint16Array(this.i), gl.STATIC_DRAW);
    return { vbo, ibo, count: this.i.length, verts: this.n, type, bytes };
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
    // THE MACHINE ITSELF is a Blender model now (blender/hallmesh.py
    // build_cabinet): T-molding, a coin door with slots and a return cup, a
    // speaker grille, a marquee light box, and a joystick and buttons you could
    // put a hand on. The per-game artwork rides in as a region REMAP, so one
    // model wears all ten games.
    //
    // Everything below still runs either way: PROF is a CONTRACT, and the CRT
    // quad, the zoom target, the interaction AABB and the marquee glow are all
    // derived from it right here. Only the visible shell moved to Blender —
    // if it fails to load, the original extruded-profile cabinet draws instead.
    const meshCab = B.model('cabinet', uv, {
      x: px, z: pz, yaw, sx: sw, sy: sh, sz: sd,
      remap: {
        $MARQ: 'marq_' + game.mode,
        $PANEL: 'panel_' + game.mode,
        $SIDE: 'side_' + game.mode,
      },
    });
    let screenPts = null;
    for (let i = 0; i < 5; i++) {
      const [y1, z1] = prof[i], [y2, z2] = prof[i + 1];
      const [name, em] = segUV[i];
      if (!meshCab) {
        B.quad(
          [-hw, y1, z1], [hw, y1, z1], [hw, y2, z2], [-hw, y2, z2],
          uv[name], { e: em }
        );
      }
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
    if (!meshCab) {
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

    // ---- ARCHITECTURAL TRIM ------------------------------------------------------
    // Skirting and crown moulding, mitred into the room's corners. A flat wall
    // meeting a flat floor at a hard line is the single most "untextured box"
    // thing about a room; a moulding gives both junctions an edge that catches
    // the neon. One 1m Blender section per run, stretched to length (the
    // profile does not distort along its own axis).
    //
    // Local: the section runs along +x with the wall behind it at z=0, so a
    // yaw turns the run onto whichever wall it belongs to.
    {
      const runs = [
        // [x, z, yaw, length]  — yaw aims the profile's front into the room
        [-X + 0.02, 0, Math.PI / 2, -ZB],       // west wall, running -z
        [X - 0.02, ZB, -Math.PI / 2, -ZB],      // east wall, running +z
        [-X, ZB + 0.02, 0, 2 * X],              // north wall, running +x
        [X, -0.02, Math.PI, X - 1.25],          // south wall, right of the doors
        [-1.25, -0.02, Math.PI, X - 1.25],      // south wall, left of the doors
      ];
      for (const [tx, tz, tyaw, len] of runs) {
        if (len <= 0) continue;
        B.model('trimBase', uv, { x: tx, z: tz, yaw: tyaw, sx: len });
        B.model('trimCrown', uv, { x: tx, y: CH, z: tz, yaw: tyaw, sx: len });
      }
    }

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

    // (the draped mystery cabinet retired with the poke gate — Battered
    // Brawlers stands proud at its old west-wall spot)

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

    // ---- the JUKEBOX (further left) — three loops and an OFF switch ------------
    // Built entirely from existing atlas regions (the main page is FULL): dark
    // body, swatch neon, and 'juke' glow sprites that pulse ON THE BEAT. The
    // music itself lives in stepJuke() and remembers your pick (nugJukebox).
    {
      const jx = -4.8, jz = -0.52, hw2 = 0.42, hd = 0.3, jh = 1.55;
      const fz = jz - hd - 0.012; // the face, sitting proud of the cabinet
      boxProp(jx, jz, hw2, hd, jh, uv.dark, 0.04);
      // sloped crown + cap (the classic jukebox arch, low-poly edition)
      B.quad([jx + 0.36, jh, jz - hd], [jx - 0.36, jh, jz - hd], [jx - 0.26, jh + 0.16, jz - hd + 0.16], [jx + 0.26, jh + 0.16, jz - hd + 0.16], uv.dark, {});
      B.quad([jx - 0.26, jh + 0.16, jz + hd], [jx + 0.26, jh + 0.16, jz + hd], [jx + 0.26, jh + 0.16, jz - hd + 0.16], [jx - 0.26, jh + 0.16, jz - hd + 0.16], uv.dark, {});
      // neon arch tubes: magenta over violet, then down the front edges
      B.quad([jx + 0.34, jh - 0.06, fz], [jx - 0.34, jh - 0.06, fz], [jx - 0.34, jh - 0.015, fz], [jx + 0.34, jh - 0.015, fz], uv.sw_magenta, { e: 0.7 });
      B.quad([jx + 0.3, jh - 0.115, fz], [jx - 0.3, jh - 0.115, fz], [jx - 0.3, jh - 0.07, fz], [jx + 0.3, jh - 0.07, fz], uv.sw_violet, { e: 0.55 });
      for (const sd of [-1, 1]) {
        B.quad([jx + sd * 0.40, 0.18, fz], [jx + sd * 0.355, 0.18, fz], [jx + sd * 0.355, jh - 0.13, fz], [jx + sd * 0.40, jh - 0.13, fz], uv.sw_violet, { e: 0.45 });
      }
      // glass window (where the records would spin, if we had records)
      B.quad([jx + 0.3, 1.0, fz], [jx - 0.3, 1.0, fz], [jx - 0.3, 1.38, fz], [jx + 0.3, 1.38, fz], uv.sw_glass, { e: 0.16 });
      // amber button row + cyan speaker grille
      B.quad([jx + 0.28, 0.84, fz], [jx - 0.28, 0.84, fz], [jx - 0.28, 0.9, fz], [jx + 0.28, 0.9, fz], uv.sw_amber, { e: 0.5 });
      for (const gx of [-0.2, 0, 0.2]) {
        B.quad([jx + gx + 0.045, 0.24, fz], [jx + gx - 0.045, 0.24, fz], [jx + gx - 0.045, 0.72, fz], [jx + gx + 0.045, 0.72, fz], uv.sw_tube, { e: 0.14, tint: 0.5 });
      }
      // the lights: they thump with the track (kind 'juke' in the sprite pass)
      H.glows.push({ p: [jx, jh - 0.05, jz - 0.55], c: [1, 0.18, 0.63], s: 1.0, a: 0.16, k: 'juke' });
      H.glows.push({ p: [jx, 1.2, jz - 0.55], c: [0.15, 0.88, 1], s: 0.7, a: 0.12, k: 'juke' });
      H.glows.push({ p: [jx, 0.5, jz - 0.55], c: [1, 0.69, 0.13], s: 0.7, a: 0.1, k: 'juke' });
      H.propBoxes.push({ min: [jx - 0.52, 0, jz - 0.4], max: [jx + 0.52, jh + 0.2, jz + 0.35] });
      H.hotspots.push({
        kind: 'juke',
        x: jx, z: jz, r: 2.2,
        min: [jx - 0.45, 0, jz - 0.34], max: [jx + 0.45, jh + 0.2, jz + 0.3],
        stand: [jx, EYE, jz - 1.35],
        label: '🎶 JUKEBOX — SPIN IT (free play, obviously)',
        act: () => jukeCycle(),
      });
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
    for (let i = 0; i < 190; i++)
      H.rain.push({
        x: -20 + Math.random() * 56, y: Math.random() * 5, z: 0.3 + Math.random() * 13, // reaches the pier
        v: 7 + Math.random() * 4,
      });

    return {
      static: B.upload(gl), floor: F.upload(gl), sign: SGN.upload(gl),
      doorL: DL.upload(gl), doorR: DR.upload(gl),
      decals: DEC.upload(gl), screens: SCR.upload(gl),
      board: SB.upload(gl),
      disco: DISCO.upload(gl), flora: FLORA.upload(gl),
    };
  }

  // ---- the street out front ---------------------------------------------------------
  // Walk out the doors: Nuggetown after dark. Shops, rain, streetlamps, and a
  // few regulars who'll talk if you will. Textures come from a SECOND atlas
  // (ArcadeArt.makeStreetAtlas) so the nearly-full main page never overflows.
  // The regulars. Real 3D bodies now (built in buildStreet, one buffer each,
  // idle bob via model matrix — and they turn to face you mid-conversation).
  // nodes() is rebuilt per chat so lines react to what you've done (golden nug
  // found, Brawlers campaign cleared, HELL unlocked…). next:null ends the chat.
  const NPCS = [
    {
      id: 'crumb', name: 'BIG CRUMB', icon: '🕶️',
      x: 2.5, z: 1.2, h: 1.0, sdx: 0, sdz: 1.25,
      baseYaw: 0.35, curYaw: 0.35, bobSpd: 1.6, bobAmp: 0.008, phase: 0, yBase: 0,
      nodes: () => {
        const party = typeof nugFoundersDay === 'function' && nugFoundersDay();
        return {
        root: {
          line: party
            ? "evening. big night. cake security detail. no outside sauce — ESPECIALLY tonight."
            : "evening. hall's open all night. no outside sauce — house rule.",
          opts: [
            party ? { t: "big night, Crumb. what IS founder's day?", next: 'founders' } : null,
            { t: "what's good in there tonight?", next: 'games' },
            { t: 'any secrets I should know about?', next: 'secrets' },
            { t: "what's with the police tape?", next: 'incident' },
            { t: 'just getting some air.', next: 'air' },
          ].filter(Boolean),
        },
        founders: {
          line: 'one night a year. banner goes up, the hen bakes, and the whole street sings at a cake in the rain. my job is CAKE SECURITY. *adjusts sunglasses* nobody has ever tried anything. that is how good I am.',
          opts: [
            { t: 'what was founded, exactly?', next: 'foundersWhat' },
            { t: "who's the founder?", next: 'foundersWho' },
          ],
        },
        foundersWhat: { line: 'the town? the hall? the recipe? *shrugs like a tectonic event* paperwork burned in the fryer fire of aught-six. we kept the party.', opts: [] },
        foundersWho: { line: "above my pay grade. the pickle asks every year. the cake never talks. *stares straight ahead* …make your wish before the rain gets the candle.", opts: [] },
        games: {
          line: 'the KNIGHT cab gets a line on weekends. three oaths — folks say the third one changes you.',
          opts: [
            { t: 'how do I get the third oath?', next: 'oath3' },
            { t: 'what about the brawler?', next: 'brawler' },
            { t: 'thanks, Crumb.', next: null },
          ],
        },
        oath3: { line: "survive to wave 8 on the knight's oath. THEN the skull stops being locked. you didn't hear it from me.", opts: [] },
        brawler: { line: 'BATTERED BRAWLERS. proper campaign — three acts. bring a friend, the cab takes two sets of gloves. and when a big mayo boy guards up? uppercut.', opts: [] },
        secrets: {
          line: !H.nugFound
            ? 'check the top of the sauce-o-matic sometime. something up there catches the light.'
            : "you found the nug. you're the secret now.",
          opts: [
            { t: 'my lips are sealed.', next: 'sealed' },
            { t: 'why are you telling me this?', next: 'why' },
          ],
        },
        sealed: { line: '*nods slowly and goes back to watching the rain*', opts: [] },
        why: { line: 'you look like someone who reads the walls. most people just walk past.', opts: [] },
        incident: {
          line: 'the tape? …nugget catch. the whole storm went missing overnight. a million-plus nugs. I was on the door that night and I heard NOTHING. you know how loud a storm is?',
          opts: [
            { t: 'so it was an inside job?', next: 'crumbJob' },
            { t: "who's investigating?", next: 'crumbDill' },
          ],
        },
        crumbJob: { line: 'watch it. I said I heard nothing, not that I DID nothing. the pressure gauge on that cabinet was redlining for weeks. I filed a report. nobody reads reports.', opts: [] },
        crumbDill: { line: 'detective dill. green fella out front, smells like brine, writes everything down. tell him what you know. or don\'t. *adjusts sunglasses*', opts: [] },
        air: { line: "yeah. rain does the neon good. take your time — I'll hold your high scores.", opts: [] },
        };
      },
    },
    {
      id: 'gravy', name: 'GRAVY JONES', icon: '🥣',
      x: 9.3, z: 0.78, h: 1.0, sdx: 0, sdz: 1.35,
      baseYaw: 0, curYaw: 0, bobSpd: 0.9, bobAmp: 0.006, phase: 2.1, yBase: 0.45,
      nodes: () => {
        const cleared = typeof brawlBest === 'function' &&
          ((brawlBest().spicy || {}).clears > 0 || (brawlBest().hell || {}).clears > 0);
        const clubbed = H.best && H.best.beat > 0;
        const party = typeof nugFoundersDay === 'function' && nugFoundersDay();
        return {
          root: {
            line: '*rain taps his lid* …I used to run with the mustard crowd, y\'know. penthouse security.',
            opts: [
              party ? { t: "happy founder's day, Gravy.", next: 'founders' } : null,
              { t: 'you worked for DIJON?', next: 'dijon' },
              { t: 'why sit out in the rain?', next: 'rain' },
              { t: 'any theories about the missing storm?', next: 'incident' },
              clubbed ? { t: 'the DJ cup… relative of yours?', next: 'drip' } : null,
              cleared
                ? { t: "I'm the one who cleared the Sauce Works.", next: 'cleared' }
                : { t: 'take it easy, old timer.', next: 'easy' },
            ].filter(Boolean),
          },
          drip: { line: '*the lid tilts one very small degree* …my sister\'s kid. we don\'t talk. he went into MUSIC. *a long, wet silence* …tell him his uncle says the 2am bass is… *quieter* …not bad.', opts: [] },
          founders: {
            line: '*he raises the lid a full centimeter — for him, a salute* …kid, I\'ve seen forty of these. the town didn\'t get FOUNDED. it CONGEALED. one day there was a fryer. then a line. then a town. the cake is how we apologize to the calendar.',
            opts: [
              { t: 'did YOU ever make a wish?', next: 'foundersWish' },
              { t: "that's… almost beautiful.", next: 'foundersBeaut' },
            ],
          },
          foundersWish: { line: 'once. *the rain fills a long silence* …it came true. that\'s all you get.', opts: [] },
          foundersBeaut: { line: 'everything is, kid, if you sit in the rain long enough.', opts: [] },
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
          incident: {
            line: 'the storm job? *chuckles into his lid* professional work. no forced entry, no witnesses… and a golden nug turns up on the vending machine the same week? I did security, kid. there are no coincidences.',
            opts: [
              { t: 'the golden nug is… a suspect?', next: 'gravyNug' },
              { t: 'you think it was the syndicate.', next: 'gravySynd' },
            ],
          },
          gravyNug: { line: 'I think the nug KNOWS things. shiny types always do. why else would it hide up there where nobody looks?', opts: [] },
          gravySynd: { line: 'I think batter does not come from nowhere. and the Sauce Works never runs dry. *stares at the rain* that is all I will say for free.', opts: [] },
          cleared: { line: "…so YOU'RE the red gloves. the coop's still finding feathers. she'll remember you, champ. wear it proud.", opts: [] },
          easy: { line: 'easy is all I do now. bench, rain, repeat.', opts: [] },
        };
      },
    },
    {
      id: 'hood', name: 'THE HOODED NUG', icon: '👁️',
      x: -13.6, z: 1.35, h: 1.05, sdx: 0, sdz: 1.3,
      baseYaw: -0.5, curYaw: -0.5, bobSpd: 1.2, bobAmp: 0.006, phase: 4.2, yBase: 0,
      nodes: () => {
        const sawStorm = typeof reelStormLanded === 'function' && reelStormLanded();
        const fished = (H.best && H.best.reel > 0) || sawStorm;
        const boosted = typeof gtaProgress === 'function' && gtaProgress() > 0;
        const droveOut = typeof gtaSawStorm === 'function' && gtaSawStorm();
        const remixed = typeof beatEncoreDone === 'function' && beatEncoreDone();
        const dropped = (H.best && H.best.beat > 0) || remixed;
        const dove = typeof drainSawStorm === 'function' && drainSawStorm();
        const delved = typeof croftFoundDoor === 'function' && croftFoundDoor();
        const party = typeof nugFoundersDay === 'function' && nugFoundersDay();
        // Season 2: the street-racing ladder is rumor-adjacent commerce
        const races = typeof gtaRacesWon === 'function' ? gtaRacesWon() : 0;
        const gpDone = typeof gtaGpWon === 'function' && gtaGpWon();
        return {
        root: {
          line: delved
            ? '*the hooded nugget adjusts the hood with both hands, ceremonially* five. for. five. the garage, the pier, the basement, the drains — and now a DOOR under the fort that the fort never built. *quietly* I\'m retiring the barrel, friend. I\'m buying a BIGGER barrel.'
            : dove
            ? '*the hooded nugget takes one slow step back from you* you went DOWN there. under the town. and it went past you like you were furniture. *long pause* R&D is over, friend. everything I age in the barrel from now on is about YOU.'
            : dropped
            ? '*the hooded nugget does a very small, very smug two-step* the garage. the pier. and now the BASEMENT. three. for. three. I am not a nugget in a hood, friend — I am the morning paper.'
            : sawStorm
              ? '*the hooded nugget is uncharacteristically quiet* …you went to the pier. at midnight. and it LOOKED at you. I can tell. you walk different now.'
              : '*the hooded nugget stands by the OPEN garage bay, radiating smug* you hear that engine? that\'s the sound of me being right. TWICE, now that the pier gate\'s open.',
          opts: [
            party ? { t: "founder's day, Hood. got a rumor for THE big one?", next: 'founders' } : null,
            { t: 'there are cellar doors on the arcade\'s east wall. lit from inside.', next: 'croftDoors' },
            { t: 'the gutter grate across the road… it\'s GLOWING.', next: 'drainGrate' },
            { t: 'the pickle put his case file in a glass box.', next: 'hoodBoard' },
            { t: 'somebody\'s been painting checkers on the roads.', next: 'races' },
            { t: 'there\'s a CLUB across the street now.', next: 'beatClub' },
            { t: 'somebody left a car out front. hazards on.', next: 'gtaCar' },
            { t: 'the shutter… it\'s open!', next: 'garage' },
            { t: 'heard any rumors?', next: 'rumors' },
            { t: 'tell me about the night the storm vanished.', next: 'incident' },
            { t: "you're just a weird nugget in a hood.", next: 'weird' },
          ].filter(Boolean),
        },
        founders: {
          line: '*the hood turns, slowly, toward the cake by the doors* one candle. every year. ONE. a town this old? do the math, friend. either nobody\'s counting… or somebody is counting on nobody counting.',
          opts: [
            { t: 'meaning… what?', next: 'founders2' },
            { t: "it's just a cake, Hood.", next: 'founders3' },
          ],
        },
        founders2: { line: 'meaning the founder never LEFT, friend. you don\'t keep lighting one candle for somebody who\'s gone. *taps hood* free rumor. founder\'s day special. tell your friends where rumors come from.', opts: [] },
        founders3: { line: '*a very long pause* that\'s what the last town said. …enjoy the party, friend. genuinely. even I take one night off. *does a small, private two-step under the hood*', opts: [] },
        drainGrate: {
          line: dove
            ? 'you already KNOW what\'s under that grate. you kicked past the clogs and the water went still and something the size of a WEATHER SYSTEM used the mains like a bus lane. *taps hood, shakily* fourth rumor. cashed. by you. again.'
            : 'fresh out the barrel, friend — rumor number FOUR: after it rains, the gutters under this town HUM. the DPW put a sign up. a sign, friend. for water. *leans in* water does not need a sign unless it\'s going somewhere.',
          opts: [
            { t: 'where would it be going?', next: 'drainWhere' },
            { t: 'I\'m not diving into a storm drain.', next: 'drainNope' },
          ],
        },
        races: {
          line: gpDone
            ? '*the hood bows. actually bows.* six pads, six flags, and then the GOLD one — and now there\'s a paint in the booth that money can\'t mix. the GOLDEN NUG GP, friend. I don\'t start rumors about you anymore. I QUOTE you.'
            : races >= 6
              ? 'six for six, friend. every checkered pad in town knows your tires by name. *leans in* and now a GOLD pad outside the arcade. the GP. rumor says the paint alone is worth the entry.'
              : races > 0
                ? races + ' flag' + (races > 1 ? 's' : '') + ' already? the pads remember, friend. six events. three rivals. one of them signs autographs as "the colonel\'s nephew" — beat him twice, it means more.'
                : 'checkered paint, friend, is an INVITATION with better grip. six of them, all districts. roll a car onto one and wait for the count. *taps hood* the garage sponsors the nitro. draw your own diagram.',
          opts: [
            { t: 'who runs it?', next: 'races2' },
          ],
        },
        races2: { line: 'nobody runs it. that\'s the beauty. the pads were just THERE one morning, painted clean, like the rain did it. *long pause* the rain does a lot in this town, friend.', opts: [] },
        drainWhere: { line: 'every pipe in nuggetown runs downhill to ONE place. *nods at the east gate* the harbor. the pier. the case. all of it is the same water, friend. it always was.', opts: [] },
        // 🗂️ the noticeboard, reviewed by a professional
        hoodBoard: {
          line: '*the hood swivels toward the case, then back, very slowly* he put the CASE on the SIDEWALK. under glass. with a little lamp. *a long, wounded silence* friend, that is a rumor board. that is MY format. he even used the string.',
          opts: [
            { t: 'you should be flattered.', next: 'hoodBoard2' },
            { t: 'is he right about any of it?', next: 'hoodBoard3' },
          ],
        },
        hoodBoard2: { line: '*sniffs* I age mine in a barrel. he laminates. we are not the same. *pause* …it IS a good board though. the layout breathes.', opts: [] },
        hoodBoard3: { line: 'every word, friend, which is the problem. a rumor you can VERIFY is just news, and nobody stands in the rain for news. *taps hood* go read it anyway. and then come back and tell me what he left OFF.', opts: [] },
        drainNope: { line: '*the hood tilts to exactly the angle of someone checking a watch* that\'s what the last three said. the garage. the pier. the basement. see you down there.', opts: [] },
        // 🕯️ rumor five: the cellar doors (THE UNDERCROFT)
        croftDoors: {
          line: delved
            ? '*the hood is very still* you went down. past the rooms. past the SEXTON. and at the bottom of a fort with ONE cellar floor on its drawings, there was a DOOR. *whisper* rumor five, cashed. the slate is clean and I have never felt so alive.'
            : 'rumor number FIVE, aged in oak: those doors predate the arcade. they predate the STREET. the fort\'s own drawings show a wall there — no stairs, no cellar, nothing to keep shut. *leans all the way in* and somebody repaints that sign every spring. the paint is always FRESH.',
          opts: [
            { t: 'what\'s down there?', next: 'croftWhat' },
            { t: 'who leaves the candles burning?', next: 'croftWho' },
          ],
        },
        croftWhat: { line: 'rooms, friend. rooms and rooms and rooms going DOWN, and the fort only ever admitted to one floor of them. *taps hood* take a lantern. take a spare. take a THIRD.', opts: [] },
        croftWho: { line: '*the longest pause you have ever stood through* nobody leaves candles burning in a room they visit, friend. you leave candles burning in a room you intend to COME BACK to. *steps back into the lamplight* ask the pickle about doors. specifically about tag seventy-seven.', opts: [] },
        beatClub: {
          line: remixed
            ? 'and you heard the ENCORE. *leans in under the neon* that bassline, friend — that\'s not a synth. he held a recorder over the pier rail at midnight and the harbor answered ON BEAT. my rumors have rumors now.'
            : dropped
              ? 'in already? of course you are. a cup with turntables, asking around for a rhythm section — EXACTLY as foretold. and word is he keeps one track in the crate for crowds that earn it. *taps hood* earn it.'
              : 'sauce sessions. nightly. a cup with turntables — the LAST rumor on my slate, and there it stands, thumping. that\'s three for three. when the beat drops… you know the rest.',
          opts: [
            { t: 'who IS DJ DRIP?', next: 'beatWho' },
            { t: 'you called it. again.', next: 'beatCalled' },
          ],
        },
        beatWho: { line: 'a cup. headphones. no past, all bass. and don\'t ask the gravy on the bench about him unless you\'ve got time for a very long, very wet silence. *taps hood* family reunion energy.', opts: [] },
        beatCalled: { line: 'I know. *lets the rain land on the hood, dramatically* tell your friends where rumors come from.', opts: [] },
        gtaCar: {
          line: droveOut
            ? '*the hood tilts, slowly* you took the invitation. eleven jobs. and then you sat at the end of a pier while the bay stood UP. *long pause* I start rumors, friend. you\'ve started a legend. we are not the same.'
            : boosted
              ? 'left it? *taps hood* friend, that car gets "left" there every single night, and every single night somebody with your exact walk drives off in it. nuggetown remembers the skid marks.'
              : 'hazards blinking. keys in it. double-parked outside an arcade at midnight. that is not parking, friend — that is an INVITATION. I don\'t accept invitations. you look like you might.',
          opts: [
            { t: 'what\'s out there, exactly?', next: 'gtaCity' },
            { t: 'noted. very noted.', next: null },
          ],
        },
        gtaCity: {
          line: 'ALL of nuggetown. five districts. the harbor. an NPD with a van they don\'t explain, and a syndicate that pays by the job. the phone booths ring for a reason. *leans in* answer one.',
          opts: [],
        },
        garage: {
          line: "FAST FOOD, they call it. the grease-lightning I told you about — chili nitro, batter tankers, the whole delivery. I said SOON, friend. *taps hood* told. you. so.",
          opts: [
            { t: 'you really called it.', next: 'called' },
            { t: 'any driving tips?', next: 'tips' },
          ],
        },
        called: {
          line: (H.best && H.best.kart > 0)
            ? "and YOU'VE already been behind the wheel — I can smell the nitro on you. my rumors deliver. speaking of which… the pier gate at the end of the road? open. rod's provided. midnight's provided too."
            : "I call everything. the garage. the beat that's coming. the pier — gate's OPEN now, east end of the road. go on. and remember where you heard it.",
          opts: [],
        },
        tips: { line: "brake INTO the hairpin, chili OUT of it. the tankers ride low and slow — pass 'em clean, it pays. and when a billboard asks about a storm… keep driving.", opts: [] },
        rumors: {
          line: dropped
            ? 'rumors? friend, you CLOSED my slate — so I went back to R&D, and R&D delivered. *leans in* the gutter grate across the road. after rain. LOOK at it. rumor number four is live.'
            : sawStorm
              ? "rumors? friend, you OUTRANK my rumors now. you hooked the thing the harbor nugs only whisper about. …fine. one left: a cup with turntables, asking around for a rhythm section."
              : fished
                ? 'the harbor nugs say you\'ve been casting. good. keep going DEEP — what circles out there is golden at the edges. almost like… weather.'
                : 'the pier gate is OPEN — end of the road, east, past the noodle shop. something BIG circles out there after midnight. swirling. golden at the edges. almost like… weather.',
          opts: [
            { t: '…like a storm?', next: 'hoodStorm' },
            { t: 'anything else?', next: 'rumors2' },
          ],
        },
        hoodStorm: {
          line: sawStorm
            ? "you KNOW what it was. it didn't drown out there — it moved in. the syndicate dumped it off the pier and the storm just… kept swirling. tell the pickle. or don't. it's not going anywhere."
            : "I don't say the s-word near open water. but if a certain missing storm wanted to hide, a pier at midnight is where I'd look. rod's provided at the gate. tell no one.",
          opts: [],
        },
        rumors2: {
          line: dropped
            ? 'the cup found his rhythm section. it was YOU. *taps hood* when the beat drops, you drop with it — I hear you already do.'
            : "a cup with turntables keeps asking around for a rhythm section. when the beat drops… you'd better drop with it.",
          opts: [],
        },
        incident: {
          line: 'the night it vanished? tanker trucks idled out back at 3am. unmarked. riding LOW — like a million nuggets low. they rolled toward the harbor. or the Sauce Works. same direction, if you think about it.',
          opts: [
            { t: 'did you tell the detective?', next: 'hoodDill' },
            { t: 'I need to sit with this.', next: null },
          ],
        },
        hoodDill: { line: 'pickles and I have history. tell him yourself — and leave my hood out of it.', opts: [] },
        weird: { line: "and yet you're the one out here talking to me. *taps hood* think about it.", opts: [] },
        };
      },
    },
    {
      id: 'hen', name: 'HENRIETTA', icon: '🐔',
      x: 17.8, z: 2.4, h: 0.78, sdx: 0, sdz: 1.2,
      baseYaw: -1.1, curYaw: -1.1, bobSpd: 5.5, bobAmp: 0.011, phase: 1.3, yBase: 0,
      nodes: () => {
        const saidIt = typeof brawlHellUnlocked === 'function' && brawlHellUnlocked();
        const party = typeof nugFoundersDay === 'function' && nugFoundersDay();
        return {
          root: {
            line: party
              ? 'bwok. yes, I baked it. no, you cannot have the recipe. yes, you may make a wish. CLEAN blows only.'
              : 'bwok. …what? never seen a hen outside an arcade before?',
            opts: [
              party ? { t: 'the cake out front… your work?', next: 'founders' } : null,
              { t: 'any relation to… the Mother Clucker?', next: 'clucker' },
              { t: 'what do you think of the ranch game?', next: 'ranch' },
              { t: 'where were YOU the night the storm vanished?', next: 'incident' },
              { t: 'nice night, huh?', next: 'night' },
            ].filter(Boolean),
          },
          founders: {
            line: 'bwok — you NOTICED. three hundred eggs. none of them mine — I ASKED AROUND, it is called ETHICS. two tiers. honey-mustard filling. and the frosting is… *looks left, looks right* …secret.',
            opts: [
              { t: 'the SECRET sauce??', next: 'foundersSauce' },
              { t: "it's beautiful work, Henrietta.", next: 'foundersNice' },
            ],
          },
          foundersSauce: { line: '*every feather goes perfectly still* …it is a FROSTING. drop it. bwok.', opts: [] },
          foundersNice: { line: 'thank you. blow the candle out CLEAN — a spitty wish is a wasted wish. bwok.', opts: [] },
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
          incident: {
            line: 'EXCUSE me?? I was at book club. seven witnesses. we read "the grapes of wrath." it is about SAUCE, probably. *ruffles feathers* …ask the SYNDICATE where all that fresh batter came from.',
            opts: [
              { t: 'okay, okay. sorry.', next: 'henSorry' },
              { t: 'the syndicate? go on.', next: 'henSynd' },
            ],
          },
          henSorry: { line: '*settles feathers* bwok. apology accepted. this once.', opts: [] },
          henSynd: { line: 'my cousin says the Works TRIPLED batter output that same week. TRIPLED. you punch things for a living — go punch the math.', opts: [] },
          night: { line: "every night's a nice night when you're not in a nugget box. no offense.", opts: [] },
        };
      },
    },
    {
      id: 'dill', name: 'DETECTIVE DILL', icon: '🥒',
      x: -2.6, z: 1.5, h: 1.12, sdx: 0, sdz: 1.2,
      baseYaw: Math.PI, curYaw: Math.PI, bobSpd: 1.3, bobAmp: 0.005, phase: 3.3, yBase: 0,
      nodes: () => {
        const sawStorm = typeof reelStormLanded === 'function' && reelStormLanded();
        const rap = typeof gtaProgress === 'function' ? gtaProgress() : 0;
        const droveOut = typeof gtaSawStorm === 'function' && gtaSawStorm();
        const remixed = typeof beatEncoreDone === 'function' && beatEncoreDone();
        const clubbed = (H.best && H.best.beat > 0) || remixed;
        // THE OVEN RELIGHT: the upgraded cabinets each leave a mark on the case file.
        const flewStorm = typeof flappyStormFlown === 'function' && flappyStormFlown();
        const heldCity = typeof blasterHeld === 'function' && blasterHeld();
        const ranPier = typeof runReachedPier === 'function' && runReachedPier();
        const sawSimStorm = typeof simSawStorm === 'function' && simSawStorm();
        const servedSecret = typeof dunkSecretServed === 'function' && dunkSecretServed();
        const dove = typeof drainSawStorm === 'function' && drainSawStorm();
        const delved = typeof croftFoundDoor === 'function' && croftFoundDoor();
        const caseNotes = flewStorm || heldCity || ranPier || sawSimStorm || servedSecret;
        const party = typeof nugFoundersDay === 'function' && nugFoundersDay();
        // Season 2 (NUGGETOWN NIGHTS): the case board + Dill's own chain
        const evid = typeof gtaEvidence === 'function' ? gtaEvidence() : 0;
        const dillDone = typeof gtaDillDone === 'function' && gtaDillDone();
        // 🗂️ tonight's two new exhibits: the pipes' paperwork and the bottle
        const tags = typeof drainTagCount === 'function' ? drainTagCount() : 0;
        const salvage = typeof drainSalvageDone === 'function' && drainSalvageDone();
        const manifest = typeof reelManifestFound === 'function' && reelManifestFound();
        return {
        root: {
          line: party
            ? '*flat voice* detective dill, NPD. the street is still a crime scene. tonight it is a crime scene with BALLOONS. …don\'t touch the tape. cake\'s fine.'
            : '*flat voice* detective dill, NPD. this street is a crime scene. technically the whole street. don\'t touch the tape.',
          opts: [
            party ? { t: "happy founder's day, detective.", next: 'founders' } : null,
            sawStorm
              ? { t: 'detective. I hooked the storm. at the pier.', next: 'sawIt' }
              : { t: 'what happened in there?', next: 'what' },
            rap > 0 ? { t: 'so… how\'s the crime wave treating you?', next: 'gtaRap' } : null,
            dillDone ? { t: 'the books burned, detective.', next: 'dillWrap' }
              : evid > 0 ? { t: 'been picking things up around town. evidence things.', next: 'evid' } : null,
            dove ? { t: 'detective. pull the DPW maps. I saw it IN THE PIPES.', next: 'drainSaw' } : null,
            delved ? { t: 'there\'s a door under the fort. it isn\'t on the plans.', next: 'croftDoor' } : null,
            salvage ? { t: 'I pulled all eight DPW tags out of the mains.', next: 'salvage' }
              : tags > 0 ? { t: "there's brass wired into those pipes, detective.", next: 'salvage' } : null,
            manifest ? { t: 'I fished a bottle out of the deep. paperwork inside.', next: 'manifest' } : null,
            { t: "what's the board out here for?", next: 'board' },
            clubbed ? { t: 'been down to the club across the street?', next: 'beatNoise' } : null,
            caseNotes ? { t: 'about my… extracurriculars, detective.', next: 'caseNotes' } : null,
            { t: 'got any suspects?', next: 'suspects' },
            { t: 'can I help?', next: 'help' },
            { t: 'stay salty, detective.', next: 'bye' },
          ].filter(Boolean),
        },
        evid: {
          line: evid >= 12
            ? '*he goes very still* twelve. you pinned all TWELVE. a weigh slip, a rhyming napkin, a gnome. kid, I have detectives who can\'t find their own cruiser. *lowers voice* stay near a phone booth. one of them is about to ring in a color you haven\'t heard.'
            : evid >= 6
              ? '*flips through the notepad, fast* ' + evid + ' pieces. the weigh slip alone puts the tankers a million nuggets heavy on paper and light on the scale. keep collecting, kid. the board wants what the board wants.'
              : '*raises an eyebrow exactly one millimeter* ' + evid + ' so far. that\'s ' + evid + ' more than the department found in a year. the town HIDES things — sidewalks, parks, pier planks. walk more. drive less. …who am I kidding. drive carefully.',
          opts: [
            { t: 'what am I even looking for?', next: 'evid2' },
          ],
        },
        evid2: { line: 'anything with batter on it that can\'t explain itself. *taps the notepad* the board tab is in your map, kid. red string included. the string matters. the string is the THEORY.', opts: [] },
        dillWrap: {
          line: '*he actually closes the notepad. entirely.* four jobs. a stakeout, a delivery, a tail, and one very loud meeting that never happened. the syndicate\'s books are ash, their buyers don\'t exist, and the case — *tips tiny hat* — remains OPEN. forever. as designed.',
          opts: [
            { t: 'we make a decent team, detective.', next: 'dillWrap2' },
            { t: 'so what now?', next: 'dillWrap3' },
          ],
        },
        dillWrap2: { line: '*long pause* the NPD does not confirm or deny the existence of a team. *longer pause* …good work, kid. that\'s off the record. everything good is.', opts: [] },
        dillWrap3: { line: 'now? the storm keeps circling, the phones keep ringing, and I keep the tape up. *glances at the harbor* everything in this town is the weather. somebody\'s got to take its statement.', opts: [] },
        founders: {
          line: '*he almost smiles. the rain flinches.* one night a year, this whole town stands in the weather and sings at a cake. no thefts. no complaints. even the harbor sits quiet. *closes the notepad* it\'s the only night I don\'t write anything down.',
          opts: [
            { t: 'you? off duty?', next: 'foundersOff' },
            { t: 'making a wish this year?', next: 'foundersWish' },
          ],
        },
        foundersOff: { line: 'the tape stays up. I stay under it. but the pen stays in the coat. *pats the pocket* that\'s as off as duty gets.', opts: [] },
        foundersWish: { line: 'same one every year: "fewer open cases." *glances at the taped cabinet, then the harbor* …and every year the cake does what it can. one candle only has so much jurisdiction.', opts: [] },
        caseNotes: {
          line: '*flips to a thick new section of the notepad marked "THE CRISPY IRREGULAR"* let\'s review, because you have been BUSY. every cabinet in that hall, and somehow every one of them leads back to my storm.',
          opts: [
            heldCity ? { t: 'the Bomber over Nuggetown — that was me.', next: 'cnBlaster' } : null,
            flewStorm ? { t: 'I flew a nugget INTO the harbor storm.', next: 'cnFlappy' } : null,
            ranPier ? { t: 'I ran the whole town out to the pier.', next: 'cnRun' } : null,
            servedSecret ? { t: 'I served the… secret sauce.', next: 'cnDunk' } : null,
            sawSimStorm ? { t: 'an old nugget on a bench saw something.', next: 'cnSim' } : null,
            { t: 'that\'s all for now, detective.', next: null },
          ].filter(Boolean),
        },
        cnBlaster: { line: '*taps a photo of a burning tanker-airship* the "BATTER BOMBER" — syndicate air support, the outfit behind the whole Incident. you put it in the bay and held the skyline: the ARCADE, the PIER, the RANCH, all still standing. NPD had nothing that night. off the record, kid — the city owes you a fry basket.', opts: [] },
        cnFlappy: { line: '*long stare* you flew a nugget through the EDGE of the harbor storm and came BACK. nobody flies the storm. …did it feel like it was watching you? *doesn\'t wait for an answer — writes it down anyway.* the case grows.', opts: [] },
        cnRun: { line: 'sprinted the counter, the freezer, the grill, the alley, and out onto MY pier at a dead run. *rubs temples* you and that harbor have a standing appointment, don\'t you. do NOT touch the water.', opts: [] },
        cnDunk: { line: '*pen freezes mid-word* …the SECRET sauce. the recipe the Sauce Works triples batter output for. you served it and you\'re still standing. that\'s not a condiment, kid — that\'s EVIDENCE. eat responsibly.', opts: [] },
        cnSim: { line: '*softens, barely* the old one on Bench Hill. said the far horizon "flickered" one night — a storm that shouldn\'t be there. I get a lot of crank calls. THAT one I filed. *taps the notepad* the quiet witnesses are always right.', opts: [] },
        beatNoise: {
          line: remixed
            ? '*flat stare* every night at 2am: boom. boom. boom. I filed a noise complaint; the cup filed it under "kick drum". *long pause* …and that encore everyone keeps humming? I\'ve HEARD that rumble before, kid. off the end of MY pier. *opens notepad to a fresh page* the case file grows.'
            : 'the DIP HOP joint. noise complaints: seventeen. crimes: none. annoyingly. *clicks pen* if you ever get close to those decks… pay attention to what he SAMPLES.',
          opts: [
            remixed ? { t: 'you can\'t subpoena a bassline, detective.', next: 'beatNoise2' } : { t: 'I\'ll keep an ear out.', next: null },
          ],
        },
        beatNoise2: { line: '*writes "CAN I?" in the notepad. underlines it twice.*', opts: [] },
        drainSaw: {
          line: '*stops writing entirely* …the storm drains. of course. the pier isn\'t its HOME, kid — it\'s its front door. it\'s been using the mains to move under my ENTIRE crime scene. *slowly turns the notepad sideways to draw pipes* the case just grew a basement.',
          opts: [
            { t: 'so dredge the pipes.', next: 'drainSaw2' },
            { t: 'the DPW sign says DO NOT DIVE.', next: 'drainSaw3' },
          ],
        },
        drainSaw2: { line: 'dredge WHAT, kid? it IS the water. *writes "jurisdiction: the municipal plumbing" and stares at it* I became a detective for parking fraud.', opts: [] },
        drainSaw3: { line: 'that sign predates the Incident by nine years. *flat stare* the DPW knew something. the DPW always knows something. they just file it under "flow".', opts: [] },
        // 🚪 THE DOOR (THE UNDERCROFT) — tag seventy-seven finally parses
        croftDoor: {
          line: '*he does not reach for the notepad. that\'s how you know it\'s bad.* say it again. slowly. …a vault door. UNDER the fort. gold in the seam, water on the far side, moving harbor-way. *now he opens the notepad — straight to the salvage section, tag seventy-seven* "it likes the pipes better than the bay. LEAVE IT A DOOR." unsigned. *looks up, and for once the rain waits* somebody didn\'t just leave it a door, kid. somebody BUILT it one.',
          opts: [
            { t: 'so who built it?', next: 'croftDoor2' },
            { t: 'should we open it?', next: 'croftDoor3' },
          ],
        },
        croftDoor2: { line: 'the fort\'s drawings show ONE cellar floor. the fort\'s foundations disagree by — *checks your face* — several. and the mason\'s guild records burned, because every useful record in this town burns. it\'s practically a municipal service. *writes "WHO POURS A FOUNDATION AROUND A DOOR"* that\'s the whole case, kid. right there.', opts: [] },
        croftDoor3: { line: '*the flattest stare ever issued by the department* the sign says KEEP SHUT. the note says LEAVE IT A DOOR. for the first time in this entire case, every piece of paper agrees. *closes the notepad* it stays shut. the case stays open. some doors are both.', opts: [] },
        // 🗂️ the noticeboard on the sidewalk + the two new exhibits it can hold
        board: {
          line: '*jerks a thumb at the case behind him without looking* the board. I got tired of people telling me they\'d have come forward if only somebody had TOLD them what we were looking for. so now it\'s in a glass case on a public sidewalk, in the rain, where every lead I have is legible to anyone who stops walking. ' +
            (typeof lockerFiledCount === 'function' ? '*checks* ' + lockerFiledCount() + ' of ' + LOCKER_EXHIBITS.length + ' exhibits filed.' : ''),
          opts: [
            { t: "doesn't that tip off the syndicate too?", next: 'board2' },
            { t: 'what happens when it\'s full?', next: 'board3' },
          ],
        },
        board2: { line: 'they already know what they did, kid. the only people a secret case file keeps in the dark are the ones who might help me. *clicks pen* transparency: cheapest deputy the department ever hired.', opts: [] },
        board3: { line: '*doesn\'t even pause* nothing. it stays open. a full board isn\'t a closed case, it\'s a case somebody finally BELIEVES. those are different words and I need you to hear both of them.', opts: [] },
        salvage: {
          line: salvage
            ? '*takes each tag, reads it, and does not say anything for a while* a hall token. a bus transfer punched at 3:04 in the morning when the last bus is 1:15. a tanker gasket. a work order that says DO NOT DIVE, signed and countersigned and never actioned. a key cut for MY taped cabinet, eleven pipes from the hall. *very quietly* eight pieces of paperwork the DPW never filed. that\'s the whole night, kid. that\'s the whole night in brass.'
            : '*already writing* brass tags. wired in at depth. the DPW tags anything they pull and files nothing they tag — that is not sloppiness, that is a SYSTEM. ' + tags + ' of eight, was it? bring me the rest. the deep ones especially.',
          opts: salvage ? [
            { t: 'so the DPW was in on it.', next: 'salvage2' },
            { t: 'the last one wasn\'t a DPW tag.', next: 'salvage3' },
          ] : [],
        },
        salvage2: { line: '*shakes head slowly* "in on it" needs a person. what I\'ve got is a department that wrote it all down and put it underwater. …which, granted, is what I\'d do. *stops* forget I said that.', opts: [] },
        salvage3: { line: '"it likes the pipes better than the bay. leave it a door." *turns the tag over twice* unsigned. handwriting is careful. whoever wrote that wasn\'t hiding it from ME, kid — they were leaving it FOR somebody. and somebody left the grate unlocked. *stares at the gutter across the road*', opts: [] },
        manifest: {
          line: '*unrolls it under the streetlight with two fingers, the way you handle a thing you can\'t re-wet* weights. a route. a column of buyers. …and not one of those buyers exists, kid, I\'ve run all four. so the shipment is REAL, the destination is REAL, and the recipients are a creative writing exercise. *rolls it back up* this is the other half of tag 049. I have the top of this page in an evidence bag.',
          opts: [
            { t: "doesn't that prove the theft?", next: 'manifest2' },
            { t: 'who wrote it?', next: 'manifest3' },
          ],
        },
        manifest2: { line: 'it proves a SHIPMENT. it proves weight leaving town at an hour when nothing leaves town. it does not prove whose. *pins it anyway* every case is built out of things that almost prove it. you just need enough almosts.', opts: [] },
        manifest3: { line: 'accountant\'s hand. tidy. the same tidy hand that waves at the Grease Garage shutter on his way home. *underlines something twice* …I like him for a lot of things, kid. liking is not charging.', opts: [] },
        gtaRap: {
          line: droveOut
            ? '*flips WAY back in the notepad* eleven syndicate contracts. boosted cruisers. a BATTER VAN bonfire outside my own HQ. and one civilian — at the END of my pier, at midnight, DURING a raid — who watched the evidence surface and drove home. *closes notepad slowly* I know it\'s you, kid. I can\'t prove it\'s you. it\'s the worst thing that\'s ever happened to me.'
            : rap >= 6
              ? 'funny you ask. deliveries. a missing tanker. somebody TAILED me for half an hour last tuesday — sloppy, by the way, I made the car twice and let it slide. tell your phone-booth friends the NPD reads the water bill too.'
              : 'car thefts up four hundred percent. suspect described as "small, golden, crispy" — which is EVERYONE in this town. *clicks pen* if you hear anything. 555-DILL.',
          opts: [
            { t: 'must be the weather.', next: 'gtaRap2' },
            droveOut ? { t: 'the case stays open, then.', next: 'gtaRap3' } : null,
          ].filter(Boolean),
        },
        gtaRap2: { line: '*stares at the rain for a long time* everything in this town is the weather.', opts: [] },
        gtaRap3: { line: 'the case IS open. the case is a WEATHER PATTERN with a home address. *tips tiny hat* whoever that driver was… they held the pier while the whole bay lit up. NPD couldn\'t. off the record: not bad.', opts: [] },
        sawIt: {
          line: '*flips the notepad so fast a page tears* you HOOKED it. golden at the edges, swirling, VERY at large. so the syndicate dumped a living storm off my pier and it just… moved in. *long exhale* that\'s not larceny anymore, kid. that\'s habitat.',
          opts: [
            { t: 'so is the case closed?', next: 'sawIt2' },
            { t: 'it pulled HARD, detective.', next: 'sawIt3' },
          ],
        },
        sawIt2: { line: 'closed? the evidence WEATHER-PATTERN is circling the pier eating batter eels. the case has never been more open. but between us — *tips tiny hat* — best civilian work I\'ve ever seen. the tip line remembers.', opts: [] },
        sawIt3: { line: 'of course it pulled. it\'s a MILLION nuggets with a grudge. *scribbles* "do not attempt subpoena." *underlines it twice*', opts: [] },
        what: {
          line: 'somebody emptied the nugget catch cabinet overnight. an entire storm. no prints, no witnesses, no crumbs. there are ALWAYS crumbs. that\'s what worries me.',
          opts: [
            { t: "a whole storm doesn't just walk out.", next: 'walk' },
            { t: 'any leads?', next: 'leads' },
          ],
        },
        walk: { line: 'no. it gets CARRIED. in something big, with wheels and a schedule. *scribbles in notepad* say… you ever notice tanker trucks around here at night?', opts: [] },
        leads: { line: "the bouncer heard nothing, which is loud. the cup's seen too much. the hen bwoks like she knows something. and Dijon's lawyers keep calling ME. active investigation. next question.", opts: [] },
        suspects: {
          line: 'everyone. the calm ones especially. you want my gut? follow the batter. batter doesn\'t come from nowhere.',
          opts: [
            { t: 'the Sauce Works.', next: 'works' },
          ],
        },
        works: { line: "*long pause* I can't get a warrant for a chicken coop, kid. but if a civilian in boxing gloves happened to see something in there… my tip line is open.", opts: [] },
        help: {
          line: sawStorm
            ? 'you\'ve done plenty. *glances at the pier gate* keep a line in the water. if it starts moving TOWARD town, you know the number. 555-DILL.'
            : 'keep your gloves on and your eyes open. and now somebody\'s opened a FISHING PIER off my crime scene — gate at the east end, "bait provided." if the water starts… swirling? you call it in. do NOT hook it. *pause* …that\'s official advice.',
          opts: [],
        },
        bye: { line: '*tips tiny hat* NPD appreciates your cooperation.', opts: [] },
        };
      },
    },
  ];

  // ---- dialogue engine (DOM panel; movement freezes while it's open) ----------------

  // ---- 🗂️ THE EVIDENCE LOCKER ---------------------------------------------------
  // The case file, made public and kept honest. Every exhibit in this list is
  // something one of the fourteen games can actually produce, read through the
  // same cross-game flag readers the street NPCs use (docs/casefile.md holds the
  // canon table). FILED means you proved it. OPEN is not a failure — it is a
  // LEAD, so every open exhibit says where to go get it.
  //
  // Canon rule, load-bearing: filing all fifteen does NOT close the case. The
  // storm is never caught, freed, or killed. The board just gets fuller.
  const LOCKER_EXHIBITS = [
    { i: '🧺', t: 'THE EMPTY CABINET', src: 'THE HALL',
      got: () => true,
      filed: 'A million-plus nuggets, gone overnight. No prints, no witnesses, no crumbs. There are always crumbs.',
      open: '' },
    { i: '🎯', t: 'THE LINE HELD', src: 'NUGGETOWN DEFENSE',
      got: () => typeof blasterHeld === 'function' && blasterHeld(),
      filed: 'The skyline stood through the bomber. Whoever runs the batter runs it by AIR too — noted.',
      open: 'Survive the waves and the 🛢️ BATTER BOMBER at the cannon.' },
    { i: '🐤', t: 'THE FLYOVER', src: 'FLAPPY NUG',
      got: () => typeof flappyStormFlown === 'function' && flappyStormFlown(),
      filed: 'Aerial sighting: the storm, from above, holding formation. Storms do not hold formation.',
      open: 'Fly the towers all the way out to THE STORM.' },
    { i: '🥣', t: 'THE SECRET SAUCE', src: 'SAUCE DUNK',
      got: () => typeof dunkSecretServed === 'function' && dunkSecretServed(),
      filed: 'A sauce nobody ordered, served off-menu. The recipe traces back to the Works.',
      open: 'Work a clean shift until the off-menu cup comes up.' },
    { i: '🏃', t: 'THE PIER RUN', src: 'NUGGET RUN',
      got: () => typeof runReachedPier === 'function' && runReachedPier(),
      filed: 'Someone ran the whole town end to end and stopped at the pier. Everything stops at the pier.',
      open: 'Run until the boards go wooden — reach THE PIER.' },
    { i: '🧘', t: 'THE WITNESS', src: 'NUGGET SIMULATOR',
      got: () => typeof simSawStorm === 'function' && simSawStorm(),
      filed: 'Sat still long enough to see it go past. Best witness on the file. Declines to make a statement.',
      open: 'Sit. Watch the seasons turn. Witness every Sight.' },
    { i: '🎣', t: 'THE DUMP SITE', src: 'KEEPING IT REEL',
      got: () => typeof reelStormLanded === 'function' && reelStormLanded(),
      filed: 'Landed off the pier at midnight. It did not drown. It MOVED IN. Larceny became habitat.',
      open: 'Fish the deep water off the pier until something golden circles.' },
    { i: '🍾', t: 'THE MANIFEST', src: 'KEEPING IT REEL',
      got: () => typeof reelManifestFound === 'function' && reelManifestFound(),
      filed: 'A corked bottle off the deep bottom: weights, a route, and a column of buyers who never existed.',
      open: 'Rest a line on the deep bottom, out past the swirl, on THE MIDNIGHT.' },
    { i: '🚔', t: 'THE HARBOR JOB', src: 'GRAND THEFT NUGGET',
      got: () => typeof gtaSawStorm === 'function' && gtaSawStorm(),
      filed: 'Midnight, end of the north pier: the bay STOOD UP, and went back under. Never freed. Never killed.',
      open: 'Work the syndicate contracts through to THE HARBOR JOB.' },
    { i: '🗂️', t: 'THE CORKBOARD', src: 'GRAND THEFT NUGGET',
      got: () => typeof gtaEvidence === 'function' && gtaEvidence() >= 12,
      filed: 'Twelve exhibits, one red string, first complete board this department has ever had.',
      open: 'Twelve pieces of evidence are seeded across the districts. Find them all.' },
    { i: '🥒', t: "DILL'S CHAIN", src: 'GRAND THEFT NUGGET',
      got: () => typeof gtaDillDone === 'function' && gtaDillDone(),
      filed: 'Four off-book jobs with a civilian. The books burned themselves. Ash cannot testify.',
      open: 'Fill the case board and the detective will call the car himself.' },
    { i: '🎧', t: 'THE SAMPLE', src: 'DIP HOP',
      got: () => typeof beatEncoreDone === 'function' && beatEncoreDone(),
      filed: 'A recorder held over the pier rail at midnight. The harbor answered ON BEAT. Nothing moved.',
      open: 'Play the set clean enough that DJ DRIP breaks out the encore.' },
    { i: '🕳️', t: 'THE PASSING', src: 'STORM DRAIN',
      got: () => typeof drainSawStorm === 'function' && drainSawStorm(),
      filed: 'Below 400m the water went still and something weather-sized used the mains as a bus lane.',
      open: 'Dive the pipes past 400 metres and listen for what passes.' },
    { i: '🏷️', t: 'THE DPW SALVAGE', src: 'STORM DRAIN',
      got: () => typeof drainSalvageDone === 'function' && drainSalvageDone(),
      filed: 'All eight tags pulled out of the mains: a hall token, a 3AM transfer, a tanker gasket, a cabinet key.',
      open: () => 'Eight brass tags are wired into the pipes, deeper and deeper. ' +
        (typeof drainTagCount === 'function' ? drainTagCount() : 0) + '/8 pulled.' },
    { i: '🚪', t: 'THE DOOR', src: 'THE UNDERCROFT',
      got: () => typeof croftFoundDoor === 'function' && croftFoundDoor(),
      filed: 'Floors under the fort no drawing admits to, ending at a vault door: gold in the seam, water behind it, moving harbor-way. Tag 077 said "leave it a door." Somebody built it one.',
      open: 'Delve beneath Fort Nugget until the stairs land somewhere that isn\'t on the plans.' },
  ];

  function lockerFiledCount() {
    let n = 0;
    for (const e of LOCKER_EXHIBITS) { try { if (e.got()) n++; } catch (err) { /* a game that isn't loaded is just unfiled */ } }
    return n;
  }

  let lockerOv = null;

  function openLocker() {
    if (lockerOv) return;
    if (H.plock) document.exitPointerLock(); // the board wants a cursor
    const filed = lockerFiledCount(), total = LOCKER_EXHIBITS.length;
    const all = filed >= total;
    const ov = document.createElement('div');
    // .modal-overlay.active makes the hall's own key/mouse handlers stand down
    // (modalOpen() in this file) — the board owns the keyboard while it's up
    ov.className = 'modal-overlay active npd-locker';
    const rows = LOCKER_EXHIBITS.map((e) => {
      let got = false;
      try { got = !!e.got(); } catch (err) { got = false; }
      const note = got ? e.filed : (typeof e.open === 'function' ? e.open() : e.open);
      return '<div class="npd-ex ' + (got ? 'filed' : 'open') + '">' +
        '<span class="npd-ex-i">' + e.i + '</span>' +
        '<span class="npd-ex-b"><span class="npd-ex-t">' + e.t + '</span>' +
        '<span class="npd-ex-src">' + e.src + '</span>' +
        '<span class="npd-ex-n">' + note + '</span></span>' +
        '<span class="npd-ex-s">' + (got ? 'FILED' : 'OPEN') + '</span></div>';
    }).join('');
    ov.innerHTML =
      '<div class="npd-panel">' +
        '<div class="npd-head">' +
          '<span class="npd-title"><span class="npd-no">N.P.D. CASE FILE № 000-001</span>' +
          '<span class="npd-name">THE CATCH INCIDENT</span></span>' +
          '<button type="button" class="npd-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="npd-status"><span class="npd-open">STATUS: OPEN. FOREVER. DO NOT ARCHIVE.</span>' +
        '<span class="npd-count">EXHIBITS FILED <b>' + filed + '</b> / ' + total + '</span></div>' +
        '<div class="npd-grid">' + rows + '</div>' +
        '<div class="npd-foot">' + (all
          ? '<b>DET. DILL:</b> every exhibit on the board and not one of them closes it. Good. A closed file is a file nobody reads. Keep the light on it. <i>— everything in this town is the weather.</i>'
          : '<b>DET. DILL:</b> an OPEN exhibit is not a hole in the case, it\'s a place to go tonight. Bring me something and I\'ll pin it.') +
        '</div>' +
      '</div>';
    function close() {
      window.removeEventListener('keydown', onKey, true);
      ov.remove();
      lockerOv = null;
    }
    function onKey(e) {
      if (e.code === 'Escape' || e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        close();
      }
    }
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('.npd-close')) close();
    });
    window.addEventListener('keydown', onKey, true);
    ov._close = close;   // so leaving the hall can't strand the board on screen
    document.body.appendChild(ov);
    lockerOv = ov;
    sfxBoop(520);
  }

  function closeLocker() { if (lockerOv && lockerOv._close) lockerOv._close(); }

  function openDialog(npc) {
    if (H.dialog) return;
    if (H.plock) document.exitPointerLock(); // hand the cursor to the reply buttons
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


    // block walls: facade extensions flush with the arcade front, side caps,
    // and the far side of the street. Windings follow the interior wall rules.
    wallZ(ST, 0, -21.5, -11, 0, 5, suv.brick, 2.2, 2.2, {});
    wallZ(ST, 0, 11, 21.5, 0, 5, suv.brick, 2.2, 2.2, {});
    wallX(ST, -21.5, 13.9, 0, 0, 6, suv.brick, 2.2, 2.2, {});  // west cap → +x
    // east cap → -x, now with a gap: the PIER GATE is open (Keeping It Reel)
    wallX(ST, 21.5, 0, 9.0, 0, 6, suv.brick, 2.2, 2.2, {});
    wallX(ST, 21.5, 12.8, 13.9, 0, 6, suv.brick, 2.2, 2.2, {});
    wallX(ST, 21.5, 9.0, 12.8, 3.6, 6, suv.brick, 2.2, 2.2, {}); // archway header
    wallZ(ST, 13.9, 21.5, -21.5, 0, 5.4, suv.across, 21.5, 5.4, { e: 0.22 }); // faces -z
    // THE BLOCK ACROSS THE ROAD. That one quad above is 43 metres of wall with
    // windows PAINTED on it — no reveals, so nothing ever catches a shadow and
    // the whole far side of the street reads as wallpaper. These bays stand
    // proud of it with real openings, sills, lintels and a cornice; the quad
    // stays behind as the backdrop, and if the mesh is unavailable you simply
    // get the old flat wall.
    {
      const BAY = 3.0, z = 13.9;
      for (let i = 0; i < 14; i++) {
        const bx = -20.0 + i * BAY;
        // DIP HOP's basement door and its neon are the only things ON this
        // wall (the shops are at z=0.04, on the arcade's own side of the
        // street). A bay over the top of them buries the club entrance.
        if (bx > -9.0 && bx < -3.0) continue;
        if (!ST.model('facadeBay', suv, { x: bx, z, yaw: Math.PI })) break;
        // a few of them wear an air conditioner over the lower window
        if ((i * 7) % 5 === 0) {
          ST.model('acUnit', suv, { x: bx + 0.55, y: 1.42, z: z - 0.16, yaw: Math.PI });
          H.glows.push({ p: [bx, 4.3, z - 0.35], c: [1, 0.86, 0.55], s: 0.7, a: 0.05, k: 'sign' });
        }
      }
    }

    // storefronts sit proud of the brick
    const shop = (x0, x1, name, e) =>
      ST.quad([x0, 0, 0.04], [x1, 0, 0.04], [x1, 4.4, 0.04], [x0, 4.4, 0.04], suv[name], { e });
    shop(-21.3, -17.5, 'shopLaundro', 0.3);
    shop(-17.1, -12.1, 'shopGarage', 0.12);
    shop(12.1, 17.1, 'shopNoodle', 0.3);

    // Awnings. Every shopfront was a lit quad with nothing standing off it, so
    // the whole terrace read as a painted backdrop — nothing on that side of
    // the street cast anything or occluded anything. These are real canvas on
    // a real frame (blender/hallmesh.py build_awning), one per bay of each
    // shop, and they are the first thing on the street to hang OVER the
    // pavement. No fallback quad: an awning that fails to load is simply an
    // awning the shop never had, which is a shop, not a hole.
    // Height matters: the shop sign strip lives in the top ~70px of a 224px
    // region stretched over 4.4m, so anything above ~3.1 covers the shop's own
    // name. The awning tops out at ay + 0.65.
    for (const [ax0, ax1, ay] of [[-21.3, -17.5, 2.42], [-17.1, -12.1, 2.30], [12.1, 17.1, 2.42]]) {
      const bays = Math.max(1, Math.round((ax1 - ax0) / 2.42));
      const step = (ax1 - ax0) / bays;
      for (let i = 0; i < bays; i++) {
        const ax = ax0 + step * (i + 0.5);
        // yaw 0, NOT PI. A model's front faces -Y in Blender = +Z in the hall,
        // and the shopfronts face the pavement at +Z. The first pass copied
        // facadeBay's yaw PI — which is right for the block ACROSS the road,
        // facing back — and buried every awning inside the building.
        ST.model('awning', suv, { x: ax, y: ay, z: 0.06, yaw: 0 });
        H.propBoxes.push({ min: [ax - 1.24, 0, 0.0], max: [ax + 1.24, ay + 0.7, 0.95] });
      }
    }

    // the road + curb (sidewalk itself is the reflective floor plane)
    planeY(ST, 0.004, -21.5, 21.5, 8, 13.9, suv.road, 4.3, false, {});
    wallZ(ST, 8, 21.5, -21.5, 0, 0.09, suv.sw_curb, 4, 0.09, {}); // curb face → -z
    planeY(ST, 0.09, -21.5, 21.5, 7.72, 8.01, suv.sw_curb, 4, false, {});

    // streetlamps down the curb line — cast iron, with a real lantern on the
    // end of a curved arm (blender/hallmesh.py build_street_lamp). yaw PI turns
    // the model's -z arm to reach out over the pavement.
    for (const lx of [-15, -5.5, 5, 15]) {
      const lz = 7.3;
      if (!ST.model('streetLamp', suv, { x: lx, z: lz, yaw: Math.PI })) {
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
      }
      H.glows.push({ p: [lx, 3.0, lz - 0.57], c: [1, 0.72, 0.35], s: 1.5, a: 0.2, k: 'sign' });
      // A lamp on a wet night is not a bright dot, it is a CONE. The hall had
      // light with nothing in the air for it to catch — the reason the street
      // read as a black room with lamps painted on the wall. These are the
      // cheapest possible volumetrics: two tall additive billboards for the
      // shaft and one flat pool where it lands, riding the sprite pass that
      // was already drawing halos. No new program, no depth prepass.
      H.glows.push({ p: [lx, 1.75, lz - 0.62], c: [1, 0.74, 0.38], sw: 0.78, sh: 1.5, a: 0.052, k: 'shaft' });
      H.glows.push({ p: [lx, 1.05, lz - 0.66], c: [1, 0.78, 0.42], sw: 1.25, sh: 1.05, a: 0.030, k: 'shaft' });
      H.glows.push({ p: [lx, 0.035, lz - 0.72], c: [1, 0.7, 0.34], sw: 1.9, sh: 1.9, a: 0.085, k: 'pool' });
      H.propBoxes.push({ min: [lx - 0.15, 0, lz - 0.15], max: [lx + 0.15, 3.3, lz + 0.15] });
    }

    // a bench for Gravy — slatted, cast-iron ends. The seat stays at 0.45
    // because his NPCS[] yBase sits him on it.
    {
      const bx0 = 8.3, bx1 = 10.3, bz = 0.62;
      if (!ST.model('bench', suv, { x: (bx0 + bx1) / 2, z: bz + 0.21 })) {
      planeY(ST, 0.45, bx0, bx1, bz, bz + 0.42, suv.sw_wood, 2.2, false, {});
      ST.quad([bx0, 0.45, bz], [bx1, 0.45, bz], [bx1, 0.95, bz], [bx0, 0.95, bz], suv.sw_wood, { tint: 0.9 });
      ST.quad([bx1, 0.45, bz - 0.02], [bx0, 0.45, bz - 0.02], [bx0, 0.95, bz - 0.02], [bx1, 0.95, bz - 0.02], suv.sw_wood, { tint: 0.75 });
      for (const lx2 of [bx0 + 0.15, bx1 - 0.15]) {
        ST.quad([lx2 - 0.04, 0, bz + 0.42], [lx2 + 0.04, 0, bz + 0.42], [lx2 + 0.04, 0.45, bz + 0.42], [lx2 - 0.04, 0.45, bz + 0.42], suv.sw_woodDark, {});
        ST.quad([lx2 + 0.04, 0, bz + 0.02], [lx2 - 0.04, 0, bz + 0.02], [lx2 - 0.04, 0.45, bz + 0.02], [lx2 + 0.04, 0.45, bz + 0.02], suv.sw_woodDark, {});
      }
      }
      H.propBoxes.push({ min: [bx0, 0, bz - 0.05], max: [bx1, 0.95, bz + 0.5] });
    }

    // hydrant
    {
      const hx = -7.5, hz = 0.95;
      // A revolved hydrant with a bonnet and nozzles. It was six flat faces
      // with a folded card on top, which the eye reads as wrong long before it
      // can say why: hydrants are all shoulder.
      if (!ST.model('hydrant', suv, { x: hx, z: hz })) {
      // outward box faces: z+ x-asc, z- x-desc, x- z-asc, x+ z-desc
      for (const [a, b] of [[[hx - 0.14, hz + 0.14], [hx + 0.14, hz + 0.14]], [[hx + 0.14, hz - 0.14], [hx - 0.14, hz - 0.14]],
        [[hx - 0.14, hz - 0.14], [hx - 0.14, hz + 0.14]], [[hx + 0.14, hz + 0.14], [hx + 0.14, hz - 0.14]]])
        ST.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], 0.52, b[1]], [a[0], 0.52, a[1]], suv.sw_red, { tint: 0.9 });
      ST.quad([hx - 0.09, 0.52, hz + 0.09], [hx + 0.09, 0.52, hz + 0.09], [hx + 0.09, 0.66, hz], [hx - 0.09, 0.66, hz], suv.sw_red, { tint: 0.8 });
      ST.quad([hx + 0.09, 0.52, hz - 0.09], [hx - 0.09, 0.52, hz - 0.09], [hx - 0.09, 0.66, hz], [hx + 0.09, 0.66, hz], suv.sw_red, { tint: 0.8 });
      }
      H.propBoxes.push({ min: [hx - 0.2, 0, hz - 0.2], max: [hx + 0.2, 0.7, hz + 0.2] });
      // a litter bin next to it — there has been a coffee cup and a stack of
      // crates on this pavement since the street opened and nowhere to put them
      ST.model('bin', suv, { x: hx + 1.35, z: hz - 0.05 });
      H.propBoxes.push({ min: [hx + 1.1, 0, hz - 0.3], max: [hx + 1.6, 0.85, hz + 0.2] });
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
      // The exit from the entire arcade has been a pole with a sign on it.
      // The shelter stands BEHIND the pole rather than replacing it — the bus
      // hotspot and its stand coordinate are a contract with the hall, and the
      // sign is what the player actually aims at.
      if (ST.model('busShelter', suv, { x: sx - 2.1, z: sz + 0.30, yaw: Math.PI })) {
        H.propBoxes.push({ min: [sx - 3.7, 0, sz - 0.35], max: [sx - 0.5, 2.6, sz + 0.95] });
        H.glows.push({ p: [sx - 2.1, 2.29, sz + 0.28], c: [0.85, 0.92, 1], s: 1.15, a: 0.10, k: 'tube' });
      }
      H.hotspots.push({
        kind: 'bus',
        x: sx, z: sz, r: 2.4,
        min: [sx - 0.42, 0, sz - 0.15], max: [sx + 0.42, 2.5, sz + 0.15],
        stand: [sx, EYE, sz - 1.2],
        label: 'CALL IT A NIGHT — BACK TO THE CALCULATOR',
        act: () => exit(),
      });
    }

    // ---- 🗂️ THE EVIDENCE LOCKER (the NPD noticeboard) ---------------------------
    // Two legs and a glass case on the sidewalk between the hydrant and the
    // detective, angled to face anyone coming up off the road. It is the case
    // file MADE PUBLIC: every exhibit any game in this arcade has ever produced,
    // filed or open, with Dill's note underneath. Walk up, press E.
    // Nothing here resolves anything — canon says the case is open forever
    // (docs/casefile.md) — but the board is where you find out what you've
    // proved and what the department is still waiting on.
    {
      const nx0 = -6.5, nx1 = -4.9, nmx = (nx0 + nx1) / 2, nz = 1.15;
      const ny0 = 0.95, ny1 = 2.02;
      // the case face (faces +z, into the street: wind x ascending)
      ST.quad([nx0, ny0, nz], [nx1, ny0, nz], [nx1, ny1, nz], [nx0, ny1, nz], suv.npdBoard, { e: 0.24 });
      // the back (faces -z: wind x descending) — plain department steel
      ST.quad([nx1, ny0, nz - 0.05], [nx0, ny0, nz - 0.05], [nx0, ny1, nz - 0.05], [nx1, ny1, nz - 0.05], suv.sw_iron, { tint: 0.7 });
      // the two side edges, so it reads as a case and not a decal
      ST.quad([nx0, ny0, nz - 0.05], [nx0, ny0, nz], [nx0, ny1, nz], [nx0, ny1, nz - 0.05], suv.sw_iron, { tint: 0.6 });
      ST.quad([nx1, ny0, nz], [nx1, ny0, nz - 0.05], [nx1, ny1, nz - 0.05], [nx1, ny1, nz], suv.sw_iron, { tint: 0.6 });
      // legs
      for (const lx of [nx0 + 0.18, nx1 - 0.18]) {
        ST.quad([lx - 0.04, 0, nz], [lx + 0.04, 0, nz], [lx + 0.04, ny0 + 0.04, nz], [lx - 0.04, ny0 + 0.04, nz], suv.sw_iron, { tint: 0.75 });
        ST.quad([lx + 0.04, 0, nz - 0.05], [lx - 0.04, 0, nz - 0.05], [lx - 0.04, ny0 + 0.04, nz - 0.05], [lx + 0.04, ny0 + 0.04, nz - 0.05], suv.sw_iron, { tint: 0.6 });
      }
      // a little hooded lamp over the glass, because nobody reads a dark board
      ST.quad([nmx - 0.22, ny1 + 0.1, nz + 0.06], [nmx + 0.22, ny1 + 0.1, nz + 0.06], [nmx + 0.18, ny1 + 0.2, nz - 0.01], [nmx - 0.18, ny1 + 0.2, nz - 0.01], suv.sw_iron, { tint: 0.7 });
      H.glows.push({ p: [nmx, ny1 + 0.02, nz + 0.16], c: [0.6, 1, 0.72], s: 1.25, a: 0.16, k: 'sign' });
      H.glows.push({ p: [nmx, (ny0 + ny1) / 2, nz + 0.3], c: [0.22, 1, 0.48], s: 1.5, a: 0.07, k: 'neon' });
      H.propBoxes.push({ min: [nx0 - 0.06, 0, nz - 0.16], max: [nx1 + 0.06, ny1 + 0.25, nz + 0.08] });
      H.hotspots.push({
        kind: 'locker',
        x: nmx, z: nz, r: 2.6,
        min: [nx0 - 0.1, ny0 - 0.1, nz - 0.1], max: [nx1 + 0.1, ny1 + 0.28, nz + 0.14],
        stand: [nmx, EYE, nz + 1.35],
        label: '🗂️ N.P.D. CASE BOARD — READ IT',
        act: () => openLocker(),
      });
    }

    // ---- GRAND THEFT NUGGET's street door -------------------------------------
    // A compact double-parked in the road near the bus stop: hazards blinking,
    // keys in it, nobody coming back for it. That's not parking, that's an
    // INVITATION. Boosting it launches the 12th game (a STREET game — the main
    // atlas never hears about any of this).
    {
      const cx0 = -10.6, cx1 = -8.2, cz0 = 8.75, cz1 = 9.95;
      const cmx = (cx0 + cx1) / 2, cmz = (cz0 + cz1) / 2;
      // THE COMPACT, in the metal. blender/hallmesh.py build_compact(): a
      // lofted body with wheel arches, a raked screen, and four round wheels,
      // parked nose-west (yaw -90° turns the model's local +z front onto -x).
      // Everything below the `if` is the original slab rig, kept as the
      // fallback — it is what you see if js/hallMesh.js fails to load.
      const carMesh = ST.model('compact', suv, { x: cmx, z: cmz, yaw: -Math.PI / 2 });
      if (!carMesh) {
      // wheels: four dark stubs under the corners
      for (const [wx, wz] of [[cx0 + 0.42, cz0 + 0.13], [cx1 - 0.42, cz0 + 0.13], [cx0 + 0.42, cz1 - 0.13], [cx1 - 0.42, cz1 - 0.13]]) {
        for (const [a, b] of [[[wx - 0.19, wz + 0.12], [wx + 0.19, wz + 0.12]], [[wx + 0.19, wz - 0.12], [wx - 0.19, wz - 0.12]],
          [[wx - 0.19, wz - 0.12], [wx - 0.19, wz + 0.12]], [[wx + 0.19, wz + 0.12], [wx + 0.19, wz - 0.12]]])
          ST.quad([a[0], 0.004, a[1]], [b[0], 0.004, b[1]], [b[0], 0.34, b[1]], [a[0], 0.34, a[1]], suv.sw_black, {});
      }
      // body: painted flanks, solid nose/tail, roof panel
      wallZ(ST, cz1, cx0, cx1, 0.16, 0.58, suv.gtaCarSide, cx1 - cx0, 0.42, {}); // faces +z (the road)
      wallZ(ST, cz0, cx1, cx0, 0.16, 0.58, suv.gtaCarSide, cx1 - cx0, 0.42, {}); // faces -z (the curb — the one you see)
      wallX(ST, cx0, cz0, cz1, 0.16, 0.58, suv.gtaCarNose, cz1 - cz0, 0.42, {});  // nose → -x
      wallX(ST, cx1, cz1, cz0, 0.16, 0.58, suv.gtaCarNose, cz1 - cz0, 0.42, {});  // tail → +x
      planeY(ST, 0.58, cx0, cx1, cz0, cz1, suv.gtaCarRoof, 2.6, false, {});
      // cabin: dark glass all round, red roof
      const gx0 = cx0 + 0.55, gx1 = cx1 - 0.55, gz0 = cz0 + 0.12, gz1 = cz1 - 0.12;
      wallZ(ST, gz1, gx0, gx1, 0.58, 0.88, suv.gtaCarGlass, gx1 - gx0, 0.3, {});
      wallZ(ST, gz0, gx1, gx0, 0.58, 0.88, suv.gtaCarGlass, gx1 - gx0, 0.3, {});
      wallX(ST, gx0, gz0, gz1, 0.58, 0.88, suv.gtaCarGlass, gz1 - gz0, 0.3, {});
      wallX(ST, gx1, gz1, gz0, 0.58, 0.88, suv.gtaCarGlass, gz1 - gz0, 0.3, {});
      planeY(ST, 0.88, gx0, gx1, gz0, gz1, suv.gtaCarRoof, 1.6, false, {});
      // hazard corners (dim amber quads; the BLINK is the glow sprites below)
      for (const [hx2, face] of [[cx0 + 0.14, 1], [cx1 - 0.14, 1], [cx0 + 0.14, -1], [cx1 - 0.14, -1]]) {
        const hz2 = face === 1 ? cz1 + 0.005 : cz0 - 0.005;
        const x0h = hx2 - 0.09, x1h = hx2 + 0.09;
        if (face === 1) ST.quad([x0h, 0.36, hz2], [x1h, 0.36, hz2], [x1h, 0.47, hz2], [x0h, 0.47, hz2], suv.sw_amber, { e: 0.2 });
        else ST.quad([x1h, 0.36, hz2], [x0h, 0.36, hz2], [x0h, 0.47, hz2], [x1h, 0.47, hz2], suv.sw_amber, { e: 0.2 });
      }
      } // end procedural compact fallback
      // The blink lives in the sprite pass either way — the mesh carries amber
      // corner lenses at local (±0.50, ±1.02) so these sit right on them.
      H.glows.push({ p: [cx0 + 0.14, 0.42, cz0 - 0.06], c: [1, 0.7, 0.15], s: 0.75, a: 0.3, k: 'hazard' });
      H.glows.push({ p: [cx1 - 0.14, 0.42, cz0 - 0.06], c: [1, 0.7, 0.15], s: 0.75, a: 0.3, k: 'hazard' });
      H.glows.push({ p: [cmx, 0.5, cz1 + 0.06], c: [1, 0.7, 0.15], s: 0.9, a: 0.22, k: 'hazard' });
      H.propBoxes.push({ min: [cx0 - 0.1, 0, cz0 - 0.1], max: [cx1 + 0.1, 1.0, cz1 + 0.1] });
      H.hotspots.push({
        kind: 'gta',
        x: cmx, z: cmz, r: 2.8,
        min: [cx0 - 0.15, 0, cz0 - 0.15], max: [cx1 + 0.15, 1.0, cz1 + 0.15],
        stand: [cmx, EYE, 7.1],
        label: '🚔 GRAND THEFT NUGGET — BOOST IT',
        act: () => {
          H.lastCab = null;
          H.lastSpot = { stand: [cmx, 7.1], look: [cmx, 0.5, cmz] };
          launchGame('gta');
        },
      });
    }

    // ---- DIP HOP's front door ---------------------------------------------------
    // Across the street, on the far wall: a steel basement door with a glowing
    // porthole, a neon sign, and a bass thump you can SEE (glow kind 'thump'
    // pulses in the sprite pass — same trick as the compact's hazards, but on
    // the one and the three). The Hooded Nug's last rumor, three for three.
    {
      const dx0 = -6.7, dx1 = -5.3, dmx = (dx0 + dx1) / 2, dz = 13.86;
      // the door (faces -z: wind +x → -x, busSign-style)
      ST.quad([dx1, 0, dz], [dx0, 0, dz], [dx0, 2.2, dz], [dx1, 2.2, dz], suv.beatDoor, { e: 0.18 });
      // the neon over it
      ST.quad([dmx + 1.1, 2.38, dz + 0.02], [dmx - 1.1, 2.38, dz + 0.02], [dmx - 1.1, 3.48, dz + 0.02], [dmx + 1.1, 3.48, dz + 0.02], suv.beatSign, { e: 0.4 });
      H.glows.push({ p: [dmx, 2.93, 13.6], c: [1, 0.18, 0.63], s: 1.5, a: 0.14, k: 'neon' });
      H.glows.push({ p: [dmx, 2.93, 13.6], c: [0.49, 0.3, 1], s: 2.3, a: 0.06, k: 'neon' });
      H.glows.push({ p: [dmx, 1.55, 13.7], c: [1, 0.4, 0.75], s: 0.5, a: 0.12, k: 'neon' }); // the porthole
      // the THUMP (kick side + under-door light spill, offset half a beat)
      H.glows.push({ p: [dmx, 1.1, 13.55], c: [1, 0.18, 0.63], s: 2.4, a: 0.15, k: 'thump' });
      H.glows.push({ p: [dmx, 0.06, 13.7], c: [1, 0.3, 0.7], s: 0.9, a: 0.2, k: 'thump', ph: 0.5 });
      H.hotspots.push({
        kind: 'beat',
        x: dmx, z: 13.65, r: 2.9,
        min: [dx0 - 0.15, 0, 13.55], max: [dx1 + 0.15, 2.4, 13.92],
        stand: [dmx, EYE, 12.3],
        label: '🎧 DIP HOP — SLIDE IN',
        act: () => {
          H.lastCab = null;
          H.lastSpot = { stand: [dmx, 12.3], look: [dmx, 1.2, 13.9] };
          launchGame('beat');
        },
      });
    }

    // ---- STORM DRAIN's front door -----------------------------------------------
    // A grate in the gutter by the far curb, east of the club. It glows GOLD
    // from underneath after the rain — kind 'swirl' glows orbiting under the
    // slats, the pier trick at street scale — and the DPW barricade next to it
    // says DO NOT DIVE, which every citizen of Nuggetown reads as instructions.
    // Game 14, the fourth street game (js/drain.js).
    {
      const gx0 = 8.1, gx1 = 9.5, gz0 = 12.55, gz1 = 13.35;
      const gmx = (gx0 + gx1) / 2, gmz = (gz0 + gz1) / 2;
      // the grate, flush with the road (planeY like the compact's roof)
      planeY(ST, 0.012, gx0, gx1, gz0, gz1, suv.drainGrate, 1, false, { e: 0.22 });
      // what's down there, circling (small, gold, patient)
      for (let i = 0; i < 3; i++)
        H.glows.push({ p: [gmx, 0.06, gmz], c: [1, 0.78, 0.25], s: 0.5, a: 0.14, k: 'swirl', ph: i * 2.1, r: 0.3 + i * 0.14 });
      // the DPW barricade: two legs and a striped board, work-light blinking
      const bx0 = 9.95, bx1 = 11.25, bz = 12.9;
      ST.quad([bx1, 0.52, bz], [bx0, 0.52, bz], [bx0, 1.16, bz], [bx1, 1.16, bz], suv.drainSign, { e: 0.14 }); // faces the street (-z)
      ST.quad([bx0, 0.52, bz + 0.03], [bx1, 0.52, bz + 0.03], [bx1, 1.16, bz + 0.03], [bx0, 1.16, bz + 0.03], suv.drainSign, { e: 0.06 }); // and the wall
      for (const lx of [bx0 + 0.09, bx1 - 0.09]) {
        ST.quad([lx + 0.04, 0, bz - 0.05], [lx - 0.04, 0, bz - 0.05], [lx - 0.04, 1.2, bz + 0.015], [lx + 0.04, 1.2, bz + 0.015], suv.sw_iron, { tint: 0.8 });
      }
      H.glows.push({ p: [bx0 + 0.62, 1.24, bz - 0.06], c: [1, 0.7, 0.15], s: 0.7, a: 0.26, k: 'hazard' });
      H.propBoxes.push({ min: [bx0 - 0.06, 0, bz - 0.14], max: [bx1 + 0.06, 1.25, bz + 0.1] });
      H.hotspots.push({
        kind: 'drain',
        x: gmx, z: gmz, r: 2.6,
        min: [gx0 - 0.12, 0, gz0 - 0.12], max: [gx1 + 0.12, 0.55, gz1 + 0.12],
        stand: [gmx, EYE, 11.4],
        label: '🕳️ STORM DRAIN — DIVE IN',
        act: () => {
          H.lastCab = null;
          H.lastSpot = { stand: [gmx, 11.4], look: [gmx, 0.1, gmz] };
          launchGame('drain');
        },
      });
    }

    // ---- THE UNDERCROFT's front door ----------------------------------------------
    // Slanted storm-cellar doors in the forgotten corner east of the NOODLE
    // NUG, by the pier gate — oak, iron bands, and CANDLELIGHT in the seam
    // (glow kind 'votive': steadier than the cake's candle, because whatever
    // is burning down there has been burning a while). The painted board says
    // KEEP SHUT, which every citizen of Nuggetown reads at the same volume as
    // DO NOT DIVE. Game 15, the fifth street game (js/croft.js).
    // (Placement note: the noodle shopfront spans x 12.1–17.1 — the first
    // draft of these doors sat square in its window. Clear brick starts 17.3.)
    {
      const cx0 = 18.7, cx1 = 20.3, cmx2 = (cx0 + cx1) / 2;
      const czTop = 0.18, czBot = 1.05, cyTop = 0.95, cyBot = 0.03;
      // the slanted hatch top — emitted BOTH ways so the winding rules can't
      // back-face it into invisibility (it happened to a scoreboard once)
      ST.quad([cx0, cyBot, czBot], [cx1, cyBot, czBot], [cx1, cyTop, czTop], [cx0, cyTop, czTop], suv.croftDoor, { e: 0.16 });
      ST.quad([cx1, cyBot, czBot], [cx0, cyBot, czBot], [cx0, cyTop, czTop], [cx1, cyTop, czTop], suv.croftDoor, { e: 0.16 });
      // stone cheeks either side of the hatch
      ST.quad([cx0 - 0.12, 0, czBot], [cx0, 0, czBot], [cx0, cyTop, czTop], [cx0 - 0.12, cyTop, czTop], suv.sw_iron, { tint: 0.5 });
      ST.quad([cx1, 0, czBot], [cx1 + 0.12, 0, czBot], [cx1 + 0.12, cyTop, czTop], [cx1, cyTop, czTop], suv.sw_iron, { tint: 0.5 });
      // the painted board on the wall above (front + back so it reads regardless)
      ST.quad([cx0 + 0.1, 1.2, 0.16], [cx1 - 0.1, 1.2, 0.16], [cx1 - 0.1, 1.9, 0.16], [cx0 + 0.1, 1.9, 0.16], suv.croftSign, { e: 0.12 });
      ST.quad([cx1 - 0.1, 1.2, 0.13], [cx0 + 0.1, 1.2, 0.13], [cx0 + 0.1, 1.9, 0.13], [cx1 - 0.1, 1.9, 0.13], suv.croftSign, { e: 0.05 });
      // candlelight in the seam, three votives' worth, breathing out of phase
      H.glows.push({ p: [cmx2, 0.78, 0.32], c: [1, 0.78, 0.25], s: 0.55, a: 0.18, k: 'votive', ph: 0 });
      H.glows.push({ p: [cmx2, 0.48, 0.62], c: [1, 0.72, 0.2], s: 0.7, a: 0.14, k: 'votive', ph: 2.1 });
      H.glows.push({ p: [cmx2, 0.14, 0.95], c: [1, 0.78, 0.25], s: 0.5, a: 0.2, k: 'votive', ph: 4.4 });
      H.propBoxes.push({ min: [cx0 - 0.14, 0, 0.1], max: [cx1 + 0.14, cyTop, czBot + 0.06] });
      H.hotspots.push({
        kind: 'croft',
        x: cmx2, z: 0.8, r: 2.6,
        min: [cx0 - 0.15, 0, 0.1], max: [cx1 + 0.15, 1.95, czBot + 0.12],
        stand: [cmx2, EYE, 2.5],
        label: '🕯️ THE UNDERCROFT — GO DOWN',
        act: () => {
          H.lastCab = null;
          H.lastSpot = { stand: [cmx2, 2.5], look: [cmx2, 0.4, 0.6] };
          launchGame('croft');
        },
      });
    }

    // ---- THE PIER (Keeping It Reel's front door) --------------------------------
    // Through the gap in the east wall: a boardwalk out over the harbor. Its own
    // Builder so the water plane never joins the mirrored-reflection pass (a
    // mirrored sea would hover over the street like a very wet ghost).
    const PR = new Builder();
    {
      const px0 = 21.5, px1 = 33.6, pz0 = 9.3, pz1 = 12.5, deckY = 0.05;

      // the harbor itself (big dark apron; moon + swirl glows live on top)
      planeY(PR, -0.42, 21.5, 46, 2, 20, suv.water, 6, false, { e: 0.06 });

      // the deck + skirts down to the waterline
      planeY(PR, deckY, px0, px1, pz0, pz1, suv.pierWood, 1.6, false, {});
      wallZ(PR, pz0, px1, px0, -0.5, deckY, suv.sw_woodDark, 3, 0.6, {}); // faces -z (the road side)
      wallZ(PR, pz1, px0, px1, -0.5, deckY, suv.sw_woodDark, 3, 0.6, {}); // faces +z
      wallX(PR, px1, pz0, pz1, -0.5, deckY, suv.sw_woodDark, 3, 0.6, {}); // end cap → -x

      // pilings + railing posts (4 outward faces each, hydrant-style)
      const post = (cx2, cz2, y0, y1, s2, u) => {
        for (const [a, b] of [[[cx2 - s2, cz2 + s2], [cx2 + s2, cz2 + s2]], [[cx2 + s2, cz2 - s2], [cx2 - s2, cz2 - s2]],
          [[cx2 - s2, cz2 - s2], [cx2 - s2, cz2 + s2]], [[cx2 + s2, cz2 + s2], [cx2 + s2, cz2 - s2]]])
          PR.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], u, { tint: 0.85 });
      };
      for (const lx of [23.2, 26.6, 30.0, 33.3]) {
        post(lx, pz0 + 0.09, -0.5, 0.95, 0.07, suv.sw_wood);
        post(lx, pz1 - 0.09, -0.5, 0.95, 0.07, suv.sw_wood);
      }
      // rails (inward + outward faces so they read from the walkway and the water)
      const rail = (rz, y0, y1) => {
        PR.quad([px0, y0, rz], [px1, y0, rz], [px1, y1, rz], [px0, y1, rz], suv.sw_wood, { tint: 0.75 });
        PR.quad([px1, y0, rz], [px0, y0, rz], [px0, y1, rz], [px1, y1, rz], suv.sw_wood, { tint: 0.75 });
      };
      rail(pz0 + 0.09, 0.82, 0.95);
      rail(pz1 - 0.09, 0.82, 0.95);
      // end rail (so nobody keeps walking into the lore)
      PR.quad([px1 - 0.1, 0.5, pz0], [px1 - 0.1, 0.5, pz1], [px1 - 0.1, 0.62, pz1], [px1 - 0.1, 0.62, pz0], suv.sw_wood, { tint: 0.75 });
      PR.quad([px1 - 0.1, 0.82, pz0], [px1 - 0.1, 0.82, pz1], [px1 - 0.1, 0.95, pz1], [px1 - 0.1, 0.95, pz0], suv.sw_wood, { tint: 0.75 });

      // the gate sign over the entrance (both faces)
      PR.quad([px0 - 0.06, 2.4, 9.55], [px0 - 0.06, 2.4, 12.25], [px0 - 0.06, 3.5, 12.25], [px0 - 0.06, 3.5, 9.55], suv.pierSign, { e: 0.35 });
      PR.quad([px0 + 0.02, 2.4, 12.25], [px0 + 0.02, 2.4, 9.55], [px0 + 0.02, 3.5, 9.55], [px0 + 0.02, 3.5, 12.25], suv.pierSign, { e: 0.2 });
      H.glows.push({ p: [px0 - 0.3, 2.95, 10.9], c: [0.25, 0.85, 1], s: 1.3, a: 0.12, k: 'neon' });

      // lanterns on the south rail
      for (const lx of [25.5, 30.5]) {
        post(lx, pz1 - 0.09, deckY, 1.45, 0.045, suv.sw_iron);
        post(lx, pz1 - 0.11, 1.45, 1.62, 0.09, suv.sw_amber);
        H.glows.push({ p: [lx, 1.52, pz1 - 0.1], c: [1, 0.72, 0.35], s: 1.1, a: 0.16, k: 'sign' });
        H.propBoxes.push({ min: [lx - 0.1, 0, pz1 - 0.25], max: [lx + 0.1, 1.7, pz1 + 0.05] });
      }

      // the rod stand at the end: a leaning rod + bait bucket (walk up, cast off)
      PR.quad([32.7, deckY, 10.7], [32.76, deckY, 10.7], [33.34, 1.5, 11.05], [33.28, 1.5, 11.05], suv.sw_wood, { tint: 0.9 });
      PR.quad([32.76, deckY, 10.72], [32.7, deckY, 10.72], [33.28, 1.5, 11.07], [33.34, 1.5, 11.07], suv.sw_wood, { tint: 0.9 });
      post(32.5, 11.5, deckY, 0.42, 0.16, suv.sw_iron); // the bait bucket
      H.propBoxes.push({ min: [32.3, 0, 11.3], max: [32.7, 0.5, 11.7] });

      // the moon over the harbor + THE SWIRL, golden at the edges (k:'swirl'
      // glows orbit their anchor in the sprite pass — see render())
      H.glows.push({ p: [44, 5.2, 10.9], c: [0.7, 0.78, 1], s: 2.8, a: 0.13, k: 'neon' });
      H.glows.push({ p: [44, 0.0, 10.9], c: [0.5, 0.6, 0.9], s: 1.8, a: 0.07, k: 'neon' }); // its reflection
      for (let i = 0; i < 3; i++)
        H.glows.push({ p: [40, -0.28, 10.9], c: [1, 0.78, 0.25], s: 0.75, a: 0.18, k: 'swirl', ph: i * 2.1, r: 1.5 + i * 0.4 });

      H.hotspots.push({
        kind: 'reel',
        x: 32.6, z: 10.9, r: 2.6,
        min: [32.2, 0, 10.4], max: [33.4, 1.6, 11.4],
        stand: [31.4, EYE, 10.9],
        label: '🎣 KEEPING IT REEL — CAST A LINE',
        act: () => {
          H.lastCab = null;
          H.lastSpot = { stand: [31.4, 10.9], look: [33.4, 0.6, 10.9] };
          launchGame('reel');
        },
      });
    }

    // ---- the regulars, in the flesh -------------------------------------------
    // Real lit geometry now (community: the flat sprites "weren't quite there").
    // Local origin at the feet, +z is the character's front; each gets its own
    // buffer so it can bob and turn to face you mid-conversation.

    const blob3 = (B2, cx2, cy2, cz2, rx, ry, rz, seed, u, opts, stacks = 7, slices = 10) => {
      const P = (ph, th) => {
        const wob = 1 + 0.09 * Math.sin(ph * 3 + seed) * Math.cos(th * 2 + seed * 1.7) + 0.05 * Math.sin(th * 3 + seed);
        return [cx2 + Math.sin(ph) * Math.cos(th) * rx * wob, cy2 + Math.cos(ph) * ry * wob, cz2 + Math.sin(ph) * Math.sin(th) * rz * wob];
      };
      const uvAt = (fu, fv) => [u[0] + (u[2] - u[0]) * fu, u[1] + (u[3] - u[1]) * fv];
      for (let i = 0; i < stacks; i++) {
        const ph0 = (i / stacks) * Math.PI, ph1 = ((i + 1) / stacks) * Math.PI;
        for (let j = 0; j < slices; j++) {
          const th0 = (j / slices) * Math.PI * 2, th1 = ((j + 1) / slices) * Math.PI * 2;
          B2.quadV(
            [P(ph1, th0), P(ph1, th1), P(ph0, th1), P(ph0, th0)],
            [uvAt(j / slices, (i + 1) / stacks), uvAt((j + 1) / slices, (i + 1) / stacks),
              uvAt((j + 1) / slices, i / stacks), uvAt(j / slices, i / stacks)],
            opts
          );
        }
      }
    };
    const box3 = (B2, x0, y0, z0, x1, y1, z1, u, opts) => {
      B2.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], u, opts);
      B2.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], u, opts);
      B2.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], u, opts);
      B2.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], u, opts);
      B2.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], u, opts);
      B2.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], u, opts);
    };
    const tube3 = (B2, cx2, cz2, y0, y1, r0, r1, u, opts, slices = 12) => {
      for (let j = 0; j < slices; j++) {
        const a0 = (j / slices) * Math.PI * 2, a1 = ((j + 1) / slices) * Math.PI * 2;
        B2.quadV(
          [[cx2 + Math.cos(a1) * r0, y0, cz2 + Math.sin(a1) * r0], [cx2 + Math.cos(a0) * r0, y0, cz2 + Math.sin(a0) * r0],
            [cx2 + Math.cos(a0) * r1, y1, cz2 + Math.sin(a0) * r1], [cx2 + Math.cos(a1) * r1, y1, cz2 + Math.sin(a1) * r1]],
          [[u[0] + (u[2] - u[0]) * ((j + 1) / slices), u[3]], [u[0] + (u[2] - u[0]) * (j / slices), u[3]],
            [u[0] + (u[2] - u[0]) * (j / slices), u[1]], [u[0] + (u[2] - u[0]) * ((j + 1) / slices), u[1]]],
          opts
        );
      }
    };

    const npcBufs = {};
    // Each regular is a Blender model (blender/hallmesh.py build_<id>()) with
    // its hand-built blob3/box3 rig kept underneath as the fallback. The models
    // share this file's conventions exactly: origin at the feet, +z is the
    // character's front, and the height matches NPCS[].h so the name prompt and
    // the head glow still land above the head and not inside it.
    const makeNpc = (id, fn) => {
      const B2 = new Builder();
      if (!B2.model(id, suv, {})) fn(B2);
      npcBufs[id] = B2.upload(gl);
    };

    // BIG CRUMB: a slab of nugget in night sunglasses and a bow tie
    makeNpc('crumb', (B2) => {
      blob3(B2, 0, 0.52, 0, 0.34, 0.44, 0.28, 4, suv.nugSkin, { tint: 1.05 });
      box3(B2, -0.18, 0, 0.02, -0.05, 0.09, 0.2, suv.nugSkin, { tint: 0.8 });
      box3(B2, 0.05, 0, 0.02, 0.18, 0.09, 0.2, suv.nugSkin, { tint: 0.8 });
      box3(B2, -0.21, 0.6, 0.16, 0.21, 0.71, 0.31, suv.sw_black, { e: 0.08 });
      box3(B2, 0.28, 0.56, 0.02, 0.35, 0.64, 0.1, suv.sw_black, {});
      box3(B2, -0.13, 0.3, 0.22, -0.02, 0.4, 0.31, suv.sw_red, { tint: 0.9 });
      box3(B2, 0.02, 0.3, 0.22, 0.13, 0.4, 0.31, suv.sw_red, { tint: 0.9 });
      box3(B2, -0.025, 0.32, 0.24, 0.025, 0.38, 0.32, suv.sw_woodDark, {});
      blob3(B2, -0.38, 0.36, 0, 0.09, 0.09, 0.09, 7, suv.nugSkin, { tint: 0.9 }, 4, 6);
      blob3(B2, 0.38, 0.36, 0, 0.09, 0.09, 0.09, 8, suv.nugSkin, { tint: 0.9 }, 4, 6);
    });

    // GRAVY JONES: a weathered cup settled on the bench (yBase lifts him onto it)
    makeNpc('gravy', (B2) => {
      tube3(B2, 0, 0, 0, 0.5, 0.14, 0.19, suv.cupGravy, { tint: 1.05 });
      blob3(B2, 0.02, 0.52, -0.02, 0.21, 0.04, 0.21, 3, suv.sw_white, { tint: 0.8 }, 4, 10); // the lid, ajar
      box3(B2, -0.08, 0.34, 0.15, -0.02, 0.38, 0.19, suv.sw_black, {});
      box3(B2, 0.02, 0.34, 0.15, 0.08, 0.38, 0.19, suv.sw_black, {});
      box3(B2, -0.09, 0.375, 0.145, -0.01, 0.4, 0.2, suv.sw_white, { tint: 0.7 }); // heavy lids
      box3(B2, 0.01, 0.375, 0.145, 0.09, 0.4, 0.2, suv.sw_white, { tint: 0.7 });
    });

    // THE HOODED NUG: crispy face poking out of a rain hood, robe to the floor
    makeNpc('hood', (B2) => {
      tube3(B2, 0, -0.02, 0, 0.42, 0.34, 0.23, suv.hoodCloth, { tint: 0.85 }, 10); // the robe
      blob3(B2, 0, 0.5, 0.06, 0.26, 0.3, 0.24, 6, suv.nugSkin, { tint: 0.95 });     // the nug inside
      blob3(B2, 0, 0.66, -0.14, 0.34, 0.34, 0.3, 11, suv.hoodCloth, { tint: 0.9 }); // the hood shell
      box3(B2, -0.1, 0.5, 0.24, -0.04, 0.56, 0.3, suv.sw_amber, { e: 0.65 });       // eye glints
      box3(B2, 0.04, 0.5, 0.24, 0.1, 0.56, 0.3, suv.sw_amber, { e: 0.65 });
    });

    // HENRIETTA: an actual hen. comb, wattle, tail fan, tiny skeptical eyes.
    makeNpc('hen', (B2) => {
      blob3(B2, 0, 0.3, -0.02, 0.24, 0.2, 0.18, 5, suv.henWhite, {});
      box3(B2, -0.045, 0.34, 0.08, 0.045, 0.56, 0.16, suv.henWhite, {});
      blob3(B2, 0, 0.6, 0.13, 0.1, 0.1, 0.11, 9, suv.henWhite, {}, 5, 8);
      box3(B2, -0.02, 0.68, 0.06, 0.02, 0.74, 0.1, suv.sw_comb, {});
      box3(B2, -0.02, 0.7, 0.1, 0.02, 0.77, 0.14, suv.sw_comb, {});
      box3(B2, -0.02, 0.68, 0.14, 0.02, 0.73, 0.17, suv.sw_comb, {});
      box3(B2, -0.025, 0.58, 0.2, 0.025, 0.63, 0.32, suv.sw_beak, {});
      box3(B2, -0.015, 0.51, 0.19, 0.015, 0.57, 0.23, suv.sw_comb, {});
      box3(B2, -0.11, 0.6, 0.1, -0.06, 0.65, 0.15, suv.sw_black, {});
      box3(B2, 0.06, 0.6, 0.1, 0.11, 0.65, 0.15, suv.sw_black, {});
      box3(B2, -0.03, 0.42, -0.34, 0.03, 0.62, -0.16, suv.henWhite, { tint: 0.9 });
      box3(B2, -0.12, 0.38, -0.3, -0.06, 0.54, -0.14, suv.henWhite, { tint: 0.85 });
      box3(B2, 0.06, 0.38, -0.3, 0.12, 0.54, -0.14, suv.henWhite, { tint: 0.85 });
      box3(B2, -0.08, 0, -0.02, -0.04, 0.14, 0.02, suv.sw_beak, {});
      box3(B2, 0.04, 0, -0.02, 0.08, 0.14, 0.02, suv.sw_beak, {});
      box3(B2, -0.1, 0, 0.02, -0.02, 0.03, 0.1, suv.sw_beak, {});
      box3(B2, 0.02, 0, 0.02, 0.1, 0.03, 0.1, suv.sw_beak, {});
    });

    // DETECTIVE DILL: a dill with a badge, a fedora, and a notepad
    makeNpc('dill', (B2) => {
      blob3(B2, 0, 0.52, 0, 0.19, 0.46, 0.19, 13, suv.pickle, { tint: 1.05 }, 8, 10);
      tube3(B2, 0, 0, 0.72, 0.82, 0.24, 0.27, suv.sw_iron, { tint: 0.8 }, 8); // trench collar
      box3(B2, -0.26, 0.88, -0.26, 0.26, 0.92, 0.26, suv.sw_iron, { tint: 0.75 }); // brim
      box3(B2, -0.15, 0.92, -0.15, 0.15, 1.08, 0.15, suv.sw_iron, { tint: 0.85 }); // crown
      box3(B2, 0.05, 0.6, 0.16, 0.13, 0.69, 0.22, suv.sw_badge, { e: 0.3 });       // the badge
      box3(B2, -0.09, 0.72, 0.14, -0.03, 0.77, 0.2, suv.sw_black, {});
      box3(B2, 0.03, 0.72, 0.14, 0.09, 0.77, 0.2, suv.sw_black, {});
      box3(B2, 0.2, 0.42, 0.08, 0.28, 0.54, 0.12, suv.sw_white, { tint: 0.9 });    // notepad
    });

    // prompts, collision, and a soft head-glow so they read from across the street
    for (const npc of NPCS) {
      H.glows.push({ p: [npc.x, npc.yBase + npc.h + 0.14, npc.z], c: [1, 0.85, 0.5], s: 0.3, a: 0.09, k: 'neon' });
      H.propBoxes.push({ min: [npc.x - 0.28, 0, npc.z - 0.28], max: [npc.x + 0.28, npc.yBase + npc.h, npc.z + 0.28] });
      H.hotspots.push({
        kind: 'npc',
        x: npc.x, z: npc.z, r: 2.3,
        min: [npc.x - 0.38, 0, npc.z - 0.38], max: [npc.x + 0.38, npc.yBase + npc.h + 0.1, npc.z + 0.38],
        stand: [npc.x + npc.sdx, EYE, npc.z + npc.sdz],
        label: 'TALK TO ' + npc.name,
        act: () => openDialog(npc),
      });
    }

    // ---- 🎂 FOUNDER'S DAY (August 3rd, one night a year) -------------------------
    // The whole street dresses up: a banner over the arcade doors, balloons on
    // the lamp posts, and THE FOUNDER'S CAKE on a cloth-draped table out front —
    // one candle, every year, exactly one (ask the Hood). Blowing it out banks a
    // wish in localStorage `nugFoundersWish` (the year, so it re-lights annually).
    // Geometry only exists while nugFoundersDay() says so; the atlas regions are
    // allocated year-round so nothing about packing changes with the calendar.
    if (typeof nugFoundersDay === 'function' && nugFoundersDay()) {
      // the banner, strung ACROSS THE STREET between the two lamps nearest the
      // doors (the arcade face is marquee territory — it hid there once and
      // nobody saw it). Both faces drawn: you read it walking out AND walking home.
      ST.quad([-4.2, 3.05, 7.0], [4.2, 3.05, 7.0], [4.2, 4.05, 7.0], [-4.2, 4.05, 7.0], suv.foundersBanner, { e: 0.3 });  // faces +z (the road)
      ST.quad([4.2, 3.05, 6.98], [-4.2, 3.05, 6.98], [-4.2, 4.05, 6.98], [4.2, 4.05, 6.98], suv.foundersBanner, { e: 0.3 }); // faces -z (the doors)
      // guy-lines out to the lamp posts so it isn't floating on pure civic pride
      ST.quad([-5.43, 3.1, 7.29], [-4.2, 3.55, 7.0], [-4.2, 3.57, 7.0], [-5.43, 3.12, 7.29], suv.sw_iron, { tint: 0.7 });
      ST.quad([-4.2, 3.55, 6.99], [-5.43, 3.1, 7.28], [-5.43, 3.12, 7.28], [-4.2, 3.57, 6.99], suv.sw_iron, { tint: 0.7 });
      ST.quad([4.2, 3.55, 7.0], [4.93, 3.1, 7.29], [4.93, 3.12, 7.29], [4.2, 3.57, 7.0], suv.sw_iron, { tint: 0.7 });
      ST.quad([4.93, 3.1, 7.28], [4.2, 3.55, 6.99], [4.2, 3.57, 6.99], [4.93, 3.12, 7.28], suv.sw_iron, { tint: 0.7 });
      // fairground bulbs under it — kind 'party' chases in the sprite pass
      const PARTY_C = [[1, 0.31, 0.64], [0.22, 0.82, 1], [1, 0.82, 0.4], [0.49, 1, 0.54]];
      for (let i = 0; i < 7; i++) {
        const bx = -3.6 + i * 1.2;
        H.glows.push({ p: [bx, 2.95, 6.99], c: PARTY_C[i % 4], s: 0.55, a: 0.22, k: 'party', ph: i * 0.9 });
      }
      // balloon clusters on the two lamps nearest the doors (they don't bob —
      // it rained all night and they're a little tired, like everyone at a party)
      for (const [lx, seed] of [[-5.5, 1], [5, 4]]) {
        const lz = 7.3;
        const B = [[lx - 0.22, 2.62, lz + 0.16, 'sw_party1'], [lx + 0.24, 2.72, lz + 0.1, 'sw_party2'], [lx + 0.02, 2.5, lz + 0.3, 'sw_party3']];
        for (let i = 0; i < 3; i++) {
          const [bx2, by2, bz2, swn] = B[i];
          blob3(ST, bx2, by2, bz2, 0.13, 0.16, 0.13, seed + i * 3, suv[swn], { e: 0.22 }, 5, 8);
          // string down to the lamp arm
          ST.quad([bx2 - 0.006, by2 - 0.14, bz2], [bx2 + 0.006, by2 - 0.14, bz2], [lx + 0.006, 2.2, lz + 0.02], [lx - 0.006, 2.2, lz + 0.02], suv.sw_white, { tint: 0.6 });
          ST.quad([bx2 + 0.006, by2 - 0.14, bz2 - 0.01], [bx2 - 0.006, by2 - 0.14, bz2 - 0.01], [lx - 0.006, 2.2, lz + 0.01], [lx + 0.006, 2.2, lz + 0.01], suv.sw_white, { tint: 0.6 });
        }
      }
      // THE FOUNDER'S CAKE: table, cloth, two frosted tiers, one candle
      {
        const cxm = 5.72, czm = 1.15;
        box3(ST, cxm - 0.5, 0, czm - 0.42, cxm + 0.5, 0.64, czm + 0.42, suv.sw_white, { tint: 0.82 }); // the cloth
        box3(ST, cxm - 0.3, 0.64, czm - 0.28, cxm + 0.3, 0.92, czm + 0.28, suv.cakeSide, {});          // tier one
        planeY(ST, 0.925, cxm - 0.3, cxm + 0.3, czm - 0.28, czm + 0.28, suv.sw_frosting, 1, false, {});
        box3(ST, cxm - 0.16, 0.92, czm - 0.15, cxm + 0.16, 1.14, czm + 0.15, suv.cakeSide, {});        // tier two
        planeY(ST, 1.145, cxm - 0.16, cxm + 0.16, czm - 0.15, czm + 0.15, suv.sw_frosting, 1, false, {});
        box3(ST, cxm - 0.018, 1.14, czm - 0.018, cxm + 0.018, 1.32, czm + 0.018, suv.sw_party1, {});   // the candle
        // the flame (kind 'candle': flickers, and goes dark once this year's wish is in)
        H.glows.push({ p: [cxm, 1.38, czm], c: [1, 0.76, 0.32], s: 0.5, a: 0.3, k: 'candle' });
        H.glows.push({ p: [cxm, 1.4, czm], c: [1, 0.45, 0.15], s: 1.1, a: 0.1, k: 'candle' });
        H.propBoxes.push({ min: [cxm - 0.55, 0, czm - 0.47], max: [cxm + 0.55, 1.35, czm + 0.47] });
        H.hotspots.push({
          kind: 'cake',
          x: cxm, z: czm, r: 2.4,
          min: [cxm - 0.55, 0, czm - 0.47], max: [cxm + 0.55, 1.4, czm + 0.47],
          stand: [cxm, EYE, czm + 1.5],
          get label() { return H.cakeWished ? "🎂 THE FOUNDER'S CAKE — WISH BANKED" : "🎂 THE FOUNDER'S CAKE — MAKE A WISH"; },
          act: () => cakeWish(cxm, 1.3, czm),
        });
      }
    }

    // ---- THE CATCH INCIDENT: police tape seals the catch cabinet ----------------
    {
      const cab = H.cabinets.find((c2) => c2.game.mode === 'catch');
      if (cab) {
        const fx = cab.min[0] - 0.04; // proud of the front (east-wall cab faces -x)
        const z0 = cab.min[2] - 0.22, z1 = cab.max[2] + 0.22;
        // faces -x → z ascending, like the east wall
        const strip = (ya, yb, w2) =>
          ST.quad([fx, ya - w2, z0], [fx, yb - w2, z1], [fx, yb + w2, z1], [fx, ya + w2, z0], suv.tape, { e: 0.25 });
        strip(0.45, 1.8, 0.05);
        strip(1.8, 0.45, 0.05);
        strip(1.12, 1.12, 0.055);
        ST.quad([fx - 0.01, 0.55, cab.z - 0.24], [fx - 0.01, 0.55, cab.z + 0.24],
          [fx - 0.01, 0.91, cab.z + 0.24], [fx - 0.01, 0.91, cab.z - 0.24], suv.crimeSign, { e: 0.2 });
        H.glows.push({ p: [fx - 0.3, 1.5, cab.z], c: [1, 0.22, 0.2], s: 1.1, a: 0.11, k: 'neon' });
      }
    }

    return { solid: ST.upload(gl), pier: PR.upload(gl), npcs: npcBufs };
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

  // 🎂 Blow out the candle on THE FOUNDER'S CAKE. One wish per town per year —
  // the flag stores the year so next August 3rd the flame is back.
  function cakeWish(x, y, z) {
    if (H.cakeWished) {
      sfxChime();
      toast('🎂 the wish is banked. it counts all year — the candle knows.', 2.8);
      return;
    }
    H.cakeWished = true;
    try { localStorage.setItem('nugFoundersWish', String(new Date().getFullYear())); } catch (e) { /* the wish still counts */ }
    // confetti in the party colors (the sparks pass tints per-particle via s.c)
    const CONF = [[1, 0.31, 0.64], [0.22, 0.82, 1], [1, 0.82, 0.4], [0.49, 1, 0.54]];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.6;
      H.sparks.push({
        x: x + (Math.random() - 0.5) * 0.2, y: y + Math.random() * 0.15, z: z + (Math.random() - 0.5) * 0.2,
        vx: Math.cos(a) * sp, vy: 1.4 + Math.random() * 2.2, vz: Math.sin(a) * sp,
        life: 1.1 + Math.random() * 0.9, max: 2.0,
        c: CONF[i % 4],
      });
    }
    sfxFanfare();
    toast('🎂 *fwooo* — the candle goes out, the street cheers in the rain. HAPPY FOUNDER\'S DAY, NUGGETOWN. wish banked.', 4.5);
  }

  // Pull real top-5s for the scoreboard. Signed-out and offline both fine —
  // the board just says so. Cached for a minute across hall entries.
  function fetchLeaderboards() {
    if (!window.NuggetAPI || Date.now() - H.lb.at < 60000) return;
    H.lb.at = Date.now();
    for (const game of ArcadeArt.GAMES.concat(ArcadeArt.STREET_GAMES || [])) {
      NuggetAPI.leaderboard(game.mode, 5)
        .then((d) => { H.lb.data[game.mode] = (d && d.top) || []; })
        .catch(() => { if (!Array.isArray(H.lb.data[game.mode])) H.lb.data[game.mode] = 'error'; });
    }
  }

  function hexRGB(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // ---- THE POWER PLANT: the light rig ------------------------------------------
  // This used to be exactly eight lights, and the street had to STEAL slots
  // from the hall to light itself — an index-keyed override table that swapped
  // ceiling tubes for streetlamps the moment the camera crossed z=0.6. Which
  // meant a block of shopfronts, five neon signs, a lit marquee and a pier were
  // sharing four lights between them, and no sign ever lit the wall it hung on.
  //
  // Now: one world list, every fixture in it, and the renderer uploads the
  // MAX_LIGHTS nearest to the camera each frame. Cost is fixed and the same as
  // before; what changes is that the nearest lights are the ones you can see.
  const MAX_LIGHTS = 16;      // WebGL2 shader loop bound (WebGL1 keeps its 8)

  const LIGHTS = [
    // --- the hall ---
    { p: [0, 3.6, 1.4], c: [1.5, 1.1, 0.5], k: 'sign' },
    { p: [0, 3.8, -4], c: [0.75, 0.9, 1.35], k: 'tube' },
    { p: [0, 3.8, -9], c: [0.75, 0.9, 1.35], k: 'tube' },
    { p: [0, 3.8, -14], c: [0.75, 0.9, 1.35], k: 'tube' },
    { p: [0, 2.6, -17.9], c: [1.5, 0.85, 0.35], k: 'torch' },
    { p: [-5.8, 2.3, -9.5], c: [1.1, 0.35, 0.75], k: 'neon' },
    { p: [5.8, 2.3, -9.5], c: [0.35, 0.95, 1.15], k: 'neon' },
    { p: [0, 2.8, -1.6], c: [0.6, 0.55, 0.8], k: 'door' },
    // the cabinet walls: ten CRTs and ten backlit marquees were pure texture
    // before — bright rectangles that threw nothing onto the carpet
    { p: [-6.2, 1.7, -5.5], c: [0.34, 0.42, 0.62], k: 'crt' },
    { p: [-6.2, 1.7, -12.5], c: [0.34, 0.42, 0.62], k: 'crt' },
    { p: [6.2, 1.7, -5.5], c: [0.34, 0.42, 0.62], k: 'crt' },
    { p: [6.2, 1.7, -12.5], c: [0.34, 0.42, 0.62], k: 'crt' },
    { p: [0, 1.75, -17.4], c: [0.7, 0.42, 0.18], k: 'crt' },
    // --- the street: its own lights, not the hall's on loan ---
    { p: [-15, 3.0, 6.9], c: [1.5, 1.05, 0.55], k: 'lamp' },
    { p: [-5.5, 3.0, 6.9], c: [1.5, 1.05, 0.55], k: 'lamp' },
    { p: [5.0, 3.0, 6.9], c: [1.5, 1.05, 0.55], k: 'lamp' },
    { p: [15.0, 3.0, 6.9], c: [1.5, 1.05, 0.55], k: 'lamp' },
    { p: [-19.4, 2.2, 0.9], c: [0.42, 1.0, 1.2], k: 'neon' },   // laundromat
    { p: [14.5, 2.2, 0.9], c: [1.25, 0.5, 0.85], k: 'neon' },   // noodle shop
    { p: [-9.5, 2.4, 0.6], c: [1.3, 0.95, 0.35], k: 'sign' },   // the marquee, outside
    { p: [-26, 2.1, 1.0], c: [0.5, 0.95, 0.6], k: 'neon' },     // the garage
    { p: [3.5, 0.55, 10.2], c: [0.9, 0.35, 0.75], k: 'thump' }, // club door, far side
    { p: [9.0, 0.30, 8.4], c: [0.75, 0.62, 0.2], k: 'swirl' },  // the grate
    { p: [-2.0, 0.85, 9.6], c: [0.5, 0.55, 0.85], k: 'across' },// across-the-road windows
    { p: [-13.0, 0.85, 9.6], c: [0.5, 0.55, 0.85], k: 'across' },
    { p: [12.0, 0.85, 9.6], c: [0.5, 0.55, 0.85], k: 'across' },
    // --- the pier ---
    { p: [25.5, 1.6, 12.3], c: [1.3, 0.9, 0.45], k: 'torch' },
    { p: [30.5, 1.6, 12.3], c: [1.3, 0.9, 0.45], k: 'torch' },
    { p: [40, 3.2, 10.9], c: [0.5, 0.62, 1.0], k: 'moon' },
    { p: [36, 0.3, 10.9], c: [1.0, 0.75, 0.25], k: 'swirl' },
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
      '<div class="hall-cross"></div>' +
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

    const gl2 = H.canvas.getContext('webgl2', { antialias: true });
    const gl = gl2 || H.canvas.getContext('webgl', { antialias: true });
    if (!gl) return false;
    H.gl = gl;

    // THE POWER PLANT: a WebGL2 context gets the material shader; WebGL1 keeps
    // the renderer that shipped, verbatim. `H.pbr = false` in a harness gives
    // the byte-identical old hall on any browser (the §7 fallback rule, applied
    // to the shader instead of a call site).
    H.pbr = !!gl2;
    H.sky = true;   // harness seam: false = the void the hall shipped with
    let progLit = null;
    if (H.pbr) {
      progLit = makeProgram(gl, VS_LIT2, FS_LIT2, true);
      if (!progLit) {                       // compile trouble = fall all the way back
        console.warn('Nugget Arcade: material shader failed, using the flat renderer');
        H.pbr = false;
      }
    }
    H.progLit = progLit || makeProgram(gl, VS_LIT, FS_LIT);
    H.progSpr = makeProgram(gl, VS_SPR, FS_SPR);
    H.uni = {};
    for (const name of ['uProj', 'uView', 'uModel', 'uTex', 'uLightPos', 'uLightColor',
      'uAmbient', 'uFogColor', 'uCamPos', 'uFogDensity', 'uAlpha', 'uMirror', 'uBoost',
      'uNrm', 'uOrm', 'uNrmScale', 'uSpecAmt', 'uWet', 'uTime',
      'uSkyAmb', 'uGndAmb', 'uSkyAmt', 'uSkyRefl', 'uSkyHorizon', 'uSkyZenith', 'uSkyGlow',
      'uSkyGround', 'uMoonDir', 'uSkyT'])
      H.uni[name] = gl.getUniformLocation(H.progLit, name);
    H.uniS = {};
    for (const name of ['uProj', 'uView', 'uTex'])
      H.uniS[name] = gl.getUniformLocation(H.progSpr, name);

    // The dome. GLSL ES 1.00 on purpose — WebGL2 compiles it just as happily,
    // so one program serves both contexts and there is no second sky to keep
    // in sync with the first. If it fails to build, H.progSky stays null and
    // the hall renders exactly as it did before tonight (clear colour and all).
    H.progSky = makeProgram(gl, VS_SKY, FS_SKY);
    if (!H.progSky) console.warn('Nugget Arcade: no sky program — rendering the old void');
    H.uniSky = {};
    if (H.progSky) {
      for (const name of ['uSkyFwd', 'uSkyRight', 'uSkyUp', 'uSkyScale', 'uSkyFlip',
        'uSkyHorizon', 'uSkyZenith', 'uSkyGlow', 'uSkyGround', 'uMoonDir', 'uSkyT'])
        H.uniSky[name] = gl.getUniformLocation(H.progSky, name);
      H.aSky = gl.getAttribLocation(H.progSky, 'aPos');
    }
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

    // Two 1×1 textures that stand in for "this surface has no material maps":
    // a normal pointing straight out and an ORM whose PBR dial is at zero. Any
    // surface bound without companions renders through the old equation.
    H.texFlatN = makeSolidTexture(gl, [128, 128, 255, 255]);
    H.texFlatS = makeSolidTexture(gl, [179, 0, 0, 255]);
    H.mapsFor = new Map();

    const atlas = ArcadeArt.makeAtlas();
    H.texAtlas = makeTexture(gl, atlas.canvas);
    H.texGlow = makeTexture(gl, ArcadeArt.makeGlow());
    H.bufs = buildScene(gl, atlas.uv);
    const street = ArcadeArt.makeStreetAtlas();
    H.texStreet = makeTexture(gl, street.canvas);
    H.bufsStreet = buildStreet(gl, street.uv);
    registerMaps(gl, H.texAtlas, atlas);
    registerMaps(gl, H.texStreet, street);
    H.builtHallArt = (typeof HallArt !== 'undefined' && HallArt.on() ? 'a' : '-') +
      (typeof HallMaps !== 'undefined' && HallMaps.on() ? 'm' : '-');

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

    // post chain: programs + the fullscreen triangle pair
    H.progBright = makeProgram(gl, VS_POST, FS_BRIGHT);
    H.progBlur = makeProgram(gl, VS_POST, FS_BLUR);
    H.progComp = makeProgram(gl, VS_POST, FS_COMP);
    H.aBright = gl.getAttribLocation(H.progBright, 'aPos');
    H.aBlur = gl.getAttribLocation(H.progBlur, 'aPos');
    H.aComp = gl.getAttribLocation(H.progComp, 'aPos');
    H.uniBright = {
      uTex: gl.getUniformLocation(H.progBright, 'uTex'),
      uThreshold: gl.getUniformLocation(H.progBright, 'uThreshold'),
      uKnee: gl.getUniformLocation(H.progBright, 'uKnee'),
    };
    H.uniBlur = {
      uTex: gl.getUniformLocation(H.progBlur, 'uTex'),
      uDir: gl.getUniformLocation(H.progBlur, 'uDir'),
    };
    H.uniComp = {
      uScene: gl.getUniformLocation(H.progComp, 'uScene'),
      uBloom: gl.getUniformLocation(H.progComp, 'uBloom'),
      uAmount: gl.getUniformLocation(H.progComp, 'uAmount'),
    };
    H.quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, H.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    H.post = null;

    bindInput();
    H.muteBtn.addEventListener('click', () => setMuted(!AC.muted));
    H.skipBtn.addEventListener('click', skipIntro);
    H.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); exit(true); });

    gl.enable(gl.DEPTH_TEST);
    // 32-bit element indices: the Blender geometry pushes the static buffer well
    // past 65535 vertices. Universally supported in practice; if it is ever
    // missing, upload() warns and the hall still runs on 16-bit.
    H.uintIndex = !!gl.getExtension('OES_element_index_uint');
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

  // WASD walks; the arrows steer the CAMERA (laptop-FPS combo — you can turn
  // while you walk instead of stopping to drag the view around).
  const KEYMAP = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r' };
  const LOOKMAP = { ArrowLeft: 'yl', ArrowRight: 'yr', ArrowUp: 'pu', ArrowDown: 'pd' };

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
        // if the browser just released pointer lock with this ESC, eat it —
        // the first ESC frees the mouse, a second one leaves the hall
        if (performance.now() - (H.plockT || 0) < 400) return;
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
      if (LOOKMAP[e.code]) { H.keys[LOOKMAP[e.code]] = true; e.preventDefault(); }
      if ((e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') && H.state === 'walk') {
        // preventDefault so Enter/Space can't re-activate a still-focused page
        // button (the arcade button!) or scroll the page behind the hall
        e.preventDefault();
        activatePrompt();
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (KEYMAP[e.code]) H.keys[KEYMAP[e.code]] = false;
      if (LOOKMAP[e.code]) H.keys[LOOKMAP[e.code]] = false;
    });

    const cv = H.canvas;
    // pointer lock = real FPS mouse-look: click captures the mouse, moving it
    // steers the view, clicking plays whatever the crosshair is on, ESC frees it.
    document.addEventListener('pointerlockchange', () => {
      const was = H.plock;
      H.plock = document.pointerLockElement === cv;
      H.root && H.root.classList.toggle('mlook', H.plock);
      if (was && !H.plock) H.plockT = performance.now(); // see the ESC guard above
    });
    cv.addEventListener('mousedown', (e) => {
      if (H.suspended || modalOpen()) return;
      if (H.plock) {
        // locked: the crosshair is the cursor
        if (H.dialog) { dialogAdvance(); return; }
        if (H.state !== 'walk' && H.state !== 'auto') return;
        if (H.promptTarget) activatePrompt();
        else handleTap(innerWidth / 2, innerHeight / 2, false);
        return;
      }
      if (!H.isTouch && !H.dialog && (H.state === 'walk' || H.state === 'auto')) {
        try {
          const p = cv.requestPointerLock();
          if (p && p.catch) p.catch(() => { /* denied — drag-look still works */ });
        } catch (err) { /* drag-look still works */ }
      }
      H.drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), touch: false };
      cv.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (H.plock) {
        if (!H.suspended && !H.dialog) look(e.movementX * 1.5, e.movementY * 1.5);
        return;
      }
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
      // the click that captured the mouse shouldn't also walk somewhere
      if (H.plock) return;
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
    const pier = x > 21.05 && x < 33.0 && z > 9.5 && z < 12.3;    // through the gate, over the water

    if (!(inside || doorway || outside || pier)) return false;
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

  // ---- the boot screen ------------------------------------------------------
  // Every heavy payload (the Blender paint sheet, the geometry, the material
  // maps) is injected async at page load so none of it blocks first paint — the
  // CONVERTER is the product. That moves ALL of the waiting to this one place:
  // the moment someone opens the arcade door. build() is once-only, so building
  // the hall out of fallback boxes because a payload was 200ms late would cache
  // the cheap version for the whole session. We wait instead, and we make the
  // wait part of the game.

  const BOOT_TIPS = [
    'The Nugget Arcade has been open 24/7 since the day it was built. Nobody remembers who built it.',
    'Every cabinet in here is a real game. Walk up to one and press E.',
    'The storm was stolen. Det. Dill has a theory. So does everyone else.',
    'The high score board on the east wall is live. Those are real people.',
    'There are five more games out on the street. Try the doors.',
    'The jukebox works. The fourth setting is OFF, and that is also a setting.',
    'Look up. The ceiling took three nights.',
    'Nuggetown is bigger than it looks from the sidewalk.',
  ];

  function bootScreen(root) {
    if (H.waitEl) return H.waitEl;
    const el = document.createElement('div');
    el.className = 'hall-booting';
    el.innerHTML =
      '<div class="hb-mark">NUGGET<span>ARCADE</span></div>' +
      '<div class="hb-bar"><div class="hb-fill"></div></div>' +
      '<div class="hb-stage"><span class="hb-label"></span><span class="hb-pct">0%</span></div>' +
      '<div class="hb-slow">TAKING A MOMENT — THE ARCADE IS A BIG PLACE</div>' +
      '<div class="hb-tip"></div>';
    root.appendChild(el);
    root.classList.add('active');

    const fill = el.querySelector('.hb-fill');
    const label = el.querySelector('.hb-label');
    const pct = el.querySelector('.hb-pct');
    const tip = el.querySelector('.hb-tip');
    const slow = el.querySelector('.hb-slow');

    // The bar tracks the real ledger, but never sits still: a <script> payload
    // reports nothing at all between "started" and "finished", so a bar wired
    // straight to the ledger would freeze for the whole download. Instead ease
    // toward a ceiling a little ahead of the truth — always moving, never
    // lying by more than the gap to the next milestone, and never going
    // backwards (a progress bar that retreats reads as a crash).
    let shown = 0;
    const draw = () => {
      const p = (typeof HallBoot !== 'undefined') ? HallBoot.progress()
        : { frac: 1, label: '', settled: true };
      const real = Math.max(0, Math.min(1, p.frac));
      const ceil = real < 1 ? Math.min(real + 0.14, 0.97) : 1;
      if (ceil > shown) shown += (ceil - shown) * 0.06;
      fill.style.width = (shown * 100).toFixed(1) + '%';
      pct.textContent = Math.round(shown * 100) + '%';
      label.textContent = p.settled ? 'OPENING THE DOORS' : (p.label || 'WARMING UP');
    };
    draw();
    H.bootTimer = setInterval(draw, 90);

    let ti = Math.floor(Math.random() * BOOT_TIPS.length);
    const nextTip = () => {
      tip.classList.add('swap');
      setTimeout(() => {
        tip.textContent = BOOT_TIPS[ti++ % BOOT_TIPS.length];
        tip.classList.remove('swap');
      }, 500);
    };
    tip.textContent = BOOT_TIPS[ti++ % BOOT_TIPS.length];
    H.tipTimer = setInterval(nextTip, 5200);
    H.slowTimer = setTimeout(() => slow.classList.add('on'), 6000);

    H.waitEl = el;
    return el;
  }

  function bootScreenDown() {
    clearInterval(H.bootTimer); clearInterval(H.tipTimer); clearTimeout(H.slowTimer);
    H.bootTimer = H.tipTimer = H.slowTimer = null;
    if (H.waitEl) { H.waitEl.remove(); H.waitEl = null; }
  }

  function artPending() {
    const waits = [
      typeof HallMesh !== 'undefined' && HallMesh,
      typeof HallArt !== 'undefined' && HallArt,
      typeof HallMaps !== 'undefined' && HallMaps,
    ];
    return waits.some((m) => m && m.settled && !m.settled());
  }

  function enter() {
    if (!H.built && artPending()) {
      const root = document.getElementById('arcadeHall');
      if (root) bootScreen(root);
      // Three sources can be the last to settle, so `go` may fire up to three
      // times — the flag makes the close idempotent. The short hold lets the
      // bar actually land on 100: cutting away at 91% reads as a crash.
      const go = () => {
        if (artPending() || H.bootClosing) return;
        H.bootClosing = true;
        setTimeout(() => { H.bootClosing = false; bootScreenDown(); enter(); }, 520);
      };
      if (typeof HallBoot !== 'undefined') HallBoot.whenAll(go);
      for (const m of [typeof HallMesh !== 'undefined' && HallMesh,
        typeof HallArt !== 'undefined' && HallArt,
        typeof HallMaps !== 'undefined' && HallMaps])
        if (m && m.whenReady) m.whenReady(go);
      return;
    }
    bootScreenDown();
    try {
      // The boot screen shows the hall root; if the hall can't build, put it
      // back before handing the player to the flat storm.
      if (!build()) {
        const root = document.getElementById('arcadeHall');
        if (root && !H.active) root.classList.remove('active');
        fallbackLaunch();
        return;
      }
      // THE GRAND REOPENING: if the Blender sheet finished decoding after the
      // atlases were baked, re-bake them once — the hall must never keep
      // procedural paint just because it built too fast. Same for the material
      // maps: a late HallMaps means every region is sitting on flat normals.
      const artSig = (typeof HallArt !== 'undefined' && HallArt.on() ? 'a' : '-') +
        (typeof HallMaps !== 'undefined' && HallMaps.on() ? 'm' : '-');
      if (H.builtHallArt !== artSig) rebakeAtlases();
    } catch (err) {
      console.error('Nugget Arcade hall failed to build:', err);
      const root = document.getElementById('arcadeHall');
      if (root && !H.active) root.classList.remove('active');
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
    H.wentPier = false;
    H.lastSpot = null;
    // Founder's Day: the candle re-lights every year until this year's wish is in
    try { H.cakeWished = localStorage.getItem('nugFoundersWish') === String(new Date().getFullYear()); } catch (e) { H.cakeWished = false; }
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
      : 'WASD — walk · MOUSE (click to grab) / ARROWS — look · CLICK / ENTER — play / talk<br>the STREET is out the doors · ESC — free the mouse, then leave';
    H.hint.classList.add('on');
    clearTimeout(H.hintTimer);
    H.hintTimer = setTimeout(() => H.hint.classList.remove('on'), 9000);
  }

  function startZoom(cab) {
    if (cab.game && cab.game.mode === 'catch') {
      // evidence. the coin slot is taped over. ask around outside.
      toast('🚧 NUGGET CATCH is evidence — the storm never came home. ask around outside.', 4.2);
      sfxThump();
      return;
    }
    if (H.state === 'zoom') return;
    H.state = 'zoom';
    H.auto = null;
    H.lastCab = cab;
    H.lastSpot = null; // cabinet launches return to the cabinet, not the pier
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
    if (H.plock) document.exitPointerLock(); // the minigames own the mouse now
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
    // Street-launched games (the pier) come back to their hotspot; cabinet
    // games walk back out of the CRT like always.
    const spot = H.lastSpot;
    const cab = H.lastCab || H.cabinets[0];
    if (spot) { H.cam.x = spot.stand[0]; H.cam.y = EYE; H.cam.z = spot.stand[1]; }
    else { H.cam.x = cab.stand[0]; H.cam.y = EYE; H.cam.z = cab.stand[2]; }
    const look = spot ? spot.look : cab.screen.center;
    const d = [look[0] - H.cam.x, look[1] - EYE, look[2] - H.cam.z];
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
    if (H.plock) document.exitPointerLock();
    H.active = false;
    H.suspended = false;
    H.state = 'idle';
    H.dialog = null;
    if (H.dlg) H.dlg.classList.remove('on');
    closeLocker();
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
      kart: 'myKart', reel: 'myReel', gta: 'myGta', beat: 'myBeat', drain: 'myDrain',
      croft: 'myCroft',
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
    // pointer lock has no cursor — release it whenever the UI needs one
    if (H.plock && (H.dialog || modalOpen())) document.exitPointerLock();
    if (H.dialog) { H.cam.y = EYE; return; } // feet stay planted mid-conversation
    // arrow keys steer the view, so you can turn a corner without stopping
    if (H.keys.yl) H.cam.yaw += 2.1 * dt;
    if (H.keys.yr) H.cam.yaw -= 2.1 * dt;
    if (H.keys.pu) H.cam.pitch = Math.min(0.7, H.cam.pitch + 1.4 * dt);
    if (H.keys.pd) H.cam.pitch = Math.max(-0.7, H.cam.pitch - 1.4 * dt);
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
          label = cab.game.mode === 'catch'
            ? key + '🚧 CRIME SCENE — DO NOT CROSS'
            : key + 'PLAY ' + cab.game.title;
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
      useTex(H.screenTex[game.mode]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    }
  }

  // ---- rendering ------------------------------------------------------------------------

  // ---- surface binding --------------------------------------------------------
  // A lit surface is three textures now, not one, and they must move together:
  // unit 0 albedo, unit 1 normal, unit 2 ORM. H.mapsFor remembers which
  // material pages belong to which albedo page; anything without an entry (the
  // live attract screens, the scoreboard) gets the inert defaults, which make
  // the shader behave exactly like the old one.
  function useTex(t) {
    const gl = H.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (!H.pbr) return;
    const m = H.mapsFor && H.mapsFor.get(t);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (m && m.n) || H.texFlatN);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, (m && m.s) || H.texFlatS);
    gl.activeTexture(gl.TEXTURE0);
  }

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
    const bytes = buf.bytes || 2;
    gl.drawElements(gl.TRIANGLES, count == null ? buf.count : count,
      buf.type || gl.UNSIGNED_SHORT, offset * bytes);
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
      useTex(H.screenTex[cab.game.mode]);
      const sb = H.bufs.screens;
      gl.drawElements(gl.TRIANGLES, 6, sb.type || gl.UNSIGNED_SHORT, cab.screenIndex * (sb.bytes || 2));
    }
    useTex(H.texAtlas);
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

  // The camera's world-space basis, which is all a reconstructed view ray
  // needs. right is horizontal by construction (cross with world up), so it
  // survives the mirror flip untouched.
  function camBasis(aspect) {
    const f = camFwd(H.cam.yaw, H.cam.pitch);
    const L = Math.hypot(f[0], f[2]) || 1e-4;
    const r = [-f[2] / L, 0, f[0] / L];
    const u = [-f[0] * f[1] / L, L, -f[2] * f[1] / L];
    const th = Math.tan(FOV / 2);
    return { f, r, u, sx: th * aspect, sy: th };
  }

  // flip: +1 for the sky itself, -1 for the copy that lies under the floor.
  // bg=true paints it as a background (no depth test) so the reflection pass
  // has something to sit on; bg=false pins it to the far plane so it fills
  // only the pixels no geometry reached.
  function drawSky(basis, flip, bg) {
    const gl = H.gl;
    if (!H.progSky || !H.sky) return;
    gl.useProgram(H.progSky);
    gl.bindBuffer(gl.ARRAY_BUFFER, H.quadVbo);
    gl.enableVertexAttribArray(H.aSky);
    gl.vertexAttribPointer(H.aSky, 2, gl.FLOAT, false, 0, 0);
    const U = H.uniSky;
    gl.uniform3fv(U.uSkyFwd, basis.f);
    gl.uniform3fv(U.uSkyRight, basis.r);
    gl.uniform3fv(U.uSkyUp, basis.u);
    gl.uniform2f(U.uSkyScale, basis.sx, basis.sy);
    gl.uniform1f(U.uSkyFlip, flip);
    gl.uniform3fv(U.uSkyHorizon, SKY.horizon);
    gl.uniform3fv(U.uSkyZenith, SKY.zenith);
    gl.uniform3fv(U.uSkyGlow, SKY.glow);
    gl.uniform3fv(U.uSkyGround, SKY.ground);
    gl.uniform3fv(U.uMoonDir, MOON_DIR);
    gl.uniform1f(U.uSkyT, H.t);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    if (bg) gl.disable(gl.DEPTH_TEST);
    else gl.depthFunc(gl.LEQUAL);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (bg) gl.enable(gl.DEPTH_TEST);
    else gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disableVertexAttribArray(H.aSky);
  }

  function render() {
    const gl = H.gl;
    resize();
    const bloom = postSetup(gl, H.canvas.width, H.canvas.height);
    if (bloom) gl.bindFramebuffer(gl.FRAMEBUFFER, H.post.fbo);
    gl.viewport(0, 0, H.canvas.width, H.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = H.canvas.width / H.canvas.height;
    const proj = mPersp(FOV, aspect, 0.05, 70);
    const view = mMul(
      mRotX(-H.cam.pitch),
      mMul(mRotY(-H.cam.yaw), mTrans(-H.cam.x, -H.cam.y, -H.cam.z))
    );
    const basis = camBasis(aspect);

    // 0) the sky UNDER the floor, painted before anything else. The mirror
    //    pass and the translucent floor then leave 13% of it showing, which is
    //    the whole reason the wet sidewalk now has a sky in it.
    drawSky(basis, -1, true);

    gl.useProgram(H.progLit);
    for (const k of ['aPos', 'aNormal', 'aUV', 'aExtra']) gl.enableVertexAttribArray(H.attr[k]);
    gl.uniformMatrix4fv(H.uni.uProj, false, proj);
    gl.uniformMatrix4fv(H.uni.uView, false, view);
    gl.uniform3f(H.uni.uCamPos, H.cam.x, H.cam.y, H.cam.z);
    gl.uniform3f(H.uni.uAmbient, 0.22, 0.21, 0.29);
    gl.uniform3fv(H.uni.uFogColor, FOG);
    gl.uniform1f(H.uni.uFogDensity, FOG_DENSITY);
    gl.uniform1i(H.uni.uTex, 0);
    // the sky, as light and as distance. Same palette the dome is painted with.
    gl.uniform1f(H.uni.uSkyAmt, H.sky ? 1 : 0);
    gl.uniform1f(H.uni.uSkyRefl, SKY_REFL);
    gl.uniform3fv(H.uni.uSkyAmb, SKY_AMB);
    gl.uniform3fv(H.uni.uGndAmb, GND_AMB);
    gl.uniform3fv(H.uni.uSkyHorizon, SKY.horizon);
    gl.uniform3fv(H.uni.uSkyZenith, SKY.zenith);
    gl.uniform3fv(H.uni.uSkyGlow, SKY.glow);
    gl.uniform3fv(H.uni.uSkyGround, SKY.ground);
    gl.uniform3fv(H.uni.uMoonDir, MOON_DIR);
    gl.uniform1f(H.uni.uSkyT, H.t);
    if (H.pbr) {
      gl.uniform1i(H.uni.uNrm, 1);
      gl.uniform1i(H.uni.uOrm, 2);
      // How hard the relief bites, and how bright the highlights sit. Both are
      // tuned once here rather than per material — the maps carry the variation.
      gl.uniform1f(H.uni.uNrmScale, NRM_SCALE);
      gl.uniform1f(H.uni.uSpecAmt, SPEC_AMT);
      gl.uniform1f(H.uni.uWet, WET_AMT);
      gl.uniform1f(H.uni.uTime, H.t);
    }
    useTex(H.texAtlas);

    // Pick the lights that matter from where the camera is standing. Sorting
    // ~30 fixtures by squared distance every frame is nothing next to a draw
    // call, and it means the hall, the street and the pier stop competing for
    // the same eight slots — each place is simply lit by its own fixtures.
    const sl = signLevel(H.t);
    const nLights = H.pbr ? MAX_LIGHTS : 8;
    const cx = H.cam.x, cy = H.cam.y, cz = H.cam.z;
    const pick = LIGHTS.map((L, i) => {
      const dx = L.p[0] - cx, dy = L.p[1] - cy, dz = L.p[2] - cz;
      return { L, i, d: dx * dx + dy * dy + dz * dz };
    }).sort((a, b) => a.d - b.d).slice(0, nLights);
    const lp = new Float32Array(nLights * 3), lc = new Float32Array(nLights * 3);
    pick.forEach(({ L, i }, slot) => {
      let f = 1;
      if (L.k === 'sign') f = sl;
      else if (L.k === 'tube') f = 0.97 + 0.05 * Math.sin(H.t * 6.5 + i * 2.1);
      else if (L.k === 'torch') f = 0.85 + 0.2 * Math.sin(H.t * 9 + Math.sin(H.t * 23));
      else if (L.k === 'neon') f = 0.92 + 0.1 * Math.sin(H.t * 3 + i);
      else if (L.k === 'lamp') f = 0.96 + 0.04 * Math.sin(H.t * 1.7 + i * 1.3);
      else if (L.k === 'crt') f = 0.82 + 0.18 * Math.sin(H.t * 11 + i * 2.7);
      else if (L.k === 'thump') f = 0.55 + 0.6 * Math.pow(Math.max(0, Math.sin(H.t * 5.6 + i)), 3);
      else if (L.k === 'swirl') f = 0.7 + 0.3 * Math.sin(H.t * 2.2 + i * 1.9);
      else if (L.k === 'across') f = 0.9 + 0.1 * Math.sin(H.t * 0.7 + i * 3.1);
      lp.set(L.p, slot * 3);
      lc.set([L.c[0] * f, L.c[1] * f, L.c[2] * f], slot * 3);
    });
    gl.uniform3fv(H.uni.uLightPos, lp);
    gl.uniform3fv(H.uni.uLightColor, lc);

    const I = mIdent();
    const MIR = mScale(1, -1, 1);
    const [dl, dr] = doorModels();
    const signBoost = 0.15 + 0.85 * sl;

    // dynamic prop models: the mirror ball spins, the regulars idle
    const DD = mMul(mTrans(0, 3.55, -2.6), mRotY(H.t * 0.5));
    const npcModel = (n) => mMul(
      mTrans(n.x, n.yBase + Math.sin(H.t * n.bobSpd + n.phase) * n.bobAmp, n.z),
      mRotY(n.curYaw)
    );
    function drawNpcs(pre, opts) {
      useTex(H.texStreet);
      for (const n of NPCS) {
        const buf = H.bufsStreet.npcs[n.id];
        if (buf) drawLit(buf, pre ? mMul(pre, npcModel(n)) : npcModel(n), opts);
      }
      useTex(H.texAtlas);
    }

    function drawBoard(model, opts) {
      useTex(H.boardTex);
      drawLit(H.bufs.board, model, opts);
      useTex(H.texAtlas);
    }

    // 1) mirrored world beneath the floor plane
    gl.frontFace(gl.CW);
    drawLit(H.bufs.static, MIR, { mirror: 0.33 });
    drawLit(H.bufs.sign, MIR, { mirror: 0.33, boost: signBoost });
    drawLit(H.bufs.doorL, mMul(MIR, dl), { mirror: 0.33 });
    drawLit(H.bufs.doorR, mMul(MIR, dr), { mirror: 0.33 });
    drawLit(H.bufs.disco, mMul(MIR, DD), { mirror: 0.33 });
    drawBoard(MIR, { mirror: 0.38 });
    drawScreens(MIR, { mirror: 0.38 });
    // the street set (and its regulars) reflects in the wet sidewalk too
    useTex(H.texStreet);
    drawLit(H.bufsStreet.solid, MIR, { mirror: 0.33 });
    useTex(H.texAtlas);
    drawNpcs(MIR, { mirror: 0.33 });
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
    drawLit(H.bufs.disco, DD, {});
    drawBoard(I, {});
    drawScreens(I, {});
    useTex(H.texStreet);
    drawLit(H.bufsStreet.solid, I, {});
    drawLit(H.bufsStreet.pier, I, {}); // world pass only — the sea does not reflect in itself
    useTex(H.texAtlas);
    drawNpcs(null, {}); // the regulars: real geometry now, lit like the room

    // 3b) THE SKY. Pinned to the far plane, so it costs a fragment only where
    //     the room did not already draw one — and that is precisely the part
    //     of the frame this session exists to stop being nothing.
    drawSky(basis, 1, false);
    // The sky's aPos and the lit program's aPos are the same attribute slot,
    // so drawSky's tidy-up turns off an array the lit passes still need. Put
    // it back before anything else draws (this cost one invisible decal pass).
    gl.useProgram(H.progLit);
    for (const k of ['aPos', 'aNormal', 'aUV', 'aExtra']) gl.enableVertexAttribArray(H.attr[k]);

    // 4) contact shadows + alpha-cutout extras (the golden nug)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawLit(H.bufs.decals, I, { alpha: 0.5 });
    gl.depthMask(false);
    drawLit(H.bufs.flora, I, {});
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
      let gx = gsp.p[0], gz = gsp.p[2];
      if (gsp.k === 'swirl') {
        // the golden something circling off the pier — it never quite stops
        const ang = H.t * 1.1 + gsp.ph;
        gx += Math.cos(ang) * gsp.r;
        gz += Math.sin(ang) * gsp.r * 0.45;
        a = gsp.a * (0.7 + 0.3 * Math.sin(H.t * 3 + gsp.ph));
      } else if (gsp.k === 'hazard') {
        // the double-parked compact: hazards blink like they mean it
        a = gsp.a * (Math.floor(H.t * 1.5) % 2 === 0 ? 1 : 0.05);
      } else if (gsp.k === 'thump') {
        // the club door: a kick drum you can see (~123bpm, sharp hit, long decay)
        const ph2 = (H.t * 2.05 + (gsp.ph || 0)) % 1;
        a = gsp.a * (0.22 + 0.78 * Math.pow(1 - ph2, 3));
      } else if (gsp.k === 'juke') {
        // the jukebox lights ride the actual track; dim idle glow when it's off
        a = gsp.a * (0.35 + 0.65 * jukeBeatLevel());
      } else if (gsp.k === 'party') {
        // Founder's Day banner bulbs: a slow chase, like a fairground that's
        // been up since morning and intends to stay lit till the rain stops
        a = gsp.a * (0.25 + 0.75 * Math.max(0, Math.sin(H.t * 2.4 - gsp.ph)));
      } else if (gsp.k === 'candle') {
        if (H.cakeWished) continue; // the wish took it
        a = gsp.a * (0.62 + 0.28 * Math.sin(H.t * 11 + gsp.p[1] * 40) + 0.1 * Math.sin(H.t * 27));
      } else if (gsp.k === 'shaft') {
        // the shaft thickens and thins as rain drifts through it
        a = gsp.a * (0.72 + 0.28 * Math.sin(H.t * 0.9 + gsp.p[0] * 0.7));
      } else if (gsp.k === 'pool') {
        a = gsp.a * (0.82 + 0.18 * Math.sin(H.t * 1.3 + gsp.p[0]));
      } else if (gsp.k === 'votive') {
        // the cellar seam: candlelight nobody admits to leaving. steadier than
        // the cake's candle — whatever burns down there has been at it a while.
        a = gsp.a * (0.72 + 0.18 * Math.sin(H.t * 7 + (gsp.ph || 0)) + 0.1 * Math.sin(H.t * 19 + (gsp.ph || 0) * 3));
      }
      // A pool of light lies ON the pavement; billboarding it at the camera
      // would stand it up like a card. Give it a world-flat basis instead.
      const rt = gsp.k === 'pool' ? FLAT_RIGHT : right;
      const upv = gsp.k === 'pool' ? FLAT_FWD : up;
      pushSprite(arr, gx, gsp.p[1], gz, gsp.sw || gsp.s, gsp.sh || gsp.s,
        gsp.c[0], gsp.c[1], gsp.c[2], a, rt, upv);
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
    // celebration sparks: golden-nug glitter by default, Founder's confetti
    // brings its own colors (s.c)
    for (const s of H.sparks) {
      const a = 0.55 * Math.min(1, s.life / 0.4);
      const c = s.c || [1, 0.85, 0.35];
      pushSprite(arr, s.x, s.y, s.z, 0.05, 0.05, c[0], c[1], c[2], a, right, up);
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

    if (bloom) postDraw(gl);
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
        toast(typeof nugFoundersDay === 'function' && nugFoundersDay()
          ? "🎂 FOUNDER'S DAY IN NUGGETOWN — one night a year. banner's up, balloons are up, the regulars are in a MOOD, and the cake by the doors has ONE candle. make a wish."
          : '🌧️ NUGGETOWN AFTER DARK — the regulars will talk. the bus stop goes home. somebody left their hazards on. the basement across the street is THUMPING. and the gutter grate is… glowing?', 5);
      }
    }
    if (!H.wentPier && H.cam.x > 21.3 && H.state !== 'intro') {
      H.wentPier = true;
      toast('🌊 THE PIER AT MIDNIGHT — out in the deep, the water is… swirling.', 5);
    }
    H.prevZ = H.cam.z;

    // prop life: golden-nug sparks
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
      const games = ArcadeArt.GAMES.concat(ArcadeArt.STREET_GAMES || []);
      const game = games[Math.floor(H.t / 4.5) % games.length];
      const g2 = H.boardCv.getContext('2d');
      ArcadeArt.drawScoreboard(g2, H.boardCv.width, H.boardCv.height, H.t, game, H.lb.data[game.mode], H.best[game.mode] || 0);
      const gl = H.gl;
      useTex(H.boardTex);
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
        if (rp.y < 0.05) { rp.y = 4.6 + Math.random(); rp.x = -20 + Math.random() * 56; }
      }

    stepAudio(dt);
    stepDialog(dt);
    // the regulars turn to face whoever's talking to them, then drift back
    for (const n of NPCS) {
      const want = H.dialog && H.dialog.npc === n
        ? Math.atan2(H.cam.x - n.x, H.cam.z - n.z)
        : n.baseYaw;
      let dy2 = want - n.curYaw;
      while (dy2 > Math.PI) dy2 -= Math.PI * 2;
      while (dy2 < -Math.PI) dy2 += Math.PI * 2;
      n.curYaw += dy2 * Math.min(1, dt * 5);
    }
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
      AC.rain.gain.value = 0.026;
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
    if (AC.rain) AC.rain.gain.value = 0.026 * level;
    if (AC.ctx && level === 0 && AC.ctx.state === 'running') AC.ctx.suspend();
    if (AC.ctx && level > 0 && AC.ctx.state === 'suspended') AC.ctx.resume();
  }

  function stopAudio() {
    if (AC.ctx && AC.ctx.state === 'running') AC.ctx.suspend();
  }

  function stepAudio(dt) {
    if (!AC.ctx || AC.muted) return;
    // rain volume tracks how close to the door you are — and ducks under the
    // jukebox, because there's music on now and the weather isn't the show
    if (AC.rain) {
      const t = Math.max(0, Math.min(1, (H.cam.z + 3) / 4));
      const rainMax = JUKE.cur ? 0.014 : 0.026;
      AC.rain.gain.value = 0.003 + rainMax * t;
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
    stepJuke();
  }

  // ---- the JUKEBOX ------------------------------------------------------------------
  // Three synthesized loops scheduled just-in-time (beat.js school): when a
  // game launches, frame() stops, the lookahead runs dry, the music stops —
  // the exact seam we want. Volume scales with distance; mute gates it all.

  const JUKE = {
    cur: 0, nextT: 0, step: 0,
    tracks: [
      null,
      { name: 'LOUNGE NUG', bpm: 84, root: 98, leadType: 'triangle', scale: [0, 3, 5, 7, 10],
        kick: 'x.....x.x.......', hat: '..x...x...x..x..', bass: '0...........3...', lead: '....2...4...3...' },
      { name: 'CRISPY FUNK', bpm: 106, root: 110, leadType: 'square', scale: [0, 3, 5, 7, 10],
        kick: 'x..x..x...x..x..', hat: 'x.x.x.xxx.x.x.x.', bass: '0.0...3...2.2...', lead: '..4.....2..4....' },
      { name: 'INSERT COIN', bpm: 126, root: 123, leadType: 'square', scale: [0, 4, 7, 12],
        kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.', bass: '0...1...2...3...', lead: '0.2.3.2.0.2.3.2.' },
      // the fourth stop: what the box plays when the last player leaves and
      // the machines are talking to each other. Minor, patient, almost no lead.
      { name: 'THE NIGHT SHIFT', bpm: 72, root: 87, leadType: 'triangle', scale: [0, 2, 3, 7, 10],
        kick: 'x.......x.......', hat: '....x.......x...', bass: '0.......3.....4.', lead: '......2.......1.' },
      // the seasonal single: pressed once, played one night a year (Aug 3).
      // jukeTrackCount() keeps it out of the rotation the other 364 nights —
      // it stays LAST in this list so the everyday count is just a prefix.
      { name: "ONE CANDLE (FOUNDER'S DAY)", bpm: 118, root: 131, leadType: 'triangle', scale: [0, 2, 4, 7, 9, 12],
        kick: 'x...x...x...x.xx', hat: '..x...x...x...xx', bass: '0...2...3...2...', lead: '0.2.4...5.4.2.4.' },
    ],
  };

  function jukeTrackCount() {
    return typeof nugFoundersDay === 'function' && nugFoundersDay() ? 6 : 5;
  }
  try { JUKE.cur = Math.min(jukeTrackCount() - 1, Math.max(0, +(localStorage.getItem('nugJukebox') || 0) || 0)); } catch (e) { /* fresh ears */ }

  function jukeCycle() {
    JUKE.cur = (JUKE.cur + 1) % jukeTrackCount();
    try { localStorage.setItem('nugJukebox', String(JUKE.cur)); } catch (e) { /* ok */ }
    JUKE.nextT = 0;
    JUKE.step = 0;
    sfxCoin();
    toast(JUKE.cur === 0 ? '🔇 JUKEBOX OFF — the hum returns' : '🎶 NOW PLAYING: ' + JUKE.tracks[JUKE.cur].name, 3);
  }

  // 0..1 thump for the cabinet lights (kind 'juke' in the sprite pass).
  function jukeBeatLevel() {
    if (!JUKE.cur || !AC.ctx || AC.muted) return 0;
    const spb = 60 / JUKE.tracks[JUKE.cur].bpm;
    return Math.pow(1 - (AC.ctx.currentTime / spb) % 1, 2);
  }

  function stepJuke() {
    if (!JUKE.cur || !AC.ctx || AC.muted || H.state === 'intro') return;
    const tr = JUKE.tracks[JUKE.cur];
    const sps = 60 / tr.bpm / 4;
    const nowT = AC.ctx.currentTime;
    if (JUKE.nextT < nowT) JUKE.nextT = nowT + 0.05; // resync after idle/suspend
    // near the box it BUMPS; across the hall it's wallpaper
    const d = Math.hypot(-4.8 - H.cam.x, -0.52 - H.cam.z);
    const vol = 0.45 + 0.55 * Math.max(0, 1 - d / 15);
    const deg = (pat, s) => tr.scale[+pat[s] % tr.scale.length];
    while (JUKE.nextT < nowT + 0.16) {
      const s = JUKE.step % 16;
      const t0 = JUKE.nextT;
      if (tr.kick[s] === 'x') {
        const o = AC.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, t0);
        o.frequency.exponentialRampToValueAtTime(40, t0 + 0.1);
        const g = AC.ctx.createGain();
        g.gain.setValueAtTime(0.15 * vol, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
        o.connect(g).connect(AC.master);
        o.start(t0); o.stop(t0 + 0.16);
      }
      if (tr.hat[s] === 'x') tone(7800 + Math.random() * 400, t0, 0.03, 0.011 * vol, 'square');
      if (tr.bass[s] !== '.') tone(tr.root * Math.pow(2, deg(tr.bass, s) / 12), t0, sps * 2, 0.04 * vol, 'triangle');
      if (tr.lead[s] !== '.') tone(tr.root * 4 * Math.pow(2, deg(tr.lead, s) / 12), t0, 0.14, 0.018 * vol, tr.leadType);
      JUKE.step++;
      JUKE.nextT += sps;
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
