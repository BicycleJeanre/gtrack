import { test, expect, type Page } from "@playwright/test";
async function signIn(page: Page, email: string, create: boolean) {
  await page.goto("/");
  await page.getByRole("button", { name: "Account and data settings" }).click();
  await page.getByRole("button", { name: "Sign in or create account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-test-password");
  if (create)
    await page.getByLabel("Create a new account", { exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#dialog")).not.toBeVisible();
  await expect(page.locator("#sync")).toHaveText("Synced", { timeout: 15000 });
}
test("accounts share library, isolate workouts, and sync offline logs across devices", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(90000);
  const email = `alice-${Date.now()}@example.test`;
  await signIn(page, email, true);
  await page
    .getByRole("button", { name: "Create workout", exact: false })
    .click();
  await page
    .getByLabel("Workout name", { exact: true })
    .fill("Private Alice plan");
  await page
    .getByRole("button", { name: "New exercise for the library" })
    .click();
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("Shared synthetic press");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic description shared across test accounts.");
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(page.locator("#dialog")).not.toBeVisible();
  await page.getByLabel("Sets", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.locator(".plan h2")).toHaveText("Private Alice plan");
  await expect(page.locator("#sync")).toHaveText("Synced", { timeout: 15000 });
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, `bob-${Date.now()}@example.test`, true);
  await expect(other.locator(".plan")).toHaveCount(0);
  await other
    .getByRole("button", { name: "Create workout", exact: false })
    .click();
  await other
    .getByLabel("Exercise from library")
    .selectOption({ label: "Shared synthetic press" });
  await expect(other.locator(".description")).toContainText(
    "shared across test accounts",
  );
  const deviceContext = await browser.newContext();
  const device = await deviceContext.newPage();
  await signIn(device, email, false);
  await expect(device.locator(".plan h2")).toHaveText("Private Alice plan");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page.locator(".check")).toHaveCount(1);
  await context.setOffline(true);
  await page
    .getByRole("button", {
      name: "Complete Shared synthetic press set 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".check")).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.locator(".history")).toHaveCount(1);
  await expect(page.locator("#sync")).toContainText("pending");
  await context.setOffline(false);
  await expect(page.locator("#sync")).toHaveText("Synced", { timeout: 15000 });
  await device.getByRole("button", { name: "History", exact: true }).click();
  await expect(device.locator(".history")).toHaveCount(1, { timeout: 15000 });
  await other.getByRole("button", { name: "History", exact: true }).click();
  await other
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(other.locator(".history")).toHaveCount(0);
  await deviceContext.close();
  await otherContext.close();
});

test("program enrollment and completed progress sync privately to a second device", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const email = `program-${Date.now()}@example.test`;
  await signIn(page, email, true);
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview Foundation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this program", exact: true })
    .click();
  await expect(page.locator(".today-program")).toHaveCount(1);
  await expect(page.locator("#sync")).toHaveText("Synced", { timeout: 15000 });
  const secondContext = await browser.newContext(),
    second = await secondContext.newPage();
  const strangerContext = await browser.newContext(),
    stranger = await strangerContext.newPage();
  try {
    await signIn(second, email, false);
    await second.getByRole("button", { name: "Programs", exact: true }).click();
    await expect(second.locator(".program-enrollment")).toContainText(
      "0 / 24 sessions",
    );
    await page
      .getByRole("button", { name: "Review weights first", exact: true })
      .click();
    for (const input of await page.locator("#program-prepare input").all())
      await input.fill("10");
    await page
      .getByRole("button", { name: "Start program session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Complete Goblet squat set 1", exact: true })
      .click();
    await page.locator("#finish").click();
    await page.locator("#advance-program").check();
    await page
      .getByRole("button", { name: "Save session", exact: true })
      .click();
    await expect(page.locator("#sync")).toHaveText("Synced", {
      timeout: 15000,
    });
    await expect(second.locator(".program-enrollment")).toContainText(
      "1 / 24 sessions",
      { timeout: 15000 },
    );
    await signIn(stranger, `program-stranger-${Date.now()}@example.test`, true);
    await stranger
      .getByRole("button", { name: "Programs", exact: true })
      .click();
    await expect(stranger.locator(".program-enrollment")).toHaveCount(0);
  } finally {
    await secondContext.close();
    await strangerContext.close();
  }
});

test("custom programs and edits sync privately", async ({ page, browser }) => {
  test.setTimeout(90000);
  const email = `custom-program-${Date.now()}@example.test`;
  await signIn(page, email, true);
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page.getByRole("button", { name: "Create program" }).click();
  await page.getByLabel("Program name").fill("Cloud strength plan");
  await page.getByLabel("Workout name").fill("Monday strength");
  await page.getByLabel("Schedule label").fill("Monday");
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.locator("#sync")).toHaveText("Synced", { timeout: 15000 });

  const secondContext = await browser.newContext(),
    second = await secondContext.newPage(),
    strangerContext = await browser.newContext(),
    stranger = await strangerContext.newPage();
  try {
    await signIn(second, email, false);
    await second.getByRole("button", { name: "Programs", exact: true }).click();
    await expect(second.locator(".program-enrollment")).toContainText(
      "Cloud strength plan",
      { timeout: 15000 },
    );
    await second
      .getByRole("button", { name: "Edit program", exact: true })
      .click();
    await second.getByLabel("Program name").fill("Cloud strength plan v2");
    await second
      .getByRole("button", { name: "Save program", exact: true })
      .click();
    await expect(second.locator("#sync")).toHaveText("Synced", {
      timeout: 15000,
    });
    await expect(page.locator(".today-program")).toContainText(
      "Cloud strength plan v2",
      { timeout: 15000 },
    );

    await signIn(stranger, `custom-stranger-${Date.now()}@example.test`, true);
    await stranger
      .getByRole("button", { name: "Programs", exact: true })
      .click();
    await expect(stranger.locator(".program-enrollment")).toHaveCount(0);
  } finally {
    await secondContext.close();
    await strangerContext.close();
  }
});
