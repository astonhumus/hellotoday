import { store } from "./data";
import { reloadFavorites } from "./favorites";
import { notify } from "./ui";

// Everything this person keeps on this device. Settings (theme, text size, units, region) travel too; recent searches do not.
const KEYS = ["fav-places", "fav-songs", "my-visited", "checklist", "trip-places", "theme", "text-size", "units"];

export function exportSaved(): void {
  const data: Record<string, string> = {};
  KEYS.forEach(k => { const v = store.get(k); if (v != null) data[k] = v; });
  const file = { app: "explore-hack", savedAt: new Date().toISOString(), data };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: `explore-my-data-${new Date().toISOString().slice(0, 10)}.json` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a file made by exportSaved. Returns the number of items restored, or null when the file isn't one of ours. */
export async function importSaved(file: File): Promise<number | null> {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { void notify("That file isn't valid JSON.", "error"); return null; }
  const data = (parsed as { app?: string; data?: Record<string, unknown> } | null)?.data;
  if ((parsed as { app?: string } | null)?.app !== "explore-hack" || !data || typeof data !== "object") {
    void notify("That isn't a file saved from this app.", "error");
    return null;
  }
  let n = 0;
  for (const k of KEYS) {
    const v = data[k];
    if (typeof v !== "string" || v.length > 2_000_000) continue;
    if (k.startsWith("fav-") || k === "my-visited" || k === "checklist" || k === "trip-places") {
      try { JSON.parse(v); } catch { continue; } // keep only lists and objects that read back
    }
    if (store.set(k, v)) n++;
  }
  reloadFavorites();
  return n;
}
