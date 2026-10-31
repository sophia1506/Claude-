// Hilfsfunktionen: Datum (immer lokale Kalendertage als "YYYY-MM-DD"), Formatierung, DOM.

const DAY_MS = 86400000;

export function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Rechnen in UTC vermeidet Fehler durch Sommer-/Winterzeit.
function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const d = new Date(ms);
  return toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

/** Anzahl Tage von a nach b (b - a). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function weekdayMon0(iso) {
  // 0 = Montag … 6 = Sonntag
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7;
}

export function isValidISO(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function monthName(m) { return MONTHS[m]; }

/** "12. Nov." */
export function fmtShort(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}. ${MONTHS_SHORT[m - 1]}`;
}

/** "Mittwoch, 12. November" */
export function fmtLong(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[weekdayMon0(iso)]}, ${d}. ${MONTHS[m - 1]}`;
}

/** "12.11.2026" */
export function fmtNumeric(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function relativeDay(iso, today = todayISO()) {
  const n = diffDays(today, iso);
  if (n === 0) return 'heute';
  if (n === -1) return 'gestern';
  if (n === 1) return 'morgen';
  if (n < 0) return `vor ${-n} Tagen`;
  return `in ${n} Tagen`;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

export function fmtNum(x, digits = 1) {
  return x.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
