// Berechnet einmal pro Render alle abgeleiteten Daten (Zyklen, Vorhersage, Phasen).

import { state, allSymptoms } from './store.js';
import { computeCycleStats, predictNext, phaseInfo, pillInfo, PHASE_ORDER } from './cycle.js';
import { todayISO } from './util.js';

export function buildContext(today = todayISO()) {
  const settings = state.settings;
  const pillMode = !!settings.pill.enabled;
  const stats = computeCycleStats(state.periods, settings, today);
  const pred = predictNext(stats, today);
  const cache = new Map();

  function phaseOf(date) {
    if (pillMode) return null; // Mit Pille keine natürlichen Phasen
    if (!cache.has(date)) cache.set(date, phaseInfo(date, stats, pred, today));
    return cache.get(date);
  }

  return {
    today,
    settings,
    pillMode,
    stats,
    pred: pillMode ? null : pred,
    rawPred: pred,
    phaseOf,
    pillOf: (date) => pillInfo(date, settings.pill),
  };
}

/* ---------- Auswertungen für die Statistik-Ansicht ---------- */

const MAX_DAY = 40;

/** Einträge mit Phase (nur bis heute, nur echte Daten). */
function loggedWithPhase(ctx) {
  const out = [];
  for (const e of state.days.values()) {
    if (e.date > ctx.today) continue;
    const ph = ctx.phaseOf(e.date);
    if (!ph || !ph.phase || ph.predictedPeriod) continue;
    out.push({ e, ph });
  }
  return out;
}

export function symptomsByPhase(ctx) {
  const rows = loggedWithPhase(ctx);
  const res = {};
  for (const p of PHASE_ORDER) res[p] = { days: 0, counts: new Map() };
  for (const { e, ph } of rows) {
    const bucket = res[ph.phase];
    bucket.days++;
    for (const s of e.symptoms) bucket.counts.set(s, (bucket.counts.get(s) || 0) + 1);
  }
  const labels = new Map(allSymptoms().map((s) => [s.id, s.label]));
  const out = {};
  for (const p of PHASE_ORDER) {
    const { days, counts } = res[p];
    out[p] = {
      days,
      top: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({ id, label: labels.get(id) || id, count, pct: days ? Math.round((count / days) * 100) : 0 })),
    };
  }
  return out;
}

/** Symptome insgesamt (auch im Pillen-Modus nutzbar). */
export function symptomsOverall() {
  const counts = new Map();
  let days = 0;
  for (const e of state.days.values()) {
    if (!e.symptoms.length) continue;
    days++;
    e.symptoms.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
  }
  const labels = new Map(allSymptoms().map((s) => [s.id, s.label]));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, count]) => ({ id, label: labels.get(id) || id, count }));
}

export const METRICS = {
  mood: { label: 'Stimmung', field: 'mood' },
  energy: { label: 'Energie', field: 'energy' },
  focus: { label: 'Fokus', field: 'focus' },
  sleepQuality: { label: 'Schlaf', field: 'sleepQuality' },
};

/** Durchschnitt einer Skala (1–5) pro Zyklustag und pro Phase. */
export function metricOverCycle(ctx, metric) {
  const field = METRICS[metric].field;
  const byDay = Array.from({ length: MAX_DAY }, () => ({ sum: 0, n: 0 }));
  const byPhase = {};
  PHASE_ORDER.forEach((p) => { byPhase[p] = { sum: 0, n: 0 }; });
  for (const { e, ph } of loggedWithPhase(ctx)) {
    const v = e[field];
    if (v == null) continue;
    if (ph.cycleDay >= 1 && ph.cycleDay <= MAX_DAY) {
      byDay[ph.cycleDay - 1].sum += v;
      byDay[ph.cycleDay - 1].n++;
    }
    byPhase[ph.phase].sum += v;
    byPhase[ph.phase].n++;
  }
  return {
    byDay: byDay.map((b, i) => ({ day: i + 1, avg: b.n ? b.sum / b.n : null, n: b.n })),
    byPhase: Object.fromEntries(PHASE_ORDER.map((p) => [p, { avg: byPhase[p].n ? byPhase[p].sum / byPhase[p].n : null, n: byPhase[p].n }])),
    total: byDay.reduce((a, b) => a + b.n, 0),
  };
}
