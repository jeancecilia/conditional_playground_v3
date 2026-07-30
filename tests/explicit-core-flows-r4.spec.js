import { expect, test } from "@playwright/test";

const LIVE_ORIGIN = "https://cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev";

function futureDateTime(hours = 2) {
  const date = new Date(Date.now() + hours * 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function confirmAdult(page) {
  await page.locator("main h1").first().waitFor({ state: "visible", timeout: 20_000 });
  const gate = page.getByRole("heading", {
    level: 1,
    name: "Bestätigung vor dem Start",
    exact: true
  });
  const checkbox = page.getByRole("checkbox", {
    name: "Ich bestätige, dass ich volljährig (mindestens 18 Jahre alt) bin.",
    exact: true
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

async function preparePanicPlan(page, bodyExerciseEligible = false) {
  await openApp(page, "/app/panic/plan");
  await page
    .getByLabel("Abgeklärt und als mein bekanntes Muster eingeordnet", { exact: true })
    .check();
  await page.getByLabel("Erste bemerkte Empfindung", { exact: true }).fill("Herzklopfen");
  await page.getByLabel("Bedrohliche Bedeutung", { exact: true }).fill("Kontrollverlust");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();

  await page
    .getByLabel("Konkrete befürchtete Katastrophe", { exact: true })
    .fill("Ich kann das Gespräch nicht fortsetzen");
  await page
    .getByLabel("Direkt beobachtbares Anzeichen", { exact: true })
    .fill("Ich breche das Gespräch ab");
  await page.getByLabel("Flucht- oder Kontrollimpuls", { exact: true }).fill("Den Raum verlassen");
  await page.getByLabel("Typisches Sicherheitsverhalten", { exact: true }).fill("Puls kontrollieren");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();

  await page.getByLabel("Eigentliche Tätigkeit", { exact: true }).fill("Im Gespräch bleiben");
  await page
    .getByLabel("Kurze sichtbare Rückkehrhandlung", { exact: true })
    .fill("Den nächsten Satz anhören");
  await page.getByLabel("Funktion der Rückkehrhandlung", { exact: true }).selectOption("return");
  await page
    .getByLabel("Kurze Haltung", { exact: true })
    .fill("Der Alarm darf da sein. Ich muss ihn nicht zuerst lösen.");

  if (bodyExerciseEligible) {
    await page.getByRole("button", { name: "Optional Körperübung", exact: true }).click();
    await page.getByLabel("Fachlich abgeklärt und für mich geeignet", { exact: true }).check();
    await page
      .getByLabel("Referenz auf die abgestimmte Übung", { exact: true })
      .fill("Fachlich abgestimmter Plan");
  }

  await page.getByRole("button", { name: "Panikplan speichern", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Dein persönlicher Plan ist vorbereitet.",
      exact: true
    })
  ).toBeVisible();
}

async function writeTestEntry(page, marker) {
  await page.evaluate(
    ({ value }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("cbt-pwa");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction("entries", "readwrite");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          transaction.objectStore("entries").add({
            path: "worry",
            flow: "worry-sort",
            createdAt: new Date(Date.now() - 60_000).toISOString(),
            updatedAt: new Date(Date.now() - 60_000).toISOString(),
            data: { marker: value }
          });
        };
      }),
    { value: marker }
  );
}

async function entryCount(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("cbt-pwa");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction("entries", "readonly");
          const count = transaction.objectStore("entries").count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => resolve(count.result);
        };
      })
  );
}

