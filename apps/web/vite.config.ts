import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The pages call the API under /api. In development and in the end-to-end
// test, Vite forwards /api to the API, so the browser sees one origin and no
// cross-origin rules are involved.
const apiTarget = process.env.LIBRAS_API_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    host: "127.0.0.1",
    strictPort: true,
    proxy: { "/api": { target: apiTarget, rewrite: (path) => path.replace(/^\/api/, "") } },
  },
  build: {
    // Two pages, each its own HTML file, so a static host needs no rewrite rule:
    // the desk page at / and the phone scanner page at /scan.html.
    rollupOptions: { input: { desk: resolve(import.meta.dirname, "index.html"), scan: resolve(import.meta.dirname, "scan.html") } },
  },
});
