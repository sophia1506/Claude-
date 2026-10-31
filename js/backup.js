// Export / Import als JSON. Format ist in DATENFORMAT.md dokumentiert
// (gedacht für die spätere Anbindung an „Brains 0.2").

import { state, SCHEMA_VERSION, DEFAULT_SYMPTOMS, emptyDay, replaceEverything, updateSettings } from './store.js';
import { buildContext } from './context.js';
import { isValidISO, todayISO, round1 } from './util.js';
import { PHASES } from './cycle.js';

export const APP_VERSION = '1.0.0';
export const FORMAT_ID = 'mondzeit-backup';

export function buildExport(today = todayISO()) {
  const ctx = buildContext(today);
  const { stats } = ctx;
  const ph = ctx.phaseOf(today);
  return {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'Mondzeit', version: APP_VERSION },
    settings: state.settings,
    symptomCatalog: [
      ...DEFAULT_SYMPTOMS.map((s) => ({ ...s, custom: false })),
      ...state.customSymptoms.map((s) => ({ ...s, custom: true })),
    ],
    periods: state.periods.map(({ id, start, end }) => ({ id, start, end })),
    days: [...state.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    // Abgeleitete Werte – beim Import ignoriert, für andere Apps bequem lesbar.
    derived: {
      generatedFor: today,
      pillMode: ctx.pillMode,
      cycles: stats.cycles.map((c) => ({ start: c.start, end: c.end, length: c.length, periodLength: c.periodLength, excludedFromAverage: c.excluded })),
      averages: {
        cycleLength: round1(stats.avgCycle),
        cycleLengthSD: stats.sdCycle != null ? round1(stats.sdCycle) : null,
        periodLength: round1(stats.avgPeriod),
        cyclesCounted: stats.nCycles,
        irregular: stats.irregular,
      },
      prediction: ctx.pred ? {
        nextPeriodMostLikely: ctx.pred.effNext,
        windowStart: ctx.pred.windowStart,
        windowEnd: ctx.pred.windowEnd,
        confidence: ctx.pred.confidence,
        isEstimate: true,
        notContraception: true,
      } : null,
      today: ph ? { date: today, cycleDay: ph.cycleDay, phase: ph.phase, phaseLabel: PHASES[ph.phase]?.label ?? null } : null,
    },
  };
}

export function exportFileName(today = todayISO()) {
  return `mondzeit-backup-${today}.json`;
}

/** Teilt (iOS: „In Dateien sichern") oder lädt die Datei herunter. */
export async function exportBackup() {
  const json = JSON.stringify(buildExport(), null, 2);
  const name = exportFileName();
  const blob = new Blob([json], { type: 'application/json' });
  let file = null;
  try { file = new File([blob], name, { type: 'application/json' }); } catch { /* alte Browser */ }

  const isMobile = matchMedia('(pointer: coarse)').matches;
  if (isMobile && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mondzeit Backup' });
      await updateSettings({ lastBackup: new Date().toISOString() });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // sonst: auf Download zurückfallen
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  await updateSettings({ lastBackup: new Date().toISOString() });
  return 'downloaded';
}

/* ---------- Import ---------- */

const FLOWS = ['light', 'medium', 'heavy'];
const scale = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const timeOk = (t) => (typeof t === 'string' && /^\d{2}:\d{2}$/.test(t) ? t : '');

function sanitizeDay(raw) {
  if (!raw || !isValidISO(raw.date)) return null;
  const e = emptyDay(raw.date);
  e.flow = FLOWS.includes(raw.flow) ? raw.flow : null;
  e.symptoms = Array.isArray(raw.symptoms) ? [...new Set(raw.symptoms.filter((s) => typeof s === 'string'))] : [];
  e.mood = scale(raw.mood);
  e.energy = scale(raw.energy);
  e.focus = scale(raw.focus);
  e.sleepQuality = scale(raw.sleepQuality);
  const h = Number(raw.sleepHours);
  e.sleepHours = raw.sleepHours != null && Number.isFinite(h) && h >= 0 && h <= 24 ? h : null;
  e.meds = Array.isArray(raw.meds)
    ? raw.meds.filter((m) => m && typeof m.name === 'string' && m.name.trim())
      .map((m) => ({ id: String(m.id || Math.random().toString(36).slice(2)), name: m.name.trim().slice(0, 60), time: timeOk(m.time) }))
    : [];
  e.pillTaken = raw.pillTaken === true ? true : null;
  e.note = typeof raw.note === 'string' ? raw.note.slice(0, 2000) : '';
  if (raw.updatedAt) e.updatedAt = String(raw.updatedAt);
  return e;
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!data || data.format !== FORMAT_ID) throw new Error('Das ist keine Mondzeit-Backup-Datei.');
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('Das Backup stammt aus einer neueren App-Version. Bitte App aktualisieren.');
  }
  const periods = (Array.isArray(data.periods) ? data.periods : [])
    .filter((p) => p && isValidISO(p.start) && (p.end === null || isValidISO(p.end)) && (!p.end || p.end >= p.start))
    .map((p, i) => ({ id: String(p.id || `p_import_${i}`), start: p.start, end: p.end }));
  // Höchstens eine offene Periode – die neueste.
  const open = periods.filter((p) => p.end === null).sort((a, b) => b.start.localeCompare(a.start));
  open.slice(1).forEach((p) => { p.end = p.start; });

  const days = (Array.isArray(data.days) ? data.days : []).map(sanitizeDay).filter(Boolean);
  const customSymptoms = (Array.isArray(data.symptomCatalog) ? data.symptomCatalog : [])
    .filter((s) => s && s.custom && typeof s.id === 'string' && typeof s.label === 'string')
    .map((s) => ({ id: s.id, label: s.label.slice(0, 30) }));

  return { periods, days, settings: data.settings && typeof data.settings === 'object' ? data.settings : {}, customSymptoms };
}

export async function importBackup(text) {
  const parsed = parseBackup(text);
  await replaceEverything(parsed);
  return { periods: parsed.periods.length, days: parsed.days.length };
}
