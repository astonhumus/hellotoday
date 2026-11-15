import type { GeoJSONSource, LayerSpecification, Map as MLMap, StyleSpecification } from "maplibre-gl";

// Street map drawn live from OpenFreeMap's vector tiles (OpenStreetMap data, free, no key), so labels stay upright when the map turns.
// Set VITE_MAP_STYLE / VITE_MAP_STYLE_DARK to another MapLibre style if needed; add its hosts to connect-src and img-src in public/_headers.
const LIGHT = import.meta.env.VITE_MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty";
const DARK = import.meta.env.VITE_MAP_STYLE_DARK || "https://tiles.openfreemap.org/styles/dark";

export const streetStyle = (theme: "light" | "dark") => (theme === "dark" ? DARK : LIGHT);

/** Leaflet-era code stored points as [lat, lng]; MapLibre wants [lng, lat]. */
export const lngLat = (p: { lat: number; lng: number }): [number, number] => [p.lng, p.lat];

// MapLibre draws on a canvas and can't read CSS variables, so the theme tokens are read when the map is built.
export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** "Simple": no street map, just the region borders drawn by the app over a plain background. Works with no network at all. */
export const simpleStyle = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": token("--surface-2") || "#f3f3f1" } }]
});

/** Adds or refreshes a GeoJSON source. */
export function putSource(map: MLMap, id: string, data: GeoJSON.GeoJSON) {
  const s = map.getSource(id) as GeoJSONSource | undefined;
  if (s) s.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

/** Adds a layer once, below `before` when that layer exists. */
export function putLayer(map: MLMap, layer: LayerSpecification, before?: string) {
  if (map.getLayer(layer.id)) return;
  map.addLayer(layer, before && map.getLayer(before) ? before : undefined);
}

export function dropLayers(map: MLMap, ...ids: string[]) {
  ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
}

/** The first label layer of the street map: app lines go just under it, so street names stay readable on top. */
export const firstSymbol = (map: MLMap) => map.getStyle().layers.find(l => l.type === "symbol")?.id;
/** The first layer above the background: the app's border fills go under the street map (they show wherever a tile is missing). */
export const aboveBackground = (map: MLMap) => map.getStyle().layers.find(l => l.type !== "background")?.id;

/** A circle of `radius` metres around a point, as a polygon (for the GPS accuracy ring). */
export function circle(lat: number, lng: number, radius: number, steps = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  const dLat = radius / 111320, dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/** Where to write a region's name: the centre of its largest polygon (area-weighted, so it lands inside ordinary shapes). */
export function labelPoint(geom: GeoJSON.Geometry): [number, number] | null {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  let best: { area: number; c: [number, number] } | null = null;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (!a) continue;
    const area = Math.abs(a / 2);
    if (!best || area > best.area) best = { area, c: [cx / (3 * a), cy / (3 * a)] };
  }
  return best?.c ?? null;
}
