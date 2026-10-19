// ---- 🚨 NUGGET ALERT — the recordings ------------------------------------------------------------------------
// Battle Control's voice, the units' acknowledgements, the soundtrack and the guns: ElevenLabs recordings made
// ONCE by tools/alert-vo/render.py and shipped as files (audio/alert/, listed in index.json). Playing costs no
// credits; the game never calls ElevenLabs.
//   • BATTLE CONTROL speaks every alrSay() message that has a clip (key 'eva|<the message>'), one at a time
//     from a short queue (urgent ones jump it), and the music ducks under her
//   • UNITS answer when you select them and when you order them (key '<type>:select|move|attack'), through a
//     radio filter (a bandpass + a little drive), one voice at a time, never the same line twice in a row
//   • the SOUNDTRACK follows the game: menu → build → battle (fighting near your stuff in the last ~20 s, or
//     your base is hit) → final (after 15 minutes, when it's on), crossfaded; victory/defeat play once
//   • SOUND EFFECTS: a recording when it's decoded, the synth in alertUI.js when it isn't
// Nothing here is required: with no files (or no network) the game plays exactly as it did, synth and text.
// Every clip is trimmed of leading silence and loudness-matched at decode (there's no ffmpeg in the pipeline).

const ALR_AUDIO_V = 5;           // bump with a new render (index.json is fetched with it)
const alrDisc = { idx: null, bytes: {}, buf: {}, loading: {}, failed: {}, music: null, musicKey: '', want: 'menu', evaQ: [], evaBusy: false,
  ack: null, ackT: 0, lastLine: {}, musicOn: true, duck: 1, fightT: -99 };

