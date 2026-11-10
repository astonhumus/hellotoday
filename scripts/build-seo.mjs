// Writes public/robots.txt, public/sitemap.xml and public/llms.txt for the site's address.
// Runs automatically before `npm run build`. Set VITE_SITE_URL (e.g. https://example.com) when the address changes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const DEFAULT_URL = "https://hellotoday.astonhumus.workers.dev"; // keep in sync with vite.config.ts

// Environment variable first, then a local .env file, then the default
const fromEnvFile = () => {
  const f = new URL("../.env", import.meta.url);
  if (!existsSync(f)) return "";
  const m = readFileSync(f, "utf8").match(/^VITE_SITE_URL=(.+)$/m);
  return m ? m[1].trim() : "";
};
const SITE = (process.env.VITE_SITE_URL || fromEnvFile() || DEFAULT_URL).replace(/\/+$/, "");
const out = name => new URL(`../public/${name}`, import.meta.url);
const today = new Date().toISOString().slice(0, 10);

writeFileSync(out("robots.txt"), `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

// The app itself lives behind "#/..." addresses, which search engines treat as the same page as "/". So every place that ships
// with the app also gets its own real page, /place/<id>/, generated here (public/place/, not committed). They are listed in the
// sitemap and in an index page, and each has its own title, description, canonical address and structured data.
// Places added later through the database are not known at build time, so they have no page of their own.
const SITE_NAME = "Explore Hack";
const read = f => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), "utf8"));
const envValue = name => {
  if (process.env[name]) return process.env[name];
  const f = new URL("../.env", import.meta.url);
  const m = existsSync(f) && readFileSync(f, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};
const cats = Object.fromEntries(read("categories.json").map(c => [c.id, c.label]));
const countryNames = Object.fromEntries(read("countries.json").map(c => [c.id, c.name]));

// Places that ship with the app (Manipur), then every approved place in the database. The database wins when both have an id.
// The database is read with the public key, exactly as a visitor's browser does, so only approved places can ever appear.
const all = new Map(read("manipur/places.json").map(p => [p.id, { ...p, regionId: "manipur", region: "Manipur", country: "India", countryId: "IND" }]));
const regions = { manipur: { name: "Manipur", country: "IND" } };
const dbUrl = envValue("VITE_SUPABASE_URL").replace(/\/+$/, ""), dbKey = envValue("VITE_SUPABASE_KEY");
let fromDb = 0;
if (dbUrl && dbKey && !dbUrl.includes("YOUR-PROJECT-REF")) {
  const get = async (path) => {
    const rows = [];
    for (let from = 0; ; from += 1000) { // the server returns at most 1000 rows a request
      const res = await fetch(`${dbUrl}/rest/v1/${path}`, { headers: { apikey: dbKey, Authorization: `Bearer ${dbKey}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
      if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  };
  try {
    for (const r of await get("states?select=id,name,country_id&order=id")) regions[r.id] = { name: r.name, country: r.country_id || "IND" };
    for (const c of await get("categories?select=id,label&order=id")) cats[c.id] = c.label;
    const base = "id,state_id,category_id,name,district,lat,lng,description,phone,approx,updated_at";
    // The closure columns exist once supabase/archive.sql has been run; without it, read the older set.
    const rowsOf = await get(`places?select=${base},closure,closure_note&status=eq.approved&order=id`).catch(() => get(`places?select=${base}&status=eq.approved&order=id`));
    for (const r of rowsOf) {
      const reg = regions[r.state_id] ?? { name: r.state_id, country: "IND" };
      all.set(r.id, { id: r.id, name: r.name, category: r.category_id, district: r.district ?? undefined, lat: r.lat, lng: r.lng, desc: r.description ?? undefined,
        phone: r.phone ?? undefined, approx: r.approx || undefined, closure: r.closure ?? undefined, closureNote: r.closure_note ?? undefined, updated: r.updated_at?.slice(0, 10),
        regionId: r.state_id, region: reg.name, country: countryNames[reg.country] ?? reg.country, countryId: reg.country });
      fromDb++;
    }
  } catch (e) {
    console.warn(`Could not read places from the database (${e.message}); the pages cover only the places bundled with the app.`);
  }
} else console.warn("No database configured (VITE_SUPABASE_URL / VITE_SUPABASE_KEY): the pages cover only the places bundled with the app.");
const places = [...all.values()];
const MAX_PAGES = 15000; // Cloudflare's free static hosting allows 20,000 files in total
if (places.length > MAX_PAGES) { console.warn(`${places.length} places: only the first ${MAX_PAGES} get a page (hosting file limit).`); places.length = MAX_PAGES; }
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pageUrl = id => `${SITE}/place/${encodeURIComponent(id)}/`;
const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

