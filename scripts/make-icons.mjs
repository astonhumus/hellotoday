// Renders public/icon.svg to the PNG icons installable PWAs need. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../public/icon.svg", import.meta.url));
const out = f => new URL(`../public/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]])
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out(file));

// Maskable: artwork inside the central 80% on a solid background, so Android can crop it to any shape.
const inner = await sharp(svg, { density: 384 }).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#1f7a5a" } })
  .composite([{ input: inner, gravity: "center" }]).png().toFile(out("icon-maskable-512.png"));
console.log("icons written");
