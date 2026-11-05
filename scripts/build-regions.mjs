// Builds the worldwide country and state/province data from Natural Earth admin-1 (public domain).
// Usage: node scripts/build-regions.mjs <ne_10m_admin_1_states_provinces.geojson>
// Writes:
//   public/data/countries.json        list of countries (small; loaded at start)
//   public/data/regions/<A3>.json     one country's states/provinces with simplified borders (loaded when that country is chosen)
//   supabase/regions.sql              adds a country column to public.states and one row per region, so places can be saved anywhere
import fs from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("Give the path to ne_10m_admin_1_states_provinces.geojson");
const data = JSON.parse(fs.readFileSync(src, "utf8"));

const slug = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TOL = 0.01; // degrees (about 1 km): plenty for a state outline on a phone

// Douglas-Peucker line simplification
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2;
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d2 > max) { max = d2; idx = i; }
    }
    if (max > t2 && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r3 = n => +n.toFixed(3);
const ringBox = ring => {
  let s = 90, n = -90, w = 180, e = -180;
  for (const [x, y] of ring) { if (y < s) s = y; if (y > n) n = y; if (x < w) w = x; if (x > e) e = x; }
  return { s, n, w, e, area: (n - s) * (e - w) };
};

// Simplify every polygon; remember the biggest one, which decides the map centre and zoom
// (so far-flung islands don't drag the view out to sea).
function shape(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const out = [];
  let big = null;
  for (const poly of polys) {
    const outer = simplify(poly[0], TOL);
    const box = ringBox(poly[0]);
    if (outer.length < 4) continue;
    const rings = [outer.map(([x, y]) => [r3(x), r3(y)])];
    for (const hole of poly.slice(1)) {
      const h = simplify(hole, TOL);
      if (h.length >= 4 && ringBox(hole).area > 0.0005) rings.push(h.map(([x, y]) => [r3(x), r3(y)]));
    }
    out.push(rings);
    if (!big || box.area > big.area) big = box;
  }
  if (!out.length) { // a very small region: keep it as a rough box so it still exists
    const b = ringBox((geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0]));
    big = b;
    out.push([[[b.w, b.s], [b.e, b.s], [b.e, b.n], [b.w, b.n], [b.w, b.s]].map(([x, y]) => [r3(x), r3(y)])]);
  }
  return { geometry: out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out }, box: big };
}
const zoomFor = box => {
  const span = Math.max(box.e - box.w, (box.n - box.s) * 1.6, 0.01);
  return Math.max(3, Math.min(13, Math.floor(Math.log2(360 / span))));
};
const centre = b => [r3((b.s + b.n) / 2), r3((b.w + b.e) / 2)];

const byCountry = new Map();
for (const f of data.features) {
  const p = f.properties;
  if (!f.geometry || !p.adm0_a3 || !p.name) continue;
  if (!byCountry.has(p.adm0_a3)) byCountry.set(p.adm0_a3, { name: p.admin, iso2: p.iso_a2 && p.iso_a2 !== "-99" ? p.iso_a2 : "", feats: [] });
  byCountry.get(p.adm0_a3).feats.push(f);
}

fs.mkdirSync("public/data/regions", { recursive: true });
const countries = [];
const sql = [];
let total = 0;
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

for (const [a3, c] of [...byCountry].sort((x, y) => x[1].name.localeCompare(y[1].name))) {
  const used = new Set();
  const features = [];
  let cbox = null;
  for (const f of c.feats.sort((x, y) => x.properties.name.localeCompare(y.properties.name))) {
    const { geometry, box } = shape(f.geometry);
    // India keeps plain ids ("manipur") so the places already stored under them keep working.
    let id = (a3 === "IND" ? "" : a3.toLowerCase() + "-") + slug(f.properties.name);
    for (let n = 2; used.has(id); n++) id = id.replace(/-\d+$/, "") + "-" + n;
    used.add(id);
    const kind = f.properties.type_en || f.properties.type || "";
    features.push({ type: "Feature", properties: { id, name: f.properties.name, kind, center: centre(box), zoom: zoomFor(box), bbox: [r3(box.s), r3(box.w), r3(box.n), r3(box.e)] }, geometry });
    if (!cbox || box.area > cbox.area) cbox = box;
    sql.push(`(${q(id)}, ${q(f.properties.name)}, ${centre(box)[0]}, ${centre(box)[1]}, ${zoomFor(box)}, ${q(a3)})`);
    total++;
  }
  // The word for the sub-divisions ("State", "Province", "Region"...): the most common one in the country.
  const kinds = {};
  features.forEach(f => { const k = f.properties.kind; if (k) kinds[k] = (kinds[k] ?? 0) + 1; });
  const kind = Object.entries(kinds).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "Region";
  fs.writeFileSync(`public/data/regions/${a3}.json`, JSON.stringify({ type: "FeatureCollection", features }));
  countries.push({ id: a3, name: c.name, kind, center: centre(cbox), zoom: Math.max(2, zoomFor(cbox) - 1), regions: features.length });
}
fs.writeFileSync("public/data/countries.json", JSON.stringify(countries));

fs.writeFileSync("supabase/regions.sql",
`-- Generated by scripts/build-regions.mjs. Run once in the Supabase SQL Editor (safe to re-run).
-- Adds a country column and one row per state/province in the world, so places can be saved in any of them.
alter table public.states add column if not exists country_id text;
insert into public.states (id, name, center_lat, center_lng, zoom, country_id) values
${sql.join(",\n")}
on conflict (id) do update set country_id = excluded.country_id;
update public.states set country_id = 'IND' where id = 'manipur' and country_id is null;
`);
console.log(`${countries.length} countries, ${total} regions`);
