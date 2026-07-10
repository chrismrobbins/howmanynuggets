// ---- Nugget Simulator ----------------------------------------------------------
// The fifth arcade game, and the calmest: you are a nugget on a park bench,
// watching the world go by. Days pass (one every two minutes), the sky moves
// through dawn, noon, dusk, and starry night, birds migrate, fireflies come
// out, and the nugget slowly, gracefully ages — reading glasses at 10 days,
// a cane at 20. Wisdom accrues at 1/sec; passing birds (+25) and shooting
// stars (+100) are the closest thing to excitement.
//
// Two sub-modes, switchable in the HUD while playing:
//   🌄 Scenic          — the full landscape diorama (SVG, drawn below)
//   🕶️ Ultra Realistic — a pitch-black screen. Nuggets cannot see.
//
// Like Flappy and Dunk this mode pauses the background storm (pausesStorm()).

const simWorld     = document.getElementById('simWorld');
const simVoid      = document.getElementById('simVoid');
const simSubSwitch = document.getElementById('simSubSwitch');

const DAY_SECS = 120;         // one full in-sim day per two real minutes
const START_FRAC = 0.33;      // begin mid-morning
const WISDOM_PER_SEC = 1;
const BIRD_BONUS = 25;
const STAR_BONUS = 100;

const SIM_LOCATIONS = [
  'Bench Hill', 'Mount Crispy Overlook', 'Sauce Valley',
  'Golden Arch Meadows', 'Honey Mustard Flats', 'Barbecue Butte',
];

// Life stages by sim-days lived. `look` layers on the visible signs of age.
const LIFE_STAGES = [
  { days: 40, label: 'The Ancient One' },
  { days: 20, label: 'Elder Nugget' },
  { days: 10, label: 'Distinguished' },
  { days: 5,  label: 'Seasoned' },
  { days: 2,  label: 'Day-Old but Dignified' },
  { days: 0,  label: 'Fresh from the Fryer' },
];

const sim = {
  on: false,
  sub: 'regular',      // 'regular' | 'ultra' — sticky across sessions
  built: false,
  frac: START_FRAC,    // time of day, 0..1 (0 = midnight)
  seconds: 0,          // total sim time lived this session
  days: 0,
  wisdomAcc: 0,
  location: SIM_LOCATIONS[0],
  // ambient event timers (seconds until next)
  birdT: 6,
  starT: 20,
  leafT: 10,
  birds: [],           // active flocks { el, x, y, dir, speed, wave, awarded }
  star: null,          // active shooting star { el, x, y, t }
  leaves: [],          // falling leaves { el, x, y, t, swayPhase }
  refs: null,          // handles into the SVG, filled by buildSimScene()
};

function simActive() {
  return storm.mode === 'sim' && storm.running;
}

// ---- Color helpers -------------------------------------------------------------

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Sky + lighting keyframes across the day. top/mid/hor are the sky gradient;
// tint is an rgba wash over the landscape; stars/clouds are group opacities.
const SKY_KEYS = [
  { f: 0.00, top: '#030614', mid: '#081226', hor: '#14213d', tint: [8, 12, 34, 0.50],   stars: 1.0,  clouds: 0.18 },
  { f: 0.22, top: '#0b1330', mid: '#27264f', hor: '#7a4a68', tint: [30, 20, 60, 0.38],  stars: 0.6,  clouds: 0.30 },
  { f: 0.27, top: '#274a7c', mid: '#9c6b8f', hor: '#ffb168', tint: [255, 140, 80, 0.14], stars: 0.0, clouds: 0.75 },
  { f: 0.33, top: '#3e7fbe', mid: '#7fb5e0', hor: '#d5e9f4', tint: [255, 200, 120, 0.05], stars: 0.0, clouds: 0.90 },
  { f: 0.50, top: '#2f74c0', mid: '#6fb0e2', hor: '#cfe6f5', tint: [0, 0, 0, 0],         stars: 0.0, clouds: 0.95 },
  { f: 0.66, top: '#3a6fb0', mid: '#85a9d6', hor: '#e8d9b8', tint: [255, 180, 90, 0.06], stars: 0.0, clouds: 0.90 },
  { f: 0.73, top: '#31406f', mid: '#b06a85', hor: '#ff9a5e', tint: [255, 110, 60, 0.16], stars: 0.1, clouds: 0.70 },
  { f: 0.79, top: '#121a38', mid: '#41335f', hor: '#8a4f66', tint: [45, 30, 85, 0.36],   stars: 0.55, clouds: 0.35 },
  { f: 0.85, top: '#04081a', mid: '#0a142c', hor: '#16223c', tint: [8, 12, 34, 0.50],    stars: 1.0, clouds: 0.20 },
  { f: 1.00, top: '#030614', mid: '#081226', hor: '#14213d', tint: [8, 12, 34, 0.50],    stars: 1.0, clouds: 0.18 },
];

