// Schlanke SVG-Diagramme ohne Bibliothek. Farben kommen aus CSS-Variablen,
// damit Hell- und Dunkelmodus automatisch passen.

import { esc, fmtNum, fmtShort } from './util.js';
import { PHASES } from './cycle.js';

const W = 340;

/** Balken: Zykluslängen der letzten Zyklen mit Durchschnittslinie. */
export function cycleBarChart(cycles, avg) {
  const data = cycles.slice(-10);
  if (!data.length) return '';
  const H = 180; const padL = 28; const padR = 8; const padT = 16; const padB = 30;
  const maxV = Math.max(...data.map((c) => c.length), avg || 0, 30) + 3;
  const minV = 0;
  const y = (v) => padT + (H - padT - padB) * (1 - (v - minV) / (maxV - minV));
  const slot = (W - padL - padR) / data.length;
  const bw = Math.min(26, slot - 6);
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].filter((t) => t <= maxV);

  const bars = data.map((c, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const top = y(c.length);
    const h = y(0) - top;
    const r = Math.min(4, bw / 2, h);
    // Oben abgerundet, unten gerade auf der Grundlinie
    const path = `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`;
    const label = `${fmtShort(c.start)}: ${c.length} Tage${c.excluded ? ' (nicht im Durchschnitt)' : ''}`;
    return `<g class="bar-g" data-tip="${esc(label)}" tabindex="0" role="img" aria-label="${esc(label)}">
      <rect x="${padL + slot * i}" y="${padT}" width="${slot}" height="${H - padT - padB}" class="hit"/>
      <path d="${path}" class="bar${c.excluded ? ' bar-excluded' : ''}"/>
      <text x="${x + bw / 2}" y="${H - padB + 14}" class="axis-label" text-anchor="middle">${esc(fmtShort(c.start).replace('.', ''))}</text>
    </g>`;
  }).join('');

  return `<div class="chart" data-chart>
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="group" aria-label="Zykluslängen der letzten Zyklen">
      ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid${t === 0 ? ' baseline' : ''}"/>
        <text x="${padL - 6}" y="${y(t) + 3}" class="axis-label" text-anchor="end">${t}</text>`).join('')}
      ${bars}
      ${avg ? `<line x1="${padL}" x2="${W - padR}" y1="${y(avg)}" y2="${y(avg)}" class="ref-line"/>
        <text x="${W - padR}" y="${y(avg) - 4}" class="ref-label" text-anchor="end">Ø ${fmtNum(avg)}</text>` : ''}
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

/**
 * Linie: Durchschnitt einer 1–5-Skala pro Zyklustag, mit Phasen-Bändern im Hintergrund.
 * `bands`: [{phase, from, to}] in Zyklustagen.
 */
