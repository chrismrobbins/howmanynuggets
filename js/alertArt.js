// ---- 🚨 NUGGET ALERT — the art --------------------------------------------------------------------------
// Every model is built here from AlrMB primitives (beveled boxes, faceted cylinders, wedges), once, at
// start. Team-colored panels carry the team mask (AlrMB.color(hex, 1)): the shader swaps in the owner's
// color, keeping the panel's shading. Buildings are centered on their footprint (x ∈ ±w/2, z ∈ ±h/2,
// in tiles); units face +z. Moving parts are separate meshes (turrets, barrels, the crane, the dish,
// the factory door, the harvester drum) so alert.js can animate them.

const ALR_PAL = {
  pad: '#77746c', padDark: '#5d5b55', conc: '#a39e92', concDark: '#87827a', steel: '#7d868f', dark: '#3e434a',
  black: '#26292d', glass: '#2e5670', glassLit: '#9bd2ee', gold: '#e2a52c', goldDark: '#b97c18', sauce: '#b8361f',
  copper: '#c27a3f', light: '#ffe08a', team: '#d8d8d8', teamDark: '#a8a8a8', khaki: '#8d8a5c', olive: '#5d6638',
  breading: '#d99a3e', breadDark: '#a8692a', rubber: '#2a2a2a', sand: '#b9a77c', wood: '#7a5a38',
};
const alrArt = { ok: false };

// a rounded concrete foundation the size of the footprint
function alrPad(mb, w, h, y) {
  mb.color(ALR_PAL.padDark).box(0, (y || 0.05) - 0.02, 0, w / 2 - 0.02, 0.05, h / 2 - 0.02, 0.04);
  mb.color(ALR_PAL.pad).box(0, (y || 0.05) + 0.03, 0, w / 2 - 0.08, 0.03, h / 2 - 0.08, 0.02);
  // seams in the slab
  mb.color(ALR_PAL.padDark);
  for (let i = 1; i < w; i++) mb.box(-w / 2 + i, 0.105, 0, 0.012, 0.004, h / 2 - 0.1, 0);
  for (let j = 1; j < h; j++) mb.box(0, 0.105, -h / 2 + j, w / 2 - 0.1, 0.004, 0.012, 0);
}
// a row of windows on a face: along x at z, from x0 to x1
function alrWindowsX(mb, x0, x1, y, z, n, ww, hh, lit) {
  for (let k = 0; k < n; k++) {
    const x = x0 + (x1 - x0) * (n === 1 ? 0.5 : k / (n - 1));
    mb.color(ALR_PAL.dark).box(x, y, z, ww + 0.012, hh + 0.012, 0.012, 0.004);
    mb.color(lit && k % 2 ? ALR_PAL.glassLit : ALR_PAL.glass).box(x, y, z + Math.sign(z || 1) * 0.008, ww, hh, 0.01, 0.002);
  }
}
function alrWindowsZ(mb, z0, z1, y, x, n, ww, hh, lit) {
  for (let k = 0; k < n; k++) {
    const z = z0 + (z1 - z0) * (n === 1 ? 0.5 : k / (n - 1));
    mb.color(ALR_PAL.dark).box(x, y, z, 0.012, hh + 0.012, ww + 0.012, 0.004);
    mb.color(lit && k % 2 ? ALR_PAL.glassLit : ALR_PAL.glass).box(x + Math.sign(x || 1) * 0.008, y, z, 0.01, hh, ww, 0.002);
  }
}
// a pipe from a to b (straight, axis-aligned-ish)
function alrPipe(mb, a, b, r, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  mb.push();
  mb.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), Math.acos(alrUnit(dy / L)), 0);
  mb.color(col || ALR_PAL.steel).cyl(0, -L / 2, 0, r, L / 2, r, 8, 0);
  mb.pop();
}
function alrUnit(v) { return Math.max(-1, Math.min(1, v)); }
// a half cylinder lying along x (quonset huts, hangar roofs): center x,y(base),z, half length hl, radius r
function alrArch(mb, x, y, z, hl, r, n) {
  n = n || 10;
  const P = (t, xx) => [xx, y + Math.sin(t) * r, z + Math.cos(t) * r];
  for (let k = 0; k < n; k++) {
    const t0 = k / n * Math.PI, t1 = (k + 1) / n * Math.PI;
    mb.face([P(t0, x - hl), P(t0, x + hl), P(t1, x + hl), P(t1, x - hl)].reverse());
  }
  const capA = [], capB = [];
  for (let k = 0; k <= n; k++) { const t = k / n * Math.PI; capA.push(P(t, x + hl)); capB.push(P(t, x - hl)); }
  mb.face(capA.reverse()); mb.face(capB);
}
function alrLamp(mb, x, y, z) { mb.color(ALR_PAL.dark).cyl(x, 0.1, z, 0.012, y, 0.012, 6, 0); mb.color(ALR_PAL.light).box(x, y + 0.02, z, 0.03, 0.02, 0.03, 0.006); }

