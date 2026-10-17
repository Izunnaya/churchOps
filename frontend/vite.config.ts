import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // The shell and its assets only. No church-owned data is precached here:
      // the brief allows offline work for attendance alone, and that queue is a
      // later slice with its own storage.
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico}"],
      },
      // Product-level, never church-level. Church name, mark and accents come
      // from the signed-in church's settings, so nothing here names a church.
      manifest: {
        name: "Church Operations",
        short_name: "Church Ops",
        description: "Offerings, attendance and reports for your church.",
        start_url: "/",
        display: "standalone",
        // No colours and no icon here on purpose. A church's mark and accents
        // are its own settings, and the crest accents belong to TBC alone, so
        // the installed shell stays unbranded rather than carrying one church's
        // colour to every other church. Every hex in this app lives in the
        // theme block of src/index.css.
        icons: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
