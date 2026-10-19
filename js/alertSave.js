// ---- 🚨 NUGGET ALERT — saved games -------------------------------------------------------------------------
// Chris: "we need the ability to save games and come back to them. let people save the game and call it
// whatever they want". Pause (Esc / ☰) → SAVE GAME: type a name, it's kept in this browser (IndexedDB — a big
// map's battle is ~100 KB gzipped, more than localStorage likes holding a dozen of). LOAD GAME is in the same
// menu and on the skirmish screen.
//
// What a save is: every field of `alr` that's the battle (not the UI's), with the cross-links flattened —
//   an entity pointing at another (a target, a pad's building) → { $e: id }   (passengers aboard a carrier are
//     saved whole inside its `load`; they're out of the world, so nothing else owns them)
//   a unit / building definition → { $D: 'u:tank' }, a weapon → { $W: 'cannon' }  (re-linked on load, so a
//     save carries no stale copies of the rules)
//   typed arrays (the map's grids, the shroud) → { $t: 'Float32Array', b: base64 }
// The map itself is saved whole (ore mined, bridges down, walls of rubble) — the world is rebuilt from it.
// Nothing new in `alr` needs registering here: anything not on the skip list rides along.

const ALR_SAVE_V = 1;
const ALR_SAVE_SKIP = new Set(['on', 'phase', 'tierPick', 'paused', 'acc', 'auto', 'byId', 'sel', 'fx', 'msgs', 'place', 'mode', 'ui', 'uiT', 'shroudDirty', 'cfg', 'cam',
  'later']);   // (later: a salvo's second shot, 0.12 s away, as a callback — dropped; a load starts with none)

function alrB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function alrUnB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const ALR_TYPED = { Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array };

function alrSaveEncode() {
  const Dk = new Map(), Wk = new Map();
  for (const k in ALR_UNIT) Dk.set(ALR_UNIT[k], 'u:' + k);
  for (const k in ALR_BLD) Dk.set(ALR_BLD[k], 'b:' + k);
  for (const k in ALR_WPN) Wk.set(ALR_WPN[k], k);
  const isEnt = (v) => (v.kind === 'unit' || v.kind === 'bld') && typeof v.id === 'number' && v.D && typeof v.type === 'string';
  const enc = (v, whole) => {
    if (v == null) return v;
    if (typeof v === 'number') return isFinite(v) ? v : { $n: String(v) };
    if (typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (Dk.has(v)) return { $D: Dk.get(v) };
    if (Wk.has(v)) return { $W: Wk.get(v) };
    if (ArrayBuffer.isView(v)) return { $t: v.constructor.name, b: alrB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (v instanceof Map) return { $map: [...v].map(([a, b]) => [enc(a), enc(b)]) };
    if (typeof Node !== 'undefined' && v instanceof Node) return undefined;
    if (!whole && isEnt(v)) return { $e: v.id };
    if (Array.isArray(v)) return v.map((x) => { const y = enc(x); return y === undefined ? null : y; });
    const o = {};
    for (const k in v) {
      if (k[0] === '_') continue;                           // caches (the pathfinder's buffers, the water blur)
      const y = k === 'load' && Array.isArray(v[k]) ? v[k].map((p) => enc(p, true)) : enc(v[k]);
      if (y !== undefined) o[k] = y;
    }
    return o;
  };
  const S = { v: ALR_SAVE_V, tier: alr.cfg && alr.cfg.key, cam: { x: alr.cam.x, z: alr.cam.z, zoom: alr.cam.zoom } };
  for (const k of Object.keys(alr)) {
    if (ALR_SAVE_SKIP.has(k) || k[0] === '_') continue;
    S[k] = k === 'ents' ? alr.ents.map((e) => enc(e, true)) : enc(alr[k]);
  }
  return S;
}

function alrSaveDecode(S) {
  const refs = [];
  const dec = (v) => {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(dec);
    if ('$D' in v) { const [g, k] = v.$D.split(':'); return (g === 'u' ? ALR_UNIT : ALR_BLD)[k]; }
    if ('$W' in v) return ALR_WPN[v.$W];
    if ('$t' in v) { const u = alrUnB64(v.b), T = ALR_TYPED[v.$t] || Uint8Array; return new T(u.buffer, 0, u.byteLength / T.BYTES_PER_ELEMENT); }
    if ('$n' in v) return Number(v.$n);
    if ('$map' in v) return new Map(v.$map.map(([a, b]) => [dec(a), dec(b)]));
    if ('$e' in v) { const r = { __ref: v.$e }; refs.push(r); return r; }
    const o = {}; for (const k in v) o[k] = dec(v[k]); return o;
  };
  const out = {};
  for (const k in S) out[k] = dec(S[k]);
  // every entity, in the world or aboard a carrier, by id; then the links put back
  const all = new Map();
  const reg = (e) => { all.set(e.id, e); if (Array.isArray(e.load)) e.load.forEach(reg); };
  out.ents = (out.ents || []).filter((e) => e && e.D);       // (a type that's gone from the rules is dropped, not a crash)
  out.ents.forEach(reg);
  const fix = (v, seen) => {
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || seen.has(v)) return v;
    if ('__ref' in v) return all.get(v.__ref) || null;
    seen.add(v);
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = fix(v[i], seen); }
    else if (v instanceof Map) { for (const [a, b] of v) v.set(a, fix(b, seen)); }
    else for (const k in v) { if (k === 'D' || k === 'W') continue; v[k] = fix(v[k], seen); }
    return v;
  };
  const seen = new Set();
  for (const k in out) out[k] = fix(out[k], seen);
  return out;
}

