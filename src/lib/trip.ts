import { useSyncExternalStore } from "react";
import { store } from "./data";

// A day's plan: the places this person wants to visit. Saved on this device only, like favourites.
const KEY = "trip-places";

const read = (): string[] => {
  try { const v = JSON.parse(store.get(KEY) ?? "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; } catch { return []; }
};

let cache = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const save = (next: string[]) => { cache = next; store.set(KEY, JSON.stringify(next)); emit(); };

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = read(); emit(); } };
  addEventListener("storage", onStorage);
  return () => { listeners.delete(l); removeEventListener("storage", onStorage); };
};

export const MAX_TRIP = 20;

export function toggleTrip(id: string): boolean {
  const on = !cache.includes(id);
  if (on && cache.length >= MAX_TRIP) return false;
  save(on ? [...cache, id] : cache.filter(x => x !== id));
  return on;
}
export const clearTrip = () => save([]);
export const reloadTrip = () => { cache = read(); emit(); };

export function useTrip() {
  const ids = useSyncExternalStore(subscribe, () => cache);
  return { ids, set: new Set(ids), has: (id: string) => ids.includes(id), count: ids.length, toggle: toggleTrip, clear: clearTrip };
}
