// Nugget Currency — popup: ZIP, display unit, master + per-site toggles.
const DEFAULTS = { enabled: true, zip: '', unit: 'auto', disabledSites: [] };

const enabledEl = document.getElementById('enabled');
const zipEl = document.getElementById('zip');
const regionEl = document.getElementById('region');
const unitEl = document.getElementById('unit');
const siteEnabledEl = document.getElementById('siteEnabled');
const siteLabelEl = document.getElementById('siteLabel');

let settings = { ...DEFAULTS };
let host = '';

function showRegion() {
  const est = estimateFromZip(zipEl.value.trim());
  regionEl.textContent = `📍 ${est.name} · $${est.price.toFixed(2)} / 6pc` +
    ` (≈ $${(est.price / 6).toFixed(2)} per nug)`;
}

function save() {
  chrome.storage.sync.set(settings);
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = s;
  enabledEl.checked = s.enabled;
  zipEl.value = s.zip || '';
  unitEl.value = s.unit;
  showRegion();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    try { host = new URL(tabs[0].url).hostname; } catch { host = ''; }
    if (!host || host.startsWith('chrome')) {
      siteEnabledEl.disabled = true;
      siteLabelEl.textContent = 'Not available on this page';
      return;
    }
    siteLabelEl.textContent = 'Enabled on ' + host;
    siteEnabledEl.checked = !settings.disabledSites.includes(host);
  });
});

enabledEl.addEventListener('change', () => {
  settings.enabled = enabledEl.checked;
  save();
});

zipEl.addEventListener('input', () => {
  zipEl.value = zipEl.value.replace(/\D/g, '').slice(0, 5);
  settings.zip = zipEl.value;
  showRegion();
  save();
});

unitEl.addEventListener('change', () => {
  settings.unit = unitEl.value;
  save();
});

siteEnabledEl.addEventListener('change', () => {
  if (!host) return;
  settings.disabledSites = settings.disabledSites.filter((h) => h !== host);
  if (!siteEnabledEl.checked) settings.disabledSites.push(host);
  save();
});
