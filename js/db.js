// Schlanker IndexedDB-Wrapper. Alles bleibt lokal auf dem Gerät.

const DB_NAME = 'mondzeit';
const DB_VERSION = 1;
export const STORES = { days: 'days', periods: 'periods', meta: 'meta' };

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('periods')) db.createObjectStore('periods', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).get(key));
}

export async function put(store, value, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  if (key === undefined) tx.objectStore(store).put(value);
  else tx.objectStore(store).put(value, key);
  return done(tx);
}

export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

/** Ersetzt den Inhalt eines einzelnen Stores (mit keyPath). */
export async function replaceStore(store, items) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  s.clear();
  items.forEach((x) => s.put(x));
  return done(tx);
}

/** Ersetzt den kompletten Inhalt aller Stores atomar (für Import / Löschen). */
export async function replaceAll({ days = [], periods = [], meta = {} }) {
  const db = await open();
  const tx = db.transaction(['days', 'periods', 'meta'], 'readwrite');
  const d = tx.objectStore('days');
  const p = tx.objectStore('periods');
  const m = tx.objectStore('meta');
  d.clear(); p.clear(); m.clear();
  days.forEach((x) => d.put(x));
  periods.forEach((x) => p.put(x));
  Object.entries(meta).forEach(([k, v]) => m.put(v, k));
  return done(tx);
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* ignorieren */ }
  return false;
}
