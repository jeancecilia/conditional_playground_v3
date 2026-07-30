import { expect, test } from "@playwright/test";

const APP_ROUTES = [
  "/app", "/app/settings",
  "/app/worry", "/app/worry/worry-sort", "/app/worry/worry-time", "/app/worry/training",
  "/app/worry/review", "/app/worry/problem-solving", "/app/worry/concrete-review",
  "/app/worry/practice", "/app/worry/relapse", "/app/worry/checking-support",
  "/app/worry/memory-support",
  "/app/panic", "/app/panic/plan", "/app/panic/panic-log", "/app/panic/debrief",
  "/app/panic/practice", "/app/panic/training", "/app/panic/progress",
  "/app/panic/interoceptive-practice", "/app/panic/situational-practice",
  "/app/panic/relapse", "/app/panic/measures",
  "/app/social-anxiety", "/app/social-anxiety/social-prep", "/app/social-anxiety/plan",
  "/app/social-anxiety/situations", "/app/social-anxiety/practice",
  "/app/social-anxiety/debrief", "/app/social-anxiety/progress",
  "/app/social-anxiety/training", "/app/social-anxiety/review",
  "/app/social-anxiety/support", "/app/social-anxiety/video",
  "/app/social-anxiety/report", "/app/social-anxiety/settings",
  "/app/social-anxiety/calendar", "/app/social-anxiety/measures",
  "/app/social-anxiety/spontaneous", "/app/social-anxiety/model",
  "/app/social-anxiety/comparison", "/app/social-anxiety/relapse"
];

const PUBLIC_ROUTES = [
  "/", "/angst/gruebeln", "/angst/panik", "/angst/soziale-angst",
  "/datenschutz", "/impressum", "/sicherheit", "/wissenschaft"
];

