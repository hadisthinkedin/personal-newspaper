import { defineConfig, devices } from "@playwright/test";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3187", trace: "on-first-retry" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3187",
    url: "http://127.0.0.1:3187",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: "desktop-and-responsive", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromePath } } }
  ]
});
