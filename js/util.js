// Shared number formatters used across the app.
const fmt = new Intl.NumberFormat('en-US');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// 🎂 FOUNDER'S DAY — August 3rd, one night a year, the whole street celebrates.
// (The town can't agree on WHAT was founded. The party happens anyway.)
// localStorage nugFoundersDayForce: '1' forces it on, '0' forces it off —
// so the decorations can be tested (or escaped) on any calendar day.
function nugFoundersDay() {
  try {
    const f = localStorage.getItem('nugFoundersDayForce');
    if (f === '1') return true;
    if (f === '0') return false;
  } catch (e) { /* private mode keeps its own calendar */ }
  const d = new Date();
  return d.getMonth() === 7 && d.getDate() === 3;
}
