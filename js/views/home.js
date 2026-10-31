// Startscreen: Ein-Tap-Button, Zyklusstatus, Vorhersage, Tipp, Schnell-Check-in.

import {
  state, getDay, patchDay, openPeriod, startPeriodToday, endPeriod, snapshotPeriods,
  restorePeriods, addPeriodRange, updateSettings, isPeriodDay,
} from '../store.js';
import { PHASES, tipFor, PILL_TIPS } from '../cycle.js';
import { dailyReminderDue, pillReminderDue } from '../reminders.js';
import { scaleHTML, flowHTML, toast } from '../ui.js';
import { openDayEntry } from './entry.js';
import { exportBackup } from '../backup.js';
import { esc, fmtLong, fmtShort, addDays, diffDays, nowTime } from '../util.js';

function ring({ value, total, label, sub, phase }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, total ? value / total : 0));
  return `
    <div class="ring phase-${phase || 'none'}" role="img" aria-label="${esc(label)} ${esc(sub)}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="${r}" class="ring-track"/>
        <circle cx="60" cy="60" r="${r}" class="ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 60 60)"/>
      </svg>
      <div class="ring-text"><span class="ring-big">${esc(label)}</span><span class="ring-sub">${esc(sub)}</span></div>
    </div>`;
}

function banners(ctx) {
  const out = [];
  const { today } = ctx;
  const due = dailyReminderDue(today, nowTime());
  if (due) {
    out.push(`
      <div class="banner banner-reminder">
        <span class="banner-icon" aria-hidden="true">🌙</span>
        <div class="banner-text">${due.kind === 'today' ? 'Zeit für deinen kurzen Tageseintrag.' : 'Gestern ist noch leer – magst du nachtragen?'}</div>
        <button type="button" class="btn btn-small btn-primary" data-open-day="${due.date}">Eintragen</button>
        <button type="button" class="icon-btn" data-act="dismiss-reminder" aria-label="Ausblenden">✕</button>
      </div>`);
  }
  const open = openPeriod();
  if (open && diffDays(open.start, today) >= 9) {
    out.push(`
      <div class="banner">
        <span class="banner-icon" aria-hidden="true">🩸</span>
        <div class="banner-text">Deine Periode läuft laut App seit ${diffDays(open.start, today) + 1} Tagen. Schon vorbei?</div>
        <button type="button" class="btn btn-small" data-act="end-yesterday">War gestern</button>
      </div>`);
  }
  const hasData = state.periods.length || state.days.size;
  const last = state.settings.lastBackup ? state.settings.lastBackup.slice(0, 10) : null;
  const stale = !last || diffDays(last, today) >= 14;
  if (hasData && stale && state.settings.backupHintDismissed !== today && (state.days.size + state.periods.length) >= 5) {
    out.push(`
      <div class="banner banner-soft">
        <span class="banner-icon" aria-hidden="true">💾</span>
        <div class="banner-text">${last ? `Letztes Backup vor ${diffDays(last, today)} Tagen.` : 'Noch kein Backup gemacht.'} Deine Daten liegen nur auf diesem Gerät.</div>
        <button type="button" class="btn btn-small" data-act="backup">Backup</button>
        <button type="button" class="icon-btn" data-act="dismiss-backup" aria-label="Ausblenden">✕</button>
      </div>`);
  }
  return out.join('');
}

function statusCard(ctx) {
  const { today, pred } = ctx;
  if (ctx.pillMode) {
    const pill = ctx.pillOf(today);
    if (!pill) {
      return `<div class="card status-card"><p>💊 Pillen-Modus aktiv.</p><p class="muted">Trag in den Einstellungen den Starttag deines Blisters ein, dann zeige ich dir Einnahme- und Pausentage.</p>
        <a class="btn btn-small" href="#/einstellungen">Zu den Einstellungen</a></div>`;
    }
    const t = pill.type;
    const sub = pill.inPause ? `Pause · noch ${t.pack - pill.dayInPack + 1} T.` : (pill.nextPauseStart ? `Pause ab ${fmtShort(pill.nextPauseStart)}` : 'ohne Pause');
    return `<div class="card status-card">
      ${ring({ value: pill.dayInPack, total: t.pack, label: `Tag ${pill.dayInPack}`, sub, phase: pill.inPause ? 'menstruation' : 'pill' })}
      <div class="status-info">
        <p class="status-phase">${pill.inPause ? 'Pillenpause' : 'Einnahmephase'}</p>
        <p class="muted small">Blutungen in der Pause sind Abbruchblutungen. Zyklusphasen-Vorhersagen gelten mit Pille nicht.</p>
      </div></div>`;
  }
  if (!pred) return '';
  const ph = ctx.phaseOf(today);
  if (!ph || !ph.phase) return '';
  const p = PHASES[ph.phase];
  return `<div class="card status-card">
    ${ring({ value: ph.cycleDay, total: ph.cycleLength, label: `Tag ${ph.cycleDay}`, sub: `von ~${ph.cycleLength}`, phase: ph.phase })}
    <div class="status-info">
      <p class="status-label muted small">Zyklustag ${ph.cycleDay}</p>
      <p class="status-phase"><span class="dot phase-${ph.phase}"></span>${p.label}</p>
      <p class="muted small">${ph.actualPeriod ? 'Periode eingetragen' : 'geschätzt'}</p>
    </div></div>`;
}

