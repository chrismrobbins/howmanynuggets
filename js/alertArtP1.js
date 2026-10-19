// ---- 🚨 NUGGET ALERT — the art, part 1: the second tech tier ---------------------------------------------
// More models for alertArt.js, same conventions: 1 unit = 1 tile, y up, buildings centered on their footprint
// with the front (+z) toward the camera once the game turns them, units face +z, team panels carry the team
// mask (color(ALR_PAL.team, 1)). Moving parts are separate meshes whose pivot is the mesh origin.
// alrArtInit() calls alrArtInitP1(A, mk) at its end; everything lands in A.b (buildings) / A.u (units).

const ALR_P1 = {
  white: '#e4e7ea', offWhite: '#c9ced3', ceramic: '#ddd6c6', crystal: '#a9dcf6', crystalHi: '#eefaff', crystalLo: '#6fb4dc',
  red: '#c8302a', redLit: '#ff5a3c', fur: '#5e4630', furLt: '#7a5c3c', coat: '#6b6450', gravy: '#7f5128', gravyLt: '#9c6834',
  ally: '#8794a0', allyDark: '#5f6b77', fed: '#5d6047', fedDark: '#444733', rust: '#7c4a2c', oil: '#2b2622', blue: '#3d5a80',
};

// ---- helpers --------------------------------------------------------------------------------------------
// a frustum along +z (noses, nozzles, fuselages): from z0 radius r0 to z1 radius r1, centered on (x, y)
function p1CylZ(mb, x, y, z0, r0, z1, r1, n, caps) {
  mb.push().at(x, y, 0, 0, Math.PI / 2, 0);
  mb.cyl(0, z0, 0, r0, z1, r1, n || 10, caps);
  mb.pop();
}
// a convex polygon in the xz plane ([[x, z], …]) extruded ±t/2 about y (wings, plates)
function p1Slab(mb, pts, y, t) {
  const top = pts.map(([x, z]) => [x, y + t / 2, z]), bot = pts.map(([x, z]) => [x, y - t / 2, z]);
  mb.face(top); mb.face(bot.slice().reverse());
  for (let k = 0; k < pts.length; k++) { const k2 = (k + 1) % pts.length; mb.face([bot[k], bot[k2], top[k2], top[k]]); }
}
// a convex polygon in the zy plane ([[z, y], …]) extruded ±t/2 about x (fins, tails)
function p1Fin(mb, pts, x, t) {
  const a = pts.map(([z, y]) => [x + t / 2, y, z]), b = pts.map(([z, y]) => [x - t / 2, y, z]);
  mb.face(a); mb.face(b.slice().reverse());
  for (let k = 0; k < pts.length; k++) { const k2 = (k + 1) % pts.length; mb.face([b[k], b[k2], a[k2], a[k]]); }
}
// a hemisphere-ish dome from latitude bands; col(k) sets the color of band k (glass bands, ribs)
function p1Dome(mb, x, y, z, r, ry, n, rows, col) {
  for (let k = 0; k < rows; k++) {
    const a0 = k / rows * Math.PI / 2, a1 = (k + 1) / rows * Math.PI / 2;
    if (col) col(k);
    mb.cyl(x, y + Math.sin(a0) * ry, z, Math.cos(a0) * r, y + Math.sin(a1) * ry, Math.cos(a1) * r, n, 0);
  }
}
// a faceted crystal: a crown band and two pyramids, the facets alternating light and lighter
function p1Crystal(mb, x, y, z, r, up, down, n, c1, c2, c3) {
  const crown = up * 0.28, P = (a, rr, yy) => [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr];
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    mb.color(k % 2 ? c1 : c2);
    mb.face([P(a0, r, y), P(a1, r, y), P(a1, r * 0.82, y + crown), P(a0, r * 0.82, y + crown)]);
    mb.color(k % 2 ? c2 : c3);
    mb.face([P(a0, r * 0.82, y + crown), P(a1, r * 0.82, y + crown), P(am, 0.0001, y + up)]);
    mb.color(k % 2 ? c1 : ALR_P1.crystalLo);
    mb.face([P(a1, r, y), P(a0, r, y), P(am, 0.0001, y - down)]);
  }
}
// gold/black hazard blocks along x (at z) or along z (at x)
function p1StripesX(mb, x0, x1, y, z, hz, n) {
  const w = (x1 - x0) / n;
  for (let k = 0; k < n; k++) mb.color(k % 2 ? ALR_PAL.black : ALR_PAL.gold).box(x0 + w * (k + 0.5), y, z, w / 2, 0.006, hz, 0);
}
function p1StripesZ(mb, z0, z1, y, x, hx, n) {
  const w = (z1 - z0) / n;
  for (let k = 0; k < n; k++) mb.color(k % 2 ? ALR_PAL.black : ALR_PAL.gold).box(x, y, z0 + w * (k + 0.5), hx, 0.006, w / 2, 0);
}
// an insulator stack: a dark post with ceramic discs and a copper crown
function p1Insulator(mb, x, z, y0, h, r) {
  mb.color(ALR_PAL.dark).box(x, y0 + 0.04, z, r * 1.3, 0.04, r * 1.3, 0.015);
  mb.color(ALR_PAL.steel).cyl(x, y0 + 0.08, z, r * 0.35, y0 + h, r * 0.3, 6, 0);
  const n = Math.max(3, Math.round(h / 0.07));
  for (let k = 0; k < n; k++) {
    const y = y0 + 0.11 + k * (h - 0.12) / n;
    mb.color(ALR_P1.ceramic).cyl(x, y, z, r * (k % 2 ? 0.75 : 1), y + 0.025, r * (k % 2 ? 0.75 : 1), 10);
  }
  mb.color(ALR_PAL.copper).cyl(x, y0 + h, z, r * 0.9, y0 + h + 0.03, r * 0.9, 10);
  mb.color(ALR_PAL.copper).ball(x, y0 + h + 0.07, z, r * 0.6, 8);
}
// a wheel lying along x: tire, hub, cap
function p1Wheel(mb, x, y, z, r, w) {
  mb.color(ALR_PAL.rubber).rod(x, y, z, r, w, 10);
  mb.color(ALR_PAL.steel).rod(x + Math.sign(x) * w * 0.4, y, z, r * 0.5, w * 0.3, 8);
  mb.color(ALR_PAL.dark).rod(x + Math.sign(x) * w * 0.55, y, z, r * 0.18, w * 0.15, 6);
}
// a track run: the belt, road wheels, sprocket and idler, the fender over it
function p1Track(mb, x, z0, z1, hy, hx, col, nWheels) {
  const zc = (z0 + z1) / 2, hz = (z1 - z0) / 2;
  mb.color(ALR_PAL.rubber).box(x, hy, zc, hx, hy * 0.9, hz, Math.min(hy * 0.5, 0.04));
  for (let k = 0; k < nWheels; k++) mb.color(ALR_PAL.dark).rod(x, hy * 0.85, z0 + 0.07 + k * (2 * hz - 0.14) / (nWheels - 1), hy * 0.7, hx * 2.1, 8);
  mb.color(ALR_PAL.steel).rod(x, hy * 1.1, z1 - 0.03, hy * 0.55, hx * 2.2, 8).rod(x, hy * 1.1, z0 + 0.03, hy * 0.55, hx * 2.2, 8);
  mb.color(ALR_PAL.black);
  for (let k = 0; k < 7; k++) mb.box(x, hy * 1.88, z0 + 0.04 + k * (2 * hz - 0.08) / 6, hx * 0.95, 0.006, 0.01, 0);
  mb.color(col).box(x, hy * 2 + 0.008, zc, hx * 1.1, 0.012, hz + 0.01, 0.006);
}
// the "?" mark on a crate face (local: the face is the z = 0 plane, the glyph sticks out +z)
function p1Glyph(mb, s) {
  mb.color(ALR_PAL.breading).push().scale(1, 1, 0.35).ball(0, 0, 0, 0.1 * s, 8, 0.09 * s).pop();
  mb.color(ALR_PAL.breadDark).ball(0.05 * s, 0.045 * s, 0.025 * s, 0.022 * s, 5);
  mb.color(ALR_PAL.black);
  const b = (x, y, hx, hy) => mb.box(x * s, y * s, 0.036 * s, hx * s, hy * s, 0.008 * s, 0);
  b(0, 0.058, 0.032, 0.012); b(0.034, 0.038, 0.012, 0.024); b(0.016, 0.006, 0.02, 0.012); b(0, -0.016, 0.012, 0.016);
  b(-0.034, 0.046, 0.011, 0.012); b(0, -0.058, 0.013, 0.013);
}
// infantry pieces: the nugget torso (the body is the head too), the eyes, the arms, a rifle
function p1Torso(mb) {
  mb.color(ALR_PAL.breading).ball(0, 0.25, 0, 0.1, 8, 0.12);
  mb.color(ALR_PAL.breadDark).ball(0.05, 0.3, 0.06, 0.035, 5, 0.028).ball(-0.06, 0.2, 0.05, 0.03, 5);
}
function p1Eyes(mb, y) { mb.color(ALR_PAL.black).box(0.03, y || 0.32, 0.085, 0.012, 0.01, 0.006, 0).box(-0.03, y || 0.32, 0.085, 0.012, 0.01, 0.006, 0); }
function p1Rifle(mb, x, y, z, long) {
  const L = long ? 0.13 : 0.1;
  mb.color(ALR_PAL.black).box(x, y + 0.01, z + 0.11, 0.012, 0.02, L, 0.004);
  mb.color(ALR_PAL.wood).box(x, y, z, 0.014, 0.025, 0.04, 0.004);
  if (long) mb.color(ALR_PAL.steel).box(x, y + 0.012, z + 0.11 + L + 0.035, 0.004, 0.006, 0.035, 0);
}

