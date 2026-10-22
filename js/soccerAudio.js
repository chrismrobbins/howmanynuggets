// ---- ⚽ NUGGET SOCCER — the sound: a living crowd, the referee, the ball, two commentators, the menu theme ------------------
// Everything is pre-rendered ElevenLabs audio (tools/soccer-vo/render.py → audio/soccer/, its manifest index.json:
// { vo: {'pbp|GOAL': [files]}, music: {menu: {file, loop}}, sfx: {crowd1: file, …} }). A missing file is just silence.
// From the research (EA built its crowds from real match recordings): a steady bed, team chants that come and go,
// a swell when the ball's in the final third, an "ooh" for a shot that just misses, a roar for a goal and a chant a few
// seconds after it, whistles for fouls and offsides.
const SOC_AUDIO_V = 1;
const SA = { ctx: null, idx: null, buf: {}, loading: {}, on: false, gain: null, bus: {}, crowd: [], music: null, musicKey: '',
  vq: [], vBusy: false, last: {}, chantT: 20, idleT: 30, int: 0.5, opts: { sound: true, music: true, voice: true } };
try { Object.assign(SA.opts, JSON.parse(localStorage.getItem('nugSoccerAudio') || '{}')); } catch (e) { /* */ }

function socAudioOpen() { SA.on = true; socAudioManifest(); }
function socAudioClose() { SA.on = false; socCrowdStop(); socMusicTo(''); SA.vq = []; }
function socAudioWake() {
  if (!SA.ctx) {
    try { SA.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const C = SA.ctx;
    SA.gain = C.createGain(); SA.gain.gain.value = SA.opts.sound ? 0.9 : 0; SA.gain.connect(C.destination);
    for (const k of ['crowd', 'sfx', 'voice', 'music']) { const g = C.createGain(); g.gain.value = { crowd: 0.55, sfx: 0.75, voice: 1.0, music: 0.5 }[k]; g.connect(SA.gain); SA.bus[k] = g; }
  }
  if (SA.ctx.state === 'suspended') SA.ctx.resume();
}
function socAudioToggle(k) {
  SA.opts[k] = !SA.opts[k];
  try { localStorage.setItem('nugSoccerAudio', JSON.stringify(SA.opts)); } catch (e) { /* */ }
  if (SA.gain) SA.gain.gain.setTargetAtTime(SA.opts.sound ? 0.9 : 0, SA.ctx.currentTime, 0.05);
  if (k === 'music' && !SA.opts.music) socMusicTo('');
  if (k === 'voice' && !SA.opts.voice) SA.vq = [];
  if (typeof socMsg === 'function') socMsg({ sound: 'SOUND', music: 'MUSIC', voice: 'COMMENTARY' }[k] + (SA.opts[k] ? ' ON' : ' OFF'), '', '#9fb0c2', 1);
}
function socAudioManifest() {
  if (SA.idx || SA.idxLoading) return;
  SA.idxLoading = true;
  fetch('audio/soccer/index.json?v=' + SOC_AUDIO_V).then((r) => (r.ok ? r.json() : null)).then((I) => { SA.idx = I || { vo: {}, music: {}, sfx: {} }; if (I && I.music && I.music.menu) socLoad(I.music.menu.file); for (const k of ['crowd1', 'whistle_short', 'kick_pass1']) if (I && I.sfx && I.sfx[k]) socLoad(I.sfx[k]); }).catch(() => { SA.idx = { vo: {}, music: {}, sfx: {} }; });
}
// fetch + decode (a missing file resolves to null, once)
function socLoad(f) {
  if (!f) return Promise.resolve(null);
  if (SA.buf[f] !== undefined) return Promise.resolve(SA.buf[f]);
  if (SA.loading[f]) return SA.loading[f];
  return (SA.loading[f] = fetch('audio/soccer/' + f + '?v=' + SOC_AUDIO_V).then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b && SA.ctx ? new Promise((res) => SA.ctx.decodeAudioData(b, res, () => res(null))) : b ? (SA.raw = SA.raw || {}, SA.raw[f] = b, null) : null))
    .then((d) => { if (d || !SA.raw || !SA.raw[f]) SA.buf[f] = d; delete SA.loading[f]; return d; }).catch(() => { SA.buf[f] = null; return null; }));
}
function socPlay(f, bus, vol, rate, loop) {
  if (!SA.ctx || !f) return null;
  const B = SA.buf[f];
  if (B === undefined) { socLoad(f).then((d) => { if (d && !loop) socPlay(f, bus, vol, rate, loop); }); return null; }
  if (!B) return null;
  const C = SA.ctx, s = C.createBufferSource(), g = C.createGain();
  s.buffer = B; s.loop = !!loop; s.playbackRate.value = rate || 1;
  g.gain.value = vol == null ? 1 : vol;
  s.connect(g); g.connect(SA.bus[bus] || SA.gain); s.start();
  return { s, g };
}
const socSfxFile = (k) => SA.idx && SA.idx.sfx && SA.idx.sfx[k];
function socSfx(k, vol, rate) { if (!SA.opts.sound) return; const opts = [k, k + '1', k + '2'].map(socSfxFile).filter(Boolean); const f = opts[(Math.random() * opts.length) | 0]; return socPlay(f, 'sfx', vol, rate || 0.96 + Math.random() * 0.08); }
function socAudioClick() { socSfx('kick_pass', 0.25, 1.4); }

