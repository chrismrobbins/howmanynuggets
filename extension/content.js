// Nugget Currency — content script.
// Finds USD prices on the page and annotates them with what they're really
// worth: chicken nuggets, priced by your ZIP code's regional estimate (the
// same model as howmanynuggets.com — see pricing.js). Annotates rather than
// replaces so checkout flows, copy-paste, and price comparisons stay intact.
//
// Easter eggs: a single price of $1M–$10M summons a mini nugget storm across
// the page (once); over $10M earns the traditional roast.

(function () {
  'use strict';

  const DEFAULTS = { enabled: true, zip: '', unit: 'auto', disabledSites: [] };
  const MAX_NOTES = 600;              // per page, so heavy pages stay snappy
  const PRICE_RE = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\$\s?\d+(?:\.\d{1,2})?/g;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'TITLE']);
  const STORM_MIN = 1000000, ROAST_MIN = 10000000;

  let settings = null;
  let est = { name: 'National estimate', price: NATIONAL_6PC };
  let noteCount = 0;
  let stormFired = false;
  let roastFired = false;
  const fmtN = new Intl.NumberFormat('en-US');

  // ---- Conversion -----------------------------------------------------------

  function noteText(dollars) {
    const perNug = est.price / 6;
    const nugs = Math.floor(dollars / perNug);
    if (dollars > ROAST_MIN) return '🛑 not nug-payable';
    if (settings.unit === 'boxes' || (settings.unit === 'auto' && nugs >= 1200)) {
      if (dollars >= STORM_MIN && settings.unit === 'auto') {
        return `🌪️ a Nugget Storm (${fmtN.format(nugs)} nugs)`;
      }
      return `≈ ${fmtN.format(Math.floor(nugs / 6))} × 6pc 🍗`;
    }
    return `≈ ${fmtN.format(nugs)} 🍗`;
  }

  function makeNote(dollars) {
    const span = document.createElement('span');
    span.className = 'nug-note';
    span.textContent = ' ' + noteText(dollars);
    span.title = `${est.name}: est. $${(est.price / 6).toFixed(2)} per nugget — nuggetcurrency by howmanynuggets.com`;
    noteCount++;
    if (window === window.top) {
      if (!stormFired && dollars >= STORM_MIN && dollars <= ROAST_MIN) {
        stormFired = true;
        spawnPageStorm();
      } else if (!roastFired && dollars > ROAST_MIN) {
        roastFired = true;
        spawnRoast(dollars);
      }
    }
    return span;
  }

  // ---- Detection ------------------------------------------------------------

  function skippable(el) {
    return !el || SKIP_TAGS.has(el.tagName) || el.isContentEditable ||
      el.closest('.nug-note') || el.closest('[data-nugged]');
  }

  function annotateTextNode(node) {
    if (noteCount >= MAX_NOTES) return;
    const text = node.nodeValue;
    if (!text || text.indexOf('$') === -1) return;
    if (skippable(node.parentElement)) return;
    // A note may already follow this node (re-scans after DOM mutations).
    if (node.nextSibling && node.nextSibling.nodeType === 1 &&
        node.nextSibling.classList && node.nextSibling.classList.contains('nug-note')) return;

    PRICE_RE.lastIndex = 0;
    const matches = [...text.matchAll(PRICE_RE)];
    // Insert from the last match backward so earlier offsets stay valid.
    for (let i = matches.length - 1; i >= 0 && noteCount < MAX_NOTES; i--) {
      const m = matches[i];
      const dollars = parseFloat(m[0].replace(/[$,\s]/g, ''));
      if (!isFinite(dollars)) continue;
      const tail = node.splitText(m.index + m[0].length);
      node.parentNode.insertBefore(makeNote(dollars), tail);
    }
  }

  // Amazon splits prices across nodes (`$` `12` `99`) but keeps the full price
  // in a hidden .a-offscreen span — annotate the container from that.
  function annotateAmazonPrices(root) {
    const scope = root.querySelectorAll ? root : document;
    scope.querySelectorAll('.a-price:not([data-nugged])').forEach((el) => {
      if (noteCount >= MAX_NOTES) return;
      const off = el.querySelector('.a-offscreen');
      const m = off && off.textContent.match(/\$([\d,]+(?:\.\d{1,2})?)/);
      if (!m) return;
      el.dataset.nugged = '1';
      el.appendChild(makeNote(parseFloat(m[1].replace(/,/g, ''))));
    });
  }

  function scan(root) {
    if (noteCount >= MAX_NOTES) return;
    if (root.nodeType === 3) { annotateTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1 && skippable(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeValue.indexOf('$') !== -1 && !skippable(n.parentElement)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(annotateTextNode);
    if (root.querySelectorAll || root === document) annotateAmazonPrices(root);
  }

  // ---- Dynamic pages ----------------------------------------------------------

  let pending = [];
  let flushTimer = null;

  function observeMutations() {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          // Ignore our own notes.
          if (n.nodeType === 1 && n.classList && n.classList.contains('nug-note')) continue;
          pending.push(n);
        }
      }
      if (pending.length && !flushTimer) {
        flushTimer = setTimeout(() => {
          const batch = pending;
          pending = [];
          flushTimer = null;
          batch.forEach(scan);
        }, 300);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Easter eggs ---------------------------------------------------------------

  function spawnPageStorm() {
    const layer = document.createElement('div');
    layer.className = 'nug-storm-layer';
    document.documentElement.appendChild(layer);
    const src = chrome.runtime.getURL('nugget.png');
    for (let i = 0; i < 36; i++) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      const size = 30 + Math.random() * 40;
      img.style.width = size + 'px';
      const fromLeft = Math.random() < 0.5;
      img.style.left = (fromLeft ? -80 : window.innerWidth + 80) + 'px';
      img.style.top = Math.random() * window.innerHeight + 'px';
      img.style.transitionDuration = (4 + Math.random() * 5) + 's';
      img.style.transitionDelay = (Math.random() * 2.5) + 's';
      layer.appendChild(img);
      // Force a style flush so the transition animates from the start position
      // instead of the transform applying instantly.
      void img.offsetWidth;
      const dx = (fromLeft ? 1 : -1) * (window.innerWidth + 240);
      const dy = (Math.random() - 0.5) * 400;
      requestAnimationFrame(() => {
        img.style.transform = `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 720}deg)`;
      });
    }
    setTimeout(() => layer.remove(), 13000);
  }

  function spawnRoast(dollars) {
    const toast = document.createElement('div');
    toast.className = 'nug-roast';
    toast.innerHTML =
      '<div class="nug-roast-head">🛑💸 ' + '$' + fmtN.format(Math.round(dollars)) + '?</div>' +
      '<div>Bro. You are not paying in Nugs for something this big.</div>' +
      '<button type="button" aria-label="Dismiss">✕</button>';
    toast.querySelector('button').addEventListener('click', () => toast.remove());
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 12000);
  }

  // ---- Boot -----------------------------------------------------------------------

  chrome.storage.sync.get(DEFAULTS, (s) => {
    settings = s;
    if (!settings.enabled) return;
    if (settings.disabledSites.includes(location.hostname)) return;
    est = estimateFromZip((settings.zip || '').trim());
    scan(document.body || document.documentElement);
    if (document.body) observeMutations();
  });
})();
