import { defineConfig, devices } from "@playwright/test";

// Runs against the Docker stack: docker compose up -d --build
// Tests share one chain and one set of accounts, so they run one at a time.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: process.env.CI ? 120_000 : 60_000,
  // CI has no graphics card, and compiling a flower's shaders there takes seconds.
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
    baseURL: "http://localhost:8080",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
