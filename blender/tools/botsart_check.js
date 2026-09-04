// blender/tools/botsart_check.js — does js/botsArt.js honour BOTS_ART_CONTRACT.md?
//
//     node blender/tools/botsart_check.js [path/to/botsArt.js]
//
// Loads the generated file in a bare `vm` context (no browser), then asserts:
//   - every region the contract names is on R, sized cell x PPU, inside the page
//   - the three sprite pages decode (png.js, node stdlib only) to 1024x1024 RGBA
//   - floors.pit, floors.fryer and floors.sump each have albedo/normal/rough at
//     2048x1152 (JPEG dims read off the SOF marker; the normal is a PNG and
//     decodes fully) and a near-flat normal on open floor
//   - the pages are not lies: every region has opaque texels in the albedo, the
//     normal page is flat (128,128,255) where a flat steel plate faces the camera
//     and (128,128,255) under every transparent texel, the mask is white somewhere
//     on every chassis and turret and nowhere on a tyre.
// Exit 1 with a list of failures; 0 with a one-line summary.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { decode } = require('./png.js');

const REPO = path.resolve(__dirname, '..', '..');
const file = process.argv[2] || path.join(REPO, 'js', 'botsArt.js');

// The contract, verbatim (region -> cell in units).
const CELL = {};
for (const k of ['dicer', 'tender', 'brick']) for (let s = 0; s < 3; s++) CELL[`bot_${k}_${s}`] = [32, 32];
for (const k of ['disc_still', 'disc_spin', 'disc_blur']) CELL[k] = [20, 20];
CELL.flipper_up = [26, 14];
for (const k of ['minigun', 'flamer', 'mortar', 'rocket', 'emp']) { CELL['turret_' + k] = [16, 16]; CELL['pickup_' + k] = [10, 10]; }
CELL.pickup_nitro = [10, 10];
Object.assign(CELL, { tire: [8, 8], drum: [10, 10], lamp: [12, 12], blade: [28, 10], mallet: [16, 16],
  mallet_arm: [8, 40], pad: [18, 18], pit_hole: [64, 64], grate: [64, 64], booth: [40, 80],
  driver: [8, 10], crowd: [128, 24], p_spark: [4, 4], p_smoke: [16, 16], p_oil: [12, 12],
  puddle_ranch: [36, 36], scorch: [24, 24], skid: [6, 3] });
for (let i = 0; i < 3; i++) { CELL[`p_fire_${i}`] = [12, 12]; CELL[`p_plate_${i}`] = [6, 4]; }
for (let i = 0; i < 4; i++) CELL[`p_crumb_${i}`] = [3, 3];

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };

function fromDataUri(uri, mime) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(uri || '');
  if (!ok(!!m, `not a data URI (${mime})`)) return null;
  ok(m[1] === mime, `expected ${mime}, got ${m[1]}`);
  return Buffer.from(m[2], 'base64');
}

function jpegDims(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) throw new Error('bad marker at ' + p);
    const marker = buf[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    const len = buf.readUInt16BE(p + 2);
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7), gray: buf[p + 9] === 1 };
    p += 2 + len;
  }
  throw new Error('no SOF');
}

function px(img, x, y) {
  const o = (y * img.w + x) * img.channels;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.channels === 4 ? img.data[o + 3] : 255];
}

// ---- load ----
const src = fs.readFileSync(file, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: path.basename(file) });
const A = sandbox.window.BotsArt;
if (!ok(!!A, 'window.BotsArt not set')) finish();

ok(A.W === 1024 && A.H === 1024, `W,H = ${A.W},${A.H}`);
ok(A.PPU === 4, `PPU = ${A.PPU}`);
ok(A.R && typeof A.R === 'object', 'R missing');

// ---- regions ----
const PPU = A.PPU || 4;
for (const [name, [cw, ch]] of Object.entries(CELL)) {
  const r = A.R && A.R[name];
  if (!ok(!!r, `region missing: ${name}`)) continue;
  ok(r.length === 4, `${name}: R entry is not [x,y,w,h]`);
  ok(r[2] === cw * PPU && r[3] === ch * PPU, `${name}: size ${r[2]}x${r[3]}, contract ${cw * PPU}x${ch * PPU}`);
  ok(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= A.W && r[1] + r[3] <= A.H, `${name}: outside the page`);
}
for (const name of Object.keys(A.R || {})) ok(name in CELL, `extra region not in the contract: ${name}`);
// no overlaps
const names = Object.keys(A.R || {});
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = A.R[names[i]], b = A.R[names[j]];
  const sep = a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
  ok(sep, `regions overlap: ${names[i]} / ${names[j]}`);
}

