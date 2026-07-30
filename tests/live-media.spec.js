import { expect, test } from "@playwright/test";

async function confirmAdult(page) {
  const checkbox = page.getByRole("checkbox", {
    name: "Ich bestätige, dass ich volljährig (mindestens 18 Jahre alt) bin.", exact: true
  });
  if (!(await checkbox.isVisible().catch(() => false))) return;
  await checkbox.check();
  await page.getByRole("button", { name: "App öffnen", exact: true }).click();
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

test("the deployed app records, plays and deletes one real local MediaRecorder video", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/app", { waitUntil: "load" });
  await confirmAdult(page);
  await enableLocalVideo(page);

  await page.goto("/app/social-anxiety/video", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Einmalige Aufnahme starten", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Aufnahme läuft");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Aufnahme beenden", exact: true }).click();

  const recording = page.getByLabel("Lokale Aufnahme", { exact: true });
  await expect(recording).toBeVisible();
  await expect(page.getByLabel("Sichtbare Vorhersage vor Video", { exact: true })).toBeVisible();
  expect(await recording.evaluate(video => video.getAttribute("src")?.startsWith("blob:"))).toBe(true);

  await page.getByRole("button", { name: "Aufnahme sofort löschen", exact: true }).click();
  await expect(recording).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Aufnahme sofort gelöscht");
  expect(pageErrors).toEqual([]);
});

test("the complete deployed video-learning flow stores observations and deletes the media", async ({ page }) => {
  await page.goto("/app", { waitUntil: "load" });
  await confirmAdult(page);
  await enableLocalVideo(page);
  await page.goto("/app/social-anxiety/video", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Einmalige Aufnahme starten", exact: true }).click();
  await page.waitForTimeout(800);
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
