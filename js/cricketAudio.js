// ---- 🏏🎙️ NUGGET CRICKET: THE SOUND --------------------------------------------------------------------
// Blitz's sound, re-wired for cricket (js/blitzAudio.js is the parent; everything here is `crk`-prefixed):
//   • THE BOOTH — every commentary line is a pre-rendered ElevenLabs clip (an Indian-accented cricket
//     commentator, picked by Chris from a tryout page) in audio/cricket/vo/, manifest js/cricketVO.js
//     (key = normalized text → [[file, secs], …takes]). One channel, priorities, stale lines dropped,
//     the music ducks under it. A line with no clip just isn't said (the ticker still shows it).
//   • THE RECORDS — the stadium soundtrack, the stings and the sounds (bat on ball, stumps, the crowd)
//     are recordings in audio/cricket/music/ (index.json): made once, shipped as files, free to play.
//     Anything not loaded yet falls back to cricket.js's synth.
const crkVO = { bytes: new Map(), bufs: new Map(), lru: [], loading: new Map(), cur: null, q: [], bus: null, last: new Map(), miss: new Set() };
const CRK_VO_BASE = 'audio/cricket/vo/';
function crkVoNorm(t) { return String(t).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function crkVoBus() {
  const S = cricket.sfx, ctx = S.ctx;
  if (crkVO.bus || !ctx) return !!crkVO.bus;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 3;
  const out = ctx.createGain(); out.gain.value = 1.35;
  hp.connect(comp); comp.connect(out); out.connect(S.master);
  crkVO.bus = hp;
  return true;
}
function crkVoFetch(file) {
  const V = crkVO;
  if (V.bytes.has(file)) return Promise.resolve(V.bytes.get(file));
  if (V.loading.has(file)) return V.loading.get(file);
  const pr = fetch(CRK_VO_BASE + file).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { V.loading.delete(file); if (ab) V.bytes.set(file, ab); return ab; }).catch(() => { V.loading.delete(file); return null; });
  V.loading.set(file, pr);
  return pr;
}
function crkVoBuffer(file) {
  const V = crkVO, ctx = cricket.sfx.ctx;
  if (V.bufs.has(file)) return Promise.resolve(V.bufs.get(file));
  return crkVoFetch(file).then((ab) => (ab && ctx ? new Promise((res) => ctx.decodeAudioData(ab.slice(0), res, () => res(null))) : null)).then((buf) => {
    if (!buf) return null;
    V.bufs.set(file, buf); V.lru.push(file);
    while (V.lru.length > 48) V.bufs.delete(V.lru.shift());
    return buf;
  });
}
function crkVoPrefetch() {
  if (typeof CRK_VO === 'undefined') return;
  const want = Object.values(CRK_VO).map((t) => t[0][0]);
  let i = 0;
  const next = () => { if (i < want.length) crkVoFetch(want[i++]).then(next); };
  for (let n = 0; n < 3; n++) next();
}
function crkSpeak(text, o) {
  const C = cricket, S = C.sfx;
  o = o || {};
  if (!C.voice || S.muted || C.auto || !S.ctx || typeof CRK_VO === 'undefined') return;
  const key = crkVoNorm(text), ent = CRK_VO[key];
  if (!ent) { crkVO.miss.add(key); return; }
  if (!crkVoBus()) return;
  const last = crkVO.last.get(key), ready = ent.filter((e) => e[0] !== last && crkVO.bytes.has(e[0]));
  for (const e of ent) if (!crkVO.bytes.has(e[0])) crkVoFetch(e[0]);
  const take = ready.length ? ready[(Math.random() * ready.length) | 0] : ent[0];
  crkVO.last.set(key, take[0]);
  const item = { key, file: take[0], prio: o.prio || 0, born: performance.now(), maxAge: (o.maxAge || 2.4) * 1000 };
  if (!crkVO.cur) { crkVoStart(item); return; }
  if (item.prio > crkVO.cur.prio + 1 || (item.prio >= 2 && crkVO.cur.prio < 2)) { crkVoStop(); crkVO.q.length = 0; crkVoStart(item); return; }
  crkVO.q.push(item); crkVO.q.sort((a, b) => b.prio - a.prio || b.born - a.born);
  if (crkVO.q.length > 2) crkVO.q.length = 2;
}
function crkVoStart(item) {
  const V = crkVO;
  V.cur = item; item.pending = true;
  crkVoBuffer(item.file).then((buf) => {
    if (V.cur !== item) return;
    const ctx = cricket.sfx.ctx;
    if (!buf || !ctx || performance.now() - item.born > item.maxAge + 400) { V.cur = null; crkVoNext(); return; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(V.bus);
    item.src = src; item.pending = false; item.until = performance.now() + buf.duration * 1000 + 150;
    src.onended = () => { if (V.cur === item) { V.cur = null; crkVoNext(); } };
    src.start();
    crkMusDuck(0.5, buf.duration);
  });
}
function crkVoStop() { const it = crkVO.cur; crkVO.cur = null; if (it && it.src) { try { it.src.onended = null; it.src.stop(); } catch (e) { } } }
function crkVoNext() { const Q = crkVO.q, now = performance.now(); while (Q.length) { const it = Q.shift(); if (now - it.born < it.maxAge) { crkVoStart(it); return; } } }
function crkHush() { crkVO.q.length = 0; crkVoStop(); }

// ---- 📀 the records: one stadium loop, stings, the sounds ------------------------------------------------------
const CRK_DISC_BASE = 'audio/cricket/music/', CRK_DISC_V = 2;
const crkMus = { on: true, vol: 0.5, bus: null, mix: null, filt: null, cur: null, want: '' };
const crkDisc = { man: null, manP: null, bytes: new Map(), loading: new Map(), bufs: new Map(), failed: new Set() };
// per-sound trims against the synth (set by ear against the master)
const CRK_DISC_GAIN = { bat: 1.0, edge: 0.7, stumps: 0.9, catch: 0.8, 'cr-roar': 0.8, 'cr-aww': 0.7, 'cr-appeal': 0.8, four: 0.7, six: 0.8, wicket: 0.8 };
function crkDiscManifest() {
  const D = crkDisc;
  if (D.manP) return D.manP;
  D.manP = fetch(CRK_DISC_BASE + 'index.json?v=' + CRK_DISC_V).then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (!m) return null;
    D.man = m;
    const files = [m.loops.match && m.loops.match.file].concat(Object.values(m.shots).map((x) => x.file)).filter(Boolean);
    let i = 0;
    const next = () => { if (i < files.length) crkDiscFetch(files[i++]).then(next); };
    next(); next();
    crkVoPrefetch();
    return m;
  }).catch(() => null);
  return D.manP;
}
function crkDiscFetch(file) {
  const D = crkDisc;
  if (D.bytes.has(file)) return Promise.resolve(D.bytes.get(file));
  if (D.loading.has(file)) return D.loading.get(file);
  if (D.failed.has(file)) return Promise.resolve(null);
  const pr = fetch(CRK_DISC_BASE + file + '?v=' + CRK_DISC_V).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => { D.loading.delete(file); if (ab) D.bytes.set(file, ab); else D.failed.add(file); return ab; }).catch(() => { D.loading.delete(file); D.failed.add(file); return null; });
  D.loading.set(file, pr);
  return pr;
}
function crkDiscBuf(file) {
  const D = crkDisc, ctx = cricket.sfx.ctx;
  if (D.bufs.has(file)) { const b = D.bufs.get(file); return b && b.then ? b : Promise.resolve(b); }
  if (D.failed.has(file)) return Promise.resolve(null);
  const pr = crkDiscFetch(file).then((ab) => (ab && ctx ? new Promise((res) => ctx.decodeAudioData(ab.slice(0), res, () => res(null))) : null)).then((buf) => { if (!buf) { D.bufs.delete(file); D.failed.add(file); return null; } D.bufs.set(file, buf); return buf; });
  D.bufs.set(file, pr);
  return pr;
}
function crkDiscReady(file) { const b = crkDisc.bufs.get(file); return b && !b.then ? b : null; }
// a one-shot: false if it isn't here yet (the caller synthesizes)
function crkDiscShot(key, q) {
  const D = crkDisc, ctx = cricket.sfx.ctx;
  if (!D.man || !ctx) return false;
  const ent = D.man.shots[key];
  if (!ent) return false;
  const buf = crkDiscReady(ent.file);
  if (!buf) { crkDiscBuf(ent.file); return false; }
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = 0.96 + Math.random() * 0.08;
  const g = ctx.createGain(); g.gain.value = (CRK_DISC_GAIN[key] || 1) * (key === 'bat' && q != null ? 0.7 + q * 0.4 : 1);
  src.connect(g); g.connect(cricket.sfx.master);
  src.start();
  if (key === 'six' || key === 'four' || key === 'wicket') crkMusDuck(0.35, Math.min(2, buf.duration));
  return true;
}
function crkMusInit() {
  const S = cricket.sfx, M = crkMus;
  if (M.bus || !S.ctx) return !!M.bus;
  // filt → mix (the game moment's level) → bus (on/off + the ducks under the booth)
  M.filt = S.ctx.createBiquadFilter(); M.filt.type = 'lowpass'; M.filt.frequency.value = 18000;
  M.mix = S.ctx.createGain(); M.mix.gain.value = 1;
  M.bus = S.ctx.createGain(); M.bus.gain.value = M.on ? M.vol : 0;
  M.filt.connect(M.mix); M.mix.connect(M.bus); M.bus.connect(S.master);
  return true;
}
function crkMusToggle() { const M = crkMus; M.on = !M.on; if (M.bus) M.bus.gain.setTargetAtTime(M.on ? M.vol : 0, cricket.sfx.ctx.currentTime, 0.1); return M.on; }
function crkMusDuck(depth, secs) {
  const M = crkMus, ctx = cricket.sfx.ctx;
  if (!M.bus || !M.on || !ctx) return;
  const t = ctx.currentTime, g = M.bus.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(M.vol * depth, t + 0.05);
  g.setValueAtTime(M.vol * depth, t + secs); g.linearRampToValueAtTime(M.vol, t + secs + 0.6);
}
// every frame: the loop between balls (muffled while the ball's live), the win / lose sting at the end
function crkMusicFrame() {
  const C = cricket, D = crkDisc, ctx = C.sfx.ctx, M = crkMus;
  if (!ctx || !D.man || C.sfx.muted || !crkMusInit()) return;
  const ph = C.phase;
  const want = ph === 'final' ? (C.result && C.result.won ? 'win' : 'lose') : (ph === 'idle' || ph === 'tier') ? '' : 'match';
  if (want !== M.want) {
    M.want = want;
    if (M.cur) { const old = M.cur; old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); try { old.src.stop(ctx.currentTime + 1.5); } catch (e) { } M.cur = null; }
  }
  if (want && !M.cur) {
    const loop = D.man.loops[want], shot = D.man.shots[want], ent = loop || shot;
    if (ent) {
      const buf = crkDiscReady(ent.file);
      if (!buf) crkDiscBuf(ent.file);
      else {
        const src = ctx.createBufferSource(); src.buffer = buf;
        if (loop) { src.loop = true; src.loopStart = loop.start; src.loopEnd = loop.end; }
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
        src.connect(g); g.connect(M.filt); src.start(ctx.currentTime, loop ? loop.start : 0);
        M.cur = { src, g, key: want };
      }
    }
  }
  // the ball's in play: the band steps back
  const live = ph === 'flight' || ph === 'live' || ph === 'runup';
  M.filt.frequency.setTargetAtTime(live ? 1600 : 18000, ctx.currentTime, 0.25);
  M.mix.gain.setTargetAtTime(live ? 0.55 : 1, ctx.currentTime, 0.3);
}
