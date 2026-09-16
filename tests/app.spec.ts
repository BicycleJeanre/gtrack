import { test, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
async function offlineServer(cachePages = false) {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  let revision = 1;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, "http://test").pathname;
      const file = resolve(
        "dist",
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(resolve("dist") + "/")) throw Error("Invalid path");
      res.setHeader(
        "Content-Type",
        types[extname(file)] || "application/octet-stream",
      );
      let content = await readFile(file);
      if (cachePages && (pathname === "/" || pathname === "/index.html")) {
        res.setHeader("Cache-Control", "max-age=600");
        content = Buffer.from(
          content
            .toString()
            .replace("</title>", ` revision ${revision}</title>`),
        );
      }
      res.end(
        pathname === "/sw.js"
          ? content.toString() + "\n// test revision " + revision
          : content,
      );
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: "http://127.0.0.1:" + (server.address() as { port: number }).port,
    update: () => {
      revision++;
    },
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
async function createWorkout(page: Page, name = "Upper body A", url = "/") {
  await page.goto(url);
  await page
    .getByRole("button", { name: "Create workout", exact: false })
    .click();
  await page.getByLabel("Workout name", { exact: true }).fill(name);
  await page
    .getByLabel("Exercise from library")
    .selectOption({ label: "Barbell bench press" });
  await page.getByLabel("Sets", { exact: true }).fill("2");
  await page
    .getByLabel("Exercise 1 set 1 weight (kg)", { exact: true })
    .fill("40");
  await page
    .getByLabel("Exercise 1 set 2 weight (kg)", { exact: true })
    .fill("40");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.locator(".plan h2")).toHaveText(name);
}
test("plans, custom library, editing, reordering and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createWorkout(page);
  await page.getByRole("button", { name: "Edit Upper body A" }).click();
  await page
    .getByRole("button", { name: "New exercise for the library" })
    .click();
  await page.getByLabel("Exercise name", { exact: true }).fill("Cable fly");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Cable fly with two handles. Record each stack.");
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(page.locator(".description").first()).toContainText(
    "two handles",
  );
  await page
    .getByRole("button", { name: "Add exercise", exact: false })
    .click();
  await page
    .getByLabel("Exercise from library")
    .nth(1)
    .selectOption({ label: "Barbell squat" });
  await page.getByRole("button", { name: "Move exercise 2 up" }).click();
  await expect(page.getByLabel("Exercise from library").first()).toHaveValue(
    (await page
      .locator("option")
      .filter({ hasText: "Barbell squat" })
      .first()
      .getAttribute("value")) as string,
  );
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.locator(".plan h2")).toHaveText("Upper body A");
  await page.reload();
  await page.getByRole("button", { name: "Edit Upper body A" }).click();
  await expect(page.getByLabel("Exercise from library")).toHaveCount(2);
  await page
    .getByRole("button", { name: "New exercise for the library" })
    .first()
    .click();
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("  CABLE  fly  ");
  await page.getByLabel("Description", { exact: true }).fill("Duplicate entry");
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Exercise from library")
      .first()
      .locator("option", { hasText: "Cable fly" }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
  for (const width of [320, 390, 520, 1200]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("offline session survives restart, completes once, and exports/imports", async ({
  page,
  context,
  browser,
  browserName,
}) => {
  const server = await offlineServer();
  await createWorkout(page, "Upper body A", server.url);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page
    .getByLabel("Barbell bench press set 1 weight", { exact: true })
    .fill("42.5");
  await expect(page.locator("#draft-status")).toHaveText("Saved on phone");
  // Reload without blurring or marking the set: valid keystrokes must already be durable.
  await page.reload();
  await expect(
    page.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("42.5");
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await expect(page.locator(".check").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Stop the actual origin: WebKit's setOffline can fail before consulting its service worker.
  await server.stop();
  if (browserName === "chromium") await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".check").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("42.5");
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 2",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.locator(".history")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".history")).toHaveCount(1);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.locator(".big")).toContainText("42.5");
  await page.getByRole("button", { name: "Account and data settings" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  const clean = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const restored = await clean.newPage();
  await restored.goto("/");
  await restored
    .getByRole("button", { name: "Account and data settings" })
    .click();
  await restored.locator("#import").setInputFiles(path!);
  await restored
    .getByRole("button", { name: "Import records", exact: true })
    .click();
  await restored.getByRole("button", { name: "History", exact: true }).click();
  await expect(restored.locator(".history")).toHaveCount(1);
  await restored
    .getByRole("button", { name: "Account and data settings" })
    .click();
  await restored.locator("#import").setInputFiles(path!);
  await restored
    .getByRole("button", { name: "Import records", exact: true })
    .click();
  await restored.getByRole("button", { name: "History", exact: true }).click();
  await expect(restored.locator(".history")).toHaveCount(1);
  await clean.close();
});
test("invalid backups cannot replace data and second tabs cannot edit a session", async ({
  page,
  context,
}) => {
  await createWorkout(page);
  await page.getByRole("button", { name: "Account and data settings" }).click();
  await page.locator("#import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schema: 1,
        records: { exercises: [], sessions: [], workouts: [{ id: "bad" }] },
      }),
    ),
  });
  await expect(page.locator("#toast")).toContainText("invalid");
  await page.getByRole("button", { name: "Workouts", exact: true }).click();
  await expect(page.locator(".plan")).toHaveCount(1);
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByRole("heading", { name: "GTrack is open in another tab." }),
  ).toBeVisible();
});

