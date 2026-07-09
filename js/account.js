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

  // Leaderboard modal
  const openLeaderboards = document.getElementById('openLeaderboards');
  const lbModal = document.getElementById('lbModal');
  const lbClose = document.getElementById('lbClose');
  const lbTabs = document.getElementById('lbTabs');
  const lbBody = document.getElementById('lbBody');

  let currentUser = null;
  let lbGame = 'catch';

  const initials = (name) => (name || '?').trim().slice(0, 1).toUpperCase();
  const esc = (s) => String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function setScores(scores) {
    scores = scores || { catch: 0, blaster: 0, flappy: 0 };
    myCatch.textContent = fmtNum(scores.catch || 0);
    myBlaster.textContent = fmtNum(scores.blaster || 0);
    myFlappy.textContent = fmtNum(scores.flappy || 0);
  }

  function applyUser(user, scores) {
    currentUser = user;
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
    if (e.key === 'Escape') { closeModal(authModal); closeModal(lbModal); }
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
      applyUser(meRes.user || res.user, meRes.scores);
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
      applyUser(res.user, { catch: 0, blaster: 0, flappy: 0 });
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
  const GAME_LABEL = { catch: '🧺 Catch', blaster: '🎯 Blaster', flappy: '🐤 Flappy' };

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

  // ---- Score submission hook (invoked by storm.js when a game session ends) ----
  window.onArcadeScore = async function (game, score) {
    if (!currentUser || !score || score <= 0) return;
    try {
      const res = await API.submitScore(game, score);
      const el = { catch: myCatch, blaster: myBlaster, flappy: myFlappy }[game];
      if (el && res && typeof res.best === 'number') el.textContent = fmtNum(res.best);
    } catch { /* offline / not deployed — scores just don't persist */ }
  };

  window.NuggetAuth = { get user() { return currentUser; } };

  // ---- Restore session on load ----
  (async function init() {
    if (!API.getToken()) return;
    try {
      const meRes = await API.me();
      applyUser(meRes.user, meRes.scores);
    } catch {
      API.setToken(''); // stale/expired token
    }
  })();
})();