// ---- the music: the menu theme on the menus, nothing over a match (the crowd is the soundtrack) -------------------------
function socMusicTo(key) {
  if (SA.musicKey === key) return;
  SA.musicKey = key;
  if (SA.music) { const m = SA.music; m.g.gain.setTargetAtTime(0, SA.ctx.currentTime, 0.5); setTimeout(() => { try { m.s.stop(); } catch (e) { /* */ } }, 2500); SA.music = null; }
  if (!key || !SA.opts.music || !SA.idx || !SA.idx.music || !SA.idx.music[key]) return;
  const M = SA.idx.music[key];
  socLoad(M.file).then((d) => { if (!d || SA.musicKey !== key) return; const p = socPlay(M.file, 'music', 0.0001, 1, M.loop); if (p) { p.g.gain.setTargetAtTime(0.85, SA.ctx.currentTime, 0.6); SA.music = p; } });
}

// a one-shot from the music set (the goal sting, the trophy fanfare), over whatever's playing
function socSting(key, vol) { if (!SA.opts.music || !SA.idx || !SA.idx.music || !SA.idx.music[key]) return; const f = SA.idx.music[key].file; socLoad(f).then((d) => { if (d) socPlay(f, 'music', vol || 0.8, 1, false); }); }
// ---- the crowd: two beds crossfading, an intensity that follows the danger ---------------------------------------------------
function socCrowdStart() {
  if (SA.crowd.length || SA.crowdStarting || !SA.ctx || !SA.idx) return;
  SA.crowdStarting = true; setTimeout(() => { SA.crowdStarting = false; }, 4000);
  for (const k of ['crowd1', 'crowd2']) { const f = socSfxFile(k); if (!f) continue; socLoad(f).then((d) => { if (!d || !SA.on) return; const p = socPlay(f, 'crowd', 0.0001, 1, true); if (p) { p.g.gain.setTargetAtTime(0.5, SA.ctx.currentTime, 1.5); SA.crowd.push(p); } }); }
}
function socCrowdStop() { SA.crowdStarting = false; for (const p of SA.crowd) { try { p.g.gain.setTargetAtTime(0, SA.ctx.currentTime, 0.4); const s = p.s; setTimeout(() => { try { s.stop(); } catch (e) { /* */ } }, 2000); } catch (e) { /* */ } } SA.crowd = []; }
function socAudioMatch() { SA.vq = []; SA.chantT = 12 + Math.random() * 10; SA.idleT = 40; socMusicTo(''); }

