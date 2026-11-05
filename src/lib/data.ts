const loading = new Map<string, Promise<unknown>>();

/** Loads a JSON file from public/data. The result is kept, so opening the map again does not download and parse it twice. */
export function loadJson<T>(path: string): Promise<T> {
  let p = loading.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then(res => {
      if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
      return res.json() as Promise<T>;
    });
    loading.set(path, p);
    p.catch(() => loading.delete(path)); // a failed load can be retried
  }
  return p;
}

export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
};