function predictionCard(ctx) {
  const { pred, stats, today } = ctx;
  if (ctx.pillMode || !pred) return '';
  if (pred.ongoing) {
    const len = diffDays(pred.lastStart, today) + 1;
    return `<div class="card">
      <p class="card-kicker">Aktuelle Periode</p>
      <p class="card-big">Tag ${len}</p>
      <p class="muted">Begonnen am ${fmtShort(pred.lastStart)} · deine Periode dauert meist ca. ${Math.round(stats.avgPeriod)} Tage.</p>
    </div>`;
  }
  let main;
  if (pred.late) {
    main = `<p class="card-big">Lässt auf sich warten</p>
      <p class="muted">Erwartet war sie ungefähr am ${fmtShort(pred.nextStart)} (${pred.overdueDays} ${pred.overdueDays === 1 ? 'Tag' : 'Tage'} her). Schwankungen sind normal – besonders bei unregelmäßigem Zyklus.</p>`;
  } else {
    main = `<p class="card-big">${fmtShort(pred.windowStart)} – ${fmtShort(pred.windowEnd)}</p>
      <p class="muted">Wahrscheinlich zwischen dem ${fmtShort(pred.windowStart)} und ${fmtShort(pred.windowEnd)}${pred.daysUntil > 0 ? ` · am ehesten in ca. ${pred.daysUntil} ${pred.daysUntil === 1 ? 'Tag' : 'Tagen'}` : ''}.</p>`;
  }
  const basis = stats.usingDefaults
    ? 'Basis: Standardwerte – wird mit jedem Zyklus genauer.'
    : `Basis: ${stats.nCycles} ${stats.nCycles === 1 ? 'Zyklus' : 'Zyklen'}, Ø ${Math.round(stats.avgCycle)} Tage · Genauigkeit: ${pred.confidence}`;
  return `<div class="card">
    <p class="card-kicker">Nächste Periode</p>
    ${main}
    <p class="small muted">${basis}</p>
    <p class="disclaimer">⚠️ Schätzung – keine Verhütungsmethode.</p>
  </div>`;
}

function tipCard(ctx) {
  if (ctx.pillMode) {
    const tip = PILL_TIPS[Number(ctx.today.slice(-2)) % PILL_TIPS.length];
    return `<div class="card tip-card"><p class="card-kicker">💡 Tipp</p><p>${esc(tip)}</p></div>`;
  }
  const ph = ctx.phaseOf(ctx.today);
  if (!ph?.phase) return '';
  return `<div class="card tip-card phase-soft-${ph.phase}">
    <p class="card-kicker">💡 Tipp für die ${PHASES[ph.phase].label}</p>
    <p>${esc(tipFor(ph.phase, ctx.today))}</p>
    <p class="small muted">Allgemeine Hinweise – jeder Körper ist anders.</p>
  </div>`;
}

function pillCard(ctx) {
  if (!ctx.pillMode) return '';
  const pill = ctx.pillOf(ctx.today);
  if (pill && !pill.shouldTake) return '';
  const taken = !!getDay(ctx.today).pillTaken;
  const due = pillReminderDue(ctx.today, nowTime());
  return `<button type="button" class="card pill-card${taken ? ' done' : ''}${due ? ' due' : ''}" data-act="pill-toggle" aria-pressed="${taken}">
    <span class="pill-check" aria-hidden="true">${taken ? '✓' : ''}</span>
    <span><strong>${taken ? 'Pille heute genommen' : 'Pille heute genommen?'}</strong>
    <span class="small muted block">${taken ? 'Tippen zum Rückgängigmachen' : due ? 'Erinnerung: Zeit für deine Pille' : `Erinnerung um ${esc(ctx.settings.pill.reminderTime)}`}</span></span>
  </button>`;
}