// ---- per frame ------------------------------------------------------------------------------------------------------------------
function socAudioFrame(dt, M, screen) {
  if (!SA.ctx || !SA.on) return;
  const inMatch = M && screen === 'match';
  socMusicTo(inMatch ? '' : 'menu');
  if (inMatch) socCrowdStart(); else if (SA.crowd.length && screen !== 'match') socCrowdStop();
  if (!inMatch) return;
  // the danger: the ball in a final third (and more in the box) lifts the crowd
  const B = M.ball, ax = Math.abs(B.x), box = ax > SOC.HL - SOC.BOX && Math.abs(B.z) < SOC.BOXW;
  const want = M.phase === 'goal' ? 1 : box ? 0.92 : ax > SOC.HL - 30 ? 0.72 : 0.5;
  SA.int += (want - SA.int) * Math.min(1, dt * (want > SA.int ? 2.5 : 0.6));
  SA.crowd.forEach((p, i) => p.g.gain.setTargetAtTime((i === 0 ? 0.55 : 0.35) * (0.6 + SA.int * 0.7), SA.ctx.currentTime, 0.3));
  // the chants come and go
  if ((SA.chantT -= dt) <= 0) { SA.chantT = 18 + Math.random() * 22; if (M.phase === 'play') socSfx('chant' + (1 + ((Math.random() * 3) | 0)), 0.55); }
  // the co-commentator fills a quiet spell
  if (M.phase === 'play' && (SA.idleT -= dt) <= 0) { SA.idleT = 35 + Math.random() * 30; socSay('col', 'IDLE', 1); }
  socVoiceNext();
}

// ---- the match's events → the crowd, the referee, the ball, the commentary ------------------------------------------------------
function socAudioEvent(e, M) {
  if (!SA.ctx) return;
  const k = e.kind;
  if (k === 'kick') {
    if (e.what === 'shot') socSfx('kick_shot', 0.9); else socSfx('kick_pass', socClamp(0.25 + (e.v || 8) / 28, 0.3, 0.8));
  } else if (k === 'bounce' && e.v > 3) socSfx('bounce', socClamp(e.v / 10, 0.15, 0.5));
  else if (k === 'post') { socSfx('post', 0.9); socSfx('ooh', 0.8); socSay('pbp', 'POST', 3); }
  else if (k === 'whistle') socSfx('whistle_short', 0.7);
  else if (k === 'tackle') { socSfx(e.slide ? 'slide' : 'tackle', 0.7); if (e.slide && Math.random() < 0.5) { socSay('pbp', 'TACKLE', 1); socLater(1.5, () => Math.random() < 0.3 && socSay('col', 'TACKLE', 1)); } }
  else if (k === 'foul') { socSfx('whistle_short', 0.85); socSfx('boo', 0.4); socSay('pbp', 'FOUL', 2); socLater(1.6, () => Math.random() < 0.4 && socSay('col', 'FOUL', 1)); }
  else if (k === 'yellow') socSay('pbp', 'YELLOW', 3);
  else if (k === 'red') { socSfx('boo', 0.7); socSay('pbp', 'RED', 4); }
  else if (k === 'penalty') { socSfx('whistle_long', 0.9); socSay('pbp', 'PENALTY', 4); }
  else if (k === 'offside') { socSfx('whistle_short', 0.8); socSay('pbp', 'OFFSIDE', 2); }
  else if (k === 'corner') { if (Math.random() < 0.55) socSay('pbp', 'CORNER', 1); }
  else if (k === 'restarted' && e.what === 'free' && Math.random() < 0.4) socSay('pbp', 'FREEKICK', 1);
  else if (k === 'catch') socSfx('catch', 0.7);
  else if (k === 'save') { socSfx('applause', 0.6); if (e.great) socSfx('ooh', 0.7); socSay('pbp', e.great ? 'SAVE_GREAT' : 'SAVE', 3); socLater(2.2, () => Math.random() < 0.45 && socSay('col', 'SAVE', 1)); }
  else if (k === 'miss') { socSfx('ooh', 0.85); socSay('pbp', 'MISS', 2); socLater(1.8, () => Math.random() < 0.35 && socSay('col', 'MISS', 1)); }
  else if (k === 'goal') {
    socSfx('net', 0.9); socSfx('roar', 1.0); SA.int = 1;
    if (M.human === e.team) socLater(0.6, () => socSting('goal', 0.7));
    socLater(4.5, () => socSfx('chant' + (1 + ((Math.random() * 3) | 0)), 0.7));
    const key = e.own ? 'OWN_GOAL' : e.kind2 || ({ great: 'GOAL_GREAT', header: 'GOAL_HEADER', pen: 'GOAL_PEN' }[e.what || e.kindGoal] || (e.late ? 'LATE_GOAL' : e.eq ? 'EQUALISER' : 'GOAL'));
    SA.vq = [];
    socSay('pbp', socGoalKey(e), 5);
    socLater(1.7, () => socSay('pbp', 'TEAM_' + M.T[e.team].id, 5));
    socLater(4.2, () => socSay('col', 'GOAL', 2));
    void key;
  } else if (k === 'halftime') { socSfx('whistle_long', 0.9); socSay('pbp', 'HALFTIME', 4); socLater(2.5, () => socSay('col', 'HALFTIME', 2)); }
  else if (k === 'fulltime') { socSfx('whistle_end', 1.0); if (e.pens && !e.win && e.win !== 0) { socSay('pbp', 'SHOOTOUT_START', 4); } else { const h = M.human, won = e.win != null ? e.win === h : M.score[h] > M.score[1 - h]; socSay('pbp', M.score[0] === M.score[1] && e.win == null ? 'FULLTIME_DRAW' : 'FULLTIME_WIN', 4); if (won) socLater(3.5, () => socSay('col', 'FULLTIME_WIN', 2)); if (M.cup && won && M.round === 'Final') socLater(3, () => { socSay('pbp', 'CUP_WINNERS', 5); socSfx('roar', 0.9); socSting('cupwin', 0.9); socLater(4, () => socSay('col', 'CUP_WINNERS', 3)); }); } }
  else if (k === 'shootout') socSay('pbp', 'SHOOTOUT_START', 4);
  else if (k === 'pen_goal') { socSfx('net', 0.8); socSfx('roar', 0.7); socSay('pbp', 'SHOOTOUT_SCORE', 3); }
  else if (k === 'pen_miss') { socSfx('ooh', 0.8); socSay('pbp', 'SHOOTOUT_MISS', 3); }
  else if (k === 'secondhalf' || k === 'restarted' && e.what === 'kickoff' && M.t < 3) { socSfx('whistle_short', 0.8); if (M.t < 3) { socSay('pbp', 'KICKOFF', 3); if (M.round === 'Final') socSay('pbp', 'CUP_FINAL_INTRO', 4); } }
}
// which goal call: the event's kind (soccer.js socGoal: own / header / pen / great / goal) and the moment
function socGoalKey(e) {
  if (e.own) return 'OWN_GOAL';
  const g = e.what || '';
  if (g === 'header') return 'GOAL_HEADER';
  if (g === 'pen') return 'GOAL_PEN';
  if (g === 'great') return 'GOAL_GREAT';
  if (e.late) return 'LATE_GOAL';
  if (e.eq) return 'EQUALISER';
  return 'GOAL';
}
function socLater(s, fn) { setTimeout(() => { if (SA.on) fn(); }, s * 1000); }

