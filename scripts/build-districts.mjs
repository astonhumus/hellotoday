// Cuts one state's district outlines out of the geoBoundaries India ADM2 file.
// Usage: node scripts/build-districts.mjs <india-adm2.geojson> <state name> <state id>
// Then run: node scripts/build-outline.mjs <state id>   (adds the merged state outline to the same file)
import { readFileSync, writeFileSync } from "node:fs";

const [src, stateName, stateId] = process.argv.slice(2);
const adm2 = JSON.parse(readFileSync(src, "utf8"));
const states = JSON.parse(readFileSync(new URL("../public/data/india-states.json", import.meta.url), "utf8"));
const state = states.features.find(f => f.properties.name === stateName);
if (!state) throw new Error(`No state called ${stateName}`);

const polys = g => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inState = (x, y) => polys(state.geometry).some(p => inRing(x, y, p[0]));

// A district belongs to the state when a good share of its outline vertices (the bundled state outline is simplified, so keep this below 0.5) fall inside the state.
const share = f => {
  const pts = polys(f.geometry).flatMap(p => p[0]);
  return pts.filter(([x, y]) => inState(x, y)).length / pts.length;
};

const round = c => (typeof c[0] === "number" ? c.map(n => Math.round(n * 1e4) / 1e4) : c.map(round));
const mine = adm2.features
  .filter(f => share(f) > 0.4)
  .map(f => ({ type: "Feature", properties: { name: f.properties.shapeName }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } }))
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

console.log(mine.length, "districts:", mine.map(f => f.properties.name).join(", "));
writeFileSync(new URL(`../public/data/${stateId}/districts.json`, import.meta.url), JSON.stringify({ type: "FeatureCollection", features: mine }));