test("app updates wait for training to finish", async ({ page }) => {
  const server = await offlineServer(true);
  try {
    await createWorkout(page, "Update test", server.url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await expect(page.locator("#update-app")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Start workout", exact: true })
      .click();
    server.update();
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())!.update(),
    );
    await expect(page.locator("#update-app")).toBeVisible();
    await page.locator("#update-app").click();
    await expect(page.locator("#toast")).toContainText("Finish or leave");
    await page
      .getByRole("button", {
        name: "Complete Barbell bench press set 1",
        exact: true,
      })
      .click();
    await page.locator("#finish").click();
    await page
      .getByRole("button", { name: "Save session", exact: true })
      .click();
    await expect(page.locator(".history")).toHaveCount(1);
    await page.locator("#update-app").click();
    await expect(page.locator("#update-app")).toHaveCount(0);
    await expect(page).toHaveTitle(/revision 2/);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.locator(".history")).toHaveCount(1);
  } finally {
    await server.stop();
  }
});

test("individual set targets survive editing and flow into training", async ({
  page,
}) => {
  await createWorkout(page);
  await page.getByRole("button", { name: "Edit Upper body A" }).click();
  await page.getByLabel("Exercise 1 set 1 reps", { exact: true }).fill("12");
  await page
    .getByLabel("Exercise 1 set 1 weight (kg)", { exact: true })
    .fill("20");
  await page.getByLabel("Exercise 1 set 2 reps", { exact: true }).fill("8");
  await page
    .getByLabel("Exercise 1 set 2 weight (kg)", { exact: true })
    .fill("40");
  await page.getByRole("button", { name: "Add set", exact: false }).click();
  await expect(
    page.getByLabel("Exercise 1 set 3 weight (kg)", { exact: true }),
  ).toHaveValue("40");
  await page.getByLabel("Exercise 1 set 3 reps", { exact: true }).fill("6");
  await page
    .getByLabel("Exercise 1 set 3 weight (kg)", { exact: true })
    .fill("50");
  await page
    .getByRole("button", { name: "Remove exercise 1 set 2", exact: true })
    .click();
  await expect(page.getByLabel("Sets", { exact: true })).toHaveValue("2");
  await expect(
    page.getByLabel("Exercise 1 set 2 weight (kg)", { exact: true }),
  ).toHaveValue("50");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.locator(".plan h2")).toHaveText("Upper body A");
  await page.reload();
  await page.getByRole("button", { name: "Edit Upper body A" }).click();
  await expect(
    page.getByLabel("Exercise 1 set 1 reps", { exact: true }),
  ).toHaveValue("12");
  await expect(
    page.getByLabel("Exercise 1 set 2 reps", { exact: true }),
  ).toHaveValue("6");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(
    page.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("20");
  await expect(
    page.getByLabel("Barbell bench press set 1 reps", { exact: true }),
  ).toHaveValue("12");
  await expect(
    page.getByLabel("Barbell bench press set 2 weight", { exact: true }),
  ).toHaveValue("50");
  await expect(
    page.getByLabel("Barbell bench press set 2 reps", { exact: true }),
  ).toHaveValue("6");
});