// ---- the buildings ------------------------------------------------------------------------------------
const ALR_BUILD_ART = {
  // 🍟 the FRY YARD (construction yard), 3×3
  hq(mb, P) {
    alrPad(mb, 3, 3);
    // the main hall
    mb.color(ALR_PAL.conc).box(-0.25, 0.42, 0.15, 0.95, 0.32, 0.78, 0.05);
    mb.color(ALR_PAL.team, 1).box(-0.25, 0.62, 0.15, 0.97, 0.05, 0.8, 0.015);
    mb.color(ALR_PAL.concDark).box(-0.25, 0.78, 0.15, 0.9, 0.04, 0.73, 0.02);
    alrWindowsX(mb, -1.0, 0.5, 0.4, 0.94, 6, 0.08, 0.07, true);
    alrWindowsZ(mb, -0.45, 0.75, 0.4, 0.71, 4, 0.08, 0.07, false);
    // the upper deck + the big nugget on the roof
    mb.color(ALR_PAL.steel).box(-0.45, 0.92, 0.25, 0.5, 0.11, 0.42, 0.04);
    mb.color(ALR_PAL.dark).box(-0.45, 1.05, 0.25, 0.44, 0.02, 0.36, 0.01);
    mb.color(ALR_PAL.breading).ball(-0.45, 1.22, 0.25, 0.24, 9, 0.17);
    mb.color(ALR_PAL.breadDark).ball(-0.3, 1.28, 0.32, 0.09, 6, 0.06);
    mb.color(ALR_PAL.breadDark).ball(-0.6, 1.2, 0.12, 0.08, 6, 0.06);
    // the control tower
    mb.color(ALR_PAL.concDark).cyl(0.9, 0.1, 0.85, 0.22, 0.9, 0.2, 10);
    mb.color(ALR_PAL.glass).cyl(0.9, 0.9, 0.85, 0.24, 1.05, 0.26, 10);
    mb.color(ALR_PAL.team, 1).cyl(0.9, 1.05, 0.85, 0.27, 1.11, 0.25, 10);
    mb.color(ALR_PAL.dark).cyl(0.9, 1.11, 0.85, 0.05, 1.32, 0.01, 6);
    // the fry vats out back
    for (const [x, z] of [[0.95, -0.55], [0.95, -1.05], [0.45, -1.05]]) {
      mb.color(ALR_PAL.steel).cyl(x, 0.1, z, 0.2, 0.45, 0.2, 12);
      mb.color(ALR_PAL.goldDark).cyl(x, 0.45, z, 0.17, 0.46, 0.17, 12);
      mb.color(ALR_PAL.dark).cyl(x, 0.46, z, 0.21, 0.5, 0.21, 12, 2);
    }
    alrPipe(mb, [0.95, 0.35, -0.55], [0.7, 0.35, -0.55], 0.03);
    alrPipe(mb, [0.45, 0.35, -1.05], [0.45, 0.35, -0.7], 0.03);
    // the crane's base (the crane itself turns: part 'crane')
    mb.color(ALR_PAL.dark).cyl(-1.05, 0.1, -1.0, 0.18, 0.3, 0.16, 8);
    alrLamp(mb, 1.35, 0.42, 1.35); alrLamp(mb, -1.35, 0.42, 1.35);
  },
  hq_crane(mb) {
    mb.color(ALR_PAL.gold).box(0, 0.75, 0, 0.05, 0.45, 0.05, 0.01);
    mb.color(ALR_PAL.dark).box(0, 0.75, 0, 0.055, 0.02, 0.055, 0);
    mb.color(ALR_PAL.gold).box(0, 1.22, 0.38, 0.035, 0.035, 0.62, 0.008);
    mb.color(ALR_PAL.dark).box(0, 1.22, -0.36, 0.08, 0.06, 0.1, 0.01);
    mb.color(ALR_PAL.dark).box(0, 0.95, 0.85, 0.004, 0.27, 0.004, 0);
    mb.color(ALR_PAL.steel).box(0, 0.67, 0.85, 0.04, 0.02, 0.04, 0.01);
  },
  // ⚡ the GREASE PLANT (power), 2×2
  power(mb) {
    alrPad(mb, 2, 2);
    for (const [x, z] of [[-0.42, -0.38], [0.38, 0.4]]) {
      mb.color(ALR_PAL.conc).cyl(x, 0.1, z, 0.42, 0.45, 0.31, 14);
      mb.color(ALR_PAL.conc).cyl(x, 0.45, z, 0.31, 0.88, 0.3, 14, 0);
      mb.color(ALR_PAL.team, 1).cyl(x, 0.62, z, 0.315, 0.7, 0.315, 14, 0);
      mb.color(ALR_PAL.concDark).cyl(x, 0.88, z, 0.3, 1.0, 0.34, 14, 0);
      mb.color(ALR_PAL.black).cyl(x, 0.99, z, 0.3, 1.0, 0.3, 14, 2);
    }
    mb.color(ALR_PAL.concDark).box(0.42, 0.28, -0.45, 0.4, 0.18, 0.32, 0.03);
    mb.color(ALR_PAL.team, 1).box(0.42, 0.42, -0.45, 0.41, 0.03, 0.33, 0.01);
    alrWindowsX(mb, 0.15, 0.7, 0.26, -0.12, 3, 0.06, 0.05, true);
    alrPipe(mb, [-0.05, 0.3, -0.4], [0.05, 0.3, -0.4], 0.05);
    alrPipe(mb, [0.38, 0.3, 0.0], [0.38, 0.3, -0.1], 0.05);
    // the transformer
    mb.color(ALR_PAL.dark).box(-0.55, 0.2, 0.55, 0.22, 0.1, 0.18, 0.02);
    for (let k = 0; k < 3; k++) mb.color(ALR_PAL.copper).cyl(-0.7 + k * 0.15, 0.3, 0.55, 0.025, 0.42, 0.02, 6);
  },
  // 🥫 the SAUCE REFINERY, 3×3 (the dock is the open apron on +z)
  refinery(mb) {
    alrPad(mb, 3, 3);
    mb.color(ALR_PAL.padDark).box(0.55, 0.11, 1.0, 0.62, 0.012, 0.42, 0.01);
    for (let k = 0; k < 5; k++) mb.color(ALR_PAL.gold).box(0.08 + k * 0.24, 0.125, 1.38, 0.06, 0.005, 0.025, 0);
    // the processing hall
    mb.color(ALR_PAL.conc).box(-0.35, 0.4, -0.25, 0.85, 0.3, 0.75, 0.05);
    mb.color(ALR_PAL.team, 1).box(-0.35, 0.58, -0.25, 0.87, 0.04, 0.77, 0.012);
    mb.color(ALR_PAL.steel).wedge(-0.35, 0.82, -0.25, 0.85, 0.12, 0.75, 0.18);
    alrWindowsX(mb, -1.05, 0.35, 0.36, 0.51, 5, 0.07, 0.06, true);
    // the unloading bay facing the dock
    mb.color(ALR_PAL.black).box(0.2, 0.3, 0.52, 0.28, 0.2, 0.02, 0.01);
    mb.color(ALR_PAL.gold).box(0.2, 0.52, 0.53, 0.32, 0.025, 0.03, 0.005);
    // the sauce silos
    for (const [x, z, r] of [[0.95, -0.8, 0.3], [0.95, -0.1, 0.27], [1.05, 0.55, 0.22]]) {
      mb.color(ALR_PAL.sauce).cyl(x, 0.1, z, r, 0.85, r, 14);
      mb.color(ALR_PAL.steel).cyl(x, 0.85, z, r, 0.95, r * 0.55, 14);
      mb.color(ALR_PAL.team, 1).cyl(x, 0.5, z, r + 0.008, 0.56, r + 0.008, 14, 0);
      mb.color(ALR_PAL.dark).cyl(x, 0.95, z, 0.04, 1.02, 0.04, 6);
    }
    alrPipe(mb, [0.65, 0.7, -0.8], [0.5, 0.7, -0.8], 0.04);
    alrPipe(mb, [0.68, 0.7, -0.1], [0.5, 0.7, -0.1], 0.04);
    // the chimney
    mb.color(ALR_PAL.concDark).cyl(-0.95, 0.9, -0.75, 0.1, 1.45, 0.08, 8);
    mb.color(ALR_PAL.team, 1).cyl(-0.95, 1.3, -0.75, 0.085, 1.36, 0.085, 8, 0);
    alrLamp(mb, -1.3, 0.4, 1.3); alrLamp(mb, 1.35, 0.4, 1.32);
  },
  // 🪖 the BOOT CAMP (barracks), 2×2
  barracks(mb) {
    alrPad(mb, 2, 2);
    mb.color(ALR_PAL.olive); alrArch(mb, -0.1, 0.1, -0.15, 0.62, 0.42, 12);
    mb.color(ALR_PAL.team, 1).box(-0.1, 0.32, 0.27, 0.64, 0.035, 0.012, 0.005);
    mb.color(ALR_PAL.dark).box(-0.1, 0.24, 0.29, 0.13, 0.14, 0.012, 0.005);
    mb.color(ALR_PAL.light).box(-0.1, 0.42, 0.3, 0.05, 0.02, 0.01, 0.004);
    // sandbags
    mb.color(ALR_PAL.sand);
    for (let k = 0; k < 7; k++) { mb.box(-0.85 + k * 0.13, 0.15, 0.78, 0.06, 0.04, 0.045, 0.02); mb.box(-0.79 + k * 0.13, 0.22, 0.78, 0.06, 0.035, 0.04, 0.02); }
    for (let k = 0; k < 4; k++) mb.box(0.8, 0.15, 0.3 + k * 0.13, 0.045, 0.04, 0.06, 0.02);
    // the flagpole (the flag waves: part 'flag')
    mb.color(ALR_PAL.steel).cyl(0.72, 0.1, -0.65, 0.016, 1.15, 0.012, 6);
    mb.color(ALR_PAL.gold).ball(0.72, 1.17, -0.65, 0.03, 6);
    // ammo crates
    mb.color(ALR_PAL.wood).box(0.65, 0.17, 0.05, 0.1, 0.07, 0.08, 0.01).box(0.68, 0.3, 0.06, 0.08, 0.06, 0.07, 0.01);
  },
  barracks_flag(mb) {
    mb.color(ALR_PAL.team, 1);
    for (let k = 0; k < 4; k++) mb.box(0.045 + k * 0.08, 0, 0, 0.042, 0.11, 0.006, 0);
    mb.color(ALR_PAL.gold).ball(0.18, 0, 0.008, 0.035, 6, 0.028);
  },
  // 🏭 the TANK FRYER (war factory), 3×3 — the door opens on +z
  factory(mb) {
    alrPad(mb, 3, 3);
    mb.color(ALR_PAL.conc).box(0, 0.45, -0.15, 1.3, 0.35, 0.95, 0.05);
    mb.color(ALR_PAL.steel); alrArch(mb, 0, 0.8, -0.15, 1.25, 0.6, 14);
    mb.color(ALR_PAL.team, 1).box(0, 0.68, -0.15, 1.32, 0.045, 0.97, 0.014);
    for (const x of [-0.7, 0, 0.7]) { mb.color(ALR_PAL.dark).cyl(x, 1.3, -0.2, 0.09, 1.5, 0.08, 8); mb.color(ALR_PAL.black).cyl(x, 1.5, -0.2, 0.06, 1.52, 0.06, 8, 2); }
    // the door frame + the opening
    mb.color(ALR_PAL.concDark).box(0, 0.48, 0.82, 0.62, 0.4, 0.04, 0.02);
    mb.color(ALR_PAL.black).box(0, 0.42, 0.84, 0.52, 0.32, 0.03, 0.01);
    mb.color(ALR_PAL.gold);
    for (let k = 0; k < 6; k++) mb.box(-0.5 + k * 0.2, 0.86, 0.87, 0.05, 0.02, 0.01, 0);
    alrWindowsZ(mb, -0.8, 0.5, 0.45, 1.31, 4, 0.07, 0.06, true);
    alrWindowsZ(mb, -0.8, 0.5, 0.45, -1.31, 4, 0.07, 0.06, false);
    // the ramp
    mb.color(ALR_PAL.padDark).wedge(0, 0.12, 1.15, 0.5, 0.03, 0.3, 0.0);
    alrLamp(mb, -0.75, 0.55, 1.2); alrLamp(mb, 0.75, 0.55, 1.2);
  },
  factory_door(mb) {
    mb.color(ALR_PAL.steel).box(0, 0, 0, 0.52, 0.32, 0.02, 0.01);
    mb.color(ALR_PAL.dark);
    for (let k = 0; k < 5; k++) mb.box(0, -0.24 + k * 0.12, 0.022, 0.5, 0.008, 0.005, 0);
    mb.color(ALR_PAL.team, 1).box(0, 0.2, 0.024, 0.3, 0.04, 0.004, 0);
  },
  // 📡 the SAUCE RADAR, 2×2
  radar(mb) {
    alrPad(mb, 2, 2);
    mb.color(ALR_PAL.conc).box(-0.2, 0.32, 0.2, 0.62, 0.22, 0.55, 0.04);
    mb.color(ALR_PAL.team, 1).box(-0.2, 0.5, 0.2, 0.64, 0.04, 0.57, 0.012);
    alrWindowsX(mb, -0.7, 0.3, 0.3, 0.76, 4, 0.07, 0.05, true);
    mb.color(ALR_PAL.steel).box(-0.2, 0.6, 0.2, 0.45, 0.06, 0.4, 0.02);
    mb.color(ALR_PAL.dark).cyl(0.45, 0.1, -0.45, 0.16, 0.7, 0.1, 8);
    mb.color(ALR_PAL.steel).cyl(0.45, 0.7, -0.45, 0.14, 0.78, 0.14, 8);
    for (let k = 0; k < 3; k++) mb.color(ALR_PAL.dark).cyl(-0.7 + k * 0.12, 0.62, -0.1, 0.008, 0.95, 0.006, 4, 0);
  },
  radar_dish(mb) {
    mb.color(ALR_PAL.dark).box(0, 0.06, 0, 0.05, 0.06, 0.05, 0.01);
    mb.push().at(0, 0.18, 0.02, 0, -0.55, 0);
    mb.color(ALR_PAL.conc).cyl(0, -0.02, 0, 0.06, 0.08, 0.36, 14, 1);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.08, 0, 0.36, 0.095, 0.37, 14, 0);
    mb.color(ALR_PAL.dark).cyl(0, 0.0, 0, 0.012, 0.25, 0.012, 4, 0);
    mb.color(ALR_PAL.light).ball(0, 0.26, 0, 0.025, 6);
    mb.pop();
  },
  // 🔫 the NUG GUN (turret), 1×1
  turret(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.05, 0, 0.47, 0.05, 0.47, 0.03);
    mb.color(ALR_PAL.concDark).cyl(0, 0.1, 0, 0.38, 0.32, 0.33, 8);
    mb.color(ALR_PAL.team, 1).cyl(0, 0.24, 0, 0.345, 0.28, 0.335, 8, 0);
  },
  turret_head(mb) {
    mb.color(ALR_PAL.steel).cyl(0, 0, 0, 0.24, 0.1, 0.22, 10);
    mb.color(ALR_PAL.steel).box(0, 0.16, 0.02, 0.18, 0.09, 0.2, 0.04);
    mb.color(ALR_PAL.team, 1).box(0, 0.22, -0.05, 0.16, 0.03, 0.1, 0.01);
    mb.color(ALR_PAL.dark).box(0, 0.16, 0.24, 0.1, 0.06, 0.04, 0.01);
    mb.color(ALR_PAL.dark).rod(0.05, 0.16, 0.42, 0.025, 0.34, 8, 'z').rod(-0.05, 0.16, 0.42, 0.025, 0.34, 8, 'z');
  },
  // ⚡ the TESLA FRYER, 1×1
  tesla(mb) {
    mb.color(ALR_PAL.padDark).box(0, 0.05, 0, 0.47, 0.05, 0.47, 0.03);
    mb.color(ALR_PAL.dark).cyl(0, 0.1, 0, 0.36, 0.3, 0.28, 8);
    for (let k = 0; k < 4; k++) mb.color(ALR_PAL.dark).box(Math.cos(k * 1.571) * 0.3, 0.28, Math.sin(k * 1.571) * 0.3, 0.05, 0.18, 0.05, 0.01);
    mb.color(ALR_PAL.steel).cyl(0, 0.3, 0, 0.13, 1.25, 0.08, 8);
    for (let k = 0; k < 6; k++) {
      const y = 0.42 + k * 0.13, r = 0.2 - k * 0.018;
      mb.color(ALR_PAL.copper).cyl(0, y, 0, r, y + 0.05, r, 12);
    }
    mb.color(ALR_PAL.team, 1).cyl(0, 0.3, 0, 0.29, 0.36, 0.27, 8, 0);
    mb.color(ALR_PAL.steel).ball(0, 1.33, 0, 0.13, 10);
  },
};

