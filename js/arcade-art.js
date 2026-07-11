// ---- Nugget Arcade art department -------------------------------------------
// Every texture in the 3D hall is painted here, procedurally, onto canvases —
// no image assets. Two products:
//   makeAtlas()  → one 2048² texture atlas (carpet, walls, cabinets, posters,
//                  marquees, neon signs …) plus the uv rect for each region.
//   drawAttract() → per-game animated "attract mode" screens, redrawn every
//                  few frames by js/arcade.js and uploaded as live textures.

const ArcadeArt = (() => {
  // One entry per playable cabinet. Order here is just metadata — placement
  // in the hall lives in js/arcade.js. c1/c2 drive each game's palette.
  const GAMES = [
    { mode: 'catch',   title: 'NUG CATCH',     icon: '🧺', c1: '#ffd166', c2: '#ff2fa0', tag: 'CATCH THE STORM'   },
    { mode: 'blaster', title: 'NUG BLASTER',   icon: '🎯', c1: '#ff5252', c2: '#ffd166', tag: 'DEFEND THE CITY'   },
    { mode: 'flappy',  title: 'FLAPPY NUG',    icon: '🐤', c1: '#4dd0e1', c2: '#ffe23a', tag: 'MIND THE TOWERS'   },
    { mode: 'dunk',    title: 'SAUCE DUNK',    icon: '🥣', c1: '#ff8a3d', c2: '#d32f2f', tag: 'TIMING IS FLAVOR'  },
    { mode: 'run',     title: 'NUGGET RUN',    icon: '🏃', c1: '#39ff7a', c2: '#26e0ff', tag: 'JUMP · FLIP · SLIDE' },
    { mode: 'sim',     title: 'NUGGET SIM',    icon: '🧘', c1: '#7c4dff', c2: '#26e0ff', tag: 'SIT. WATCH. BE.'   },
    { mode: 'brawl',   title: 'BATTERED BRAWLERS', icon: '🥊', c1: '#ff5252', c2: '#8a1c10', tag: 'SEE YOU IN HELL MOTHER CLUCKERS' },
    { mode: 'knight',  title: 'NUGGET KNIGHT', icon: '⚔️', c1: '#ffb020', c2: '#ff3d3d', tag: 'HOLD THE GATE'     },
    { mode: 'ranch',   title: 'NUGGET RANCH',  icon: '🐔', c1: '#ffd166', c2: '#e95420', tag: 'EGG TO McNUGGET'  },
    { mode: 'kart',    title: 'FAST FOOD',     icon: '🏎️', c1: '#39ff7a', c2: '#0a7a3a', tag: 'PEDAL TO THE BATTER' },
  ];

  // Games that live OUTSIDE the hall (no cabinet, no main-atlas art — the packed
  // 2048² page is FULL at 10). They still cycle on the scoreboard and fetch
  // leaderboards; their world art lives on the street atlas instead.
  const STREET_GAMES = [
    { mode: 'reel', title: 'KEEPING IT REEL', icon: '🎣', c1: '#26e0ff', c2: '#0a5a7a', tag: 'THE PIER AT MIDNIGHT' },
  ];

  const NEON = ['#ff2fa0', '#26e0ff', '#ffe23a', '#7c4dff', '#39ff7a'];

  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Neon-tube lettering: a fat dark understroke, a glowing color pass, and a
  // hot white core — reads as real signage even at atlas resolution.
  function neonText(g, text, x, y, font, color, blur) {
    g.save();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 8;
    g.strokeText(text, x, y);
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.fillText(text, x, y);
    g.shadowBlur = blur * 0.4;
    g.fillStyle = '#fff';
    g.save();
    g.globalAlpha = 0.85;
    g.fillText(text, x, y);
    g.restore();
    g.restore();
  }

  // The star of the show: an irregular golden nugget blob.
  function drawNug(g, x, y, r, golden) {
    g.save();
    g.translate(x, y);
    const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.15);
    if (golden) {
      grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.5, '#ffd23a'); grad.addColorStop(1, '#c68a12');
    } else {
      grad.addColorStop(0, '#f7cf7d'); grad.addColorStop(0.55, '#e8a83e'); grad.addColorStop(1, '#a3641c');
    }
    g.fillStyle = grad;
    g.beginPath();
    // Lumpy blob: radius wobbles around the circle.
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rw = r * (0.82 + 0.18 * Math.sin(a * 3 + 1.7) * Math.cos(a * 2));
      const px = Math.cos(a) * rw * 1.08, py = Math.sin(a) * rw * 0.92;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(90,50,10,0.55)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.stroke();
    // crispy speckles
    g.fillStyle = 'rgba(120,70,20,0.35)';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399, d = r * 0.15 + (i % 5) * r * 0.13;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.07, 0, 7);
      g.fill();
    }
    g.restore();
  }

  function speckle(g, w, h, n, color, alpha, size) {
    g.save();
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      g.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
      g.fillRect(Math.random() * w, Math.random() * h, size, size);
    }
    g.restore();
  }

  // Draw fn at 3×3 offsets so shapes crossing an edge wrap — keeps tiles seamless.
  function withWrap(g, w, h, fn) {
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        g.save();
        g.translate(ox * w, oy * h);
        fn();
        g.restore();
      }
  }

  // ---- Atlas region painters --------------------------------------------------

  // Classic 90s "cosmic bowling" arcade carpet: near-black with neon confetti.
  function pCarpet(g, w, h) {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0b0722');
    grad.addColorStop(1, '#0d092e');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2200, '#2a2350', 0.5, 2);
    speckle(g, w, h, 500, '#3a2f6b', 0.5, 2);
    const rnd = mulberry(7);
    for (let i = 0; i < 64; i++) {
      const x = rnd() * w, y = rnd() * h, type = i % 5;
      const color = NEON[i % NEON.length];
      withWrap(g, w, h, () => {
        g.save();
        g.translate(x, y);
        g.rotate(rnd() * 6.28);
        g.shadowColor = color;
        g.shadowBlur = 7;
        g.strokeStyle = color;
        g.fillStyle = color;
        g.lineWidth = 3.5;
        g.globalAlpha = 0.85;
        if (type === 0) { // squiggle
          g.beginPath();
          g.moveTo(-16, 0);
          g.bezierCurveTo(-6, -14, 6, 14, 16, 0);
          g.stroke();
        } else if (type === 1) { // triangle outline
          g.beginPath();
          g.moveTo(0, -11); g.lineTo(10, 8); g.lineTo(-10, 8); g.closePath();
          g.stroke();
        } else if (type === 2) { // ring
          g.beginPath(); g.arc(0, 0, 8, 0, 7); g.stroke();
        } else if (type === 3) { // 4-point star
          g.beginPath();
          g.moveTo(0, -12); g.quadraticCurveTo(2, -2, 12, 0); g.quadraticCurveTo(2, 2, 0, 12);
          g.quadraticCurveTo(-2, 2, -12, 0); g.quadraticCurveTo(-2, -2, 0, -12);
          g.fill();
        } else { // bolt
          g.beginPath();
          g.moveTo(-3, -13); g.lineTo(4, -2); g.lineTo(-1, -2); g.lineTo(4, 12);
          g.lineTo(-4, 1); g.lineTo(1, 1); g.closePath();
          g.fill();
        }
        g.restore();
      });
    }
  }

  // Dark interior wall panel, tileable horizontally: subtle grooves + grime.
  function pWall(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1b1834');
    grad.addColorStop(1, '#110e22');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, '#000', 0.25, 2);
    speckle(g, w, h, 300, '#332e5e', 0.3, 2);
    // panel joints on the tile edges so seams line up
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(3, 0, 2, h); g.fillRect(w - 5, 0, 2, h);
  }

  function pWainscot(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#12101f');
    grad.addColorStop(1, '#0a0913');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // brushed-metal streaks
    g.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? '#fff' : '#000';
      g.fillRect(0, Math.random() * h, w, 1);
    }
    g.globalAlpha = 1;
    const trim = g.createLinearGradient(0, 0, 0, 7);
    trim.addColorStop(0, '#6a6f9a'); trim.addColorStop(1, '#23233c');
    g.fillStyle = trim;
    g.fillRect(0, 0, w, 7);
  }

  function pCeiling(g, w, h) {
    g.fillStyle = '#0a0913';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, '#000', 0.4, 2);
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.lineWidth = 3;
    g.strokeRect(1, 1, w - 2, h - 2);
  }

  function pBrick(g, w, h) {
    g.fillStyle = '#191014';
    g.fillRect(0, 0, w, h);
    const bh = 32, bw = 64;
    for (let row = 0; row < h / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + off, y = row * bh;
        const v = 0.75 + Math.random() * 0.5;
        g.fillStyle = `rgb(${(46 * v) | 0},${(26 * v) | 0},${(24 * v) | 0})`;
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }
    speckle(g, w, h, 700, '#000', 0.35, 2);
  }

  // Rain-slick pavement for the intro exterior.
  function pSidewalk(g, w, h) {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#111319');
    grad.addColorStop(1, '#181b23');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, '#000', 0.3, 2);
    speckle(g, w, h, 250, '#3a4358', 0.35, 2);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4); // expansion joints on tile edges
  }

  function pDoor(g, w, h) {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#232a44');
    grad.addColorStop(0.5, '#2d3554');
    grad.addColorStop(1, '#1c2238');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    // porthole window with a hint of the glow inside
    const px = w / 2, py = h * 0.30, pr = w * 0.27;
    g.save();
    g.beginPath(); g.arc(px, py, pr, 0, 7); g.clip();
    const glass = g.createLinearGradient(0, py - pr, 0, py + pr);
    glass.addColorStop(0, '#0c1626'); glass.addColorStop(1, '#050810');
    g.fillStyle = glass;
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    g.strokeStyle = 'rgba(255,47,160,0.5)';
    g.lineWidth = 3;
    g.shadowColor = '#ff2fa0'; g.shadowBlur = 8;
    g.beginPath(); g.arc(px - pr * 0.2, py + pr * 0.35, pr * 0.55, -2.6, -0.6); g.stroke();
    g.restore();
    g.strokeStyle = '#565f85';
    g.lineWidth = 5;
    g.beginPath(); g.arc(px, py, pr, 0, 7); g.stroke();
    // push bar
    g.fillStyle = '#0d0f1a';
    g.fillRect(w * 0.1, h * 0.62, w * 0.8, 10);
    const bar = g.createLinearGradient(0, h * 0.62 - 8, 0, h * 0.62 + 6);
    bar.addColorStop(0, '#8b93b8'); bar.addColorStop(0.5, '#4a5170'); bar.addColorStop(1, '#20243a');
    g.fillStyle = bar;
    g.fillRect(w * 0.08, h * 0.60, w * 0.84, 9);
    // kick plate
    g.fillStyle = '#33395277';
    g.fillRect(6, h - 60, w - 12, 54);
  }

  // The exterior hero: NUGGET ARCADE in buzzing neon on a dark sign box.
  function pSign(g, w, h) {
    g.fillStyle = '#07070f';
    g.fillRect(0, 0, w, h);
    rr(g, 10, 10, w - 20, h - 20, 26);
    g.strokeStyle = '#26e0ff';
    g.lineWidth = 5;
    g.shadowColor = '#26e0ff';
    g.shadowBlur = 22;
    g.stroke(); g.stroke();
    g.shadowBlur = 0;
    // chase-light dots inside the border
    g.fillStyle = '#ffe23a';
    for (let i = 0; i < 40; i++) {
      const t = i / 40, per = 2 * (w - 56) + 2 * (h - 56);
      let d = t * per, x, y;
      if (d < w - 56) { x = 28 + d; y = 28; }
      else if ((d -= w - 56) < h - 56) { x = w - 28; y = 28 + d; }
      else if ((d -= h - 56) < w - 56) { x = w - 28 - d; y = h - 28; }
      else { d -= w - 56; x = 28; y = h - 28 - d; }
      g.globalAlpha = i % 2 ? 0.9 : 0.35;
      g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    drawNug(g, 108, h / 2, 52, true);
    neonText(g, 'NUGGET', w * 0.42, h * 0.35, '900 92px Impact, "Arial Black", sans-serif', '#ffe23a', 26);
    neonText(g, 'ARCADE', w * 0.62, h * 0.72, '900 92px Impact, "Arial Black", sans-serif', '#ff2fa0', 26);
  }

  function pPhrase(g, w, h) {
    g.fillStyle = '#0a0816';
    g.fillRect(0, 0, w, h);
    neonText(g, 'HOW MANY NUGS?', w / 2, h / 2, 'italic 900 56px Georgia, serif', '#ff2fa0', 20);
  }

  function pHighScores(g, w, h) {
    g.fillStyle = '#0a0816';
    g.fillRect(0, 0, w, h);
    neonText(g, '★ HIGH SCORES ★', w / 2, h / 2, '900 52px Impact, "Arial Black", sans-serif', '#39ff7a', 18);
  }

  function posterBase(g, w, h, bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 350, '#000', 0.2, 2);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.strokeRect(13, 13, w - 26, h - 26);
  }

  function posterText(g, text, x, y, size, color, blur) {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    if (blur) { g.shadowColor = color; g.shadowBlur = blur; }
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.restore();
  }

  function pPosterGolden(g, w, h) {
    posterBase(g, w, h, '#0c0a10');
    // sunburst
    g.save();
    g.translate(w / 2, h * 0.44);
    g.fillStyle = 'rgba(255,210,58,0.12)';
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-18, -h); g.lineTo(18, -h); g.fill();
    }
    g.restore();
    drawNug(g, w / 2, h * 0.44, 58, true);
    g.save();
    g.font = '26px sans-serif'; g.textAlign = 'center';
    g.fillText('✨', w * 0.28, h * 0.28);
    g.fillText('✨', w * 0.74, h * 0.52);
    g.restore();
    posterText(g, 'THE GOLDEN NUG', w / 2, h * 0.13, 27, '#ffd23a', 12);
    posterText(g, 'WORTH 10×', w / 2, h * 0.72, 34, '#fff', 0);
    posterText(g, 'CATCH IT IF YOU CAN', w / 2, h * 0.82, 16, '#c9b47a', 0);
  }

  function pPosterBrawl(g, w, h) {
    posterBase(g, w, h, '#160a0c');
    posterText(g, 'THE CAMPAIGN', w / 2, h * 0.12, 22, '#ffe23a', 8);
    // two nuggets squaring up over a sauce splat
    g.fillStyle = '#d32f2f';
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 46 * (0.7 + 0.3 * Math.sin(a * 5 + 1));
      const px = w / 2 + Math.cos(a) * r * 1.3, py = h * 0.5 + Math.sin(a) * r * 0.8;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.fill();
    drawNug(g, w * 0.32, h * 0.46, 40, false);
    drawNug(g, w * 0.68, h * 0.46, 40, false);
    g.save();
    g.font = '22px sans-serif'; g.textAlign = 'center';
    g.fillText('🥊', w * 0.44, h * 0.38);
    g.fillText('🥊', w * 0.56, h * 0.55);
    g.restore();
    posterText(g, 'BATTERED', w / 2, h * 0.7, 30, '#ff5252', 14);
    posterText(g, 'BRAWLERS', w / 2, h * 0.79, 30, '#ff5252', 14);
    posterText(g, '"SEE YOU IN HELL MOTHER CLUCKERS"', w / 2, h * 0.87, 11, '#e8b9a0', 0);
  }

  function pPosterKnight(g, w, h) {
    posterBase(g, w, h, '#0a0d18');
    // castle silhouette + moon
    g.fillStyle = '#f4ecd4';
    g.beginPath(); g.arc(w * 0.72, h * 0.24, 22, 0, 7); g.fill();
    g.fillStyle = '#131a30';
    g.fillRect(w * 0.18, h * 0.4, w * 0.64, h * 0.28);
    for (let i = 0; i < 6; i++) g.fillRect(w * 0.18 + i * w * 0.12, h * 0.36, w * 0.06, h * 0.06);
    g.save();
    g.translate(w / 2, h * 0.52);
    g.rotate(-0.6);
    g.fillStyle = '#cfd6e8';
    g.fillRect(-6, -70, 12, 90); // blade
    g.fillStyle = '#8a5a1d';
    g.fillRect(-24, 16, 48, 10); // crossguard
    g.restore();
    posterText(g, 'NUGGET KNIGHT', w / 2, h * 0.13, 26, '#ffb020', 12);
    posterText(g, 'CAN YOU SURVIVE', w / 2, h * 0.76, 18, '#fff', 0);
    posterText(g, 'WAVE 10?', w / 2, h * 0.86, 26, '#ff3d3d', 10);
  }

  function pPosterPlay(g, w, h) {
    posterBase(g, w, h, '#101020');
    posterText(g, 'PLAY', w / 2, h * 0.24, 52, '#26e0ff', 14);
    posterText(g, 'DIP', w / 2, h * 0.48, 52, '#ffe23a', 14);
    posterText(g, 'REPEAT', w / 2, h * 0.72, 44, '#ff2fa0', 14);
    posterText(g, 'THE NUGGET ARCADE', w / 2, h * 0.88, 14, '#9aa3c7', 0);
  }

  // Generic cabinet lower front: coin door, vents, kick plate.
  function pCabFront(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1d1a2c');
    grad.addColorStop(1, '#121020');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,47,160,0.35)';
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    // coin door
    const cw = w * 0.34, ch = h * 0.3, cx = (w - cw) / 2, cyd = h * 0.5;
    g.fillStyle = '#23273a';
    rr(g, cx, cyd, cw, ch, 6); g.fill();
    g.strokeStyle = '#454c6e';
    g.lineWidth = 2;
    rr(g, cx, cyd, cw, ch, 6); g.stroke();
    for (const off of [-0.22, 0.22]) {
      const sx = w / 2 + off * cw;
      g.fillStyle = '#0a0c14';
      rr(g, sx - 7, cyd + ch * 0.2, 14, ch * 0.45, 3); g.fill();
      g.fillStyle = '#ff5252';
      g.shadowColor = '#ff5252'; g.shadowBlur = 6;
      g.beginPath(); g.arc(sx, cyd + ch * 0.8, 3, 0, 7); g.fill();
      g.shadowBlur = 0;
    }
    // kick plate with diamond tread
    g.fillStyle = '#20243a';
    g.fillRect(4, h - 34, w - 8, 30);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    for (let x = -20; x < w; x += 14) {
      g.beginPath(); g.moveTo(x, h - 4); g.lineTo(x + 20, h - 34); g.stroke();
    }
  }

  function pMetal(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3c4260');
    grad.addColorStop(0.5, '#22263c');
    grad.addColorStop(1, '#161a2c');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.1;
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#fff' : '#000';
      g.fillRect(0, Math.random() * h, w, 1);
    }
    g.globalAlpha = 1;
  }

  function pDark(g, w, h) {
    g.fillStyle = '#0e0c18';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 200, '#000', 0.4, 2);
  }

  // Bezel that surrounds a cabinet's screen: dark plastic + speaker grille.
  function pBezel(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#191725');
    grad.addColorStop(1, '#0e0d17');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    rr(g, w * 0.09, h * 0.08, w * 0.82, h * 0.76, 10);
    g.fill();
    g.strokeStyle = 'rgba(120,130,180,0.3)';
    g.lineWidth = 3;
    rr(g, w * 0.09, h * 0.08, w * 0.82, h * 0.76, 10);
    g.stroke();
    // speaker grille dots
    g.fillStyle = '#05050a';
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 2; j++) {
        g.beginPath();
        g.arc(w * 0.3 + i * 12, h * 0.92 + j * 8, 2.5, 0, 7);
        g.fill();
      }
    g.fillStyle = '#454c6e';
    g.font = '900 11px Consolas, monospace';
    g.textAlign = 'center';
    g.fillText('N U G C O', w * 0.72, h * 0.94);
  }

  function pMarquee(g, w, h, game) {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, shade(game.c2, 0.25));
    grad.addColorStop(0.5, shade(game.c1, 0.45));
    grad.addColorStop(1, shade(game.c2, 0.25));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // dark frame
    g.strokeStyle = '#05050c';
    g.lineWidth = 12;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.save();
    g.font = '52px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(game.icon, 52, h / 2 + 4);
    g.fillText(game.icon, w - 52, h / 2 + 4);
    g.restore();
    // crisp backlit-plastic lettering (blurred neon here just reads as a white blob)
    const size = game.title.length > 15 ? 42 : game.title.length > 11 ? 54 : 64;
    g.save();
    g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const ty = h / 2 - 8;
    g.strokeStyle = 'rgba(4,4,14,0.95)';
    g.lineWidth = 10;
    g.strokeText(game.title, w / 2, ty);
    const tg = g.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.45, '#ffeeba');
    tg.addColorStop(1, game.c1);
    g.fillStyle = tg;
    g.fillText(game.title, w / 2, ty);
    g.restore();
    g.save();
    g.font = '700 17px Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('★ ' + game.tag + ' ★', w / 2, h - 22);
    g.restore();
  }

  function pSideArt(g, w, h, game) {
    g.fillStyle = '#0d0b18';
    g.fillRect(0, 0, w, h);
    // sweeping diagonal palette bands
    const band = g.createLinearGradient(0, h, w, 0);
    band.addColorStop(0, shade(game.c2, 0.7));
    band.addColorStop(1, shade(game.c1, 0.7));
    g.save();
    g.globalAlpha = 0.85;
    g.fillStyle = band;
    g.beginPath();
    g.moveTo(0, h); g.lineTo(w, h * 0.42); g.lineTo(w, h * 0.66); g.lineTo(0, h * 0.9);
    g.closePath(); g.fill();
    g.globalAlpha = 0.5;
    g.beginPath();
    g.moveTo(0, h * 0.86); g.lineTo(w, h * 0.36); g.lineTo(w, h * 0.4); g.lineTo(0, h * 0.92);
    g.closePath(); g.fill();
    g.restore();
    g.save();
    g.font = '110px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = game.c1; g.shadowBlur = 24;
    g.fillText(game.icon, w / 2, h * 0.24);
    g.restore();
    // vertical title down the side panel
    g.save();
    g.translate(w * 0.5, h * 0.6);
    g.rotate(Math.PI / 2);
    g.font = '900 30px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.lineJoin = 'round';
    g.strokeStyle = '#05050c';
    g.strokeText(game.title, 0, 0);
    g.fillStyle = game.c1;
    g.shadowColor = game.c1; g.shadowBlur = 10;
    g.fillText(game.title, 0, 0);
    g.restore();
  }

  function pPanel(g, w, h, game) {
    pMetal(g, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, h);
    // joystick on the left
    const jx = w * 0.24, jy = h * 0.52;
    g.fillStyle = '#0a0a12';
    g.beginPath(); g.arc(jx, jy, 26, 0, 7); g.fill();
    g.strokeStyle = '#3a4160'; g.lineWidth = 3;
    g.beginPath(); g.arc(jx, jy, 26, 0, 7); g.stroke();
    g.strokeStyle = '#191d30'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + 10, jy - 26); g.stroke();
    const ball = g.createRadialGradient(jx + 7, jy - 32, 2, jx + 10, jy - 28, 12);
    ball.addColorStop(0, '#fff'); ball.addColorStop(0.3, game.c1); ball.addColorStop(1, shade(game.c1, 0.4));
    g.fillStyle = ball;
    g.beginPath(); g.arc(jx + 10, jy - 28, 11, 0, 7); g.fill();
    // two buttons on the right
    for (const [i, color] of [[0, game.c1], [1, game.c2]].map((v) => v)) {
      const bx = w * 0.6 + i * w * 0.18, by = h * 0.5;
      g.fillStyle = '#0a0a12';
      g.beginPath(); g.arc(bx, by, 17, 0, 7); g.fill();
      const dome = g.createRadialGradient(bx - 4, by - 5, 2, bx, by, 14);
      dome.addColorStop(0, '#fff'); dome.addColorStop(0.25, color); dome.addColorStop(1, shade(color, 0.45));
      g.fillStyle = dome;
      g.beginPath(); g.arc(bx, by, 13, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = '900 13px Consolas, monospace';
    g.textAlign = 'center';
    g.fillText(game.title, w / 2, h * 0.16);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '700 10px Consolas, monospace';
    g.fillText(game.mode === 'brawl' ? '1–2 PLAYERS · NO QUARTERS NEEDED' : '1 PLAYER · NO QUARTERS NEEDED', w / 2, h * 0.9);
    // corner screws
    g.fillStyle = '#565f85';
    for (const [sx, sy] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) {
      g.beginPath(); g.arc(sx, sy, 3, 0, 7); g.fill();
    }
  }

  // Velvet drape for the mystery cabinet: folds, a gold cord, a paper tag.
  function pDrape(g, w, h) {
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#471d5c');
    base.addColorStop(1, '#250e38');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // vertical folds: alternating soft light/dark bands that wander
    const rnd = mulberry(31);
    for (let i = 0; i < 9; i++) {
      const x0 = (i / 9) * w + rnd() * 14;
      const lean = (rnd() - 0.5) * 26;
      const grad = g.createLinearGradient(x0 - 12, 0, x0 + 14, 0);
      const lit = i % 2 === 0;
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, lit ? 'rgba(216,160,255,0.22)' : 'rgba(0,0,0,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0 - 16, 0);
      g.quadraticCurveTo(x0 + lean, h * 0.5, x0 - 6, h);
      g.lineTo(x0 + 22, h);
      g.quadraticCurveTo(x0 + lean + 26, h * 0.5, x0 + 12, 0);
      g.closePath();
      g.fill();
    }
    // hem shadow
    const hem = g.createLinearGradient(0, h - 40, 0, h);
    hem.addColorStop(0, 'rgba(0,0,0,0)');
    hem.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = hem;
    g.fillRect(0, h - 40, w, 40);
    // gold cord with a droop + tassels
    g.strokeStyle = '#d8a933';
    g.lineWidth = 6;
    g.shadowColor = '#d8a933'; g.shadowBlur = 6;
    g.beginPath();
    g.moveTo(0, h * 0.3);
    g.quadraticCurveTo(w / 2, h * 0.37, w, h * 0.3);
    g.stroke();
    g.shadowBlur = 0;
    for (const tx of [w * 0.16, w * 0.84]) {
      g.fillStyle = '#d8a933';
      g.fillRect(tx - 3, h * 0.31, 6, 22);
      g.beginPath(); g.arc(tx, h * 0.31 + 24, 6, 0, 7); g.fill();
    }
    // hanging paper tag with the question mark
    g.save();
    g.translate(w / 2, h * 0.42);
    g.rotate(-0.08);
    g.strokeStyle = '#c9b47a';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -h * 0.06); g.lineTo(0, 0); g.stroke();
    g.fillStyle = '#efe6cc';
    rr(g, -34, 0, 68, 88, 8); g.fill();
    g.fillStyle = '#3a2f1b';
    g.font = '900 54px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 0, 46);
    g.restore();
  }

  // SAUCE-O-MATIC vending machine front: glowing header, cups behind glass.
  function pVending(g, w, h) {
    const body = g.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, '#1c2340');
    body.addColorStop(0.5, '#242c50');
    body.addColorStop(1, '#161c34');
    g.fillStyle = body;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    // header
    const head = g.createLinearGradient(0, 8, 0, 62);
    head.addColorStop(0, '#e8412c');
    head.addColorStop(1, '#a31f12');
    g.fillStyle = head;
    rr(g, 10, 8, w - 20, 54, 8); g.fill();
    g.save();
    g.font = '900 26px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 5;
    g.strokeText('SAUCE-O-MATIC', w / 2, 36);
    g.shadowColor = '#ffe23a'; g.shadowBlur = 10;
    g.fillStyle = '#ffe23a';
    g.fillText('SAUCE-O-MATIC', w / 2, 36);
    g.restore();
    // glass window with shelves of sauce cups
    const gx = 14, gy = 72, gw = w - 68, gh = 190;
    g.fillStyle = '#080d18';
    rr(g, gx, gy, gw, gh, 6); g.fill();
    const CUPS = ['#d32f2f', '#ff8a3d', '#ffe23a', '#39c96a'];
    for (let row = 0; row < 3; row++) {
      const sy = gy + 28 + row * 60;
      g.fillStyle = '#2a3050';
      g.fillRect(gx + 6, sy + 22, gw - 12, 4); // shelf
      for (let col = 0; col < 4; col++) {
        const cxx = gx + 24 + col * (gw - 44) / 3;
        const color = CUPS[(col + row) % 4];
        g.fillStyle = '#f4f0e6';
        g.beginPath();
        g.moveTo(cxx - 11, sy); g.lineTo(cxx + 11, sy);
        g.lineTo(cxx + 8, sy + 21); g.lineTo(cxx - 8, sy + 21);
        g.closePath(); g.fill();
        g.fillStyle = color;
        g.beginPath(); g.ellipse(cxx, sy, 11, 4, 0, 0, 7); g.fill();
      }
    }
    // glass shine
    g.save();
    g.beginPath(); rr(g, gx, gy, gw, gh, 6); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.moveTo(gx, gy + gh); g.lineTo(gx + gw * 0.5, gy); g.lineTo(gx + gw * 0.75, gy);
    g.lineTo(gx + gw * 0.25, gy + gh);
    g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = '#454c6e'; g.lineWidth = 3;
    rr(g, gx, gy, gw, gh, 6); g.stroke();
    // coin column
    const px = w - 46;
    g.fillStyle = '#10142a';
    rr(g, px, gy, 34, gh, 5); g.fill();
    g.fillStyle = '#000';
    g.fillRect(px + 11, gy + 16, 12, 22);
    g.fillStyle = '#39c96a';
    g.shadowColor = '#39c96a'; g.shadowBlur = 6;
    g.beginPath(); g.arc(px + 17, gy + 58, 4, 0, 7); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#8a93b8';
    g.font = '700 9px Consolas, monospace';
    g.textAlign = 'center';
    g.save();
    g.translate(px + 17, gy + 120);
    g.rotate(-Math.PI / 2);
    g.fillText('FREE TODAY', 0, 0);
    g.restore();
    // dispensing bin
    g.fillStyle = '#0c101f';
    rr(g, 20, h - 96, w - 40, 58, 8); g.fill();
    g.fillStyle = '#181f38';
    rr(g, 30, h - 88, w - 60, 42, 6); g.fill();
    g.fillStyle = '#667';
    g.font = '700 11px Consolas, monospace';
    g.textAlign = 'center';
    g.fillText('DIP RESPONSIBLY', w / 2, h - 18);
  }

  // Change machine, permanently generous.
  function pChange(g, w, h) {
    pMetal(g, w, h);
    g.fillStyle = 'rgba(8,10,20,0.45)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#ffb020';
    rr(g, 8, 8, w - 16, 34, 5); g.fill();
    g.fillStyle = '#1a1206';
    g.font = '900 20px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CHANGE', w / 2, 26);
    // slots + coin return
    g.fillStyle = '#05070d';
    g.fillRect(w * 0.2, 58, w * 0.6, 10);
    g.fillRect(w * 0.2, 78, w * 0.6, 10);
    g.fillStyle = '#0c101f';
    rr(g, w * 0.25, h - 64, w * 0.5, 34, 6); g.fill();
    // the sticker that explains everything
    g.save();
    g.translate(w / 2, h * 0.52);
    g.rotate(-0.12);
    g.fillStyle = '#f2ede0';
    rr(g, -w * 0.42, -26, w * 0.84, 52, 6); g.fill();
    g.strokeStyle = '#c33'; g.lineWidth = 2;
    rr(g, -w * 0.42, -26, w * 0.84, 52, 6); g.stroke();
    g.fillStyle = '#c22';
    g.font = '900 17px Impact, "Arial Black", sans-serif';
    g.fillText('FREE PLAY', 0, -8);
    g.fillStyle = '#333';
    g.font = '700 11px Consolas, monospace';
    g.fillText('forever · no quarters', 0, 12);
    g.restore();
  }

  // "OPEN 24/7" neon for the exterior window.
  function pOpen(g, w, h) {
    g.fillStyle = '#04060d';
    g.fillRect(0, 0, w, h);
    neonText(g, 'OPEN', w / 2, h * 0.36, '900 58px Impact, "Arial Black", sans-serif', '#ff2fa0', 18);
    neonText(g, '24/7', w / 2, h * 0.76, '900 34px Impact, "Arial Black", sans-serif', '#26e0ff', 14);
  }

  // A lone golden nugget on a transparent tile (crossed-quad pickup sprite).
  function pNugGold(g, w, h) {
    g.clearRect(0, 0, w, h);
    drawNug(g, w / 2, h / 2, w * 0.36, true);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = `${(w * 0.28) | 0}px sans-serif`;
    g.textAlign = 'center';
    g.fillText('✨', w * 0.78, h * 0.3);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) * f, gg = ((n >> 8) & 255) * f, b = (n & 255) * f;
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }

  // Deterministic rand so the atlas looks identical every load.
  function mulberry(seed) {
    let a = seed;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Atlas assembly -----------------------------------------------------------

  function makeAtlas() {
    const S = 2048;
    const c = cv(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#0a0913';
    g.fillRect(0, 0, S, S);
    const uv = {};
    let cx = 0, cy = 0, rowH = 0;
    const PAD = 8;
    function alloc(name, w, h, painter) {
      if (cx + w + PAD > S) { cx = 0; cy += rowH + PAD; rowH = 0; }
      if (cy + h > S) console.warn('ArcadeArt atlas overflow at', name); // never ship black textures silently
      g.save();
      g.translate(cx, cy);
      g.beginPath(); g.rect(0, 0, w, h); g.clip();
      painter(g, w, h);
      g.restore();
      // Inset the uv rect by 1.5px so mipmap bleeding never shows a neighbor.
      uv[name] = [(cx + 1.5) / S, (cy + 1.5) / S, (cx + w - 1.5) / S, (cy + h - 1.5) / S];
      cx += w + PAD;
      rowH = Math.max(rowH, h);
    }

    // Shelf-packed tallest-first so everything fits in one 2048² page.
    alloc('carpet', 448, 448, pCarpet);
    alloc('door', 192, 448, pDoor);
    for (const game of GAMES) // 200×300 (was 216×324): the 10th game only fits shrunk
      alloc('side_' + game.mode, 200, 300, (gg, w, h) => pSideArt(gg, w, h, game));
    alloc('posterGolden', 200, 300, pPosterGolden);
    alloc('posterBrawl', 200, 300, pPosterBrawl);
    alloc('posterKnight', 200, 300, pPosterKnight);
    alloc('posterPlay', 200, 300, pPosterPlay);
    alloc('vending', 256, 384, pVending); // (the mystery drape retired with the poke gate)
    alloc('sign', 1024, 256, pSign);
    alloc('wall', 256, 256, pWall);
    alloc('ceiling', 256, 256, pCeiling);
    alloc('brick', 256, 256, pBrick);
    alloc('sidewalk', 256, 256, pSidewalk);
    alloc('cabFront', 256, 256, pCabFront);
    alloc('change', 128, 256, pChange);
    alloc('bezel', 256, 192, pBezel);
    for (const game of GAMES)
      alloc('marq_' + game.mode, 512, 128, (gg, w, h) => pMarquee(gg, w, h, game));
    alloc('open', 256, 128, pOpen);
    alloc('wainscot', 256, 128, pWainscot);
    alloc('nugGold', 64, 64, pNugGold);
    alloc('metal', 128, 128, pMetal);
    alloc('phrase', 512, 128, pPhrase);
    alloc('highscores', 512, 128, pHighScores);
    for (const game of GAMES)
      alloc('panel_' + game.mode, 224, 112, (gg, w, h) => pPanel(gg, w, h, game));
    alloc('dark', 128, 128, pDark);
    // Solid color swatches for untextured geometry (neon strips, decals…).
    const SWATCHES = {
      white: '#ffffff', cyan: '#26e0ff', magenta: '#ff2fa0', amber: '#ffb020',
      yellow: '#ffe23a', green: '#39ff7a', red: '#ff3d3d', violet: '#7c4dff',
      warm: '#ffd9a0', black: '#000000', tube: '#cfe8ff', rope: '#d4356b',
      glass: '#0a1626',
    };
    for (const [name, color] of Object.entries(SWATCHES)) {
      alloc('sw_' + name, 24, 24, (gg, w, h) => { gg.fillStyle = color; gg.fillRect(0, 0, w, h); });
      // pull uv in to the swatch center so filtering can never bleed
      const r = uv['sw_' + name];
      const mx = (r[0] + r[2]) / 2, my = (r[1] + r[3]) / 2;
      uv['sw_' + name] = [mx - 0.001, my - 0.001, mx + 0.001, my + 0.001];
    }
    return { canvas: c, uv };
  }

  // ---- the street atlas ------------------------------------------------------------
  // Everything OUTSIDE the hall packs into its own 1024² page so the (nearly
  // full) main atlas never risks an overflow. Same shelf packer, same rules.

  function pStreetShop(g, w, h, kind) {
    // shared brick shell
    g.fillStyle = '#231b20';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1318';
    for (let y = 0; y < h; y += 16)
      for (let x = (y / 16) % 2 ? 16 : 0; x < w; x += 32) g.fillRect(x, y, 30, 14);
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0,0,6,0.65)');
    shade.addColorStop(1, 'rgba(0,0,6,0.05)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);

    if (kind === 'noodle') {
      // warm window, a nug slurping noodles inside, red awning
      g.fillStyle = '#2a1608'; g.fillRect(20, 92, 216, 110);
      g.fillStyle = '#3a2410'; g.fillRect(26, 98, 204, 98);
      const warm = g.createLinearGradient(0, 98, 0, 196);
      warm.addColorStop(0, '#ffd9a0'); warm.addColorStop(1, '#c9822e');
      g.fillStyle = warm; g.fillRect(32, 104, 192, 86);
      // counter + slurper silhouette
      g.fillStyle = '#7a4a16'; g.fillRect(32, 162, 192, 10);
      g.fillStyle = '#5c3610';
      g.beginPath(); g.arc(120, 148, 17, 0, 7); g.fill();
      g.fillRect(104, 156, 32, 10);
      g.strokeStyle = '#5c3610'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(132, 150); g.lineTo(150, 138); g.stroke(); // chopsticks
      g.fillStyle = '#f4ecd4'; g.fillRect(146, 150, 22, 8); // the bowl
      // steam
      g.strokeStyle = 'rgba(255,235,200,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(152, 146); g.quadraticCurveTo(148, 136, 154, 128); g.stroke();
      // awning
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#d32f2f' : '#f4ecd4';
        g.fillRect(12 + i * 29, 70, 29, 20);
      }
      g.fillStyle = '#8a1c10'; g.fillRect(12, 66, 232, 6);
      // neon sign
      g.font = '900 26px Consolas, monospace';
      g.textAlign = 'center';
      g.shadowColor = '#ff2fa0'; g.shadowBlur = 14;
      g.fillStyle = '#ff9ac8';
      g.fillText('NOODLE NUG', w / 2, 46);
      g.shadowBlur = 0;
    } else if (kind === 'laundro') {
      // glass front, a row of washers, one cup asleep on a bench
      g.fillStyle = '#0d1626'; g.fillRect(18, 84, 220, 118);
      g.fillStyle = 'rgba(120,180,220,0.1)'; g.fillRect(18, 84, 220, 30);
      for (let i = 0; i < 4; i++) {
        const wx = 36 + i * 52;
        g.fillStyle = '#2a3550'; g.fillRect(wx, 118, 44, 60);
        g.fillStyle = '#0a0d1c';
        g.beginPath(); g.arc(wx + 22, 148, 15, 0, 7); g.fill();
        g.strokeStyle = '#8a93b8'; g.lineWidth = 2;
        g.beginPath(); g.arc(wx + 22, 148, 15, 0, 7); g.stroke();
        if (i === 1) { // one still tumbling
          g.fillStyle = 'rgba(160,200,255,0.35)';
          g.beginPath(); g.arc(wx + 22, 148, 10, 1 + Math.PI, 2.2 + Math.PI); g.lineTo(wx + 22, 148); g.fill();
        }
      }
      g.fillStyle = '#39465c'; g.fillRect(18, 196, 220, 8);
      g.font = '900 24px Consolas, monospace';
      g.textAlign = 'center';
      g.shadowColor = '#26e0ff'; g.shadowBlur = 14;
      g.fillStyle = '#9be8ff';
      g.fillText('SUDS & SPUDS', w / 2, 46);
      g.shadowBlur = 0;
      g.font = '700 13px Consolas, monospace';
      g.fillStyle = '#39465c';
      g.fillText('wash · dry · fold · 24H', w / 2, 66);
    } else {
      // the GREASE GARAGE: the shutter is UP. warm light, a green kart inside,
      // and the engine that idled all those nights finally has somewhere to be.
      // (it was chained shut until FAST FOOD shipped — the Hooded Nug called it.)
      g.fillStyle = '#141014'; g.fillRect(16, 74, 224, 130);
      // rolled-up shutter tucked under the lintel
      g.fillStyle = '#3a3630'; g.fillRect(20, 74, 216, 16);
      g.fillStyle = 'rgba(0,0,8,0.4)';
      for (let x = 24; x < 232; x += 12) g.fillRect(x, 76, 2, 12);
      // the warm bay
      const bay = g.createLinearGradient(0, 90, 0, 204);
      bay.addColorStop(0, '#4a3418'); bay.addColorStop(1, '#241708');
      g.fillStyle = bay; g.fillRect(20, 90, 216, 114);
      // hanging work light
      g.strokeStyle = '#0a0810'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(128, 90); g.lineTo(128, 106); g.stroke();
      g.fillStyle = '#ffe9b8';
      g.beginPath(); g.arc(128, 110, 6, 0, 7); g.fill();
      // tool wall + tire stack
      g.fillStyle = '#1c1208'; g.fillRect(26, 96, 52, 60);
      g.fillStyle = '#8a93b8';
      for (let i = 0; i < 6; i++) g.fillRect(32 + (i % 3) * 15, 102 + Math.floor(i / 3) * 24, 4, 16);
      g.fillStyle = '#0e0c10';
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.ellipse(214, 188 - i * 16, 17, 8, 0, 0, 7); g.fill();
        g.fillStyle = '#1c1a20'; g.beginPath(); g.ellipse(214, 188 - i * 16, 8, 3.5, 0, 0, 7); g.fill();
        g.fillStyle = '#0e0c10';
      }
      // THE kart: green body, fat tires, nose toward the street
      g.fillStyle = 'rgba(0,0,10,0.5)';
      g.beginPath(); g.ellipse(138, 196, 52, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#0c0c12';
      g.fillRect(96, 178, 18, 16); g.fillRect(164, 178, 18, 16);
      g.fillStyle = '#0a7a3a'; g.fillRect(92, 166, 94, 18);
      g.fillStyle = '#39ff7a'; g.fillRect(92, 166, 94, 5);
      g.fillStyle = '#063f1e'; g.fillRect(92, 180, 94, 4);
      g.fillStyle = '#39ff7a'; g.fillRect(100, 156, 30, 4); // spoiler
      g.fillStyle = '#ffe23a'; g.fillRect(180, 170, 5, 6);  // headlight
      // engine heat shimmer, still running
      g.strokeStyle = 'rgba(255,235,200,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(88, 168); g.quadraticCurveTo(83, 158, 89, 148); g.stroke();
      // neon, lit at last
      g.font = '900 22px Consolas, monospace';
      g.textAlign = 'center';
      g.shadowColor = '#39ff7a'; g.shadowBlur = 14;
      g.fillStyle = '#a8ffc8';
      g.fillText('GREASE GARAGE', w / 2, 18);
      g.shadowBlur = 0;
      g.font = '700 12px Consolas, monospace';
      g.fillStyle = '#39ff7a';
      g.fillText('OPEN — home of FAST FOOD', w / 2, 216);
    }
  }

  function pAcross(g, w, h) {
    // the far side of the street: rooftops against the rain haze
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#07091a');
    sky.addColorStop(1, '#131a30');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a93b8';
    for (let i = 0; i < 40; i++) g.fillRect((i * 89) % w, (i * 31) % (h * 0.35), 1, 1);
    for (let i = 0; i < 9; i++) {
      const bw = 42 + ((i * 37) % 46), bh = 60 + ((i * 53) % 90);
      const bx = i * 58;
      g.fillStyle = i % 2 ? '#0d1220' : '#111828';
      g.fillRect(bx, h - bh, bw, bh);
      g.fillStyle = '#39465c';
      for (let z = 0; z < 10; z++)
        if ((z * 7 + i * 13) % 3 === 0)
          g.fillRect(bx + 6 + (z % 3) * 12, h - bh + 10 + Math.floor(z / 3) * 18, 6, 9);
      if (i === 4) { // one warm window: somebody's still up
        g.fillStyle = '#ffd9a0';
        g.fillRect(bx + 18, h - bh + 28, 7, 10);
      }
    }
    // a distant neon smudge down the block
    g.font = '900 15px Consolas, monospace';
    g.textAlign = 'center';
    g.shadowColor = '#ff2fa0'; g.shadowBlur = 10;
    g.fillStyle = 'rgba(255,140,190,0.5)';
    g.fillText('NUGGETOWN', w * 0.82, h * 0.42);
    g.shadowBlur = 0;
  }

  function pRoad(g, w, h) {
    g.fillStyle = '#141419';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a21';
    for (let i = 0; i < 90; i++)
      g.fillRect((i * 53) % w, (i * 37) % h, 3 + (i % 3), 2);
    g.fillStyle = 'rgba(230,235,255,0.08)'; // wet sheen patches
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse((i * 73 + 20) % w, (i * 47 + 30) % h, 16 + (i % 3) * 8, 6, 0, 0, 7);
      g.fill();
    }
    // lane dash along the middle
    g.fillStyle = 'rgba(255,226,58,0.4)';
    for (let x = 8; x < w; x += 48) g.fillRect(x, h / 2 - 3, 26, 6);
  }

  function pBusSign(g, w, h) {
    rr(g, 4, 4, w - 8, h - 8, 10);
    g.fillStyle = '#ffd166';
    g.fill();
    g.strokeStyle = '#42320e'; g.lineWidth = 4;
    rr(g, 4, 4, w - 8, h - 8, 10);
    g.stroke();
    g.fillStyle = '#1a0f08';
    g.textAlign = 'center';
    g.font = '900 20px Consolas, monospace';
    g.fillText('BUS', w / 2, 32);
    g.font = '900 12px Consolas, monospace';
    g.fillText('→ THE', w / 2, 58);
    g.fillText('CALCULATOR', w / 2, 74);
    g.font = '700 10px Consolas, monospace';
    g.fillText('runs: whenever', w / 2, 98);
    g.fillText('fare: 0 nugs', w / 2, 112);
  }

  // Surface textures for the 3D street regulars (bodies are real lit geometry
  // in arcade.js now — these wrap the meshes).
  function pNugSkin(g, w, h) {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#f0b954');
    grad.addColorStop(0.5, '#e8a83e');
    grad.addColorStop(1, '#c9882a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // crispy speckle
    for (let i = 0; i < 130; i++) {
      const r = 1 + (i % 3);
      g.fillStyle = i % 4 ? 'rgba(140,86,26,0.4)' : 'rgba(247,207,125,0.5)';
      g.beginPath();
      g.arc((i * 37) % w, (i * 53) % h, r, 0, 7);
      g.fill();
    }
  }
  function pHoodCloth(g, w, h) {
    g.fillStyle = '#232336';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,90,130,0.25)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
    g.fillStyle = 'rgba(10,10,20,0.35)';
    for (let i = 0; i < 20; i++) g.fillRect((i * 29) % w, (i * 17) % h, 6, 2);
  }
  function pCupGravy(g, w, h) {
    // wraps a cylinder: u = around, v = top→bottom
    g.fillStyle = '#e8e2d0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(160,150,120,0.35)'; // paper seams
    for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 2, h);
    g.fillStyle = '#6d4a1e'; // the band
    g.fillRect(0, h * 0.42, w, h * 0.3);
    g.fillStyle = '#f4ecd4';
    g.font = '900 15px Consolas, monospace';
    g.textAlign = 'center';
    g.fillText('GRAVY', w * 0.25, h * 0.62);
    g.fillText('GRAVY', w * 0.75, h * 0.62);
    // coffee-ring stains of age
    g.strokeStyle = 'rgba(120,90,40,0.3)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(w * 0.5, h * 0.2, 8, 0, 7); g.stroke();
  }
  function pHenWhite(g, w, h) {
    g.fillStyle = '#f4ecd4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,190,160,0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const x = (i * 23) % w, y = (i * 37) % h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 5, y + 4, x + 2, y + 9);
      g.stroke();
    }
  }
  function pPickle(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4f7a2a');
    grad.addColorStop(1, '#33591a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(220,240,160,0.35)'; // warty dill bumps
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.arc((i * 29) % w, (i * 41) % h, 1.5 + (i % 2), 0, 7);
      g.fill();
    }
  }
  function pTape(g, w, h) {
    g.fillStyle = '#ffd21e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0a0a10';
    g.font = '900 17px Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('POLICE LINE — DO NOT CROSS —', w / 2, h / 2 + 1);
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h - 3, w, 3);
  }
  function pCrimeSign(g, w, h) {
    g.fillStyle = '#f4f0e6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#0a0a10';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.textAlign = 'center';
    g.fillStyle = '#c9203a';
    g.font = '900 17px Consolas, monospace';
    g.fillText('CRIME SCENE', w / 2, 26);
    g.fillStyle = '#0a0a10';
    g.font = '900 11px Consolas, monospace';
    g.fillText('THE STORM IS GONE', w / 2, 46);
    g.font = '700 10px Consolas, monospace';
    g.fillText('active investigation', w / 2, 62);
    g.fillText('— NPD det. dill', w / 2, 76);
  }

  function makeStreetAtlas() {
    const S = 1024;
    const c = cv(S, S);
    const g = c.getContext('2d');
    // transparent page: NPC cutouts need alpha; solid regions paint their own bg
    const uv = {};
    let cx = 0, cy = 0, rowH = 0;
    const PAD = 8;
    function alloc(name, w, h, painter) {
      if (cx + w + PAD > S) { cx = 0; cy += rowH + PAD; rowH = 0; }
      if (cy + h > S) console.warn('ArcadeArt street atlas overflow at', name);
      g.save();
      g.translate(cx, cy);
      g.beginPath(); g.rect(0, 0, w, h); g.clip();
      painter(g, w, h);
      g.restore();
      uv[name] = [(cx + 1.5) / S, (cy + 1.5) / S, (cx + w - 1.5) / S, (cy + h - 1.5) / S];
      cx += w + PAD;
      rowH = Math.max(rowH, h);
    }

    alloc('shopNoodle', 256, 224, (gg, w, h) => pStreetShop(gg, w, h, 'noodle'));
    alloc('shopLaundro', 256, 224, (gg, w, h) => pStreetShop(gg, w, h, 'laundro'));
    alloc('shopGarage', 256, 224, (gg, w, h) => pStreetShop(gg, w, h, 'garage'));
    alloc('brick', 256, 256, pBrick);
    alloc('across', 512, 192, pAcross);
    alloc('road', 192, 192, pRoad);
    alloc('busSign', 96, 128, pBusSign);
    // 3D regulars' surface textures (the flat sprite cutouts retired)
    alloc('nugSkin', 96, 96, pNugSkin);
    alloc('hoodCloth', 64, 64, pHoodCloth);
    alloc('cupGravy', 192, 96, pCupGravy);
    alloc('henWhite', 64, 64, pHenWhite);
    alloc('pickle', 64, 64, pPickle);
    // the Catch Incident
    alloc('tape', 256, 32, pTape);
    alloc('crimeSign', 128, 96, pCrimeSign);
    // the pier (Keeping It Reel's front door)
    alloc('pierWood', 128, 128, pPierWood);
    alloc('water', 128, 128, pWater);
    alloc('pierSign', 192, 96, pPierSign);
    const SW2 = {
      iron: '#3a4256', wood: '#6d5426', woodDark: '#42320e', red: '#e8412c',
      amber: '#ffb020', curb: '#3c3c46', black: '#0a0a12', white: '#f4f0e6',
      badge: '#ffd166', comb: '#d32f2f', beak: '#e8a020',
    };
    for (const [name, color] of Object.entries(SW2)) {
      alloc('sw_' + name, 24, 24, (gg, w, h) => { gg.fillStyle = color; gg.fillRect(0, 0, w, h); });
      const r = uv['sw_' + name];
      const mx = (r[0] + r[2]) / 2, my = (r[1] + r[3]) / 2;
      uv['sw_' + name] = [mx - 0.001, my - 0.001, mx + 0.001, my + 0.001];
    }
    return { canvas: c, uv };
  }

  // Weathered boardwalk planks, seen a thousand midnights.
  function pPierWood(g, w, h) {
    g.fillStyle = '#241a08';
    g.fillRect(0, 0, w, h);
    const rowH = 16;
    for (let y = 0; y < h; y += rowH) {
      const shade = 0.75 + ((y / rowH) % 3) * 0.12;
      g.fillStyle = 'rgba(109,84,38,' + (0.5 * shade) + ')';
      g.fillRect(0, y + 1, w, rowH - 3);
      // grain streaks
      g.strokeStyle = 'rgba(20,13,4,0.55)';
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const gy = y + 3 + ((y * 7 + i * 41) % (rowH - 6));
        g.beginPath();
        g.moveTo(0, gy);
        g.bezierCurveTo(w * 0.3, gy + 1.5, w * 0.6, gy - 1.5, w, gy);
        g.stroke();
      }
      // plank gaps + nails
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(0, y + rowH - 2, w, 2);
      g.fillStyle = 'rgba(58,66,86,0.8)';
      g.fillRect(9, y + rowH / 2, 2, 2);
      g.fillRect(w - 12, y + rowH / 2, 2, 2);
    }
    speckle(g, w, h, 90, '#0a0805', 0.4, 2);
  }

  // Harbor water after midnight: near-black teal with faint wave streaks.
  // (The moon shimmer and the golden swirl are live glow sprites in arcade.js.)
  function pWater(g, w, h) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a2438');
    grad.addColorStop(1, '#050f1a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    withWrap(g, w, h, () => {
      for (let i = 0; i < 26; i++) {
        const y = (i * 37 + 11) % h;
        const x = (i * 53) % w;
        const len = 14 + (i * 13) % 26;
        g.strokeStyle = 'rgba(120,190,230,' + (0.04 + (i % 4) * 0.02) + ')';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y - 1.5, x + len, y);
        g.stroke();
      }
    });
  }

  // The gate sign over the pier entrance. Bait provided. Tell no one.
  function pPierSign(g, w, h) {
    g.fillStyle = '#1a1206';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#42320e';
    g.lineWidth = 5;
    g.strokeRect(3, 3, w - 6, h - 6);
    // plank seams
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    for (const y of [h * 0.33, h * 0.66]) {
      g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke();
    }
    neonText(g, 'KEEPING IT REEL', w / 2, h * 0.36, '900 23px Impact, "Arial Black", sans-serif', '#26e0ff', 12);
    neonText(g, 'bait provided · tell no one', w / 2, h * 0.72, '700 11px Consolas, monospace', '#ffb020', 7);
  }

  // Soft radial sprite used (tinted) for every glow halo, dust mote, and raindrop.
  function makeGlow() {
    const c = cv(128, 128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  // ---- Attract-mode screens -------------------------------------------------------
  // Each cabinet's CRT runs one of these loops. 256×192, redrawn continuously.

  function scanlines(g, w, h, t) {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    // rolling brightness band, like a filmed CRT
    const band = ((t * 24) % (h + 60)) - 30;
    const grad = g.createLinearGradient(0, band - 26, 0, band + 26);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, band - 26, w, 52);
  }

  function marqueeBar(g, w, game) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, w, 24);
    g.font = '900 15px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = '#000';
    g.strokeText(game.title, w / 2, 13);
    g.fillStyle = game.c1;
    g.fillText(game.title, w / 2, 13);
  }

  function bottomLine(g, w, h, t, best) {
    g.font = '700 12px Consolas, monospace';
    g.textAlign = 'center';
    const phase = Math.floor(t / 2.2) % 2;
    if (phase === 0) {
      if (Math.floor(t * 2.4) % 2 === 0) {
        g.fillStyle = '#ffe23a';
        g.fillText('· INSERT COIN ·', w / 2, h - 10);
      }
    } else {
      g.fillStyle = '#9be8ff';
      g.fillText(best > 0 ? 'YOUR BEST ' + best.toLocaleString() : 'PRESS START', w / 2, h - 10);
    }
  }

  const SCENES = {
    catch(g, w, h, t) {
      // THE CATCH INCIDENT: the storm is gone. static, an empty basket, and
      // an evidence card. (the cabinet is taped off in the hall.)
      for (let i = 0; i < 260; i++) {
        const v = Math.random();
        g.fillStyle = 'rgba(180,190,220,' + (0.03 + v * 0.07) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // rolling static band
      const band = ((t * 40) % (h + 40)) - 20;
      g.fillStyle = 'rgba(200,210,240,0.06)';
      g.fillRect(0, band, w, 14);
      // the empty basket, alone
      g.globalAlpha = 0.55;
      g.font = '34px sans-serif';
      g.textAlign = 'center';
      g.fillText('🧺', w / 2, h * 0.6);
      g.globalAlpha = 1;
      // chalk outline where the storm used to spiral
      g.strokeStyle = 'rgba(230,235,255,0.25)';
      g.setLineDash([5, 5]);
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(w / 2, h * 0.45, w * 0.3, h * 0.22, 0, 0, 7);
      g.stroke();
      g.setLineDash([]);
      // evidence card
      if (Math.sin(t * 1.3) > -0.4) {
        g.fillStyle = '#ffe23a';
        g.fillRect(w * 0.2, h * 0.14, w * 0.6, 22);
        g.fillStyle = '#0a0a10';
        g.font = '900 12px Consolas, monospace';
        g.fillText('EVIDENCE — NPD HOLD', w / 2, h * 0.14 + 15);
      }
      g.font = '700 10px Consolas, monospace';
      g.fillStyle = 'rgba(255,82,82,0.8)';
      g.fillText('1,000,000 NUGGETS MISSING', w / 2, h * 0.83);
      g.fillStyle = 'rgba(160,170,200,0.6)';
      g.fillText('if you know something, ask around outside', w / 2, h * 0.92);
    },
    blaster(g, w, h, t) {
      // city skyline
      g.fillStyle = '#0d1326';
      for (let i = 0; i < 7; i++) {
        const bw = 22 + (i * 13) % 18, bh = 24 + (i * 29) % 34;
        g.fillRect(8 + i * 34, h - 26 - bh, bw, bh);
      }
      g.fillStyle = '#ffe23a';
      for (let i = 0; i < 12; i++)
        if ((i + (t | 0)) % 3) g.fillRect(14 + (i * 41) % (w - 30), h - 40 - (i * 17) % 30, 3, 3);
      g.fillStyle = '#0a0f1e';
      g.fillRect(0, h - 26, w, 26);
      // cannon tracks a falling nugget; fires on a beat
      const cycle = (t % 1.6) / 1.6;
      const nx = w * (0.25 + 0.5 * Math.abs(Math.sin(t * 0.4)));
      const ny = cycle * h * 0.6;
      drawNug(g, nx, ny, 9, false);
      const cxx = w / 2;
      const ang = Math.atan2(ny - (h - 30), nx - cxx);
      g.save();
      g.translate(cxx, h - 30);
      g.rotate(ang + Math.PI / 2);
      g.fillStyle = '#4dd0e1';
      g.fillRect(-4, -26, 8, 26);
      g.restore();
      g.fillStyle = '#26547c';
      g.beginPath(); g.arc(cxx, h - 28, 12, Math.PI, 0); g.fill();
      if (cycle > 0.55) {
        g.strokeStyle = '#ffe23a';
        g.lineWidth = 2.5;
        g.shadowColor = '#ffe23a'; g.shadowBlur = 6;
        g.beginPath(); g.moveTo(cxx, h - 34); g.lineTo(nx, ny); g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = '#ff5252';
        g.beginPath(); g.arc(nx, ny, (cycle - 0.55) * 60, 0, 7); g.stroke();
      }
    },
    flappy(g, w, h, t) {
      // scrolling nugget towers
      g.save();
      const scroll = (t * 46) % 110;
      for (let i = 0; i < 4; i++) {
        const x = i * 110 - scroll;
        const gap = h * (0.35 + 0.25 * Math.sin(i * 2.1 + Math.floor((t * 46 + 110 * i) / 440)));
        g.fillStyle = '#c98a2e';
        g.fillRect(x, 24, 26, gap - 34 - 24);
        g.fillRect(x, gap + 34, 26, h - gap - 50);
        g.fillStyle = '#8a5a1d';
        g.fillRect(x - 3, gap - 44, 32, 10);
        g.fillRect(x - 3, gap + 34, 32, 10);
      }
      g.restore();
      const by = h * 0.5 + Math.sin(t * 3.1) * 16;
      drawNug(g, w * 0.3, by, 11, false);
      // wing
      g.fillStyle = '#ffe9b8';
      g.beginPath();
      g.ellipse(w * 0.3 - 6, by + 2, 8, 4 + 3 * Math.sin(t * 14), 0.6, 0, 7);
      g.fill();
    },
    dunk(g, w, h, t) {
      // conveyor
      g.fillStyle = '#1a2033';
      g.fillRect(0, h * 0.62, w, 8);
      g.fillStyle = '#3a4160';
      const scroll = (t * 60) % 24;
      for (let x = -24; x < w; x += 24) g.fillRect(x + scroll, h * 0.62 + 3, 12, 2);
      for (let i = 0; i < 4; i++) {
        const x = ((i * 70 + t * 60) % (w + 60)) - 30;
        drawNug(g, x, h * 0.58, 9, false);
      }
      // sauce cup dips on the beat
      const dip = Math.max(0, Math.sin(t * 2.5)) * 14;
      const cx2 = w * 0.5;
      g.fillStyle = '#d32f2f';
      g.beginPath(); g.ellipse(cx2, h * 0.78 + 4, 22, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#f4f0e6';
      g.beginPath();
      g.moveTo(cx2 - 24, h * 0.78); g.lineTo(cx2 + 24, h * 0.78);
      g.lineTo(cx2 + 18, h * 0.94); g.lineTo(cx2 - 18, h * 0.94);
      g.closePath(); g.fill();
      g.fillStyle = '#c9382f';
      g.beginPath(); g.ellipse(cx2, h * 0.78, 20, 6, 0, 0, 7); g.fill();
      drawNug(g, cx2, h * 0.66 + dip, 9, false);
      if (dip > 12) {
        g.font = '900 14px Consolas, monospace';
        g.fillStyle = '#39ff7a';
        g.textAlign = 'center';
        g.fillText('PERFECT!', cx2, h * 0.4);
      }
    },
    sim(g, w, h, t) {
      // day/night cycle
      const day = (Math.sin(t * 0.35) + 1) / 2;
      const sky = g.createLinearGradient(0, 24, 0, h);
      sky.addColorStop(0, `rgb(${10 + day * 90},${14 + day * 140},${40 + day * 170})`);
      sky.addColorStop(1, `rgb(${8 + day * 230},${10 + day * 140},${30 + day * 60})`);
      g.fillStyle = sky;
      g.fillRect(0, 24, w, h);
      const aa = t * 0.35;
      const sx = w / 2 + Math.cos(aa) * w * 0.4, sy = h * 0.75 - Math.abs(Math.sin(aa)) * h * 0.5;
      g.fillStyle = day > 0.5 ? '#ffd23a' : '#f4ecd4';
      g.shadowColor = g.fillStyle; g.shadowBlur = 14;
      g.beginPath(); g.arc(sx, sy, 10, 0, 7); g.fill();
      g.shadowBlur = 0;
      if (day < 0.4) {
        g.fillStyle = '#fff';
        for (let i = 0; i < 20; i++)
          g.fillRect((i * 53) % w, 28 + (i * 37) % (h * 0.5), 2, 2);
      }
      // hill + bench + a nugget at peace
      g.fillStyle = '#12351f';
      g.beginPath();
      g.moveTo(0, h); g.quadraticCurveTo(w / 2, h * 0.62, w, h); g.fill();
      g.strokeStyle = '#6b4a2a'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(w * 0.38, h * 0.78); g.lineTo(w * 0.62, h * 0.78);
      g.moveTo(w * 0.4, h * 0.78); g.lineTo(w * 0.4, h * 0.86);
      g.moveTo(w * 0.6, h * 0.78); g.lineTo(w * 0.6, h * 0.86);
      g.stroke();
      drawNug(g, w * 0.5, h * 0.72, 10, false);
      if (Math.sin(t * 0.9) > 0.93) {
        g.font = '700 11px Consolas, monospace';
        g.fillStyle = '#c4b5fd';
        g.textAlign = 'center';
        g.fillText('wisdom +1', w * 0.5, h * 0.55);
      }
    },
    run(g, w, h, t) {
      // parallax kitchen counter
      g.fillStyle = '#141828';
      g.fillRect(0, h * 0.3, w, h * 0.45);
      g.fillStyle = '#1d2340';
      const far = (t * 30) % 64;
      for (let x = -64; x < w; x += 64) g.fillRect(x + far, h * 0.36, 34, h * 0.3);
      g.fillStyle = '#2a3050';
      g.fillRect(0, h * 0.75, w, 5);
      const near = (t * 90) % 40;
      g.fillStyle = '#12162a';
      for (let x = -40; x < w; x += 40) g.fillRect(x + near, h * 0.75, 20, 5);
      // obstacle
      const ox = w - ((t * 90) % (w + 40));
      g.fillStyle = '#8a93b8';
      g.fillRect(ox, h * 0.68, 6, 14);
      g.fillRect(ox - 5, h * 0.66, 16, 5);
      // runner: hop with a flip every other jump
      const jt = (t % 1.7) / 1.7;
      const jump = Math.max(0, Math.sin(jt * Math.PI)) * 34;
      const flip = Math.floor(t / 1.7) % 2 ? jt * Math.PI * 2 : 0;
      g.save();
      g.translate(w * 0.28, h * 0.68 - jump);
      g.rotate(flip);
      drawNug(g, 0, 0, 11, false);
      g.strokeStyle = '#a3641c'; g.lineWidth = 3;
      const leg = Math.sin(t * 16) * (jump > 2 ? 0.2 : 1);
      g.beginPath();
      g.moveTo(-4, 8); g.lineTo(-4 - 5 * leg, 16);
      g.moveTo(4, 8); g.lineTo(4 + 5 * leg, 16);
      g.stroke();
      g.restore();
    },
    brawl(g, w, h, t) {
      // pixel kitchen: checker floor + two fighters trading blows
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#15202c';
      g.fillRect(0, 24, w, h);
      for (let y = h * 0.62; y < h; y += 8) {
        const row = Math.floor((y - h * 0.62) / 8);
        for (let x = (row % 2) * 8 - 8; x < w; x += 16) {
          g.fillStyle = '#1b2434'; g.fillRect(x, y, 8, 8);
          g.fillStyle = '#242f44'; g.fillRect(x + 8, y, 8, 8);
        }
      }
      const gy = h * 0.62;
      const beat = Math.floor(t * 2.2) % 4;
      const px2 = w * 0.38, ex = w * 0.62 - (beat === 1 ? 10 : 0);
      // player nugget (blocky) with red gloves
      g.fillStyle = '#e8a83e';
      g.fillRect(px2 - 10, gy - 22, 20, 18);
      g.fillStyle = '#8a5a1d';
      g.fillRect(px2 - 10, gy - 22, 20, 2);
      g.fillStyle = '#d32f2f';
      g.fillRect(px2 - 8, gy - 18, 16, 3); // headband
      g.fillStyle = '#fff';
      g.fillRect(px2 + 2, gy - 14, 3, 3);
      const punch = beat === 1 ? 14 : 0;
      g.fillStyle = '#d32f2f';
      g.fillRect(px2 + 8 + punch, gy - 13, 6, 6); // lead glove
      g.fillRect(px2 - 12, gy - 8, 6, 6);
      // player 2, blue headband, backing you up
      const p2x = w * 0.2;
      g.fillStyle = '#e8a83e';
      g.fillRect(p2x - 9, gy - 20, 18, 16);
      g.fillStyle = '#8a5a1d';
      g.fillRect(p2x - 9, gy - 20, 18, 2);
      g.fillStyle = '#2f6ad3';
      g.fillRect(p2x - 7, gy - 16, 14, 3); // headband
      g.fillRect(p2x + 7 + (beat === 3 ? 10 : 0), gy - 12, 5, 5); // glove
      g.fillStyle = '#fff';
      g.fillRect(p2x + 2, gy - 12, 3, 3);
      // sauce cup opponent
      g.fillStyle = '#f4f0e6';
      g.fillRect(ex - 8, gy - 16, 16, 14);
      g.fillStyle = '#d32f2f';
      g.fillRect(ex - 7, gy - 21, 14, 6);
      g.fillStyle = '#1a0f08';
      g.fillRect(ex - 4, gy - 19, 2, 2);
      g.fillRect(ex + 2, gy - 19, 2, 2);
      if (beat === 1) { // impact!
        g.fillStyle = '#ffe23a';
        for (let i = 0; i < 5; i++) {
          const a = i * 1.25;
          g.fillRect(ex - 10 + Math.cos(a) * 9, gy - 16 + Math.sin(a) * 9, 3, 3);
        }
      }
      if (beat === 2) {
        g.font = '900 15px Consolas, monospace';
        g.fillStyle = '#ff5252';
        g.textAlign = 'center';
        g.fillText('K.O.!', ex, gy - 30);
      }
      const flash = Math.floor(t * 1.1) % 4;
      if (flash === 0) {
        g.font = '900 18px Consolas, monospace';
        g.fillStyle = '#ffe23a';
        g.textAlign = 'center';
        g.fillText('FIGHT!', w / 2, h * 0.3);
      } else if (flash === 2) {
        g.font = '900 11px Consolas, monospace';
        g.fillStyle = '#ff5252';
        g.textAlign = 'center';
        g.fillText('SEE YOU IN HELL', w / 2, h * 0.26);
        g.fillText('MOTHER CLUCKERS', w / 2, h * 0.34);
      }
    },
    knight(g, w, h, t) {
      // torch-lit battlement
      g.fillStyle = '#0e1424';
      g.fillRect(0, h * 0.6, w, h * 0.4);
      g.fillStyle = '#182036';
      for (let i = 0; i < 8; i++) g.fillRect(i * 34, h * 0.56, 20, 10);
      for (const tx of [w * 0.12, w * 0.88]) {
        g.strokeStyle = '#4a3a22'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(tx, h * 0.6); g.lineTo(tx, h * 0.44); g.stroke();
        const f = 5 + Math.sin(t * 11 + tx) * 2;
        g.fillStyle = '#ffb020';
        g.shadowColor = '#ff8a3d'; g.shadowBlur = 12;
        g.beginPath(); g.ellipse(tx, h * 0.42, f * 0.6, f, 0, 0, 7); g.fill();
        g.shadowBlur = 0;
      }
      // spork advances, sword slashes on a beat
      const cyc = (t % 1.5) / 1.5;
      const ex = w * 0.85 - cyc * w * 0.35;
      g.strokeStyle = '#b8c0d8'; g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(ex, h * 0.58); g.lineTo(ex, h * 0.42);
      for (const dx of [-5, 0, 5]) { g.moveTo(ex + dx, h * 0.42); g.lineTo(ex + dx, h * 0.34); }
      g.stroke();
      const kx = w * 0.3, ky = h * 0.5;
      drawNug(g, kx, ky, 12, false);
      g.fillStyle = '#8a93b8'; // helmet
      g.beginPath(); g.arc(kx, ky - 6, 10, Math.PI, 0); g.fill();
      g.fillRect(kx - 10, ky - 7, 20, 3);
      if (cyc > 0.72) {
        const sw = (cyc - 0.72) / 0.28;
        g.strokeStyle = 'rgba(255,255,255,' + (1 - sw) + ')';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(kx + 6, ky, 24, -1.4 + sw * 2.2, -0.6 + sw * 2.2);
        g.stroke();
        if (sw > 0.5) {
          g.font = '900 13px Consolas, monospace';
          g.fillStyle = '#ffb020';
          g.textAlign = 'center';
          g.fillText('+15', ex, h * 0.3);
        }
      }
      g.font = '700 11px Consolas, monospace';
      g.fillStyle = '#ff3d3d';
      g.textAlign = 'center';
      g.fillText('WAVE ' + (1 + ((t / 6) | 0) % 9), w / 2, h * 0.34);
    },
    ranch(g, w, h, t) {
      // sky + rolling green pasture + a little barn
      g.fillStyle = '#8fd0ff'; g.fillRect(0, 0, w, h * 0.62);
      g.fillStyle = '#8ccb4c'; g.fillRect(0, h * 0.62, w, h * 0.38);
      g.fillStyle = '#a9743e'; g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#b23b2e'; // barn
      g.fillRect(w * 0.72, h * 0.4, w * 0.2, h * 0.22);
      g.beginPath(); g.moveTo(w * 0.72, h * 0.4); g.lineTo(w * 0.82, h * 0.31); g.lineTo(w * 0.92, h * 0.4); g.fill();
      g.font = '30px sans-serif'; g.textAlign = 'center';
      // three pens cycling egg → chick → hen on staggered timers
      const stages = ['🥚', '🐣', '🐤', '🐥', '🐔'];
      for (let i = 0; i < 3; i++) {
        const x = w * (0.22 + i * 0.2);
        const phase = (t * 0.5 + i * 0.9) % stages.length;
        const si = Math.floor(phase);
        const y = h * 0.62 + Math.sin(t * 3 + i) * 3;
        g.fillText(stages[si], x, y);
        if (si === 4 && Math.sin(t * 2 + i) > 0.6) {
          g.font = '900 12px Consolas, monospace'; g.fillStyle = '#e95420';
          g.fillText('🍗', x + 16, y - 22);
          g.font = '30px sans-serif';
        }
      }
      g.font = '700 11px Consolas, monospace';
      g.fillStyle = '#5a3a16'; g.textAlign = 'center';
      g.fillText('RAISE · FEED · SHIP', w / 2, h * 0.28);
    },
    kart(g, w, h, t) {
      // night drive: pseudo-3D road strobing past, a tanker ahead, nitro on a beat
      const HOR = h * 0.42;
      g.fillStyle = '#141034';
      g.fillRect(0, 24, w, HOR - 24);
      g.fillStyle = '#0d0a20'; // skyline
      for (let i = 0; i < 8; i++) g.fillRect(i * 34 + (i * 7) % 12, HOR - 10 - (i * 13) % 16, 18, 26);
      g.fillStyle = '#2b2450';
      for (let i = 0; i < 14; i++) if ((i + (t | 0)) % 3) g.fillRect(8 + (i * 19) % (w - 12), HOR - 6 - (i * 11) % 18, 2, 2);
      g.fillStyle = '#0b0b12';
      g.fillRect(0, HOR, w, h - HOR);
      // road: perspective bands scroll toward the camera
      const bend = Math.sin(t * 0.5) * 24; // the course sways
      for (let j = 14; j >= 1; j--) {
        const z = j - ((t * 7) % 1);
        const inv = 1 / z, inv2 = 1 / (z + 1);
        const y1 = HOR + (h - HOR) * inv, y2 = HOR + (h - HOR) * inv2;
        const x1 = w / 2 + bend * (1 - inv) * 2, x2 = w / 2 + bend * (1 - inv2) * 2;
        const w1 = w * 0.62 * inv, w2 = w * 0.62 * inv2;
        const alt = Math.floor(z + t * 7) % 2;
        g.fillStyle = alt ? '#c23a3a' : '#d8d8e0';
        g.beginPath();
        g.moveTo(x2 - w2 * 1.12, y2); g.lineTo(x2 + w2 * 1.12, y2);
        g.lineTo(x1 + w1 * 1.12, y1); g.lineTo(x1 - w1 * 1.12, y1);
        g.fill();
        g.fillStyle = alt ? '#26262e' : '#2a2a34';
        g.beginPath();
        g.moveTo(x2 - w2, y2); g.lineTo(x2 + w2, y2);
        g.lineTo(x1 + w1, y1); g.lineTo(x1 - w1, y1);
        g.fill();
      }
      // BATTER tanker ahead
      const tz = 2.2 + Math.sin(t * 0.8) * 0.6, tin = 1 / tz;
      const tw = 74 * tin, th = 46 * tin;
      const tx = w / 2 + bend * (1 - tin) * 2 - 20 * tin, ty = HOR + (h - HOR) * tin;
      g.fillStyle = '#3a3630';
      g.fillRect(tx - tw / 2, ty - th, tw, th * 0.85);
      g.fillStyle = '#ff3d3d';
      g.fillRect(tx - tw * 0.42, ty - th * 0.3, tw * 0.08, th * 0.08);
      g.fillRect(tx + tw * 0.34, ty - th * 0.3, tw * 0.08, th * 0.08);
      if (tw > 20) {
        g.font = '900 ' + tw * 0.16 + 'px Consolas, monospace';
        g.textAlign = 'center';
        g.fillStyle = '#d8d0b8';
        g.fillText('BATTER', tx, ty - th * 0.45);
      }
      // the hero kart, weaving
      const kx = w / 2 + Math.sin(t * 1.6) * 26;
      const nitro = Math.floor(t / 2.6) % 2 === 1;
      g.save();
      g.translate(kx, h * 0.88);
      g.rotate(Math.cos(t * 1.6) * 0.08);
      if (nitro) {
        g.fillStyle = '#ff8a3d';
        g.fillRect(-3, 2, 6, 7 + Math.sin(t * 40) * 3);
        g.fillStyle = '#ffe23a';
        g.fillRect(-1.5, 2, 3, 5);
      }
      g.fillStyle = '#0c0c12';
      g.fillRect(-13, -5, 5, 6); g.fillRect(8, -5, 5, 6);
      g.fillStyle = '#0a7a3a';
      g.fillRect(-10, -7, 20, 7);
      g.fillStyle = '#39ff7a';
      g.fillRect(-10, -7, 20, 2);
      drawNug(g, 0, -11, 5, false);
      g.fillStyle = '#39ff7a';
      g.fillRect(-5, -16, 10, 4);
      g.restore();
      if (nitro) {
        g.font = '900 13px Consolas, monospace';
        g.fillStyle = '#ffe23a';
        g.textAlign = 'center';
        g.fillText('🌶️ NITRO', w / 2, h * 0.32);
      } else if (Math.floor(t * 1.1) % 3 === 0) {
        g.font = '900 11px Consolas, monospace';
        g.fillStyle = '#39ff7a';
        g.textAlign = 'center';
        g.fillText('CHECKPOINT +16s', w / 2, h * 0.32);
      }
    },
  };

  function drawAttract(g, w, h, game, t, best) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#050510';
    g.fillRect(0, 0, w, h);
    g.save();
    SCENES[game.mode](g, w, h, t);
    g.restore();
    marqueeBar(g, w, game);
    bottomLine(g, w, h, t, best);
    scanlines(g, w, h, t);
    // phosphor vignette
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }

  // ---- Live leaderboard scoreboard ------------------------------------------------
  // Mounted on the east wall; js/arcade.js feeds it real rows from the API and
  // cycles through the games. rows: array of {rank, displayName, score},
  // 'error' when the API is unreachable, or undefined while loading.

  function drawScoreboard(g, w, h, t, game, rows, best) {
    g.fillStyle = '#03100a';
    g.fillRect(0, 0, w, h);
    // phosphor grid
    g.strokeStyle = 'rgba(57,255,122,0.05)';
    g.lineWidth = 1;
    for (let y = 0; y < h; y += 16) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    // header
    g.font = '900 22px Consolas, monospace';
    g.fillStyle = '#39ff7a';
    g.shadowColor = '#39ff7a'; g.shadowBlur = 10;
    g.fillText('★  H I G H   S C O R E S  ★', w / 2, 24);
    g.shadowBlur = 0;
    // current game line
    g.font = '900 24px Impact, "Arial Black", sans-serif';
    g.fillStyle = game.c1;
    g.fillText(game.icon + '  ' + game.title + '  ' + game.icon, w / 2, 58);

    if (rows === 'error') {
      g.font = '700 18px Consolas, monospace';
      g.fillStyle = '#8a93b8';
      g.fillText('SCOREBOARD OFFLINE', w / 2, h * 0.52);
      g.fillStyle = '#39ff7a';
      g.fillText('BE THE LEGEND WHEN IT WAKES', w / 2, h * 0.64);
    } else if (!rows) {
      const dots = '.'.repeat(1 + (Math.floor(t * 2.5) % 3));
      g.font = '700 18px Consolas, monospace';
      g.fillStyle = '#9be8ff';
      g.fillText('DIALING THE NUGNET' + dots, w / 2, h * 0.55);
    } else if (!rows.length) {
      g.font = '700 18px Consolas, monospace';
      g.fillStyle = '#9be8ff';
      g.fillText('NO SCORES YET', w / 2, h * 0.5);
      g.fillStyle = '#ffe23a';
      g.fillText('BE THE FIRST — PLAY IT', w / 2, h * 0.62);
    } else {
      const RANKC = ['#ffd23a', '#c9cfe0', '#d08a4a', '#7f8ab0', '#7f8ab0'];
      g.font = '700 17px Consolas, monospace';
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const r = rows[i], y = 88 + i * 27;
        g.textAlign = 'left';
        g.fillStyle = RANKC[i];
        g.fillText((r.rank || i + 1) + '.', 26, y);
        const name = String(r.displayName || '???').toUpperCase().slice(0, 14);
        g.fillStyle = i === 0 ? '#fff' : '#c9d4f0';
        g.fillText(name, 60, y);
        g.textAlign = 'right';
        g.fillStyle = RANKC[i];
        g.fillText(Number(r.score).toLocaleString(), w - 26, y);
        // dotted leader between name and score
        g.fillStyle = 'rgba(120,140,180,0.35)';
        const x0 = 60 + g.measureText('').width + name.length * 9.4 + 14;
        for (let x = x0; x < w - 40 - String(r.score).length * 9; x += 8)
          g.fillRect(x, y + 2, 2, 2);
      }
    }
    // footer
    g.textAlign = 'center';
    if (Math.floor(t * 1.6) % 2 === 0) {
      g.font = '700 13px Consolas, monospace';
      g.fillStyle = '#ffe23a';
      g.fillText(best > 0 ? 'YOUR BEST HERE: ' + best.toLocaleString() : '· PRESS ⏎ FOR FULL LEADERBOARDS ·', w / 2, h - 14);
    }
    scanlines(g, w, h, t);
  }

  return { GAMES, STREET_GAMES, makeAtlas, makeStreetAtlas, makeGlow, drawAttract, drawScoreboard };
})();
