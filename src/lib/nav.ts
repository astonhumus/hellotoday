/** Google Maps with the place dropped as a pin. */
export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Google Maps turn-by-turn directions to the place, from the person's own position. */
export const googleDirectionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/** A multi-stop route (Google Maps takes up to 9 stops between the start and the end). */
export function googleRouteUrl(stops: { lat: number; lng: number }[]): string {
  const at = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
  const last = stops[stops.length - 1];
  const via = stops.slice(0, -1).slice(0, 9).map(at).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${at(last)}${via ? `&waypoints=${encodeURIComponent(via)}` : ""}`;
}

export const appleMapsUrl = (lat: number, lng: number, name?: string) =>
  `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name || "Pinned location")}`;

// Back navigation, the way phone apps do it: Back walks Detail > section > Home > exit, never through every
// tab switch or filter change. Only Home > section, list > detail and "side pages" (About, Regions, Review, sign-in)
// add a history entry; everything else replaces the current one. Each entry carries a counter so the app can tell
// "came from another page of this app" (go back) from "opened this address directly" (go Home instead).
// `trail` remembers which section each entry of this visit showed, so Home and tabs can jump back to the right entry.
let position = 0;
let replacing = false;
const trail: string[] = [];

const TABS = new Set(["", "places", "music", "checklist"]);

const parts = (hash: string) => {
  const [path = ""] = hash.replace(/^#\/?/, "").split("?");
  const [section = "", arg = ""] = path.split("/");
  return { section, detail: !!arg };
};

/** Go to an in-app address (like "#/places?cat=picnic") using the history rules above. */
export function go(target: string) {
  if (target === location.hash) return;
  const cur = parts(location.hash), next = parts(target);
  const replace = () => { replacing = true; location.replace(target); };
  if (cur.section === next.section) {
    if (!cur.detail && next.detail) location.hash = target; // open a detail: Back closes it
    else replace();                                          // another detail, closing, or new filters: same step
  } else if (next.section === "") {
    // Home: jump back to the Home entry this visit started from, however many steps ago (a place open on top of Places is one of them)
    let j = position - 1;
    while (j >= 0 && trail[j] !== "") j--;
    if (j >= 0) history.go(j - position); else replace();
  } else if (!TABS.has(next.section)) location.hash = target; // a side page (About, Regions, Review, sign-in): Back returns to where you were
  else if (cur.section === "") location.hash = target;        // Home > section
  else if (!TABS.has(cur.section) && trail[position - 1] === next.section) history.back(); // leaving a side page for the tab it was opened from
  else replace();                                              // section > section (tab switch)
}

export function trackHistory() {
  if (typeof history.state?.i !== "number") history.replaceState({ ...(history.state ?? {}), i: 0 }, "");
  position = history.state.i;
  trail[position] = parts(location.hash).section;
  const onChange = () => {
    if (replacing) { replacing = false; history.replaceState({ ...(history.state ?? {}), i: position }, ""); }
    else if (typeof history.state?.i === "number") position = history.state.i; // back or forward: the entry already has its number
    else { position += 1; history.replaceState({ ...(history.state ?? {}), i: position }, ""); } // a new page
    trail[position] = parts(location.hash).section;
  };
  // Every in-app link goes through go().
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href^='#/']") as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== "_self")) return;
    e.preventDefault();
    go(a.getAttribute("href")!);
  };
  addEventListener("hashchange", onChange);
  document.addEventListener("click", onClick);
  return () => { removeEventListener("hashchange", onChange); document.removeEventListener("click", onClick); };
}
export const canGoBack = () => (history.state?.i ?? 0) > 0;
export function goBack(fallback = "#/") {
  if (canGoBack()) history.back();
  else go(fallback);
}
