// ---- Accounts, high scores, and leaderboards (frontend) ---------------------
// Ties the API client (js/api.js) to the UI: sign in/up, the "Your High Scores"
// panel, and the leaderboard modal. storm.js calls window.onArcadeScore() when a
// game ends; if the user is signed in, we submit the score here.
(function () {
  const API = window.NuggetAPI;
  const fmtNum = (n) => (typeof fmt !== 'undefined' ? fmt.format(n) : String(n));

  // Account bar
  const accountBtn = document.getElementById('accountBtn');
  const accountAvatar = document.getElementById('accountAvatar');
  const accountLabel = document.getElementById('accountLabel');

  // Auth modal
  const authModal = document.getElementById('authModal');
  const authClose = document.getElementById('authClose');
  const authTitle = document.getElementById('authTitle');
  const authForms = document.getElementById('authForms');
  const authMenu = document.getElementById('authMenu');
  const authTabs = document.getElementById('authTabs');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const menuAvatar = document.getElementById('menuAvatar');
  const menuDisplay = document.getElementById('menuDisplay');
  const menuUsername = document.getElementById('menuUsername');
  const menuLogout = document.getElementById('menuLogout');
  const menuLeaderboards = document.getElementById('menuLeaderboards');

  // My High Scores panel
  const myScores = document.getElementById('myScores');
  const myCatch = document.getElementById('myCatch');
  const myBlaster = document.getElementById('myBlaster');
  const myFlappy = document.getElementById('myFlappy');
  const myDunk = document.getElementById('myDunk');
  const mySim = document.getElementById('mySim');
  const myRun = document.getElementById('myRun');
  const myKnight = document.getElementById('myKnight');
  const myBrawl = document.getElementById('myBrawl');
  const myRanch = document.getElementById('myRanch');
  const myKart = document.getElementById('myKart');
  const myReel = document.getElementById('myReel');
  const myGta = document.getElementById('myGta');
  const myBeat = document.getElementById('myBeat');

  // Leaderboard modal
  const openLeaderboards = document.getElementById('openLeaderboards');
  const lbModal = document.getElementById('lbModal');
  const lbClose = document.getElementById('lbClose');
  const lbTabs = document.getElementById('lbTabs');
  const lbBody = document.getElementById('lbBody');

  // Admin portal (admins only)
  const menuAdmin = document.getElementById('menuAdmin');
  const adminModal = document.getElementById('adminModal');
  const adminClose = document.getElementById('adminClose');
  const adminTabs = document.getElementById('adminTabs');
  const adminBody = document.getElementById('adminBody');

  let currentUser = null;
  let isAdmin = false;
  let lbGame = 'catch';
  let adminTab = 'overview';

  const initials = (name) => (name || '?').trim().slice(0, 1).toUpperCase();
  const esc = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function setScores(scores) {
    scores = scores || { catch: 0, blaster: 0, flappy: 0, dunk: 0, sim: 0, run: 0, knight: 0, brawl: 0, ranch: 0, kart: 0, reel: 0, gta: 0, beat: 0 };
    myCatch.textContent = fmtNum(scores.catch || 0);
    myBlaster.textContent = fmtNum(scores.blaster || 0);
    myFlappy.textContent = fmtNum(scores.flappy || 0);
    myDunk.textContent = fmtNum(scores.dunk || 0);
    mySim.textContent = fmtNum(scores.sim || 0);
    myRun.textContent = fmtNum(scores.run || 0);
    myKnight.textContent = fmtNum(scores.knight || 0);
    myBrawl.textContent = fmtNum(scores.brawl || 0);
    myRanch.textContent = fmtNum(scores.ranch || 0);
    myKart.textContent = fmtNum(scores.kart || 0);
    myReel.textContent = fmtNum(scores.reel || 0);
    myGta.textContent = fmtNum(scores.gta || 0);
    myBeat.textContent = fmtNum(scores.beat || 0);
  }

  function applyUser(user, scores, admin) {
    currentUser = user;
    isAdmin = !!admin;
    if (menuAdmin) menuAdmin.style.display = isAdmin ? '' : 'none';
    if (user) {
      accountAvatar.style.display = '';
      accountAvatar.textContent = initials(user.displayName);
      accountLabel.textContent = user.displayName;
      myScores.classList.add('active');
      setScores(scores);
    } else {
      accountAvatar.style.display = 'none';
      accountLabel.textContent = 'Sign in';
      myScores.classList.remove('active');
      setScores(null);
      if (adminModal) closeModal(adminModal);
    }
  }

  // ---- Modal plumbing ----
  const openModal = (el) => el.classList.add('active');
  const closeModal = (el) => el.classList.remove('active');

  function clearErrors() {
    loginError.classList.remove('active'); loginError.textContent = '';
    registerError.classList.remove('active'); registerError.textContent = '';
  }
  function showError(el, msg) { el.textContent = msg; el.classList.add('active'); }

  function setTab(tab) {
    authTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    loginForm.style.display = tab === 'login' ? '' : 'none';
    registerForm.style.display = tab === 'register' ? '' : 'none';
  }

  function showAuthState() {
    if (currentUser) {
      authForms.style.display = 'none';
      authMenu.style.display = '';
      authTitle.textContent = 'Account';
      menuAvatar.textContent = initials(currentUser.displayName);
      menuDisplay.textContent = currentUser.displayName;
      menuUsername.textContent = '@' + currentUser.username;
    } else {
      authForms.style.display = '';
      authMenu.style.display = 'none';
      authTitle.textContent = 'Sign in';
      setTab('login');
    }
    clearErrors();
  }

  accountBtn.addEventListener('click', () => { showAuthState(); openModal(authModal); });
  authClose.addEventListener('click', () => closeModal(authModal));
  authTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { clearErrors(); setTab(b.dataset.tab); }
  });
  authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(authModal); });
  lbModal.addEventListener('click', (e) => { if (e.target === lbModal) closeModal(lbModal); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(authModal); closeModal(lbModal); if (adminModal) closeModal(adminModal); }
  });

  // ---- Login / register / logout ----
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = loginForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await API.login(loginForm.username.value, loginForm.password.value);
      API.setToken(res.token);
      loginForm.reset();
      const meRes = await API.me().catch(() => ({ user: res.user, scores: null }));
      applyUser(meRes.user || res.user, meRes.scores, meRes.isAdmin);
      closeModal(authModal);
    } catch (err) {
      showError(loginError, err.message);
    } finally { btn.disabled = false; }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const btn = registerForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await API.register(
        registerForm.username.value, registerForm.displayName.value, registerForm.password.value);
      API.setToken(res.token);
      registerForm.reset();
      applyUser(res.user, { catch: 0, blaster: 0, flappy: 0 }, false);
      closeModal(authModal);
    } catch (err) {
      showError(registerError, err.message);
    } finally { btn.disabled = false; }
  });

  menuLogout.addEventListener('click', async () => {
    try { await API.logout(); } catch {}
    API.setToken('');
    applyUser(null);
    closeModal(authModal);
  });

  // ---- Leaderboards ----
  const GAME_LABEL = { catch: '🧺 Catch', blaster: '🎯 Blaster', flappy: '🐤 Flappy', dunk: '🥣 Dunk', sim: '🧘 Sim', run: '🏃 Run', knight: '⚔️ Knight', brawl: '🥊 Brawl', ranch: '🐔 Ranch', kart: '🏎️ Fast Food', reel: '🎣 Reel', gta: '🚔 GTN', beat: '🎧 Dip Hop' };

  menuLeaderboards.addEventListener('click', () => { closeModal(authModal); openLb(); });
  openLeaderboards.addEventListener('click', openLb);
  lbClose.addEventListener('click', () => closeModal(lbModal));
  lbTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setLbGame(b.dataset.game);
  });

  function openLb() { openModal(lbModal); loadLb(); }
  function setLbGame(game) {
    lbGame = game;
    lbTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.game === game));
    loadLb();
  }

  function rowHtml(r, isMe) {
    const cls = 'lb-row' + (isMe ? ' me' : '') + (r.rank === 1 ? ' top1' : '');
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '#' + r.rank;
    return '<div class="' + cls + '">' +
      '<div class="rank">' + medal + '</div>' +
      '<div class="who"><div class="dn">' + esc(r.displayName) + '</div>' +
      '<div class="un">@' + esc(r.username) + '</div></div>' +
      '<div class="score">' + fmtNum(r.score) + '</div></div>';
  }

  async function loadLb() {
    lbBody.innerHTML = '<div class="lb-loading">Loading…</div>';
    let data;
    try {
      data = await API.leaderboard(lbGame, 25);
    } catch (err) {
      lbBody.innerHTML = '<div class="lb-empty">' + esc(err.message) + '</div>';
      return;
    }

    const meUser = currentUser && currentUser.username.toLowerCase();
    if (!data.top.length) {
      lbBody.innerHTML = '<div class="lb-empty">No scores yet for ' + GAME_LABEL[lbGame] +
        '.<br>Be the first — play the arcade!</div>';
    } else {
      const rows = data.top.map((r) => rowHtml(r, meUser && r.username.toLowerCase() === meUser)).join('');
      lbBody.innerHTML = '<div class="lb-list">' + rows + '</div>';
    }

    // Show the signed-in user's own rank if they're not already in the visible list.
    if (data.mine && !data.top.some((r) => r.username.toLowerCase() === meUser)) {
      const wrap = document.createElement('div');
      wrap.className = 'lb-myrank';
      wrap.innerHTML = '<p class="kicker">Your rank</p><div class="lb-list">' + rowHtml(data.mine, true) + '</div>';
      lbBody.appendChild(wrap);
    }
  }

  // ---- Admin portal ----
  const ago = (ms) => {
    const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + 's ago';
    const mm = Math.floor(s / 60); if (mm < 60) return mm + 'm ago';
    const h = Math.floor(mm / 60); if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24); if (d < 30) return d + 'd ago';
    return new Date(ms).toLocaleDateString();
  };

  menuAdmin && menuAdmin.addEventListener('click', () => { closeModal(authModal); openAdmin(); });
  adminClose && adminClose.addEventListener('click', () => closeModal(adminModal));
  adminModal && adminModal.addEventListener('click', (e) => { if (e.target === adminModal) closeModal(adminModal); });
  adminTabs && adminTabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { adminTab = b.dataset.tab; adminTabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); loadAdmin(); }
  });

  function openAdmin() { if (!isAdmin) return; openModal(adminModal); loadAdmin(); }
  function loadAdmin() {
    adminBody.innerHTML = '<div class="lb-loading">Loading…</div>';
    return adminTab === 'admins' ? loadAdminUsers() : loadAdminOverview();
  }

  async function loadAdminOverview() {
    let d;
    try { d = await API.adminStats(); }
    catch (err) { adminBody.innerHTML = '<div class="lb-empty">' + esc(err.message) + '</div>'; return; }
    const u = d.users, e = d.engagement;
    const tile = (label, val, sub) =>
      '<div class="admin-stat"><div class="v">' + val + '</div><div class="l">' + label + '</div>' +
      (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
    let html =
      '<div class="admin-hero"><div class="big">' + fmtNum(u.real) + '</div>' +
      '<div class="cap">real signups <span class="muted">· ' + fmtNum(u.total) + ' total · ' + fmtNum(u.test) + ' test</span></div></div>';
    if (u.test > 0) {
      html += '<button type="button" id="adminCleanup" class="admin-cleanup">🧹 Clean up ' +
        fmtNum(u.test) + ' test account' + (u.test === 1 ? '' : 's') + '</button>';
    }
    html +=
      '<div class="admin-grid">' +
        tile('New · 24h', fmtNum(u.new24h)) +
        tile('New · 7d', fmtNum(u.new7d)) +
        tile('New · 30d', fmtNum(u.new30d)) +
        tile('Have played', fmtNum(e.players)) +
        tile('Active now', fmtNum(e.activeSessions), 'live sessions') +
        tile('Scores set', fmtNum(e.scoreRows)) +
        tile('MP matches', fmtNum(d.matches)) +
      '</div>';
    if (d.perGame && d.perGame.length) {
      html += '<p class="kicker" style="margin-top:1.1rem">Per-game leaders</p><div class="admin-games">' +
        d.perGame.map((g) =>
          '<div class="admin-grow"><div class="g">' + (GAME_LABEL[g.game] || esc(g.game)) + '</div>' +
          '<div class="who">🥇 @' + esc(g.leader) + ' <span class="sc">' + fmtNum(g.topScore) + '</span></div>' +
          '<div class="pl">' + fmtNum(g.players) + ' player' + (g.players === 1 ? '' : 's') + '</div></div>').join('') +
        '</div>';
    }
    if (d.recentSignups && d.recentSignups.length) {
      html += '<p class="kicker" style="margin-top:1.1rem">Recent signups</p><div class="admin-recent">' +
        d.recentSignups.map((r) =>
          '<div class="admin-rrow"><div class="who"><div class="dn">' + esc(r.displayName) + '</div>' +
          '<div class="un">@' + esc(r.username) + '</div></div><div class="when">' + ago(r.createdAt) + '</div></div>').join('') +
        '</div>';
    }
    adminBody.innerHTML = html;

    const cleanBtn = document.getElementById('adminCleanup');
    if (cleanBtn) cleanBtn.addEventListener('click', async () => {
      if (!window.confirm('Delete ' + fmtNum(u.test) + ' test account' + (u.test === 1 ? '' : 's') +
        ' (and their scores)? This can\'t be undone.')) return;
      cleanBtn.disabled = true; cleanBtn.textContent = 'Cleaning up…';
      try {
        const r = await API.adminCleanupTests();
        loadAdmin(); // refresh the overview with the new numbers
      } catch (e) { window.alert(e.message); cleanBtn.disabled = false; }
    });
  }

  function adminUserRow(u) {
    const you = currentUser && u.username.toLowerCase() === currentUser.username.toLowerCase();
    const ctrl = u.bootstrap
      ? '<span class="admin-lock">🔒 Owner</span>'
      : '<button type="button" data-id="' + u.id + '" data-admin="' + (u.admin ? '1' : '0') +
        '" class="admin-toggle' + (u.admin ? ' on' : '') + '"' + (you ? ' disabled title="that&#39;s you"' : '') +
        '>' + (u.admin ? '✓ Admin' : 'Make admin') + '</button>';
    return '<div class="admin-urow' + (u.admin ? ' is-admin' : '') + '">' +
      '<div class="who"><div class="dn">' + esc(u.displayName) + (you ? ' <span class="muted">(you)</span>' : '') + '</div>' +
      '<div class="un">@' + esc(u.username) + ' · joined ' + ago(u.createdAt) + '</div></div>' +
      '<div class="ctrl">' + ctrl + '</div></div>';
  }

  function loadAdminUsers() {
    adminBody.innerHTML =
      '<div class="admin-search"><input id="adminSearch" type="text" placeholder="Search username or name…" autocomplete="off" /></div>' +
      '<div id="adminUserList"><div class="lb-loading">Loading…</div></div>';
    const listEl = document.getElementById('adminUserList');
    const searchEl = document.getElementById('adminSearch');
    let t;
    const fetchUsers = async (query) => {
      listEl.innerHTML = '<div class="lb-loading">Loading…</div>';
      let d;
      try { d = await API.adminUsers(query || ''); }
      catch (err) { listEl.innerHTML = '<div class="lb-empty">' + esc(err.message) + '</div>'; return; }
      listEl.innerHTML = d.users.length ? d.users.map(adminUserRow).join('')
        : '<div class="lb-empty">No matching users.</div>';
    };
    searchEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => fetchUsers(searchEl.value.trim()), 250); });
    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn || btn.disabled) return;
      const id = +btn.dataset.id, makeAdmin = btn.dataset.admin === '0';
      btn.disabled = true;
      try {
        await API.adminSetAdmin(id, makeAdmin);
        btn.dataset.admin = makeAdmin ? '1' : '0';
        btn.textContent = makeAdmin ? '✓ Admin' : 'Make admin';
        btn.classList.toggle('on', makeAdmin);
        const row = btn.closest('.admin-urow'); if (row) row.classList.toggle('is-admin', makeAdmin);
      } catch (err) { alert(err.message); }
      finally { btn.disabled = false; }
    });
    fetchUsers('');
  }

  // ---- Score submission hook (invoked by storm.js when a game session ends) ----
  window.onArcadeScore = async function (game, score) {
    if (!currentUser || !score || score <= 0) return;
    try {
      const res = await API.submitScore(game, score);
      const el = { catch: myCatch, blaster: myBlaster, flappy: myFlappy, dunk: myDunk, sim: mySim, run: myRun, knight: myKnight, brawl: myBrawl, ranch: myRanch, kart: myKart, reel: myReel, gta: myGta, beat: myBeat }[game];
      if (el && res && typeof res.best === 'number') el.textContent = fmtNum(res.best);
    } catch { /* offline / not deployed — scores just don't persist */ }
  };

  window.NuggetAuth = { get user() { return currentUser; } };

  // ---- Restore session on load ----
  (async function init() {
    if (!API.getToken()) return;
    try {
      const meRes = await API.me();
      applyUser(meRes.user, meRes.scores, meRes.isAdmin);
    } catch {
      API.setToken(''); // stale/expired token
    }
  })();
})();
