import { useSyncExternalStore } from "react";
import { store } from "./data";

// Favourites live only in this browser (localStorage). Nothing is sent to a server and no account is needed.
export type FavKind = "place" | "song";
const KEYS: Record<FavKind, string> = { place: "fav-places", song: "fav-songs" };

const read = (kind: FavKind): string[] => {
  try { const v = JSON.parse(store.get(KEYS[kind]) ?? "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; } catch { return []; }
};

const cache: Record<FavKind, string[]> = { place: read("place"), song: read("song") };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    const kind = (Object.keys(KEYS) as FavKind[]).find(k => KEYS[k] === e.key);
    if (kind) { cache[kind] = read(kind); emit(); }
  };
  addEventListener("storage", onStorage);
  return () => { listeners.delete(l); removeEventListener("storage", onStorage); };
};

export function toggleFavorite(kind: FavKind, id: string): boolean {
  const cur = cache[kind];
  const on = !cur.includes(id);
  cache[kind] = on ? [...cur, id] : cur.filter(x => x !== id);
  store.set(KEYS[kind], JSON.stringify(cache[kind]));
  emit();
  return on;
}

export function clearFavorites() {
  (Object.keys(KEYS) as FavKind[]).forEach(k => { cache[k] = []; store.set(KEYS[k], "[]"); });
  emit();
}

/** The places (or songs) this person has hearted. Saved on this device only. */
export function useFavorites(kind: FavKind) {
  const ids = useSyncExternalStore(subscribe, () => cache[kind]);
  return { ids, set: new Set(ids), has: (id: string) => ids.includes(id), count: ids.length, toggle: (id: string) => toggleFavorite(kind, id) };
}