function futureDateTime(hours = 2) {
  const date = new Date(Date.now() + hours * 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function confirmAdult(page) {
  const checkbox = page.getByRole("checkbox", {
    name: "Ich bestätige, dass ich volljährig (mindestens 18 Jahre alt) bin.", exact: true
  });
  if (!(await checkbox.isVisible().catch(() => false))) return;
  await checkbox.check();
  await page.getByRole("button", { name: "App öffnen", exact: true }).click();
  await expect(checkbox).toBeHidden({ timeout: 20_000 });
}

async function openApp(page, route) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
  expect(response?.status(), route).toBe(200);
  await confirmAdult(page);
  await expect(page.locator("main")).not.toBeEmpty();
}

async function expectHealthyPage(page, route, pageErrors, requestFailures) {
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(
    /Application error|Internal Server Error|This page could not be found|ChunkLoadError/i
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${route}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(pageErrors, `${route}: uncaught browser errors`).toEqual([]);
  expect(requestFailures, `${route}: failed same-origin requests`).toEqual([]);
}

function collectRuntimeErrors(page) {
  const pageErrors = [];
  const requestFailures = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => {
    if (request.url().includes("cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev")) {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText}`);
    }
  });
  page.on("dialog", dialog => void dialog.dismiss());
  return { pageErrors, requestFailures };
}

async function fillVisibleControls(page) {
  const dateTime = futureDateTime();
  const fields = page.locator("input:visible, textarea:visible");
  for (let i = 0; i < await fields.count(); i += 1) {
    const field = fields.nth(i);
    if (!(await field.isEnabled().catch(() => false))) continue;
    if (await field.getAttribute("readonly")) continue;
    const type = (await field.getAttribute("type")) || "text";
    if (["hidden", "file", "checkbox", "radio", "button", "submit", "reset"].includes(type)) continue;
    if ((await field.inputValue().catch(() => "")).trim()) continue;
    try {
      if (type === "datetime-local") await field.fill(dateTime);
      else if (type === "date") await field.fill(dateTime.slice(0, 10));
      else if (type === "time") await field.fill("12:00");
      else if (type === "number" || type === "range") {
        const min = Number((await field.getAttribute("min")) || 1);
        const max = Number((await field.getAttribute("max")) || Math.max(min, 10));
        await field.fill(String(Math.max(min, Math.min(max, Math.round((min + max) / 2)))));
      } else if (type === "email") await field.fill("live-qa@example.test");
      else await field.fill("Live-QA: konkrete beobachtbare Testsituation");
    } catch {}
  }

  const selects = page.locator("select:visible");
  for (let i = 0; i < await selects.count(); i += 1) {
    const select = selects.nth(i);
    if (!(await select.isEnabled().catch(() => false))) continue;
    if (await select.inputValue().catch(() => "")) continue;
    const options = select.locator("option:not([disabled])");
    for (let j = 0; j < await options.count(); j += 1) {
      const value = await options.nth(j).getAttribute("value");
      if (value) { await select.selectOption(value).catch(() => {}); break; }
    }
  }

  const checks = page.locator('input[type="checkbox"]:visible');
  for (let i = 0; i < await checks.count(); i += 1) {
    const item = checks.nth(i);
    if (await item.isEnabled().catch(() => false)) await item.check().catch(() => {});
  }

  const radios = page.locator('input[type="radio"]:visible');
  const groups = new Set();
  for (let i = 0; i < await radios.count(); i += 1) {
    const item = radios.nth(i);
    const name = (await item.getAttribute("name")) || String(i);
    if (groups.has(name)) continue;
    groups.add(name);
    if (await item.isEnabled().catch(() => false)) await item.check().catch(() => {});
  }
}

const SAFE = /weiter|starten|beginnen|öffnen|fortsetzen|speichern|abschließen|auswerten|dokumentieren|hinzufügen|aktivieren|durchgeführt|beendet|passt|selbst formulieren|teilweise|ja,|^ja$|nächster schritt|rückkehrhandlung|planen/i;
const BLOCKED = /löschen|zurücksetzen|beiseitelegen|abbrechen|verwerfen|app schließen|notruf|support kontaktieren|cloud/i;

async function walkVisibleFlow(page, maxSteps = 8) {
  const clicked = [];
  for (let step = 0; step < maxSteps; step += 1) {
    await fillVisibleControls(page);
    const details = page.locator("details:not([open]) > summary:visible");
    if (await details.count()) await details.first().click().catch(() => {});

    const buttons = page.getByRole("button");
    let chosen = null;
    for (let i = 0; i < await buttons.count(); i += 1) {
      const button = buttons.nth(i);
      if (!(await button.isVisible().catch(() => false))) continue;
      if (!(await button.isEnabled().catch(() => false))) continue;
      const name = (await button.innerText().catch(() => "")).trim();
      if (!name || BLOCKED.test(name) || !SAFE.test(name)) continue;
      chosen = { button, name };
      break;
    }
    if (!chosen) break;
    await chosen.button.click().catch(() => {});
    clicked.push(chosen.name);
    await page.waitForTimeout(250);
    await confirmAdult(page);
  }
  return clicked;
}

async function preparePanicPlan(page) {
  await openApp(page, "/app/panic/plan");
  await page.getByLabel("Abgeklärt und als mein bekanntes Muster eingeordnet", { exact: true }).check();
  await page.getByLabel("Erste bemerkte Empfindung", { exact: true }).fill("Herzklopfen");
  await page.getByLabel("Bedrohliche Bedeutung", { exact: true }).fill("Kontrollverlust");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Konkrete befürchtete Katastrophe", { exact: true }).fill("Ich kann das Gespräch nicht fortsetzen");
  await page.getByLabel("Direkt beobachtbares Anzeichen", { exact: true }).fill("Ich breche das Gespräch ab");
  await page.getByLabel("Flucht- oder Kontrollimpuls", { exact: true }).fill("Den Raum verlassen");
  await page.getByLabel("Typisches Sicherheitsverhalten", { exact: true }).fill("Puls kontrollieren");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByLabel("Eigentliche Tätigkeit", { exact: true }).fill("Im Gespräch bleiben");
  await page.getByLabel("Kurze sichtbare Rückkehrhandlung", { exact: true }).fill("Den nächsten Satz anhören");
  await page.getByLabel("Funktion der Rückkehrhandlung", { exact: true }).selectOption("return");
  await page.getByLabel("Kurze Haltung", { exact: true }).fill("Der Alarm darf da sein. Ich muss ihn nicht zuerst lösen.");
  await page.getByRole("button", { name: "Panikplan speichern", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dein persönlicher Plan ist vorbereitet.", exact: true })).toBeVisible();
}

test.describe("public deployment and complete core user journeys", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public page ${route} loads live`, async ({ page }) => {
      const runtime = collectRuntimeErrors(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(runtime.pageErrors).toEqual([]);
      expect(runtime.requestFailures).toEqual([]);
    });
  }

  test("adult gate persists across reload", async ({ page }) => {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bestätigung vor dem Start", exact: true })).toBeVisible();
    await confirmAdult(page);
    await expect(page.getByRole("heading", { level: 1, name: "CBT Anxiety", exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Bestätigung vor dem Start", exact: true })).toHaveCount(0);
  });

  test("social quick-start completes through debrief after reload", async ({ page }) => {
    await openApp(page, "/app/social-anxiety/social-prep");
    await page.getByLabel("Welche konkrete Situation beginnt gleich?", { exact: true }).fill("Teammeeting");
    await page.getByLabel("Was möchtest du sichtbar tun?", { exact: true }).fill("Eine Frage stellen");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Was befürchtest du konkret?", { exact: true }).fill("Es entsteht eine peinliche Pause");
    await page.getByLabel("Woran wäre das direkt zu beobachten?", { exact: true }).fill("Fünf Sekunden antwortet niemand");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Welches Sicherheitsverhalten möchtest du heute etwas reduzieren?", { exact: true }).fill("Mehrfach vorformulieren");
    await page.getByLabel("Worauf richtest du deine Aufmerksamkeit nach außen?", { exact: true }).fill("Auf den Inhalt der Antwort");
    await page.getByRole("button", { name: "Situation beginnen und App schließen", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Situation läuft", exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Situation beendet", exact: true }).click();
    await page.getByRole("link", { name: "Kurze Auswertung starten", exact: true }).click();
    await page.getByRole("button", { name: "Kurze Auswertung starten", exact: true }).click();
    await page.getByLabel("1. Was ist beobachtbar passiert?", { exact: true }).fill("Eine Antwort begann nach zwei Sekunden");
    await page.getByRole("button", { name: /weniger ein als erwartet/i }).click();
    await page.getByLabel("3. Was ist der nächste kleine Schritt?", { exact: true }).fill("Nächstes Mal erneut eine Frage stellen");
    await page.getByRole("button", { name: "Kurze Auswertung speichern", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Kurze Auswertung gespeichert", exact: true })).toBeVisible();
  });

  test("planned social experiment saves to dashboard", async ({ page }) => {
    await openApp(page, "/app/social-anxiety/plan");
    await page.getByLabel("Geplanter Start", { exact: true }).fill(futureDateTime());
    await page.getByLabel("Konkrete Situation", { exact: true }).fill("QA-Teammeeting");
    await page.getByLabel("Beobachtbare soziale Handlung", { exact: true }).fill("Eine Frage stellen");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Konkrete Befürchtung", { exact: true }).fill("Niemand antwortet");
    await page.getByLabel("Prüfbare Vorhersage", { exact: true }).fill("Fünf Sekunden antwortet niemand");
    await page.getByLabel("Beobachtbares Ergebniskriterium", { exact: true }).fill("Zeit bis zur ersten Antwort");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Ein Sicherheitsverhalten reduzieren", { exact: true }).fill("Nicht mehrfach vorformulieren");
    await page.getByLabel("Aufmerksamkeit nach außen", { exact: true }).fill("Inhalt der Antwort");
    await page.getByRole("button", { name: "Plan speichern", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/social-anxiety\/?$/);
    await expect(page.getByText("QA-Teammeeting", { exact: true })).toBeVisible();
  });

  test("worry sort completes, persists and closes check-in", async ({ page }) => {
    await openApp(page, "/app/worry/worry-sort");
    await page.getByLabel("Welches Thema gehst du erneut durch?", { exact: true }).fill("Was, wenn der Termin nicht klappt?");
    await page.getByRole("checkbox", { name: "Ich bemerke, dass ich dasselbe Thema erneut durchgehe.", exact: true }).check();
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: "Nein, es ist dieselbe Frage oder Unsicherheit", exact: true }).click();
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByRole("button", { name: /hypothetische Möglichkeit/ }).click();
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Wozu kehrst du jetzt zurück?", { exact: true }).fill("Das Dokument fertigstellen");
    await page.getByLabel("Erste sichtbare Bewegung", { exact: true }).fill("Das Dokument öffnen");
    await page.getByRole("button", { name: "Ja", exact: true }).click();
    await page.getByRole("button", { name: "Rückkehrhandlung öffnen", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Kurzen Check-in jetzt öffnen", exact: true }).click();
    await page.getByLabel("Was hast du tatsächlich begonnen oder fortgesetzt?", { exact: true }).fill("Zwei Sätze ergänzt");
    await page.getByLabel("War Handeln trotz Gedanke möglich?", { exact: true }).selectOption("yes");
    await page.getByRole("button", { name: "Funktions-Check-in speichern", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rückkehr ausgewertet", exact: true })).toBeVisible();
  });

  test("structured problem solving completes", async ({ page }) => {
    await openApp(page, "/app/worry/problem-solving");
    await page.getByRole("textbox", { name: "Konkretes Problem", exact: true }).fill("Ein Termin muss verschoben werden");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Gewünschtes beobachtbares Ergebnis", { exact: true }).fill("Neuer Termin angefragt");
    await page.getByLabel("Welche Information fehlt tatsächlich?", { exact: true }).fill("Welche Ersatzzeiten möglich sind");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Zwei oder drei realistische Möglichkeiten", { exact: true }).fill("Dienstag oder Mittwoch");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Gewählter nächster Schritt", { exact: true }).fill("Zwei Zeiten im Kalender auswählen");
    await page.getByLabel("Prüfzeitpunkt", { exact: true }).fill(futureDateTime());
    await page.getByRole("button", { name: "Nächsten Schritt speichern", exact: true }).click();
    await expect(page.getByText("Nächster Schritt geplant", { exact: true })).toBeVisible();
  });

  test("concrete review completes", async ({ page }) => {
    await openApp(page, "/app/worry/concrete-review");
    await page.getByLabel("1. Was ist konkret passiert?", { exact: true }).fill("Eine Datei wurde später gesendet");
    await page.getByLabel("2. Was ist direkt beobachtbar?", { exact: true }).fill("Versand war Dienstag");
    await page.getByLabel("3. Welche nächste Handlung ist möglich?", { exact: true }).fill("Eine sachliche Nachricht senden");
    await page.getByRole("button", { name: "Rückblick schließen", exact: true }).click();
    await expect(page.getByText("Konkreter Rückblick abgeschlossen", { exact: true })).toBeVisible();
  });

  test("uncertainty experiment plans, starts and records outcome", async ({ page }) => {
    await openApp(page, "/app/worry/practice");
    await page.getByLabel("Unsichere Alltagssituation", { exact: true }).fill("E-Mail ohne mehrfaches Prüfen senden");
    await page.getByLabel("Befürchtete Konsequenz", { exact: true }).fill("Ein Fehler bleibt enthalten");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Bisheriges Prüf-, Vorbereitungs- oder Rückversicherungsverhalten", { exact: true }).fill("Mehrfach lesen");
    await page.getByLabel("Was wird diesmal konkret reduziert?", { exact: true }).fill("Nur einmal lesen");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Geplante sichtbare Handlung", { exact: true }).fill("E-Mail nach einmaligem Lesen senden");
    await page.getByLabel("Beobachtbares Ergebniskriterium", { exact: true }).fill("Ob eine Korrektur nötig wird");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Geplanter Zeitpunkt", { exact: true }).fill(futureDateTime());
    await page.getByRole("button", { name: "Für später planen", exact: true }).click();
    await page.getByRole("button", { name: "Experiment starten", exact: true }).click();
    await page.getByRole("button", { name: "Durchgeführt", exact: true }).click();
    await page.getByLabel("Was war direkt beobachtbar?", { exact: true }).fill("Die E-Mail wurde versendet");
    await page.getByLabel("Was wurde über Unsicherheit, Prüfen oder Handeln gelernt?", { exact: true }).fill("Einmaliges Lesen reichte");
    await page.getByRole("button", { name: "Experiment speichern", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Unsicherheitsexperiment dokumentiert", exact: true })).toBeVisible();
  });

  test("panic plan and acute flow survive reload and save debrief", async ({ page }) => {
    await preparePanicPlan(page);
    await page.goto("/app/panic/panic-log", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Ja, ich kann kurz hinschauen", exact: true }).click();
    await page.getByRole("button", { name: "Ja, mein bekanntes Muster", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zur Tätigkeit zurückkehren", exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Zur Tätigkeit zurückkehren", exact: true }).click();
    await page.getByRole("link", { name: "Kurze Auswertung jetzt", exact: true }).click();
    await page.getByLabel("1. Was hattest du befürchtet?", { exact: true }).fill("Ich breche zusammen");
    await page.getByLabel("2. Was ist direkt beobachtbar passiert?", { exact: true }).fill("Ich blieb ansprechbar");
    await page.getByLabel("3. Was hast du tatsächlich getan?", { exact: true }).fill("Ich blieb teilweise im Gespräch");
    await page.getByRole("button", { name: "Teilweise durchgeführt", exact: true }).click();
    await page.getByRole("button", { name: "Ich handelte anders, obwohl Alarm vorhanden war.", exact: true }).click();
    await page.getByRole("button", { name: "Kurze Auswertung speichern", exact: true }).click();
    await expect(page.getByText(/Umsetzung:/)).toBeVisible();
  });

  test("situational panic experiment completes", async ({ page }) => {
    await preparePanicPlan(page);
    await page.goto("/app/panic/situational-practice", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Vermiedene oder abgesicherte Situation", { exact: true }).fill("An der Supermarktkasse warten");
    await page.getByLabel("Konkrete funktionale Handlung", { exact: true }).fill("Bis zum Bezahlen bleiben");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Konkrete Befürchtung", { exact: true }).fill("Ich muss die Schlange verlassen");
    await page.getByLabel("Direkt beobachtbares Ergebniskriterium", { exact: true }).fill("Ich bezahle den Einkauf");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Ein Sicherheitsverhalten reduzieren", { exact: true }).fill("Ausgang beobachten");
    await page.getByRole("button", { name: "Weiter", exact: true }).click();
    await page.getByLabel("Geplanter Start", { exact: true }).fill(futureDateTime());
    await page.getByRole("button", { name: "Für später planen", exact: true }).click();
    await page.getByRole("button", { name: "Experiment starten", exact: true }).click();
    await page.getByRole("button", { name: "Handlung durchgeführt – Ergebnis festhalten", exact: true }).click();
    await page.getByLabel("Was ist direkt beobachtbar passiert?", { exact: true }).fill("Ich blieb bis zum Bezahlen");
    await page.getByRole("button", { name: "Die Katastrophe trat nicht ein.", exact: true }).click();
    await page.getByRole("button", { name: "Ausgang speichern", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Experiment dokumentiert", exact: true })).toBeVisible();
  });

  test("local JSON export downloads successfully", async ({ page }) => {
    await openApp(page, "/app/settings");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Daten exportieren", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^cbt-anxiety-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await download.failure()).toBeNull();
    await expect(page.getByRole("status").filter({ hasText: "Lokaler Export erstellt" })).toBeVisible();
  });
});

test.describe("every deployed application route", () => {
  for (const route of APP_ROUTES) {
    test(`${route} loads, renders, accepts input and exposes usable actions`, async ({ page }, testInfo) => {
      const runtime = collectRuntimeErrors(page);
      await openApp(page, route);
      const clicked = await walkVisibleFlow(page, 8);
      await testInfo.attach("live-route-audit", {
        body: JSON.stringify({ route, finalUrl: page.url(), clicked, h1: await page.locator("main h1").first().innerText().catch(() => "") }, null, 2),
        contentType: "application/json"
      });
      await testInfo.attach("live-route-screenshot", {
        body: await page.screenshot({ fullPage: true }), contentType: "image/png"
      });
      await expectHealthyPage(page, route, runtime.pageErrors, runtime.requestFailures);
    });
  }
});