test("social quick start validates, survives reload and completes debrief", async ({ page }) => {
  await openApp(page, "/app/social-anxiety/social-prep");

  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator('[name="situation"]')).toBeFocused();
  await page.getByRole("button", { name: "Passt teilweise – bearbeiten", exact: true }).click();
  await page.getByLabel("Welche konkrete Situation beginnt gleich?", { exact: true }).fill("Teammeeting");
  await page.getByLabel("Was möchtest du sichtbar tun?", { exact: true }).fill("Im Meeting eine Frage stellen");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Was befürchtest du konkret?", { exact: true }).fill("Es entsteht eine peinliche Pause");
  await page
    .getByLabel("Woran wäre das direkt zu beobachten?", { exact: true })
    .fill("Fünf Sekunden lang antwortet niemand");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Welches Sicherheitsverhalten möchtest du heute etwas reduzieren?", { exact: true })
    .fill("Den Satz mehrfach vorformulieren");
  await page
    .getByLabel("Worauf richtest du deine Aufmerksamkeit nach außen?", { exact: true })
    .fill("Auf den Inhalt der Antwort");
  await page
    .getByRole("button", { name: "Situation beginnen und App schließen", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/social-anxiety\/practice\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Situation läuft", exact: true })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Situation läuft", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Situation beendet", exact: true }).click();
  await page.getByRole("link", { name: "Kurze Auswertung starten", exact: true }).click();
  await page.getByRole("button", { name: "Kurze Auswertung starten", exact: true }).click();
  await page
    .getByLabel("1. Was ist beobachtbar passiert?", { exact: true })
    .fill("Eine Antwort begann nach zwei Sekunden.");
  await page.getByRole("button", { name: /weniger ein als erwartet/i }).click();
  await page
    .getByLabel("3. Was ist der nächste kleine Schritt?", { exact: true })
    .fill("Im nächsten Meeting erneut eine Frage stellen");
  await page.getByRole("button", { name: "Kurze Auswertung speichern", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Kurze Auswertung gespeichert", exact: true })
  ).toBeVisible();
});

test("planned social experiment saves to the dashboard", async ({ page }) => {
  await openApp(page, "/app/social-anxiety/plan");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator('[name="situation"]')).toBeFocused();

  await page.getByLabel("Geplanter Start", { exact: true }).fill(futureDateTime());
  await page.getByLabel("Konkrete Situation", { exact: true }).fill("QA-Teammeeting");
  await page
    .getByLabel("Beobachtbare soziale Handlung", { exact: true })
    .fill("Eine Frage stellen");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Konkrete Befürchtung", { exact: true }).fill("Niemand antwortet");
  await page
    .getByLabel("Prüfbare Vorhersage", { exact: true })
    .fill("Fünf Sekunden antwortet niemand");
  await page
    .getByLabel("Beobachtbares Ergebniskriterium", { exact: true })
    .fill("Zeit bis zur ersten Antwort");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Ein Sicherheitsverhalten reduzieren", { exact: true })
    .fill("Nicht mehrfach vorformulieren");
  await page.getByLabel("Aufmerksamkeit nach außen", { exact: true }).fill("Inhalt der Antwort");
  await page.getByRole("button", { name: "Plan speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/social-anxiety\/?$/);
  await expect(page.getByText("QA-Teammeeting", { exact: true })).toBeVisible();
});

test("worry sort completes, persists and closes its check-in", async ({ page }) => {
  await openApp(page, "/app/worry/worry-sort");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator('[name="thought"]')).toBeFocused();
  await page
    .getByLabel("Welches Thema gehst du erneut durch?", { exact: true })
    .fill("Was, wenn der Termin nicht klappt?");
  await page
    .getByRole("checkbox", {
      name: "Ich bemerke, dass ich dasselbe Thema erneut durchgehe.",
      exact: true
    })
    .check();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByRole("button", { name: "Nein, es ist dieselbe Frage oder Unsicherheit", exact: true })
    .click();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: /hypothetische Möglichkeit/ }).click();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Wozu kehrst du jetzt zurück?", { exact: true }).fill("Das Dokument fertigstellen");
  await page.getByLabel("Erste sichtbare Bewegung", { exact: true }).fill("Das Dokument öffnen");
  await page.getByRole("button", { name: "Ja", exact: true }).click();
  await page.getByRole("button", { name: "Rückkehrhandlung öffnen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kurzen Check-in jetzt öffnen", exact: true })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Kurzen Check-in jetzt öffnen", exact: true }).click();
  await page
    .getByLabel("Was hast du tatsächlich begonnen oder fortgesetzt?", { exact: true })
    .fill("Ich habe zwei Sätze ergänzt");
  await page.getByLabel("War Handeln trotz Gedanke möglich?", { exact: true }).selectOption("yes");
  await page.getByRole("button", { name: "Funktions-Check-in speichern", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rückkehr ausgewertet", exact: true })).toBeVisible();
});

test("structured problem solving validates and saves a bounded next step", async ({ page }) => {
  await openApp(page, "/app/worry/problem-solving");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator('[name="problem"]')).toBeFocused();
  await page
    .getByRole("textbox", { name: "Konkretes Problem", exact: true })
    .fill("Ein Termin muss verschoben werden");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Gewünschtes beobachtbares Ergebnis", { exact: true })
    .fill("Ein neuer Termin ist angefragt");
  await page
    .getByLabel("Welche Information fehlt tatsächlich?", { exact: true })
    .fill("Welche Ersatzzeiten möglich sind");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Zwei oder drei realistische Möglichkeiten", { exact: true })
    .fill("Dienstag oder Mittwoch");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Gewählter nächster Schritt", { exact: true })
    .fill("Zwei Zeiten im Kalender auswählen");
  await page.getByLabel("Prüfzeitpunkt", { exact: true }).fill(futureDateTime());
  await page.getByRole("button", { name: "Nächsten Schritt speichern", exact: true }).click();
  await expect(page.getByText("Nächster Schritt geplant", { exact: true })).toBeVisible();
});

test("concrete review closes with only the three core fields", async ({ page }) => {
  await openApp(page, "/app/worry/concrete-review");
  await page.getByRole("button", { name: "Rückblick schließen", exact: true }).click();
  await expect(page.locator('[name="event"]')).toBeFocused();
  await page
    .getByLabel("1. Was ist konkret passiert?", { exact: true })
    .fill("Eine Datei wurde später gesendet");
  await page
    .getByLabel("2. Was ist direkt beobachtbar?", { exact: true })
    .fill("Versand war Dienstag");
  await page
    .getByLabel("3. Welche nächste Handlung ist möglich?", { exact: true })
    .fill("Eine sachliche Nachricht senden");
  await page.getByRole("button", { name: "Rückblick schließen", exact: true }).click();
  await expect(page.getByText("Konkreter Rückblick abgeschlossen", { exact: true })).toBeVisible();
});

test("uncertainty experiment plans, starts and stores observable learning", async ({ page }) => {
  await openApp(page, "/app/worry/practice");
  await page
    .getByLabel("Unsichere Alltagssituation", { exact: true })
    .fill("E-Mail ohne mehrfaches Prüfen senden");
  await page
    .getByLabel("Befürchtete Konsequenz", { exact: true })
    .fill("Ein Fehler bleibt enthalten");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Bisheriges Prüf-, Vorbereitungs- oder Rückversicherungsverhalten", { exact: true })
    .fill("Mehrfach lesen");
  await page
    .getByLabel("Was wird diesmal konkret reduziert?", { exact: true })
    .fill("Nur einmal lesen");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Geplante sichtbare Handlung", { exact: true })
    .fill("E-Mail nach einmaligem Lesen senden");
  await page
    .getByLabel("Beobachtbares Ergebniskriterium", { exact: true })
    .fill("Ob eine Korrektur nötig wird");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Geplanter Zeitpunkt", { exact: true }).fill(futureDateTime());
  await page.getByRole("button", { name: "Für später planen", exact: true }).click();
  await page.getByRole("button", { name: "Experiment starten", exact: true }).click();
  await page.getByRole("button", { name: "Durchgeführt", exact: true }).click();
  await page
    .getByLabel("Was war direkt beobachtbar?", { exact: true })
    .fill("Die E-Mail wurde versendet");
  await page
    .getByLabel("Was wurde über Unsicherheit, Prüfen oder Handeln gelernt?", { exact: true })
    .fill("Einmaliges Lesen reichte");
  await page.getByRole("button", { name: "Experiment speichern", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Unsicherheitsexperiment dokumentiert",
      exact: true
    })
  ).toBeVisible();
});