function skyAt(frac) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].f < frac) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = (frac - a.f) / (b.f - a.f || 1);
  return {
    top: mixHex(a.top, b.top, t),
    mid: mixHex(a.mid, b.mid, t),
    hor: mixHex(a.hor, b.hor, t),
    tint: a.tint.map((v, k) => lerp(v, b.tint[k], t)),
    stars: lerp(a.stars, b.stars, t),
    clouds: lerp(a.clouds, b.clouds, t),
  };
}

function phaseName(f) {
  if (f < 0.22) return 'Night';
  if (f < 0.28) return 'Dawn';
  if (f < 0.45) return 'Morning';
  if (f < 0.60) return 'Midday';
  if (f < 0.70) return 'Afternoon';
  if (f < 0.80) return 'Dusk';
  return 'Night';
}

// Storm HUD asks us for the tally line while sim mode is active.
function simTally() {
  return `📍 ${sim.location} · Day ${sim.days + 1} · ${phaseName(sim.frac)}`;
}

// Map viewBox (1600×900, xMidYMax slice) coords to screen pixels for labels.
function simToScreen(x, y) {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.max(w / 1600, h / 900);
  return [x * s + (w - 1600 * s) / 2, y * s + (h - 900 * s)];
}

// ---- Scene construction ----------------------------------------------------------
// One layered SVG. Painting order (back → front): sky, stars, sun/moon, clouds,
// mountains, hills, tree, bench + nugget, grass, [tint wash], fireflies,
// birds/leaves/shooting stars, vignette.

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildSimScene() {
  if (sim.built) return;
  sim.built = true;
  sim.location = SIM_LOCATIONS[Math.floor(Math.random() * SIM_LOCATIONS.length)];

  // Random-but-fixed star field, generated once.
  let starDots = '';
  for (let i = 0; i < 110; i++) {
    const x = Math.round(Math.random() * 1600);
    const y = Math.round(Math.random() * 470);
    const r = (0.7 + Math.random() * 1.2).toFixed(1);
    const d = (Math.random() * 4).toFixed(1);
    const dur = (2.4 + Math.random() * 3.2).toFixed(1);
    starDots += `<circle cx="${x}" cy="${y}" r="${r}" fill="#e8eeff" class="sim-star"
      style="animation-delay:${d}s;animation-duration:${dur}s"/>`;
  }

  // Firefly swarm near the grass line. (Position lives on an outer group —
  // the CSS drift animation would otherwise stomp an attribute transform.)
  let flies = '';
  for (let i = 0; i < 9; i++) {
    const x = 140 + Math.random() * 1320;
    const y = 700 + Math.random() * 130;
    const d = (Math.random() * 5).toFixed(1);
    flies += `<g transform="translate(${x},${y})"><g class="sim-fly" style="animation-delay:${d}s">
      <circle r="7" fill="rgba(219,247,107,0.25)"/>
      <circle r="2.4" fill="#e4fb8f"/>
    </g></g>`;
  }

  simWorld.innerHTML = `
  <svg id="simSvg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"
       width="100%" height="100%" aria-label="A nugget on a bench, watching the world go by">
    <defs>
      <linearGradient id="simSky" x1="0" y1="0" x2="0" y2="1">
        <stop id="simSkyTop" offset="0" stop-color="#2f74c0"/>
        <stop id="simSkyMid" offset="0.55" stop-color="#6fb0e2"/>
        <stop id="simSkyHor" offset="1" stop-color="#cfe6f5"/>
      </linearGradient>
      <radialGradient id="simSunGlow">
        <stop offset="0" stop-color="rgba(255,236,170,0.85)"/>
        <stop offset="0.45" stop-color="rgba(255,220,130,0.28)"/>
        <stop offset="1" stop-color="rgba(255,210,110,0)"/>
      </radialGradient>
      <radialGradient id="simMoonGlow">
        <stop offset="0" stop-color="rgba(214,228,255,0.5)"/>
        <stop offset="0.5" stop-color="rgba(214,228,255,0.12)"/>
        <stop offset="1" stop-color="rgba(214,228,255,0)"/>
      </radialGradient>
      <linearGradient id="simRidgeFar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5c718f"/><stop offset="1" stop-color="#46587a"/>
      </linearGradient>
      <linearGradient id="simRidgeNear" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3e5273"/><stop offset="1" stop-color="#2e3f5e"/>
      </linearGradient>
      <linearGradient id="simHillBack" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5a8f5e"/><stop offset="1" stop-color="#3f6b48"/>
      </linearGradient>
      <linearGradient id="simHillFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#63a05f"/><stop offset="1" stop-color="#3d6a45"/>
      </linearGradient>
      <linearGradient id="simWood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a5754a"/><stop offset="1" stop-color="#7c5330"/>
      </linearGradient>
      <linearGradient id="simTrunk" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6d4b2e"/><stop offset="1" stop-color="#4c3220"/>
      </linearGradient>
      <radialGradient id="simVignette">
        <stop offset="0" stop-color="rgba(0,0,12,0)"/>
        <stop offset="0.72" stop-color="rgba(0,0,12,0)"/>
        <stop offset="1" stop-color="rgba(0,0,12,0.26)"/>
      </radialGradient>
      <filter id="simSoft" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
    </defs>

    <!-- SKY -->
    <rect width="1600" height="900" fill="url(#simSky)"/>
    <g id="simStars">${starDots}</g>

    <g id="simSun">
      <circle id="simSunHalo" r="120" fill="url(#simSunGlow)"/>
      <circle id="simSunCore" r="34" fill="#ffe9a8"/>
    </g>
    <g id="simMoon">
      <circle r="95" fill="url(#simMoonGlow)"/>
      <circle r="27" fill="#dfe8f7"/>
      <circle cx="-9" cy="-6" r="5.5" fill="rgba(178,195,222,0.7)"/>
      <circle cx="8" cy="4" r="4" fill="rgba(178,195,222,0.6)"/>
      <circle cx="2" cy="-12" r="3" fill="rgba(178,195,222,0.5)"/>
    </g>

    <g id="simClouds" filter="url(#simSoft)"></g>

    <!-- LANDSCAPE (everything below gets the time-of-day tint wash) -->
    <g id="simLand">
      <path fill="url(#simRidgeFar)" d="M0,640 L150,560 L290,616 L430,540 L580,610 L720,556 L880,622 L1040,552 L1190,612 L1330,566 L1470,620 L1600,576 L1600,900 L0,900 Z"/>
      <path fill="url(#simRidgeNear)" d="M0,690 L120,626 L260,672 L420,610 L590,676 L760,622 L930,680 L1090,626 L1260,678 L1420,632 L1600,684 L1600,900 L0,900 Z"/>

      <path fill="url(#simHillBack)" d="M0,760 C240,690 420,700 640,738 C860,776 1060,700 1280,712 C1420,720 1520,742 1600,738 L1600,900 L0,900 Z"/>
      <path fill="url(#simHillFront)" d="M0,830 C180,782 360,742 620,745 C800,747 900,738 1060,742 C1260,748 1440,792 1600,772 L1600,900 L0,900 Z"/>

      <!-- TREE -->
      <g id="simTree">
        <path fill="url(#simTrunk)" d="M1216,762 C1210,700 1206,660 1196,612 L1216,606 C1224,656 1232,700 1244,758 Z"/>
        <path fill="url(#simTrunk)" d="M1203,648 C1188,628 1172,616 1152,606 L1158,594 C1182,604 1200,618 1212,636 Z"/>
        <g class="sim-canopy">
          <ellipse cx="1198" cy="520" rx="150" ry="96" fill="#39704a"/>
          <ellipse cx="1116" cy="556" rx="86" ry="62" fill="#3d7a4f"/>
          <ellipse cx="1284" cy="556" rx="82" ry="58" fill="#356a45"/>
          <ellipse cx="1180" cy="478" rx="96" ry="62" fill="#478a56"/>
          <ellipse cx="1252" cy="500" rx="66" ry="44" fill="#529a5f"/>
          <ellipse cx="1136" cy="502" rx="52" ry="36" fill="#57a263"/>
        </g>
      </g>

      <!-- BENCH + NUGGET -->
      <g id="simBench">
        <ellipse cx="880" cy="768" rx="190" ry="15" fill="rgba(10,18,10,0.30)"/>
        <!-- iron frame -->
        <path d="M764,764 L764,690 Q764,672 782,672 L790,672" fill="none" stroke="#26262e" stroke-width="9" stroke-linecap="round"/>
        <path d="M996,764 L996,690 Q996,672 978,672 L970,672" fill="none" stroke="#26262e" stroke-width="9" stroke-linecap="round"/>
        <rect x="760" y="756" width="14" height="12" rx="3" fill="#1d1d24"/>
        <rect x="988" y="756" width="14" height="12" rx="3" fill="#1d1d24"/>
        <!-- back slats -->
        <rect x="770" y="596" width="220" height="15" rx="7" fill="url(#simWood)"/>
        <rect x="770" y="620" width="220" height="15" rx="7" fill="url(#simWood)"/>
        <rect x="770" y="644" width="220" height="15" rx="7" fill="url(#simWood)"/>
        <rect x="778" y="592" width="9" height="86" rx="4" fill="#5e4026"/>
        <rect x="973" y="592" width="9" height="86" rx="4" fill="#5e4026"/>
        <!-- seat slats -->
        <rect x="756" y="676" width="248" height="14" rx="7" fill="url(#simWood)"/>
        <rect x="756" y="694" width="248" height="13" rx="6" fill="#8a5f38"/>
      </g>

      <g id="simNugget" class="sim-breathe">
        <ellipse cx="880" cy="682" rx="52" ry="8" fill="rgba(20,14,4,0.28)"/>
        <image id="simNugImg" href="nugget.png" x="832" y="588" width="96" height="96"/>
        <!-- age accessories, faded in by stage -->
        <g id="simGlasses" opacity="0">
          <circle cx="862" cy="628" r="13" fill="rgba(190,220,240,0.16)" stroke="#2b2b33" stroke-width="3.4"/>
          <circle cx="898" cy="628" r="13" fill="rgba(190,220,240,0.16)" stroke="#2b2b33" stroke-width="3.4"/>
          <path d="M875,628 Q880,623 885,628" fill="none" stroke="#2b2b33" stroke-width="3.4" stroke-linecap="round"/>
          <path d="M849,626 L838,620" fill="none" stroke="#2b2b33" stroke-width="3" stroke-linecap="round"/>
          <path d="M911,626 L922,620" fill="none" stroke="#2b2b33" stroke-width="3" stroke-linecap="round"/>
        </g>
        <g id="simTuft" opacity="0">
          <path d="M866,592 Q870,578 880,584 Q886,572 894,582 Q902,574 903,588"
                fill="none" stroke="#d9d9d9" stroke-width="4" stroke-linecap="round"/>
        </g>
        <g id="simCane" opacity="0">
          <path d="M948,676 C948,640 946,624 936,616 Q928,610 922,618"
                fill="none" stroke="#6e4426" stroke-width="6" stroke-linecap="round"/>
        </g>
      </g>

      <!-- foreground grass tufts -->
      <g id="simGrass" fill="none" stroke="#2e5c39" stroke-width="4" stroke-linecap="round">
        <g class="sim-sway"><path d="M120,846 q2,-22 -4,-34"/><path d="M132,848 q0,-24 6,-36"/><path d="M144,846 q4,-18 -2,-30"/></g>
        <g class="sim-sway" style="animation-delay:.9s"><path d="M430,824 q2,-20 -4,-30"/><path d="M442,826 q0,-22 6,-32"/></g>
        <g class="sim-sway" style="animation-delay:.4s"><path d="M700,800 q2,-18 -4,-28"/><path d="M712,802 q0,-20 6,-30"/><path d="M723,800 q4,-16 -2,-26"/></g>
        <g class="sim-sway" style="animation-delay:1.3s"><path d="M1050,802 q2,-18 -5,-28"/><path d="M1062,804 q1,-20 7,-30"/></g>
        <g class="sim-sway" style="animation-delay:.6s"><path d="M1420,836 q2,-22 -4,-34"/><path d="M1432,838 q0,-24 6,-36"/><path d="M1444,836 q4,-18 -2,-30"/></g>
      </g>
    </g>

    <rect id="simTint" width="1600" height="900" fill="rgba(0,0,0,0)" pointer-events="none"/>

    <g id="simFireflies" opacity="0">${flies}</g>
    <g id="simFx"></g>

    <rect width="1600" height="900" fill="url(#simVignette)" pointer-events="none"/>
  </svg>`;

  // Clouds: built in JS so each keeps its own drift state.
  const cloudsG = simWorld.querySelector('#simClouds');
  const cloudSpecs = [
    { y: 130, s: 1.25, speed: 7 }, { y: 210, s: 0.9, speed: 10 },
    { y: 90,  s: 0.7, speed: 13 }, { y: 280, s: 1.05, speed: 8 },
    { y: 170, s: 0.55, speed: 16 },
  ];
  sim.clouds = cloudSpecs.map((c, i) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.innerHTML = `
      <ellipse cx="0" cy="0" rx="86" ry="26" fill="#fff"/>
      <ellipse cx="-52" cy="10" rx="52" ry="19" fill="#fff"/>
      <ellipse cx="56" cy="8" rx="60" ry="21" fill="#fff"/>
      <ellipse cx="8" cy="-16" rx="48" ry="18" fill="#fff"/>`;
    cloudsG.appendChild(g);
    return { el: g, x: (i * 390 + 60) % 1750, y: c.y, s: c.s, speed: c.speed };
  });

  sim.refs = {
    skyTop: simWorld.querySelector('#simSkyTop'),
    skyMid: simWorld.querySelector('#simSkyMid'),
    skyHor: simWorld.querySelector('#simSkyHor'),
    stars: simWorld.querySelector('#simStars'),
    sun: simWorld.querySelector('#simSun'),
    sunCore: simWorld.querySelector('#simSunCore'),
    moon: simWorld.querySelector('#simMoon'),
    cloudsG,
    tint: simWorld.querySelector('#simTint'),
    fireflies: simWorld.querySelector('#simFireflies'),
    fx: simWorld.querySelector('#simFx'),
    nugImg: simWorld.querySelector('#simNugImg'),
    glasses: simWorld.querySelector('#simGlasses'),
    tuft: simWorld.querySelector('#simTuft'),
    cane: simWorld.querySelector('#simCane'),
  };
}

