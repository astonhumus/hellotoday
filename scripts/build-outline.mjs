// Builds the state's outer boundary by merging its district outlines, so the green state line and the
// dashed district lines always agree. Usage: node scripts/build-outline.mjs <state id>
import { readFileSync, writeFileSync } from "node:fs";
import polygonClipping from "polygon-clipping";

const id = process.argv[2];
const file = new URL(`../public/data/${id}/districts.json`, import.meta.url);
const districts = JSON.parse(readFileSync(file, "utf8"));

const polys = districts.features.flatMap(f => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates));
const merged = polygonClipping.union(...polys.map(p => [p]));

// Keep only the outer rings: tiny gaps between simplified districts would otherwise show up as holes.
const outer = merged.map(poly => [poly[0]]);
const area = ring => Math.abs(ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + (x * y2 - x2 * y); }, 0) / 2);
const kept = outer.filter(p => area(p[0]) > 1e-4); // drop slivers

console.log(`${polys.length} district polygons -> ${merged.length} merged shapes, ${kept.length} kept; holes removed: ${merged.reduce((n, p) => n + p.length - 1, 0)}`);
districts.outline = { type: "Feature", properties: { name: id }, geometry: { type: kept.length === 1 ? "Polygon" : "MultiPolygon", coordinates: kept.length === 1 ? kept[0] : kept } };
writeFileSync(file, JSON.stringify(districts));