// the manifest: fetched when the game opens (no AudioContext needed to fetch), music first
function alrDiscManifest() {
  if (alrDisc.idx || alrDisc.idxLoading) return;
  alrDisc.idxLoading = true;
  fetch('audio/alert/index.json?v=' + ALR_AUDIO_V).then((r) => (r.ok ? r.json() : null)).then((I) => {
    if (!I) return;
    alrDisc.idx = I;
    // what you hear first, first: the menu song, then the guns and Battle Control, then the rest of the music
    const order = [];
    if (I.music.menu) order.push(I.music.menu.file);
    // the faction you've got picked on the skirmish screen, then the others (each faction has its own theme)
    const pick = alr.ui && alr.ui.setupCfg && alr.ui.setupCfg.faction;
    if (pick && I.music['fac_' + pick]) order.push(I.music['fac_' + pick].file);
    for (const f of Object.values(I.sfx)) order.push(f);
    for (const k of Object.keys(I.vo)) if (k.startsWith('eva|')) order.push(...I.vo[k]);
    for (const k of ['build', 'battle', 'final', 'victory', 'defeat']) if (I.music[k]) order.push(I.music[k].file);
    for (const k of Object.keys(I.music)) if (k.startsWith('fac_') && !order.includes(I.music[k].file)) order.push(I.music[k].file);
    for (const k of Object.keys(I.vo)) if (!k.startsWith('eva|')) order.push(...I.vo[k]);
    let n = 0;
    const next = () => { const f = order[n++]; if (!f) return; alrDiscFetch(f).then(next, next); };
    next(); next(); next();          // three at a time
  }).catch(() => {});
}
function alrDiscFetch(f) {
  if (alrDisc.bytes[f] || alrDisc.failed[f]) return Promise.resolve();
  if (alrDisc.loading[f]) return alrDisc.loading[f];
  return (alrDisc.loading[f] = fetch('audio/alert/' + f + '?v=' + ALR_AUDIO_V).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
    .then((b) => { alrDisc.bytes[f] = b; }).catch(() => { alrDisc.failed[f] = true; }));
}
// decoded, trimmed, loudness-matched — or null if it isn't here (yet)
function alrDiscBuf(f, kind) {
  if (alrDisc.buf[f]) return alrDisc.buf[f] === 'pending' ? null : alrDisc.buf[f];
  const C = alrA.ctx, b = alrDisc.bytes[f];
  if (!C || !b) { if (!b) alrDiscFetch(f); return null; }
  alrDisc.buf[f] = 'pending';
  C.decodeAudioData(b.slice(0)).then((buf) => {
    // where the sound starts (skip the silence ElevenLabs leaves at the head) and how loud it is
    const d = buf.getChannelData(0);
    let st = 0; if (kind !== 'music') { while (st < d.length && Math.abs(d[st]) < 0.012) st++; st = Math.max(0, st - Math.round(buf.sampleRate * 0.01)); }
    let s2 = 0, n = 0, pk = 0; for (let i = st; i < d.length; i += 4) { const a = Math.abs(d[i]); s2 += a * a; n++; if (a > pk) pk = a; }
    const rms = Math.sqrt(s2 / Math.max(1, n)) || 0.1;
    const target = kind === 'music' ? 0.12 : kind === 'vo' ? 0.16 : 0.2;
    // match loudness, but never push the peak past 0.95: a one-bang clip (the small explosion) is mostly
    // silence, and its average alone would have asked for 20× and clipped
    alrDisc.buf[f] = { buf, start: st / buf.sampleRate, gain: Math.min(4, target / rms, 0.95 / Math.max(pk, 0.05)) };
  }, () => { alrDisc.failed[f] = true; delete alrDisc.buf[f]; });
  return null;
}
function alrDiscOut() {
  const C = alrA.ctx;
  if (!alrDisc.bus && C) {
    alrDisc.bus = C.createGain(); alrDisc.bus.connect(alrA.master);
    alrDisc.musicBus = C.createGain(); alrDisc.musicBus.gain.value = 0.7; alrDisc.musicBus.connect(alrA.master);
    // the field radio: units sound like they're on a handset
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.55;
    const ws = C.createWaveShaper(), cur = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cur[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    ws.curve = cur;
    const g = C.createGain(); g.gain.value = 0.9;
    bp.connect(ws); ws.connect(g); g.connect(alrA.master);
    alrDisc.radio = bp;
    // Battle Control's comms: band-limited, a presence lift, driven harder than the units' handsets
    // (Chris: "make the announcer grittier")
    const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.7;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; lp.Q.value = 0.9;
    const pr = C.createBiquadFilter(); pr.type = 'peaking'; pr.frequency.value = 1900; pr.Q.value = 1.1; pr.gain.value = 5;
    const dr = C.createWaveShaper(), c2 = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; c2[i] = Math.tanh(x * 3.4) / Math.tanh(3.4); }
    dr.curve = c2; dr.oversample = '2x';
    const eg = C.createGain(); eg.gain.value = 0.8;
    hp.connect(lp); lp.connect(pr); pr.connect(dr); dr.connect(eg); eg.connect(alrA.master);
    alrDisc.evaBus = hp;
  }
  return alrDisc.bus;
}
function alrDiscPlay(f, kind, vol, rate, dest) {
  const C = alrA.ctx; if (!C || alrA.muted || C.state !== 'running') return null;
  const B = alrDiscBuf(f, kind); if (!B) return null;
  alrDiscOut();
  const s = C.createBufferSource(); s.buffer = B.buf; if (rate) s.playbackRate.value = rate;
  const g = C.createGain(); g.gain.value = B.gain * (vol == null ? 1 : vol);
  s.connect(g); g.connect(dest || alrDisc.bus);
  s.start(C.currentTime, B.start);
  return { s, g, dur: (B.buf.duration - B.start) / (rate || 1) };
}

// ---- sound effects: the recording if it's here ----------------------------------------------------------------
function alrDiscSfx(name, vol) {
  const I = alrDisc.idx; if (!I || !I.sfx[name]) return false;
  return !!alrDiscPlay(I.sfx[name], 'sfx', vol * 0.9, 0.93 + Math.random() * 0.14);
}

