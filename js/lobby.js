// ---- Multiplayer lobby (framework UI, game-agnostic) ------------------------
// Create/join-by-code, roster, ready, start — parameterized by game id. Wires
// the generic NuggetNet client to the DOM and hands off to the game's renderer
// when the match starts. Reuses the .modal-* styles from account.css.
(function () {
  const net = window.NuggetNet;
  if (!net) return;

  let game = 'blaster'; // the only game with a module today

  const openBtn = document.getElementById('openMultiplayer');
  const modal = document.getElementById('mpModal');
  const closeBtn = document.getElementById('mpClose');
  const signedOut = document.getElementById('mpSignedOut');
  const signInBtn = document.getElementById('mpSignIn');
  const home = document.getElementById('mpHome');
  const createBtn = document.getElementById('mpCreate');
  const codeInput = document.getElementById('mpCodeInput');
  const joinBtn = document.getElementById('mpJoin');
  const room = document.getElementById('mpRoom');
  const codeEl = document.getElementById('mpRoomCode');
  const rosterEl = document.getElementById('mpRoster');
  const readyBtn = document.getElementById('mpReadyBtn');
  const startBtn = document.getElementById('mpStartBtn');
  const leaveBtn = document.getElementById('mpLeaveBtn');
  const errEl = document.getElementById('mpError');
  if (!modal) return;

  const open = () => { modal.classList.add('active'); showState(); };
  const close = () => modal.classList.remove('active');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.add('active'); };
  const clearErr = () => { errEl.classList.remove('active'); errEl.textContent = ''; };
  const signedIn = () => !!(window.NuggetAPI && NuggetAPI.getToken());
  const myReady = () => {
    const me = net.players.find((p) => p.id === net.you);
    return !!(me && me.ready);
  };

  function showState() {
    clearErr();
    const inRoom = net.active && net.you;
    signedOut.style.display = signedIn() ? 'none' : '';
    home.style.display = signedIn() && !inRoom ? '' : 'none';
    room.style.display = inRoom ? '' : 'none';
    if (inRoom) renderRoom();
  }

  function renderRoom() {
    codeEl.textContent = net.code || '----';
    rosterEl.innerHTML = net.players.map((p) => {
      const you = p.id === net.you ? ' (you)' : '';
      return `<div class="row">
        <span class="nm">${esc(p.name)}${you}</span>
        ${p.host ? '<span class="badge">host</span>' : ''}
        <span class="rd">${p.ready ? '✅' : '⌛'}</span>
      </div>`;
    }).join('');
    readyBtn.textContent = myReady() ? "✓ Ready (tap to unready)" : 'Ready up';
    readyBtn.classList.toggle('on', myReady());
    startBtn.style.display = net.host ? '' : 'none';
    startBtn.disabled = net.players.length < 1;
  }

  // ---- actions ----
  openBtn && openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !net.active) close(); });

  signInBtn && signInBtn.addEventListener('click', () => {
    close();
    const ab = document.getElementById('accountBtn');
    if (ab) ab.click();
  });

  createBtn.addEventListener('click', async () => {
    clearErr();
    createBtn.disabled = true;
    try {
      const code = await net.createRoom(game);
      net.join(code, game);
    } catch (e) { showErr(e.message); }
    finally { createBtn.disabled = false; }
  });

  joinBtn.addEventListener('click', () => {
    clearErr();
    const code = (codeInput.value || '').trim().toUpperCase();
    if (code.length < 4) { showErr('Enter a room code.'); return; }
    net.join(code, game);
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  });

  readyBtn.addEventListener('click', () => net.setReady(!myReady()));
  startBtn.addEventListener('click', () => net.start());
  leaveBtn.addEventListener('click', () => { net.leave(); showState(); });

  // ---- net events ----
  net.on('welcome', () => { open(); showState(); });
  net.on('roster', () => { if (modal.classList.contains('active')) renderRoom(); });
  net.on('started', () => close());          // the game takes over the screen
  net.on('gameover', () => { open(); showState(); }); // back to lobby for a rematch
  net.on('error', (e) => { open(); showErr(e.message || 'Connection error.'); });
  net.on('gaveup', () => { open(); showErr('Lost connection to the room.'); });
  net.on('close', () => { if (modal.classList.contains('active')) showState(); });

  function esc(s) {
    return String(s).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