// ---- the units ------------------------------------------------------------------------------------------
const ALR_UNIT_ART = {
  // a nugget soldier: the body is the nugget, the helmet and the vest are the team
  inf(mb, kind) {
    mb.color(ALR_PAL.breading).ball(0, 0.25, 0, 0.1, 8, 0.12);
    mb.color(ALR_PAL.breadDark).ball(0.05, 0.3, 0.06, 0.035, 5, 0.028).ball(-0.06, 0.2, 0.05, 0.03, 5);
    mb.color(ALR_PAL.team, 1).box(0, 0.23, 0, 0.105, 0.06, 0.09, 0.03);
    mb.color(ALR_PAL.team, 1).ball(0, 0.37, 0, 0.075, 8, 0.045);
    mb.color(ALR_PAL.team, 1, 0.8).box(0, 0.345, 0.04, 0.08, 0.008, 0.05, 0.004);
    mb.color(ALR_PAL.black).box(0.03, 0.32, 0.085, 0.012, 0.01, 0.006, 0).box(-0.03, 0.32, 0.085, 0.012, 0.01, 0.006, 0);
    // arms forward on the weapon
    mb.color(ALR_PAL.breading).box(0.09, 0.24, 0.06, 0.025, 0.025, 0.06, 0.01).box(-0.07, 0.24, 0.08, 0.025, 0.025, 0.06, 0.01);
    if (kind === 'rocket') {
      mb.color(ALR_PAL.olive).rod(0.07, 0.36, 0.0, 0.035, 0.42, 8, 'z');
      mb.color(ALR_PAL.dark).rod(0.07, 0.36, 0.21, 0.04, 0.03, 8, 'z');
      mb.color(ALR_PAL.sauce).ball(0.07, 0.36, 0.23, 0.028, 6);
    } else {
      mb.color(ALR_PAL.black).box(0.02, 0.25, 0.16, 0.012, 0.02, 0.1, 0.004);
      mb.color(ALR_PAL.wood).box(0.02, 0.24, 0.05, 0.014, 0.025, 0.035, 0.004);
    }
  },
  inf_leg(mb) { mb.color(ALR_PAL.olive).box(0, -0.06, 0, 0.026, 0.06, 0.026, 0.008); mb.color(ALR_PAL.black).box(0, -0.12, 0.012, 0.028, 0.012, 0.04, 0.005); },
  // the BREADED TANK: a light tank
  tank(mb) {
    for (const s of [-1, 1]) {
      mb.color(ALR_PAL.rubber).box(s * 0.25, 0.1, 0, 0.075, 0.08, 0.42, 0.04);
      for (let k = 0; k < 5; k++) mb.color(ALR_PAL.dark).rod(s * 0.25, 0.09, -0.32 + k * 0.16, 0.06, 0.16, 8);
      mb.color(ALR_PAL.olive).box(s * 0.25, 0.2, 0, 0.085, 0.015, 0.44, 0.008);
    }
    mb.color(ALR_PAL.olive).box(0, 0.2, -0.05, 0.19, 0.08, 0.36, 0.03);
    mb.color(ALR_PAL.team, 1).wedge(0, 0.21, 0.3, 0.19, 0.07, 0.1, -0.05);
    mb.color(ALR_PAL.team, 1).box(0, 0.285, -0.12, 0.17, 0.012, 0.22, 0.006);
    mb.color(ALR_PAL.dark).box(0, 0.26, -0.36, 0.15, 0.04, 0.04, 0.01);
    mb.color(ALR_PAL.light).box(0.14, 0.24, 0.41, 0.025, 0.018, 0.01, 0.004).box(-0.14, 0.24, 0.41, 0.025, 0.018, 0.01, 0.004);
  },
  tank_turret(mb) {
    mb.color(ALR_PAL.olive).cyl(0, 0, 0, 0.17, 0.1, 0.14, 8);
    mb.color(ALR_PAL.team, 1).box(0, 0.1, -0.02, 0.13, 0.04, 0.14, 0.03);
    mb.color(ALR_PAL.dark).cyl(-0.07, 0.12, -0.06, 0.045, 0.16, 0.04, 8);
    mb.color(ALR_PAL.olive).box(0, 0.07, 0.15, 0.06, 0.045, 0.04, 0.01);
  },
  tank_gun(mb) { mb.color(ALR_PAL.dark).rod(0, 0, 0.17, 0.022, 0.34, 8, 'z'); mb.color(ALR_PAL.black).rod(0, 0, 0.35, 0.03, 0.05, 8, 'z'); },
  // the DEEP FRYER: the heavy tank, twin guns
  heavy(mb) {
    for (const s of [-1, 1]) {
      mb.color(ALR_PAL.rubber).box(s * 0.31, 0.11, 0, 0.09, 0.09, 0.5, 0.045);
      for (let k = 0; k < 6; k++) mb.color(ALR_PAL.dark).rod(s * 0.31, 0.1, -0.4 + k * 0.16, 0.068, 0.19, 8);
      mb.color(ALR_PAL.khaki).box(s * 0.31, 0.225, 0, 0.1, 0.018, 0.52, 0.01);
      mb.color(ALR_PAL.dark).box(s * 0.31, 0.15, 0, 0.1, 0.05, 0.12, 0.01);
    }
    mb.color(ALR_PAL.khaki).box(0, 0.23, -0.05, 0.23, 0.1, 0.44, 0.04);
    mb.color(ALR_PAL.team, 1).wedge(0, 0.24, 0.38, 0.23, 0.09, 0.12, -0.07);
    mb.color(ALR_PAL.team, 1).box(0, 0.335, -0.18, 0.2, 0.012, 0.24, 0.006);
    mb.color(ALR_PAL.dark).box(0.12, 0.33, -0.44, 0.06, 0.05, 0.04, 0.01).box(-0.12, 0.33, -0.44, 0.06, 0.05, 0.04, 0.01);
  },
  heavy_turret(mb) {
    mb.color(ALR_PAL.khaki).cyl(0, 0, 0, 0.22, 0.12, 0.18, 10);
    mb.color(ALR_PAL.team, 1).box(0, 0.12, -0.03, 0.17, 0.05, 0.18, 0.04);
    mb.color(ALR_PAL.dark).cyl(0.08, 0.15, -0.08, 0.05, 0.2, 0.045, 8);
    mb.color(ALR_PAL.khaki).box(0, 0.09, 0.18, 0.12, 0.05, 0.05, 0.015);
  },
  heavy_gun(mb) {
    for (const s of [-1, 1]) { mb.color(ALR_PAL.dark).rod(s * 0.055, 0, 0.2, 0.022, 0.4, 8, 'z'); mb.color(ALR_PAL.black).rod(s * 0.055, 0, 0.41, 0.03, 0.05, 8, 'z'); }
  },
  // the SAUCE HAULER: the harvester
  harv(mb) {
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      mb.color(ALR_PAL.rubber).rod(s * 0.27, 0.11, -0.32 + k * 0.27, 0.11, 0.1, 10);
      mb.color(ALR_PAL.steel).rod(s * 0.32, 0.11, -0.32 + k * 0.27, 0.05, 0.012, 8);
    }
    mb.color(ALR_PAL.dark).box(0, 0.17, 0, 0.22, 0.05, 0.5, 0.02);
    // the cab
    mb.color(ALR_PAL.gold).box(0, 0.33, 0.3, 0.24, 0.13, 0.15, 0.04);
    mb.color(ALR_PAL.glass).box(0, 0.39, 0.45, 0.2, 0.05, 0.012, 0.004);
    mb.color(ALR_PAL.glass).box(0.245, 0.39, 0.3, 0.008, 0.05, 0.1, 0.003).box(-0.245, 0.39, 0.3, 0.008, 0.05, 0.1, 0.003);
    mb.color(ALR_PAL.team, 1).box(0, 0.47, 0.3, 0.22, 0.012, 0.13, 0.006);
    mb.color(ALR_PAL.light).box(0.17, 0.3, 0.455, 0.03, 0.02, 0.006, 0.003).box(-0.17, 0.3, 0.455, 0.03, 0.02, 0.006, 0.003);
    // the bin
    mb.color(ALR_PAL.team, 1).box(0, 0.33, -0.2, 0.27, 0.13, 0.3, 0.03);
    mb.color(ALR_PAL.dark).box(0, 0.47, -0.2, 0.24, 0.012, 0.27, 0);
    mb.color(ALR_PAL.gold).box(0.27, 0.33, -0.2, 0.004, 0.03, 0.26, 0);
    mb.color(ALR_PAL.dark).cyl(-0.18, 0.46, 0.18, 0.025, 0.62, 0.02, 6);
  },
  harv_drum(mb) {
    mb.color(ALR_PAL.steel).rod(0, 0, 0, 0.09, 0.46, 10);
    mb.color(ALR_PAL.dark);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mb.box(0, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0.23, 0.012, 0.012, 0); }
  },
  harv_load(mb) {
    mb.color(ALR_PAL.gold);
    for (let k = 0; k < 9; k++) mb.ball(-0.16 + (k % 3) * 0.16, 0, -0.16 + ((k / 3) | 0) * 0.16, 0.085, 5, 0.06);
  },
};

