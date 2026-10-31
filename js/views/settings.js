// Einstellungen: Darstellung, Zyklus, Pille, Erinnerungen, Symptome, Daten.

import { state, updateSettings, removeCustomSymptom, replaceEverything, DEFAULT_SETTINGS } from '../store.js';
import { PILL_TYPES } from '../cycle.js';
import { exportBackup, importBackup, APP_VERSION } from '../backup.js';
import { dailyReminderICS, pillReminderICS, downloadICS, isIOS, isStandalone } from '../reminders.js';
import { toast, confirmDialog } from '../ui.js';
import { esc, fmtNumeric, todayISO } from '../util.js';

let persisted = null;
navigator.storage?.persisted?.().then((p) => { persisted = p; }).catch(() => {});

export function renderSettings(root) {
  const s = state.settings;
  const ios = isIOS();
  const lastBackup = s.lastBackup ? fmtNumeric(s.lastBackup.slice(0, 10)) : 'noch nie';

  root.innerHTML = `
    <header class="page-head"><h1>Einstellungen</h1></header>

    <section class="card">
      <h2 class="card-title">Darstellung</h2>
      <div class="segmented" role="radiogroup" aria-label="Farbmodus">
        ${[['light', '☀️ Hell'], ['dark', '🌙 Dunkel'], ['auto', 'Automatisch']].map(([k, l]) => `
          <button type="button" role="radio" aria-checked="${s.theme === k}" class="seg-btn${s.theme === k ? ' active' : ''}" data-theme="${k}">${l}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2 class="card-title">Zyklus</h2>
      <p class="small muted">Diese Werte nutzt die App, solange noch nicht genug eigene Daten da sind.</p>
      <label class="field-row"><span>Übliche Zykluslänge</span>
        <span class="field-unit"><input type="number" inputmode="numeric" min="15" max="60" value="${s.defaultCycleLength}" data-setting="defaultCycleLength"> Tage</span></label>
      <label class="field-row"><span>Übliche Periodenlänge</span>
        <span class="field-unit"><input type="number" inputmode="numeric" min="1" max="14" value="${s.defaultPeriodLength}" data-setting="defaultPeriodLength"> Tage</span></label>
    </section>

    <section class="card">
      <h2 class="card-title">Pille / Verhütung</h2>
      <label class="switch-row"><span>Ich nehme die Pille</span>
        <input type="checkbox" class="switch" data-setting="pill.enabled" ${s.pill.enabled ? 'checked' : ''}></label>
      ${s.pill.enabled ? `
        <div class="info-box">
          <p><strong>Gut zu wissen:</strong> Eine Blutung in der Pillenpause ist eine <strong>Abbruchblutung</strong> (Entzugsblutung), keine natürliche Periode.
          Da die Pille den Eisprung unterdrückt, zeigt die App <strong>keine Zyklusphasen und keine Eisprung-Vorhersage</strong> an – sie würden nicht stimmen.</p>
        </div>
        <label class="field-row"><span>Pillenart</span>
          <select data-setting="pill.type">${Object.entries(PILL_TYPES).map(([k, t]) => `<option value="${k}" ${s.pill.type === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
        <label class="field-row"><span>Erste Pille des aktuellen Blisters</span>
          <input type="date" value="${s.pill.packStart || ''}" max="${todayISO()}" data-setting="pill.packStart"></label>
        <p class="small muted">Daraus berechnet die App Einnahme- und Pausentage. Bei einem neuen Blister nach Plan musst du nichts ändern.</p>
        <label class="switch-row"><span>Pillen-Erinnerung</span>
          <input type="checkbox" class="switch" data-setting="pill.reminderEnabled" ${s.pill.reminderEnabled ? 'checked' : ''}></label>
        ${s.pill.reminderEnabled ? `<label class="field-row"><span>Uhrzeit</span><input type="time" value="${s.pill.reminderTime}" data-setting="pill.reminderTime"></label>` : ''}
      ` : '<p class="small muted">Wenn aktiviert: tägliches Abhaken der Einnahme, Pillenpausen im Kalender und eine Pillen-Erinnerung.</p>'}
    </section>

    <section class="card">
      <h2 class="card-title">Erinnerungen</h2>
      <label class="switch-row"><span>Tägliche Erinnerung zum Eintragen</span>
        <input type="checkbox" class="switch" data-setting="reminder.enabled" ${s.reminder.enabled ? 'checked' : ''}></label>
      ${s.reminder.enabled ? `<label class="field-row"><span>Uhrzeit</span><input type="time" value="${s.reminder.time}" data-setting="reminder.time"></label>` : ''}

      <div class="info-box">
        <p><strong>Ehrlich gesagt:</strong> Eine App ohne Server kann dir keine Benachrichtigung schicken, wenn sie geschlossen ist –
        auch auf dem iPhone nicht (echte Push-Nachrichten brauchen immer einen Server, und deine Daten sollen ja nur bei dir bleiben).</p>
        <p>Deshalb gibt's zwei Wege, die zuverlässig funktionieren:</p>
        <ol>
          <li><strong>Beim Öffnen</strong> zeigt dir Mondzeit ab der eingestellten Uhrzeit einen Hinweis, falls heute noch nichts eingetragen ist.</li>
          <li><strong>Dein Handy erinnert dich</strong> – über einen wiederkehrenden Kalendertermin mit Alarm (ein Tap unten) oder die Erinnerungen-/Wecker-App.</li>
        </ol>
      </div>

      ${s.reminder.enabled ? `<button type="button" class="btn btn-block" data-act="ics-daily">📅 Tägliche Erinnerung (${esc(s.reminder.time)}) zum Kalender hinzufügen</button>` : ''}
      ${s.pill.enabled && s.pill.reminderEnabled ? `<button type="button" class="btn btn-block" data-act="ics-pill">💊 Pillen-Erinnerung (${esc(s.pill.reminderTime)}) zum Kalender hinzufügen</button>` : ''}
      ${ios && isStandalone() ? '<p class="small muted">Falls sich der Kalender aus der App heraus nicht öffnet: Mondzeit einmal in Safari öffnen und dort auf den Button tippen.</p>' : ''}

      <details class="guide" ${ios ? 'open' : ''}>
        <summary>Anleitung iPhone</summary>
        <ul>
          <li><strong>Kalender:</strong> Button oben antippen → „Alle hinzufügen". Die Erinnerung kommt dann täglich mit Ton.</li>
          <li><strong>Erinnerungen-App:</strong> Neue Erinnerung „Mondzeit eintragen" → Datum &amp; Uhrzeit → Wiederholen: Täglich.</li>
          <li><strong>Kurzbefehle (am elegantesten):</strong> Kurzbefehle-App → Automation → „Tageszeit" (z. B. ${esc(s.reminder.time)}, täglich) → Aktion „URL öffnen" oder „App öffnen" → Mondzeit. „Sofort ausführen" wählen.</li>
          <li><strong>Wecker:</strong> Uhr-App → Wecker mit Bezeichnung „Mondzeit 🌙", täglich.</li>
        </ul>
      </details>
      <details class="guide" ${!ios ? 'open' : ''}>
        <summary>Anleitung Android</summary>
        <ul>
          <li><strong>Kalender:</strong> Button oben antippen und die Datei mit Google Kalender (oder deiner Kalender-App) öffnen.</li>
          <li><strong>Google Assistant / Uhr-App:</strong> „Erinnere mich jeden Tag um ${esc(s.reminder.time)} an Mondzeit" oder einen täglichen Wecker stellen.</li>
        </ul>
      </details>
    </section>

    <section class="card">
      <h2 class="card-title">Eigene Symptome</h2>
      ${state.customSymptoms.length
        ? `<ul class="rank-list">${state.customSymptoms.map((c) => `<li><span>${esc(c.label)}</span>
            <button type="button" class="icon-btn" data-del-sym="${esc(c.id)}" aria-label="${esc(c.label)} löschen">✕</button></li>`).join('')}</ul>
           <p class="small muted">Gelöschte Symptome bleiben in alten Einträgen gespeichert.</p>`
        : '<p class="small muted">Eigene Symptome legst du direkt im Tageseintrag mit „＋ Eigenes" an.</p>'}
    </section>

    <section class="card">
      <h2 class="card-title">Daten &amp; Backup</h2>
      <p>Alle Daten liegen <strong>nur auf diesem Gerät</strong>. Wenn du die App löschst, den Browser-Speicher leerst oder das Handy verlierst, sind sie weg.
      Mach deshalb regelmäßig (z. B. alle 2 Wochen) ein Backup und speichere es z. B. in „Dateien".</p>
      <p class="small muted">Letztes Backup: <strong>${esc(lastBackup)}</strong>${persisted === true ? ' · Speicher ist als dauerhaft markiert ✓' : ''}</p>
      <button type="button" class="btn btn-primary btn-block" data-act="export">💾 Backup exportieren (JSON)</button>
      <label class="btn btn-block file-btn">📂 Backup importieren
        <input type="file" accept="application/json,.json" data-act="import" hidden></label>
      <p class="small muted">Das JSON-Format ist offen dokumentiert und kann später z. B. von „Brains 0.2" gelesen werden.</p>
      <button type="button" class="btn btn-danger-ghost btn-block" data-act="wipe">Alle Daten löschen</button>
    </section>

    <section class="card">
      <h2 class="card-title">Über Mondzeit</h2>
      <ul class="small muted plain">
        <li>🔒 Kein Konto, keine Cloud, kein Tracking, keine Analytics. Die App lädt nichts von fremden Servern.</li>
        <li>📴 Funktioniert komplett offline.</li>
        <li>⚠️ Vorhersagen und Phasen sind Schätzungen auf Basis deiner Einträge. <strong>Keine Verhütungsmethode</strong> und kein Ersatz für ärztlichen Rat.</li>
      </ul>
      <p class="small muted">Version ${APP_VERSION}</p>
    </section>`;
}

function setPath(path, value) {
  const [a, b] = path.split('.');
  return b ? { [a]: { [b]: value } } : { [a]: value };
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#2a2220' : '#fbf3ee');
}

export function bindSettings(root) {
  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.act === 'import') {
      const file = el.files?.[0];
      el.value = '';
      if (!file) return;
      const ok = await confirmDialog({
        title: 'Backup importieren?',
        message: 'Deine aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt. Tipp: Exportiere vorher ein aktuelles Backup.',
        confirm: 'Importieren',
      });
      if (!ok) return;
      try {
        const r = await importBackup(await file.text());
        applyTheme(state.settings.theme);
        toast(`Import fertig: ${r.periods} Perioden, ${r.days} Tage ✓`);
      } catch (err) {
        toast(err.message || 'Import fehlgeschlagen.', { duration: 6000 });
      }
      return;
    }
    const path = el.dataset.setting;
    if (!path) return;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') {
      const def = DEFAULT_SETTINGS[path];
      const n = Math.round(Number(el.value));
      value = Number.isFinite(n) ? Math.min(Number(el.max), Math.max(Number(el.min), n)) : def;
    } else value = el.value || null;
    if (path.endsWith('Time') || path.endsWith('.time')) value = value || '20:30';
    if (path === 'pill.enabled' && value && !state.settings.pill.packStart) {
      await updateSettings({ pill: { enabled: true } });
      toast('Trag noch den Starttag deines Blisters ein.');
      return;
    }
    await updateSettings(setPath(path, value));
  });

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.theme) {
      await updateSettings({ theme: t.dataset.theme });
      applyTheme(t.dataset.theme);
    } else if (t.dataset.act === 'export') {
      try {
        const r = await exportBackup();
        if (r !== 'cancelled') toast('Backup erstellt 💾');
      } catch {
        toast('Export fehlgeschlagen.');
      }
    } else if (t.dataset.act === 'ics-daily') {
      downloadICS(dailyReminderICS(), 'mondzeit-erinnerung.ics');
    } else if (t.dataset.act === 'ics-pill') {
      downloadICS(pillReminderICS(), 'mondzeit-pille.ics');
    } else if (t.dataset.delSym) {
      await removeCustomSymptom(t.dataset.delSym);
    } else if (t.dataset.act === 'wipe') {
      const ok = await confirmDialog({
        title: 'Wirklich alles löschen?',
        message: 'Alle Perioden, Einträge und Einstellungen werden von diesem Gerät gelöscht. Das kann nicht rückgängig gemacht werden.',
        confirm: 'Alles löschen',
        danger: true,
      });
      if (!ok) return;
      await replaceEverything({ days: [], periods: [], settings: {}, customSymptoms: [] });
      applyTheme(state.settings.theme);
      toast('Alle Daten gelöscht.');
    }
  });
}
