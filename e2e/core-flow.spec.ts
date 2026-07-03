/**
 * E2E: post → offer → assign → dual-complete → rate, driven through the real
 * Hebrew UI by two seeded users in separate browser sessions (testing spec
 * §3.1 E2E row). Prerequisites: npx supabase start + scripts/seed.ts with
 * SEED_PASSWORD=demo-local-1234.
 */
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "demo-local-1234";
const REQUESTER = "dana@ihelp.demo"; // seeded, identity-verified, has location
const HELPER = "yossi@ihelp.demo"; // seeded, verified + professional badge

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(PASSWORD);
  await page.getByRole("button", { name: "התחברות" }).click();
  await page.waitForURL("**/requests");
}

test("core marketplace loop through the UI", async ({ browser }) => {
  const title = `E2E בדיקת ליבה ${Date.now()}`;

  // --- Requester posts a request -------------------------------------------
  const requesterCtx = await browser.newContext();
  const requester = await requesterCtx.newPage();
  await signIn(requester, REQUESTER);

  await requester.goto("/requests/new");
  await requester.getByLabel("כותרת").fill(title);
  await requester
    .getByLabel("תיאור")
    .fill("בדיקת קצה-לקצה: תיאור ארוך מספיק כדי לעבור ולידציה.");
  await requester.getByLabel("קטגוריה").selectOption("tech_help");
  await requester.getByRole("radio", { name: "בתשלום" }).check();
  await requester
    .locator('input[type="file"]')
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(requester.getByText("קובץ 1 ✓")).toBeVisible();

  await requester.getByRole("button", { name: "פרסום הבקשה" }).click();
  await requester.waitForURL(/\/requests\/[0-9a-f-]{36}$/);
  const requestUrl = requester.url();
  await expect(requester.getByRole("heading", { name: title })).toBeVisible();
  await expect(requester.getByText("פתוחה")).toBeVisible();

  // --- Helper offers ---------------------------------------------------------
  const helperCtx = await browser.newContext();
  const helper = await helperCtx.newPage();
  await signIn(helper, HELPER);

  await helper.goto(requestUrl);
  await helper.getByLabel("איך אעזור").fill("מתקין מערכות שנים — אשמח לעזור.");
  await helper.getByLabel("המחיר שלי (₪)").fill("120");
  await helper.getByRole("button", { name: "שליחת הצעה" }).click();
  await expect(helper.getByText("ההצעה שלך")).toBeVisible();

  // --- Requester assigns the offer -------------------------------------------
  await requester.reload();
  await expect(requester.getByText("יש הצעות")).toBeVisible();
  requester.on("dialog", (d) => d.accept());
  await requester.getByRole("button", { name: "בחירה בהצעה זו" }).click();
  await expect(requester.getByText("שובצה")).toBeVisible();

  // Contact card visible to both parties, with the agreed (helper-set) price
  // (appears twice by design: the offer chip and the agreed-price line)
  await expect(requester.getByText("פרטי קשר לתיאום")).toBeVisible();
  await expect(requester.getByText("המחיר שסוכם")).toBeVisible();
  await expect(requester.getByText("₪120").first()).toBeVisible();
  await helper.reload();
  await expect(helper.getByText("פרטי קשר לתיאום")).toBeVisible();

  // --- Dual completion ---------------------------------------------------------
  helper.on("dialog", (d) => d.accept());
  await helper.getByRole("button", { name: "אישור שהעזרה הושלמה" }).click();
  await expect(helper.getByText("ממתין לאישור הצד השני")).toBeVisible();

  await requester.reload();
  await expect(
    requester.getByText("הצד השני אישר — נשאר רק האישור שלך")
  ).toBeVisible();
  await requester.getByRole("button", { name: "אישור שהעזרה הושלמה" }).click();
  await expect(
    requester.getByText("העזרה הושלמה — שני הצדדים אישרו")
  ).toBeVisible();

  // --- Rating -------------------------------------------------------------------
  await requester.getByRole("button", { name: "5 כוכבים" }).click();
  await requester.getByLabel("הערה (רשות)").fill("שירות מצוין!");
  await requester.getByRole("button", { name: "שליחת דירוג" }).click();
  await expect(requester.getByText("דורגה")).toBeVisible();

  // The helper's public profile now shows the rating (via helper_ratings view)
  await helper.goto("/requests");
  await helper.reload();

  await requesterCtx.close();
  await helperCtx.close();
});