// ---- scenery ------------------------------------------------------------------------------------------
function alrTreeMesh(mb, kind, seed) {
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g1 = ['#2f5a24', '#3b6a2a', '#2a4e22'][seed % 3], g2 = ['#4a7a30', '#56843a', '#3f6e2c'][seed % 3];
  mb.color('#5a4128').cyl(0, 0, 0, 0.06, 0.4, 0.045, 6);
  if (kind === 0) {
    for (let k = 0; k < 4; k++) { const y = 0.25 + k * 0.22, rr = 0.36 - k * 0.07; mb.color(k % 2 ? g2 : g1).cyl(0, y, 0, rr, y + 0.34, 0.02, 8); }
  } else {
    for (let k = 0; k < 6; k++) { const a = r() * 6.283, d = r() * 0.18; mb.color(k % 2 ? g2 : g1).ball(Math.cos(a) * d, 0.55 + r() * 0.25, Math.sin(a) * d, 0.2 + r() * 0.1, 7, 0.16 + r() * 0.08); }
  }
}
function alrRockMesh(mb, seed) {
  let s = seed * 7919 + 13; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 4; k++) {
    const g = ['#7d7a72', '#8e8a80', '#6c6a64'][k % 3];
    mb.color(g).push().at((r() - 0.5) * 0.4, 0.05, (r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
    mb.box(0, 0.08, 0, 0.12 + r() * 0.16, 0.08 + r() * 0.14, 0.1 + r() * 0.14, 0.04);
    mb.pop();
  }
}
// the ore: gold crystals ("sauce gems"), three densities
function alrOreMesh(mb, level, seed) {
  let s = seed * 4513 + 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = [3, 6, 10][level];
  for (let k = 0; k < n; k++) {
    const x = (r() - 0.5) * 0.8, z = (r() - 0.5) * 0.8, h = 0.06 + r() * 0.1 + level * 0.02;
    mb.color(r() < 0.3 ? ALR_PAL.goldDark : r() < 0.5 ? '#f0c040' : ALR_PAL.gold);
    mb.push().at(x, 0, z, r() * 6, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6);
    mb.cyl(0, 0, 0, h * 0.55, h, h * 0.55, 4, 0);
    mb.cyl(0, h, 0, h * 0.55, h * 1.8, 0.0, 4, 0);
    mb.pop();
  }
}

// ---- the terrain texture ------------------------------------------------------------------------------
// ppt pixels per tile. Grass in three greens over value noise, dirt clearings where the bases sit and a
// worn track between them, a few darker patches, tiny stones and flowers.
function alrNoise(seed) {
  const P = new Uint8Array(512); let s = seed * 2654435761 >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const perm = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const val = new Float32Array(256).map(() => r());
  const lerp = (a, b, t) => a + (b - a) * t, fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
    const h = (i, j) => val[P[(P[(xi + i) & 255] + yi + j) & 255]];
    return lerp(lerp(h(0, 0), h(1, 0), xf), lerp(h(0, 1), h(1, 1), xf), yf);
  };
}
function alrTerrainCanvas(M, ppt) {
  // Temperate ground the way the pre-rendered RTS maps painted it: muted olive grass broken into lush and dry
  // patches (domain-warped noise, so the shapes are organic, not blobs), bare earth with ragged edges and a
  // band of thinning, yellowed grass round it, rutted tyre tracks, scattered stones on the earth only.
  const N = M.N, S = N * ppt, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const n1 = alrNoise(M.seed), n2 = alrNoise(M.seed + 7), n3 = alrNoise(M.seed + 13), n4 = alrNoise(M.seed + 21), n5 = alrNoise(M.seed + 29);
  const img = g.createImageData(S, S), d = img.data;
  const dirt = M.dirt;             // Float32Array N*N: 0 grass … 1 bare earth
  const dAt = (x, y) => {
    const fx = x / ppt - 0.5, fy = y / ppt - 0.5, ix = Math.max(0, Math.min(N - 2, Math.floor(fx))), iy = Math.max(0, Math.min(N - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - ix)), ty = Math.max(0, Math.min(1, fy - iy));
    const a = dirt[iy * N + ix], b = dirt[iy * N + ix + 1], c = dirt[(iy + 1) * N + ix], e = dirt[(iy + 1) * N + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
  };
  const mix3 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
  const GRASS = [84, 98, 50], LUSH = [58, 80, 38], DRY = [124, 118, 70], EARTH = [116, 97, 72], DAMP = [88, 74, 56], SAND = [146, 128, 96];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / ppt, v = y / ppt;
    // domain warp: bend the sample point by low noise so patch outlines meander
    const wu = u + (n4(u * 0.18, v * 0.18) - 0.5) * 6, wv = v + (n5(u * 0.18 + 9, v * 0.18) - 0.5) * 6;
    const big = n1(wu * 0.1, wv * 0.1), mid = n2(wu * 0.42, wv * 0.42), fine = n3(u * 2.6, v * 2.6), clump = n3(u * 7.5 + 3, v * 7.5);
    let c = mix3(GRASS, LUSH, Math.max(0, Math.min(1, (mid - 0.45) * 2.6)));
    c = mix3(c, DRY, Math.max(0, Math.min(1, (big - 0.58) * 3.2)) * 0.85);
    const cl = (clump - 0.5) * 18 + (fine - 0.5) * 12;
    c = [c[0] + cl * 0.8, c[1] + cl, c[2] + cl * 0.5];
    // earth, with a ragged edge and a fringe of thinning grass
    let k = dAt(x, y) + (mid - 0.5) * 0.42 + (fine - 0.5) * 0.25 + (clump - 0.5) * 0.12;
    const fringe = Math.max(0, 1 - Math.abs(k - 0.3) / 0.12);
    k = Math.max(0, Math.min(1, (k - 0.3) * 3.2));
    let e = mix3(EARTH, DAMP, Math.max(0, Math.min(1, (n2(u * 0.9 + 5, v * 0.9) - 0.55) * 3)));
    e = mix3(e, SAND, Math.max(0, Math.min(1, (big - 0.62) * 3)) * 0.7);
    const eg = (fine - 0.5) * 16;
    e = [e[0] + eg, e[1] + eg * 0.9, e[2] + eg * 0.7];
    c = mix3(c, DRY, fringe * 0.45);
    c = mix3(c, e, k);
    const gr = (Math.random() - 0.5) * 8;
    const o = (y * S + x) * 4;
    d[o] = Math.max(0, Math.min(255, c[0] + gr)); d[o + 1] = Math.max(0, Math.min(255, c[1] + gr)); d[o + 2] = Math.max(0, Math.min(255, c[2] + gr * 0.6)); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  let s = M.seed * 31 + 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // stones on the earth; darker tufts on the grass (no confetti)
  for (let k = 0; k < N * N * 0.5; k++) {
    const x = r() * S, y = r() * S, dd = dAt(x, y);
    if (dd > 0.35 && r() < 0.6) {
      const v = 95 + r() * 55, rx = 0.6 + r() * 1.4;
      g.fillStyle = 'rgba(40,32,24,0.35)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.6, rx, rx * 0.7, 0, 0, 7); g.fill();
      g.fillStyle = `rgba(${v},${v * 0.96},${v * 0.9},0.75)`; g.beginPath(); g.ellipse(x, y, rx, rx * 0.7, r() * 3, 0, 7); g.fill();
    } else if (dd < 0.2) {
      g.strokeStyle = r() < 0.5 ? 'rgba(34,52,22,0.45)' : 'rgba(140,140,80,0.3)'; g.lineWidth = 0.8;
      for (let b = 0; b < 4; b++) { g.beginPath(); g.moveTo(x + b * 0.7, y); g.lineTo(x + b * 0.7 + (r() - 0.5) * 3, y - 2 - r() * 3); g.stroke(); }
    }
  }
  // rutted tyre tracks along the worn path: twin ruts, dark in the groove, a pale crushed ridge between
  for (const path of M.tracks || []) for (const off of [-0.2, 0.2]) {
    for (const [w, col] of [[ppt * 0.13, 'rgba(70,54,38,0.28)'], [ppt * 0.05, 'rgba(60,46,32,0.35)']]) {
      g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round';
      g.beginPath();
      path.forEach(([px, pz], i) => { const j = (n3(px * 3, pz * 3) - 0.5) * 0.08; const X = (px + off + j) * ppt, Y = (pz + off + j) * ppt; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke();
    }
  }
  return cv;
}

// ---- build it all once ------------------------------------------------------------------------------------
function alrArtInit() {
  if (alrArt.ok) return;
  const mk = (fn, ...a) => { const mb = new AlrMB(); fn(mb, ...a); return mb.bake(); };
  const A = alrArt;
  A.b = {};
  for (const k of Object.keys(ALR_BUILD_ART)) A.b[k] = mk(ALR_BUILD_ART[k]);
  A.u = {
    inf: mk(ALR_UNIT_ART.inf, 'rifle'), rocket: mk(ALR_UNIT_ART.inf, 'rocket'), leg: mk(ALR_UNIT_ART.inf_leg),
    tank: mk(ALR_UNIT_ART.tank), tank_turret: mk(ALR_UNIT_ART.tank_turret), tank_gun: mk(ALR_UNIT_ART.tank_gun),
    heavy: mk(ALR_UNIT_ART.heavy), heavy_turret: mk(ALR_UNIT_ART.heavy_turret), heavy_gun: mk(ALR_UNIT_ART.heavy_gun),
    harv: mk(ALR_UNIT_ART.harv), harv_drum: mk(ALR_UNIT_ART.harv_drum), harv_load: mk(ALR_UNIT_ART.harv_load),
  };
  A.trees = []; for (let k = 0; k < 6; k++) A.trees.push(mk(alrTreeMesh, k % 2, k));
  A.rocks = []; for (let k = 0; k < 4; k++) A.rocks.push(mk(alrRockMesh, k));
  A.ore = []; for (let lv = 0; lv < 3; lv++) for (let v = 0; v < 3; v++) A.ore.push(mk(alrOreMesh, lv, lv * 3 + v));
  // debris and wreck chunks
  A.chunk = mk((mb) => mb.color(ALR_PAL.dark).box(0, 0, 0, 0.05, 0.035, 0.04, 0.01));
  A.rubble = mk((mb) => { let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647); for (let k = 0; k < 14; k++) mb.color(k % 2 ? ALR_PAL.concDark : ALR_PAL.padDark).box((r() - 0.5) * 0.9, 0.04, (r() - 0.5) * 0.9, 0.05 + r() * 0.1, 0.03 + r() * 0.05, 0.05 + r() * 0.1, 0.02); });
  if (typeof alrArtInitP1 === 'function') alrArtInitP1(A, mk);
  A.ok = true;
  alrMeshUse();
}

// ---- the Blender models (blender/alertrig.py → blender/pack_alert.py → js/alertMeshData.js) ----------------
// The procedural models above draw first and stay as the fallback. The Blender set (~1 MB gzipped) is
// injected the first time the game opens, then swapped in by name: 'b.hq' → alrArt.b.hq, 'u.tank' → alrArt.u.tank.
// Everything draws through alrArt lookups each frame, so the swap is live; the sidebar cameos are re-shot.
const ALR_MESH_SRC = 'js/alertMeshData.js?v=6';
function alrMeshUse() {
  const D = window.ALR_MESH_DATA;
  if (!D) {
    if (!alrArt.meshLoading && !window.alrNoMesh) {
      alrArt.meshLoading = true;
      const s = document.createElement('script');
      s.src = ALR_MESH_SRC; s.async = true;
      s.onload = () => { if (alrArt.ok) alrMeshUse(); };
      s.onerror = () => console.warn('alert: Blender meshes failed to load; keeping the procedural ones');
      document.head.appendChild(s);
    }
    return false;
  }
  if (alrArt.mesh || window.alrNoMesh) return true;
  const raw = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return u.buffer; };
  for (const name in D.models) {
    const M = D.models[name], [grp, key] = name.split('.');
    const pi = new Int16Array(raw(M.p)), ni = new Int8Array(raw(M.n)), ci = new Uint8Array(raw(M.c));
    const p = new Float32Array(pi.length), n = new Float32Array(ni.length), c = new Float32Array(ci.length);
    for (let k = 0; k < pi.length; k++) p[k] = pi[k] / D.pscale;
    for (let k = 0; k < ni.length; k++) n[k] = ni[k] / 127;
    for (let k = 0; k < ci.length; k++) c[k] = ci[k] / 255;
    const i = M.big ? new Uint32Array(raw(M.i)) : new Uint16Array(raw(M.i));
    // uv = (surface class, grime 0..1): see the shader's uMat branch
    const u = new Float32Array(M.v * 2);
    if (M.u) { const ui = new Uint8Array(raw(M.u)); for (let k = 0; k < ui.length; k += 2) { u[k] = ui[k]; u[k + 1] = ui[k + 1] / 255; } }
    const mesh = alrGLMesh({ p, n, c, u, i });
    // b.* buildings, u.* units by name; t / s / r / o = trees, shrubs, rocks, ore by index
    const LIST = { t: 'trees', s: 'shrubs', r: 'rocks', o: 'ore' };
    if (LIST[grp]) { (alrArt[LIST[grp]] = alrArt[LIST[grp]] || [])[+key] = mesh; } else (grp === 'b' ? alrArt.b : alrArt.u)[key] = mesh;
  }
  alrArt.mesh = true;
  if (!alrGL.mat) { const L = alrMatLayers(256); alrGLMatTex(256, L.layers, ALR_MAT_SCALE, ALR_MAT_SPEC); }
  if (typeof alr !== 'undefined' && alr.ui && alr.ui.cameosBuilt && typeof alrBuildCameos === 'function') { alrBuildCameos(); alrUISide(true); }
  return true;
}

// ---- the surfaces: tileable material textures, painted at load (no download) ---------------------------------
// One layer per surface class (blender/alertrig.py PAL). Each is a grey-centred detail map (128 = the vertex
// colour unchanged; the shader multiplies by 2×) with its own physical logic: formwork seams + tie holes on cast
// concrete, slab joints + cracks + oil on the aprons, gravel on roofs, ribs + rust runs on corrugated sheet, weld
// seams + chipped paint on armour, rivet rows + rust weeping on silos. Scales are repeats per tile.
const ALR_MAT_SCALE = [0, 2.0, 1.0, 2.2, 3.0, 3.2, 3.0, 8.0, 2.0, 7.0, 5.0, 2.5, 6.0, 3.0, 5.0, 3.0, 9.0, 2.5];
const ALR_MAT_SPEC = [1, 0.15, 0.08, 0.25, 0.7, 0.75, 1.1, 0.12, 2.2, 0.05, 0.1, 0.6, 0.3, 0.08, 0.12, 0.2, 0.9, 2.4];
function alrMatLayers(S) {
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // tileable value noise: `cells` lattice cells across the tile, wrapped
  const vn = (x, y, cells, seed) => {
    const fx = x / S * cells, fy = y / S * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const w = (i) => ((i % cells) + cells) % cells;
    const a = hash(w(ix), w(iy), seed), b = hash(w(ix + 1), w(iy), seed), c = hash(w(ix), w(iy + 1), seed), d = hash(w(ix + 1), w(iy + 1), seed);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  const fbm = (x, y, cells, oct, seed) => { let v = 0, a = 0.5, t = 0; for (let o = 0; o < oct; o++) { v += vn(x, y, cells << o, seed + o * 17) * a; t += a; a *= 0.5; } return v / t; };
  const rnd = (() => { let s = 7; return () => ((s = Math.imul(s, 1103515245) + 12345 | 0) >>> 8) / 16777216; })();
  const layers = [];
  const make = (fn) => {
    const px = new Uint8Array(S * S * 4), L = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = (y * S + x) * 3; L[k] = L[k + 1] = L[k + 2] = 128; }
    fn(L);
    for (let k = 0, j = 0; k < L.length; k += 3, j += 4) { px[j] = Math.max(0, Math.min(255, L[k])); px[j + 1] = Math.max(0, Math.min(255, L[k + 1])); px[j + 2] = Math.max(0, Math.min(255, L[k + 2])); px[j + 3] = 255; }
    layers.push(px);
  };
  const W = (v) => ((v % S) + S) % S;
  const add = (L, x, y, r, g, b) => { const k = (W(y) * S + W(x)) * 3; L[k] += r; L[k + 1] += g; L[k + 2] += b; };
  const each = (L, f) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = f(x, y); if (d) add(L, x, y, d[0], d[1], d[2]); } };
  const grey = (v) => [v, v, v];
  const blob = (L, cx, cy, r, d, tint) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const q = 1 - Math.hypot(x, y) / r; if (q > 0) { const e = q * q * d * (0.7 + 0.6 * vn(cx + x, cy + y, 32, 99)); add(L, cx + x, cy + y, e * tint[0], e * tint[1], e * tint[2]); } } };
  const streak = (L, x0, y0, len, w, d, tint) => { for (let t = 0; t < len; t++) { const f = 1 - t / len; for (let k = -w; k <= w; k++) { const e = d * f * (1 - Math.abs(k) / (w + 1)) * (0.6 + 0.8 * vn(x0 + k, y0 + t, 64, 31)); add(L, x0 + k, y0 + t, e * tint[0], e * tint[1], e * tint[2]); } } };
  const RUST = [0.9, 0.45, 0.1], DIRT = [0.8, 0.75, 0.65];
  // 1 cast concrete: board-formed panels, tie holes, mottling, damp stains
  make((L) => {
    each(L, (x, y) => grey((fbm(x, y, 4, 4, 1) - 0.5) * 36 + (hash(x, y, 2) - 0.5) * 14));
    each(L, (x, y) => { const row = Math.floor(y / 64), sx = (x + (row % 2) * 64) % 128; return (y % 64 < 2) ? grey(-26) : (sx < 2 ? grey(-18) : (y % 64 === 2 || sx === 2) ? grey(10) : null); });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) blob(L, c * 64 + 32 + (r % 2) * 32, r * 64 + 32, 3, -55, DIRT);
    for (let k = 0; k < 6; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 24 + rnd() * 30 | 0, -26, DIRT);
  });
  // 2 slab: big joints, hairline cracks, oil stains, grit
  make((L) => {
    each(L, (x, y) => grey((fbm(x, y, 3, 5, 5) - 0.5) * 34 + (hash(x, y, 6) - 0.5) * 20));
    each(L, (x, y) => (x % 128 < 2 || y % 128 < 2) ? grey(-34) : null);
    for (let k = 0; k < 5; k++) { let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28; for (let t = 0; t < 70 + rnd() * 60; t++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a); add(L, x | 0, y | 0, -38, -38, -38); } }
    for (let k = 0; k < 4; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 12 + rnd() * 18 | 0, -60, [1, 1, 1.05]);
  });
  // 3 roofing: gravel ballast over membrane, patched
  make((L) => {
    each(L, (x, y) => grey((hash(x, y, 8) - 0.5) * 50 + (fbm(x, y, 6, 3, 9) - 0.5) * 30));
    each(L, (x, y) => (y % 86 < 2) ? grey(18) : null);
    for (let k = 0; k < 5; k++) { const x0 = rnd() * S | 0, y0 = rnd() * S | 0, w = 20 + rnd() * 40 | 0, h = 14 + rnd() * 30 | 0, d = (rnd() - 0.5) * 30; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) add(L, x0 + x, y0 + y, d, d, d); }
  });
  // 4 corrugated sheet: ribs, rust weeping from the laps
  make((L) => {
    each(L, (x, y) => grey(Math.sin(x / 16 * Math.PI * 2) * 26 + (fbm(x, y, 4, 3, 11) - 0.5) * 22));
    for (let k = 0; k < 9; k++) streak(L, rnd() * S | 0, rnd() * S | 0, 50 + rnd() * 90 | 0, 2, -40, RUST);
  });
  // 5 painted armour: plates with weld seams, chipped paint, scuffs
  make((L) => {
    each(L, (x, y) => grey((fbm(x, y, 4, 4, 13) - 0.5) * 18 + (hash(x, y, 14) - 0.5) * 6));
    each(L, (x, y) => { const sx = (x + (Math.floor(y / 96) % 2) * 64) % 128, sy = y % 96; return (sy === 0 || sx === 0) ? grey(-40) : (sy === 1 || sx === 1) ? grey(22) : null; });
    for (let k = 0; k < 70; k++) { const x = rnd() * S | 0, y = rnd() * S | 0, r = 1 + rnd() * 2.5; blob(L, x, y, r | 0 || 1, 60, [0.75, 0.78, 0.8]); }
    for (let k = 0; k < 7; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 30 + rnd() * 30 | 0, -18, DIRT);
  });
  // 6 steel: brushed grain, scratches, spotting
  make((L) => {
    each(L, (x, y) => grey((vn(x, y * 9, 8, 15) - 0.5) * 22 + (fbm(x, y, 4, 3, 16) - 0.5) * 20));
    for (let k = 0; k < 40; k++) { let x = rnd() * S, y = rnd() * S; const a = rnd() * 6.28, n = 8 + rnd() * 30; for (let t = 0; t < n; t++) add(L, (x += Math.cos(a)) | 0, (y += Math.sin(a)) | 0, 26, 26, 26); }
    for (let k = 0; k < 6; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 10 + rnd() * 16 | 0, -30, RUST);
  });
  // 7 rubber: tread blocks
  make((L) => { each(L, (x, y) => grey(((y % 32) < 6 || ((x + (Math.floor(y / 32) % 2) * 16) % 32) < 4 ? -40 : 14) + (hash(x, y, 18) - 0.5) * 14)); });
  // 8 glass: a sky reflection band + dust
  make((L) => { each(L, (x, y) => grey(Math.max(0, 1 - Math.abs(((x + y) % S) - S * 0.35) / 40) * 50 + (fbm(x, y, 4, 3, 19) - 0.5) * 24)); });
  // 9 sacking: a coarse weave
  make((L) => { each(L, (x, y) => grey(((x % 6 < 3) !== (y % 6 < 3) ? 12 : -12) + (fbm(x, y, 8, 3, 20) - 0.5) * 34)); for (let k = 0; k < 6; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 18, -28, DIRT); });
  // 10 wood: boards, grain, gaps
  make((L) => { each(L, (x, y) => grey((x % 43 < 2 ? -50 : 0) + Math.sin((y / 7) + vn(x, y, 6, 21) * 9) * 10 + (fbm(x, y, 8, 3, 22) - 0.5) * 24)); });
  // 11 riveted plate: seams, rivet rows, rust weeping below the rivets
  make((L) => {
    each(L, (x, y) => grey((fbm(x, y, 4, 4, 23) - 0.5) * 24));
    each(L, (x, y) => (y % 64 < 2 || (x + (Math.floor(y / 64) % 2) * 64) % 128 < 2) ? grey(-34) : null);
    for (let y = 0; y < S; y += 64) for (let x = 6; x < S; x += 12) { add(L, x, y + 5, 40, 40, 40); add(L, x + 1, y + 6, -40, -40, -40); if (hash(x, y, 24) < 0.18) streak(L, x, y + 7, 20 + hash(x, y, 25) * 40 | 0, 1, -45, RUST); }
  });
  // 12 breading: crumb
  make((L) => { each(L, (x, y) => grey((fbm(x, y, 16, 3, 26) - 0.5) * 70 + (hash(x, y, 27) - 0.5) * 30)); for (let k = 0; k < 140; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 2 + rnd() * 4 | 0, rnd() < 0.5 ? -50 : 40, [1, 0.85, 0.6]); });
  // 13 canvas: fine weave, water marks
  make((L) => { each(L, (x, y) => grey(((x + y) % 4 < 2 ? 6 : -6) + (fbm(x, y, 3, 4, 28) - 0.5) * 32)); for (let k = 0; k < 5; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 26, -24, DIRT); });
  // 14 foliage: overlapping leaves, light tops and dark gaps between them
  make((L) => {
    each(L, (x, y) => grey((fbm(x, y, 8, 3, 30) - 0.5) * 30 - 34));
    for (let k = 0; k < 1500; k++) { const x = rnd() * S | 0, y = rnd() * S | 0, r = 2 + rnd() * 3 | 0, d = 30 + rnd() * 55; blob(L, x, y, r, d, [0.9, 1.05, 0.65]); blob(L, x + 1, y + r, 2, -55, [1, 1, 1]); }
  });
  // 15 rock: bedding strata, fractures, lichen
  make((L) => {
    each(L, (x, y) => grey(Math.sin((y + fbm(x, y, 4, 3, 31) * 60) / 9) * 14 + (fbm(x, y, 6, 4, 32) - 0.5) * 40 + (hash(x, y, 33) - 0.5) * 16));
    for (let k = 0; k < 7; k++) { let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28; for (let t = 0; t < 40 + rnd() * 70; t++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a); add(L, x | 0, y | 0, -45, -45, -45); } }
    for (let k = 0; k < 26; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 4 + rnd() * 9 | 0, 34, [0.55, 0.75, -0.1]);
  });
  // 16 ore: nuggety crumb, bright facets, dark pits
  make((L) => {
    each(L, (x, y) => grey((fbm(x, y, 12, 3, 34) - 0.5) * 50));
    for (let k = 0; k < 260; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 1 + rnd() * 3 | 0, rnd() < 0.55 ? 70 : -60, [1, 0.9, 0.5]);
  });
  // 17 liquid (gravy): smooth, a few soft swirls of lighter fat and darker depth, no grain
  make((L) => {
    each(L, (x, y) => { const w = fbm(x, y, 3, 3, 40); const sw = Math.sin((x + w * 140) / 22 + Math.cos((y + w * 90) / 30) * 2); return [sw * 9 + (w - 0.5) * 22, sw * 6 + (w - 0.5) * 16, sw * 3 + (w - 0.5) * 10]; });
    for (let k = 0; k < 20; k++) blob(L, rnd() * S | 0, rnd() * S | 0, 6 + rnd() * 14 | 0, 18, [1.1, 0.85, 0.55]);
  });
  return { layers };
}
