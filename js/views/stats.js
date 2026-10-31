// Statistiken: Zyklus- und Periodenlänge, Symptome pro Phase, Verlauf der Skalen.

import { PHASES, PHASE_ORDER } from '../cycle.js';
import { symptomsByPhase, symptomsOverall, metricOverCycle, METRICS } from '../context.js';
import { cycleBarChart, cycleLineChart, phaseBars, bindChartTips } from '../charts.js';
import { esc, fmtNum, fmtShort } from '../util.js';

let metric = 'mood';

function tile(label, value, sub = '') {
  return `<div class="tile"><span class="tile-label">${esc(label)}</span><span class="tile-value">${value}</span>${sub ? `<span class="tile-sub">${sub}</span>` : ''}</div>`;
}

function phaseBands(avgCycle, avgPeriod) {
  const L = Math.round(avgCycle);
  const P = Math.round(avgPeriod);
  const ov = Math.max(L - 14, P + 2);
  return [
    { phase: 'menstruation', from: 1, to: P },
    { phase: 'follicular', from: P + 1, to: ov - 2 },
    { phase: 'ovulation', from: ov - 1, to: ov + 1 },
    { phase: 'luteal', from: ov + 2, to: Math.max(L, 40) },
  ].filter((b) => b.to >= b.from);
}

