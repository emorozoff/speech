const DB_NAME = 'speech';
const DB_VERSION = 3;
export const STORE_SCRIPTS = 'scripts';
export const STORE_PROFILE = 'profile';
// Единые для всех сценариев настройки отображения текста (размер, ширина,
// сдвиги, зеркало, скорость и т.д.). Хранятся одной записью (id: 'display').
export const STORE_SETTINGS = 'settings';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_SCRIPTS)) {
          const store = db.createObjectStore(STORE_SCRIPTS, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_PROFILE)) {
          db.createObjectStore(STORE_PROFILE, { keyPath: 'id' });
        }
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
  return dbPromise;
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await fn(store);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

export function dbGet(storeName, key) {
  return withStore(storeName, 'readonly', (store) => promisify(store.get(key)));
}

export function dbGetAll(storeName) {
  return withStore(storeName, 'readonly', (store) => promisify(store.getAll()));
}

export function dbPut(storeName, value) {
  return withStore(storeName, 'readwrite', (store) => promisify(store.put(value)));
}

export function dbDelete(storeName, key) {
  return withStore(storeName, 'readwrite', (store) => promisify(store.delete(key)));
}

export function dbClear(storeName) {
  return withStore(storeName, 'readwrite', (store) => promisify(store.clear()));
}
