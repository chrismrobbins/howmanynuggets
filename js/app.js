// ---- App wiring --------------------------------------------------------------
const zipEl = document.getElementById('zip');
const input = document.getElementById('amount');
const countEl = document.getElementById('count');
const breakdownEl = document.getElementById('breakdown');
const regionNameEl = document.getElementById('regionName');
const regionPriceEl = document.getElementById('regionPrice');
const gridEl = document.getElementById('nuggetGrid');
const bigMessageEl = document.getElementById('bigMessage');
const arcadeBtn = document.getElementById('arcadeBtn');
const BIG_MESSAGE_THRESHOLD = 10000000; // dollars

// The arcade runs at any amount. With a light wallet (or an empty field) it
// spins up a default "house storm" instead so there's always something to play.
const HOUSE_STORM_NUGS = 1000000;
const HOUSE_STORM_DOLLARS = 5000000; // pegs the house storm at Cat 3

function updateArcadeBtn() {
  arcadeBtn.classList.toggle('running', storm.running);
  arcadeBtn.textContent = storm.running ? '🛑 Stop the Arcade' : '🕹️ Enter the Nugget Arcade';
}

// While the arcade is on, keep the storm in sync with whatever's typed.
function syncArcade(nuggets, dollars) {
  if (!storm.arcade) return;
  const total = nuggets >= 100 ? nuggets : HOUSE_STORM_NUGS;
  startStorm(total, dollars > 0 ? dollars : HOUSE_STORM_DOLLARS);
}

arcadeBtn.addEventListener('click', () => {
  if (storm.running) {
    stopStorm(); // also clears storm.arcade
    return;
  }
  storm.arcade = true;
  update();
});

// Cap how many <img> we actually render so huge counts don't freeze the tab.
// The headline number stays exact; the grid shows a "+N more" note past the cap.
const MAX_NUGGETS_DRAWN = 500;

function renderNuggets(count) {
  gridEl.innerHTML = '';
  if (count <= 0) return;
  const drawn = Math.min(count, MAX_NUGGETS_DRAWN);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < drawn; i++) {
    const img = document.createElement('img');
    img.src = 'nugget.png';
    img.alt = 'McNugget';
    img.loading = 'lazy';
    img.draggable = false;
    // slight animation stagger, capped so it never feels sluggish
    img.style.animationDelay = Math.min(i * 4, 400) + 'ms';
    frag.appendChild(img);
  }
  gridEl.appendChild(frag);
  if (count > drawn) {
    const note = document.createElement('div');
    note.className = 'more-note';
    note.textContent = '+ ' + fmt.format(count - drawn) + ' more nuggets (not drawn)';
    gridEl.appendChild(note);
  }
}

function update() {
  const est = estimateFromZip(zipEl.value.trim());
  const pricePerNugget = est.price / 6;

  regionNameEl.textContent = est.name;
  regionPriceEl.textContent = money.format(est.price);

  const dollars = parseFloat(input.value.replace(/,/g, ''));
  if (isNaN(dollars) || dollars <= 0) {
    countEl.textContent = '0';
    breakdownEl.textContent = 'Enter an amount to see how many nuggets you can get.';
    renderNuggets(0);
    syncArcade(0, 0); // arcade stays up on the house storm
    bigMessageEl.classList.remove('active');
    return;
  }

  const nuggets = Math.floor(dollars / pricePerNugget);
  const sixPieces = Math.floor(nuggets / 6);
  const remainder = nuggets % 6;

  const nuggetText = fmt.format(nuggets);
  countEl.textContent = nuggetText;
  // Shrink the headline as the number grows so it wraps cleanly inside the card.
  const len = nuggetText.length;
  let size = '3rem';
  if (len > 30)      size = '1.15rem';
  else if (len > 22) size = '1.5rem';
  else if (len > 15) size = '2rem';
  else if (len > 9)  size = '2.5rem';
  countEl.style.fontSize = size;

  let detail = `At an estimated ${money.format(pricePerNugget)} per nugget in the <strong>${est.name}</strong>, `;
  detail += `${money.format(dollars)} gets you <strong>${fmt.format(nuggets)}</strong> McNuggets.`;
  if (sixPieces > 0) {
    detail += ` That's ≈ <strong>${fmt.format(sixPieces)}</strong> six-piece box${sixPieces === 1 ? '' : 'es'}`;
    detail += remainder > 0 ? ` plus <strong>${remainder}</strong> extra.` : '.';
  }
  breakdownEl.innerHTML = detail;
  renderNuggets(nuggets);

  syncArcade(nuggets, dollars);

  // Over $10,000,000 → tell them this site isn't for them.
  bigMessageEl.classList.toggle('active', dollars > BIG_MESSAGE_THRESHOLD);
}

zipEl.addEventListener('input', () => {
  zipEl.value = zipEl.value.replace(/\D/g, '').slice(0, 5);
  update();
});

// Format the dollar amount with thousands separators live, keeping the
// caret roughly where the user left it (count significant chars, not commas).
function formatAmount() {
  const raw = input.value;
  const caret = input.selectionStart;
  const sigBeforeCaret = raw.slice(0, caret).replace(/[^\d.]/g, '').length;

  // Keep digits and a single decimal point only.
  let cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
  }

  let [intPart, decPart] = cleaned.split('.');
  intPart = (intPart || '').replace(/^0+(?=\d)/, '');          // trim leading zeros
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ','); // add commas
  let formatted = intFmt;
  if (cleaned.indexOf('.') !== -1) {
    formatted = intFmt + '.' + (decPart || '').slice(0, 2);     // cap at cents
  }

  input.value = formatted;

  // Restore caret after the same number of significant chars.
  let pos = 0, seen = 0;
  while (pos < formatted.length && seen < sigBeforeCaret) {
    if (/[\d.]/.test(formatted[pos])) seen++;
    pos++;
  }
  input.setSelectionRange(pos, pos);

  update();
}
input.addEventListener('input', formatAmount);
