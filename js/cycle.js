// Zyklusberechnung: reine Funktionen ohne Seiteneffekte.
// Alle Angaben sind Schätzungen – KEINE Verhütungsmethode.

import { addDays, diffDays, todayISO } from './util.js';

export const PHASES = {
  menstruation: { id: 'menstruation', label: 'Menstruation', short: 'Periode' },
  follicular: { id: 'follicular', label: 'Follikelphase', short: 'Follikel' },
  ovulation: { id: 'ovulation', label: 'Ovulationsphase', short: 'Ovulation' },
  luteal: { id: 'luteal', label: 'Lutealphase', short: 'Luteal' },
};
export const PHASE_ORDER = ['menstruation', 'follicular', 'ovulation', 'luteal'];

// Zyklen außerhalb dieses Bereichs gelten als „Lücke" (z. B. vergessen einzutragen)
// und fließen nicht in den Durchschnitt ein.
const MIN_CYCLE = 15;
const MAX_CYCLE = 90;
const RECENT_CYCLES = 6;
const LUTEAL_LENGTH = 14; // Lutealphase ist relativ konstant, ca. 12–14 Tage

/* ---------- Statistik-Helfer ---------- */

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Robuster Mittelwert: Huber-Gewichtung um den Median.
 * Ausreißer zählen weniger stark, statt komplett ignoriert zu werden.
 * Jüngere Zyklen werden leicht stärker gewichtet.
 */
export function robustMean(values) {
  const n = values.length;
  if (!n) return null;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  const scale = Math.max(1.4826 * mad, 1.5);
  const k = 2 * scale;
  let sw = 0; let sv = 0; let outliers = 0;
  const weights = values.map((v, i) => {
    const dev = Math.abs(v - med);
    const huber = dev <= k ? 1 : k / dev;
    if (huber < 1) outliers++;
    const recency = 0.75 + 0.25 * ((i + 1) / n); // ältester 0.75…neuester 1.0
    return huber * recency;
  });
  values.forEach((v, i) => { sw += weights[i]; sv += weights[i] * v; });
  const mean = sv / sw;
  // Streuung aus gekappten Werten: ein einzelner Ausreißer bläht sie nicht auf.
  const clipped = values.map((v) => Math.min(med + k, Math.max(med - k, v)));
  const cmean = clipped.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(clipped.reduce((a, v) => a + (v - cmean) ** 2, 0) / (n - 1)) : null;
  return { mean, sd, median: med, min: Math.min(...values), max: Math.max(...values), n, outliers };
}

/* ---------- Perioden & Zyklen ---------- */

export function buildRanges(periods, today = todayISO()) {
  return [...periods]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => {
      const end = p.end || (today < p.start ? p.start : today);
      return { id: p.id, start: p.start, end, open: !p.end, length: diffDays(p.start, end) + 1 };
    });
}

export function buildCycles(ranges) {
  const cycles = [];
  for (let i = 0; i < ranges.length - 1; i++) {
    const length = diffDays(ranges[i].start, ranges[i + 1].start);
    cycles.push({
      start: ranges[i].start,
      end: addDays(ranges[i + 1].start, -1),
      length,
      periodLength: ranges[i].length,
      excluded: length < MIN_CYCLE || length > MAX_CYCLE,
    });
  }
  return cycles;
}

/** Fasst alles zusammen, was Vorhersage, Kalender und Statistik brauchen. */
export function computeCycleStats(periods, settings, today = todayISO()) {
  const ranges = buildRanges(periods, today);
  const cycles = buildCycles(ranges);
  const valid = cycles.filter((c) => !c.excluded);
  const recent = valid.slice(-RECENT_CYCLES);
  const cl = robustMean(recent.map((c) => c.length));
  const closed = ranges.filter((r) => !r.open && r.length <= 14).slice(-RECENT_CYCLES);
  const pl = robustMean(closed.map((r) => r.length));

  const defC = Number(settings.defaultCycleLength) || 28;
  const defP = Number(settings.defaultPeriodLength) || 5;
  let avgCycle = defC;
  if (cl) avgCycle = cl.n >= 2 ? cl.mean : (cl.mean + defC) / 2; // ein einzelner Zyklus wird mit dem Standard gemischt
  const avgPeriod = pl ? pl.mean : defP;
  const sdCycle = cl && cl.n >= 2 ? cl.sd : null;

  return {
    ranges,
    cycles,
    validCycles: valid,
    nCycles: valid.length,
    avgCycle,
    sdCycle,
    minCycle: cl ? cl.min : null,
    maxCycle: cl ? cl.max : null,
    outliers: cl ? cl.outliers : 0,
    avgPeriod,
    sdPeriod: pl && pl.n >= 2 ? pl.sd : null,
    nPeriods: closed.length,
    irregular: !!cl && cl.n >= 2 && (cl.sd >= 4 || cl.max - cl.min >= 8),
    usingDefaults: !cl,
  };
}

