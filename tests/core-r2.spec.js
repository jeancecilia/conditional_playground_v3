import { expect, test } from "@playwright/test";

const APP_ROUTES = [
  "/app", "/app/settings",
  "/app/worry", "/app/worry/worry-sort", "/app/worry/worry-time", "/app/worry/training",
  "/app/worry/review", "/app/worry/problem-solving", "/app/worry/concrete-review",
  "/app/worry/practice", "/app/worry/relapse", "/app/worry/checking-support", "/app/worry/memory-support",
  "/app/panic", "/app/panic/plan", "/app/panic/panic-log", "/app/panic/debrief",
  "/app/panic/practice", "/app/panic/training", "/app/panic/progress",
  "/app/panic/interoceptive-practice", "/app/panic/situational-practice", "/app/panic/relapse", "/app/panic/measures",
  "/app/social-anxiety", "/app/social-anxiety/social-prep", "/app/social-anxiety/plan",
  "/app/social-anxiety/situations", "/app/social-anxiety/practice", "/app/social-anxiety/debrief",
  "/app/social-anxiety/progress", "/app/social-anxiety/training", "/app/social-anxiety/review",
  "/app/social-anxiety/support", "/app/social-anxiety/video", "/app/social-anxiety/report",
  "/app/social-anxiety/settings", "/app/social-anxiety/calendar", "/app/social-anxiety/measures",
  "/app/social-anxiety/spontaneous", "/app/social-anxiety/model", "/app/social-anxiety/comparison",
  "/app/social-anxiety/relapse"
];

function futureDateTime() {
  const date = new Date(Date.now() + 2 * 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function confirmAdult(page) {
  await page.locator("main h1").first().waitFor({ state: "visible", timeout: 20_000 });
  const gate = page.getByRole("heading", { level: 1, name: "Bestätigung vor dem Start", exact: true });
  const checkbox = page.getByRole("checkbox", {
    name: "Ich bestätige, dass ich volljährig (mindestens 18 Jahre alt) bin.", exact: true
  });
  if (!(await checkbox.isVisible().catch(() => false))) return;
  await checkbox.check();
  await page.getByRole("button", { name: "App öffnen", exact: true }).click();
  await expect(gate).toBeHidden({ timeout: 20_000 });
  await page.locator("main h1").first().waitFor({ state: "visible", timeout: 20_000 });
}

async function openApp(page, route) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
  expect(response?.status(), route).toBe(200);
  await confirmAdult(page);
  await expect(page.locator("main h1")).toHaveCount(1);
}

test("adult gate opens the live app and stays dismissed after reload", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Bestätigung vor dem Start", exact: true })).toBeVisible();
  await confirmAdult(page);
  await expect(page.getByRole("heading", { level: 1, name: "CBT Anxiety", exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Bestätigung vor dem Start", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "CBT Anxiety", exact: true })).toBeVisible();
});

test("the live structured problem-solving flow completes and saves", async ({ page }) => {
  await openApp(page, "/app/worry/problem-solving");
  await page.getByRole("textbox", { name: "Konkretes Problem", exact: true }).fill("Ein Termin muss verschoben werden");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Gewünschtes beobachtbares Ergebnis", { exact: true }).fill("Ein neuer Termin ist angefragt");
  await page.getByLabel("Welche Information fehlt tatsächlich?", { exact: true }).fill("Welche Ersatzzeiten möglich sind");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Zwei oder drei realistische Möglichkeiten", { exact: true }).fill("Dienstag oder Mittwoch");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Gewählter nächster Schritt", { exact: true }).fill("Zwei Zeiten im Kalender auswählen");
  await page.getByLabel("Prüfzeitpunkt", { exact: true }).fill(futureDateTime());
  await page.getByRole("button", { name: "Nächsten Schritt speichern", exact: true }).click();
  await expect(page.getByText("Nächster Schritt geplant", { exact: true })).toBeVisible();
});

test.describe("all deployed routes load cleanly after hydration", () => {
  for (const route of APP_ROUTES) {
    test(route, async ({ page }) => {
      const pageErrors = [];
      const failedRequests = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("requestfailed", request => {
        if (request.url().includes("cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev")) {
          failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
        }
      });
      await openApp(page, route);
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error|This page could not be found|ChunkLoadError/i);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route).toBeLessThanOrEqual(1);
      expect(pageErrors, route).toEqual([]);
      expect(failedRequests, route).toEqual([]);
    });
  }
});