// ---- the buildings ------------------------------------------------------------------------------------
const ALR_BUILD_ART_P1 = {
  // ⚛️ the FRYER REACTOR (Federation power), 3×2
  powerF(mb) {
    alrPad(mb, 3, 2);
    const cx = -0.48, cz = -0.02;
    // the plinth
    mb.color(ALR_PAL.concDark).cyl(cx, 0.1, cz, 0.84, 0.2, 0.78, 8);
    mb.color(ALR_PAL.team, 1).cyl(cx, 0.2, cz, 0.78, 0.25, 0.76, 8, 0);
    mb.color(ALR_PAL.dark).cyl(cx, 0.25, cz, 0.76, 0.28, 0.66, 8, 2);
    // the drum
    mb.color(ALR_P1.fed).cyl(cx, 0.28, cz, 0.62, 0.74, 0.62, 16, 0);
    mb.color(ALR_P1.fedDark).cyl(cx, 0.34, cz, 0.635, 0.38, 0.635, 16, 0).cyl(cx, 0.66, cz, 0.635, 0.7, 0.635, 16, 0);
    // the ribs and the glowing core windows between them
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      mb.color(ALR_PAL.dark).box(cx + Math.cos(a) * 0.64, 0.52, cz + Math.sin(a) * 0.64, 0.035, 0.24, 0.035, 0.01);
      const b = a + Math.PI / 8, px = cx + Math.cos(b) * 0.61, pz = cz + Math.sin(b) * 0.61;
      mb.push().at(px, 0.52, pz, Math.atan2(Math.cos(b), Math.sin(b)));
      mb.color(ALR_PAL.black).box(0, 0, 0.012, 0.085, 0.13, 0.014, 0.004);
      mb.color(ALR_PAL.light).box(0, 0, 0.024, 0.06, 0.11, 0.008, 0);
      mb.color(ALR_PAL.glassLit).box(0, 0, 0.03, 0.045, 0.1, 0.006, 0);
      mb.color(ALR_PAL.dark).box(0, 0.04, 0.036, 0.07, 0.006, 0.004, 0).box(0, -0.04, 0.036, 0.07, 0.006, 0.004, 0);
      mb.pop();
    }
    // the shoulder, the core well and the big coil
    mb.color(ALR_PAL.steel).cyl(cx, 0.74, cz, 0.62, 0.84, 0.5, 16, 0);
    mb.color(ALR_PAL.team, 1).cyl(cx, 0.84, cz, 0.5, 0.88, 0.48, 16, 0);
    mb.color(ALR_PAL.dark).cyl(cx, 0.88, cz, 0.48, 0.9, 0.48, 16, 2);
    mb.color(ALR_PAL.light).cyl(cx, 0.9, cz, 0.3, 0.915, 0.3, 16, 2);
    mb.color(ALR_PAL.glassLit).cyl(cx, 0.915, cz, 0.22, 0.925, 0.22, 16, 2);
    mb.color(ALR_PAL.dark);
    for (let k = -2; k <= 2; k++) mb.box(cx + k * 0.1, 0.93, cz, 0.012, 0.012, 0.29 - Math.abs(k) * 0.05, 0);
    mb.color(ALR_PAL.steel).cyl(cx, 0.93, cz, 0.11, 1.5, 0.06, 8);
    for (let k = 0; k < 6; k++) {
      const y = 1.0 + k * 0.085, r = 0.22 - k * 0.022;
      mb.color(ALR_PAL.copper).cyl(cx, y, cz, r, y + 0.04, r, 14);
    }
    mb.color(ALR_PAL.steel).cyl(cx, 1.5, cz, 0.14, 1.53, 0.14, 12);
    mb.color(ALR_PAL.steel).ball(cx, 1.62, cz, 0.12, 10);
    mb.color(ALR_PAL.copper).cyl(cx, 1.6, cz, 0.13, 1.63, 0.13, 12, 0);
    // three small insulators on the shoulder
    for (let k = 0; k < 3; k++) { const a = 0.9 + k * 2.09; p1Insulator(mb, cx + Math.cos(a) * 0.4, cz + Math.sin(a) * 0.4, 0.84, 0.2, 0.045); }
    // the control shed (right, back)
    mb.color(ALR_PAL.conc).box(0.92, 0.3, -0.4, 0.46, 0.2, 0.42, 0.04);
    mb.color(ALR_PAL.team, 1).box(0.92, 0.44, -0.4, 0.475, 0.035, 0.435, 0.012);
    mb.color(ALR_PAL.concDark).box(0.92, 0.52, -0.4, 0.42, 0.04, 0.38, 0.02);
    alrWindowsX(mb, 0.6, 1.25, 0.3, 0.035, 4, 0.06, 0.05, true);
    mb.color(ALR_PAL.dark).box(1.39, 0.25, -0.4, 0.012, 0.13, 0.08, 0.004);
    for (const x of [0.75, 1.1]) { mb.color(ALR_PAL.steel).box(x, 0.6, -0.5, 0.08, 0.045, 0.08, 0.015); mb.color(ALR_PAL.black).box(x, 0.65, -0.5, 0.06, 0.006, 0.06, 0); }
    // the insulator yard (right, front)
    mb.color(ALR_PAL.padDark).box(0.92, 0.115, 0.55, 0.46, 0.01, 0.3, 0.005);
    p1StripesX(mb, 0.48, 1.36, 0.128, 0.86, 0.02, 9);
    p1Insulator(mb, 0.66, 0.55, 0.1, 0.48, 0.07); p1Insulator(mb, 1.18, 0.55, 0.1, 0.48, 0.07);
    mb.color(ALR_PAL.dark).box(0.92, 0.2, 0.55, 0.12, 0.09, 0.1, 0.02);
    for (let k = 0; k < 3; k++) mb.color(ALR_PAL.copper).cyl(0.84 + k * 0.08, 0.29, 0.55, 0.018, 0.38, 0.014, 6);
    alrPipe(mb, [0.66, 0.66, 0.55], [1.18, 0.66, 0.55], 0.01, ALR_PAL.black);
    alrPipe(mb, [0.66, 0.66, 0.55], [cx + 0.42, 0.9, 0.27], 0.01, ALR_PAL.black);
    // coolant pipes from the drum to the shed
    alrPipe(mb, [cx + 0.6, 0.36, -0.3], [0.46, 0.36, -0.3], 0.045);
    alrPipe(mb, [cx + 0.6, 0.5, -0.5], [0.46, 0.5, -0.5], 0.04, ALR_PAL.sauce);
    mb.color(ALR_PAL.dark).box(0.4, 0.36, -0.3, 0.03, 0.06, 0.06, 0.01).box(0.4, 0.5, -0.5, 0.03, 0.055, 0.055, 0.01);
    alrLamp(mb, -1.38, 0.42, 0.88); alrLamp(mb, 1.38, 0.42, 0.88); alrLamp(mb, -1.38, 0.42, -0.88);
  },

  // ✈️ AIR NUG COMMAND (Alliance air base + radar), 3×3 — four pads at (±0.95, ±0.95), kept clear
  airhq(mb) {
    alrPad(mb, 3, 3);
    // the four pads
    for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) {
      mb.push().at(x, 0, z, Math.PI / 8);
      mb.color(ALR_PAL.padDark).cyl(0, 0.06, 0, 0.48, 0.1, 0.48, 8);
      mb.color('#6c6a64').cyl(0, 0.1, 0, 0.47, 0.12, 0.455, 8, 2);
      mb.color(ALR_PAL.gold).cyl(0, 0.12, 0, 0.38, 0.123, 0.38, 16, 2);
      mb.color('#6c6a64').cyl(0, 0.123, 0, 0.345, 0.126, 0.345, 16, 2);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; mb.color(k % 2 ? ALR_PAL.light : ALR_PAL.sauce).box(Math.cos(a) * 0.45, 0.13, Math.sin(a) * 0.45, 0.018, 0.012, 0.018, 0.004); }
      mb.pop();
      mb.color(ALR_PAL.team, 1).cyl(x, 0.126, z, 0.11, 0.129, 0.11, 12, 2);
      mb.color(ALR_P1.white);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) mb.box(x + dx * 0.24, 0.128, z + dz * 0.24, dz ? 0.018 : 0.06, 0.003, dx ? 0.018 : 0.06, 0);
    }
    // the control building
    mb.color(ALR_PAL.conc).box(0, 0.3, 0, 0.42, 0.2, 0.42, 0.04);
    mb.color(ALR_PAL.team, 1).box(0, 0.47, 0, 0.435, 0.035, 0.435, 0.012);
    alrWindowsX(mb, -0.28, 0.28, 0.32, 0.425, 4, 0.045, 0.06, true);
    alrWindowsZ(mb, -0.28, 0.28, 0.32, 0.425, 4, 0.045, 0.06, false);
    alrWindowsZ(mb, -0.28, 0.28, 0.32, -0.425, 4, 0.045, 0.06, true);
    mb.color(ALR_PAL.dark).box(0, 0.2, 0.43, 0.08, 0.1, 0.012, 0.004);
    mb.color(ALR_PAL.steel).box(0, 0.32, 0.47, 0.14, 0.012, 0.05, 0.005);
    // the glass control cab + the radar dome
    mb.color(ALR_PAL.concDark).cyl(0, 0.5, 0, 0.34, 0.54, 0.34, 8);
    mb.color(ALR_PAL.glass).cyl(0, 0.54, 0, 0.32, 0.68, 0.36, 8, 0);
    mb.color(ALR_PAL.glassLit);
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; if (k % 2) mb.box(Math.cos(a) * 0.33, 0.61, Math.sin(a) * 0.33, 0.04, 0.045, 0.04, 0); }
    mb.color(ALR_PAL.dark).cyl(0, 0.68, 0, 0.38, 0.72, 0.36, 8);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.72, 0, 0.3, 0.75, 0.28, 12);
    p1Dome(mb, 0, 0.75, 0, 0.24, 0.24, 14, 4, (k) => mb.color(k === 1 ? ALR_PAL.team : ALR_P1.white, k === 1 ? 1 : 0));
    mb.color(ALR_PAL.light).ball(0, 1.0, 0, 0.025, 6);
    // antenna masts
    mb.color(ALR_PAL.dark).cyl(0.3, 0.72, -0.3, 0.015, 1.25, 0.008, 6, 0);
    for (let k = 0; k < 3; k++) mb.color(ALR_PAL.steel).box(0.3, 0.86 + k * 0.12, -0.3, 0.07 - k * 0.015, 0.006, 0.006, 0);
    mb.color(ALR_PAL.sauce).ball(0.3, 1.26, -0.3, 0.02, 6);
    mb.color(ALR_PAL.dark).cyl(-0.3, 0.72, -0.3, 0.02, 0.92, 0.02, 6, 0);
    mb.color(ALR_PAL.steel).box(-0.3, 0.94, -0.3, 0.12, 0.02, 0.02, 0.006);
    // the side wings between the pads: a hangar (left) and the fuel farm (right)
    mb.color(ALR_PAL.concDark).box(-0.92, 0.13, 0, 0.5, 0.03, 0.22, 0.01);
    mb.color(ALR_PAL.steel); alrArch(mb, -0.92, 0.16, 0, 0.42, 0.17, 10);
    mb.color(ALR_PAL.team, 1).box(-0.92, 0.25, 0, 0.43, 0.014, 0.172, 0);
    mb.color(ALR_PAL.black).box(-1.345, 0.22, 0, 0.006, 0.06, 0.1, 0);
    for (const z of [-0.1, 0.1]) {
      mb.color(ALR_P1.white).rod(0.92, 0.22, z, 0.085, 0.72, 12);
      mb.color(ALR_PAL.team, 1).rod(0.92, 0.22, z, 0.088, 0.06, 12);
      mb.color(ALR_PAL.steel).rod(1.29, 0.22, z, 0.06, 0.02, 10).rod(0.55, 0.22, z, 0.06, 0.02, 10);
      for (const x of [0.65, 1.2]) mb.color(ALR_PAL.dark).box(x, 0.15, z, 0.02, 0.04, 0.07, 0.005);
    }
    alrPipe(mb, [0.55, 0.22, 0.0], [0.42, 0.22, 0.0], 0.025, ALR_PAL.sauce);
    // the taxi strip out front and the beacon out back
    p1StripesZ(mb, 0.5, 1.4, 0.115, 0, 0.03, 9);
    for (const x of [-0.3, 0.3]) for (let k = 0; k < 3; k++) mb.color(k % 2 ? ALR_PAL.light : ALR_P1.white).box(x, 0.125, 0.6 + k * 0.35, 0.02, 0.012, 0.02, 0.004);
    mb.color(ALR_PAL.dark).box(0, 0.16, -1.15, 0.12, 0.06, 0.12, 0.02);
    mb.color(ALR_PAL.steel).cyl(0, 0.22, -1.15, 0.05, 0.62, 0.02, 6, 0);
    mb.color(ALR_PAL.light).ball(0, 0.64, -1.15, 0.035, 6);
  },

  // 🔧 DIP & FIX (service depot), 3×3: a raised platform with two robot arms over it
  depot(mb) {
    alrPad(mb, 3, 3);
    // the back shop
    mb.color(ALR_PAL.conc).box(0, 0.33, -1.12, 1.32, 0.23, 0.28, 0.04);
    mb.color(ALR_PAL.team, 1).box(0, 0.49, -1.12, 1.335, 0.035, 0.295, 0.012);
    mb.color(ALR_PAL.steel).wedge(0, 0.6, -1.12, 1.3, 0.07, 0.27, 0.1);
    alrWindowsX(mb, -1.1, -0.45, 0.34, -0.835, 3, 0.06, 0.06, true);
    alrWindowsX(mb, 0.45, 1.1, 0.34, -0.835, 3, 0.06, 0.06, true);
    mb.color(ALR_PAL.black).box(0, 0.28, -0.83, 0.3, 0.17, 0.012, 0.005);
    p1StripesX(mb, -0.34, 0.34, 0.47, -0.83, 0.012, 8);
    for (const x of [-0.9, 0.9]) { mb.color(ALR_PAL.dark).cyl(x, 0.67, -1.15, 0.06, 0.8, 0.05, 8); mb.color(ALR_PAL.black).cyl(x, 0.8, -1.15, 0.04, 0.81, 0.04, 8, 2); }
    // the platform
    const pz = 0.15;
    mb.color(ALR_PAL.dark).box(0, 0.15, pz, 0.74, 0.05, 0.62, 0.02);
    mb.color(ALR_PAL.steel).box(0, 0.205, pz, 0.68, 0.008, 0.56, 0);
    mb.color(ALR_PAL.dark);
    for (let k = -4; k <= 4; k++) mb.box(k * 0.15, 0.215, pz, 0.006, 0.003, 0.54, 0);
    for (let k = -3; k <= 3; k++) mb.box(0, 0.216, pz + k * 0.15, 0.66, 0.003, 0.006, 0);
    mb.color(ALR_PAL.team, 1).box(0, 0.218, pz, 0.2, 0.003, 0.2, 0);
    mb.color(ALR_PAL.steel).box(0, 0.221, pz, 0.15, 0.003, 0.15, 0);
    p1StripesX(mb, -0.74, 0.74, 0.205, pz + 0.6, 0.025, 14); p1StripesX(mb, -0.74, 0.74, 0.205, pz - 0.6, 0.025, 14);
    p1StripesZ(mb, pz - 0.58, pz + 0.58, 0.205, 0.715, 0.025, 11); p1StripesZ(mb, pz - 0.58, pz + 0.58, 0.205, -0.715, 0.025, 11);
    // ramps on and off
    mb.push().at(0, 0, pz + 0.85, Math.PI); mb.color(ALR_PAL.padDark).wedge(0, 0.15, 0, 0.45, 0.05, 0.22, 0.09); mb.pop();
    mb.color(ALR_PAL.padDark).wedge(0, 0.15, pz - 0.84, 0.45, 0.05, 0.2, 0.09);
    // the robot arms
    for (const s of [-1, 1]) {
      const bx = s * 1.12, z = pz;
      mb.color(ALR_PAL.dark).box(bx, 0.16, z, 0.17, 0.06, 0.17, 0.03);
      mb.color(ALR_PAL.gold).cyl(bx, 0.22, z, 0.13, 0.32, 0.12, 12);
      mb.color(ALR_PAL.black).cyl(bx, 0.32, z, 0.09, 0.36, 0.09, 10);
      const sh = [bx, 0.4, z], el = [s * 0.82, 0.98, z], wr = [s * 0.32, 0.78, z], tl = [s * 0.26, 0.56, z];
      mb.color(ALR_PAL.gold).box(bx, 0.42, z, 0.07, 0.07, 0.09, 0.02);
      alrPipe(mb, sh, el, 0.055, ALR_PAL.gold);
      alrPipe(mb, [sh[0] - s * 0.04, 0.42, z + 0.07], [el[0] - s * 0.02, 0.88, z + 0.07], 0.016, ALR_PAL.steel);
      alrPipe(mb, el, wr, 0.045, ALR_PAL.gold);
      mb.color(ALR_PAL.black).rod(el[0], el[1], z, 0.07, 0.15, 10).rod(wr[0], wr[1], z, 0.05, 0.12, 10);
      mb.color(ALR_PAL.team, 1).box((sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, z, 0.035, 0.035, 0.058, 0.01);
      alrPipe(mb, wr, tl, 0.03, ALR_PAL.steel);
      mb.color(ALR_PAL.dark).box(tl[0], tl[1], z, 0.05, 0.035, 0.05, 0.012);
      mb.color(ALR_PAL.steel).cyl(tl[0], tl[1] - 0.12, z, 0.006, tl[1] - 0.035, 0.02, 6);
      mb.color(ALR_PAL.glassLit).ball(tl[0], tl[1] - 0.13, z, 0.02, 6);
      alrPipe(mb, [bx + s * 0.1, 0.25, z - 0.1], [bx + s * 0.1, 0.25, -0.84], 0.02, ALR_PAL.black);
    }
    // tool racks, drums and tires along the front corners
    for (const s of [-1, 1]) {
      const x = s * 1.18;
      mb.color(ALR_PAL.dark).box(x, 0.32, 0.95, 0.2, 0.2, 0.02, 0.006);
      mb.color(ALR_PAL.steel).box(x - 0.18, 0.3, 0.95, 0.015, 0.2, 0.03, 0.004).box(x + 0.18, 0.3, 0.95, 0.015, 0.2, 0.03, 0.004);
      for (let k = 0; k < 5; k++) mb.color(k % 2 ? ALR_PAL.sauce : ALR_PAL.steel).box(x - 0.13 + k * 0.065, 0.36 + (k % 3) * 0.02, 0.975, 0.012, 0.07, 0.008, 0.003);
      mb.color(ALR_PAL.team, 1).box(x, 0.5, 0.96, 0.2, 0.025, 0.03, 0.006);
      mb.color(ALR_PAL.gold).box(x, 0.17, 1.08, 0.18, 0.05, 0.08, 0.01);
    }
    for (const [x, z, c] of [[1.25, 1.3, ALR_PAL.sauce], [1.08, 1.3, ALR_PAL.gold], [1.17, 1.15, ALR_PAL.sauce]]) { mb.color(c).cyl(x, 0.1, z, 0.07, 0.3, 0.07, 10); mb.color(ALR_PAL.dark).cyl(x, 0.3, z, 0.06, 0.31, 0.06, 10, 2); }
    for (let k = 0; k < 3; k++) mb.color(ALR_PAL.rubber).cyl(-1.2, 0.1 + k * 0.06, 1.25, 0.11, 0.155 + k * 0.06, 0.11, 12);
    alrLamp(mb, -0.85, 0.5, 1.35); alrLamp(mb, 0.85, 0.5, 1.35);
  },

  // 🧪 TEST KITCHEN (Alliance battle lab), 3×3: a sleek dome and a glass lab block
  labA(mb) {
    alrPad(mb, 3, 3);
    const dx = -0.42, dz = -0.38;
    mb.color(ALR_PAL.concDark).cyl(dx, 0.1, dz, 0.92, 0.2, 0.9, 20);
    mb.color(ALR_PAL.team, 1).cyl(dx, 0.2, dz, 0.86, 0.27, 0.86, 20, 0);
    p1Dome(mb, dx, 0.27, dz, 0.86, 0.82, 20, 7, (k) => mb.color([ALR_P1.white, ALR_PAL.glass, ALR_P1.white, ALR_PAL.glassLit, ALR_P1.white, ALR_PAL.glass, ALR_P1.white][k]));
    // the dome's ribs
    mb.color(ALR_P1.offWhite);
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      for (let j = 0; j < 4; j++) {
        const t0 = j / 4 * 1.3, t1 = (j + 1) / 4 * 1.3, P = (t) => [dx + Math.cos(a) * Math.cos(t) * 0.875, 0.27 + Math.sin(t) * 0.835, dz + Math.sin(a) * Math.cos(t) * 0.875];
        alrPipe(mb, P(t0), P(t1), 0.018, ALR_P1.offWhite);
      }
    }
    mb.color(ALR_P1.white).cyl(dx, 1.08, dz, 0.12, 1.14, 0.1, 10);
    mb.color(ALR_PAL.steel).cyl(dx, 1.14, dz, 0.025, 1.5, 0.01, 6, 0);
    mb.color(ALR_PAL.glassLit).ball(dx, 1.32, dz, 0.05, 8);
    mb.color(ALR_PAL.light).ball(dx, 1.52, dz, 0.025, 6);
    // the lab block
    const lx = 0.78, lz = 0.6;
    mb.color(ALR_P1.white).box(lx, 0.36, lz, 0.6, 0.26, 0.6, 0.05);
    mb.color(ALR_PAL.glass).box(lx, 0.36, lz + 0.6, 0.52, 0.17, 0.012, 0.004);
    mb.color(ALR_PAL.glass).box(lx + 0.6, 0.36, lz, 0.012, 0.17, 0.52, 0.004);
    mb.color(ALR_PAL.glassLit);
    for (let k = 0; k < 6; k++) { if (k % 3 !== 1) mb.box(lx - 0.43 + k * 0.17, 0.36, lz + 0.614, 0.07, 0.15, 0.004, 0); if (k % 2) mb.box(lx + 0.614, 0.36, lz - 0.43 + k * 0.17, 0.004, 0.15, 0.07, 0); }
    mb.color(ALR_P1.offWhite);
    for (let k = 0; k <= 6; k++) { mb.box(lx - 0.51 + k * 0.17, 0.36, lz + 0.618, 0.01, 0.17, 0.006, 0); mb.box(lx + 0.618, 0.36, lz - 0.51 + k * 0.17, 0.006, 0.17, 0.01, 0); }
    mb.color(ALR_PAL.team, 1).box(lx, 0.6, lz, 0.615, 0.035, 0.615, 0.012);
    mb.color(ALR_P1.offWhite).box(lx, 0.66, lz, 0.55, 0.025, 0.55, 0.012);
    // the roof: a skylight, units, the antenna array
    mb.color(ALR_PAL.glassLit).box(lx - 0.15, 0.69, lz + 0.1, 0.2, 0.012, 0.25, 0.004);
    mb.color(ALR_PAL.steel).box(lx + 0.3, 0.72, lz - 0.3, 0.12, 0.05, 0.1, 0.015);
    for (let k = 0; k < 3; k++) {
      const x = lx + 0.32 - k * 0.06, z = lz + 0.32 - k * 0.24, h = 1.05 - k * 0.12;
      mb.color(ALR_PAL.dark).cyl(x, 0.68, z, 0.015, h, 0.008, 6, 0);
      mb.color(ALR_P1.white).cyl(x, h - 0.1, z, 0.06, h - 0.085, 0.06, 10).cyl(x, h - 0.2, z, 0.045, h - 0.19, 0.045, 10);
      mb.color(ALR_PAL.sauce).ball(x, h + 0.01, z, 0.018, 6);
    }
    // the glass tube between them, the entrance canopy
    mb.color(ALR_PAL.glass).push().at(0.08, 0.32, -0.02, Math.PI / 4).rod(0, 0, 0, 0.09, 0.45, 10, 'z').pop();
    mb.color(ALR_P1.offWhite).push().at(0.08, 0.32, -0.02, Math.PI / 4).rod(0, 0, 0.0, 0.1, 0.03, 10, 'z').rod(0, 0, 0.2, 0.1, 0.03, 10, 'z').rod(0, 0, -0.2, 0.1, 0.03, 10, 'z').pop();
    mb.color(ALR_PAL.dark).box(lx - 0.25, 0.22, lz + 0.62, 0.1, 0.11, 0.01, 0.004);
    mb.color(ALR_PAL.team, 1).box(lx - 0.25, 0.36, lz + 0.7, 0.16, 0.012, 0.1, 0.005);
    mb.color(ALR_PAL.steel).cyl(lx - 0.38, 0.1, lz + 0.78, 0.01, 0.36, 0.01, 4, 0).cyl(lx - 0.12, 0.1, lz + 0.78, 0.01, 0.36, 0.01, 4, 0);
    // a sauce-sample tank and the lamps
    mb.color(ALR_PAL.steel).cyl(-1.1, 0.1, 1.05, 0.18, 0.5, 0.18, 12);
    mb.color(ALR_PAL.glassLit).cyl(-1.1, 0.2, 1.05, 0.185, 0.4, 0.185, 12, 0);
    mb.color(ALR_P1.white).cyl(-1.1, 0.5, 1.05, 0.18, 0.56, 0.08, 12);
    alrPipe(mb, [-0.92, 0.3, 1.05], [-0.25, 0.3, 1.05], 0.025);
    alrLamp(mb, 1.38, 0.42, -1.3); alrLamp(mb, -1.38, 0.42, 0.3); alrLamp(mb, 0.1, 0.42, 1.38);
  },

  // ☢️ THE FRY LAB (Federation battle lab), 3×3: brutalist blocks, tall stacks, a big dish
  labF(mb) {
    alrPad(mb, 3, 3);
    // the main block + stepped crown
    mb.color(ALR_PAL.concDark).box(-0.2, 0.45, -0.25, 0.95, 0.35, 0.82, 0.03);
    mb.color(ALR_PAL.conc).box(-0.2, 0.45, 0.58, 0.85, 0.3, 0.03, 0.01);
    mb.color(ALR_PAL.team, 1).box(-0.2, 0.68, -0.25, 0.965, 0.04, 0.835, 0.012);
    mb.color(ALR_PAL.concDark).box(-0.32, 0.92, -0.42, 0.62, 0.13, 0.52, 0.03);
    mb.color(ALR_PAL.conc).box(-0.32, 1.07, -0.42, 0.5, 0.03, 0.42, 0.02);
    // buttresses
    for (const x of [-0.95, -0.45, 0.05, 0.55]) mb.color(ALR_PAL.concDark).push().at(x, 0, 0.62, Math.PI).wedge(0, 0.38, 0, 0.06, 0.28, 0.08, 0.3).pop();
    // slit windows
    for (const y of [0.36, 0.56]) for (const x of [-0.7, -0.2, 0.3]) { mb.color(ALR_PAL.black).box(x, y, 0.615, 0.17, 0.022, 0.006, 0); mb.color(y > 0.4 ? ALR_PAL.light : ALR_PAL.glassLit).box(x, y, 0.62, 0.14, 0.012, 0.004, 0); }
    alrWindowsZ(mb, -0.85, 0.35, 0.45, 0.76, 4, 0.08, 0.025, true);
    // the blast door
    mb.color(ALR_PAL.dark).box(-0.2, 0.22, 0.63, 0.2, 0.12, 0.02, 0.01);
    p1StripesX(mb, -0.42, 0.02, 0.35, 0.645, 0.008, 6);
    // the stacks
    for (const [x, z, h] of [[-0.95, -1.1, 1.85], [-0.55, -1.15, 1.65], [-0.15, -1.1, 1.75]]) {
      mb.color(ALR_PAL.concDark).cyl(x, 0.1, z, 0.17, h, 0.12, 10);
      mb.color(ALR_PAL.team, 1).cyl(x, h - 0.32, z, 0.135, h - 0.24, 0.13, 10, 0);
      mb.color(ALR_PAL.dark).cyl(x, h - 0.06, z, 0.13, h, 0.135, 10, 0);
      mb.color(ALR_PAL.black).cyl(x, h - 0.01, z, 0.11, h, 0.11, 10, 2);
      mb.color(ALR_P1.redLit).box(x + 0.13, h - 0.12, z + 0.02, 0.02, 0.02, 0.02, 0.005).box(x - 0.1, h - 0.12, z + 0.08, 0.02, 0.02, 0.02, 0.005);
    }
    alrPipe(mb, [-0.95, 0.75, -1.0], [-0.95, 0.75, -0.95], 0.06);
    // the dish tower (front right) + the big dish
    const tx = 0.98, tz = 0.68;
    mb.color(ALR_PAL.dark).box(tx, 0.32, tz, 0.2, 0.22, 0.2, 0.03);
    mb.color(ALR_PAL.team, 1).box(tx, 0.5, tz, 0.205, 0.025, 0.205, 0.01);
    mb.color(ALR_PAL.steel).cyl(tx, 0.54, tz, 0.08, 0.8, 0.06, 8);
    mb.push().at(tx, 0.84, tz, -0.7, -0.6, 0);
    mb.color(ALR_PAL.dark).box(0, 0, 0, 0.08, 0.05, 0.08, 0.015);
    mb.color(ALR_P1.offWhite).cyl(0, 0.03, 0, 0.07, 0.2, 0.56, 18, 1);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.2, 0, 0.56, 0.215, 0.58, 18, 0);
    mb.color(ALR_PAL.dark);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; alrPipe(mb, [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5], [0, 0.48, 0], 0.01, ALR_PAL.dark); }
    mb.color(ALR_PAL.steel).cyl(0, 0.46, 0, 0.04, 0.53, 0.03, 8);
    mb.color(ALR_P1.redLit).ball(0, 0.55, 0, 0.025, 6);
    mb.pop();
    // roof machinery + warning lights
    mb.color(ALR_PAL.steel).box(0.45, 0.85, -0.65, 0.15, 0.06, 0.15, 0.02);
    mb.color(ALR_PAL.black).cyl(0.45, 0.91, -0.65, 0.1, 0.93, 0.1, 10, 2);
    mb.color(ALR_PAL.dark).box(0.45, 0.85, -0.1, 0.18, 0.05, 0.12, 0.02);
    for (const [x, y, z] of [[0.72, 0.84, 0.54], [-1.12, 0.84, 0.54], [-0.92, 1.1, 0.06], [0.28, 1.1, 0.06], [-0.92, 1.1, -0.9], [0.28, 1.1, -0.9]]) { mb.color(ALR_PAL.dark).box(x, y - 0.02, z, 0.025, 0.02, 0.025, 0.005); mb.color(ALR_P1.redLit).ball(x, y + 0.015, z, 0.022, 6); }
    // the reagent tanks
    for (const [x, z] of [[1.12, -0.3], [1.12, -0.85]]) {
      mb.color(ALR_P1.fed).cyl(x, 0.1, z, 0.2, 0.6, 0.2, 12);
      mb.color(ALR_PAL.gold).cyl(x, 0.38, z, 0.205, 0.44, 0.205, 12, 0);
      mb.color(ALR_PAL.dark).cyl(x, 0.6, z, 0.2, 0.66, 0.1, 12);
    }
    alrPipe(mb, [0.92, 0.5, -0.3], [0.75, 0.5, -0.3], 0.04, ALR_PAL.sauce);
    alrPipe(mb, [0.92, 0.3, -0.85], [0.75, 0.3, -0.85], 0.04, ALR_PAL.sauce);
    alrLamp(mb, -1.35, 0.45, 1.3); alrLamp(mb, 0.4, 0.45, 1.3);
  },

  // 🧱 NUG BUNKER (Alliance pillbox), 1×1
  // 🛰️ NUG-SAT UPLINK, 3×3 — the stand-in for the Blender model (blender/alertrig.py build_spysat), if the
  // mesh file doesn't load; the dish (spysat_dish) turns on its bearing at (-0.25, 0.4, -0.25)
  spysat(mb) {
    alrPad(mb, 3, 3);
    mb.color(ALR_PAL.concDark).cyl(-0.25, 0.1, -0.25, 0.95, 0.32, 0.9, 24);
    mb.color(ALR_PAL.team, 1).cyl(-0.25, 0.22, -0.25, 0.93, 0.27, 0.93, 24, 0);
    mb.color(ALR_PAL.steel).cyl(-0.25, 0.32, -0.25, 0.4, 0.4, 0.34, 18);
    mb.color(ALR_PAL.conc).box(0.9, 0.32, 0.92, 0.5, 0.22, 0.46, 0.02);
    mb.color(ALR_PAL.glassLit).box(0.9, 0.36, 1.385, 0.45, 0.06, 0.01, 0).box(1.405, 0.36, 0.92, 0.01, 0.06, 0.42, 0);
    mb.color(ALR_PAL.dark).cyl(1.05, 0.1, -0.95, 0.06, 1.5, 0.03, 6);
    mb.color(ALR_P1.redLit).ball(1.05, 1.6, -0.95, 0.035, 6);
  },
  spysat_dish(mb) {
    mb.color(ALR_PAL.steel).cyl(0, 0, 0, 0.3, 0.06, 0.3, 18);
    mb.color(ALR_PAL.dark).box(0, 0.25, 0, 0.12, 0.17, 0.08, 0.02);
    mb.push().at(0, 0.42, 0.04, 0, 0.96, 0);
    mb.color(ALR_P1.offWhite).cyl(0, 0, 0, 0.12, 0.38, 0.92, 24, 1);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.38, 0, 0.92, 0.4, 0.94, 24, 0);
    mb.color(ALR_PAL.dark).cyl(0, 0.1, 0, 0.03, 0.6, 0.02, 6);
    mb.color(ALR_PAL.light).ball(0, 0.62, 0, 0.03, 6);
    mb.pop();
  },
  bunker(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.03, 0, 0.47, 0.03, 0.47, 0.02);
    mb.color(ALR_PAL.conc).box(0, 0.17, -0.02, 0.37, 0.13, 0.34, 0.07);
    mb.color(ALR_PAL.team, 1).box(0, 0.16, -0.02, 0.378, 0.025, 0.348, 0.008);
    mb.color(ALR_PAL.concDark).box(0, 0.31, -0.02, 0.32, 0.035, 0.3, 0.03);
    mb.color(ALR_PAL.conc).box(0, 0.35, -0.06, 0.12, 0.02, 0.12, 0.015);
    mb.color(ALR_PAL.dark).cyl(0.18, 0.34, -0.2, 0.03, 0.4, 0.03, 6);
    // the gun slit + the machine gun
    mb.color(ALR_PAL.concDark).box(0, 0.25, 0.325, 0.26, 0.04, 0.02, 0.01);
    mb.color(ALR_PAL.black).box(0, 0.22, 0.327, 0.23, 0.024, 0.02, 0);
    mb.color(ALR_PAL.dark).rod(0.04, 0.22, 0.39, 0.025, 0.1, 8, 'z');
    mb.color(ALR_PAL.black).rod(0.04, 0.22, 0.47, 0.011, 0.08, 6, 'z');
    mb.color(ALR_PAL.dark).box(0.04, 0.245, 0.39, 0.008, 0.008, 0.035, 0);
    mb.color(ALR_PAL.black).box(-0.17, 0.22, 0.327, 0.05, 0.024, 0.02, 0);
    // sandbags
    mb.color(ALR_PAL.sand);
    for (let k = 0; k < 6; k++) mb.box(-0.36 + k * 0.144, 0.08, 0.42, 0.065, 0.035, 0.04, 0.02);
    for (let k = 0; k < 5; k++) mb.box(-0.29 + k * 0.144, 0.14, 0.42, 0.06, 0.03, 0.035, 0.018);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) mb.box(s * 0.42, 0.08, 0.26 - k * 0.15, 0.04, 0.035, 0.065, 0.02);
    mb.color(ALR_PAL.wood).box(-0.25, 0.37, -0.22, 0.05, 0.03, 0.035, 0.006);
  },

  // 🚀 SAUCE SAM, 1×1 — the head sits at y 0.3
  sam(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.05, 0, 0.47, 0.05, 0.47, 0.03);
    mb.color(ALR_PAL.concDark).cyl(0, 0.1, 0, 0.38, 0.24, 0.34, 8);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.2, 0, 0.35, 0.24, 0.34, 8, 0);
    mb.color(ALR_PAL.dark).cyl(0, 0.24, 0, 0.27, 0.3, 0.25, 12);
    mb.color(ALR_PAL.steel).box(0.3, 0.17, 0.12, 0.06, 0.05, 0.1, 0.01);
    p1StripesX(mb, -0.4, 0.4, 0.105, 0.43, 0.03, 8);
    for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32]]) mb.color(ALR_PAL.wood).box(x, 0.15, z, 0.08, 0.05, 0.06, 0.01);
  },
  sam_head(mb) {
    mb.color(ALR_PAL.steel).cyl(0, 0, 0, 0.23, 0.06, 0.22, 12);
    mb.color(ALR_PAL.dark).box(0, 0.09, -0.03, 0.12, 0.04, 0.12, 0.02);
    for (const s of [-1, 1]) mb.color(ALR_PAL.steel).box(s * 0.19, 0.15, 0, 0.025, 0.1, 0.09, 0.012);
    mb.color(ALR_PAL.dark).rod(0, 0.18, 0, 0.03, 0.42, 8);
    mb.push().at(0, 0.18, 0, 0, -0.61, 0);
    mb.color(ALR_PAL.team, 1).box(0, 0, 0.02, 0.16, 0.12, 0.2, 0.025);
    mb.color(ALR_PAL.steel).box(0, 0, -0.2, 0.15, 0.11, 0.025, 0.015);
    for (const x of [-0.075, 0.075]) for (const y of [-0.058, 0.058]) {
      mb.color(ALR_PAL.dark).rod(x, y, 0.23, 0.052, 0.04, 10, 'z');
      mb.color(ALR_PAL.black).rod(x, y, 0.248, 0.042, 0.01, 10, 'z');
      mb.color(ALR_P1.white).rod(x, y, 0.225, 0.03, 0.04, 8, 'z');
      mb.color(ALR_PAL.sauce).push().at(x, y, 0, 0, Math.PI / 2, 0).cyl(0, 0.24, 0, 0.03, 0.29, 0.0, 8, 0).pop();
    }
    mb.color(ALR_PAL.dark).box(0.17, 0.08, 0.05, 0.02, 0.03, 0.06, 0.006);
    mb.color(ALR_PAL.glassLit).box(0.19, 0.08, 0.1, 0.004, 0.018, 0.02, 0);
    mb.pop();
  },

  // 💎 PRISM FRY TOWER, 1×1, ~1.55 tall
  prism(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.05, 0, 0.47, 0.05, 0.47, 0.03);
    mb.color(ALR_PAL.concDark).cyl(0, 0.1, 0, 0.4, 0.2, 0.34, 8);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.2, 0, 0.34, 0.25, 0.3, 8, 0);
    mb.color(ALR_P1.white).cyl(0, 0.25, 0, 0.3, 0.3, 0.2, 8);
    // four fins up the tower
    for (let k = 0; k < 4; k++) {
      mb.push().at(0, 0, 0, k * Math.PI / 2 + Math.PI / 4);
      mb.color(ALR_P1.offWhite); p1Fin(mb, [[0.12, 0.28], [0.27, 0.28], [0.1, 0.85]], 0, 0.035);
      mb.pop();
    }
    mb.color(ALR_P1.white).cyl(0, 0.3, 0, 0.16, 1.12, 0.085, 8, 0);
    mb.color(ALR_PAL.glassLit);
    for (let k = 0; k < 8; k += 2) { const a = (k + 0.5) / 8 * Math.PI * 2; mb.push().at(Math.cos(a) * 0.13, 0.7, Math.sin(a) * 0.13, Math.atan2(Math.cos(a), Math.sin(a)), -0.09, 0).box(0, 0, 0, 0.02, 0.32, 0.01, 0).pop(); }
    for (const y of [0.5, 0.82]) mb.color(ALR_PAL.team, 1).cyl(0, y, 0, 0.15 - (y - 0.3) * 0.08, y + 0.04, 0.15 - (y - 0.3) * 0.08, 8);
    // the cradle + the crystal
    mb.color(ALR_PAL.steel).cyl(0, 1.12, 0, 0.1, 1.17, 0.14, 8);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; alrPipe(mb, [Math.cos(a) * 0.12, 1.16, Math.sin(a) * 0.12], [Math.cos(a) * 0.23, 1.36, Math.sin(a) * 0.23], 0.014, ALR_PAL.steel); mb.color(ALR_PAL.glassLit).ball(Math.cos(a) * 0.23, 1.37, Math.sin(a) * 0.23, 0.018, 5); }
    p1Crystal(mb, 0, 1.36, 0, 0.21, 0.27, 0.2, 6, ALR_P1.crystal, ALR_P1.crystalHi, '#d2f0ff');
  },

  // 💥 FLAK FRYER, 1×1 — the head sits at y 0.3
  flak(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.05, 0, 0.47, 0.05, 0.47, 0.03);
    mb.color(ALR_PAL.dark).cyl(0, 0.1, 0, 0.38, 0.26, 0.32, 8);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.18, 0, 0.36, 0.22, 0.34, 8, 0);
    mb.color(ALR_P1.fedDark).cyl(0, 0.26, 0, 0.28, 0.3, 0.26, 12);
    mb.color(ALR_PAL.sand);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; mb.push().at(Math.cos(a) * 0.4, 0.13, Math.sin(a) * 0.4, -a).box(0, 0, 0, 0.035, 0.03, 0.07, 0.018).pop(); }
    mb.color(ALR_PAL.wood).box(-0.3, 0.33, -0.18, 0.06, 0.035, 0.05, 0.008);
  },
  flak_head(mb) {
    mb.color(ALR_P1.fed).cyl(0, 0, 0, 0.22, 0.06, 0.21, 10);
    mb.color(ALR_P1.fedDark).box(0, 0.09, -0.06, 0.13, 0.04, 0.1, 0.02);
    // the ammo drums on the sides
    for (const s of [-1, 1]) { mb.color(ALR_P1.fedDark).rod(s * 0.17, 0.14, -0.02, 0.07, 0.05, 10); mb.color(ALR_PAL.team, 1).rod(s * 0.17, 0.14, -0.02, 0.072, 0.015, 10); mb.color(ALR_PAL.gold).rod(s * 0.2, 0.14, -0.02, 0.025, 0.012, 6); }
    mb.color(ALR_PAL.dark).rod(0, 0.14, 0, 0.035, 0.3, 8);
    mb.push().at(0, 0.14, 0, 0, -0.8, 0);
    mb.color(ALR_P1.fed).box(0, 0, 0, 0.1, 0.075, 0.1, 0.02);
    mb.color(ALR_PAL.team, 1).box(0, 0.077, -0.02, 0.08, 0.008, 0.06, 0);
    for (const x of [-0.045, 0.045]) for (const y of [-0.032, 0.032]) {
      mb.color(ALR_PAL.dark).rod(x, y, 0.22, 0.02, 0.26, 8, 'z');
      mb.color(ALR_PAL.black).rod(x, y, 0.36, 0.028, 0.05, 8, 'z');
      mb.color(ALR_PAL.steel).rod(x, y, 0.14, 0.026, 0.03, 8, 'z');
    }
    mb.pop();
    // the shield
    mb.push().at(0, 0.14, 0.09, 0, -0.25, 0);
    mb.color(ALR_P1.fed).box(0, 0, 0, 0.17, 0.09, 0.012, 0.006);
    mb.color(ALR_PAL.black).box(0.11, 0.03, 0.013, 0.025, 0.012, 0.002, 0);
    mb.pop();
  },

  // 🧱 the walls: post = centered on the tile; bar = from x 0 to x +0.5 (the game turns it to each neighbor)
  wallA_post(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.025, 0, 0.21, 0.025, 0.21, 0.01);
    mb.color(ALR_PAL.conc).box(0, 0.24, 0, 0.175, 0.2, 0.175, 0.03);
    mb.color(ALR_PAL.team, 1).box(0, 0.29, 0, 0.18, 0.03, 0.18, 0.006);
    mb.color(ALR_PAL.concDark).box(0, 0.45, 0, 0.19, 0.025, 0.19, 0.012);
    mb.color(ALR_PAL.conc).box(0, 0.48, 0, 0.12, 0.012, 0.12, 0.008);
    mb.color(ALR_PAL.concDark).box(0, 0.12, 0, 0.18, 0.012, 0.18, 0);
  },
  wallA_bar(mb) {
    mb.color(ALR_PAL.padDark).box(0.25, 0.02, 0, 0.25, 0.02, 0.15, 0.008);
    mb.color(ALR_PAL.conc).box(0.25, 0.21, 0, 0.25, 0.18, 0.12, 0.02);
    mb.color(ALR_PAL.team, 1).box(0.25, 0.27, 0, 0.25, 0.022, 0.125, 0);
    mb.color(ALR_PAL.concDark).box(0.25, 0.4, 0, 0.25, 0.018, 0.135, 0.01);
    mb.color(ALR_PAL.concDark);
    for (const x of [0.17, 0.34]) for (const s of [-1, 1]) mb.box(x, 0.17, s * 0.122, 0.004, 0.13, 0.002, 0);
  },
  wallF_post(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.025, 0, 0.23, 0.025, 0.23, 0.01);
    mb.color(ALR_PAL.concDark).box(0, 0.2, 0, 0.19, 0.18, 0.19, 0.025);
    mb.color(ALR_PAL.team, 1).box(0, 0.2, 0, 0.195, 0.025, 0.195, 0.004);
    mb.color(ALR_PAL.conc, 0, 0.85).push().at(0.02, 0.42, -0.01, 0.15, 0.06, 0.05).box(0, 0, 0, 0.17, 0.05, 0.16, 0.03).pop();
    mb.color(ALR_PAL.concDark).push().at(-0.06, 0.08, 0.17, 0.3).box(0, 0, 0, 0.08, 0.06, 0.05, 0.02).pop();
    mb.color(ALR_P1.rust);
    for (const [x, z, h, t] of [[0.09, 0.08, 0.6, 0.2], [-0.08, -0.07, 0.56, -0.25], [0.07, -0.09, 0.54, 0.1]]) mb.push().at(x, 0.42, z, 0, t, t * 0.6).cyl(0, 0, 0, 0.009, h - 0.42, 0.008, 4, 0).pop();
  },
  wallF_bar(mb) {
    mb.color(ALR_PAL.padDark).box(0.25, 0.02, 0, 0.25, 0.02, 0.17, 0.008);
    mb.color(ALR_PAL.concDark).box(0.25, 0.17, 0, 0.26, 0.15, 0.15, 0.02);
    mb.color(ALR_PAL.team, 1).box(0.25, 0.17, 0, 0.26, 0.02, 0.155, 0);
    mb.color(ALR_PAL.conc, 0, 0.85);
    mb.push().at(0.13, 0.36, 0.01, 0.06, 0.04, -0.03).box(0, 0, 0, 0.13, 0.05, 0.13, 0.025).pop();
    mb.push().at(0.38, 0.35, -0.01, -0.05, -0.03, 0.04).box(0, 0, 0, 0.12, 0.045, 0.125, 0.025).pop();
    mb.color(ALR_P1.rust);
    for (const [x, z, t] of [[0.06, 0.06, 0.3], [0.26, -0.05, -0.2], [0.45, 0.05, 0.15]]) mb.push().at(x, 0.38, z, 0, t, -t * 0.5).cyl(0, 0, 0, 0.008, 0.13, 0.007, 4, 0).pop();
    mb.color(ALR_PAL.dark).box(0.3, 0.08, 0.151, 0.06, 0.03, 0.003, 0);
  },

  // 🛢️ FRY OIL DERRICK (neutral), 2×2 — the pump arm (derrick_pump) sits at (-0.3, 0.44, 0.45)
  derrick(mb) {
    alrPad(mb, 2, 2);
    // the lattice tower (back left)
    const X = -0.45, Z = -0.42, y0 = 0.12, y1 = 1.42, b0 = 0.24, b1 = 0.06;
    mb.color(ALR_PAL.dark).box(X, 0.14, Z, 0.32, 0.03, 0.32, 0.01);
    const leg = (sx, sz, t) => { const b = b0 + (b1 - b0) * t; return [X + sx * b, y0 + (y1 - y0) * t, Z + sz * b]; };
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) alrPipe(mb, leg(sx, sz, 0), leg(sx, sz, 1), 0.02, ALR_PAL.goldDark);
    const lv = [0, 0.2, 0.4, 0.6, 0.8, 1];
    for (let i = 0; i < lv.length - 1; i++) for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      alrPipe(mb, leg(ax, az, lv[i + 1]), leg(bx, bz, lv[i + 1]), 0.011, ALR_PAL.goldDark);
      alrPipe(mb, (i % 2 ? leg(ax, az, lv[i]) : leg(bx, bz, lv[i])), (i % 2 ? leg(bx, bz, lv[i + 1]) : leg(ax, az, lv[i + 1])), 0.009, ALR_PAL.gold);
    }
    mb.color(ALR_PAL.dark).box(X, y1 + 0.03, Z, 0.09, 0.03, 0.09, 0.01);
    mb.color(ALR_PAL.steel).rod(X, y1 + 0.08, Z, 0.04, 0.12, 8);
    mb.color(ALR_PAL.team, 1).box(X, 0.6, Z + 0.17, 0.12, 0.08, 0.008, 0.004);
    mb.color(ALR_PAL.dark).box(X, 0.82, Z, 0.25, 0.012, 0.25, 0);
    mb.color(ALR_PAL.black).cyl(X, 0.17, Z, 0.006, 1.35, 0.006, 4, 0);
    mb.color(ALR_P1.redLit).ball(X, 1.53, Z, 0.025, 6);
    // the storage tanks (right)
    for (const [x, z, r, h] of [[0.5, -0.45, 0.3, 0.68], [0.55, 0.38, 0.24, 0.55]]) {
      mb.color(ALR_P1.oil).cyl(x, 0.1, z, r, h, r, 14);
      mb.color(ALR_PAL.gold).cyl(x, h - 0.16, z, r + 0.006, h - 0.1, r + 0.006, 14, 0);
      mb.color(ALR_PAL.team, 1).cyl(x, 0.2, z, r + 0.006, 0.24, r + 0.006, 14, 0);
      mb.color(ALR_PAL.dark).cyl(x, h, z, r, h + 0.06, r * 0.4, 14);
      mb.color(ALR_PAL.steel).box(x - r - 0.01, (h + 0.1) / 2, z, 0.012, (h - 0.1) / 2, 0.04, 0);
    }
    alrPipe(mb, [0.5, 0.3, -0.15], [0.55, 0.3, 0.14], 0.03, ALR_PAL.steel);
    // the pump jack (front left): skid, samson post, gearbox, wellhead
    const px = -0.3, pz = 0.45;
    mb.color(ALR_PAL.dark).box(px, 0.13, pz - 0.05, 0.12, 0.025, 0.35, 0.01);
    for (const s of [-1, 1]) { alrPipe(mb, [px + s * 0.08, 0.15, pz - 0.15], [px + s * 0.03, 0.44, pz], 0.018, ALR_PAL.gold); alrPipe(mb, [px + s * 0.08, 0.15, pz + 0.12], [px + s * 0.03, 0.44, pz], 0.018, ALR_PAL.gold); }
    mb.color(ALR_PAL.dark).rod(px, 0.44, pz, 0.025, 0.1, 8);
    mb.color(ALR_PAL.steel).box(px, 0.22, pz - 0.3, 0.08, 0.07, 0.07, 0.015);
    mb.color(ALR_PAL.team, 1).box(px, 0.3, pz - 0.3, 0.082, 0.012, 0.072, 0);
    mb.color(ALR_PAL.dark).rod(px, 0.22, pz - 0.3, 0.03, 0.2, 8);
    mb.color(ALR_PAL.steel).cyl(px, 0.1, pz + 0.37, 0.05, 0.18, 0.04, 8);
    mb.color(ALR_PAL.sauce).cyl(px, 0.18, pz + 0.37, 0.06, 0.22, 0.06, 8);
    mb.color(ALR_PAL.steel).cyl(px, 0.22, pz + 0.37, 0.015, 0.3, 0.015, 6);
    alrPipe(mb, [px + 0.05, 0.16, pz + 0.37], [0.35, 0.16, pz + 0.37], 0.025, ALR_PAL.dark);
    alrPipe(mb, [0.35, 0.16, pz + 0.37], [0.35, 0.16, 0.6], 0.025, ALR_PAL.dark);
    alrLamp(mb, 0.85, 0.42, 0.85);
  },
  // the walking beam: pivot at its bearing; rocks about x; the horse head at +z
  derrick_pump(mb) {
    mb.color(ALR_PAL.dark).box(0, 0.0, 0, 0.04, 0.035, 0.04, 0.008);
    mb.color(ALR_PAL.gold).box(0, 0.045, 0.02, 0.028, 0.03, 0.33, 0.008);
    // the horse head
    mb.color(ALR_PAL.goldDark).box(0, 0.03, 0.37, 0.04, 0.07, 0.035, 0.012);
    mb.push().at(0, -0.04, 0.4, 0, 0.5, 0); mb.color(ALR_PAL.goldDark).box(0, 0, 0, 0.04, 0.05, 0.02, 0.01); mb.pop();
    mb.color(ALR_PAL.black).box(0, -0.17, 0.41, 0.004, 0.13, 0.004, 0);
    mb.color(ALR_PAL.steel).box(0, -0.3, 0.41, 0.015, 0.012, 0.015, 0.003);
    // the tail: counterweight + pitman arms
    mb.color(ALR_PAL.dark).box(0, 0.04, -0.3, 0.05, 0.05, 0.04, 0.012);
    mb.color(ALR_PAL.team, 1).box(0, 0.04, -0.3, 0.052, 0.012, 0.042, 0);
    for (const s of [-1, 1]) mb.color(ALR_PAL.steel).box(s * 0.05, -0.1, -0.3, 0.008, 0.11, 0.012, 0.003);
  },
};

