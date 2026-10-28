// One-off: pull the hardcoded PLACES array out of the legacy page into JSON data files.
import fs from "node:fs";
const html = fs.readFileSync("legacy/index.legacy.html", "utf8");
const src = html.match(/const PLACES = (\[[\s\S]*?\n\]);/)[1];
const PLACES = new Function(`return ${src}`)();
const map = { site: "tourist-site", picnic: "picnic", hotel: "hotel", resort: "resort", snacks: "snacks" };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const seen = new Map();
const places = PLACES.map(p => {
  let id = slug(p.name), n = seen.get(id) ?? 0;
  seen.set(id, n + 1);
  if (n) id += "-" + (n + 1);
  const out = { id, name: p.name, category: map[p.type], district: p.district, lat: p.lat, lng: p.lng };
  if (p.desc) out.desc = p.desc;
  if (p.phone) out.phone = p.phone;
  if (p.website) out.website = p.website;
  if (p.approx) out.approx = true;
  return out;
});
fs.writeFileSync("public/data/manipur/places.json", JSON.stringify(places, null, 2));
console.log(places.length, "places");