// ---- the commentary queue: one line at a time, the important ones jump it, the same line not twice running -------------------
function socSay(who, key, pri) {
  if (!SA.opts.voice || !SA.idx || !SA.idx.vo) return;
  const files = SA.idx.vo[who + '|' + key];
  if (!files || !files.length) return;
  const now = performance.now() / 1000;
  if (SA.last[who + key] && now - SA.last[who + key] < (pri >= 4 ? 2 : 12)) return;
  // a high-priority call clears the small talk in front of it
  if (pri >= 4) SA.vq = SA.vq.filter((q) => q.pri >= 4);
  if (SA.vq.length > 2 && pri < 3) return;
  let f = files[(Math.random() * files.length) | 0];
  if (files.length > 1 && f === SA.lastFile) f = files[(files.indexOf(f) + 1) % files.length];
  SA.vq.push({ f, pri, t: now, key: who + key });
  socLoad(f);
}
function socVoiceNext() {
  if (SA.vBusy || !SA.vq.length) return;
  const now = performance.now() / 1000;
  // a stale line (an old shout about a moment long gone) is dropped
  while (SA.vq.length && now - SA.vq[0].t > (SA.vq[0].pri >= 4 ? 6 : 3.5)) SA.vq.shift();
  const q = SA.vq[0]; if (!q) return;
  const B = SA.buf[q.f]; if (B === undefined) return;      // still loading
  SA.vq.shift();
  if (!B) return;
  SA.vBusy = true; SA.lastFile = q.f; SA.last[q.key] = now;
  // the crowd ducks a touch under the voice
  for (const p of SA.crowd) p.g.gain.setTargetAtTime(0.3, SA.ctx.currentTime, 0.15);
  const p = socPlay(q.f, 'voice', 1, 1, false);
  if (!p) { SA.vBusy = false; return; }
  p.s.onended = () => { SA.vBusy = false; };
}
