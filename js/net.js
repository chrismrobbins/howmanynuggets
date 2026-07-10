// ---- Generic multiplayer client (framework, game-agnostic) ------------------
// Thin WebSocket client for the GameRoom backend. Any game reuses this: it does
// room create/join, auth, reconnection, and event dispatch — it knows nothing
// about Blaster or any specific game. Exposes window.NuggetNet.
(function () {
  const httpBase = ((window.NuggetAPI && NuggetAPI.base) ||
    window.NUGGET_API_BASE || 'https://api.howmanynuggets.com').replace(/\/+$/, '');
  const wsBase = httpBase.replace(/^http/, 'ws'); // https→wss, http→ws

  const listeners = {};
  function on(type, cb) { (listeners[type] = listeners[type] || []).push(cb); }
  function emit(type, data) {
    (listeners[type] || []).forEach((cb) => { try { cb(data); } catch (e) { console.warn(e); } });
  }

  const net = {
    active: false,       // in a room and the session should own the screen
    connected: false,
    ws: null,
    code: null,
    game: null,
    you: null,           // our playerId
    host: false,
    phase: 'lobby',      // 'lobby' | 'playing' | 'over'
    players: [],
    snapshot: null,
    scores: [],
    _wantOpen: false,
    _tries: 0,
    on,
    base() { return httpBase; },

    // Host a room → returns the shareable code.
    async createRoom(game) {
      const token = window.NuggetAPI && NuggetAPI.getToken();
      if (!token) throw new Error('Sign in to play multiplayer.');
      const res = await fetch(httpBase + '/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ game }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create room.');
      return data.code;
    },

    // Join a room by code (WebSocket).
    join(code, game) {
      const token = window.NuggetAPI && NuggetAPI.getToken();
      if (!token) { emit('error', new Error('Sign in to play multiplayer.')); return; }
      this.code = String(code || '').toUpperCase();
      this.game = game || null;
      this._wantOpen = true;
      this._tries = 0;
      this._open(token);
    },

    _open(token) {
      const url = wsBase + '/room/' + encodeURIComponent(this.code) +
        '?token=' + encodeURIComponent(token);
      let ws;
      try { ws = new WebSocket(url); } catch { emit('error', new Error('Connection failed.')); return; }
      this.ws = ws;
      ws.onopen = () => { this.connected = true; this.active = true; this._tries = 0; emit('open'); };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } this._handle(m); };
      ws.onclose = () => {
        this.connected = false;
        emit('close');
        if (this._wantOpen) this._reconnect(token);
      };
      ws.onerror = () => { /* onclose handles cleanup */ };
    },

    _reconnect(token) {
      if (this._tries >= 5) { this.active = false; emit('gaveup'); return; }
      this._tries++;
      setTimeout(() => { if (this._wantOpen) this._open(token); }, Math.min(500 * this._tries, 4000));
    },

    _handle(m) {
      switch (m.t) {
        case 'welcome':
          this.you = m.you; this.host = m.host; this.game = m.game;
          this.phase = m.phase; this.players = m.players || [];
          emit('welcome', m); emit('roster', { players: this.players, phase: this.phase });
          break;
        case 'roster':
          this.players = m.players || []; this.phase = m.phase || this.phase;
          emit('roster', m);
          break;
        case 'started': this.phase = 'playing'; emit('started', m); break;
        case 'snapshot': this.snapshot = m.s; this.scores = m.scores || []; emit('snapshot', m); break;
        case 'event': emit('event', m); break;
        case 'gameover': this.phase = 'lobby'; this.snapshot = null; emit('gameover', m); break;
        case 'pong': break;
      }
    },

    setReady(ready) { this.send({ t: 'ready', ready: !!ready }); },
    start() { this.send({ t: 'start' }); },
    send(obj) { if (this.ws && this.connected) { try { this.ws.send(JSON.stringify(obj)); } catch {} } },

    leave() {
      this._wantOpen = false;
      this.active = false;
      this.snapshot = null;
      this.phase = 'lobby';
      this.players = [];
      if (this.ws) { try { this.ws.close(); } catch {} }
      this.ws = null;
      emit('left');
    },
  };

  window.NuggetNet = net;
})();
