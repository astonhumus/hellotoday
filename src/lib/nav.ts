export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const appleMapsUrl = (lat: number, lng: number, name?: string) =>
  `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name || "Pinned location")}`;

// Back navigation. Each page the visitor opens gets a counter in its history entry, so the app can tell
// "I came from another page of this app" (go back) from "I opened this address directly" (go Home instead).
let position = 0;
export function trackHistory() {
  if (typeof history.state?.i !== "number") history.replaceState({ ...(history.state ?? {}), i: 0 }, "");
  position = history.state.i;
  const onChange = () => {
    if (typeof history.state?.i === "number") position = history.state.i; // back or forward: the entry already has its number
    else { position += 1; history.replaceState({ ...(history.state ?? {}), i: position }, ""); } // a new page
  };
  addEventListener("hashchange", onChange);
  return () => removeEventListener("hashchange", onChange);
}
export const canGoBack = () => (history.state?.i ?? 0) > 0;
export function goBack(fallback = "#/") {
  if (canGoBack()) history.back();
  else location.hash = fallback;
}
