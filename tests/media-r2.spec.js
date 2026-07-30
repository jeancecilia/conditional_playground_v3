import { expect, test } from "@playwright/test";

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

async function enableLocalVideo(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("cbt-pwa");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("settings", "readwrite");
      transaction.objectStore("settings").put({
        key: "social-settings",
        value: {
          version: 1,
          voiceInput: false,
          weeklyReview: true,
          calendarExport: false,
          companionPlan: false,
          localVideo: true,
          localSummary: true
        }
      });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function openVideoTool(page) {
  await page.goto("/app", { waitUntil: "load", timeout: 60_000 });
  await confirmAdult(page);
  await enableLocalVideo(page);
  await page.goto("/app/social-anxiety/video", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("main h1").first().waitFor({ state: "visible", timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Einmalige Aufnahme starten", exact: true })).toBeVisible();
}

test("deployed MediaRecorder creates a local blob and immediate deletion removes it", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await openVideoTool(page);

  await page.getByRole("button", { name: "Einmalige Aufnahme starten", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Aufnahme läuft");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Aufnahme beenden", exact: true }).click();

  const recording = page.getByLabel("Lokale Aufnahme", { exact: true });
  await expect(recording).toBeVisible();
  expect(await recording.evaluate(video => video.getAttribute("src")?.startsWith("blob:"))).toBe(true);
  await page.getByRole("button", { name: "Aufnahme sofort löschen", exact: true }).click();
  await expect(recording).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Aufnahme sofort gelöscht");
  expect(pageErrors).toEqual([]);
});

test("complete deployed video-learning flow stores observations and deletes its video", async ({ page }) => {
  await openVideoTool(page);
  await page.getByRole("button", { name: "Einmalige Aufnahme starten", exact: true }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Aufnahme beenden", exact: true }).click();
  await page.getByLabel("Sichtbare Vorhersage vor Video", { exact: true }).fill("Ich wirke angespannt");
  await page.getByRole("button", { name: "Ohne Ton ansehen", exact: true }).click();
  await page.getByLabel("Beobachtung ohne Ton", { exact: true }).fill("Meine Haltung blieb aufrecht");
  await page.getByRole("button", { name: "Jetzt mit Ton ansehen", exact: true }).click();
  await page.getByLabel("Beobachtung mit Ton", { exact: true }).fill("Meine Stimme war verständlich");
  await page.getByLabel("Schriftliches Lernergebnis", { exact: true }).fill("Es war weniger auffällig als erwartet");
  await page.getByRole("button", { name: "Lernen speichern und Video löschen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Video wurde gelöscht");
  await expect(page.getByLabel("Lokale Aufnahme", { exact: true })).toHaveCount(0);
});