// ---- the units ------------------------------------------------------------------------------------------
const ALR_UNIT_ART_P1 = {
  // 🔧 FRY COOK (engineer): hard hat, team overalls, a toolbox and a spatula
  engineer(mb) {
    p1Torso(mb);
    mb.color(ALR_PAL.team, 1).box(0, 0.2, 0, 0.106, 0.07, 0.092, 0.03);
    mb.color(ALR_PAL.team, 1).box(0, 0.27, 0.083, 0.055, 0.04, 0.01, 0.004);
    mb.color(ALR_PAL.team, 1).box(0.05, 0.3, 0, 0.012, 0.012, 0.1, 0.004).box(-0.05, 0.3, 0, 0.012, 0.012, 0.1, 0.004);
    mb.color(ALR_PAL.gold).box(0.05, 0.3, 0.098, 0.01, 0.01, 0.005, 0).box(-0.05, 0.3, 0.098, 0.01, 0.01, 0.005, 0);
    mb.color(ALR_P1.white).box(0, 0.24, 0.094, 0.03, 0.022, 0.004, 0);
    // the hard hat
    mb.color(ALR_PAL.gold).ball(0, 0.37, 0, 0.078, 8, 0.05);
    mb.color(ALR_PAL.gold).cyl(0, 0.35, 0.01, 0.1, 0.36, 0.1, 10);
    mb.color(ALR_PAL.goldDark).box(0, 0.42, 0, 0.012, 0.008, 0.075, 0);
    mb.color(ALR_PAL.light).box(0, 0.38, 0.072, 0.018, 0.012, 0.006, 0);
    p1Eyes(mb);
    // arms: the toolbox (left), the spatula (right)
    mb.color(ALR_PAL.breading).box(0.105, 0.22, 0.03, 0.022, 0.05, 0.022, 0.01).box(-0.105, 0.21, 0.0, 0.022, 0.05, 0.022, 0.01);
    mb.color(ALR_PAL.sauce).box(-0.13, 0.12, 0.0, 0.03, 0.035, 0.065, 0.008);
    mb.color(ALR_PAL.dark).box(-0.13, 0.162, 0.0, 0.006, 0.008, 0.03, 0);
    mb.color(ALR_PAL.gold).box(-0.161, 0.13, 0.0, 0.002, 0.008, 0.012, 0);
    mb.color(ALR_PAL.wood).push().at(0.12, 0.2, 0.08, 0, -0.9, 0).box(0, 0, 0.02, 0.008, 0.008, 0.05, 0).pop();
    mb.color(ALR_PAL.steel).push().at(0.12, 0.2, 0.08, 0, -0.9, 0).box(0, 0, 0.1, 0.03, 0.004, 0.035, 0.002).pop();
  },

  // 🌭 the CORN DOG: body only; four dog_legs at (±0.05, 0.12, ±0.11)
  dog(mb) {
    mb.color(ALR_PAL.breading); p1CylZ(mb, 0, 0.17, -0.15, 0.065, 0.13, 0.068, 10, 0);
    mb.color(ALR_PAL.breading).ball(0, 0.17, -0.15, 0.065, 10).ball(0, 0.17, 0.13, 0.068, 10);
    mb.color(ALR_PAL.breadDark).ball(0.04, 0.21, -0.05, 0.025, 5).ball(-0.045, 0.18, 0.06, 0.025, 5).ball(0.03, 0.13, 0.09, 0.02, 5);
    // a mustard zig-zag down the back
    mb.color(ALR_PAL.gold);
    for (let k = 0; k < 6; k++) mb.push().at(0, 0.236, -0.15 + k * 0.05, k % 2 ? 0.7 : -0.7).box(0, 0, 0, 0.032, 0.006, 0.008, 0.002).pop();
    // the head
    mb.color(ALR_PAL.breading).ball(0, 0.26, 0.2, 0.065, 9, 0.06);
    mb.color(ALR_PAL.breading).box(0, 0.235, 0.265, 0.035, 0.03, 0.035, 0.015);
    mb.color(ALR_PAL.black).ball(0, 0.245, 0.3, 0.014, 5).box(0.025, 0.275, 0.255, 0.008, 0.008, 0.004, 0).box(-0.025, 0.275, 0.255, 0.008, 0.008, 0.004, 0);
    mb.color(ALR_PAL.sauce).box(0, 0.212, 0.28, 0.012, 0.004, 0.022, 0);
    for (const s of [-1, 1]) mb.color(ALR_PAL.breadDark).push().at(s * 0.06, 0.28, 0.18, 0, 0, s * 0.5).box(0, -0.02, 0, 0.012, 0.035, 0.022, 0.006).pop();
    // the collar + the stick (the tail)
    mb.color(ALR_PAL.team, 1); p1CylZ(mb, 0, 0.215, 0.135, 0.06, 0.16, 0.058, 10, 0);
    mb.color(ALR_PAL.gold).ball(0, 0.165, 0.16, 0.012, 5);
    alrPipe(mb, [0, 0.17, -0.18], [0, 0.24, -0.33], 0.012, ALR_PAL.wood);
  },
  dog_leg(mb) {
    mb.color(ALR_PAL.breadDark).box(0, -0.05, 0, 0.018, 0.05, 0.018, 0.007);
    mb.color(ALR_PAL.breading).box(0, -0.11, 0.008, 0.022, 0.012, 0.028, 0.006);
  },

  // 🚀 JUMPJET NUG: a big jetpack (nozzles at (±0.05, ~0.2, -0.15)) and a rifle
  jetpack(mb) {
    p1Torso(mb);
    mb.color(ALR_PAL.team, 1).box(0, 0.23, 0, 0.105, 0.06, 0.09, 0.03);
    mb.color(ALR_PAL.team, 1).ball(0, 0.37, 0, 0.075, 8, 0.045);
    mb.color(ALR_PAL.dark).box(0, 0.355, 0.06, 0.07, 0.014, 0.025, 0.005);
    mb.color(ALR_PAL.glassLit).box(0.03, 0.355, 0.083, 0.018, 0.01, 0.004, 0).box(-0.03, 0.355, 0.083, 0.018, 0.01, 0.004, 0);
    mb.color(ALR_PAL.black).box(0.03, 0.31, 0.088, 0.01, 0.008, 0.005, 0).box(-0.03, 0.31, 0.088, 0.01, 0.008, 0.005, 0);
    mb.color(ALR_PAL.breading).box(0.09, 0.24, 0.06, 0.025, 0.025, 0.06, 0.01).box(-0.07, 0.24, 0.08, 0.025, 0.025, 0.06, 0.01);
    p1Rifle(mb, 0.02, 0.24, 0.05);
    // the pack
    mb.color(ALR_PAL.dark).box(0, 0.29, -0.1, 0.075, 0.07, 0.03, 0.012);
    mb.color(ALR_PAL.dark).box(0, 0.32, -0.04, 0.09, 0.012, 0.06, 0.004);
    for (const s of [-1, 1]) {
      const x = s * 0.055;
      mb.color(ALR_PAL.steel).cyl(x, 0.22, -0.15, 0.04, 0.4, 0.04, 10);
      mb.color(ALR_PAL.steel).ball(x, 0.4, -0.15, 0.04, 8, 0.03);
      mb.color(ALR_PAL.team, 1).cyl(x, 0.33, -0.15, 0.042, 0.35, 0.042, 10, 0);
      mb.color(ALR_PAL.dark).cyl(x, 0.185, -0.15, 0.034, 0.22, 0.026, 10);
      mb.color(ALR_PAL.light).cyl(x, 0.183, -0.15, 0.026, 0.186, 0.026, 8, 1);
      mb.color(ALR_PAL.dark); p1Fin(mb, [[-0.13, 0.24], [-0.2, 0.2], [-0.2, 0.3], [-0.13, 0.32]], x + s * 0.035, 0.008);
    }
  },

  // 🪖 CONSCRIPT (Federation): ushanka, greatcoat, a long rifle
  conscript(mb) {
    p1Torso(mb);
    // the greatcoat
    mb.color(ALR_P1.coat).cyl(0, 0.11, 0, 0.112, 0.27, 0.106, 10);
    mb.color(ALR_P1.coat, 0, 0.8).box(0, 0.19, 0.103, 0.006, 0.08, 0.004, 0);
    mb.color(ALR_PAL.gold).box(0.012, 0.22, 0.105, 0.005, 0.005, 0.004, 0).box(0.012, 0.17, 0.105, 0.005, 0.005, 0.004, 0);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.2, 0, 0.115, 0.225, 0.113, 10, 0);
    mb.color(ALR_PAL.dark).box(0.0, 0.212, 0.112, 0.016, 0.014, 0.004, 0);
    mb.color(ALR_PAL.team, 1).box(0.09, 0.28, 0, 0.03, 0.01, 0.04, 0.004).box(-0.09, 0.28, 0, 0.03, 0.01, 0.04, 0.004);
    // the ushanka
    mb.color(ALR_P1.fur).ball(0, 0.375, 0, 0.082, 8, 0.05);
    mb.color(ALR_P1.furLt).box(0, 0.4, 0, 0.07, 0.03, 0.07, 0.025);
    mb.color(ALR_P1.fur).box(0.075, 0.33, -0.005, 0.016, 0.04, 0.045, 0.012).box(-0.075, 0.33, -0.005, 0.016, 0.04, 0.045, 0.012);
    mb.color(ALR_P1.fur).box(0, 0.37, 0.07, 0.06, 0.022, 0.012, 0.008);
    mb.color(ALR_PAL.team, 1).box(0, 0.375, 0.083, 0.014, 0.014, 0.004, 0.003);
    p1Eyes(mb, 0.315);
    mb.color(ALR_P1.coat).box(0.09, 0.24, 0.06, 0.026, 0.026, 0.06, 0.01).box(-0.07, 0.24, 0.08, 0.026, 0.026, 0.06, 0.01);
    p1Rifle(mb, 0.02, 0.25, 0.05, true);
  },

  // ⚡ ZAPPER (tesla trooper): bulky armor, a coil backpack, coil gauntlets
  zapper(mb) {
    mb.color(ALR_PAL.breading).ball(0, 0.2, 0, 0.09, 8, 0.08);
    mb.color(ALR_PAL.dark).box(0, 0.26, -0.005, 0.12, 0.1, 0.1, 0.04);
    mb.color(ALR_PAL.team, 1).box(0, 0.28, 0.07, 0.085, 0.07, 0.04, 0.025);
    mb.color(ALR_PAL.dark).box(0, 0.16, 0, 0.11, 0.025, 0.09, 0.012);
    mb.color(ALR_PAL.gold).box(0, 0.16, 0.09, 0.025, 0.018, 0.004, 0);
    for (const s of [-1, 1]) { mb.color(ALR_PAL.steel).ball(s * 0.13, 0.33, 0, 0.05, 8, 0.04); mb.color(ALR_PAL.team, 1).box(s * 0.135, 0.355, 0, 0.04, 0.008, 0.04, 0.004); }
    // the helmet: a bucket with a glowing visor
    mb.color(ALR_PAL.steel).cyl(0, 0.34, 0.01, 0.07, 0.44, 0.06, 8);
    mb.color(ALR_PAL.dark).cyl(0, 0.44, 0.01, 0.06, 0.455, 0.03, 8);
    mb.color(ALR_PAL.black).box(0, 0.4, 0.075, 0.05, 0.016, 0.006, 0.003);
    mb.color(ALR_PAL.glassLit).box(0, 0.4, 0.08, 0.04, 0.009, 0.004, 0);
    // the arms forward with the coil gauntlets
    for (const s of [-1, 1]) {
      const x = s * 0.12;
      mb.color(ALR_PAL.dark).box(x, 0.26, 0.04, 0.035, 0.035, 0.05, 0.012);
      mb.color(ALR_PAL.steel); p1CylZ(mb, x, 0.25, 0.08, 0.034, 0.19, 0.026, 8, 3);
      for (let k = 0; k < 3; k++) { mb.color(ALR_PAL.copper); p1CylZ(mb, x, 0.25, 0.1 + k * 0.03, 0.04, 0.115 + k * 0.03, 0.04, 8, 3); }
      mb.color(ALR_PAL.glassLit).ball(x, 0.25, 0.205, 0.022, 6);
    }
    // the backpack coil
    mb.color(ALR_PAL.dark).box(0, 0.29, -0.13, 0.08, 0.08, 0.04, 0.015);
    mb.color(ALR_PAL.steel).cyl(0, 0.36, -0.14, 0.02, 0.5, 0.014, 6);
    for (let k = 0; k < 3; k++) mb.color(ALR_PAL.copper).cyl(0, 0.38 + k * 0.04, -0.14, 0.045 - k * 0.008, 0.395 + k * 0.04, 0.045 - k * 0.008, 8);
    mb.color(ALR_PAL.glassLit).ball(0, 0.51, -0.14, 0.02, 6);
  },

  // 🚙 the NUG IFV (Alliance): six wheels; ifv_turret sits at (0, 0.24, -0.04)
  ifv(mb) {
    for (const s of [-1, 1]) for (const z of [-0.27, 0, 0.27]) p1Wheel(mb, s * 0.205, 0.075, z, 0.075, 0.07);
    mb.color(ALR_PAL.dark).box(0, 0.11, 0, 0.17, 0.04, 0.38, 0.015);
    mb.color(ALR_P1.ally).box(0, 0.18, -0.04, 0.2, 0.06, 0.34, 0.03);
    mb.color(ALR_P1.ally).push().at(0, 0.18, 0.36, Math.PI).wedge(0, 0, 0, 0.19, 0.06, 0.08, 0.07).pop();
    mb.color(ALR_P1.allyDark).box(0, 0.12, 0.42, 0.18, 0.03, 0.03, 0.01);
    for (const s of [-1, 1]) mb.color(ALR_P1.allyDark).box(s * 0.21, 0.155, 0, 0.012, 0.025, 0.37, 0.006);
    mb.color(ALR_PAL.team, 1).box(0, 0.242, -0.2, 0.16, 0.008, 0.12, 0.004);
    mb.color(ALR_PAL.team, 1).box(0.2, 0.19, -0.1, 0.006, 0.025, 0.12, 0).box(-0.2, 0.19, -0.1, 0.006, 0.025, 0.12, 0);
    mb.color(ALR_PAL.glass).box(0.08, 0.22, 0.3, 0.05, 0.015, 0.03, 0.004);
    mb.color(ALR_PAL.light).box(0.14, 0.17, 0.43, 0.025, 0.015, 0.006, 0.003).box(-0.14, 0.17, 0.43, 0.025, 0.015, 0.006, 0.003);
    mb.color(ALR_P1.allyDark).box(0, 0.17, -0.385, 0.12, 0.05, 0.008, 0.004);
    mb.color(ALR_PAL.dark).box(-0.12, 0.25, -0.3, 0.04, 0.01, 0.06, 0.004);
    mb.color(ALR_PAL.dark).cyl(0.15, 0.24, -0.33, 0.006, 0.4, 0.004, 4, 0);
  },
  ifv_turret(mb) {
    mb.color(ALR_P1.allyDark).cyl(0, 0, 0, 0.11, 0.04, 0.1, 10);
    mb.color(ALR_P1.ally).box(0, 0.07, 0, 0.07, 0.04, 0.09, 0.02);
    mb.color(ALR_PAL.glassLit).box(0, 0.085, 0.092, 0.03, 0.012, 0.004, 0);
    for (const s of [-1, 1]) {
      mb.color(ALR_PAL.dark).box(s * 0.08, 0.07, 0, 0.012, 0.02, 0.03, 0);
      mb.color(ALR_PAL.team, 1).box(s * 0.13, 0.08, 0.0, 0.045, 0.04, 0.1, 0.012);
      for (const y of [0.062, 0.098]) for (const dx of [-0.02, 0.02]) {
        mb.color(ALR_PAL.black).rod(s * 0.13 + dx, y, 0.1, 0.014, 0.008, 6, 'z');
        mb.color(ALR_PAL.sauce).rod(s * 0.13 + dx, y, 0.102, 0.009, 0.006, 6, 'z');
      }
    }
    mb.color(ALR_PAL.dark).cyl(-0.03, 0.11, -0.05, 0.02, 0.14, 0.02, 6);
  },

  // 💎 PRISM TANK: prismtank_turret sits at (0, 0.28, -0.03)
  prismtank(mb) {
    for (const s of [-1, 1]) p1Track(mb, s * 0.25, -0.4, 0.4, 0.09, 0.075, ALR_P1.ally, 5);
    mb.color(ALR_P1.ally).box(0, 0.2, -0.04, 0.18, 0.07, 0.34, 0.03);
    mb.color(ALR_P1.white).push().at(0, 0.2, 0.33, Math.PI).wedge(0, 0, 0, 0.18, 0.07, 0.09, 0.08).pop();
    mb.color(ALR_PAL.team, 1).box(0, 0.272, -0.2, 0.15, 0.006, 0.13, 0.003);
    mb.color(ALR_PAL.team, 1).box(0.25, 0.205, 0, 0.088, 0.005, 0.12, 0).box(-0.25, 0.205, 0, 0.088, 0.005, 0.12, 0);
    mb.color(ALR_PAL.glassLit).box(0.1, 0.24, 0.2, 0.035, 0.012, 0.02, 0.003).box(-0.1, 0.24, 0.2, 0.035, 0.012, 0.02, 0.003);
    mb.color(ALR_PAL.dark).box(0, 0.24, -0.38, 0.12, 0.03, 0.03, 0.01);
    mb.color(ALR_PAL.light).box(0.13, 0.19, 0.42, 0.025, 0.012, 0.005, 0.003).box(-0.13, 0.19, 0.42, 0.025, 0.012, 0.005, 0.003);
  },
  prismtank_turret(mb) {
    mb.color(ALR_P1.allyDark).cyl(0, 0, 0, 0.16, 0.04, 0.15, 10);
    mb.color(ALR_P1.white).cyl(0, 0.04, 0, 0.15, 0.07, 0.11, 10);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.07, 0, 0.11, 0.085, 0.1, 10);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + Math.PI / 2; alrPipe(mb, [Math.cos(a) * 0.1, 0.07, Math.sin(a) * 0.1], [Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13], 0.012, ALR_PAL.steel); mb.color(ALR_PAL.glassLit).ball(Math.cos(a) * 0.13, 0.21, Math.sin(a) * 0.13, 0.014, 5); }
    p1Crystal(mb, 0, 0.19, 0, 0.11, 0.17, 0.1, 6, ALR_P1.crystal, ALR_P1.crystalHi, '#d2f0ff');
  },

  // 🌳 MIRAGE TANK: low and sleek; mirage_turret sits at (0, 0.28, -0.05)
  mirage(mb) {
    for (const s of [-1, 1]) p1Track(mb, s * 0.24, -0.4, 0.4, 0.085, 0.07, ALR_P1.allyDark, 5);
    // side skirts
    for (const s of [-1, 1]) mb.color(ALR_P1.ally).push().at(s * 0.31, 0.15, 0, 0, 0, -s * 0.25).box(0, 0, 0, 0.012, 0.055, 0.4, 0.006).pop();
    mb.color(ALR_P1.ally).box(0, 0.2, -0.05, 0.2, 0.065, 0.33, 0.025);
    mb.color(ALR_P1.ally).push().at(0, 0.2, 0.33, Math.PI).wedge(0, 0, 0, 0.2, 0.065, 0.1, 0.1).pop();
    mb.color(ALR_PAL.team, 1).push().at(0, 0.265, -0.2, 0, 0, 0).box(0, 0, 0, 0.18, 0.006, 0.14, 0.003).pop();
    mb.color(ALR_PAL.team, 1).box(0.2, 0.22, -0.05, 0.006, 0.02, 0.3, 0).box(-0.2, 0.22, -0.05, 0.006, 0.02, 0.3, 0);
    mb.color(ALR_PAL.glassLit).box(0, 0.25, 0.22, 0.06, 0.008, 0.025, 0.002);
    mb.color(ALR_P1.allyDark).box(0.12, 0.27, -0.33, 0.04, 0.012, 0.05, 0.004).box(-0.12, 0.27, -0.33, 0.04, 0.012, 0.05, 0.004);
    mb.color(ALR_PAL.light).box(0.14, 0.18, 0.43, 0.022, 0.01, 0.005, 0.003).box(-0.14, 0.18, 0.43, 0.022, 0.01, 0.005, 0.003);
  },
  mirage_turret(mb) {
    mb.color(ALR_P1.allyDark).cyl(0, 0, 0, 0.15, 0.03, 0.14, 10);
    mb.color(ALR_P1.ally).push().at(0, 0.06, 0.0, Math.PI).wedge(0, 0, 0, 0.12, 0.035, 0.13, 0.04).pop();
    mb.color(ALR_PAL.team, 1).box(0, 0.098, -0.05, 0.08, 0.006, 0.06, 0);
    // the projector: a barrel ending in a big lens
    mb.color(ALR_P1.white); p1CylZ(mb, 0, 0.06, 0.08, 0.04, 0.24, 0.05, 10, 0);
    mb.color(ALR_PAL.dark); p1CylZ(mb, 0, 0.06, 0.24, 0.065, 0.27, 0.065, 12, 3);
    mb.color(ALR_PAL.glassLit); p1CylZ(mb, 0, 0.06, 0.27, 0.055, 0.28, 0.05, 12, 3);
    mb.color(ALR_P1.crystalHi).ball(0, 0.06, 0.28, 0.025, 6, 0.025);
    for (const s of [-1, 1]) { mb.color(ALR_P1.white); p1Fin(mb, [[0.1, 0.06], [0.22, 0.06], [0.2, 0.08], [0.1, 0.11]], s * 0.045, 0.008); }
    mb.color(ALR_PAL.dark).box(0.0, 0.03, 0.14, 0.012, 0.03, 0.05, 0);
  },

  // 🚀 the V3 TRUCK: v3_rack sits at (0, 0.3, -0.3); v3_rocket on the rack: rack-local
  //    alrTRS(0, 0.186, 0.222, 0, 1, 1, 1, -0.436)  (i.e. at (0, 0.075, 0.28) along the raised rail)
  v3(mb) {
    for (const s of [-1, 1]) for (const z of [-0.33, -0.17, 0.27]) p1Wheel(mb, s * 0.2, 0.075, z, 0.075, 0.065);
    mb.color(ALR_PAL.dark).box(0, 0.12, -0.02, 0.15, 0.03, 0.42, 0.01);
    // the cab
    mb.color(ALR_P1.fed).box(0, 0.25, 0.3, 0.19, 0.11, 0.12, 0.035);
    mb.color(ALR_P1.fed).push().at(0, 0.25, 0.43, Math.PI).wedge(0, -0.04, 0, 0.18, 0.07, 0.03, 0.04).pop();
    mb.color(ALR_PAL.glass).box(0, 0.31, 0.423, 0.15, 0.035, 0.006, 0.003);
    mb.color(ALR_PAL.glass).box(0.193, 0.3, 0.3, 0.004, 0.035, 0.07, 0).box(-0.193, 0.3, 0.3, 0.004, 0.035, 0.07, 0);
    mb.color(ALR_PAL.team, 1).box(0, 0.365, 0.3, 0.17, 0.008, 0.1, 0.004);
    mb.color(ALR_PAL.black).box(0, 0.18, 0.455, 0.12, 0.025, 0.008, 0.003);
    mb.color(ALR_PAL.light).box(0.15, 0.19, 0.452, 0.025, 0.018, 0.006, 0.003).box(-0.15, 0.19, 0.452, 0.025, 0.018, 0.006, 0.003);
    for (const s of [-1, 1]) mb.color(ALR_P1.fedDark).box(s * 0.2, 0.155, 0.27, 0.025, 0.012, 0.09, 0.004);
    // the bed + the launch mount
    mb.color(ALR_P1.fedDark).box(0, 0.17, -0.12, 0.2, 0.025, 0.3, 0.01);
    mb.color(ALR_PAL.team, 1).box(0.2, 0.17, -0.12, 0.006, 0.02, 0.28, 0).box(-0.2, 0.17, -0.12, 0.006, 0.02, 0.28, 0);
    mb.color(ALR_PAL.dark).box(0, 0.24, -0.3, 0.12, 0.05, 0.06, 0.012);
    mb.color(ALR_PAL.steel).box(0, 0.2, 0.04, 0.05, 0.02, 0.1, 0.008);
    mb.color(ALR_P1.fedDark).box(0.13, 0.23, -0.05, 0.05, 0.04, 0.06, 0.01);
    mb.color(ALR_PAL.dark).cyl(-0.15, 0.2, 0.17, 0.018, 0.42, 0.016, 6);
    p1StripesX(mb, -0.18, 0.18, 0.115, -0.44, 0.012, 6);
  },
  v3_rack(mb) {
    mb.color(ALR_PAL.dark).rod(0, 0, 0, 0.03, 0.2, 8);
    mb.push().at(0, 0, 0, 0, -0.436, 0);
    mb.color(ALR_P1.fedDark).box(0, 0.015, 0.28, 0.07, 0.015, 0.34, 0.006);
    for (const s of [-1, 1]) mb.color(ALR_P1.fed).box(s * 0.065, 0.045, 0.28, 0.01, 0.03, 0.33, 0.004);
    mb.color(ALR_PAL.team, 1).box(0.077, 0.045, 0.2, 0.003, 0.015, 0.16, 0).box(-0.077, 0.045, 0.2, 0.003, 0.015, 0.16, 0);
    for (let k = 0; k < 4; k++) mb.color(ALR_PAL.steel).box(0, 0.032, 0.0 + k * 0.18, 0.06, 0.004, 0.012, 0);
    // the hydraulic ram underneath
    mb.color(ALR_PAL.steel).box(0, -0.04, 0.26, 0.02, 0.04, 0.02, 0.004);
    mb.pop();
    mb.color(ALR_PAL.steel).box(0, 0.02, 0.0, 0.08, 0.03, 0.04, 0.008);
  },
  v3_rocket(mb) {
    mb.color(ALR_P1.white); p1CylZ(mb, 0, 0, -0.24, 0.042, 0.18, 0.042, 10, 0);
    mb.color(ALR_PAL.team, 1); p1CylZ(mb, 0, 0, 0.1, 0.044, 0.14, 0.044, 10, 0);
    mb.color(ALR_PAL.team, 1); p1CylZ(mb, 0, 0, -0.12, 0.044, -0.1, 0.044, 10, 0);
    mb.color(ALR_PAL.sauce); p1CylZ(mb, 0, 0, 0.18, 0.042, 0.3, 0.0, 10, 0);
    mb.color(ALR_PAL.dark); p1CylZ(mb, 0, 0, -0.29, 0.03, -0.24, 0.036, 10, 1);
    mb.color(ALR_PAL.light); p1CylZ(mb, 0, 0, -0.295, 0.022, -0.29, 0.022, 8, 1);
    for (let k = 0; k < 4; k++) { mb.push().at(0, 0, 0, 0, 0, k * Math.PI / 2 + Math.PI / 4); mb.color(ALR_PAL.dark); p1Fin(mb, [[-0.24, 0.04], [-0.15, 0.04], [-0.22, 0.1], [-0.27, 0.1]], 0, 0.008); mb.pop(); }
  },

  // 🐘 the APOCALYPSE FRYER: huge, double tread pods; apoc_turret at (0, 0.38, -0.04); apoc_gun at
  //    turret-local (0, 0.12, 0.2)
  apoc(mb) {
    for (const s of [-1, 1]) {
      for (const x of [0.29, 0.48]) p1Track(mb, s * x, -0.6, 0.6, 0.11, 0.085, ALR_P1.fed, 6);
      // the pod armor over both treads
      mb.color(ALR_P1.fed).box(s * 0.385, 0.26, 0, 0.19, 0.035, 0.6, 0.02);
      mb.color(ALR_P1.fedDark).box(s * 0.575, 0.16, 0, 0.012, 0.07, 0.56, 0.006);
      mb.color(ALR_PAL.team, 1).box(s * 0.385, 0.297, -0.15, 0.17, 0.006, 0.18, 0);
      mb.color(ALR_P1.fedDark).push().at(s * 0.385, 0.26, 0.62, Math.PI).wedge(0, 0, 0, 0.19, 0.035, 0.05, 0.05).pop();
      for (let k = 0; k < 4; k++) mb.color(ALR_PAL.dark).box(s * 0.385, 0.3, 0.2 + k * 0.1, 0.012, 0.006, 0.012, 0.003);
      // smoke stacks at the back
      mb.color(ALR_PAL.dark).cyl(s * 0.45, 0.29, -0.52, 0.035, 0.42, 0.03, 8);
      mb.color(ALR_PAL.black).cyl(s * 0.45, 0.42, -0.52, 0.025, 0.425, 0.025, 8, 2);
    }
    mb.color(ALR_P1.fed).box(0, 0.27, -0.05, 0.2, 0.11, 0.5, 0.04);
    mb.color(ALR_P1.fed).push().at(0, 0.27, 0.52, Math.PI).wedge(0, 0, 0, 0.2, 0.11, 0.1, 0.12).pop();
    mb.color(ALR_PAL.team, 1).box(0, 0.385, -0.42, 0.16, 0.008, 0.08, 0.004);
    mb.color(ALR_PAL.dark).box(0, 0.36, -0.55, 0.15, 0.03, 0.03, 0.01);
    mb.color(ALR_PAL.light).box(0.12, 0.23, 0.62, 0.03, 0.02, 0.006, 0.003).box(-0.12, 0.23, 0.62, 0.03, 0.02, 0.006, 0.003);
    mb.color(ALR_PAL.black).box(0, 0.31, 0.6, 0.08, 0.012, 0.01, 0);
  },
  apoc_turret(mb) {
    mb.color(ALR_P1.fedDark).cyl(0, 0, 0, 0.3, 0.05, 0.29, 12);
    mb.color(ALR_P1.fed).box(0, 0.12, -0.04, 0.24, 0.08, 0.3, 0.06);
    mb.color(ALR_P1.fed).push().at(0, 0.12, 0.27, Math.PI).wedge(0, 0, 0, 0.22, 0.08, 0.06, 0.06).pop();
    mb.color(ALR_PAL.team, 1).box(0, 0.205, -0.08, 0.2, 0.008, 0.22, 0.004);
    mb.color(ALR_PAL.dark).cyl(0.1, 0.2, -0.15, 0.06, 0.25, 0.055, 8);
    mb.color(ALR_PAL.glassLit).box(0.1, 0.23, -0.1, 0.03, 0.01, 0.008, 0);
    mb.color(ALR_P1.fedDark).box(0, 0.12, 0.27, 0.13, 0.065, 0.05, 0.02);
    // the AA missile pods on the flanks
    for (const s of [-1, 1]) {
      mb.color(ALR_P1.fedDark).box(s * 0.29, 0.13, -0.08, 0.055, 0.06, 0.13, 0.015);
      mb.color(ALR_PAL.team, 1).box(s * 0.346, 0.13, -0.08, 0.004, 0.03, 0.1, 0);
      for (const y of [0.105, 0.155]) for (const dx of [-0.022, 0.022]) { mb.color(ALR_PAL.black).rod(s * 0.29 + dx, y, 0.05, 0.016, 0.006, 6, 'z'); mb.color(ALR_PAL.sauce).rod(s * 0.29 + dx, y, 0.052, 0.01, 0.006, 6, 'z'); }
    }
    mb.color(ALR_PAL.dark).box(-0.12, 0.22, -0.28, 0.06, 0.025, 0.04, 0.008);
  },
  apoc_gun(mb) {
    mb.color(ALR_PAL.dark).box(0, 0, 0.02, 0.12, 0.05, 0.04, 0.012);
    for (const s of [-1, 1]) {
      const x = s * 0.07;
      mb.color(ALR_PAL.dark); p1CylZ(mb, x, 0, 0.04, 0.042, 0.16, 0.036, 10, 0);
      mb.color(ALR_PAL.dark).rod(x, 0, 0.36, 0.028, 0.42, 8, 'z');
      mb.color(ALR_PAL.black).rod(x, 0, 0.58, 0.04, 0.07, 8, 'z');
      mb.color(ALR_PAL.dark).box(x, 0, 0.59, 0.046, 0.014, 0.025, 0.004);
    }
  },

  // 💥 FLAK TRACK (half-track): the flak_head mount ring tops out at (0, 0.26, -0.12)
  flaktrack(mb) {
    for (const s of [-1, 1]) {
      p1Track(mb, s * 0.19, -0.4, 0.06, 0.075, 0.06, ALR_P1.fed, 4);
      p1Wheel(mb, s * 0.19, 0.075, 0.28, 0.075, 0.06);
      mb.color(ALR_P1.fedDark).box(s * 0.19, 0.17, 0.28, 0.07, 0.012, 0.1, 0.006);
    }
    mb.color(ALR_PAL.dark).box(0, 0.12, -0.05, 0.13, 0.03, 0.42, 0.01);
    // the armored body
    mb.color(ALR_P1.fed).box(0, 0.2, -0.13, 0.17, 0.06, 0.29, 0.02);
    mb.color(ALR_P1.fed).box(0, 0.22, 0.25, 0.13, 0.05, 0.13, 0.025);
    mb.color(ALR_P1.fed).push().at(0, 0.22, 0.39, Math.PI).wedge(0, 0, 0, 0.13, 0.05, 0.03, 0.05).pop();
    mb.color(ALR_P1.fedDark).box(0, 0.3, 0.13, 0.12, 0.04, 0.06, 0.015);
    mb.color(ALR_PAL.black).box(0, 0.31, 0.19, 0.09, 0.01, 0.004, 0);
    mb.color(ALR_PAL.team, 1).box(0.172, 0.21, -0.13, 0.004, 0.025, 0.25, 0).box(-0.172, 0.21, -0.13, 0.004, 0.025, 0.25, 0);
    mb.color(ALR_PAL.dark).box(0, 0.12, 0.4, 0.1, 0.025, 0.02, 0.006);
    mb.color(ALR_PAL.light).box(0.08, 0.24, 0.39, 0.018, 0.014, 0.006, 0.003).box(-0.08, 0.24, 0.39, 0.018, 0.014, 0.006, 0.003);
    // the mount ring
    mb.color(ALR_PAL.dark).cyl(0, 0.24, -0.12, 0.13, 0.26, 0.12, 12);
    mb.color(ALR_P1.fedDark).box(0, 0.25, -0.38, 0.14, 0.025, 0.025, 0.006);
  },

  // 🚜 the WAR HAULER (Federation harvester): same layout as harv (harv_drum at (0, 0.12, 0.52),
  //    harv_load at (0, 0.42, -0.2)); harvF_gun sits on the cab roof at (0, 0.5, 0.3)
  harvF(mb) {
    for (const s of [-1, 1]) {
      p1Track(mb, s * 0.27, -0.5, 0.38, 0.1, 0.08, ALR_P1.fedDark, 5);
      for (let k = 0; k < 4; k++) mb.color(ALR_PAL.steel).push().at(s * 0.36, 0.13, -0.38 + k * 0.22, 0, 0, s * 0.2).box(0, 0, 0, 0.006, 0.05, 0.06, 0.002).pop();
    }
    mb.color(ALR_PAL.dark).box(0, 0.2, -0.05, 0.2, 0.05, 0.47, 0.02);
    // the cab
    mb.color(ALR_P1.fed).box(0, 0.36, 0.3, 0.25, 0.14, 0.15, 0.035);
    mb.color(ALR_P1.fedDark).push().at(0, 0.38, 0.46, Math.PI).wedge(0, 0, 0, 0.24, 0.1, 0.03, 0.05).pop();
    mb.color(ALR_PAL.black).box(0, 0.43, 0.455, 0.2, 0.02, 0.008, 0);
    mb.color(ALR_PAL.glassLit).box(-0.12, 0.43, 0.46, 0.04, 0.008, 0.004, 0).box(0.12, 0.43, 0.46, 0.04, 0.008, 0.004, 0);
    mb.color(ALR_PAL.black).box(0.252, 0.42, 0.3, 0.004, 0.02, 0.1, 0).box(-0.252, 0.42, 0.3, 0.004, 0.02, 0.1, 0);
    mb.color(ALR_PAL.team, 1).box(0, 0.497, 0.3, 0.22, 0.005, 0.12, 0.003);
    mb.color(ALR_PAL.dark);
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const y of [0.28, 0.36]) mb.box(x, y, 0.452, 0.008, 0.008, 0.004, 0);
    mb.color(ALR_PAL.light).box(0.2, 0.3, 0.462, 0.028, 0.018, 0.005, 0.003).box(-0.2, 0.3, 0.462, 0.028, 0.018, 0.005, 0.003);
    // the bin
    mb.color(ALR_PAL.team, 1).box(0, 0.33, -0.22, 0.3, 0.14, 0.3, 0.03);
    mb.color(ALR_PAL.dark).box(0, 0.47, -0.22, 0.27, 0.012, 0.27, 0);
    mb.color(ALR_P1.fed);
    for (const s of [-1, 1]) { mb.box(s * 0.305, 0.33, -0.22, 0.012, 0.12, 0.27, 0.006); for (const z of [-0.42, -0.22, -0.02]) mb.color(ALR_PAL.dark).box(s * 0.32, 0.33, z, 0.006, 0.11, 0.012, 0); mb.color(ALR_P1.fed); }
    mb.color(ALR_PAL.gold).box(0, 0.47, -0.52, 0.3, 0.015, 0.012, 0);
    // the exhausts and the grab rails
    for (const s of [-1, 1]) { mb.color(ALR_PAL.dark).cyl(s * 0.2, 0.42, 0.13, 0.025, 0.66, 0.022, 6); mb.color(ALR_PAL.black).cyl(s * 0.2, 0.66, 0.13, 0.02, 0.665, 0.02, 6, 2); }
    mb.color(ALR_PAL.steel).box(0, 0.5, 0.15, 0.2, 0.008, 0.008, 0);
  },
  harvF_gun(mb) {
    mb.color(ALR_P1.fedDark).cyl(0, 0, 0, 0.07, 0.03, 0.065, 8);
    mb.color(ALR_P1.fed).box(0, 0.06, 0, 0.045, 0.03, 0.05, 0.012);
    mb.color(ALR_PAL.team, 1).box(0, 0.092, -0.01, 0.035, 0.004, 0.035, 0);
    for (const s of [-1, 1]) { mb.color(ALR_PAL.dark).rod(s * 0.018, 0.06, 0.12, 0.009, 0.14, 6, 'z'); mb.color(ALR_PAL.black).rod(s * 0.018, 0.06, 0.19, 0.012, 0.02, 6, 'z'); }
    mb.color(ALR_P1.fed).push().at(0, 0.07, 0.06, 0, -0.2, 0).box(0, 0, 0, 0.06, 0.035, 0.006, 0.003).pop();
  },

  // ✈️ the NUG JET: nose +z, ~0.95 long, 0.8 span, origin at the center of mass
  jet(mb) {
    const rings = [[0.45, 0.0], [0.41, 0.022], [0.33, 0.048], [0.2, 0.068], [0.05, 0.075], [-0.25, 0.072], [-0.4, 0.06], [-0.45, 0.055]];
    mb.push().scale(1, 0.85, 1);
    for (let k = 0; k < rings.length - 1; k++) { mb.color(k === 0 ? ALR_PAL.dark : ALR_P1.offWhite); p1CylZ(mb, 0, 0, rings[k + 1][0], rings[k + 1][1], rings[k][0], rings[k][1], 10, k === rings.length - 2 ? 1 : 0); }
    mb.pop();
    mb.color(ALR_PAL.team, 1); p1CylZ(mb, 0, 0, 0.26, 0.064, 0.29, 0.06, 10, 0);
    // the canopy
    mb.color(ALR_PAL.glass).push().at(0, 0.05, 0.19).scale(1, 1, 2.1).ball(0, 0, 0, 0.038, 8, 0.03).pop();
    mb.color(ALR_PAL.glassLit).push().at(0.012, 0.068, 0.2).scale(1, 1, 2).ball(0, 0, 0, 0.012, 5, 0.008).pop();
    // the wings, tailplanes and twin team tails
    for (const s of [-1, 1]) {
      mb.color(ALR_P1.offWhite); p1Slab(mb, [[s * 0.06, 0.12], [s * 0.4, -0.1], [s * 0.4, -0.17], [s * 0.06, -0.2]], -0.012, 0.016);
      mb.color(ALR_PAL.team, 1); p1Slab(mb, [[s * 0.3, -0.035], [s * 0.4, -0.1], [s * 0.4, -0.17], [s * 0.3, -0.17]], -0.003, 0.004);
      mb.color(ALR_P1.offWhite); p1Slab(mb, [[s * 0.05, -0.29], [s * 0.18, -0.4], [s * 0.18, -0.45], [s * 0.05, -0.44]], -0.005, 0.012);
      mb.push().at(s * 0.045, 0.03, 0, 0, 0, -s * 0.28);
      mb.color(ALR_PAL.team, 1); p1Fin(mb, [[-0.27, 0], [-0.41, 0.17], [-0.46, 0.17], [-0.44, 0]], 0, 0.012);
      mb.color(ALR_PAL.dark); p1Fin(mb, [[-0.405, 0.165], [-0.462, 0.165], [-0.465, 0.18], [-0.41, 0.18]], 0, 0.013);
      mb.pop();
      // intakes, nozzles
      mb.color(ALR_P1.allyDark).box(s * 0.07, -0.01, 0.06, 0.025, 0.035, 0.1, 0.01);
      mb.color(ALR_PAL.black).box(s * 0.07, -0.01, 0.161, 0.018, 0.026, 0.004, 0);
      mb.color(ALR_PAL.dark); p1CylZ(mb, s * 0.03, -0.005, -0.5, 0.032, -0.43, 0.04, 10, 0);
      mb.color(ALR_PAL.light); p1CylZ(mb, s * 0.03, -0.005, -0.49, 0.024, -0.485, 0.024, 8, 1);
      // a missile under each wing
      mb.color(ALR_PAL.dark).box(s * 0.24, -0.03, -0.06, 0.006, 0.012, 0.05, 0);
      mb.color(ALR_P1.white); p1CylZ(mb, s * 0.24, -0.055, -0.16, 0.017, 0.06, 0.017, 8, 1);
      mb.color(ALR_PAL.sauce); p1CylZ(mb, s * 0.24, -0.055, 0.06, 0.017, 0.11, 0.0, 8, 0);
      mb.color(ALR_PAL.dark); p1Slab(mb, [[s * 0.2, -0.16], [s * 0.28, -0.16], [s * 0.255, -0.12], [s * 0.225, -0.12]], -0.055, 0.004);
      mb.color(ALR_PAL.light).box(s * 0.4, -0.012, -0.135, 0.006, 0.008, 0.02, 0);
    }
  },

  // 🎈 the GRAVY BLIMP: a gravy boat that flies (~2.3 long, 0.9 across), origin at the envelope's
  //    center; the gondola hangs below; blimp_prop ×2 at (±0.44, -0.3, -0.63)
  blimp(mb) {
    // the envelope: a lofted gravy boat — fat body, a raised spout at the nose
    const N = 18, R = [], n = 16;
    for (let i = 0; i <= N; i++) {
      const t = -1 + 2 * i / N, z = t * 1.1;
      let r = 0.46 * Math.pow(Math.max(0, 1 - t * t), 0.45);
      if (t > 0) r *= 1 - 0.3 * t * t;
      const yo = t > 0.3 ? (t - 0.3) * (t - 0.3) * 0.45 : 0;
      R.push({ z, r, ry: r * 0.95, y: yo });
    }
    for (let i = 0; i < N; i++) {
      const a = R[i], b = R[i + 1];
      const band = i === 4 || i === 12;
      for (let j = 0; j < n; j++) {
        const t0 = j / n * Math.PI * 2, t1 = (j + 1) / n * Math.PI * 2;
        const P = (q, t) => [Math.cos(t) * q.r, q.y + Math.sin(t) * q.ry, q.z];
        if (band) mb.color(ALR_PAL.team, 1); else mb.color(j % 2 ? ALR_P1.gravy : ALR_P1.gravyLt, 0, i % 2 ? 1 : 0.94);
        mb.face([P(a, t0), P(b, t0), P(b, t1), P(a, t1)]);
      }
    }
    // the boat's lip around the waist + a drip
    mb.color(ALR_P1.white);
    for (let i = 2; i < N - 1; i++) {
      const a = R[i], b = R[i + 1];
      for (const s of [-1, 1]) alrPipe(mb, [s * (a.r + 0.012), a.y + 0.12, a.z], [s * (b.r + 0.012), b.y + 0.12, b.z], 0.02, ALR_P1.white);
    }
    mb.color(ALR_P1.gravy).ball(0.2, 0.0, 0.95, 0.03, 6, 0.06);
    // the spout: a tongue of gravy-boat rim curling up off the nose
    mb.color(ALR_P1.white); p1Slab(mb, [[-0.16, 0.7], [0.16, 0.7], [0.06, 1.12], [0, 1.2], [-0.06, 1.12]], 0.33, 0.035);
    mb.color(ALR_P1.gravyLt); p1Slab(mb, [[-0.13, 0.72], [0.13, 0.72], [0.05, 1.1], [-0.05, 1.1]], 0.352, 0.01);
    // the handle at the back
    let prev = null;
    for (let k = 0; k <= 8; k++) {
      const a = k / 8 * Math.PI, p = [0, 0.3 + Math.sin(a) * 0.28, -0.72 - (1 - Math.cos(a)) * 0.2];
      if (prev) alrPipe(mb, prev, p, 0.045, ALR_P1.gravyLt);
      prev = p;
    }
    // fins
    for (const roll of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      mb.push().at(0, 0, 0, 0, 0, roll);
      mb.color(ALR_P1.gravy); p1Fin(mb, [[-0.8, 0.2], [-1.12, 0.48], [-1.2, 0.48], [-1.1, 0.08]], 0, 0.025);
      mb.color(ALR_PAL.team, 1); p1Fin(mb, [[-1.08, 0.42], [-1.12, 0.48], [-1.2, 0.48], [-1.18, 0.42]], 0, 0.028);
      mb.pop();
    }
    // the gondola
    mb.color(ALR_PAL.dark).box(0, -0.44, 0.05, 0.08, 0.03, 0.3, 0.01);
    mb.color(ALR_P1.fed).box(0, -0.53, 0.05, 0.15, 0.08, 0.42, 0.04);
    mb.color(ALR_P1.fed).push().at(0, -0.53, 0.5, Math.PI).wedge(0, 0, 0, 0.13, 0.07, 0.05, 0.06).pop();
    mb.color(ALR_PAL.glassLit).box(0, -0.5, 0.53, 0.1, 0.03, 0.02, 0.005);
    mb.color(ALR_PAL.team, 1).box(0, -0.6, 0.05, 0.152, 0.015, 0.42, 0.004);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { mb.color(ALR_PAL.dark).box(s * 0.151, -0.51, -0.25 + k * 0.13, 0.004, 0.03, 0.035, 0); mb.color(k % 2 ? ALR_PAL.light : ALR_PAL.glass).box(s * 0.154, -0.51, -0.25 + k * 0.13, 0.003, 0.022, 0.026, 0); }
    mb.color(ALR_PAL.dark).box(0, -0.62, -0.1, 0.07, 0.02, 0.1, 0.005);
    mb.color(ALR_PAL.black).box(0, -0.645, -0.1, 0.05, 0.005, 0.08, 0);
    // the engine nacelles
    for (const s of [-1, 1]) {
      alrPipe(mb, [s * 0.15, -0.5, -0.45], [s * 0.44, -0.3, -0.45], 0.02, ALR_PAL.dark);
      alrPipe(mb, [s * 0.3, -0.12, -0.45], [s * 0.44, -0.3, -0.45], 0.015, ALR_PAL.dark);
      mb.color(ALR_P1.fedDark); p1CylZ(mb, s * 0.44, -0.3, -0.62, 0.05, -0.3, 0.06, 10, 3);
      mb.color(ALR_PAL.team, 1); p1CylZ(mb, s * 0.44, -0.3, -0.42, 0.062, -0.38, 0.062, 10, 0);
      mb.color(ALR_PAL.dark).ball(s * 0.44, -0.3, -0.3, 0.06, 8);
    }
  },
  blimp_prop(mb) {
    mb.color(ALR_PAL.dark); p1CylZ(mb, 0, 0, -0.03, 0.025, 0.02, 0.03, 8, 3);
    mb.color(ALR_PAL.steel); p1CylZ(mb, 0, 0, -0.07, 0.0, -0.03, 0.025, 8, 0);
    for (let k = 0; k < 3; k++) {
      mb.push().at(0, 0, 0, 0, 0, k * Math.PI * 2 / 3).at(0, 0.09, -0.01, 0.3, 0, 0);
      mb.color(ALR_PAL.wood).box(0, 0, 0, 0.022, 0.08, 0.005, 0.002);
      mb.color(ALR_PAL.team, 1).box(0, 0.07, 0, 0.022, 0.012, 0.006, 0);
      mb.pop();
    }
  },

  // 📦 the BONUS CRATE (~0.35)
  crate(mb) {
    const h = 0.17;
    mb.color(ALR_PAL.wood).box(0, h, 0, h, h, h, 0.012);
    mb.color('#5f4428');
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      mb.box(s * (h - 0.015), h, t * (h - 0.015), 0.02, h + 0.002, 0.02, 0.004);
      mb.box(0, h + s * (h - 0.015), t * (h - 0.015), h + 0.002, 0.02, 0.02, 0.004);
      mb.box(s * (h - 0.015), h + t * (h - 0.015), 0, 0.02, 0.02, h + 0.002, 0.004);
    }
    mb.color('#6b4d2e');
    for (const s of [-1, 1]) for (const k of [-1, 1]) { mb.box(k * 0.07, h, s * (h + 0.002), 0.002, h - 0.03, 0.002, 0); mb.box(s * (h + 0.002), h, k * 0.07, 0.002, h - 0.03, 0.002, 0); }
    mb.color(ALR_PAL.steel);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (h - 0.012), h + sy * (h - 0.012), sz * (h - 0.012), 0.03, 0.03, 0.03, 0.006);
    // the emblem on every side + the lid
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { mb.push().at(Math.sin(yaw) * (h + 0.005), h, Math.cos(yaw) * (h + 0.005), yaw); p1Glyph(mb, 1.05); mb.pop(); }
    mb.push().at(0, 2 * h + 0.005, 0, 0, -Math.PI / 2, 0); p1Glyph(mb, 1.05); mb.pop();
  },
};

// ---- bake ------------------------------------------------------------------------------------------------
function alrArtInitP1(A, mk) {
  for (const k of Object.keys(ALR_BUILD_ART_P1)) A.b[k] = mk(ALR_BUILD_ART_P1[k]);
  for (const k of Object.keys(ALR_UNIT_ART_P1)) A.u[k] = mk(ALR_UNIT_ART_P1[k]);
}