/** Vorhersage der nächsten Periode als Zeitfenster. */
export function predictNext(stats, today = todayISO()) {
  const { ranges } = stats;
  if (!ranges.length) return null;
  const last = ranges[ranges.length - 1];
  const L = Math.max(MIN_CYCLE, Math.round(stats.avgCycle));
  const P = Math.max(1, Math.round(stats.avgPeriod));

  // Halbe Fensterbreite: je unsicherer, desto breiter.
  let half;
  if (stats.nCycles < 2) half = 4;
  else half = Math.min(7, Math.max(2, Math.round(stats.sdCycle) + 1));
  if (stats.nCycles >= 2 && stats.nCycles < 4) half = Math.max(half, 3);

  const nextStart = addDays(last.start, L);
  let windowStart = addDays(nextStart, -half);
  let windowEnd = addDays(nextStart, half);
  const ongoing = last.open;
  const overdueDays = !ongoing ? Math.max(0, diffDays(nextStart, today)) : 0;
  const late = !ongoing && today > windowEnd;

  // Ist das Fenster schon (teilweise) vorbei ohne neue Periode, rückt es nach.
  if (!ongoing && today > windowStart) windowStart = today;
  if (late) windowEnd = addDays(today, Math.max(3, half));

  // Wahrscheinlichster Start (für Kalender & Phasen): nicht in der Vergangenheit.
  const effNext = !ongoing && today > nextStart ? addDays(today, 1) : nextStart;
  const ovulation = addDays(nextStart, -LUTEAL_LENGTH);

  let confidence = 'mittel';
  if (stats.nCycles < 3 || stats.irregular) confidence = 'niedrig';
  else if (stats.nCycles >= 6 && stats.sdCycle != null && stats.sdCycle < 2.5) confidence = 'gut';

  return {
    lastStart: last.start,
    ongoing,
    cycleLength: L,
    periodLength: P,
    nextStart,
    effNext,
    windowStart,
    windowEnd,
    half,
    overdueDays,
    late,
    ovulation,
    fertileStart: addDays(ovulation, -5),
    fertileEnd: addDays(ovulation, 1),
    confidence,
    daysUntil: diffDays(today, effNext),
  };
}

function phaseForCycleDay(cycleDay, L, P) {
  const ov = Math.max(L - LUTEAL_LENGTH, P + 2);
  if (Math.abs(cycleDay - ov) <= 1) return 'ovulation';
  if (cycleDay < ov) return 'follicular';
  return 'luteal';
}

/**
 * Phase für ein beliebiges Datum.
 * Vergangene Zyklen: aus echten Daten. Aktueller/künftige Zyklen: geschätzt.
 */
export function phaseInfo(date, stats, pred, today = todayISO()) {
  const { ranges } = stats;
  if (!ranges.length || !pred) return null;
  let idx = -1;
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (ranges[i].start <= date) { idx = i; break; }
  }
  if (idx < 0) return null; // vor der ersten erfassten Periode

  const base = ranges[idx];
  const next = ranges[idx + 1];
  const P = pred.periodLength;
  const inActual = date >= base.start && date <= base.end;
  const res = { date, cycleDay: 0, cycleLength: 0, phase: null, actualPeriod: inActual, predictedPeriod: false, estimated: date > today };

  if (next) {
    const L = diffDays(base.start, next.start);
    res.cycleDay = diffDays(base.start, date) + 1;
    res.cycleLength = L;
    if (L > MAX_CYCLE) {
      // Lange Lücke: nur Periodentage sinnvoll zuordenbar
      res.phase = inActual ? 'menstruation' : null;
      return res;
    }
    res.phase = inActual ? 'menstruation' : phaseForCycleDay(res.cycleDay, L, base.length);
    return res;
  }

  // Aktueller Zyklus (seit letzter Periode) und künftige Zyklen
  const d = diffDays(base.start, date);
  const firstLen = Math.max(diffDays(base.start, pred.effNext), 1);
  let cycleDay; let L; let isFutureCycle = false;
  if (d < firstLen) {
    cycleDay = d + 1;
    L = Math.max(firstLen, pred.cycleLength);
  } else {
    const k = Math.floor((d - firstLen) / pred.cycleLength);
    if (k > 5) return null; // nicht weiter als ~6 Zyklen in die Zukunft
    const cycleStart = addDays(pred.effNext, k * pred.cycleLength);
    cycleDay = diffDays(cycleStart, date) + 1;
    L = pred.cycleLength;
    isFutureCycle = true;
  }
  res.cycleDay = cycleDay;
  res.cycleLength = L;

  if (inActual) {
    res.phase = 'menstruation';
  } else if (isFutureCycle && cycleDay <= P) {
    res.phase = 'menstruation';
    res.predictedPeriod = true;
  } else if (!isFutureCycle && base.open && date > today && cycleDay <= Math.max(P, base.length)) {
    // laufende Periode: die nächsten Tage voraussichtlich noch Periode
    res.phase = 'menstruation';
    res.predictedPeriod = true;
  } else {
    res.phase = phaseForCycleDay(cycleDay, L, P);
  }
  return res;
}