const doc = ({ title, desc, canonical, body, ld }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/place/place.css">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<header><a href="/" class="brand">${SITE_NAME}</a> <nav><a href="/place/">All regions</a> <a href="/#/music">Songs</a> <a href="/#/checklist">Checklist</a></nav></header>
<main>
${body}
</main>
</body>
</html>
`;

const outDir = new URL("../public/place/", import.meta.url);
rmSync(outDir, { recursive: true, force: true });
rmSync(new URL("../public/places-in/", import.meta.url), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("place.css", outDir), `body{font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;color:#1c1917;background:#fafaf9}
@media(prefers-color-scheme:dark){body{color:#f5f5f4;background:#0f0f0e}a{color:#6ee7b7}.card{border-color:#44403c}}
header{display:flex;gap:16px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #d6d3d1}
header nav{display:flex;gap:14px}.brand{font-weight:700;text-decoration:none}
main{max-width:42rem;margin:0 auto;padding:20px 16px 48px}h1{font-size:1.75rem;line-height:1.2;margin:.2em 0}
.tags{color:#78716c;margin:0 0 12px}.btn{display:inline-block;padding:10px 16px;border-radius:10px;background:#1f7a5a;color:#fff;text-decoration:none;font-weight:600;margin:6px 8px 6px 0}
.btn.alt{background:transparent;color:inherit;border:1px solid #a8a29e}ul.list{list-style:none;padding:0}ul.list li{padding:6px 0;border-bottom:1px solid #e7e5e4}
.note{color:#78716c;font-size:.9rem;margin-top:24px}
`);

for (const p of places) {
  const cat = cats[p.category] ?? "Place";
  const where = [p.district, p.region].filter(Boolean).join(", ");
  const title = trunc(`${p.name}: ${cat.toLowerCase()} in ${where}`, 60) + ` | ${SITE_NAME}`;
  const desc = trunc(`${p.desc ?? `${p.name} in ${where}.`} Map location, directions and distance.`, 158);
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  const ld = {
    "@context": "https://schema.org", "@type": p.category === "tourist-site" ? "TouristAttraction" : "Place",
    name: p.name, description: p.desc, url: pageUrl(p.id),
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    address: { "@type": "PostalAddress", addressRegion: p.region, addressCountry: p.country, ...(p.district ? { addressLocality: p.district } : {}) },
    containedInPlace: { "@type": "AdministrativeArea", name: p.region }
  };
  const body = `<h1>${esc(p.name)}</h1>
<p class="tags">${esc(cat)} · ${esc(where)}${p.approx ? " · location is approximate" : ""}</p>
${p.closure === "temporary" ? `<p class="note"><strong>Temporarily closed.</strong> ${esc(p.closureNote ?? "")}</p>` : ""}
${p.desc ? `<p>${esc(p.desc)}</p>` : ""}
<p><a class="btn" href="/#/places/${encodeURIComponent(p.id)}?region=${encodeURIComponent(p.regionId)}&amp;country=${encodeURIComponent(p.countryId)}">Open on the interactive map</a><a class="btn alt" href="${esc(gmaps)}" rel="noopener">Directions</a></p>
<p>Coordinates: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</p>
${p.phone ? `<p>Phone: ${esc(p.phone)}</p>` : ""}
<p class="note">Details can be out of date. Check before you travel. Map data © OpenStreetMap contributors.</p>`;
  mkdirSync(new URL(`${encodeURIComponent(p.id)}/`, outDir), { recursive: true });
  writeFileSync(new URL(`${encodeURIComponent(p.id)}/index.html`, outDir), doc({ title, desc, canonical: pageUrl(p.id), body, ld }));
}

// /place/ lists the regions; /places-in/<region>/ lists that region's places by category (so no single page needs thousands of links).
const byRegion = new Map();
for (const p of places) (byRegion.get(p.regionId) ?? byRegion.set(p.regionId, []).get(p.regionId)).push(p);
const regionUrl = id => `${SITE}/places-in/${encodeURIComponent(id)}/`;
const regionList = [...byRegion.values()].map(l => ({ id: l[0].regionId, name: l[0].region, country: l[0].country, list: l })).sort((x, y) => x.country.localeCompare(y.country) || x.name.localeCompare(y.name));

writeFileSync(new URL("index.html", outDir), doc({
  title: `Places to visit, eat and stay: ${regionList.length} regions | ${SITE_NAME}`,
  desc: `Browse ${places.length} places by region: tourist sites, picnic spots, snacks, hotels and resorts, each with a map location and directions.`,
  canonical: `${SITE}/place/`,
  body: `<h1>Places by region</h1><p><a class="btn" href="/#/places">Open the interactive map</a></p>
<ul class="list">${regionList.map(r => `<li><a href="${esc(regionUrl(r.id))}">${esc(r.name)}</a> <span class="tags">· ${esc(r.country)} · ${r.list.length} place${r.list.length === 1 ? "" : "s"}</span></li>`).join("")}</ul>`
}));

mkdirSync(new URL("../public/places-in/", import.meta.url), { recursive: true });
for (const r of regionList) {
  const groups = Object.entries(cats).map(([id, label]) => [label, r.list.filter(p => p.category === id)]).filter(([, l]) => l.length);
  const dir = new URL(`../public/places-in/${encodeURIComponent(r.id)}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("index.html", dir), doc({
    title: `Places in ${r.name}, ${r.country}: sites, food and hotels | ${SITE_NAME}`,
    desc: trunc(`${r.list.length} places in ${r.name}, ${r.country}: tourist sites, picnic spots, snacks, hotels and resorts, each with a map location and directions.`, 158),
    canonical: regionUrl(r.id),
    body: `<h1>Places in ${esc(r.name)}</h1><p class="tags">${esc(r.country)}</p><p><a class="btn" href="/#/places?region=${encodeURIComponent(r.id)}&amp;country=${encodeURIComponent(r.list[0].countryId)}">Open the interactive map</a></p>
${groups.map(([label, list]) => `<h2>${esc(label)}</h2><ul class="list">${list.sort((x, y) => x.name.localeCompare(y.name)).map(p => `<li><a href="${esc(pageUrl(p.id))}">${esc(p.name)}</a>${p.district ? ` <span class="tags">· ${esc(p.district)}</span>` : ""}</li>`).join("")}</ul>`).join("")}`
  }));
}

const urls = [[`${SITE}/`, today, "1.0", "weekly"], [`${SITE}/place/`, today, "0.8", "weekly"],
  ...regionList.map(r => [regionUrl(r.id), today, "0.7", "weekly"]),
  ...places.map(p => [pageUrl(p.id), p.updated ?? today, "0.6", "monthly"])];
writeFileSync(out("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, lastmod, priority, changefreq]) => `  <url>
    <loc>${esc(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("")}
</urlset>
`);

writeFileSync(out("llms.txt"), `# Explore Hack

> A free, offline-capable guide to places to visit, eat and stay in Manipur and other regions. It also has a song lyrics library and a trip packing checklist.

## What is here
- Places: tourist sites, picnic spots, snack spots, hotels and resorts, shown on a map with district boundaries, directions and distance from you.
- Songs: lyrics, filterable by language and artist (including Manipuri).
- Trip checklist: items to pack for a picnic, camping, trek, road trip or day trip.

## Notes for readers and tools
- Home page: ${SITE}/
- Every place has its own page: ${SITE}/place/ lists them all (also in ${SITE}/sitemap.xml).
- The interactive app is a single-page web app; its sections are reached from the home page.
- Map data is from OpenStreetMap contributors. District outlines are from geoBoundaries (simplified, not for legal or survey use).
- Details about places can be out of date. Check before you travel.
- Song lyrics are shared only with the rights holder's permission or when public domain. Takedown requests are listed on the About page.
`);

console.log(`SEO files written for ${SITE}: ${places.length} place pages (${fromDb} from the database), ${regionList.length} region pages`);
