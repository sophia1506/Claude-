// Monatskalender mit Periode, Vorhersage, Phasen und Pillenpause.

import { isPeriodDay, hasLog, getDay } from '../store.js';
import { PHASES, PHASE_ORDER } from '../cycle.js';
import { openDayEntry } from './entry.js';
import { esc, toISO, weekdayMon0, monthName, WEEKDAYS_SHORT, fmtLong } from '../util.js';

let viewYear = null;
let viewMonth = null;

function cellInfo(date, ctx) {
  const { today, pred } = ctx;
  const cls = ['cal-day'];
  const desc = [];
  const actual = isPeriodDay(date, today);
  const ph = ctx.phaseOf(date);
  const pill = ctx.pillMode ? ctx.pillOf(date) : null;

  if (actual) {
    cls.push('is-period');
    desc.push(pill?.inPause ? 'Abbruchblutung' : 'Periode');
  } else if (ph?.predictedPeriod) {
    cls.push('is-predicted');
    desc.push('vorhergesagte Periode');
  } else if (ph?.phase) {
    cls.push(`ph-${ph.phase}`);
    desc.push(`${PHASES[ph.phase].label}${ph.estimated ? ' (geschätzt)' : ''}`);
  }
  if (pred && !pred.ongoing && date >= pred.windowStart && date <= pred.windowEnd && !actual) {
    cls.push('in-window');
    desc.push('im Vorhersage-Zeitfenster');
  }
  if (pill?.inPause) { cls.push('pill-pause'); desc.push('Pillenpause'); }
  if (date === today) { cls.push('is-today'); desc.push('heute'); }
  if (date > today) cls.push('is-future');
  const logged = hasLog(date);
  if (logged) desc.push('Eintrag vorhanden');
  return { cls, desc, logged, actual };
}

export function renderCalendar(root, ctx) {
  const { today } = ctx;
  if (viewYear === null) {
    viewYear = Number(today.slice(0, 4));
    viewMonth = Number(today.slice(5, 7)) - 1;
  }
  const first = toISO(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const lead = weekdayMon0(first);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-day empty" aria-hidden="true"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = toISO(viewYear, viewMonth, d);
    const { cls, desc, logged, actual } = cellInfo(date, ctx);
    const flow = actual ? getDay(date).flow : null;
    cells.push(`
      <button type="button" class="${cls.join(' ')}" data-date="${date}" aria-label="${esc(fmtLong(date))}${desc.length ? ': ' + esc(desc.join(', ')) : ''}">
        <span class="cal-num">${d}</span>
        ${flow ? `<span class="cal-flow flow-${flow}" aria-hidden="true"></span>` : ''}
        ${logged && !flow ? '<span class="cal-dot" aria-hidden="true"></span>' : ''}
      </button>`);
  }

  const isCurrentMonth = today.startsWith(first.slice(0, 7));
  const pred = ctx.pred;

  root.innerHTML = `
    <header class="page-head"><h1>Kalender</h1></header>
    <div class="card cal-card">
      <div class="cal-nav">
        <button type="button" class="icon-btn" data-nav="-1" aria-label="Vorheriger Monat">‹</button>
        <h2 class="cal-title" aria-live="polite">${monthName(viewMonth)} ${viewYear}</h2>
        <button type="button" class="icon-btn" data-nav="1" aria-label="Nächster Monat">›</button>
      </div>
      <div class="cal-grid cal-head" aria-hidden="true">${WEEKDAYS_SHORT.map((w) => `<div>${w}</div>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      ${!isCurrentMonth ? '<button type="button" class="btn btn-small btn-ghost cal-today" data-nav="today">Zu heute</button>' : ''}
    </div>

    <div class="card legend">
      <p class="card-kicker">Legende</p>
      <ul class="legend-list">
        <li><span class="sw sw-period"></span>Periode${ctx.pillMode ? ' / Abbruchblutung' : ''}</li>
        ${ctx.pillMode ? '<li><span class="sw sw-pill"></span>Pillenpause</li>' : `
        <li><span class="sw sw-predicted"></span>Vorhergesagte Periode</li>
        <li><span class="sw sw-window"></span>Mögliches Zeitfenster</li>
        ${PHASE_ORDER.slice(1).map((p) => `<li><span class="sw ph-${p}"></span>${PHASES[p].label}</li>`).join('')}`}
        <li><span class="sw sw-dot"><span class="cal-dot"></span></span>Eintrag vorhanden</li>
      </ul>
      <p class="small muted">Tipp auf einen Tag, um ihn anzusehen oder zu bearbeiten – auch, um ältere Perioden nachzutragen.</p>
      ${!ctx.pillMode && pred ? '<p class="disclaimer">⚠️ Phasen und Vorhersagen sind Schätzungen – keine Verhütungsmethode.</p>' : ''}
      ${ctx.pillMode ? '<p class="small muted">Mit Pille werden keine Zyklusphasen angezeigt, weil kein natürlicher Eisprung stattfindet.</p>' : ''}
    </div>`;
}

export function bindCalendar(root, ctx, rerender) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.nav) {
      if (t.dataset.nav === 'today') {
        const today = ctx().today;
        viewYear = Number(today.slice(0, 4));
        viewMonth = Number(today.slice(5, 7)) - 1;
      } else {
        viewMonth += Number(t.dataset.nav);
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      }
      rerender();
    } else if (t.dataset.date) {
      openDayEntry(t.dataset.date);
    }
  });

  // Wischen links/rechts zum Monatswechsel
  let sx = null; let sy = null;
  root.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.cal-card')) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      root.querySelector(`[data-nav="${dx < 0 ? 1 : -1}"]`)?.click();
    }
  }, { passive: true });
}