export function renderStats(root, ctx) {
  const { stats } = ctx;
  const valid = stats.validCycles;

  const tiles = `
    <div class="tiles">
      ${tile('Ø Zykluslänge', stats.nCycles ? `${fmtNum(stats.avgCycle)} <small>Tage</small>` : '–', stats.nCycles ? `aus ${stats.nCycles} ${stats.nCycles === 1 ? 'Zyklus' : 'Zyklen'}` : 'noch keine vollständigen Zyklen')}
      ${tile('Schwankung', stats.sdCycle != null ? `± ${fmtNum(stats.sdCycle)} <small>Tage</small>` : '–', stats.minCycle != null ? `Spanne ${stats.minCycle}–${stats.maxCycle} Tage` : '')}
      ${tile('Ø Periodenlänge', stats.nPeriods ? `${fmtNum(stats.avgPeriod)} <small>Tage</small>` : '–', stats.nPeriods ? `aus ${stats.nPeriods} ${stats.nPeriods === 1 ? 'Periode' : 'Perioden'}` : '')}
      ${tile('Erfasste Perioden', `${stats.ranges.length}`, stats.ranges.length ? `seit ${fmtShort(stats.ranges[0].start)}` : '')}
    </div>`;

  const notes = [];
  if (stats.irregular) notes.push('Dein Zyklus schwankt etwas stärker. Die Vorhersage nutzt deshalb ein breiteres Zeitfenster.');
  if (stats.outliers) notes.push(`${stats.outliers} ${stats.outliers === 1 ? 'Zyklus weicht' : 'Zyklen weichen'} stark ab und ${stats.outliers === 1 ? 'zählt' : 'zählen'} im Durchschnitt weniger.`);
  const excluded = stats.cycles.filter((c) => c.excluded).length;
  if (excluded) notes.push(`${excluded} ${excluded === 1 ? 'Zeitraum ist' : 'Zeiträume sind'} unter 15 oder über 90 Tage lang (evtl. Eintrag vergessen) und ${excluded === 1 ? 'wird' : 'werden'} nicht mitgerechnet.`);
  if (ctx.pillMode) notes.push('Pillen-Modus: Die Zahlen beziehen sich auf eingetragene Blutungen (meist Abbruchblutungen), nicht auf einen natürlichen Zyklus.');

  // Symptome
  let symptomHtml;
  if (ctx.pillMode) {
    const top = symptomsOverall();
    symptomHtml = top.length
      ? `<ul class="rank-list">${top.map((s) => `<li><span>${esc(s.label)}</span><span class="muted">${s.count}×</span></li>`).join('')}</ul>`
      : '<p class="muted">Noch keine Symptome eingetragen.</p>';
  } else {
    const byPhase = symptomsByPhase(ctx);
    const any = PHASE_ORDER.some((p) => byPhase[p].top.length);
    symptomHtml = any ? `<div class="sym-phases">${PHASE_ORDER.map((p) => `
      <div class="sym-phase">
        <p class="sym-phase-title"><span class="dot phase-${p}"></span>${PHASES[p].label} <span class="muted small">(${byPhase[p].days} ${byPhase[p].days === 1 ? 'Tag' : 'Tage'})</span></p>
        ${byPhase[p].top.length
          ? `<ul class="rank-list">${byPhase[p].top.map((s) => `<li><span>${esc(s.label)}</span><span class="muted">${s.pct} % der Tage</span></li>`).join('')}</ul>`
          : '<p class="small muted">Keine Symptome erfasst.</p>'}
      </div>`).join('')}</div>` : '<p class="muted">Sobald du Symptome einträgst, siehst du hier, welche in welcher Phase am häufigsten vorkommen.</p>';
  }

  // Verlauf
  let trendHtml = '';
  if (!ctx.pillMode) {
    const m = metricOverCycle(ctx, metric);
    const seg = `<div class="segmented" role="tablist" aria-label="Wert auswählen">
      ${Object.entries(METRICS).map(([k, v]) => `<button type="button" role="tab" aria-selected="${k === metric}" class="seg-btn${k === metric ? ' active' : ''}" data-metric="${k}">${v.label}</button>`).join('')}
    </div>`;
    const rows = m.byDay.filter((d) => d.avg != null);
    trendHtml = `
      <section class="card">
        <h2 class="card-title">Verlauf über den Zyklus</h2>
        ${seg}
        ${m.total >= 3 ? `
          ${cycleLineChart(m.byDay, phaseBands(stats.avgCycle, stats.avgPeriod), METRICS[metric].label)}
          <p class="label">Durchschnitt pro Phase (1 = niedrig, 5 = hoch)</p>
          ${phaseBars(m.byPhase, PHASE_ORDER)}
          <details class="table-details"><summary>Als Tabelle anzeigen</summary>
            <table class="data-table"><thead><tr><th>Zyklustag</th><th>Ø ${esc(METRICS[metric].label)}</th><th>Einträge</th></tr></thead>
            <tbody>${rows.map((d) => `<tr><td>${d.day}</td><td>${fmtNum(d.avg)}</td><td>${d.n}</td></tr>`).join('')}</tbody></table>
          </details>
          <p class="small muted">Phasen sind geschätzt. Je mehr Tage du einträgst, desto aussagekräftiger wird der Verlauf.</p>`
        : `<p class="muted">Noch zu wenige Einträge für „${esc(METRICS[metric].label)}". Trag ein paar Tage ein – dann erscheint hier dein Verlauf.</p>`}
      </section>`;
  }

  root.innerHTML = `
    <header class="page-head"><h1>Statistik</h1></header>
    <section class="card">
      <h2 class="card-title">Dein Zyklus</h2>
      ${tiles}
      ${notes.map((n) => `<p class="small muted note">ℹ️ ${esc(n)}</p>`).join('')}
    </section>
    <section class="card">
      <h2 class="card-title">Zykluslängen</h2>
      ${stats.cycles.length
        ? `${cycleBarChart(stats.cycles, valid.length ? stats.avgCycle : null)}
           <p class="small muted">Jeder Balken ist ein Zyklus (Beginn der Periode bis zur nächsten). Tippe auf einen Balken für Details.</p>`
        : '<p class="muted">Sobald zwei Perioden eingetragen sind, siehst du hier deine Zykluslängen.</p>'}
    </section>
    <section class="card">
      <h2 class="card-title">${ctx.pillMode ? 'Häufigste Symptome' : 'Häufigste Symptome pro Phase'}</h2>
      ${symptomHtml}
    </section>
    ${trendHtml}
  `;
}

export function bindStats(root, ctx, rerender) {
  bindChartTips(root);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-metric]');
    if (t) { metric = t.dataset.metric; rerender(); }
  });
}