test("build a session while recording and resume structural edits", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start empty session" }).click();
  await page.getByLabel("Session name", { exact: true }).fill("Gym freestyle");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await expect(page.locator("#finish")).toBeDisabled();
  await page.reload();
  await expect(page.locator(".session-head h2")).toHaveText("Gym freestyle");
  await page.locator("#session-add").click();
  await page
    .getByLabel("Exercise from library")
    .selectOption({ label: "Barbell bench press" });
  await page
    .getByRole("button", { name: "Add to session", exact: true })
    .click();
  await page
    .getByLabel("Barbell bench press set 1 weight", { exact: true })
    .fill("45");
  await page
    .getByLabel("Barbell bench press set 1 reps", { exact: true })
    .fill("8");
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Add set to Barbell bench press" })
    .click();
  await expect(
    page.getByLabel("Barbell bench press set 2 weight", { exact: true }),
  ).toHaveValue("45");
  await page
    .getByRole("button", {
      name: "Remove Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Keep training", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Remove Barbell bench press set 2",
      exact: true,
    })
    .click();
  await page.locator("#session-add").click();
  await page
    .getByRole("button", { name: "New exercise for the library" })
    .click();
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("Freestyle cable row");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Seated cable row; record stack weight.");
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move Freestyle cable row up" })
    .click();
  await expect(page.locator(".logging-exercise h2").first()).toHaveText(
    "Freestyle cable row",
  );
  await page.getByRole("button", { name: "Edit session details" }).click();
  await page
    .getByLabel("Session name", { exact: true })
    .fill("Freestyle upper body");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator(".session-head h2")).toHaveText(
    "Freestyle upper body",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/session-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".session-head h2")).toHaveText(
    "Freestyle upper body",
  );
  await expect(
    page.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("45");
  await expect(
    page.getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Remove Freestyle cable row", exact: true })
    .click();
  await page.locator("#finish").click();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.locator(".history")).toContainText("360 kg volume");
  await page.getByRole("button", { name: "Workouts", exact: true }).click();
  await expect(page.locator(".plan")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create workout", exact: false })
    .click();
  await expect(
    page.getByLabel("Exercise from library").locator("option"),
  ).toContainText(["Freestyle cable row"]);
});

test("editing a running workout preserves its template and confirms completed removals", async ({
  page,
}) => {
  await createWorkout(page);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Remove Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Remove completed work", exact: true })
    .click();
  await expect(page.locator("#finish")).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Remove Barbell bench press", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove completed work", exact: true })
    .click();
  await expect(page.locator(".logging-exercise")).toHaveCount(0);
  await expect(page.locator("#finish")).toBeDisabled();
  await page.reload();
  await expect(page.locator(".logging-exercise")).toHaveCount(0);
  await page.getByRole("button", { name: "Workouts", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Upper body A", exact: true })
    .click();
  await expect(page.getByLabel("Sets", { exact: true })).toHaveValue("2");
  await expect(
    page.getByLabel("Exercise 1 set 1 weight (kg)", { exact: true }),
  ).toHaveValue("40");
});

