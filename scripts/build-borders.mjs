// Usage: node scripts/build-borders.mjs <countries.geojson> <admin1.geojson>
// Natural Earth is public domain. Produces small border files in public/data/.
import fs from "node:fs";
const [countriesPath, admin1Path] = process.argv.slice(2);
const round = c => typeof c[0] === "number" ? [+c[0].toFixed(3), +c[1].toFixed(3)] : c.map(round);
const slim = (features, props) => ({
  type: "FeatureCollection",
  features: features.map(f => ({
    type: "Feature",
    properties: Object.fromEntries(Object.entries(props(f.properties))),
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) }
  }))
});
const countries = JSON.parse(fs.readFileSync(countriesPath, "utf8"));
fs.writeFileSync("public/data/world.json", JSON.stringify(slim(countries.features, p => ({ name: p.NAME }))));

const admin1 = JSON.parse(fs.readFileSync(admin1Path, "utf8"));
const india = admin1.features.filter(f => f.properties.iso_a2 === "IN");
fs.writeFileSync("public/data/india-states.json", JSON.stringify(slim(india, p => ({ name: p.name }))));
console.log("india states:", india.map(f => f.properties.name).sort().join(", "));
