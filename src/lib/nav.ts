export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const appleMapsUrl = (lat: number, lng: number, name?: string) =>
  `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name || "Pinned location")}`;