// ---- pages ----
const pages = {};
for (const key of ['albedo', 'normal', 'mask']) {
  const buf = fromDataUri(A[key], 'image/png');
  if (!buf) continue;
  try {
    const img = decode(buf);
    ok(img.w === 1024 && img.h === 1024, `${key}: ${img.w}x${img.h}`);
    ok(img.channels === 4, `${key}: ${img.channels} channels, want RGBA`);
    pages[key] = img;
  } catch (e) { fails.push(`${key}: PNG decode failed: ${e.message}`); }
}

// ---- content sanity ----
if (pages.albedo && pages.normal && pages.mask && A.R) {
  const alb = pages.albedo, nrm = pages.normal, msk = pages.mask;
  for (const name of Object.keys(CELL)) {
    const r = A.R[name];
    if (!r) continue;
    let opaque = 0, white = 0, flatBad = 0, alphaMismatch = 0;
    for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) {
      const a = px(alb, x, y), n = px(nrm, x, y), m = px(msk, x, y);
      if (a[3] > 128) opaque++;
      if (m[3] > 128 && m[0] > 200) white++;
      if (a[3] === 0 && (Math.abs(n[0] - 128) > 2 || Math.abs(n[1] - 128) > 2 || n[2] < 250)) flatBad++;
      if (Math.abs(a[3] - n[3]) > 2 || Math.abs(a[3] - m[3]) > 2) alphaMismatch++;
    }
    ok(opaque > r[2] * r[3] * 0.02, `${name}: albedo nearly empty (${opaque} opaque texels)`);
    ok(flatBad === 0, `${name}: ${flatBad} transparent texels whose normal is not flat`);
    ok(alphaMismatch === 0, `${name}: normal/mask alpha differs from albedo on ${alphaMismatch} texels`);
    const wantsPaint = /^bot_|^driver$/.test(name);
    if (wantsPaint) ok(white > 20, `${name}: mask has no PAINT (${white} white texels)`);
    if (/^tire$|^pad$|^grate$|^p_/.test(name)) ok(white === 0, `${name}: mask has PAINT where none belongs (${white})`);
  }
  // a flat steel plate facing the lens must be (128,128,255) +-6 at the centre of `pad`
  const r = A.R.pad;
  if (r) {
    const n = px(nrm, r[0] + (r[2] >> 1), r[1] + (r[3] >> 1));
    ok(Math.abs(n[0] - 128) <= 6 && Math.abs(n[1] - 128) <= 6 && n[2] >= 246, `pad centre normal ${n.slice(0, 3)} is not flat`);
  }
}

// ---- floors: one page set per arena in js/botsSim.js ARENAS ----
const ARENAS = ['pit', 'fryer', 'sump'];
for (const arena of ARENAS) {
  if (!ok(A.floors && A.floors[arena], `floors.${arena} missing`)) continue;
  const F = A.floors[arena];
  ok(F.w === 2048 && F.h === 1152, `floors.${arena} w,h = ${F.w},${F.h}`);
  const ja = fromDataUri(F.albedo, 'image/jpeg');
  if (ja) { const d = jpegDims(ja); ok(d.w === 2048 && d.h === 1152, `${arena} albedo jpeg ${d.w}x${d.h}`); }
  const jr = fromDataUri(F.rough, 'image/jpeg');
  if (jr) { const d = jpegDims(jr); ok(d.w === 2048 && d.h === 1152, `${arena} rough jpeg ${d.w}x${d.h}`); ok(d.gray, `${arena} rough is not grayscale`); }
  const pn = fromDataUri(F.normal, 'image/png');
  if (pn) {
    try {
      const img = decode(pn);
      ok(img.w === 2048 && img.h === 1152, `${arena} normal png ${img.w}x${img.h}`);
      // open floor at world (100,180) -> page (320,576): flat-ish on every arena
      const n = px(img, Math.round(100 * 3.2), Math.round(180 * 3.2));
      ok(Math.abs(n[0] - 128) <= 24 && Math.abs(n[1] - 128) <= 24 && n[2] >= 200, `${arena} normal at open floor ${n.slice(0, 3)} not near flat`);
    } catch (e) { fails.push(`${arena} normal PNG decode failed: ` + e.message); }
  }
}
for (const k of Object.keys(A.floors || {})) ok(ARENAS.includes(k), `extra floor not in the sim: ${k}`);

finish();

function finish() {
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  if (fails.length) {
    console.error(`botsart_check: ${fails.length} failure(s) in ${file}`);
    for (const f of fails) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`botsart_check OK: ${Object.keys(CELL).length} regions, 3 pages 1024x1024, floors ${Object.keys((A && A.floors) || {}).join('/')} 2048x1152, ${kb} KB`);
}
