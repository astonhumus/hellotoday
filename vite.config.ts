import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The public address used in canonical links, share previews and structured data. Set VITE_SITE_URL when it changes.
const DEFAULT_SITE_URL = "https://hellotoday.astonhumus.workers.dev"; // keep in sync with scripts/build-seo.mjs

const seoHtml = (siteUrl: string, searchConsoleToken: string): Plugin => ({
  name: "seo-html",
  transformIndexHtml: {
    order: "pre",
    handler: html => html
      .replaceAll("__SITE_URL__", siteUrl)
      // Google Search Console "HTML tag" verification: set VITE_GSC_VERIFICATION to the code it gives you
      .replace("<!--GSC-->", searchConsoleToken ? `<meta name="google-site-verification" content="${searchConsoleToken}">` : "")
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  return {
  base: "./",
  plugins: [
    react(),
    seoHtml(siteUrl, env.VITE_GSC_VERIFICATION ?? ""),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      workbox: {
        // Everything the app needs (code, map borders, bundled places/songs/checklist) is cached on first visit.
        globPatterns: ["**/*.{js,css,html,svg,png,json,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [{
          // Map tiles you have looked at keep working offline. Cache-first, capped so it can't grow without limit.
          urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
          handler: "CacheFirst",
          options: {
            cacheName: "map-tiles",
            expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            cacheableResponse: { statuses: [0, 200] }
          }
        }]
      },
      manifest: {
        id: "./",
        name: "Explore India",
        short_name: "Explore",
        description: "Tourist places, food, stays and services by state, a song lyrics library and a trip checklist. Works offline.",
        lang: "en",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        theme_color: "#1f7a5a",
        background_color: "#f6f5f1",
        categories: ["travel", "navigation", "lifestyle"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
        ],
        shortcuts: [
          { name: "Home", url: "./", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Places", url: "./#/places", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Music", url: "./#/music", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Checklist", url: "./#/checklist", icons: [{ src: "icon-192.png", sizes: "192x192" }] }
        ]
      }
    })
  ]
};
});