export function cycleLineChart(byDay, bands, metricLabel) {
  const lastDay = Math.max(28, ...byDay.filter((d) => d.avg != null).map((d) => d.day));
  const days = byDay.slice(0, lastDay);
  const H = 200; const padL = 24; const padR = 10; const padT = 22; const padB = 26;
  const x = (d) => padL + (W - padL - padR) * ((d - 1) / Math.max(1, lastDay - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - (v - 1) / 4);

  const bandSvg = bands.filter((b) => b.from <= lastDay).map((b) => {
    const x1 = x(Math.max(1, b.from)) - (b.from > 1 ? (x(2) - x(1)) / 2 : 0);
    const x2 = Math.min(x(Math.min(lastDay, b.to)) + (x(2) - x(1)) / 2, W - padR);
    return `<rect x="${x1}" y="${padT}" width="${Math.max(0, x2 - x1)}" height="${H - padT - padB}" class="band band-${b.phase}"/>
      <text x="${(x1 + x2) / 2}" y="${padT - 7}" class="band-label" text-anchor="middle">${esc(PHASES[b.phase].short)}</text>`;
  }).join('');

  // Linie mit Lücken, wo keine Daten sind
  const segs = [];
  let cur = [];
  days.forEach((d) => {
    if (d.avg == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(d);
  });
  if (cur.length) segs.push(cur);
  const lines = segs.map((s) => (s.length > 1
    ? `<path d="${s.map((d, i) => `${i ? 'L' : 'M'}${x(d.day).toFixed(1)},${y(d.avg).toFixed(1)}`).join(' ')}" class="line"/>`
    : '')).join('');
  const points = days.filter((d) => d.avg != null)
    .map((d) => `<circle cx="${x(d.day)}" cy="${y(d.avg)}" r="4" class="pt"/>`).join('');
  const hits = days.map((d) => {
    const tip = d.avg != null ? `Tag ${d.day}: Ø ${fmtNum(d.avg)} (${d.n} ${d.n === 1 ? 'Eintrag' : 'Einträge'})` : `Tag ${d.day}: keine Daten`;
    const w = (W - padL - padR) / Math.max(1, lastDay - 1);
    return `<rect x="${x(d.day) - w / 2}" y="${padT}" width="${w}" height="${H - padT - padB}" class="hit" data-tip="${esc(tip)}" data-x="${x(d.day)}"/>`;
  }).join('');
  const xTicks = [1, 7, 14, 21, 28, 35].filter((t) => t <= lastDay);

  return `<div class="chart" data-chart>
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(metricLabel)} im Verlauf des Zyklus (Durchschnitt pro Zyklustag, Skala 1 bis 5)">
      ${bandSvg}
      ${[1, 2, 3, 4, 5].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid${v === 1 ? ' baseline' : ''}"/>
        <text x="${padL - 6}" y="${y(v) + 3}" class="axis-label" text-anchor="end">${v}</text>`).join('')}
      ${xTicks.map((t) => `<text x="${x(t)}" y="${H - 8}" class="axis-label" text-anchor="middle">${t}</text>`).join('')}
      <line class="crosshair" y1="${padT}" y2="${H - padB}" x1="0" x2="0" visibility="hidden"/>
      ${lines}${points}${hits}
    </svg>
    <div class="chart-tip" hidden></div>
    <p class="axis-caption">Zyklustag →</p>
  </div>`;
}

/** Horizontale Balken: Durchschnitt pro Phase. */
export function phaseBars(byPhase, order) {
  return `<ul class="phase-bars">${order.map((p) => {
    const v = byPhase[p];
    const pct = v.avg != null ? ((v.avg - 1) / 4) * 100 : 0;
    return `<li>
      <span class="pb-label">${esc(PHASES[p].label)}</span>
      <span class="pb-track"><span class="pb-fill band-${p}-solid" style="width:${Math.max(v.avg != null ? 4 : 0, pct)}%"></span></span>
      <span class="pb-val">${v.avg != null ? fmtNum(v.avg) : '–'}</span>
    </li>`;
  }).join('')}</ul>`;
}

/** Tooltip-Verhalten für alle Diagramme in `root` (Maus + Touch + Tastatur). */
export function bindChartTips(root) {
  root.addEventListener('pointermove', onPoint);
  root.addEventListener('pointerdown', onPoint);
  root.addEventListener('focusin', (e) => {
    const g = e.target.closest('[data-tip]');
    if (g) show(g, null);
  });
  root.addEventListener('pointerleave', hideAll, true);
  root.addEventListener('focusout', hideAll);

  function onPoint(e) {
    const el = e.target.closest?.('[data-tip]');
    if (!el || !el.closest('[data-chart]')) return;
    show(el, e);
  }
  function show(el, e) {
    const chart = el.closest('[data-chart]');
    const tip = chart.querySelector('.chart-tip');
    const svg = chart.querySelector('svg');
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const box = chart.getBoundingClientRect();
    const sbox = svg.getBoundingClientRect();
    const scale = sbox.width / W;
    let px;
    if (el.dataset.x) px = Number(el.dataset.x) * scale + (sbox.left - box.left);
    else if (e) px = e.clientX - box.left;
    else { const r = el.getBoundingClientRect(); px = r.left + r.width / 2 - box.left; }
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(box.width - tw, px - tw / 2))}px`;
    const ch = chart.querySelector('.crosshair');
    if (ch && el.dataset.x) {
      ch.setAttribute('x1', el.dataset.x); ch.setAttribute('x2', el.dataset.x);
      ch.setAttribute('visibility', 'visible');
    }
    chart.querySelectorAll('.bar-g.hover').forEach((g) => g.classList.remove('hover'));
    el.closest('.bar-g')?.classList.add('hover');
  }
  function hideAll(e) {
    const chart = e.target.closest?.('[data-chart]');
    if (!chart || (e.type === 'pointerleave' && e.target !== chart)) return;
    chart.querySelector('.chart-tip').hidden = true;
    chart.querySelector('.crosshair')?.setAttribute('visibility', 'hidden');
    chart.querySelectorAll('.bar-g.hover').forEach((g) => g.classList.remove('hover'));
  }
}
