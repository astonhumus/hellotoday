// Writes public/robots.txt, public/sitemap.xml and public/llms.txt for the site's address.
// Runs automatically before `npm run build`. Set VITE_SITE_URL (e.g. https://example.com) when the address changes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

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

// The app's pages live behind "#/..." addresses, which search engines treat as the same page as "/".
// So the home page is the only address worth listing.
writeFileSync(out("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);

writeFileSync(out("llms.txt"), `# Explore India

> A free, offline-capable guide to places to visit, eat and stay in Manipur, India. It also has a song lyrics library and a trip packing checklist.

## What is here
- Places: tourist sites, picnic spots, snack spots, hotels and resorts, shown on a map with district boundaries, directions and distance from you.
- Songs: lyrics, filterable by language and artist (including Manipuri).
- Trip checklist: items to pack for a picnic, camping, trek, road trip or day trip.

## Notes for readers and tools
- Home page: ${SITE}/
- The app is a single-page web app; its sections are reached from the home page.
- Map data is from OpenStreetMap contributors. District outlines are from geoBoundaries (simplified, not for legal or survey use).
- Details about places can be out of date. Check before you travel.
- Song lyrics are shared only with the rights holder's permission or when public domain. Takedown requests are listed on the About page.
`);

console.log(`SEO files written for ${SITE}`);