// ---- Mode plumbing ---------------------------------------------------------------

function syncSim() {
  const active = simActive();
  if (active === sim.on) return; // only real transitions reset the session
  sim.on = active;
  if (active) {
    buildSimScene();
    // fresh session
    sim.frac = START_FRAC;
    sim.seconds = 0;
    sim.days = 0;
    sim.wisdomAcc = 0;
    sim.birdT = 6;
    sim.starT = 20;
    sim.leafT = 10;
    clearSimFx();
    applySimSub();
    renderSimScene();
  } else {
    simWorld.classList.remove('active');
    simVoid.classList.remove('active');
    simSubSwitch.classList.remove('active');
    clearSimFx();
  }
}

function applySimSub() {
  if (!sim.on) return;
  const ultra = sim.sub === 'ultra';
  simWorld.classList.toggle('active', !ultra);
  simVoid.classList.toggle('active', ultra);
  simSubSwitch.classList.add('active');
  simSubSwitch.querySelectorAll('button').forEach((b) =>
    b.classList.toggle('on', b.dataset.sub === sim.sub));
  stormHint.textContent = ultra
    ? 'ultra realistic mode — nuggets cannot see'
    : MODE_HINTS.sim;
  if (ultra) {
    clearSimFx();
  } else {
    applyAging();      // catch up on any birthdays spent in the void
    renderSimScene();
  }
}

simSubSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  sim.sub = b.dataset.sub;
  applySimSub();
});

function clearSimFx() {
  sim.birds.forEach((f) => f.el.remove());
  sim.birds = [];
  sim.leaves.forEach((l) => l.el.remove());
  sim.leaves = [];
  if (sim.star) { sim.star.el.remove(); sim.star = null; }
}

// ---- Ambient events ---------------------------------------------------------------

function spawnFlock() {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const g = document.createElementNS(SVG_NS, 'g');
  let birds = '';
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const bx = i * 46 + (i % 2) * 12, by = (i % 2) * 22 - Math.floor(i / 2) * 14;
    const dur = (0.55 + Math.random() * 0.25).toFixed(2);
    // Position on the outer group; the flap animation owns the path transform.
    birds += `<g transform="translate(${bx},${by}) scale(${dir},1)">
      <path class="sim-wing" style="animation-duration:${dur}s"
        d="M0,0 Q7,-8 14,-1 M14,-1 Q21,-9 28,-2"
        fill="none" stroke="#252c38" stroke-width="3.4" stroke-linecap="round"/>
    </g>`;
  }
  g.innerHTML = birds;
  sim.refs.fx.appendChild(g);
  sim.birds.push({
    el: g,
    x: dir === 1 ? -160 : 1760,
    y: 130 + Math.random() * 240,
    dir,
    speed: 95 + Math.random() * 45,
    wave: Math.random() * Math.PI * 2,
    awarded: false,
  });
}

