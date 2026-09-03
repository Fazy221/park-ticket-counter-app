import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Static build served directly by PocketBase (see README: "static Vite +
// React + Tailwind + shadcn/ui build, served directly out of PocketBase,
// installed as a PWA on the laptop"). Relative base so the built
// index.html works regardless of what path PocketBase serves pb_public
// from.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
