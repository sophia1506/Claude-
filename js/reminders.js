// Erinnerungen ohne Server.
//
// Ehrliche Einordnung: Eine rein lokale PWA kann KEINE zuverlässigen,
// zeitgesteuerten Benachrichtigungen verschicken, wenn sie geschlossen ist.
// Web-Push braucht immer einen Server, der die Nachricht sendet (auch auf
// dem iPhone ab iOS 16.4). Deshalb:
//   1. In-App-Erinnerung beim Öffnen (Banner auf dem Startscreen)
//   2. Kalender-Datei (.ics) mit täglichem Alarm → das Handy erinnert zuverlässig
//   3. Anleitung für Wecker / Erinnerungen-App / Kurzbefehle

import { state, hasLog, getDay } from './store.js';
import { addDays, todayISO, nowTime } from './util.js';
import { pillInfo, PILL_TYPES } from './cycle.js';

export function dailyReminderDue(today = todayISO(), now = nowTime()) {
  const r = state.settings.reminder;
  if (!r.enabled) return null;
  if (state.settings.reminderDismissed === today) return null;
  if (now >= r.time && !hasLog(today)) return { kind: 'today', date: today };
  const y = addDays(today, -1);
  const anyData = state.days.size > 0 || state.periods.length > 0;
  if (anyData && now < r.time && !hasLog(y)) return { kind: 'yesterday', date: y };
  return null;
}

export function pillReminderDue(today = todayISO(), now = nowTime()) {
  const p = state.settings.pill;
  if (!p.enabled || !p.reminderEnabled) return false;
  const info = pillInfo(today, p);
  if (!info || !info.shouldTake) return false;
  return now >= p.reminderTime && !getDay(today).pillTaken;
}

/* ---------- Kalender-Datei (.ics) ---------- */

function icsDate(iso, time) {
  return `${iso.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

function icsStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function icsText(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function vevent({ uid, start, time, summary, description, rrule, url }) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp()}`,
    // „Floating time" ohne Zeitzone = immer lokale Uhrzeit, auch nach Zeitumstellung
    `DTSTART:${icsDate(start, time)}`,
    'DURATION:PT5M',
    `RRULE:${rrule}`,
    `SUMMARY:${icsText(summary)}`,
    `DESCRIPTION:${icsText(description)}`,
    url ? `URL:${url}` : null,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(summary)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

function wrapCalendar(events) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mondzeit//Periodentracker//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

function appUrl() {
  return location.href.split('#')[0];
}

export function dailyReminderICS(time = state.settings.reminder.time, today = todayISO()) {
  return wrapCalendar([vevent({
    uid: `mondzeit-daily-${Date.now()}@mondzeit.local`,
    start: today,
    time,
    summary: 'Mondzeit: Tag eintragen 🌙',
    description: 'Kurz eintragen, wie es dir heute ging – dauert nur ein paar Sekunden.',
    rrule: 'FREQ=DAILY',
    url: appUrl(),
  })]);
}

/** Pillen-Erinnerung; bei Pausen-Pillen wird die Pause übersprungen. */
export function pillReminderICS(today = todayISO()) {
  const p = state.settings.pill;
  const t = PILL_TYPES[p.type] || PILL_TYPES['21_7'];
  const base = {
    time: p.reminderTime,
    summary: 'Pille nehmen 💊',
    description: 'Erinnerung aus Mondzeit. In der App abhaken nicht vergessen.',
    url: appUrl(),
  };
  const withPause = p.packStart && t.active < t.pack && !t.placebo;
  if (!withPause) {
    return wrapCalendar([vevent({ ...base, uid: `mondzeit-pill-${Date.now()}@mondzeit.local`, start: today, rrule: 'FREQ=DAILY' })]);
  }
  // Ein Termin pro Einnahmetag im Blister, jeweils alle `pack` Tage wiederholt.
  const info = pillInfo(today, p);
  const packStart = info ? addDays(today, -(info.dayInPack - 1)) : p.packStart;
  const events = [];
  for (let i = 0; i < t.active; i++) {
    let start = addDays(packStart, i);
    if (start < today) start = addDays(start, t.pack);
    events.push(vevent({ ...base, uid: `mondzeit-pill-${i}-${Date.now()}@mondzeit.local`, start, rrule: `FREQ=DAILY;INTERVAL=${t.pack}` }));
  }
  return wrapCalendar(events);
}

export function downloadICS(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