test("panic plan powers the acute flow across reload and saves its debrief", async ({ page }) => {
  await preparePanicPlan(page);
  await page.goto("/app/panic/panic-log", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Ja, ich kann kurz hinschauen", exact: true }).click();
  await page.getByRole("button", { name: "Ja, mein bekanntes Muster", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zur Tätigkeit zurückkehren", exact: true })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Zur Tätigkeit zurückkehren", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zur Tätigkeit zurückkehren", exact: true }).click();
  await page.getByRole("link", { name: "Kurze Auswertung jetzt", exact: true }).click();
  await page.getByLabel("1. Was hattest du befürchtet?", { exact: true }).fill("Ich breche zusammen");
  await page
    .getByLabel("2. Was ist direkt beobachtbar passiert?", { exact: true })
    .fill("Ich blieb ansprechbar");
  await page
    .getByLabel("3. Was hast du tatsächlich getan?", { exact: true })
    .fill("Ich blieb teilweise im Gespräch");
  await page.getByRole("button", { name: "Teilweise durchgeführt", exact: true }).click();
  await page
    .getByRole("button", { name: "Ich handelte anders, obwohl Alarm vorhanden war.", exact: true })
    .click();
  await page.getByRole("button", { name: "Kurze Auswertung speichern", exact: true }).click();
  await expect(page.getByText(/Umsetzung:/)).toBeVisible();
});

test("panic flow stops before starting when device attention is unavailable", async ({ page }) => {
  await preparePanicPlan(page);
  await page.goto("/app/panic/panic-log", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Nein, Gerät jetzt beiseitelegen", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Gerät beiseitelegen", exact: true })
  ).toBeVisible();
});

test("situational panic experiment plans, survives reload and records its outcome", async ({ page, context }) => {
  await context.grantPermissions(["notifications"], { origin: LIVE_ORIGIN });
  await preparePanicPlan(page, true);
  await page.goto("/app/panic/situational-practice", { waitUntil: "domcontentloaded" });
  await page
    .getByLabel("Vermiedene oder abgesicherte Situation", { exact: true })
    .fill("An der Supermarktkasse warten");
  await page
    .getByLabel("Konkrete funktionale Handlung", { exact: true })
    .fill("Bis zum Bezahlen bleiben");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Konkrete Befürchtung", { exact: true }).fill("Ich muss die Schlange verlassen");
  await page
    .getByLabel("Direkt beobachtbares Ergebniskriterium", { exact: true })
    .fill("Ich bezahle den Einkauf");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByLabel("Ein Sicherheitsverhalten reduzieren", { exact: true })
    .fill("Ausgang beobachten");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Geplanter Start", { exact: true }).fill(futureDateTime());
  await page.getByRole("button", { name: "Für später planen", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Experiment starten", exact: true }).click();
  await page
    .getByRole("button", { name: "Handlung durchgeführt – Ergebnis festhalten", exact: true })
    .click();
  await page
    .getByLabel("Was ist direkt beobachtbar passiert?", { exact: true })
    .fill("Ich blieb bis zum Bezahlen");
  await page.getByRole("button", { name: "Die Katastrophe trat nicht ein.", exact: true }).click();
  await page.getByRole("button", { name: "Ausgang speichern", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Experiment dokumentiert", exact: true })
  ).toBeVisible();
});

test("local JSON export downloads successfully", async ({ page }) => {
  await openApp(page, "/app/settings");
  await writeTestEntry(page, "LOCAL-EXPORT-CHECK");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Daten exportieren", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^cbt-anxiety-export-\d{4}-\d{2}-\d{2}\.json$/);
  expect(await download.failure()).toBeNull();
  await expect(page.getByRole("status").filter({ hasText: "Lokaler Export erstellt" })).toBeVisible();
});

test("optional encrypted cloud backup supports activation, pause, restore and deletion", async ({ page }) => {
  let remoteBody = "";
  await page.route("**/api/cloud-backup/**", async route => {
    const method = route.request().method();
    if (method === "PUT") {
      remoteBody = route.request().postData() || "";
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"saved":true}' });
    } else if (method === "GET" && remoteBody) {
      await route.fulfill({ status: 200, contentType: "application/json", body: remoteBody });
    } else if (method === "DELETE") {
      remoteBody = "";
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"deleted":true}' });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
    }
  });

  await openApp(page, "/app/settings");
  await writeTestEntry(page, "EXISTING-PRIVATE-TEXT");
  await page
    .getByRole("button", { name: "Cloud-Sicherung freiwillig aktivieren", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Cloud-Sicherung aktiviert" })).toBeVisible();
  expect(remoteBody).not.toContain("EXISTING-PRIVATE-TEXT");
  const code = await page.locator("code").innerText();
  expect(code.length).toBeGreaterThan(20);

  await page.getByRole("button", { name: "Cloud-Sicherung pausieren", exact: true }).click();
  await expect(page.getByText("Sicherung pausiert", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cloud-Sicherung fortsetzen", exact: true }).click();
  await expect(page.getByText("Sicherung aktiv", { exact: true })).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Nur lokale Übungsdaten löschen", exact: true }).click();
  await expect.poll(() => entryCount(page)).toBe(0);
  await page.getByLabel("Wiederherstellungscode", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sicherung wiederherstellen", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "wiederhergestellt" })).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Nur Cloud-Daten löschen", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cloud-Daten wurden gelöscht" })).toBeVisible();
  expect(remoteBody).toBe("");
});
