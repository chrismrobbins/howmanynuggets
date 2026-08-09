// blender/tools/png.js — a PNG decoder in ~70 lines of node stdlib.
//
// The verification kit deliberately has NO image dependency: the only npm
// install the night shift does is playwright, and adding sharp/pngjs to that
// is a native build on a Windows box for the sake of reading four bytes per
// pixel. zlib is in node. This handles what playwright emits (8-bit RGB/RGBA,
// non-interlaced) and throws loudly on anything else rather than guessing.

const zlib = require('zlib');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth);
  if (interlace) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported color type ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;                 // bytes per pixel at depth 8
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let sp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[sp++];
    const row = raw.subarray(sp, sp + stride); sp += stride;
    const o = y * stride, prev = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error('bad filter ' + filter);
      out[o + x] = v & 255;
    }
  }
  return { w, h, channels, data: out };
}

// Rec.709 luma, the same weights the hall's own compositor uses.
function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// The darkness/blowout report. `dead` and `blown` are the two numbers that
// have actually driven decisions: a frame that is 18% pure black reads as
// broken, and a frame with blown highlights reads as cheap.
function stats(img) {
  const { w, h, channels, data } = img;
  const hist = new Uint32Array(256);
  let sum = 0, sum2 = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * channels;
    const l = luma(data[o], data[o + 1], data[o + 2]);
    const q = Math.min(255, Math.max(0, Math.round(l)));
    hist[q]++; sum += l; sum2 += l * l; n++;
  }
  let dead = 0, near = 0, blown = 0;
  for (let i = 0; i < 8; i++) dead += hist[i];
  for (let i = 0; i < 20; i++) near += hist[i];
  for (let i = 247; i < 256; i++) blown += hist[i];
  const mean = sum / n;
  return {
    n, hist,
    dead: (100 * dead) / n,
    near: (100 * near) / n,
    blown: (100 * blown) / n,
    mean,
    sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)),
  };
}

// Mean saturation — how COLORED the frame is. The relight lesson was that a
// brighter frame can be a worse frame (a washed lavender box); chroma is the
// number that catches that, and nothing has ever measured it here.
function chroma(img) {
  const { w, h, channels, data } = img;
  let s = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * channels, r = data[o], g = data[o + 1], b = data[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    s += mx > 0 ? (mx - mn) / mx : 0;
  }
  return (100 * s) / (w * h);
}

// Percentage of pixels that differ by more than `tol` per channel.
//
// THE CHECK THIS EXISTS FOR: a fallback row that comes back byte-identical to
// the shipped row is not a passing test, it is a seam that never fired. The
// first fallback matrix reported no-hallart / no-maps / no-mesh as "ok" with
// numbers matching shipped to two decimals, and every one of those three had
// been set AFTER the code that reads it. Summary statistics cannot tell those
// apart; a diff can.
function diff(a, b, tol = 2) {
  if (a.w !== b.w || a.h !== b.h) return 100;
  let n = 0;
  const ca = a.channels, cb = b.channels;
  for (let i = 0; i < a.w * a.h; i++) {
    const oa = i * ca, ob = i * cb;
    if (Math.abs(a.data[oa] - b.data[ob]) > tol
      || Math.abs(a.data[oa + 1] - b.data[ob + 1]) > tol
      || Math.abs(a.data[oa + 2] - b.data[ob + 2]) > tol) n++;
  }
  return (100 * n) / (a.w * a.h);
}

module.exports = { decode, stats, chroma, luma, diff };
