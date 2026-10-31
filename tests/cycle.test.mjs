// Ausführen mit: node tests/cycle.test.mjs
import assert from 'node:assert/strict';
import { computeCycleStats, predictNext, phaseInfo, pillInfo, robustMean } from '../js/cycle.js';
import { addDays } from '../js/util.js';

const settings = { defaultCycleLength: 28, defaultPeriodLength: 5 };
const mk = (starts, len = 5) => starts.map((s, i) => ({ id: 'p' + i, start: s, end: addDays(s, len - 1) }));

// 1) Regelmäßig 28 Tage
{
  const starts = ['2026-05-01', '2026-05-29', '2026-06-26', '2026-07-24', '2026-08-21', '2026-09-18'];
  const st = computeCycleStats(mk(starts), settings, '2026-10-01');
  assert.equal(Math.round(st.avgCycle), 28);
  assert.equal(st.nCycles, 5);
  const p = predictNext(st, '2026-10-01');
  assert.equal(p.nextStart, '2026-10-16');
  assert.ok(p.windowStart <= '2026-10-14' && p.windowEnd >= '2026-10-18');
  const ph = phaseInfo('2026-10-01', st, p, '2026-10-01');
  assert.equal(ph.cycleDay, 14);
  assert.equal(ph.phase, 'ovulation');
  assert.equal(phaseInfo('2026-09-20', st, p, '2026-10-01').phase, 'menstruation');
  assert.equal(phaseInfo('2026-10-10', st, p, '2026-10-01').phase, 'luteal');
  assert.equal(phaseInfo('2026-10-17', st, p, '2026-10-01').predictedPeriod, true);
  console.log('✓ regelmäßiger Zyklus', p.windowStart, p.windowEnd);
}

// 2) Unregelmäßig mit Ausreißer (60 Tage) -> Ausreißer gedämpft
{
  const lengths = [30, 27, 33, 60, 29, 31];
  let s = '2026-01-01'; const starts = [s];
  for (const l of lengths) { s = addDays(s, l); starts.push(s); }
  const st = computeCycleStats(mk(starts), settings, addDays(s, 3));
  const plain = lengths.reduce((a, b) => a + b) / lengths.length;
  assert.ok(st.avgCycle < plain - 3, `robust ${st.avgCycle} vs plain ${plain}`);
  assert.ok(st.avgCycle > 29 && st.avgCycle < 34);
  assert.equal(st.outliers, 1);
  const p = predictNext(st, addDays(s, 3));
  assert.ok(p.half >= 3, 'breiteres Fenster bei Unregelmäßigkeit');
  console.log('✓ unregelmäßig: Ø', st.avgCycle.toFixed(1), 'Fenster ±', p.half, 'irregular', st.irregular);
}

// 3) Lücke > 90 Tage wird ausgeschlossen
{
  const st = computeCycleStats(mk(['2026-01-01', '2026-01-29', '2026-06-01', '2026-06-29']), settings, '2026-07-05');
  assert.equal(st.cycles.filter((c) => c.excluded).length, 1);
  assert.equal(Math.round(st.avgCycle), 28);
  console.log('✓ Lücke ausgeschlossen');
}

// 4) Nur eine Periode -> Standardwerte, kein Absturz
{
  const st = computeCycleStats(mk(['2026-10-20']), settings, '2026-10-31');
  const p = predictNext(st, '2026-10-31');
  assert.equal(p.nextStart, '2026-11-17');
  assert.equal(p.half, 4);
  assert.equal(phaseInfo('2026-10-31', st, p, '2026-10-31').cycleDay, 12);
  console.log('✓ eine Periode');
}

// 5) Überfällig
{
  const st = computeCycleStats(mk(['2026-08-01', '2026-08-29']), settings, '2026-10-05');
  const p = predictNext(st, '2026-10-05');
  assert.ok(p.late);
  assert.ok(p.overdueDays > 0);
  assert.ok(p.windowStart >= '2026-10-05');
  assert.ok(p.effNext > '2026-10-05');
  console.log('✓ überfällig', p.overdueDays, 'Tage');
}

// 6) Laufende Periode (offen)
{
  const periods = [...mk(['2026-09-01', '2026-09-29']), { id: 'x', start: '2026-10-28', end: null }];
  const st = computeCycleStats(periods, settings, '2026-10-31');
  const p = predictNext(st, '2026-10-31');
  assert.equal(p.ongoing, true);
  assert.equal(st.ranges.at(-1).length, 4);
  assert.equal(phaseInfo('2026-11-01', st, p, '2026-10-31').predictedPeriod, true);
  console.log('✓ laufende Periode');
}

// 7) Pille 21+7
{
  const pill = { enabled: true, type: '21_7', packStart: '2026-10-01' };
  assert.equal(pillInfo('2026-10-21', pill).inPause, false);
  assert.equal(pillInfo('2026-10-22', pill).inPause, true);
  assert.equal(pillInfo('2026-10-29', pill).inPause, false);
  assert.equal(pillInfo('2026-10-29', pill).dayInPack, 1);
  assert.equal(pillInfo('2026-09-30', pill), null);
  assert.equal(pillInfo('2026-10-22', { ...pill, type: '28_placebo' }).shouldTake, true);
  console.log('✓ Pille');
}

assert.equal(robustMean([]), null);
console.log('\nAlle Tests bestanden.');
