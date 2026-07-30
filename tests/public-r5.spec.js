import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/angst/gruebeln",
  "/angst/panik",
  "/angst/soziale-angst",
  "/wissenschaft",
  "/sicherheit",
  "/datenschutz",
  "/impressum"
];

async function expectNoOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, label).toBeLessThanOrEqual(1);
}

async function confirmAdult(page) {
  await page.locator("main h1").first().waitFor({ state: "visible", timeout: 20_000 });
  const checkbox = page.getByRole("checkbox", {
    name: "Ich bestätige, dass ich volljährig (mindestens 18 Jahre alt) bin.", exact: true
  });
  if (!(await checkbox.isVisible().catch(() => false))) return;
  await checkbox.check();
  await page.getByRole("button", { name: "App öffnen", exact: true }).click();
  await expect(checkbox).toBeHidden({ timeout: 20_000 });
}

test.describe("public deployment", () => {
  for (const route of PAGES) {
    test(`${route} loads without runtime errors or overflow`, async ({ page }) => {
      const errors = [];
      const failures = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("requestfailed", request => {
        if (request.url().includes("cbt-anxiety-pwa-qa-static.jeancecilia123.workers.dev")) {
          failures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
        }
      });
      const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expectNoOverflow(page, route);
      expect(errors, route).toEqual([]);
      expect(failures, route).toEqual([]);
    });
  }

  test("all three landing pages contain a working CTA into the matching live module", async ({ page }) => {
    const cases = [
      ["/angst/gruebeln", "worry", /\/app\/worry\/worry-sort\/?$/],
      ["/angst/panik", "panic", /\/app\/panic\/plan\/?$/],
      ["/angst/soziale-angst", "social-anxiety", /\/app\/social-anxiety\/social-prep\/?$/]
    ];

    for (const [route, path, destination] of cases) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const cta = page.locator(`a[href*="path=${path}"]`).first();
      await expect(cta).toBeVisible();
      await cta.click();
      await confirmAdult(page);
      await expect(page).toHaveURL(destination);
      await expect(page.locator("main h1")).toHaveCount(1);
    }
  });

  test("trust and support links are available from the public home", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const name of [
      "Wissenschaft & Grenzen",
      "Sicherheit & Grenzen",
      "Datenschutz",
      "Impressum",
      "Support kontaktieren"
    ]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });

  test("core dashboards remain usable at 200 percent text scaling", async ({ page }) => {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await confirmAdult(page);
    for (const route of ["/app", "/app/worry", "/app/panic", "/app/social-anxiety", "/app/settings"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeVisible();
      await expectNoOverflow(page, route);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll("button,a")]
          .filter(element => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && style.display !== "none";
          })
          .filter(element => {
            const style = getComputedStyle(element);
            const clipsX = style.overflowX !== "visible" && element.scrollWidth > element.clientWidth + 1;
            const clipsY = style.overflowY !== "visible" && element.scrollHeight > element.clientHeight + 1;
            return clipsX || clipsY;
          })
          .map(element => (element.textContent || "").trim())
          .filter(Boolean)
      );
      expect(clipped, route).toEqual([]);
    }
  });
});
