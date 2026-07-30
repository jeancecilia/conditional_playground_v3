import { defineConfig, devices } from "@playwright/test";

const baseURL = "https://cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }]
  ],
  outputDir: "test-results/artifacts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: "live-core.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "block",
        permissions: ["notifications", "camera", "microphone"],
        contextOptions: { reducedMotion: "reduce" }
      }
    },
    {
      name: "mobile-chromium",
      testMatch: "live-core.spec.js",
      use: {
        ...devices["Pixel 5"],
        serviceWorkers: "block",
        permissions: ["notifications", "camera", "microphone"],
        contextOptions: { reducedMotion: "reduce" }
      }
    },
    {
      name: "pwa-chromium",
      testMatch: "live-pwa.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "allow",
        permissions: ["notifications"]
      }
    },
    {
      name: "media-chromium",
      testMatch: "live-media.spec.js",
      use: {
        ...devices["Desktop Chrome"],
        serviceWorkers: "block",
        permissions: ["camera", "microphone"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
        }
      }
    }
  ]
});
