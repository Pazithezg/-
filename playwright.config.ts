import { defineConfig, devices } from "@playwright/test";

const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests-node",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  use: {
    baseURL: process.env.CASEBOOK_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: "node ./node_modules/next/dist/bin/next dev",
        env: { NETWORK_GRAPH_SOURCE: "auto", PRISMA_LOG_LEVEL: "silent" },
        url: "http://localhost:3000/network",
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
