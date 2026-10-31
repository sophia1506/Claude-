// Zentraler App-Zustand + alle Schreiboperationen. Views lesen aus `state`
// und rufen die hier exportierten Funktionen auf; danach wird neu gerendert.

import * as db from './db.js';
import { todayISO, addDays, diffDays, uid } from './util.js';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SYMPTOMS = [
  { id: 'cramps', label: 'Krämpfe' },
  { id: 'headache', label: 'Kopfweh' },
  { id: 'fatigue', label: 'Müdigkeit' },
  { id: 'skin', label: 'Haut' },
  { id: 'bloating', label: 'Blähbauch' },
  { id: 'breast', label: 'Brustspannen' },
];

export const DEFAULT_SETTINGS = {
  theme: 'light', // 'light' | 'dark' | 'auto'
  defaultCycleLength: 28,
  defaultPeriodLength: 5,
  reminder: { enabled: true, time: '20:30' },
  pill: {
    enabled: false,
    type: '21_7', // '21_7' | '24_4' | '28_placebo' | 'continuous'
    packStart: null, // ISO-Datum der ersten Pille des aktuellen/ersten Blisters
    reminderEnabled: true,
    reminderTime: '21:00',
  },
  lastBackup: null, // ISO-Zeitstempel
  reminderDismissed: null, // ISO-Datum
  backupHintDismissed: null, // ISO-Datum
};

export const state = {
  days: new Map(), // date -> DayEntry
  periods: [], // [{id, start, end|null}] sortiert nach start
  settings: structuredClone(DEFAULT_SETTINGS),
  customSymptoms: [], // [{id, label}]
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

function mergeSettings(saved) {
  const s = { ...structuredClone(DEFAULT_SETTINGS), ...(saved || {}) };
  s.reminder = { ...DEFAULT_SETTINGS.reminder, ...(saved?.reminder || {}) };
  s.pill = { ...DEFAULT_SETTINGS.pill, ...(saved?.pill || {}) };
  return s;
}

export async function load() {
  const [days, periods, settings, custom] = await Promise.all([
    db.getAll('days'),
    db.getAll('periods'),
    db.get('meta', 'settings'),
    db.get('meta', 'customSymptoms'),
  ]);
  state.days = new Map(days.map((d) => [d.date, d]));
  state.periods = periods.sort((a, b) => a.start.localeCompare(b.start));
  state.settings = mergeSettings(settings);
  state.customSymptoms = custom || [];
}

/* ---------- Tageseinträge ---------- */

export function emptyDay(date) {
  return {
    date,
    flow: null, // 'light' | 'medium' | 'heavy'
    symptoms: [], // Symptom-IDs
    mood: null, // 1–5
    energy: null, // 1–5
    focus: null, // 1–5
    sleepQuality: null, // 1–5
    sleepHours: null, // Zahl
    meds: [], // [{id, name, time}]
    pillTaken: null, // true | null
    note: '',
  };
}

export function getDay(date) {
  return state.days.get(date) || emptyDay(date);
}

export function isEmptyDay(e) {
  return !e.flow && !e.symptoms.length && e.mood == null && e.energy == null && e.focus == null &&
    e.sleepQuality == null && e.sleepHours == null && !e.meds.length && !e.pillTaken && !e.note;
}

export function hasLog(date) {
  const e = state.days.get(date);
  return !!e && !isEmptyDay(e);
}

export async function saveDay(entry, { silent = false } = {}) {
  const e = { ...emptyDay(entry.date), ...entry, updatedAt: new Date().toISOString() };
  if (isEmptyDay(e)) {
    state.days.delete(e.date);
    await db.del('days', e.date);
  } else {
    state.days.set(e.date, e);
    await db.put('days', e);
  }
  if (!silent) emit();
  return e;
}

export async function patchDay(date, patch) {
  return saveDay({ ...getDay(date), ...patch });
}

/* ---------- Perioden ---------- */

export function openPeriod() {
  return state.periods.find((p) => p.end === null) || null;
}

/** Effektives Ende: offene Periode läuft bis heute. */
export function effectiveEnd(p, today = todayISO()) {
  if (p.end) return p.end;
  return today < p.start ? p.start : today;
}

export function periodDaySet(today = todayISO()) {
  const set = new Set();
  for (const p of state.periods) {
    const end = effectiveEnd(p, today);
    for (let d = p.start; d <= end; d = addDays(d, 1)) set.add(d);
  }
  return set;
}

export function isPeriodDay(date, today = todayISO()) {
  return state.periods.some((p) => date >= p.start && date <= effectiveEnd(p, today));
}

async function persistPeriods(periods) {
  state.periods = periods.sort((a, b) => a.start.localeCompare(b.start));
  await db.replaceStore('periods', state.periods);
}

/** Baut Zeiträume aus einer Menge von Tagen neu auf. IDs bleiben erhalten, wo möglich. */
function rangesFromSet(set, today, keepOpen) {
  const sorted = [...set].sort();
  const ranges = [];
  for (const d of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && diffDays(last.end, d) === 1) last.end = d;
    else ranges.push({ start: d, end: d });
  }
  const old = state.periods;
  const used = new Set();
  const pick = (pred) => {
    const m = old.find((p) => !used.has(p.id) && pred(p));
    if (m) used.add(m.id);
    return m;
  };
  return ranges.map((r) => {
    const match = pick((p) => p.start === r.start) ||
      pick((p) => p.start <= r.end && effectiveEnd(p, today) >= r.start);
    const open = keepOpen && r.end === today;
    return { id: match ? match.id : uid('p'), start: r.start, end: open ? null : r.end };
  });
}

