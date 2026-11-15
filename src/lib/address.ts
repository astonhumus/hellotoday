import { useEffect, useState } from "react";
import { store } from "./data";

// Street addresses come from OpenStreetMap's Nominatim service (free, at most about one request per second).
// Set VITE_GEOCODER_URL to another Nominatim server if traffic grows. Add its host to connect-src in public/_headers.
const NOMINATIM = (import.meta.env.VITE_GEOCODER_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");

const memo = new Map<string, Promise<string | null>>();
let last = 0; // when the previous request went out, to stay within one per second
const key = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/** Turns a Nominatim answer into a short, readable address: "Khwairamband Bazar, Imphal, Imphal West, Manipur 795001". */
export function tidyAddress(a: Record<string, string> | undefined, fallback?: string): string | null {
  if (!a) return fallback ?? null;
  const pick = (...ks: string[]) => ks.map(k => a[k]).find(Boolean);
  const street = [a.house_number, pick("road", "pedestrian", "footway", "path")].filter(Boolean).join(" ");
  const parts = [
    pick("amenity", "tourism", "building", "shop", "leisure"),
    street,
    pick("neighbourhood", "suburb", "quarter", "hamlet"),
    pick("village", "town", "city", "municipality"),
    pick("county", "state_district"),
    [a.state, a.postcode].filter(Boolean).join(" ")
  ].filter((s): s is string => !!s && !!s.trim());
  const out = parts.filter((s, i) => parts.indexOf(s) === i).join(", "); // no repeats ("Imphal, Imphal")
  return out || fallback || null;
}

/** The address at a point, looked up once and remembered on this device. Null when it can't be found (offline, open country). */
export function addressAt(lat: number, lng: number): Promise<string | null> {
  const k = key(lat, lng);
  const saved = store.get(`addr:${k}`);
  if (saved) return Promise.resolve(saved);
  const have = memo.get(k);
  if (have) return have;
  const wait = Math.max(0, last + 1100 - Date.now());
  last = Date.now() + wait;
  const job = new Promise<void>(r => setTimeout(r, wait))
    .then(() => fetch(`${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`,
      { credentials: "omit", headers: { "Accept-Language": "en" } }))
    .then(r => (r.ok ? r.json() : null))
    .then((j: any) => {
      const text = j && !j.error ? tidyAddress(j.address, j.display_name) : null;
      if (text) store.set(`addr:${k}`, text);
      return text;
    })
    .catch(() => null);
  memo.set(k, job);
  void job.then(v => { if (!v) memo.delete(k); });
  return job;
}

/** React hook: the stored address when there is one, otherwise the looked-up one (null while looking or when none was found). */
export function useAddress(lat: number, lng: number, stored?: string): { address: string | null; looked: boolean } {
  const [found, setFound] = useState<{ k: string; text: string | null } | null>(null);
  const k = key(lat, lng);
  useEffect(() => {
    if (stored) return;
    let live = true;
    void addressAt(lat, lng).then(text => { if (live) setFound({ k, text }); });
    return () => { live = false; };
  }, [k, stored]); // eslint-disable-line react-hooks/exhaustive-deps
  if (stored) return { address: stored, looked: false };
  return found?.k === k ? { address: found.text, looked: true } : { address: null, looked: false };
}