function onboarding() {
  return `<div class="card welcome">
    <h2>Willkommen bei Mondzeit 🌙</h2>
    <p>Deine Daten bleiben nur auf diesem Gerät. Fang einfach an:</p>
    <ul class="muted small">
      <li>Hast du heute deine Periode? Tipp auf den großen Button.</li>
      <li>Oder trag ein, wann deine letzte Periode begann – dann gibt's sofort eine erste Schätzung.</li>
    </ul>
    <form class="inline-form" data-form="last-period">
      <label class="label" for="lp-date">Letzte Periode begann am</label>
      <input type="date" id="lp-date" name="start" required>
      <button type="submit" class="btn btn-small btn-primary">Speichern</button>
    </form>
    <p class="small muted">Tipp: Ältere Perioden kannst du im Kalender nachtragen – je mehr, desto besser die Vorhersage.</p>
  </div>`;
}

export function renderHome(root, ctx) {
  const { today } = ctx;
  const open = openPeriod();
  const todayEntry = getDay(today);
  const inPeriodToday = isPeriodDay(today, today);

  root.innerHTML = `
    <header class="page-head">
      <p class="muted">${esc(fmtLong(today))}</p>
      <h1>Hallo 🌸</h1>
    </header>
    ${banners(ctx)}
    ${!state.periods.length ? onboarding() : statusCard(ctx)}

    <div class="main-action">
      ${open
        ? `<button type="button" class="big-btn big-btn-end" data-act="end">Periode vorbei</button>
           <p class="label center">Wie stark ist sie heute?</p>
           ${flowHTML(todayEntry.flow)}`
        : `<button type="button" class="big-btn" data-act="start">${inPeriodToday ? 'Periode läuft weiter' : 'Periode heute'}</button>`}
    </div>

    ${predictionCard(ctx)}
    ${pillCard(ctx)}
    ${tipCard(ctx)}

    <div class="card checkin">
      <p class="card-kicker">Wie geht's dir heute?</p>
      <p class="label">Stimmung</p>${scaleHTML('mood', todayEntry.mood)}
      <p class="label">Energie</p>${scaleHTML('energy', todayEntry.energy)}
      <p class="label">Fokus</p>${scaleHTML('focus', todayEntry.focus)}
      <button type="button" class="btn btn-block" data-open-day="${today}">Mehr eintragen · Symptome, Schlaf, Schmerzmittel …</button>
    </div>
  `;
}

export function bindHome(root, ctx) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    const today = ctx().today;
    const act = t.dataset.act;

    if (act === 'start') {
      const snap = snapshotPeriods();
      await startPeriodToday(today);
      if (!getDay(today).flow) await patchDay(today, { flow: 'medium' });
      navigator.vibrate?.(15);
      toast('Periode eingetragen 🌸', { action: 'Rückgängig', onAction: () => restorePeriods(snap) });
    } else if (act === 'end') {
      const snap = snapshotPeriods();
      await endPeriod(today);
      navigator.vibrate?.(15);
      toast('Periode beendet – letzter Tag: heute', {
        action: 'War gestern',
        duration: 6000,
        onAction: async () => { await restorePeriods(snap); await endPeriod(addDays(today, -1)); toast('Letzter Tag: gestern'); },
      });
    } else if (act === 'end-yesterday') {
      await endPeriod(addDays(today, -1));
      toast('Periode beendet (gestern)');
    } else if (t.dataset.flow) {
      const cur = getDay(today).flow;
      await patchDay(today, { flow: cur === t.dataset.flow ? null : t.dataset.flow });
    } else if (t.dataset.value) {
      const key = t.closest('[data-scale]').dataset.scale;
      const v = Number(t.dataset.value);
      const cur = getDay(today)[key];
      await patchDay(today, { [key]: cur === v ? null : v });
    } else if (t.dataset.openDay) {
      openDayEntry(t.dataset.openDay);
    } else if (act === 'pill-toggle') {
      const taken = !!getDay(today).pillTaken;
      await patchDay(today, { pillTaken: taken ? null : true });
      if (!taken) { navigator.vibrate?.(15); toast('Pille abgehakt 💊'); }
    } else if (act === 'dismiss-reminder') {
      await updateSettings({ reminderDismissed: today });
    } else if (act === 'dismiss-backup') {
      await updateSettings({ backupHintDismissed: today });
    } else if (act === 'backup') {
      const r = await exportBackup();
      if (r !== 'cancelled') toast('Backup erstellt 💾');
    }
  });

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.dataset.form === 'last-period') {
      const start = e.target.start.value;
      const today = ctx().today;
      if (!start || start > today) { toast('Bitte ein Datum bis heute wählen.'); return; }
      await addPeriodRange(start, null, today);
      toast('Gespeichert – erste Schätzung ist da ✨');
    }
  });
}