function spawnShootingStar() {
  // Gradients don't render on zero-height <line> elements, so the meteor is a
  // bright head circle plus a fading solid-stroke tail.
  const g = document.createElementNS(SVG_NS, 'g');
  g.innerHTML =
    '<line stroke="rgba(255,255,255,0.75)" stroke-width="2.5" stroke-linecap="round"/>' +
    '<circle r="3" fill="#fff"/>';
  sim.refs.fx.appendChild(g);
  sim.star = {
    el: g,
    line: g.querySelector('line'),
    head: g.querySelector('circle'),
    x: 250 + Math.random() * 900,
    y: 60 + Math.random() * 180,
    t: 0,
  };
}

function spawnLeaf() {
  const el = document.createElementNS(SVG_NS, 'ellipse');
  el.setAttribute('rx', '7'); el.setAttribute('ry', '3.5');
  el.setAttribute('fill', '#5d9a55');
  sim.refs.fx.appendChild(el);
  sim.leaves.push({
    el,
    x: 1120 + Math.random() * 170,
    y: 470 + Math.random() * 90,
    t: 0,
    swayPhase: Math.random() * Math.PI * 2,
  });
}

function awardWisdom(amount, sx, sy, note) {
  storm.caught += amount;
  const [px, py] = simToScreen(sx, sy);
  spawnPopLabel(px, py, `${note} +${amount}`, 'golden');
}