// ---- Battle Control ----------------------------------------------------------------------------------------------
const ALR_EVA_URGENT = { 'OUR BASE IS UNDER ATTACK': 1, 'LOW POWER': 1, 'MISSION ACCOMPLISHED': 1, 'MISSION FAILED': 1, 'BUILDING LOST': 1 };
function alrEva(text) {
  const I = alrDisc.idx; if (!I || !I.vo['eva|' + text]) return;
  const Q = alrDisc.evaQ;
  if (Q.includes(text)) return;
  if (ALR_EVA_URGENT[text]) Q.unshift(text); else Q.push(text);
  if (Q.length > 3) Q.length = 3;
  alrEvaNext();
}
function alrEvaNext() {
  if (alrDisc.evaBusy || !alrDisc.evaQ.length) return;
  const text = alrDisc.evaQ[0], f = alrDisc.idx.vo['eva|' + text][0];
  alrDiscOut();
  const p = alrDiscPlay(f, 'vo', 1.1, 1, alrDisc.evaBus);
  if (!p) {
    // not decoded yet: hold the line for up to ~1.5 s, then let it go rather than speak late
    alrDisc.evaWait = (alrDisc.evaWait || 0) + 1;
    if (alrDisc.evaWait > 10 || alrDisc.failed[f]) { alrDisc.evaQ.shift(); alrDisc.evaWait = 0; }
    setTimeout(alrEvaNext, 150);
    return;
  }
  alrDisc.evaQ.shift(); alrDisc.evaWait = 0;
  alrEvaStatic(p.dur);
  alrDisc.evaBusy = true; alrDisc.duck = 0.45;
  setTimeout(() => { alrDisc.evaBusy = false; alrDisc.duck = 1; alrEvaNext(); }, p.dur * 1000 + 140);
}

