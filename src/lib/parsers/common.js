const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function toIso(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m, d));
  if (isNaN(dt) || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// Parse dates as they appear in Indian bank statements (day first):
// 02/07/2026, 02-07-26, 02 Jul 2026, 02-Jul-2026, 2026-07-02
export function parseIndianDate(s) {
  if (!s) return null;
  // Kotak-style "20-01-2026 16:35:49" — drop the trailing timestamp
  const str = String(s).trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm|AM|PM)?$/, '');
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return toIso(+m[1], +m[2] - 1, +m[3]);
  m = str.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/);
  if (m) return toIso(+m[3], +m[2] - 1, +m[1]);
  m = str.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/, ]+(\d{2,4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon !== undefined) return toIso(+m[3], mon, +m[1]);
  }
  return null;
}

// "1,23,456.78" -> 123456.78 ; "(500)" -> -500 ; "" -> null
export function parseAmount(s) {
  if (s == null) return null;
  let str = String(s).replace(/[₹\sINR]/gi, '').trim();
  if (!str || str === '-' || str === '--') return null;
  let neg = false;
  if (/^\(.*\)$/.test(str)) {
    neg = true;
    str = str.slice(1, -1);
  }
  if (str.startsWith('-')) {
    neg = true;
    str = str.slice(1);
  }
  str = str.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  const n = parseFloat(str);
  if (isNaN(n) || n === 0) return null;
  return neg ? -n : n;
}

export const inr = (n) =>
  '₹' +
  (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const inr2 = (n) =>
  '₹' +
  (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