test("program catalog, phases, enrollment, session recovery and progression", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview Foundation", exact: true })
    .click();
  await expect(page.locator("#program-sessions article")).toHaveCount(3);
  await expect(page.locator("#program-sessions")).toContainText("2 × 8");
  await page.getByLabel("Preview week").selectOption("5");
  await expect(page.locator("#program-sessions")).toContainText("3 × 8");
  await page
    .getByRole("button", { name: "Use this program", exact: true })
    .click();
  await expect(page.locator(".program-enrollment")).toContainText(
    "0 / 24 sessions",
  );
  await page
    .getByRole("button", { name: "Prepare next session", exact: true })
    .click();
  await expect(
    page.getByLabel("Goblet squat weight (kg)", { exact: true }),
  ).toHaveValue("");
  for (const input of await page.locator("#program-prepare input").all())
    await input.fill("10");
  await page
    .getByRole("button", { name: "Start program session", exact: true })
    .click();
  await expect(page.locator(".training-guidance").first()).toContainText(
    "3–4 reps in reserve",
  );
  await expect(page.locator(".check")).toHaveCount(10);
  await page.reload();
  await expect(page.locator(".session-head")).toContainText(
    "Week 1, session 1",
  );
  await page
    .getByRole("button", { name: "Complete Goblet squat set 1", exact: true })
    .click();
  await page.locator("#finish").click();
  await expect(page.locator("#advance-program")).not.toBeChecked();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await expect(page.locator(".program-enrollment")).toContainText(
    "0 / 24 sessions",
  );
  await page
    .getByRole("button", { name: "Prepare next session", exact: true })
    .click();
  await expect(
    page.getByLabel("Goblet squat weight (kg)", { exact: true }),
  ).toHaveValue("10");
  for (const input of await page.locator("#program-prepare input").all())
    await input.fill("12");
  await page
    .getByRole("button", { name: "Start program session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete Goblet squat set 1", exact: true })
    .click();
  await page.locator("#finish").click();
  await page.locator("#advance-program").check();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await expect(page.locator(".program-enrollment")).toContainText(
    "1 / 24 sessions",
  );
  await expect(page.locator(".program-enrollment")).toContainText("B — Hinge");
  await page
    .getByRole("button", { name: "Pause program", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prepare next session", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume program", exact: true })
    .click();
  await expect(page.locator(".program-enrollment")).toContainText(
    "1 / 24 sessions",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/programs-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("program backup restores weeks, phase targets, completion and duplicate-slot counting", async ({
  page,
}) => {
  const enrollment = {
    id: "fixture-enrollment",
    templateId: "foundation-3",
    version: 1,
    startedAt: 1,
    updatedAt: 1,
    archived: false,
  };
  const makeSession = (n: number, id = `fixture-${n}`) => ({
    id,
    workoutName: "Synthetic program session",
    rest: 180,
    startedAt: 1,
    completedAt: 2,
    program: {
      enrollmentId: enrollment.id,
      templateId: enrollment.templateId,
      week: Math.floor(n / 3) + 1,
      day: (n % 3) + 1,
      countsForProgress: true,
    },
    exercises: [
      {
        exerciseId: "fixture",
        name: "Synthetic exercise",
        description: "Synthetic fixture",
        sets: [{ weight: 10, reps: 8, done: true }],
      },
    ],
  });
  const upload = async (count: number) => {
    await page
      .getByRole("button", { name: "Account and data settings" })
      .click();
    await page
      .locator("#import")
      .setInputFiles({
        name: "fixture.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            schema: 1,
            records: {
              exercises: [],
              workouts: [],
              programs: [enrollment],
              sessions: [
                ...Array.from({ length: count }, (_, i) => makeSession(i)),
                makeSession(0, "duplicate-slot"),
              ],
            },
          }),
        ),
      });
    await page
      .getByRole("button", { name: "Import records", exact: true })
      .click();
    await page.getByRole("button", { name: "Programs", exact: true }).click();
  };
  await page.goto("/");
  await upload(6);
  await expect(page.locator(".program-enrollment")).toContainText(
    "Week 3 of 8",
  );
  await expect(page.locator(".program-enrollment")).toContainText(
    "6 / 24 sessions",
  );
  await page
    .getByRole("button", { name: "Prepare next session", exact: true })
    .click();
  await expect(page.locator("#program-prepare")).toContainText("3 × 8");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await upload(24);
  await expect(page.locator(".program-enrollment")).toContainText(
    "Program complete",
  );
  await expect(page.locator(".program-enrollment")).toContainText(
    "24 / 24 sessions",
  );
  await expect(
    page.getByRole("button", { name: "Prepare next session", exact: true }),
  ).toHaveCount(0);
});