// the channel opening: a squelch burst, a faint static bed under the line, a squelch as it closes
function alrEvaStatic(dur) {
  const C = alrA.ctx; if (!C || !alrA.noise) return;
  const t = C.currentTime;
  const burst = (t0, len, lvl, f) => {
    const s = C.createBufferSource(); s.buffer = alrA.noise; s.playbackRate.value = 1.3;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.8;
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(lvl, t0 + 0.008); g.gain.setValueAtTime(lvl, t0 + len - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    s.connect(bp); bp.connect(g); g.connect(alrA.master); s.start(t0, Math.random()); s.stop(t0 + len + 0.05);
  };
  burst(t - 0.005, 0.07, 0.09, 3000);                    // kssh: the key goes down
  burst(t, dur + 0.05, 0.012, 2400);                     // the hiss under her
  burst(t + dur + 0.04, 0.09, 0.07, 2600);               // kssht: and up
}

// ---- the units ------------------------------------------------------------------------------------------------------
// the most common type in the selection answers; one voice at a time; a new order cuts the last one off
function alrAck(units, when) {
  const I = alrDisc.idx; if (!I || !units.length) return;
  const now = performance.now();
  if (when === 'select' && now - alrDisc.ackT < 450) return;
  const n = {}; for (const u of units) if (u.kind === 'unit' && u.owner === 0) n[u.type] = (n[u.type] || 0) + 1;
  const type = Object.keys(n).sort((a, b) => n[b] - n[a])[0]; if (!type) return;
  if (type === 'dog') { alrSfx('bark'); alrDisc.ackT = now; return; }      // the Corn Dog answers the only way it can
  const takes = I.vo[type + ':' + when]; if (!takes || !takes.length) return;
  let f = takes[(Math.random() * takes.length) | 0];
  if (takes.length > 1 && f === alrDisc.lastLine[type + when]) f = takes[(takes.indexOf(f) + 1) % takes.length];
  alrDisc.lastLine[type + when] = f;
  if (alrDisc.ack) { try { alrDisc.ack.g.gain.setTargetAtTime(0, alrA.ctx.currentTime, 0.02); alrDisc.ack.s.stop(alrA.ctx.currentTime + 0.1); } catch (e) { } }
  alrDiscOut();
  alrDisc.ack = alrDiscPlay(f, 'vo', 1.2, 1, alrDisc.radio);
  if (!alrDisc.ack) alrDiscBuf(f, 'vo');
  alrDisc.ackT = now;
}

// ---- the soundtrack ----------------------------------------------------------------------------------------------------
// each faction has its own theme (fac_<key>): on the skirmish screen it's the one you've got picked — pick another
// and the music crossfades to it — and in a game it's your base-building music. Fights keep the shared battle music.
function alrFacSong(f) { return f && alrDisc.idx && alrDisc.idx.music['fac_' + f] ? 'fac_' + f : null; }
function alrMusicWant() {
  if (alr.phase === 'over') return alr.result && alr.result.won ? 'victory' : 'defeat';
  if (alr.phase !== 'play') return (alr.ui && alr.ui.setup && !alr.ui.setup.hidden && alrFacSong(alr.ui.setupCfg && alr.ui.setupCfg.faction)) || 'menu';
  const P = alr.players[0];
  const fighting = alr.t - alrDisc.fightT < 20 || P.underAttack > 0;
  if (fighting) return alr.t > 900 && alrDisc.idx && alrDisc.idx.music.final ? 'final' : 'battle';
  return alrFacSong(P.faction) || 'build';
}
// called every frame while the game is open
function alrMusicStep() {
  const I = alrDisc.idx, C = alrA.ctx;
  if (!I || !C || C.state !== 'running') return;
  alrDiscOut();
  // decode the short clips as they arrive, a few a frame, so the first 'Building.' and the first shot are
  // already in memory (the songs decode when they're wanted: four decoded songs would be ~80 MB)
  let n = 0;
  for (const f in alrDisc.bytes) { if (n >= 4) break; if (!alrDisc.buf[f] && !f.startsWith('music/')) { alrDiscBuf(f, f.startsWith('vo/') ? 'vo' : 'sfx'); n++; } }
  // the music bus: on/off (N), ducked under Battle Control
  const tgt = (alrDisc.musicOn && !alrA.muted ? 0.7 : 0) * alrDisc.duck;
  alrDisc.musicBus.gain.setTargetAtTime(tgt, C.currentTime, 0.25);
  let want = alrMusicWant();
  // a fight has to last (or the base has to stay quiet) a while before the song changes back
  if (want !== 'battle' && want !== 'final' && alr.phase === 'play' && (alrDisc.musicKey === 'battle' || alrDisc.musicKey === 'final') && alr.t - alrDisc.fightT < 35) want = alrDisc.musicKey;
  const M = I.music[want];
  if (!M) return;
  if (!alrDisc.bytes[M.file]) alrDiscFetch(M.file);         // (a faction you just picked: fetch it now, not in turn)
  const cur = alrDisc.music;
  if (alrDisc.musicKey !== want) {
    const B = alrDiscBuf(M.file, 'music');
    if (!B) return;                                   // keep playing what we've got until the new one's ready
    if (cur) alrMusicFade(cur, 2.5);
    alrDisc.music = alrMusicStart(M.file, B, 2.5, M.loop);
    alrDisc.musicKey = want;
    return;
  }
  // a seamless loop: 3 s before the end, the same song starts again under a crossfade
  if (cur && M.loop && !cur.next && C.currentTime > cur.t0 + cur.dur - 3) {
    const B = alrDiscBuf(M.file, 'music');
    if (B) { cur.next = true; alrMusicFade(cur, 3); alrDisc.music = alrMusicStart(M.file, B, 3, true); }
  }
}
function alrMusicStart(f, B, fade, loop) {
  const C = alrA.ctx, s = C.createBufferSource(); s.buffer = B.buf;
  const g = C.createGain(); g.gain.setValueAtTime(0.0001, C.currentTime); g.gain.exponentialRampToValueAtTime(B.gain, C.currentTime + fade);
  s.connect(g); g.connect(alrDisc.musicBus); s.start(C.currentTime);
  return { s, g, t0: C.currentTime, dur: B.buf.duration, loop };
}
function alrMusicFade(m, secs) {
  const C = alrA.ctx;
  try { m.g.gain.cancelScheduledValues(C.currentTime); m.g.gain.setValueAtTime(Math.max(0.0001, m.g.gain.value), C.currentTime); m.g.gain.exponentialRampToValueAtTime(0.0001, C.currentTime + secs); m.s.stop(C.currentTime + secs + 0.1); } catch (e) { }
}
function alrMusicStop() { if (alrDisc.music) { alrMusicFade(alrDisc.music, 0.6); alrDisc.music = null; alrDisc.musicKey = ''; } alrDisc.evaQ = []; }
function alrMusicToggle() { alrDisc.musicOn = !alrDisc.musicOn; alrSay(alrDisc.musicOn ? 'MUSIC ON' : 'MUSIC OFF', '#8a92b0'); }
// fighting near your stuff keeps the battle music on (called from alrHit)
function alrMusicFight(x, z) {
  for (const e of alr.ents) if (e.owner === 0 && Math.abs(e.x - x) < 12 && Math.abs(e.z - z) < 12) { alrDisc.fightT = alr.t; return; }
}
