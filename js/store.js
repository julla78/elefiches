// Éléfiches — enregistrement local (IndexedDB), avec repli en mémoire si le navigateur le refuse.
const DB = 'elefiches', STORE = 'kv';
const mem = new Map();
let dbp = null, persistent = true;

function open() {
  return (dbp ??= new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }).catch(() => { persistent = false; return null; }));
}

export async function get(key) {
  const db = await open();
  if (!db) return mem.get(key);
  return new Promise(res => {
    try {
      const rq = db.transaction(STORE).objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result ?? mem.get(key));
      rq.onerror = () => res(mem.get(key));
    } catch { res(mem.get(key)); }
  });
}

export async function set(key, value) {
  mem.set(key, value);
  const db = await open();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => res(true);
      tx.onerror = tx.onabort = () => { persistent = false; res(false); };
    } catch { persistent = false; res(false); }
  });
}

export const isPersistent = () => persistent;

// Demande au navigateur de garder ces données même s'il manque de place. Renvoie true si c'est accordé.
export async function keep() { try { return !!(await navigator.storage?.persist?.()); } catch { return false; } }
export async function kept() { try { return !!(await navigator.storage?.persisted?.()); } catch { return false; } }

// Efface tout ce que l'application a enregistré sur cet appareil (paquets, progression, réglages).
export function wipe() {
  mem.clear();
  return new Promise(res => {
    const finish = () => { dbp = null; res(true); };
    (dbp || Promise.resolve(null)).then(db => {
      try { db?.close(); const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = finish; } catch { finish(); }
    });
  });
}