/* ---------- Pille ---------- */

export const PILL_TYPES = {
  '21_7': { label: '21 Tage + 7 Tage Pause', active: 21, pack: 28, placebo: false },
  '24_4': { label: '24 Tage + 4 Tage Pause', active: 24, pack: 28, placebo: false },
  '28_placebo': { label: '28 Tage (21 + 7 Placebo)', active: 21, pack: 28, placebo: true },
  continuous: { label: 'Durchgehend (ohne Pause)', active: 28, pack: 28, placebo: false },
};

/** Status der Pille an einem Tag – oder null, falls nicht konfiguriert. */
export function pillInfo(date, pill) {
  if (!pill?.enabled || !pill.packStart || date < pill.packStart) return null;
  const t = PILL_TYPES[pill.type] || PILL_TYPES['21_7'];
  const n = diffDays(pill.packStart, date);
  const dayInPack = (n % t.pack) + 1; // 1-basiert
  const inPause = dayInPack > t.active;
  const pauseStartIn = inPause ? 0 : t.active - dayInPack + 1;
  return {
    dayInPack,
    packNo: Math.floor(n / t.pack) + 1,
    inPause,
    placebo: inPause && t.placebo,
    // Bei Placebo-Pillen soll trotzdem täglich eine genommen werden.
    shouldTake: !inPause || t.placebo,
    nextPauseStart: t.active >= t.pack ? null : addDays(date, pauseStartIn),
    nextPackStart: addDays(date, t.pack - dayInPack + 1),
    type: t,
  };
}

/* ---------- Phasen-Tipps ---------- */

const TIPS = {
  menstruation: [
    'Gönn dir Pausen: Kürzere Lernblöcke (z. B. 25 Min.) fühlen sich jetzt oft leichter an.',
    'Gut für Wiederholen, Karteikarten und Zusammenfassungen statt ganz neuer, schwerer Themen.',
    'Wärme, Bewegung an der frischen Luft und genug trinken tun vielen jetzt gut.',
    'Plane, was in den nächsten Wochen ansteht – Planung klappt auch mit wenig Energie.',
  ],
  follicular: [
    'Die Energie steigt oft wieder – guter Zeitpunkt für neue, anspruchsvolle Themen.',
    'Viele fühlen sich jetzt motivierter: Ideal, um schwere Lernblöcke einzuplanen.',
    'Neugier ist oft höher – probier neue Lernmethoden oder starte ein neues Kapitel.',
    'Ein guter Moment, um Projekte anzufangen, die Konzentration brauchen.',
  ],
  ovulation: [
    'Energie und Kommunikationslust sind oft hoch – gut für Lerngruppen, Referate und Präsentationen.',
    'Nutze das Hoch für mündliche Prüfungsvorbereitung oder Erklär-Übungen.',
    'Viele fühlen sich jetzt sozial und fit – plane Austausch und Gruppenarbeit ein.',
  ],
  luteal: [
    'Gegen Ende sinkt die Energie oft – plane eher Routine-Aufgaben und Wiederholung.',
    'Struktur hilft: Klare To-do-Listen und feste Lernzeiten geben Halt.',
    'Sei nachsichtig mit dir, wenn die Konzentration schwankt – kurze Pausen helfen.',
    'Gut für Details: Korrekturlesen, Übungsaufgaben und Ordnung in Notizen.',
    'Ausreichend Schlaf und regelmäßige Mahlzeiten können Stimmungsschwankungen abfedern.',
  ],
};

export function tipFor(phase, date = todayISO()) {
  const list = TIPS[phase];
  if (!list) return null;
  const seed = Number(date.replaceAll('-', '')) % 997;
  return list[seed % list.length];
}

export const PILL_TIPS = [
  'Mit der Pille gibt es keinen natürlichen Zyklus mit Eisprung – Phasen-Vorhersagen gelten deshalb nicht.',
  'Achte darauf, wie es dir an verschiedenen Tagen geht – deine eigenen Muster sind das Wichtigste.',
  'Eine feste Uhrzeit für die Einnahme hilft, sie nicht zu vergessen.',
];
