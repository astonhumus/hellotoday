// Draws the 1200x630 picture shown when the site is shared (WhatsApp, Facebook, X, Google). Run: node scripts/make-og.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const icon = await sharp(readFileSync(new URL("../public/icon.svg", import.meta.url)), { density: 384 }).resize(220, 220).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="0" cy="0" r="1.4"><stop offset="0" stop-color="#2aa377"/><stop offset="0.55" stop-color="#167150"/><stop offset="1" stop-color="#0f4f39"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1080" cy="80" r="260" fill="#ffffff" opacity="0.06"/>
  <circle cx="1180" cy="600" r="200" fill="#ffffff" opacity="0.06"/>
  <text x="80" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#ffffff" opacity="0.85" letter-spacing="4">EXPLORE</text>
  <text x="76" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="112" font-weight="700" fill="#ffffff">Manipur</text>
  <text x="80" y="490" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#ffffff" opacity="0.92">Places to visit, eat and stay. Song lyrics.</text>
  <text x="80" y="535" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#ffffff" opacity="0.92">A packing list for the trip. Works offline.</text>
</svg>`;
await sharp(Buffer.from(svg)).composite([{ input: icon, left: 80, top: 70 }]).png({ compressionLevel: 9, palette: true, quality: 90 })
  .toFile(new URL("../public/og-image.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
console.log("og-image.png written");
