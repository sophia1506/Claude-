// Kleine UI-Bausteine: Toast, Bottom-Sheet, Bestätigungsdialog, Skalen.

import { esc } from './util.js';

/* ---------- Toast ---------- */

let toastTimer;
export function toast(message, { action, onAction, duration = 4000 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  el.classList.add('show');
  if (action) {
    el.querySelector('.toast-action').onclick = () => {
      el.classList.remove('show');
      onAction?.();
    };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ---------- Bottom-Sheet ---------- */

/**
 * Öffnet ein Sheet. `render(body, close)` füllt den Inhalt.
 * Gibt eine Funktion zum Schließen zurück.
 */
export function openSheet({ title, render, onClose, className = '' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = `sheet ${className}`;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  sheet.innerHTML = `
    <div class="sheet-grip" aria-hidden="true"></div>
    <header class="sheet-head">
      <h2 class="sheet-title">${esc(title)}</h2>
      <button type="button" class="icon-btn sheet-close" aria-label="Schließen">✕</button>
    </header>
    <div class="sheet-body"></div>`;
  document.body.append(backdrop, sheet);
  document.body.classList.add('sheet-open');
  const prevFocus = document.activeElement;

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      sheet.remove();
      backdrop.remove();
      if (!document.querySelector('.sheet')) document.body.classList.remove('sheet-open');
      prevFocus?.focus?.();
    }, 220);
    onClose?.();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  backdrop.addEventListener('click', close);
  sheet.querySelector('.sheet-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  render(sheet.querySelector('.sheet-body'), close, sheet);
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    backdrop.classList.add('open');
    sheet.querySelector('.sheet-close').focus({ preventScroll: true });
  });
  return close;
}

export function confirmDialog({ title, message, confirm = 'OK', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      className: 'sheet-small',
      onClose: () => { if (!answered) resolve(false); },
      render(body, close) {
        body.innerHTML = `
          <p class="muted">${esc(message)}</p>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" data-r="0">${esc(cancel)}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(confirm)}</button>
          </div>`;
        body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
          answered = true;
          resolve(b.dataset.r === '1');
          close();
        }));
      },
    });
  });
}

/* ---------- Skalen ---------- */

export const SCALES = {
  mood: { label: 'Stimmung', icons: ['😣', '😕', '😐', '🙂', '😄'], words: ['sehr schlecht', 'eher schlecht', 'okay', 'gut', 'sehr gut'] },
  energy: { label: 'Energie', icons: ['🪫', '🥱', '😐', '⚡', '🚀'], words: ['sehr niedrig', 'niedrig', 'mittel', 'hoch', 'sehr hoch'] },
  focus: { label: 'Fokus & Konzentration', icons: ['🌫️', '😶‍🌫️', '😐', '📖', '🎯'], words: ['gar nicht', 'schwer', 'mittel', 'gut', 'super'] },
  sleepQuality: { label: 'Schlafqualität', icons: ['😫', '😪', '😐', '😌', '😴'], words: ['sehr schlecht', 'schlecht', 'okay', 'gut', 'sehr gut'] },
};

export function scaleHTML(key, value) {
  const s = SCALES[key];
  return `
    <div class="scale" role="radiogroup" aria-label="${esc(s.label)}" data-scale="${key}">
      ${s.icons.map((icon, i) => `
        <button type="button" role="radio" class="scale-btn${value === i + 1 ? ' active' : ''}"
          aria-checked="${value === i + 1}" aria-label="${esc(s.words[i])}" data-value="${i + 1}">
          <span class="scale-icon" aria-hidden="true">${icon}</span>
        </button>`).join('')}
    </div>
    <div class="scale-caption" aria-hidden="true">${value ? `<span style="grid-column:${value}">${esc(s.words[value - 1])}</span>` : '<span>&nbsp;</span>'}</div>`;
}

export const FLOW_LABELS = { light: 'leicht', medium: 'mittel', heavy: 'stark' };
export const FLOW_ICONS = { light: '💧', medium: '💧💧', heavy: '💧💧💧' };

export function flowHTML(value, attr = 'data-flow') {
  return `<div class="chip-row flow-row" role="radiogroup" aria-label="Stärke">
    ${Object.entries(FLOW_LABELS).map(([k, l]) => `
      <button type="button" role="radio" class="chip flow-chip${value === k ? ' active' : ''}" aria-checked="${value === k}" ${attr}="${k}">
        <span aria-hidden="true">${FLOW_ICONS[k]}</span> ${l}
      </button>`).join('')}
  </div>`;
}
