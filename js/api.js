// ---- API client for the users + high-scores backend -------------------------
// Talks to the Cloudflare Worker (see /worker). Override the base URL for local
// dev by setting `window.NUGGET_API_BASE` before this script loads, e.g.
//   <script>window.NUGGET_API_BASE = 'http://localhost:8787'</script>
(function () {
  const API_BASE = (window.NUGGET_API_BASE || 'https://api.howmanynuggets.com').replace(/\/+$/, '');
  const TOKEN_KEY = 'nug_token';

  // The session token is the one thing we persist locally so the user stays
  // logged in across visits. (Hobby-project tradeoff; users are warned not to
  // reuse a real password.)
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  }

  async function req(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (auth) {
      const t = getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Can't reach the server. Is the API deployed?");
    }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  window.NuggetAPI = {
    get base() { return API_BASE; },
    getToken,
    setToken,
    register: (username, displayName, password) =>
      req('/api/register', { method: 'POST', body: { username, displayName, password } }),
    login: (username, password) =>
      req('/api/login', { method: 'POST', body: { username, password } }),
    googleAuth: (credential) =>
      req('/api/auth/google', { method: 'POST', body: { credential } }),
    logout: () => req('/api/logout', { method: 'POST', auth: true }),
    me: () => req('/api/me', { auth: true }),
    submitScore: (game, score) =>
      req('/api/score', { method: 'POST', auth: true, body: { game, score } }),
    myScores: () => req('/api/scores/me', { auth: true }),
    leaderboard: (game, limit = 25) =>
      req('/api/leaderboard?game=' + encodeURIComponent(game) + '&limit=' + limit, { auth: true }),
    // Admin portal (server enforces admin-only; these 403 for non-admins).
    adminStats: () => req('/api/admin/stats', { auth: true }),
    adminUsers: (q = '') => req('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''), { auth: true }),
    adminSetAdmin: (userId, admin) =>
      req('/api/admin/set-admin', { method: 'POST', auth: true, body: { userId, admin } }),
    adminCleanupTests: () => req('/api/admin/cleanup-tests', { method: 'POST', auth: true }),
  };
})();
