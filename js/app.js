// Einstiegspunkt: lädt Daten, verbindet Views, Routing über den URL-Hash.

import { load, subscribe, state } from './store.js';
import { requestPersistence } from './db.js';
import { buildContext } from './context.js';
import { todayISO } from './util.js';
import { renderHome, bindHome } from './views/home.js';
import { renderCalendar, bindCalendar } from './views/calendar.js';
import { renderStats, bindStats } from './views/stats.js';
import { renderSettings, bindSettings, applyTheme } from './views/settings.js';
import { toast } from './ui.js';

const ROUTES = {
  heute: { el: 'view-home', render: (el, ctx) => renderHome(el, ctx), title: 'Heute' },
  kalender: { el: 'view-calendar', render: (el, ctx) => renderCalendar(el, ctx), title: 'Kalender' },
  statistik: { el: 'view-stats', render: (el, ctx) => renderStats(el, ctx), title: 'Statistik' },
  einstellungen: { el: 'view-settings', render: (el) => renderSettings(el), title: 'Einstellungen' },
};

let current = 'heute';
let ctxCache = null;

function ctx() {
  const today = todayISO();
  if (!ctxCache || ctxCache.today !== today) ctxCache = buildContext(today);
  return ctxCache;
}

function routeFromHash() {
  const r = location.hash.replace(/^#\/?/, '');
  return ROUTES[r] ? r : 'heute';
}

function render() {
  ctxCache = null;
  const route = ROUTES[current];
  const el = document.getElementById(route.el);
  const scroll = window.scrollY;
  route.render(el, ctx());
  window.scrollTo(0, scroll);
}

function show(route) {
  const changed = route !== current;
  current = route;
  Object.entries(ROUTES).forEach(([k, r]) => {
    document.getElementById(r.el).hidden = k !== route;
  });
  document.querySelectorAll('.nav-btn').forEach((a) => {
    const active = a.dataset.route === route;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = route === 'heute' ? 'Mondzeit' : `${ROUTES[route].title} · Mondzeit`;
  render();
  if (changed) window.scrollTo(0, 0);
}

async function init() {
  try {
    await load();
  } catch (err) {
    console.error(err);
    document.getElementById('view-home').innerHTML = `<div class="card"><h2>Speicher nicht verfügbar</h2>
      <p>Mondzeit kann in diesem Browser-Modus nichts speichern (z. B. privater Modus). Bitte öffne die App im normalen Modus.</p></div>`;
    return;
  }
  applyTheme(state.settings.theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(state.settings.theme));

  const rerender = () => render();
  bindHome(document.getElementById('view-home'), ctx);
  bindCalendar(document.getElementById('view-calendar'), ctx, rerender);
  bindStats(document.getElementById('view-stats'), ctx, rerender);
  bindSettings(document.getElementById('view-settings'));

  subscribe(render);
  window.addEventListener('hashchange', () => show(routeFromHash()));
  show(routeFromHash());

  // Wenn die App wieder in den Vordergrund kommt (neuer Tag, Erinnerungszeit erreicht …)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  // Einmal pro Minute prüfen, ob eine Erinnerung fällig geworden ist
  setInterval(() => { if (!document.hidden && current === 'heute' && !document.querySelector('.sheet')) render(); }, 60000);

  // Daten möglichst vor automatischem Löschen schützen, sobald es etwas zu schützen gibt
  if (state.periods.length || state.days.size) requestPersistence();
  else {
    const off = subscribe(() => { off(); requestPersistence(); });
  }

  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version verfügbar', {
            action: 'Neu laden',
            duration: 10000,
            onAction: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
              nw.postMessage('skipWaiting');
            },
          });
        }
      });
    });
  }).catch((err) => console.warn('Service Worker nicht registriert:', err));
}

init();
