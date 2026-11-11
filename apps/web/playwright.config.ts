import { defineConfig, devices } from "@playwright/test";

// The browser end-to-end test runs the real API (against the local Supabase
// stack, which `npm run db:start` must have started) and the real web pages
// through Vite. Ports differ from the dev defaults so a running `npm run dev`
// does not clash.
const API_PORT = 3101;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      // The machine's installed Chrome (also on GitHub's runners): no browser download.
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "npm run start -w @libras/api",
      cwd: "../..",
      env: { PORT: String(API_PORT) },
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w @libras/web",
      cwd: "../..",
      env: { WEB_PORT: String(WEB_PORT), LIBRAS_API_URL: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