// ---- the store (IndexedDB: 'meta' for the list, 'data' for the battles) ------------------------------------------
function alrSaveDB() {
  if (alrSaveDB.p) return alrSaveDB.p;
  alrSaveDB.p = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('no storage in this browser')); return; }
    const r = indexedDB.open('nugAlertSaves', 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('meta', { keyPath: 'name' }); db.createObjectStore('data', { keyPath: 'name' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('storage unavailable'));
  });
  alrSaveDB.p.catch(() => { alrSaveDB.p = null; });
  return alrSaveDB.p;
}
function alrSaveTx(stores, mode, fn) {
  return alrSaveDB().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(stores, mode); let out;
    Promise.resolve(fn(tx, (v) => { out = v; })).catch(rej);
    tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('save aborted'));
  }));
}
const alrReq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function alrPack(obj) {
  const s = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') return { z: false, s };
  const buf = await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return { z: true, b: buf };
}
async function alrUnpack(d) {
  if (!d.z) return JSON.parse(d.s);
  return JSON.parse(await new Response(new Blob([d.b]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
function alrSavesList() {
  return alrSaveTx(['meta'], 'readonly', (tx, done) => alrReq(tx.objectStore('meta').getAll()).then((a) => done(a.sort((x, y) => y.when - x.when))));
}
async function alrSaveWrite(name) {
  alrPaidNote(true);
  const S = alrSaveEncode(), P = alr.players[0], def = alrMapDef(alr.mapKey);
  const packed = await alrPack(S);
  const meta = { name, when: Date.now(), map: def.name, emoji: def.emoji, N: def.N, side: ALR_SIDES[P.side].name, nAI: alr.nAI, tier: alr.cfg ? alr.cfg.name : '', t: alr.t, credits: Math.round(P.credits), v: ALR_SAVE_V, kb: Math.round((packed.b ? packed.b.byteLength : packed.s.length) / 1024) };
  await alrSaveTx(['meta', 'data'], 'readwrite', (tx) => { tx.objectStore('meta').put(meta); tx.objectStore('data').put(Object.assign({ name }, packed)); });
  return meta;
}
function alrSaveDelete(name) { return alrSaveTx(['meta', 'data'], 'readwrite', (tx) => { tx.objectStore('meta').delete(name); tx.objectStore('data').delete(name); }); }
async function alrSaveRead(name) {
  const d = await alrSaveTx(['data'], 'readonly', (tx, done) => alrReq(tx.objectStore('data').get(name)).then(done));
  if (!d) throw new Error('that save is gone');
  return alrUnpack(d);
}

// ---- what each battle has paid (so a load can't pay the same fight twice) ------------------------------------------
function alrPaidAll() { try { return JSON.parse(localStorage.getItem('nugAlertPaid') || '{}'); } catch (e) { return {}; } }
function alrPaidNote(now) {
  if (!alr.battle) return;
  const t = Date.now(); if (!now && t - (alrPaidNote.t || 0) < 3000) return; alrPaidNote.t = t;
  try {
    const a = alrPaidAll();
    if ((a[alr.battle] || 0) < alr.paidTo) {
      a[alr.battle] = Math.round(alr.paidTo);
      const ks = Object.keys(a); if (ks.length > 300) for (const k of ks.sort().slice(0, ks.length - 300)) delete a[k];   // (ids start with the time: oldest first)
      localStorage.setItem('nugAlertPaid', JSON.stringify(a));
    }
  } catch (e) { /* private mode: the in-memory guard still holds */ }
}

// ---- back into the battle --------------------------------------------------------------------------------------
function alrLoadGame(S) {
  if (!S || S.v !== ALR_SAVE_V || !S.M || !S.players) throw new Error('not a Nugget Alert save this version can read');
  const D = alrSaveDecode(S);
  if (alr.battle) { alrPaidNote(true); }
  const prevBattle = alr.battle, prevPaid = alr.paidTo || 0;
  alr.phase = 'loading';
  alr.paused = false; if (alr.ui) { alr.ui.menu.hidden = true; alr.ui.end.hidden = true; if (alr.ui.setup) alr.ui.setup.hidden = true; }
  ALR_N = D.M.N;
  alr._pg = alr._pf = alr._pp = alr._pm = alr._pc = null; alr._pgen = 0;
  for (const k in D) if (!['v', 'tier', 'cam'].includes(k)) alr[k] = D[k];
  alr.cfg = ALR_TIERS.find((t) => t.key === S.tier) || ALR_TIERS[0];
  // the most this battle has paid, in any timeline: the save's, this session's (loading over itself), this browser's
  const same = prevBattle && prevBattle === D.battle ? prevPaid : 0;
  alr.paidTo = Math.max(D.paidTo || 0, D.earned || 0, same, (alrPaidAll()[D.battle] || 0));
  alr.byId = new Map(); for (const e of alr.ents) alr.byId.set(e.id, e);
  alr.sel = []; alr.fx = []; alr.msgs = []; alr.place = null; alr.mode = ''; alr.acc = 0; alr.later = [];
  alr.groups = alr.groups || {};
  alr.M.oreVer = (alr.M.oreVer || 0) + 1;
  Object.assign(alr.cam, S.cam || {});
  alrUILoading(true);
  setTimeout(() => {
    alrUIBuildWorld();
    alr.shroudDirty = true;
    alrPowerAll();
    alrUILoading(false);
    alr.phase = 'play';
    alr.ui.root.classList.add('alr-playing');
    alrUISide(true);
    alrSay('GAME LOADED', '#9be7ff');
    alrSfx('ready');
  }, 40);
}

// ---- the panel: SAVE (a name, and the saves you could write over) / LOAD (the list) ---------------------------------
function alrSavesOpen(mode) {
  const U = alr.ui;
  if (!U.saves) {
    const d = document.createElement('div'); d.className = 'alr-card alr-saves'; d.hidden = true;
    U.root.appendChild(d); U.saves = d;
    d.addEventListener('click', (e) => {
      const a = e.target.closest('[data-sv]'); if (!a) return;
      alrAudioWake();
      const act = a.dataset.sv, name = a.closest('[data-name]') && a.closest('[data-name]').dataset.name;
      if (act === 'back') { alrSavesClose(); alrSfx('click'); }
      else if (act === 'save') alrSavesDoSave();
      else if (act === 'pick' && U.saves.mode === 'save') { const inp = d.querySelector('.alr-save-name'); inp.value = name; alrSavesName(); inp.focus(); alrSfx('click'); }
      else if (act === 'load' || (act === 'pick' && U.saves.mode === 'load')) alrSavesDoLoad(name);
      else if (act === 'del') {
        if (a.dataset.sure) { alrSaveDelete(name).then(() => alrSavesRender()).catch((er) => alrSavesErr(er)); alrSfx('sell'); }
        else { a.dataset.sure = '1'; a.textContent = 'SURE?'; setTimeout(() => { if (a.isConnected) { delete a.dataset.sure; a.textContent = '✕'; } }, 2500); }
      }
    });
    d.addEventListener('input', (e) => { if (e.target.classList.contains('alr-save-name')) alrSavesName(); });
    d.addEventListener('keydown', (e) => { if (e.target.classList.contains('alr-save-name')) { if (e.key === 'Enter') { e.preventDefault(); alrSavesDoSave(); } else if (e.key === 'Escape') { e.preventDefault(); alrSavesClose(); } } e.stopPropagation(); });
  }
  const d = U.saves; d.mode = mode; d.from = !U.menu.hidden ? 'menu' : U.setup && !U.setup.hidden ? 'setup' : '';
  U.menu.hidden = true; if (U.setup) U.setup.classList.add('alr-dim');
  const def = alrMapDef(alr.mapKey), mm = Math.floor((alr.t || 0) / 60);
  d.innerHTML = mode === 'save'
    ? `<div class="alr-card-t">SAVE GAME</div>
       <div class="alr-save-row"><input class="alr-save-name" type="text" maxlength="40" spellcheck="false" autocomplete="off" placeholder="call it anything">
       <button type="button" data-sv="save" class="alr-save-go">SAVE</button></div>
       <div class="alr-save-hint">${def.emoji} ${def.name} · ${String(mm).padStart(2, '0')}:${String(Math.floor((alr.t || 0) % 60)).padStart(2, '0')} in · saved in this browser</div>
       <div class="alr-save-list"></div><button type="button" data-sv="back">BACK</button>`
    : `<div class="alr-card-t">LOAD GAME</div><div class="alr-save-list"></div><button type="button" data-sv="back">BACK</button>`;
  d.hidden = false;
  if (mode === 'save') { const inp = d.querySelector('.alr-save-name'); inp.value = `${def.name} · ${ALR_SIDES[alr.players[0].side].name} · ${String(mm).padStart(2, '0')}m`; setTimeout(() => { inp.focus(); inp.select(); }, 0); }
  alrSavesRender();
}
function alrSavesClose() {
  const U = alr.ui; if (!U.saves) return;
  U.saves.hidden = true;
  if (U.setup) U.setup.classList.remove('alr-dim');
  if (U.saves.from === 'menu' && alr.paused) U.menu.hidden = false;
}
function alrSavesErr(er) { const l = alr.ui.saves.querySelector('.alr-save-list'); if (l) l.innerHTML = `<div class="alr-save-empty">${String((er && er.message) || er).replace(/</g, '&lt;')}</div>`; alrSfx('error'); }
function alrSavesName() {
  const d = alr.ui.saves, inp = d.querySelector('.alr-save-name'), go = d.querySelector('.alr-save-go');
  if (!inp || !go) return;
  const n = inp.value.trim();
  go.textContent = d.names && d.names.has(n) ? 'OVERWRITE' : 'SAVE';
  go.disabled = !n;
}
function alrSavesRender() {
  const d = alr.ui.saves, list = d.querySelector('.alr-save-list');
  list.innerHTML = '<div class="alr-save-empty">…</div>';
  alrSavesList().then((all) => {
    d.names = new Set(all.map((m) => m.name));
    alrSavesName();
    if (!all.length) { list.innerHTML = `<div class="alr-save-empty">${d.mode === 'load' ? 'no saved games yet — pause a battle (Esc) and SAVE GAME' : 'nothing saved yet'}</div>`; return; }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    list.innerHTML = all.map((m) => `<div class="alr-save-item" data-name="${esc(m.name)}">
        <button type="button" class="alr-save-pick" data-sv="pick"><b>${esc(m.name)}</b>
          <span>${m.emoji || ''} ${esc(m.map)} · ${esc(m.side)} vs ${m.nAI} · ${esc(m.tier)} · ${clock(m.t || 0)} · $${(m.credits || 0).toLocaleString()}</span>
          <i>${new Date(m.when).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</i></button>
        ${d.mode === 'load' ? '<button type="button" class="alr-save-load" data-sv="load">LOAD</button>' : ''}
        <button type="button" class="alr-save-del" data-sv="del" title="delete">✕</button></div>`).join('');
  }).catch((er) => alrSavesErr(er));
}
function alrSavesDoSave() {
  const d = alr.ui.saves, inp = d.querySelector('.alr-save-name'), n = inp && inp.value.trim();
  if (!n || alr.phase !== 'play') return;
  const go = d.querySelector('.alr-save-go'); go.disabled = true; go.textContent = 'SAVING…';
  alrSaveWrite(n).then(() => { alrSfx('cash'); alrSavesClose(); alrSay('GAME SAVED · ' + n.toUpperCase(), '#9bff9b'); })
    .catch((er) => { alrSavesErr(er); go.disabled = false; alrSavesName(); });
}
function alrSavesDoLoad(name) {
  const d = alr.ui.saves;
  d.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  alrSaveRead(name).then((S) => { d.hidden = true; if (alr.ui.setup) alr.ui.setup.classList.remove('alr-dim'); alrLoadGame(S); })
    .catch((er) => { alrSavesErr(er); d.querySelectorAll('button').forEach((b) => { b.disabled = false; }); });
}
