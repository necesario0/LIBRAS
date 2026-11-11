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
});
