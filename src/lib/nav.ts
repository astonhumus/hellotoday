export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const appleMapsUrl = (lat: number, lng: number, name?: string) =>
  `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name || "Pinned location")}`;

// Back navigation, the way phone apps do it: Back walks Detail > section > Home > exit, never through every
// tab switch or filter change. Only Home > section and list > detail add a history entry; everything else replaces
// the current one. Each entry carries a counter so the app can tell "came from another page of this app" (go back)
// from "opened this address directly" (go Home instead).
let position = 0;
let replacing = false;

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
    if (canGoBack()) history.back(); else replace();         // Home is where the section was opened from
  } else if (cur.section === "") location.hash = target;     // Home > section
  else replace();                                            // section > section (tab switch)
}

export function trackHistory() {
  if (typeof history.state?.i !== "number") history.replaceState({ ...(history.state ?? {}), i: 0 }, "");
  position = history.state.i;
  const onChange = () => {
    if (replacing) { replacing = false; history.replaceState({ ...(history.state ?? {}), i: position }, ""); return; }
    if (typeof history.state?.i === "number") position = history.state.i; // back or forward: the entry already has its number
    else { position += 1; history.replaceState({ ...(history.state ?? {}), i: position }, ""); } // a new page
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
