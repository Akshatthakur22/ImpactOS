import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/admin/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3200",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @sportdesk/admin exec next dev --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
