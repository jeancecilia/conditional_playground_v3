import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }]
  ],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: "https://cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop",
      testMatch: "core-r2.spec.js",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block", contextOptions: { reducedMotion: "reduce" } }
    },
    {
      name: "mobile",
      testMatch: "core-r2.spec.js",
      use: { ...devices["Pixel 5"], serviceWorkers: "block", contextOptions: { reducedMotion: "reduce" } }
    },
    {
      name: "pwa",
      testMatch: "pwa-r2.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "allow",
        permissions: ["notifications"],
        headless: false,
        launchOptions: { args: ["--window-position=-32000,-32000"] }
      }
    },
    {
      name: "media",
      testMatch: "media-r2.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "block",
        permissions: ["camera", "microphone"],
        launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }
      }
    }
  ]
});
