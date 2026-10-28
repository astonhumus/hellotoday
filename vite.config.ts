import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      workbox: { globPatterns: ["**/*.{js,css,html,svg,json}"] },
      manifest: {
        name: "Explore India",
        short_name: "Explore",
        description: "Tourist places, food, stays and services by state, plus a song lyrics library.",
        theme_color: "#1f7a5a",
        background_color: "#f6f5f1",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      }
    })
  ]
});
