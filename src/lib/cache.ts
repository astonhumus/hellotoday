// Tiny IndexedDB key/value store for offline copies of the public data (places, songs, catalog edits).
// IndexedDB instead of localStorage because a large lyrics library can exceed localStorage's ~5 MB.
const DB = "explore-cache", STORE = "kv";

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>(resolve => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* private mode or storage full: just skip caching */ }
}

export async function cacheClear(): Promise<void> {
  try {
    const db = await open();
    db.transaction(STORE, "readwrite").objectStore(STORE).clear();
  } catch { /* ignore */ }
}