// ---- Aging -----------------------------------------------------------------------

function simStage() {
  return LIFE_STAGES.find((s) => sim.days >= s.days);
}

function applyAging() {
  const a = Math.min(sim.days / 40, 1);
  sim.refs.nugImg.style.filter =
    `saturate(${(1.05 - 0.5 * a).toFixed(2)}) brightness(${(1 - 0.14 * a).toFixed(2)}) sepia(${(0.35 * a).toFixed(2)})`;
  sim.refs.glasses.style.opacity = sim.days >= 10 ? '1' : '0';
  sim.refs.tuft.style.opacity = sim.days >= 20 ? '1' : '0';
  sim.refs.cane.style.opacity = sim.days >= 20 ? '1' : '0';
}

// ---- Per-frame scene update --------------------------------------------------------

function renderSimScene() {
  const r = sim.refs;
  const f = sim.frac;
  const sky = skyAt(f);

  r.skyTop.setAttribute('stop-color', sky.top);
  r.skyMid.setAttribute('stop-color', sky.mid);
  r.skyHor.setAttribute('stop-color', sky.hor);
  r.stars.setAttribute('opacity', sky.stars.toFixed(2));
  r.fireflies.setAttribute('opacity', sky.stars.toFixed(2));
  const [tr, tg, tb, ta] = sky.tint;
  r.tint.setAttribute('fill', `rgba(${Math.round(tr)},${Math.round(tg)},${Math.round(tb)},${ta.toFixed(2)})`);
  r.cloudsG.setAttribute('opacity', sky.clouds.toFixed(2));

  // Sun arc (visible ~06:00–18:30 of the sim day)
  if (f > 0.235 && f < 0.775) {
    const p = (f - 0.235) / 0.54;
    const x = 130 + p * 1340;
    const y = 800 - Math.sin(p * Math.PI) * 650;
    r.sun.setAttribute('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`);
    r.sun.setAttribute('opacity', Math.min(1, Math.sin(p * Math.PI) * 3).toFixed(2));
    r.sunCore.setAttribute('fill', mixHex('#ffc46b', '#fff3c8', Math.min(1, Math.sin(p * Math.PI) * 1.6)));
  } else {
    r.sun.setAttribute('opacity', '0');
  }

  // Moon arc across the night
  const mf = f >= 0.77 ? f : f + 1;
  if (mf > 0.79 && mf < 1.245) {
    const p = (mf - 0.79) / 0.455;
    const x = 130 + p * 1340;
    const y = 760 - Math.sin(p * Math.PI) * 560;
    r.moon.setAttribute('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`);
    r.moon.setAttribute('opacity', Math.min(1, Math.sin(p * Math.PI) * 3).toFixed(2));
  } else {
    r.moon.setAttribute('opacity', '0');
  }

  for (const c of sim.clouds) {
    c.el.setAttribute('transform', `translate(${(c.x - 150).toFixed(0)},${c.y}) scale(${c.s})`);
  }
}

// Called from the storm's rAF loop each frame while sim mode is active.
function stepSim(dt, w, h) {
  // Time always flows — even in the void.
  sim.seconds += dt;
  sim.frac += dt / DAY_SECS;
  if (sim.frac >= 1) {
    sim.frac -= 1;
    sim.days += 1;
    if (sim.sub === 'regular') applyAging();
    const [px, py] = simToScreen(880, 560);
    spawnPopLabel(px, py, `☀️ Day ${sim.days + 1} — ${simStage().label}`, 'big');
  }

  // Wisdom drip: 1/sec for simply existing.
  sim.wisdomAcc += dt * WISDOM_PER_SEC;
  if (sim.wisdomAcc >= 1) {
    const whole = Math.floor(sim.wisdomAcc);
    sim.wisdomAcc -= whole;
    storm.caught += whole;
  }

  if (sim.sub === 'ultra') return; // nuggets cannot see; nothing to draw

  // Ambient events
  const daytime = sim.frac > 0.28 && sim.frac < 0.72;
  const night = sim.frac < 0.2 || sim.frac > 0.82;
  sim.birdT -= dt;
  if (sim.birdT <= 0 && daytime) {
    spawnFlock();
    sim.birdT = 16 + Math.random() * 18;
  }
  sim.starT -= dt;
  if (sim.starT <= 0 && night && !sim.star) {
    spawnShootingStar();
    sim.starT = 35 + Math.random() * 40;
  }
  sim.leafT -= dt;
  if (sim.leafT <= 0) {
    spawnLeaf();
    sim.leafT = 22 + Math.random() * 24;
  }

  // Drift clouds
  for (const c of sim.clouds) c.x = (c.x + c.speed * dt + 1900) % 1900;

  // Flocks
  for (let i = sim.birds.length - 1; i >= 0; i--) {
    const fkl = sim.birds[i];
    fkl.x += fkl.dir * fkl.speed * dt;
    fkl.wave += dt * 1.4;
    const y = fkl.y + Math.sin(fkl.wave) * 14;
    fkl.el.setAttribute('transform', `translate(${fkl.x.toFixed(0)},${y.toFixed(0)})`);
    if (!fkl.awarded && ((fkl.dir === 1 && fkl.x > 760) || (fkl.dir === -1 && fkl.x < 840))) {
      fkl.awarded = true;
      awardWisdom(BIRD_BONUS, fkl.x, y, '🕊️ the birds accept you');
    }
    if (fkl.x < -260 || fkl.x > 1860) {
      fkl.el.remove();
      sim.birds.splice(i, 1);
    }
  }

  // Shooting star
  if (sim.star) {
    const s = sim.star;
    s.t += dt;
    const p = s.t / 0.9;
    const x = s.x + p * 330, y = s.y + p * 130;
    s.line.setAttribute('x1', x); s.line.setAttribute('y1', y);
    s.line.setAttribute('x2', x - 85); s.line.setAttribute('y2', y - 34);
    s.head.setAttribute('cx', x); s.head.setAttribute('cy', y);
    s.el.setAttribute('opacity', String(Math.max(0, 1 - p)));
    if (p >= 1) {
      s.el.remove();
      sim.star = null;
      awardWisdom(STAR_BONUS, x, y, '🌠 you wished upon a star');
    }
  }

  // Falling leaves
  for (let i = sim.leaves.length - 1; i >= 0; i--) {
    const l = sim.leaves[i];
    l.t += dt;
    l.swayPhase += dt * 3;
    const x = l.x + Math.sin(l.swayPhase) * 24;
    const y = l.y + l.t * 42;
    l.el.setAttribute('transform',
      `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(Math.sin(l.swayPhase) * 40).toFixed(0)})`);
    if (y > 780) {
      l.el.remove();
      sim.leaves.splice(i, 1);
    }
  }

  renderSimScene();
}

// Test/debug hook: jump the simulation to a time of day / age. Used by the
// smoke-test harness to screenshot dawn/noon/dusk/night and an elder nugget.
window.simDebug = function (frac, days, sub) {
  if (typeof frac === 'number') sim.frac = frac;
  if (typeof days === 'number') { sim.days = days; if (sim.built) applyAging(); }
  if (sub) { sim.sub = sub; applySimSub(); }
  if (sim.built && sim.sub !== 'ultra') renderSimScene();
};
