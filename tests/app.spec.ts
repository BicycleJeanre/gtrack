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
async function createWorkout(
  page: Page,
  name = "Upper body A",
  url = "/",
  rest = 90,
) {
  await page.goto(url);
  await page
    .getByRole("button", { name: "Create workout", exact: false })
    .click();
  await page.getByLabel("Workout name", { exact: true }).fill(name);
  await page
    .getByLabel("Rest between sets (seconds)", { exact: true })
    .fill(String(rest));
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
test("startup failures expose privacy-safe diagnostics instead of hanging", async ({
  page,
}) => {
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "GTrack could not finish opening." }),
  ).toBeVisible();
  const report = page.locator("#startup-report");
  await expect(report).toContainText("module-load-error");
  await expect(report).toContainText("serviceWorkerControlled");
  await expect(report).toContainText("userAgent");
  await expect(
    page.getByRole("button", { name: "Copy diagnostics" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

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

test("desktop uses a sidebar and wider workout layout without changing mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await createWorkout(page, "Desktop workout");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page.locator("#logging")).toBeVisible();
  const desktop = await page.evaluate(() => {
    const nav = document.querySelector("nav")!,
      main = document.querySelector("main")!,
      logging = document.querySelector("#logging")!;
    return {
      navDirection: getComputedStyle(nav).flexDirection,
      navLeft: nav.getBoundingClientRect().left,
      navWidth: nav.getBoundingClientRect().width,
      mainLeft: main.getBoundingClientRect().left,
      loggingColumns: getComputedStyle(logging).gridTemplateColumns,
      fits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(desktop.navDirection).toBe("column");
  expect(desktop.navLeft).toBe(0);
  expect(desktop.navWidth).toBe(240);
  expect(desktop.mainLeft).toBeGreaterThanOrEqual(240);
  expect(desktop.loggingColumns.split(" ")).toHaveLength(2);
  expect(desktop.fits).toBe(true);
  await page.screenshot({
    path: "test-results/session-desktop.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const nav = document.querySelector("nav")!,
      main = document.querySelector("main")!,
      logging = document.querySelector("#logging")!;
    return {
      navDirection: getComputedStyle(nav).flexDirection,
      navBottom: Math.round(innerHeight - nav.getBoundingClientRect().bottom),
      navWidth: nav.getBoundingClientRect().width,
      mainLeft: main.getBoundingClientRect().left,
      loggingDisplay: getComputedStyle(logging).display,
      fits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(mobile.navDirection).toBe("row");
  expect(mobile.navBottom).toBe(0);
  expect(mobile.navWidth).toBe(390);
  expect(mobile.mainLeft).toBe(0);
  expect(mobile.loggingDisplay).toBe("block");
  expect(mobile.fits).toBe(true);
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

test("rest timer persists and the next workout shows the previous result", async ({
  page,
}) => {
  await createWorkout(page, "Bench day");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page.locator(".previous-performance")).toContainText(
    "No previous result yet",
  );
  await page
    .getByLabel("Barbell bench press set 1 reps", { exact: true })
    .fill("8");
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await expect(page.locator("#rest-time")).not.toHaveText("Ready");
  await page.getByRole("button", { name: "+30 sec", exact: true }).click();
  await expect(page.locator("#rest-time")).toHaveText(/^(1:5[7-9]|2:00)$/);
  await page.reload();
  await expect(page.locator("#rest-time")).not.toHaveText("Ready");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator("#rest-time")).toHaveText("Ready");
  await page
    .getByLabel("Barbell bench press set 2 weight", { exact: true })
    .fill("45");
  await page
    .getByLabel("Barbell bench press set 2 reps", { exact: true })
    .fill("6");
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
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  const previous = page.locator(".previous-performance");
  await expect(previous).toContainText("Last time");
  await expect(previous).toContainText("2 sets");
  await expect(previous).toContainText("40 kg × 8 · 45 kg × 6");
  await expect(previous).toContainText("Bench day");
});

test("rest timer plays a completion chime", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__audioStarts = 0;
    (window as any).__mediaPlayCalls = 0;
    (window as any).__insideTap = false;
    (window as any).__mediaCreatedInsideTap = false;
    document.addEventListener(
      "click",
      () => {
        (window as any).__insideTap = true;
        setTimeout(() => ((window as any).__insideTap = false));
      },
      true,
    );
    class AudioMock {
      currentTime = 0;
      preload = "";
      volume = 1;
      constructor() {
        (window as any).__mediaCreatedInsideTap = (window as any).__insideTap;
      }
      setAttribute() {}
      pause() {}
      async play() {
        (window as any).__mediaPlayCalls++;
      }
    }
    class AudioParamMock {
      setValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class AudioContextMock {
      state = "running";
      currentTime = 0;
      destination = {};
      async resume() {}
      createOscillator() {
        return {
          type: "sine",
          frequency: new AudioParamMock(),
          connect() {
            return this;
          },
          start() {
            (window as any).__audioStarts++;
          },
          stop() {},
        };
      }
      createGain() {
        return {
          gain: new AudioParamMock(),
          connect() {
            return this;
          },
        };
      }
    }
    Object.defineProperty(window, "Audio", { value: AudioMock });
    Object.defineProperty(window, "AudioContext", { value: AudioContextMock });
  });
  await createWorkout(page, "Timer sound", "/", 1);
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await expect(page.locator("#toast")).toContainText("Rest complete", {
    timeout: 3000,
  });
  await expect(page.locator("#rest-complete-popup")).toContainText(
    "Ready for your next set",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__mediaPlayCalls))
    .toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(() => (window as any).__mediaCreatedInsideTap),
  ).toBe(true);
});

test("multi-add supports timed units, active-workout resume, history edits and PRs", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start empty session" }).click();
  await page.getByRole("button", { name: "Start session" }).click();
  await page.locator("#session-add").click();
  await page
    .getByLabel("Exercise from library")
    .selectOption([
      { label: "Barbell bench press" },
      { label: "Seated cable row" },
    ]);
  await page.getByLabel("Track by").selectOption("duration");
  await page.getByLabel("Unit").selectOption("min");
  await page.getByRole("button", { name: "Add to session" }).click();
  await expect(page.locator(".logging-exercise")).toHaveCount(2);
  await page
    .getByLabel("Barbell bench press set 1 duration", { exact: true })
    .fill("1.5");
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Workouts", exact: true }).click();
  await expect(page.locator(".active-workout-bar")).toContainText(
    "Freestyle workout",
  );
  await page.locator("#resume-workout").click();
  await expect(page.locator(".session-head h2")).toHaveText(
    "Freestyle workout",
  );
  await page.locator("#finish").click();
  await page.getByRole("button", { name: "Save session" }).click();
  await page.getByRole("button", { name: "Edit logged workout" }).click();
  await page.locator("#history-edit [name=value]").first().fill("2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".history")).toContainText("2 min");
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.locator(".pr-grid")).toContainText("2");
  await expect(page.locator(".pr-grid")).toContainText("min");
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
      name: "Remove Barbell bench press set 2",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
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
  await expect(page.locator(".history")).toContainText("360 load volume");
  await page.getByRole("button", { name: "Workouts", exact: true }).click();
  await expect(page.locator(".plan")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create workout", exact: false })
    .click();
  await expect(
    page.getByLabel("Exercise from library").locator("option"),
  ).toContainText(["Freestyle cable row"]);
});

test("editing a running workout preserves its template and removes items directly", async ({
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
  await expect(page.locator(".today-program")).toContainText("0 / 24 sessions");
  await page
    .getByRole("button", { name: "Review weights first", exact: true })
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
    .getByRole("button", { name: "Review weights first", exact: true })
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
    page.getByRole("button", { name: "Start next workout", exact: true }),
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
    await page.locator("#import").setInputFiles({
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
    .getByRole("button", { name: "Review weights first", exact: true })
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
    page.getByRole("button", { name: "Start next workout", exact: true }),
  ).toHaveCount(0);
});

test("Today follows the current program and starts each next workout directly", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page
    .getByRole("button", { name: "Preview Foundation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this program", exact: true })
    .click();
  await expect(page.locator(".today-program")).toContainText(
    "Up next: A — Squat and horizontal push/pull",
  );
  await expect(page.locator(".today-program")).toContainText(
    "Session 1 of 3 this week",
  );
  await expect(page.getByText("Choose a different workout")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/program-today-${test.info().project.name}.png`,
    fullPage: true,
  });

  await page
    .getByRole("button", { name: "Start next workout", exact: true })
    .click();
  await expect(page.locator(".session-head")).toContainText(
    "Week 1, session 1",
  );
  await expect(
    page.getByLabel("Goblet squat set 1 weight", { exact: true }),
  ).toHaveValue("0");
  await page
    .getByLabel("Goblet squat set 1 weight", { exact: true })
    .fill("16");
  await page
    .getByRole("button", { name: "Complete Goblet squat set 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish workout", exact: false })
    .click();
  await expect(page.locator("#advance-program")).not.toBeChecked();
  await page.getByRole("button", { name: "Save session", exact: true }).click();

  await expect(page.locator(".today-program")).toContainText(
    "Up next: A — Squat and horizontal push/pull",
  );
  await page
    .getByRole("button", { name: "Start next workout", exact: true })
    .click();
  await expect(
    page.getByLabel("Goblet squat set 1 weight", { exact: true }),
  ).toHaveValue("16");
  await page
    .getByRole("button", { name: "Complete Goblet squat set 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish workout", exact: false })
    .click();
  await page.locator("#advance-program").check();
  await page.getByRole("button", { name: "Save session", exact: true }).click();

  await expect(page.locator(".today-program")).toContainText(
    "Up next: B — Hinge and vertical push/pull",
  );
  await page
    .getByRole("button", { name: "Start next workout", exact: true })
    .click();
  await expect(page.locator(".session-head")).toContainText(
    "Week 1, session 2",
  );
});

test("custom programs can be created, edited and followed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  await page.getByRole("button", { name: "Create program" }).click();
  await page.getByLabel("Program name").fill("My strength plan");
  await page.getByLabel("Weeks").fill("6");
  await page.getByLabel("Session length").fill("50–70");
  const first = page.locator(".program-day-editor").first();
  await first.getByLabel("Workout name").fill("Upper strength");
  await first.getByLabel("Schedule label").fill("Monday");
  await first.getByLabel("Workout 1 exercise 1").selectOption({
    label: "Barbell bench press",
  });
  await first.locator("[data-program-exercise-sets]").fill("4");
  await first.locator("[data-program-exercise-reps]").fill("6");
  await first.locator("[data-program-exercise-rest]").fill("180");
  await first
    .locator("[data-program-exercise-effort]")
    .fill("2 reps in reserve");
  await page.getByRole("button", { name: "Add workout day" }).click();
  const second = page.locator(".program-day-editor").nth(1);
  await second.getByLabel("Workout name").fill("Lower strength");
  await second.getByLabel("Schedule label").fill("Thursday");
  await second.getByLabel("Workout 2 exercise 1").selectOption({
    label: "Barbell squat",
  });
  await second.locator("[data-program-exercise-sets]").fill("3");
  await second.locator("[data-program-exercise-reps]").fill("5");
  await second.locator("[data-program-exercise-rest]").fill("240");
  await second
    .locator("[data-program-exercise-effort]")
    .fill("3 reps in reserve");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/program-builder-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save program", exact: true }).click();

  await expect(page.locator(".today-program")).toContainText(
    "My strength plan",
  );
  await expect(page.locator(".today-program")).toContainText(
    "Up next: Upper strength",
  );
  await expect(page.locator(".today-program")).toContainText("4 × 6");
  await page.getByRole("button", { name: "Edit program", exact: true }).click();
  await page.getByLabel("Program name").fill("My revised strength plan");
  await page
    .locator(".program-day-editor")
    .nth(1)
    .locator("[data-program-exercise-sets]")
    .fill("5");
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await expect(page.locator(".today-program")).toContainText(
    "My revised strength plan",
  );

  await page
    .getByRole("button", { name: "Start next workout", exact: true })
    .click();
  await expect(page.locator(".logging-exercise")).toHaveCount(1);
  await expect(page.locator(".check")).toHaveCount(4);
  await expect(page.locator(".training-guidance")).toContainText(
    "2 reps in reserve",
  );
  await page
    .getByLabel("Barbell bench press set 1 reps", { exact: true })
    .fill("7");
  await page
    .getByRole("button", { name: "Add set to Barbell bench press" })
    .click();
  await page
    .getByRole("button", {
      name: "Complete Barbell bench press set 1",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Finish workout", exact: false })
    .click();
  await page.locator("#update-program-workout").check();
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.locator(".today-program")).toContainText(
    "Up next: Upper strength",
  );
  await page
    .getByRole("button", { name: "Start next workout", exact: true })
    .click();
  await expect(page.locator(".check")).toHaveCount(5);
  await expect(
    page.getByLabel("Barbell bench press set 1 reps", { exact: true }),
  ).toHaveValue("7");
  await page.reload();
  await expect(page.locator(".session-head")).toContainText(
    "My revised strength plan",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Discard this session" }).click();
  await page.getByRole("button", { name: "Discard session" }).click();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  const original = page
    .locator(".program-enrollment")
    .filter({ hasText: "My revised strength plan" });
  await original.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByLabel("Program name")).toHaveValue(
    "My revised strength plan copy",
  );
  await page.getByRole("button", { name: "Save program", exact: true }).click();
  await page.getByRole("button", { name: "Programs", exact: true }).click();
  const copy = page
    .locator(".program-enrollment")
    .filter({ hasText: "My revised strength plan copy" });
  await copy.getByRole("button", { name: "Remove" }).click();
  await page
    .getByRole("button", { name: "Remove program", exact: true })
    .click();
  await expect(
    page
      .locator(".program-enrollment")
      .filter({ hasText: "My revised strength plan copy" }),
  ).toHaveCount(0);
});

test("exercise guides search, display photos offline and fit a narrow phone", async ({
  page,
}) => {
  const server = await offlineServer();
  let stopped = false;
  try {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(server.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await server.stop();
    stopped = true;
    await page.reload();
    await page.getByRole("button", { name: "Workouts", exact: true }).click();
    await page
      .getByRole("button", { name: "Exercise guide · photos & form" })
      .click();
    await page.getByLabel("Find an exercise").fill("bench press");
    await expect(page.locator("#guide-count")).toHaveText("4 exercises");
    await page
      .getByRole("button", {
        name: "View form for Barbell bench press",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Watch out for");
    await expect(page.locator(".guide-photos img")).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator(".guide-photos img")
          .evaluateAll((images) =>
            images.every((i) => (i as HTMLImageElement).naturalWidth > 0),
          ),
      )
      .toBe(true);
    expect(
      await page
        .locator("#dialog")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/gtrack-guide-${test.info().project.name}.png`,
    });
    await page.getByRole("button", { name: "Close exercise guide" }).click();
    await page.getByLabel("Find an exercise").fill("no-such-exercise");
    await expect(page.locator("#guide-results")).toContainText(
      "No exercises match",
    );
  } finally {
    if (!stopped) await server.stop();
  }
});

test("form guides preserve editor and active session values", async ({
  page,
}) => {
  await createWorkout(page);
  await page.getByRole("button", { name: "Edit Upper body A" }).click();
  await page
    .getByLabel("Exercise 1 set 1 weight (kg)", { exact: true })
    .fill("47.5");
  await page.getByRole("button", { name: "View form", exact: true }).click();
  await page.getByRole("button", { name: "Close exercise guide" }).click();
  await expect(
    page.getByLabel("Exercise 1 set 1 weight (kg)", { exact: true }),
  ).toHaveValue("47.5");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await page
    .getByLabel("Barbell bench press set 1 reps", { exact: true })
    .fill("8");
  await page
    .getByRole("button", {
      name: "View form for Barbell bench press",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Close exercise guide" }).click();
  await expect(
    page.getByLabel("Barbell bench press set 1 reps", { exact: true }),
  ).toHaveValue("8");
  await expect(
    page.getByLabel("Barbell bench press set 1 weight", { exact: true }),
  ).toHaveValue("47.5");
  await page.reload();
  await expect(
    page.getByLabel("Barbell bench press set 1 reps", { exact: true }),
  ).toHaveValue("8");
});

test("custom exercises do not inherit unrelated demonstration photos", async ({
  page,
}) => {
  await createWorkout(page);
  await page.getByRole("button", { name: "Edit Upper body A" }).click();
  await page
    .getByRole("button", { name: "New exercise for the library" })
    .click();
  await page
    .getByLabel("Exercise name", { exact: true })
    .fill("My adapted bench press");
  await page
    .getByLabel("Description", { exact: true })
    .fill("My coach’s adapted setup.");
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await page.getByRole("button", { name: "View form", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "No form guide has been added",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "My coach’s adapted setup.",
  );
  await expect(page.locator(".guide-photos img")).toHaveCount(0);
});
