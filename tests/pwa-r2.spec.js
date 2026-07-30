import { expect, test } from "@playwright/test";

const LIVE_ORIGIN = "https://cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev";
const OFFLINE_ROUTES = [
  "/app", "/app/settings",
  "/app/worry", "/app/worry/worry-sort", "/app/worry/worry-time", "/app/worry/training",
  "/app/worry/review", "/app/worry/problem-solving", "/app/worry/concrete-review",
  "/app/worry/practice", "/app/worry/relapse", "/app/worry/checking-support", "/app/worry/memory-support",
  "/app/panic", "/app/panic/plan", "/app/panic/panic-log", "/app/m/panik/jetzt",
  "/app/panic/debrief", "/app/panic/practice", "/app/panic/training", "/app/panic/progress",
  "/app/panic/interoceptive-practice", "/app/panic/situational-practice", "/app/panic/relapse", "/app/panic/measures",
  "/app/social-anxiety", "/app/social-anxiety/social-prep", "/app/social-anxiety/plan",
  "/app/social-anxiety/situations", "/app/social-anxiety/practice", "/app/social-anxiety/debrief",
  "/app/social-anxiety/progress", "/app/social-anxiety/training", "/app/social-anxiety/review",
  "/app/social-anxiety/support", "/app/social-anxiety/video", "/app/social-anxiety/report",
  "/app/social-anxiety/settings", "/app/social-anxiety/calendar", "/app/social-anxiety/measures",
  "/app/social-anxiety/spontaneous", "/app/social-anxiety/model", "/app/social-anxiety/comparison",
  "/app/social-anxiety/relapse",
  "/app/m/soziale-angst", "/app/m/soziale-angst/jetzt", "/app/m/soziale-angst/planen",
  "/app/m/soziale-angst/nachbereiten", "/app/m/soziale-angst/fortschritt",
  "/app/m/soziale-angst/trainieren", "/app/m/soziale-angst/wochenreview",
  "/app/m/soziale-angst/begleitung", "/app/m/soziale-angst/video", "/app/m/soziale-angst/bericht",
  "/app/m/soziale-angst/einstellungen", "/app/m/soziale-angst/kalender", "/app/m/soziale-angst/messwerte"
];

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
}

async function waitForControl(page) {
  await expect.poll(
    () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state || null),
    { timeout: 120_000 }
  ).toBe("activated");
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);
}

async function waitForHydratedMain(page) {
  await expect.poll(
    () => page.locator("main").innerText().then(text => text.trim().length).catch(() => 0),
    { timeout: 15_000 }
  ).toBeGreaterThan(0);
}

test("live PWA is installable, all active routes render offline and IndexedDB writes persist", async ({ page, context }, testInfo) => {
  await page.goto("/app", { waitUntil: "load", timeout: 60_000 });
  await confirmAdult(page);
  await waitForControl(page);

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: "/app", start_url: "/app", display: "standalone" });
  expect(manifest.icons?.length).toBeGreaterThanOrEqual(3);
  expect(manifest.shortcuts?.length).toBeGreaterThanOrEqual(3);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const installability = await cdp.send("Page.getInstallabilityErrors");
  expect(installability.installabilityErrors).toEqual([]);

  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const staticName = names.find(name => name.startsWith("cbt-static-")) || null;
    const paths = staticName
      ? await caches.open(staticName).then(cache => cache.keys()).then(items => items.map(item => new URL(item.url).pathname))
      : [];
    return { names, staticName, paths };
  });
  expect(cacheState.staticName).toBeTruthy();
  const missing = OFFLINE_ROUTES.filter(route => !cacheState.paths.includes(route));
  expect(missing).toEqual([]);

  const failures = [];
  await context.setOffline(true);
  try {
    for (const route of OFFLINE_ROUTES) {
      try {
        const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20_000 });
        if (response && response.status() !== 200) throw new Error(`HTTP ${response.status()}`);
        await waitForHydratedMain(page);
        await expect(page.locator("body")).not.toContainText(/Du bist offline\. Bereits besuchte Seiten sind weiterhin verfügbar\./);
      } catch (error) {
        failures.push(`${route}: ${error.message}`);
      }
    }

    await page.goto("/app/worry/worry-sort", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForHydratedMain(page);
    const thought = page.getByLabel("Welches Thema gehst du erneut durch?", { exact: true });
    await expect(thought).toBeVisible();
    await thought.fill("Live-Offline-Testgedanke");
    const loop = page.getByRole("checkbox", {
      name: "Ich bemerke, dass ich dasselbe Thema erneut durchgehe.", exact: true
    });
    await loop.check();
    await page.waitForTimeout(750);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydratedMain(page);
    await expect(thought).toHaveValue("Live-Offline-Testgedanke");
    await expect(loop).toBeChecked();
  } finally {
    await context.setOffline(false);
  }

  await testInfo.attach("offline-audit", {
    body: JSON.stringify({ checkedRoutes: OFFLINE_ROUTES.length, cacheName: cacheState.staticName, missing, failures }, null, 2),
    contentType: "application/json"
  });
  expect(failures).toEqual([]);
});

test("live service worker emits deduplicated worry and panic reminders with correct deep links", async ({ page, context }) => {
  await context.grantPermissions(["notifications"], { origin: LIVE_ORIGIN });
  await page.goto("/app", { waitUntil: "load" });
  await confirmAdult(page);
  await waitForControl(page);
  expect(await page.evaluate(() => Notification.permission)).toBe("granted");

  const result = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active) throw new Error("Active service worker missing");

    registration.active.postMessage({ type: "SHOW_WORRY_REMINDER" });
    registration.active.postMessage({ type: "SHOW_WORRY_REMINDER" });
    registration.active.postMessage({ type: "SHOW_PANIC_PRACTICE_REMINDER", kind: "situational" });
    registration.active.postMessage({ type: "SHOW_PANIC_PRACTICE_REMINDER", kind: "situational" });

    async function waitFor(tag) {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const current = await registration.getNotifications({ tag });
        if (current.length) return current;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Notification ${tag} was not emitted`);
    }

    const worry = await waitFor("worry-time-due");
    const panic = await waitFor("panic-practice-situational");
    const snapshot = [...worry, ...panic].map(item => ({
      tag: item.tag, title: item.title, url: String(item.data?.url || "")
    }));
    [...worry, ...panic].forEach(item => item.close());
    return snapshot;
  });

  expect(result).toEqual([
    { tag: "worry-time-due", title: "Sorgenaufschub-Experiment ist fällig", url: "/app/worry/worry-time" },
    { tag: "panic-practice-situational", title: "Geplantes Panik-Experiment ist fällig", url: "/app/panic/situational-practice" }
  ]);
});
