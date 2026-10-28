import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      workbox: {
        // Everything the app needs (code, map borders, bundled places/songs/checklist) is cached on first visit.
        globPatterns: ["**/*.{js,css,html,svg,png,json,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true
      },
      manifest: {
        id: "./",
        name: "Explore India",
        short_name: "Explore",
        description: "Tourist places, food, stays and services by state, a song lyrics library and a trip checklist. Works offline.",
        lang: "en",
        start_url: "./#/places",
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
          { name: "Places", url: "./#/places", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Music", url: "./#/music", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Checklist", url: "./#/checklist", icons: [{ src: "icon-192.png", sizes: "192x192" }] }
        ]
      }
    })
  ]
});