export function snapshotPeriods() {
  return structuredClone(state.periods);
}

export async function restorePeriods(snapshot) {
  await persistPeriods(structuredClone(snapshot));
  emit();
}

/** Ein-Tap-Aktion „Periode heute". Kurze Lücken (≤ 2 Tage) werden überbrückt. */
export async function startPeriodToday(today = todayISO()) {
  if (openPeriod()) return;
  const periods = snapshotPeriods();
  const recent = periods.filter((p) => p.end && p.end <= today && diffDays(p.end, today) <= 2 && p.start <= today)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  const containing = periods.find((p) => p.end && p.start <= today && p.end >= today);
  if (containing) {
    // Heute liegt in einer bereits abgeschlossenen Periode -> wieder öffnen, falls sie heute endete.
    if (containing.end === today) containing.end = null;
  } else if (recent) {
    recent.end = null;
  } else {
    periods.push({ id: uid('p'), start: today, end: null });
  }
  await persistPeriods(periods);
  emit();
}

/** Ein-Tap-Aktion „Periode vorbei" – letzter Periodentag ist `lastDay` (Standard: heute). */
export async function endPeriod(lastDay = todayISO()) {
  const periods = snapshotPeriods();
  const p = periods.find((x) => x.end === null);
  if (!p) return;
  p.end = lastDay < p.start ? p.start : lastDay;
  await persistPeriods(periods);
  emit();
}

/** Für die Tagesansicht: einzelnen Tag als Periodentag an-/abwählen. */
export async function setPeriodDay(date, on, today = todayISO()) {
  if (date > today) return;
  const set = periodDaySet(today);
  const wasOpen = !!openPeriod();
  if (on) set.add(date); else set.delete(date);
  const keepOpen = wasOpen || (on && date === today);
  await persistPeriods(rangesFromSet(set, today, keepOpen));
  if (!on) {
    const e = state.days.get(date);
    if (e && e.flow) await saveDay({ ...e, flow: null }, { silent: true });
  }
  emit();
}

/** Onboarding / Nachtragen: Periode mit Start (und optional Ende) eintragen. */
export async function addPeriodRange(start, end, today = todayISO()) {
  const set = periodDaySet(today);
  const last = end || (diffDays(start, today) < 7 ? today : addDays(start, state.settings.defaultPeriodLength - 1));
  for (let d = start; d <= last && d <= today; d = addDays(d, 1)) set.add(d);
  const keepOpen = !end && last === today || !!openPeriod();
  await persistPeriods(rangesFromSet(set, today, keepOpen));
  emit();
}

/* ---------- Einstellungen & Symptome ---------- */

export async function updateSettings(patch) {
  const s = state.settings;
  state.settings = mergeSettings({
    ...s,
    ...patch,
    reminder: { ...s.reminder, ...(patch.reminder || {}) },
    pill: { ...s.pill, ...(patch.pill || {}) },
  });
  await db.put('meta', state.settings, 'settings');
  emit();
}

export function allSymptoms() {
  return [...DEFAULT_SYMPTOMS, ...state.customSymptoms];
}

export function symptomLabel(id) {
  return allSymptoms().find((s) => s.id === id)?.label || id;
}

export async function addCustomSymptom(label) {
  const clean = label.trim().slice(0, 30);
  if (!clean) return null;
  const existing = allSymptoms().find((s) => s.label.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const sym = { id: uid('s'), label: clean };
  state.customSymptoms = [...state.customSymptoms, sym];
  await db.put('meta', state.customSymptoms, 'customSymptoms');
  emit();
  return sym;
}

export async function removeCustomSymptom(id) {
  state.customSymptoms = state.customSymptoms.filter((s) => s.id !== id);
  await db.put('meta', state.customSymptoms, 'customSymptoms');
  emit();
}

/* ---------- Import / Reset ---------- */

export async function replaceEverything({ days, periods, settings, customSymptoms }) {
  const mergedSettings = mergeSettings(settings);
  await db.replaceAll({
    days,
    periods,
    meta: { settings: mergedSettings, customSymptoms: customSymptoms || [] },
  });
  await load();
  emit();
}

export function notify() { emit(); }
