import { useSyncExternalStore } from "react";
import { store } from "./data";

// Small display settings, remembered in this browser.
export type Units = "km" | "mi";
export type TextSize = "normal" | "large" | "xlarge";

const read = () => ({
  units: (store.get("units") === "mi" ? "mi" : "km") as Units,
  text: (["large", "xlarge"].includes(store.get("text-size") ?? "") ? store.get("text-size") : "normal") as TextSize
});
let prefs = read();
const listeners = new Set<() => void>();

// styles.css rescales the --text-* tokens for data-text="large" / "xlarge"
export const applyPrefs = () => { document.documentElement.dataset.text = prefs.text; };
export function setUnits(units: Units) { prefs = { ...prefs, units }; store.set("units", units); listeners.forEach(l => l()); }
export function setTextSize(text: TextSize) { prefs = { ...prefs, text }; store.set("text-size", text); applyPrefs(); listeners.forEach(l => l()); }
export const usePrefs = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => prefs);

/** "850 m", "3.4 km" or "2.1 mi" depending on the chosen units. */
export function formatDistance(km: number, units: Units = prefs.units): string {
  if (units === "mi") {
    const mi = km * 0.621371;
    if (mi < 0.1) return `${Math.max(10, Math.round(km * 3.28084 / 10) * 10)} ft`;
    return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  if (km < 0.995) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
