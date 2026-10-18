import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Pawse player. `npm run dev` serves it at
// http://localhost:5173 with hot reload; `npm run build` emits static files to
// dist/ for free hosting (GitHub Pages / Vercel).
export default defineConfig({
  plugins: [react()],
  // fs.allow: the sync math lives in ../extension/sync-core.js (shared).
  server: { port: 5173, fs: { allow: [".."] } },
});
