import { guideFor, photoFor } from "./exercise-guides";
import {
  programs,
  templateFor,
  templateForEnrollment,
  phaseFor,
  programProgress,
  prescription,
  exercisePrescription,
  effortFor,
  exerciseEffort,
  restFor,
  createProgramSession,
} from "./programs";
import "./style.css";
import { Store } from "./store";
import {
  Cloud,
  configured,
  watchAuth,
  login,
  logout,
  resetPassword,
} from "./cloud";
import {
  exerciseId,
  normalize,
  uid,
  startSession,
  plannedSets,
  completedSets,
  volume,
  trackingFor,
  unitFor,
  validateRecord,
  validateBackup,
  type Workout,
  type Target,
  type Session,
  type Exercise,
  type ProgramEnrollment,
  type CustomProgramDefinition,
  type CustomProgramDay,
  type LoggedSet,
  type SessionExercise,
  type TrackingType,
  type MeasureUnit,
} from "./model";
const startup = (phase: string, detail = "") =>
  (window as any).__gtrackStartup?.mark(phase, detail);
const startupReady = () => (window as any).__gtrackStartup?.ready();
const startupFailure = (reason: string) =>
  (window as any).__gtrackStartup?.showFailure(reason);
startup("module-loaded");
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const date = (n: number) =>
  new Date(n).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const trackingLabel: Record<TrackingType, string> = {
  weight_reps: "Weight + reps",
  reps: "Reps only",
  duration: "Time",
  distance: "Distance",
};
const unitChoices: Record<TrackingType, MeasureUnit[]> = {
  weight_reps: ["kg", "lb"],
  reps: [],
  duration: ["sec", "min"],
  distance: ["m", "km", "mi"],
};
function setSummary(exercise: SessionExercise, set: LoggedSet) {
  const tracking = trackingFor(exercise),
    unit = unitFor(exercise);
  if (tracking === "weight_reps")
    return `${fmt(set.weight)} ${unit} × ${set.reps}`;
  if (tracking === "reps") return `${set.reps} reps`;
  return `${fmt(set.value || 0)} ${unit}`;
}
function trackingOptions(selected: TrackingType) {
  return (Object.keys(trackingLabel) as TrackingType[])
    .map(
      (value) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${trackingLabel[value]}</option>`,
    )
    .join("");
}
function unitOptions(tracking: TrackingType, selected: MeasureUnit) {
  return unitChoices[tracking]
    .map(
      (value) =>
        `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`,
    )
    .join("");
}
const icon =
  '<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 12h10M3 9v6m4-9v12m10-12v12m4-9v6M3 12h4m10 0h4"/></svg>';
let store: Store,
  cloud: Cloud | null = null,
  email = "",
  view = "today",
  editing: string | null = null,
  draftTargets: Target[] = [],
  restUntil = 0,
  restDuration = 90,
  restAlerted = false,
  loadedRestSession = "";
let restAudio: AudioContext | null = null;
let restChime: HTMLAudioElement | null = null;
let userReady = false,
  pageError = "",
  deferredUpdate: ServiceWorker | null = null;
const workouts = () =>
  Object.values(store.state.workouts)
    .filter((w) => !w.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt);
const history = () =>
  Object.values(store.state.sessions).sort(
    (a, b) => b.completedAt - a.completedAt,
  );
const exercises = () =>
  Object.values(store.state.exercises).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
function toast(message: string) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  window.setTimeout(() => $("#toast").classList.remove("show"), 5000);
}
function fail(error: unknown) {
  pageError =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  toast(pageError);
}
function action(selector: string, cb: (e: Event) => unknown) {
  document.querySelectorAll(selector).forEach((el) =>
    el.addEventListener("click", (e) => {
      try {
        Promise.resolve(cb(e)).catch(fail);
      } catch (error) {
        fail(error);
      }
    }),
  );
}
function modal(content: string) {
  const d = $<HTMLDialogElement>("#dialog");
  d.removeAttribute("aria-labelledby");
  d.innerHTML = content;
  d.showModal();
  action("[data-close]", () => d.close());
}
function close() {
  $<HTMLDialogElement>("#dialog").close();
}
function syncLabel() {
  if (!configured || store.account === "local")
    return "Saved on phone · local only";
  if (cloud?.error) return "Saved on phone · sync error";
  if (store.state.pending.length)
    return `Saved on phone · ${store.state.pending.length} sync pending`;
  if (!navigator.onLine) return "Saved on phone · offline";
  return cloud?.ready.size === 4 ? "Synced" : "Saved on phone · connecting";
}
function changed() {
  if (!userReady) return;
  const label = document.querySelector("#sync");
  if (label) label.textContent = syncLabel();
  if (
    (!["builder", "today", "program-builder"].includes(view) ||
      (view === "today" && !store.state.draft)) &&
    !$<HTMLDialogElement>("#dialog").open &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName || "",
    )
  )
    render();
}
async function saved() {
  void cloud?.flush();
  render();
}
const headings: Record<string, string[]> = {
  guide: ["Move with confidence.", "Exercise demonstrations and form cues."],
  today: ["Ready to train?", "Your session, one set at a time."],
  programs: ["Your training program.", "A plan for the weeks ahead."],
  "program-builder": [
    "Build your program.",
    "Plan each training day and follow it week by week.",
  ],
  workouts: ["Your workouts.", "Set it up once. Make it your routine."],
  builder: ["Build your workout.", "Choose your exercises and make a plan."],
  history: ["Every session adds up.", "The work you’ve put in, saved for you."],
  progress: [
    "See your strength grow.",
    "Your actual results, session after session.",
  ],
  account: ["Your training space.", "Account, offline access, and recovery."],
};
function render() {
  if (!store) return;
  const h = headings[view];
  $("#app").innerHTML =
    `<header><div class="brand">${icon}GTrack</div><button class="profile" id="account" aria-label="Account and data settings">${email ? esc(email[0].toUpperCase()) : "⚙"}</button></header><main>${activeWorkoutBar()}<div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div><h1>${h[0]}</h1><p class="subtitle">${h[1]}</p><button class="sync" id="sync">${esc(syncLabel())}</button>${deferredUpdate ? '<button class="secondary update" id="update-app">App update ready · reload safely</button>' : ""}<div id="screen"></div></main><nav aria-label="Main navigation">${["today", "programs", "workouts", "history", "progress"].map((n, i) => `<button data-view="${n}" ${view === n || (view === "program-builder" && n === "programs") || (["builder", "guide"].includes(view) && n === "workouts") ? 'aria-current="page"' : ""}><span aria-hidden="true">${["◷", "▦", "▤", "↺", "↗"][i]}</span>${n[0].toUpperCase() + n.slice(1)}</button>`).join("")}</nav>`;
  action("[data-view]", (e) =>
    navigate((e.currentTarget as HTMLElement).dataset.view!),
  );
  action("#account", () => navigate("account"));
  action("#sync", () => navigate("account"));
  action("#update-app", async () => {
    if (store.state.draft || view === "builder") {
      toast(
        "Finish or leave your current session or workout editor before updating.",
      );
      return;
    }
    deferredUpdate?.postMessage({ type: "SKIP_WAITING" });
  });
  (
    ({
      today: renderToday,
      workouts: renderWorkouts,
      programs: renderPrograms,
      "program-builder": renderProgramBuilder,
      guide: renderGuide,
      builder: renderBuilder,
      history: renderHistory,
      progress: renderProgress,
      account: renderAccount,
    }) as Record<string, () => void>
  )[view]();
  bindActiveWorkoutBar();
  if (view !== "guide") bindGuideButtons();
}
function activeWorkoutBar() {
  const draft = store.state.draft;
  if (!draft) return "";
  restoreRest(draft);
  const done = completedSets(draft),
    total = draft.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    alerts = typeof Notification !== "undefined" && Notification.permission !== "granted";
  return `<aside class="active-workout-bar" aria-label="Active workout and rest timer"><button class="active-workout-resume" id="resume-workout"><span class="eyebrow">Active workout · ${done}/${total} sets</span><strong>${esc(draft.workoutName)}</strong></button><div class="active-rest"><span class="eyebrow">Rest</span><strong id="global-rest-time" role="timer" aria-live="polite">Ready</strong></div><button class="timer-small" id="global-rest-start">Start</button><button class="timer-small" id="global-rest-add">+30</button>${alerts ? '<button class="timer-small alerts" id="enable-alerts">Enable alerts</button>' : ""}</aside>`;
}
function bindActiveWorkoutBar() {
  const draft = store.state.draft;
  if (!draft) return;
  action("#resume-workout", () => navigate("today"));
  action("#global-rest-start", () => startRest(draft.rest || 90));
  action("#global-rest-add", () => {
    if (restUntil > Date.now()) {
      restUntil += 30_000;
      restDuration += 30;
    } else startRest(30);
    restAlerted = false;
    persistRest(draft.id);
    updateRest();
  });
  action("#enable-alerts", requestRestAlerts);
  updateRest();
}
async function navigate(next: string) {
  if (["builder", "program-builder"].includes(view) && next !== view) {
    modal(
      `<h2>Leave this ${view === "program-builder" ? "program" : "workout"}?</h2><p>Your changes have not been saved.</p><div class="actions"><button class="secondary" data-close>Keep editing</button><button class="primary" id="leave-editor">Discard changes</button></div>`,
    );
    action("#leave-editor", () => {
      close();
      view = next;
      render();
      window.scrollTo(0, 0);
    });
    return;
  }
  view = next;
  render();
  window.scrollTo(0, 0);
}
function empty(title: string, description: string, button = "") {
  return `<div class="card empty"><div class="empty-symbol">${icon}</div><h2>${title}</h2><p>${description}</p>${button}</div>`;
}
let previewProgram: string | null = null;
function activePrograms() {
  return Object.values(store.state.programs)
    .filter((p) => !p.archived && !p.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
function currentProgram() {
  return activePrograms().find((enrollment) => {
    return !programProgress(enrollment, history()).finished;
  });
}
function previousProgramWeights(id: string, names: string[]) {
  const completed = history().filter(
    (session) => session.program?.enrollmentId === id,
  );
  return names.map((name) => {
    const exercise = completed
      .flatMap((session) => session.exercises)
      .find((item) => item.name === name && item.sets.some((set) => set.done));
    return exercise?.sets.find((set) => set.done)?.weight ?? 0;
  });
}
async function startNextProgramSession(id: string) {
  if (store.state.draft) {
    view = "today";
    render();
    toast("Resume or discard your current session first.");
    return;
  }
  const enrollment = store.state.programs[id];
  if (!enrollment || enrollment.archived) return;
  const p = templateForEnrollment(enrollment),
    progress = programProgress(enrollment, history());
  if (progress.finished) return;
  const next = p.sessions[progress.day - 1],
    weights = previousProgramWeights(
      id,
      next.exercises.map((exercise) => exercise.exerciseName),
    ),
    draft = createProgramSession(
      enrollment,
      progress.week,
      progress.day,
      exercises(),
      weights,
    );
  await store.saveDraft(draft);
  view = "today";
  render();
  window.scrollTo(0, 0);
  toast(
    weights.some((weight) => weight > 0)
      ? "Previous weights loaded. Adjust them for today as needed."
      : "Program workout ready. Set your weights as you train.",
  );
}
function todayProgramCard(enrollment: import("./model").ProgramEnrollment) {
  const p = templateForEnrollment(enrollment),
    progress = programProgress(enrollment, history()),
    phase = phaseFor(p, progress.week),
    next = p.sessions[progress.day - 1];
  return `<section class="card pad today-program"><div class="eyebrow">Current program · Week ${progress.week} of ${p.weeks}</div><h2>Up next: ${esc(next.name)}</h2><p>${esc(p.name)}<br>${esc(p.schedule[progress.day - 1])} · ${esc(phase.name)}</p><div class="program-position"><span>Session ${progress.day} of ${p.sessions.length} this week</span><span>${progress.completed} / ${progress.total} sessions complete</span></div><div class="progress-line"><i style="width:${(progress.completed / progress.total) * 100}%"></i></div><ol class="program-exercises compact">${next.exercises
    .map((exercise) => {
      const [sets, reps] = exercisePrescription(phase, exercise);
      return `<li><strong>${esc(exercise.exerciseName)}</strong><span>${sets} × ${reps}</span></li>`;
    })
    .join(
      "",
    )}</ol><button class="primary" data-program-quick-start="${enrollment.id}">Start next workout</button><div class="actions"><button class="text-button" data-program-start="${enrollment.id}">Review weights first</button>${enrollment.custom ? `<button class="text-button" data-program-edit="${enrollment.id}">Edit program</button>` : `<button class="text-button" data-program-preview="${p.id}">View full program</button>`}</div></section>`;
}
function programCard(enrollment: import("./model").ProgramEnrollment) {
  const p = templateForEnrollment(enrollment),
    progress = programProgress(enrollment, history());
  return `<article class="card pad program-enrollment"><div class="eyebrow">${enrollment.custom ? "Custom program · " : ""}${enrollment.archived ? "Paused" : progress.finished ? "Program complete" : `Week ${progress.week} of ${p.weeks}`}</div><h2>${esc(p.name)}</h2><p>${progress.completed} / ${progress.total} sessions completed</p><div class="progress-line"><i style="width:${(progress.completed / progress.total) * 100}%"></i></div>${!progress.finished && !enrollment.archived ? `<p>Next: ${esc(p.sessions[progress.day - 1].name)} · ${esc(phaseFor(p, progress.week).name)}</p><button class="primary" data-program-quick-start="${enrollment.id}">${store.state.draft?.program?.enrollmentId === enrollment.id ? "Resume workout" : "Start next workout"}</button><button class="text-button" data-program-start="${enrollment.id}">Review weights first</button>` : ""}<div class="actions">${enrollment.custom ? `<button class="text-button" data-program-edit="${enrollment.id}">Edit program</button>` : `<button class="text-button" data-program-preview="${p.id}">View program</button>`}<button class="text-button" data-program-copy="${enrollment.id}">Duplicate</button><button class="text-button" data-program-pause="${enrollment.id}">${enrollment.archived ? "Resume program" : "Pause program"}</button><button class="text-button danger-link" data-program-delete="${enrollment.id}">Remove</button></div></article>`;
}
function duplicateProgram(enrollment: ProgramEnrollment) {
  const p = templateForEnrollment(enrollment),
    progress = programProgress(enrollment, history()),
    week = progress.finished ? 1 : progress.week,
    phase = phaseFor(p, week);
  editingProgram = null;
  programDraft = enrollment.custom
    ? {
        ...structuredClone(enrollment.custom),
        name: `${enrollment.custom.name} copy`,
        sessions: structuredClone(enrollment.custom.sessions).map((day) => ({
          ...day,
          id: uid(),
        })),
      }
    : {
        name: `${p.name.split(" — ")[0]} copy`,
        weeks: p.weeks,
        estimatedMinutes: p.estimatedMinutes,
        sessions: p.sessions.map((session, index) => ({
          id: uid(),
          name: session.name,
          schedule: p.schedule[index],
          exercises: session.exercises.map((exercise) => {
            const [sets, reps] = exercisePrescription(phase, exercise);
            return {
              exerciseName: exercise.exerciseName,
              sets,
              reps,
              rest: exercise.rest ?? restFor(exercise.role),
              effort: exerciseEffort(phase, exercise, week),
            };
          }),
        })),
      };
  view = "program-builder";
  render();
  window.scrollTo(0, 0);
  if (!enrollment.custom)
    toast(
      `Copied the week ${week} targets into an editable program. Review them before saving.`,
    );
}
function bindPrograms() {
  action("[data-program-preview]", (e) => {
    previewProgram = (e.currentTarget as HTMLElement).dataset.programPreview!;
    view = "programs";
    render();
    window.scrollTo(0, 0);
  });
  action("[data-program-start]", (e) =>
    prepareProgramSession(
      (e.currentTarget as HTMLElement).dataset.programStart!,
    ),
  );
  action("[data-program-quick-start]", (e) =>
    startNextProgramSession(
      (e.currentTarget as HTMLElement).dataset.programQuickStart!,
    ),
  );
  action("[data-program-edit]", (e) =>
    openProgramBuilder((e.currentTarget as HTMLElement).dataset.programEdit),
  );
  action("[data-program-copy]", (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.programCopy!;
    duplicateProgram(store.state.programs[id]);
  });
  action("[data-program-delete]", (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.programDelete!,
      enrollment = store.state.programs[id],
      name = templateForEnrollment(enrollment).name;
    if (store.state.draft?.program?.enrollmentId === id) {
      toast(
        "Finish or discard its active workout before removing this program.",
      );
      return;
    }
    modal(
      `<h2>Remove ${esc(name)}?</h2><p>The program will disappear from your plans. Completed training history remains available.</p><div class="actions"><button class="secondary" data-close>Keep program</button><button class="danger" id="program-delete-confirm">Remove program</button></div>`,
    );
    action("#program-delete-confirm", async () => {
      await store.put("programs", {
        ...enrollment,
        archived: true,
        deleted: true,
        updatedAt: Date.now(),
      });
      close();
      await saved();
      toast("Program removed. Completed history was kept.");
    });
  });
  action("[data-program-pause]", async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.programPause!;
    if (store.state.draft?.program?.enrollmentId === id) {
      toast("Finish or discard the active session before pausing its program.");
      return;
    }
    await store.put("programs", {
      ...store.state.programs[id],
      archived: !store.state.programs[id].archived,
      updatedAt: Date.now(),
    });
    await saved();
  });
}
const programGuidance = `<details class="card pad program-guidance"><summary>How to choose weights and progress</summary><p>RIR (reps in reserve) means how many more clean reps you could perform. Keep technique consistent and stop if it deteriorates.</p><p>Warm up with light, non-fatiguing sets before your working sets. Log working sets against the program targets. Rest 3–5 minutes for main lifts, 2–3 for supporting exercises and 1–2 for accessories; take longer when needed.</p><p>When all targets are met at the intended effort, increase by the smallest practical amount next time. Repeat or reduce the weight after missed reps. At a new phase, select the load again for its new sets, reps and effort.</p><p>After two poor sessions or accumulating fatigue, use roughly half the sets and lighter weights with four or more reps in reserve. Missed a day? Continue the sequence without doubling up.</p><p>These are original GTrack examples informed by Sebastian Oreb’s public principles, not official or endorsed Strength System programs. <a href="https://strengthsystem.com/all-articles/your-program-sucks-part-2/" target="_blank" rel="noopener">Load selection</a> · <a href="https://strengthsystem.com/all-articles/your-program-sucks-part-3/" target="_blank" rel="noopener">Progression</a></p></details>`;
let editingProgram: string | null = null;
let programDraft: CustomProgramDefinition;
function blankProgramDay(number: number): CustomProgramDay {
  return {
    id: uid(),
    name: `Workout ${number}`,
    schedule: `Day ${number}`,
    exercises: [
      {
        exerciseName: exercises()[0]?.name || "",
        sets: 3,
        reps: 8,
        rest: 120,
        effort: "2–3 reps in reserve",
      },
    ],
  };
}
function openProgramBuilder(id?: string) {
  const enrollment = id ? store.state.programs[id] : undefined;
  editingProgram = enrollment?.custom ? enrollment.id : null;
  programDraft = enrollment?.custom
    ? structuredClone(enrollment.custom)
    : {
        name: "",
        weeks: 8,
        estimatedMinutes: "45–60",
        sessions: [blankProgramDay(1)],
      };
  view = "program-builder";
  render();
  window.scrollTo(0, 0);
}
function captureProgramDraft() {
  const form = document.querySelector<HTMLFormElement>("#program-form");
  if (!form) return;
  const values = new FormData(form);
  programDraft.name = String(values.get("program-name") || "").trim();
  programDraft.weeks = Number(values.get("program-weeks"));
  programDraft.estimatedMinutes = String(
    values.get("program-duration") || "",
  ).trim();
  document
    .querySelectorAll<HTMLElement>(".program-day-editor")
    .forEach((dayElement, dayIndex) => {
      const day = programDraft.sessions[dayIndex];
      day.name = dayElement
        .querySelector<HTMLInputElement>("[data-program-day-name]")!
        .value.trim();
      day.schedule = dayElement
        .querySelector<HTMLInputElement>("[data-program-day-schedule]")!
        .value.trim();
      day.exercises = Array.from(
        dayElement.querySelectorAll<HTMLElement>(".program-exercise-editor"),
      ).map((exerciseElement) => ({
        exerciseName: exerciseElement.querySelector<HTMLSelectElement>(
          "[data-program-exercise-name]",
        )!.value,
        sets: Number(
          exerciseElement.querySelector<HTMLInputElement>(
            "[data-program-exercise-sets]",
          )!.value,
        ),
        reps: Number(
          exerciseElement.querySelector<HTMLInputElement>(
            "[data-program-exercise-reps]",
          )!.value,
        ),
        rest: Number(
          exerciseElement.querySelector<HTMLInputElement>(
            "[data-program-exercise-rest]",
          )!.value,
        ),
        effort: exerciseElement
          .querySelector<HTMLInputElement>("[data-program-exercise-effort]")!
          .value.trim(),
      }));
    });
}
function renderProgramBuilder() {
  const original = editingProgram
      ? store.state.programs[editingProgram]
      : undefined,
    hasHistory = original
      ? history().some(
          (session) => session.program?.enrollmentId === original.id,
        )
      : false;
  $("#screen").innerHTML =
    `<form id="program-form"><div class="card pad"><label>Program name<input name="program-name" required maxlength="60" value="${esc(programDraft.name)}" placeholder="e.g. My four-day strength plan"></label><div class="program-meta"><label>Weeks<input name="program-weeks" required type="number" min="1" max="52" step="1" inputmode="numeric" value="${programDraft.weeks}"></label><label>Session length<input name="program-duration" required maxlength="20" value="${esc(programDraft.estimatedMinutes)}" placeholder="e.g. 45–60"></label></div>${hasHistory ? '<p class="hint">This program already has recorded sessions. Saving creates a revised program from week 1; your existing history is preserved.</p>' : '<p class="hint">Changes apply to future sessions. Completed training history is never rewritten.</p>'}</div><div class="section-title"><h2>Workout days</h2><span>${programDraft.sessions.length} per week</span></div><div id="program-days">${programDraft.sessions
      .map(
        (day, dayIndex) =>
          `<section class="card pad program-day-editor" data-day="${dayIndex}"><div class="target-head"><h3>Workout ${dayIndex + 1}</h3><div><button type="button" class="text-button program-day-up" data-day="${dayIndex}" ${dayIndex === 0 ? "disabled" : ""} aria-label="Move workout ${dayIndex + 1} up">↑</button><button type="button" class="text-button program-day-remove" data-day="${dayIndex}" ${programDraft.sessions.length === 1 ? "disabled" : ""}>Remove</button></div></div><label>Workout name<input data-program-day-name required maxlength="60" value="${esc(day.name)}" placeholder="e.g. Lower A"></label><label>Schedule label<input data-program-day-schedule required maxlength="40" value="${esc(day.schedule)}" placeholder="e.g. Monday"></label><div class="program-exercises-editor">${day.exercises
            .map(
              (exercise, exerciseIndex) =>
                `<div class="program-exercise-editor" data-exercise="${exerciseIndex}"><div class="program-exercise-head"><strong>Exercise ${exerciseIndex + 1}</strong><div><button type="button" class="text-button program-exercise-up" data-day="${dayIndex}" data-exercise="${exerciseIndex}" ${exerciseIndex === 0 ? "disabled" : ""} aria-label="Move exercise ${exerciseIndex + 1} up">↑</button><button type="button" class="text-button program-exercise-remove" data-day="${dayIndex}" data-exercise="${exerciseIndex}" ${day.exercises.length === 1 ? "disabled" : ""}>Remove</button></div></div><label>Exercise<select data-program-exercise-name required aria-label="Workout ${dayIndex + 1} exercise ${exerciseIndex + 1}">${exercises()
                  .map(
                    (item) =>
                      `<option value="${esc(item.name)}" ${item.name === exercise.exerciseName ? "selected" : ""}>${esc(item.name)}</option>`,
                  )
                  .join(
                    "",
                  )}</select></label><div class="program-targets"><label>Sets<input data-program-exercise-sets required type="number" min="1" max="12" step="1" inputmode="numeric" value="${exercise.sets}" aria-label="${esc(day.name)} ${esc(exercise.exerciseName)} sets"></label><label>Reps<input data-program-exercise-reps required type="number" min="1" max="100" step="1" inputmode="numeric" value="${exercise.reps}" aria-label="${esc(day.name)} ${esc(exercise.exerciseName)} reps"></label><label>Rest sec<input data-program-exercise-rest required type="number" min="0" max="600" step="5" inputmode="numeric" value="${exercise.rest}" aria-label="${esc(day.name)} ${esc(exercise.exerciseName)} rest seconds"></label></div><label>Effort target<input data-program-exercise-effort required maxlength="80" value="${esc(exercise.effort)}" placeholder="e.g. 2 reps in reserve" aria-label="${esc(day.name)} ${esc(exercise.exerciseName)} effort target"></label></div>`,
            )
            .join(
              "",
            )}</div><button type="button" class="secondary program-exercise-add" data-day="${dayIndex}">＋ Add exercise</button><button type="button" class="text-button program-library-add" data-day="${dayIndex}">＋ New exercise for the library</button></section>`,
      )
      .join(
        "",
      )}</div><button type="button" class="secondary" id="program-day-add" ${programDraft.sessions.length >= 7 ? "disabled" : ""}>＋ Add workout day</button><div class="save-area"><button type="submit" class="primary">Save program</button><button type="button" class="danger" id="cancel-program">Cancel</button></div><p id="program-builder-error" class="error" role="alert"></p></form>`;
  action("#cancel-program", () => {
    view = "programs";
    render();
  });
  action("#program-day-add", () => {
    captureProgramDraft();
    if (programDraft.sessions.length < 7)
      programDraft.sessions.push(
        blankProgramDay(programDraft.sessions.length + 1),
      );
    renderProgramBuilder();
  });
  action(".program-day-remove", (event) => {
    captureProgramDraft();
    programDraft.sessions.splice(
      Number((event.currentTarget as HTMLElement).dataset.day),
      1,
    );
    renderProgramBuilder();
  });
  action(".program-day-up", (event) => {
    captureProgramDraft();
    const index = Number((event.currentTarget as HTMLElement).dataset.day);
    [programDraft.sessions[index - 1], programDraft.sessions[index]] = [
      programDraft.sessions[index],
      programDraft.sessions[index - 1],
    ];
    renderProgramBuilder();
  });
  action(".program-exercise-add", (event) => {
    captureProgramDraft();
    const day =
      programDraft.sessions[
        Number((event.currentTarget as HTMLElement).dataset.day)
      ];
    if (day.exercises.length < 30)
      day.exercises.push({
        exerciseName: exercises()[0]?.name || "",
        sets: 3,
        reps: 8,
        rest: 120,
        effort: "2–3 reps in reserve",
      });
    renderProgramBuilder();
  });
  action(".program-exercise-remove", (event) => {
    captureProgramDraft();
    const button = event.currentTarget as HTMLElement;
    programDraft.sessions[Number(button.dataset.day)].exercises.splice(
      Number(button.dataset.exercise),
      1,
    );
    renderProgramBuilder();
  });
  action(".program-exercise-up", (event) => {
    captureProgramDraft();
    const button = event.currentTarget as HTMLElement,
      list = programDraft.sessions[Number(button.dataset.day)].exercises,
      index = Number(button.dataset.exercise);
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    renderProgramBuilder();
  });
  action(".program-library-add", (event) => {
    captureProgramDraft();
    const dayIndex = Number((event.currentTarget as HTMLElement).dataset.day);
    exerciseDialog(0, async (exercise) => {
      programDraft.sessions[dayIndex].exercises.push({
        exerciseName: exercise.name,
        sets: 3,
        reps: 8,
        rest: 120,
        effort: "2–3 reps in reserve",
      });
      close();
      renderProgramBuilder();
    });
  });
  $("#program-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = (event.currentTarget as HTMLFormElement).querySelector(
      "button[type=submit]",
    ) as HTMLButtonElement;
    button.disabled = true;
    try {
      captureProgramDraft();
      const now = Date.now(),
        revise = Boolean(original && hasHistory),
        id = original && !revise ? original.id : uid(),
        record: ProgramEnrollment = {
          id,
          templateId: `custom-${id}`,
          version: 1,
          startedAt: original && !revise ? original.startedAt : now,
          updatedAt: now,
          archived: false,
          custom: structuredClone(programDraft),
        };
      if (!validateRecord("programs", record))
        throw Error(
          "Complete the program details and add at least one valid exercise to every workout.",
        );
      await store.mutate((state) => {
        Object.values(state.programs).forEach((program) => {
          if (!program.archived) {
            program.archived = true;
            program.updatedAt = now;
            if (store.account !== "local")
              state.pending.push({
                kind: "programs",
                id: program.id,
                token: uid(),
              });
          }
        });
        state.programs[id] = record;
        if (store.account !== "local")
          state.pending.push({ kind: "programs", id, token: uid() });
      });
      editingProgram = null;
      view = "today";
      await saved();
      toast(
        revise
          ? "Revised program saved. It starts at week 1; earlier history is preserved."
          : "Program saved. Your first workout is ready.",
      );
    } catch (error) {
      $("#program-builder-error").textContent =
        error instanceof Error ? error.message : "Could not save program.";
      button.disabled = false;
    }
  });
}
function renderPrograms() {
  const enrollments = Object.values(store.state.programs)
    .filter((enrollment) => !enrollment.deleted)
    .sort((a, b) => b.startedAt - a.startedAt);
  if (previewProgram) {
    const p = templateFor(previewProgram);
    $("#screen").innerHTML =
      `<button class="text-button" id="program-back">← All programs</button><div class="card pad"><div class="eyebrow">${p.weeks} weeks · ${p.sessions.length} days/week</div><h2>${esc(p.name)}</h2><p>${esc(p.audience)}</p><p>${esc(p.estimatedMinutes)} minutes per session · Full gym access</p><p>${p.schedule.map(esc).join("<br>")}</p><button class="primary" id="program-use">${enrollments.some((e) => e.templateId === p.id && !e.archived) ? "View my program" : "Use this program"}</button></div>${programGuidance}<label>Preview week<select id="program-week">${Array.from({ length: p.weeks }, (_, i) => `<option value="${i + 1}">Week ${i + 1} · ${esc(phaseFor(p, i + 1).name)}</option>`).join("")}</select></label><div id="program-sessions"></div>`;
    const showWeek = () => {
      const week = Number($<HTMLSelectElement>("#program-week").value),
        phase = phaseFor(p, week);
      $("#program-sessions").innerHTML = p.sessions
        .map(
          (session, i) =>
            `<article class="card pad"><div class="eyebrow">Session ${i + 1} · ${esc(phase.name)}</div><h2>${esc(session.name)}</h2><ol class="program-exercises">${session.exercises
              .map((e) => {
                const [sets, reps] = prescription(phase, e.role);
                return `<li><strong>${esc(e.exerciseName)}</strong><span>${sets} × ${reps} · ${esc(effortFor(phase, e.role, week))}</span>${guideButton(e.exerciseName)}</li>`;
              })
              .join("")}</ol></article>`,
        )
        .join("");
    };
    showWeek();
    $("#program-week").addEventListener("change", () => {
      showWeek();
      bindGuideButtons();
    });
    action("#program-back", () => {
      previewProgram = null;
      render();
    });
    action("#program-use", async () => {
      await store.mutate((state) => {
        const now = Date.now(),
          existing = Object.values(state.programs)
            .filter(
              (enrollment) =>
                enrollment.templateId === p.id && !enrollment.deleted,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt)[0],
          selectedId = existing?.id || uid();
        Object.values(state.programs).forEach((enrollment) => {
          const archived = enrollment.id !== selectedId;
          if (enrollment.archived === archived) return;
          enrollment.archived = archived;
          enrollment.updatedAt = now;
          if (store.account !== "local")
            state.pending.push({
              kind: "programs",
              id: enrollment.id,
              token: uid(),
            });
        });
        state.programs[selectedId] = existing
          ? { ...existing, archived: false, updatedAt: now }
          : {
              id: selectedId,
              templateId: p.id,
              version: 1,
              startedAt: now,
              updatedAt: now,
              archived: false,
            };
        if (store.account !== "local")
          state.pending.push({
            kind: "programs",
            id: selectedId,
            token: uid(),
          });
      });
      previewProgram = null;
      view = "today";
      await saved();
      window.scrollTo(0, 0);
      toast("Program selected. Your next workout is ready on Today.");
    });
  } else {
    $("#screen").innerHTML =
      `<button class="primary" id="create-program">＋ Create program</button>${enrollments.length ? `<div class="section-title"><h2>My programs</h2></div>${enrollments.map(programCard).join("")}` : ""}<div class="section-title"><h2>Suggested programs</h2></div><p class="hint">Use a ready-made plan or create your own sequence of workouts.</p>${programs.map((p) => `<article class="card pad"><div class="eyebrow">${p.weeks} weeks · ${p.sessions.length} days/week</div><h2>${esc(p.name)}</h2><p>${esc(p.audience)}</p><button class="secondary" data-program-preview="${p.id}">Preview ${esc(p.name.split(" — ")[0])}</button></article>`).join("")}${programGuidance}`;
    action("#create-program", () => openProgramBuilder());
    bindPrograms();
  }
}
function prepareProgramSession(id: string) {
  if (store.state.draft) {
    view = "today";
    render();
    toast("Resume or discard your current session first.");
    return;
  }
  const enrollment = store.state.programs[id];
  if (!enrollment || enrollment.archived) return;
  const p = templateForEnrollment(enrollment),
    progress = programProgress(enrollment, history());
  if (progress.finished) return;
  const phase = phaseFor(p, progress.week),
    session = p.sessions[progress.day - 1];
  modal(
    `<form id="program-prepare"><div class="eyebrow">Week ${progress.week} · Session ${progress.day} · ${esc(phase.name)}</div><h2>${esc(session.name)}</h2><p>Choose your working weights. Previous logged weights, where shown, are references—not automatic increases. Confirm each for today’s targets.</p>${session.exercises
      .map((e, i) => {
        const previous = history()
          .filter((s) => s.program?.enrollmentId === id)
          .flatMap((s) => s.exercises)
          .find((x) => x.name === e.exerciseName && x.sets.some((s) => s.done));
        const weight = previous?.sets.find((s) => s.done)?.weight;
        const [sets, reps] = exercisePrescription(phase, e);
        const description =
          exercises().find((x) => x.name === e.exerciseName)?.description || "";
        return `<label>${esc(e.exerciseName)} weight (kg)<input name="weight-${i}" required type="number" min="0" max="1000" step="0.5" inputmode="decimal" placeholder="Choose weight" value="${weight ?? ""}"></label><p class="hint">${sets} × ${reps} · ${esc(exerciseEffort(phase, e, progress.week))}<br>${esc(description)}</p>`;
      })
      .join(
        "",
      )}<p id="program-error" class="error" role="alert"></p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Start program session</button></div></form>`,
  );
  $("#program-prepare").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    try {
      const weights = session.exercises.map(
        (_, i) =>
          form.querySelector<HTMLInputElement>(`[name=weight-${i}]`)!
            .valueAsNumber,
      );
      const draft = createProgramSession(
        enrollment,
        progress.week,
        progress.day,
        exercises(),
        weights,
      );
      await store.mutate((state) => {
        if (state.draft) throw Error("A session is already in progress.");
        state.draft = draft;
      });
      close();
      view = "today";
      render();
      window.scrollTo(0, 0);
    } catch (error) {
      $("#program-error").textContent =
        error instanceof Error ? error.message : "Could not start session.";
      button.disabled = false;
    }
  });
}

function guideButton(name: string) {
  return `<button type="button" class="text-button" data-form-guide="${esc(name)}" aria-label="View form for ${esc(name)}">View form ↗</button>`;
}
function bindGuideButtons() {
  action("[data-form-guide]", (event) => {
    const name = (event.currentTarget as HTMLElement).dataset.formGuide!;
    showExerciseGuide(
      name,
      exercises().find((e) => e.name === name)?.description || "",
    );
  });
}
function showExerciseGuide(name: string, description: string) {
  const guide = guideFor(name);
  modal(`<div class="exercise-guide"><div class="guide-heading"><div><div class="eyebrow">${guide ? esc(guide.category) + " · Movement guide" : "Exercise library"}</div><h2 id="guide-title">${esc(name)}</h2></div><button type="button" class="secondary" data-close aria-label="Close exercise guide">Close</button></div>
    ${
      guide
        ? `${guide.images.length ? `<div class="guide-photos">${guide.images.map((path, i) => `<figure><img src="${photoFor(path)}" alt="${esc(name)} demonstration, position ${i + 1}" width="300" height="300"><figcaption>Position ${i + 1}</figcaption></figure>`).join("")}</div><p class="hint">Two positions of the movement; move smoothly between them.${name === "Lying leg raise" ? " Bench variation shown." : name === "Cable chest fly" ? " High-pulley variation shown." : ""}</p>` : '<p class="hint">Photos for this variation are not available yet.</p>'}
    <h3>How to move</h3><ol class="guide-steps">${guide.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol><div class="form-focus"><h3>Watch out for</h3><p>${esc(guide.avoid)}</p></div><p class="hint">Start light, use a controlled range and stop if a movement causes pain. A coach can help adapt your setup.</p>`
        : "<p>No form guide has been added for this exercise yet.</p>"
    }
    ${description ? `<h3>Library description</h3><p>${esc(description)}</p>` : ""}
    <details class="guide-sources"><summary>Demonstrations & further learning</summary>${guide?.sourceId ? `<p>Photos: <a href="https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f/exercises/${encodeURIComponent(guide.sourceId)}" target="_blank" rel="noopener">free-exercise-db</a> · public domain (Unlicense).</p>` : ""}<p><a href="https://www.acefitness.org/resources/everyone/exercise-library/" target="_blank" rel="noopener">Explore ACE’s exercise library</a> (online).</p><p>GTrack form cues are general guidance, not individual coaching or official Sebastian Oreb instruction.</p></details></div>`);
  $("#dialog").setAttribute("aria-labelledby", "guide-title");
}
function renderGuide() {
  $("#screen").innerHTML =
    `<button class="text-button" id="guide-back">← Workouts</button><p>Look up a movement before you lift, or tap View form while recording a session. Photos and cues are available offline once the app has finished downloading.</p><label>Find an exercise<input id="guide-search" type="search" placeholder="Try squat, chest, or dumbbell"></label><p id="guide-count" class="hint" role="status"></p><div id="guide-results"></div>`;
  const show = () => {
    const query = normalize($<HTMLInputElement>("#guide-search").value);
    const matches = exercises().filter((e) =>
      normalize(e.name + " " + (guideFor(e.name)?.category || "")).includes(
        query,
      ),
    );
    $("#guide-count").textContent = `${matches.length} exercises`;
    $("#guide-results").innerHTML = matches.length
      ? matches
          .map((e) => {
            const guide = guideFor(e.name);
            return `<article class="card pad guide-result"><div><div class="eyebrow">${guide ? esc(guide.category) : "Community exercise"}</div><h2>${esc(e.name)}</h2><p class="hint">${guide ? (guide.images.length ? "Photos · movement · form cues" : "Movement · form cues") : "Description only"}</p></div>${guideButton(e.name)}</article>`;
          })
          .join("")
      : '<p class="card pad">No exercises match. Try another name or body area.</p>';
    bindGuideButtons();
  };
  show();
  $("#guide-search").addEventListener("input", show);
  action("#guide-back", () => navigate("workouts"));
}

function renderWorkouts() {
  $("#screen").innerHTML =
    `<button class="secondary" id="open-guide">Exercise guide · photos & form</button><button class="primary" id="new-workout">＋ Create workout</button><button class="secondary" id="start-empty">＋ Start empty session</button><div class="section-title"><h2>My sessions</h2><span>${workouts().length} saved</span></div>${
      workouts()
        .map(
          (w) =>
            `<article class="card plan"><div class="eyebrow">${w.exercises.length} exercises · ${w.exercises.reduce((n, e) => n + e.sets, 0)} sets · ${w.rest}s rest</div><h2>${esc(w.name)}</h2><p>${w.exercises.map((e) => esc(e.name)).join(" · ")}</p><div class="actions"><button class="primary" data-start="${w.id}">Start workout</button><button class="secondary" data-edit="${w.id}" aria-label="Edit ${esc(w.name)}">Edit</button></div></article>`,
        )
        .join("") ||
      empty(
        "Your routine starts here.",
        "Create your first workout using exercises from the library.",
      )
    }`;
  action("#start-empty", () => {
    if (store.state.draft) {
      view = "today";
      render();
      toast("Resume or discard your current session first.");
    } else sessionDetails(true);
  });
  action("#open-guide", () => navigate("guide"));
  action("#new-workout", () => openBuilder());
  action("[data-edit]", (e) =>
    openBuilder((e.currentTarget as HTMLElement).dataset.edit),
  );
  bindStart();
}
function openBuilder(id?: string) {
  editing = id || null;
  draftTargets = structuredClone(id ? store.state.workouts[id].exercises : []);
  view = "builder";
  render();
  window.scrollTo(0, 0);
}
function renderBuilder() {
  const w = editing ? store.state.workouts[editing] : null;
  $("#screen").innerHTML =
    `<form id="workout-form"><div class="card pad"><label>Workout name<input name="name" required maxlength="60" value="${esc(w?.name || "")}" placeholder="e.g. Upper body A"></label><label>Rest between sets (seconds)<input name="rest" required type="number" inputmode="numeric" min="0" max="600" step="1" value="${w?.rest ?? 90}"></label></div><div class="section-title"><h2>Exercises</h2><span>In training order</span></div><p class="hint">Choose from the library or contribute a new exercise.</p><div id="targets"></div><button class="secondary" type="button" id="add-target">＋ Add exercise</button><div class="save-area"><button class="primary" type="submit">Save workout</button>${w ? '<button class="danger" type="button" id="archive">Archive workout</button>' : ""}</div></form>`;
  if (!draftTargets.length)
    draftTargets.push({
      exerciseId: "",
      name: "",
      description: "",
      sets: 3,
      reps: 10,
      weight: 0,
      tracking: "weight_reps",
      unit: "kg",
    });
  renderTargets();
  action("#add-target", () => {
    captureTargets();
    if (draftTargets.length >= 30) {
      toast("A workout can contain up to 30 exercises.");
      return;
    }
    draftTargets.push({
      exerciseId: "",
      name: "",
      description: "",
      sets: 3,
      reps: 10,
      weight: 0,
      tracking: "weight_reps",
      unit: "kg",
    });
    renderTargets();
    $<HTMLSelectElement>("#targets .target:last-child select").focus();
  });
  $("#workout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $<HTMLButtonElement>("#workout-form button[type=submit]");
    submit.disabled = true;
    try {
      captureTargets();
      const f = new FormData(event.currentTarget as HTMLFormElement);
      const record: Workout = {
        id: editing || uid(),
        name: String(f.get("name")).trim(),
        rest: Number(f.get("rest")),
        exercises: structuredClone(draftTargets),
        updatedAt: Date.now(),
        archived: false,
      };
      if (!validateRecord("workouts", record))
        throw new Error(
          "Give the workout a name and select at least one exercise with valid targets.",
        );
      for (const e of record.exercises)
        await store.put("exercises", store.state.exercises[e.exerciseId]);
      await store.put("workouts", record);
      view = "workouts";
      await saved();
      toast("Workout saved.");
    } catch (e) {
      fail(e);
      submit.disabled = false;
    }
  });
  action("#archive", () => {
    modal(
      '<h2>Archive this workout?</h2><p>It will leave your workout list. Your completed history stays intact.</p><div class="actions"><button class="secondary" data-close>Cancel</button><button class="primary" id="archive-confirm">Archive</button></div>',
    );
    action("#archive-confirm", async () => {
      await store.put("workouts", {
        ...w!,
        archived: true,
        updatedAt: Date.now(),
      });
      close();
      view = "workouts";
      await saved();
    });
  });
}
function captureTargets() {
  draftTargets = [...document.querySelectorAll<HTMLElement>(".target")].map(
    (card) => {
      const id = card.querySelector<HTMLSelectElement>(
        "select[data-index]",
      )!.value;
      const e = store.state.exercises[id];
      return {
        exerciseId: id,
        name: e?.name || "",
        description: e?.description || "",
        ...captureSetTargets(card),
      };
    },
  );
}
function captureSetTargets(card: HTMLElement) {
  const tracking = card.querySelector<HTMLSelectElement>(
      "[name=tracking]",
    )!.value as TrackingType,
    unitSelect = card.querySelector<HTMLSelectElement>("[name=unit]"),
    selectedUnit = unitSelect?.value as MeasureUnit | undefined,
    unit =
      tracking === "reps"
        ? undefined
        : unitChoices[tracking].includes(selectedUnit as MeasureUnit)
          ? selectedUnit
          : unitChoices[tracking][0];
  const rows = [
    ...card.querySelectorAll<HTMLElement>(".set-rows .planned-set"),
  ];
  const values = rows.map((row) => ({
    reps:
      row.querySelector<HTMLInputElement>("[name=reps]")?.valueAsNumber || 1,
    weight:
      row.querySelector<HTMLInputElement>("[name=weight]")?.valueAsNumber || 0,
    ...(row.querySelector<HTMLInputElement>("[name=value]")
      ? {
          value:
            row.querySelector<HTMLInputElement>("[name=value]")!
              .valueAsNumber || 0,
        }
      : {}),
  }));
  const count =
    card.querySelector<HTMLInputElement>("[name=sets]")!.valueAsNumber;
  // A changed count preserves existing sets and copies the last set for new rows.
  if (Number.isInteger(count) && count >= 1 && count <= 12) {
    while (values.length < count)
      values.push({
        ...(values.at(-1) || {
          reps: tracking === "reps" ? 10 : 1,
          weight: 0,
          ...(["duration", "distance"].includes(tracking)
            ? { value: 0 }
            : {}),
        }),
      });
    values.length = count;
  }
  return {
    sets: count,
    reps: values[0]?.reps ?? 10,
    weight: values[0]?.weight ?? 0,
    tracking,
    ...(unit ? { unit } : {}),
    setTargets: values,
  };
}
function targetRows(target: Target, exerciseIndex: number) {
  const sets = plannedSets(target),
    tracking = trackingFor(target),
    unit = unitFor(target);
  return sets
    .map(
      (set, index) =>
        `<div class="planned-set"><span class="set-number">${index + 1}</span>${tracking === "weight_reps" ? `<input name="reps" required type="number" inputmode="numeric" min="1" max="100" step="1" value="${set.reps}" aria-label="Exercise ${exerciseIndex + 1} set ${index + 1} reps"><input name="weight" required type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${set.weight}" aria-label="Exercise ${exerciseIndex + 1} set ${index + 1} weight (${unit})">` : tracking === "reps" ? `<input name="reps" required type="number" inputmode="numeric" min="1" max="100" step="1" value="${set.reps}" aria-label="Exercise ${exerciseIndex + 1} set ${index + 1} reps"><span class="unit-cell">reps</span>` : `<input name="value" required type="number" inputmode="decimal" min="0" max="10000000" step="${unit === "sec" || unit === "m" ? "1" : "0.1"}" value="${set.value || 0}" aria-label="Exercise ${exerciseIndex + 1} set ${index + 1} ${tracking}"><span class="unit-cell">${unit}</span>`}<button type="button" class="remove-set" data-exercise="${exerciseIndex}" data-set="${index}" ${sets.length === 1 ? "disabled" : ""} aria-label="Remove exercise ${exerciseIndex + 1} set ${index + 1}">×</button></div>`,
    )
    .join("");
}
function removePlannedSet(event: Event) {
  captureTargets();
  const button = event.currentTarget as HTMLElement;
  const target = draftTargets[Number(button.dataset.exercise)];
  const sets = plannedSets(target);
  if (sets.length <= 1) return;
  sets.splice(Number(button.dataset.set), 1);
  Object.assign(target, {
    sets: sets.length,
    reps: sets[0].reps,
    weight: sets[0].weight,
    setTargets: sets,
  });
  renderTargets();
}
function renderTargets() {
  $("#targets").innerHTML = draftTargets
    .map(
      (t, i) =>
        `<div class="card pad target"><div class="target-head"><h3>Exercise ${i + 1}</h3><div><button type="button" class="text-button move" data-index="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move exercise ${i + 1} up">↑</button><button type="button" class="text-button remove" data-index="${i}" aria-label="Remove exercise ${i + 1}">Remove</button></div></div><label>Search exercise<input type="search" class="target-search" placeholder="Type a name"></label><label>Exercise from library<select required data-index="${i}"><option value="">Choose an exercise…</option>${exercises()
          .map(
            (e) =>
              `<option value="${e.id}" ${e.id === t.exerciseId ? "selected" : ""}>${esc(e.name)}</option>`,
          )
          .join(
            "",
          )}</select></label><button type="button" class="text-button target-guide">View form</button><p class="description">${esc(t.description || "Select an exercise to see its description.")}</p><button type="button" class="text-button new-exercise" data-index="${i}">＋ New exercise for the library</button><div class="tracking-controls"><label>Track by<select name="tracking">${trackingOptions(trackingFor(t))}</select></label>${trackingFor(t) === "reps" ? "" : `<label>Unit<select name="unit">${unitOptions(trackingFor(t), unitFor(t))}</select></label>`}</div><div class="set-controls"><label>Sets<input name="sets" required type="number" inputmode="numeric" min="1" max="12" step="1" value="${t.sets}" data-exercise="${i}"></label><p class="hint">Set the target for each set.</p></div><div class="planned-set labels"><span>Set</span><span>${trackingFor(t) === "weight_reps" ? "Reps" : trackingFor(t) === "reps" ? "Reps" : trackingLabel[trackingFor(t)]}</span><span>${trackingFor(t) === "weight_reps" ? unitFor(t) : trackingFor(t) === "reps" ? "" : "Unit"}</span><span></span></div><div class="set-rows">${targetRows(t, i)}</div><button type="button" class="text-button add-set" data-exercise="${i}" ${t.sets >= 12 ? "disabled" : ""}>＋ Add set</button></div>`,
    )
    .join("");
  action(".target-guide", (event) => {
    const select = (event.currentTarget as HTMLElement)
      .closest(".target")!
      .querySelector("select")!;
    const exercise = store.state.exercises[select.value];
    if (exercise) showExerciseGuide(exercise.name, exercise.description);
    else toast("Choose an exercise first.");
  });
  document
    .querySelectorAll<HTMLInputElement>("#targets .target-search")
    .forEach((input) =>
      input.addEventListener("input", () => {
        const query = normalize(input.value),
          select = input
            .closest(".target")!
            .querySelector<HTMLSelectElement>("select[data-index]")!;
        for (const option of select.options)
          option.hidden = Boolean(option.value) &&
            !normalize(option.textContent || "").includes(query);
      }),
    );
  document
    .querySelectorAll<HTMLInputElement>("#targets [name=sets]")
    .forEach((input) =>
      input.addEventListener("input", () => {
        if (!input.checkValidity()) return;
        captureTargets();
        const index = Number(input.dataset.exercise);
        const card = input.closest<HTMLElement>(".target")!;
        card.querySelector(".set-rows")!.innerHTML = targetRows(
          draftTargets[index],
          index,
        );
        card.querySelector<HTMLButtonElement>(".add-set")!.disabled =
          draftTargets[index].sets >= 12;
        action(
          `#targets .target:nth-child(${index + 1}) .remove-set`,
          removePlannedSet,
        );
      }),
    );
  action(".add-set", (event) => {
    captureTargets();
    const target =
      draftTargets[
        Number((event.currentTarget as HTMLElement).dataset.exercise)
      ];
    if (target.sets >= 12) return;
    const sets = plannedSets(target);
    sets.push({ ...sets.at(-1)! });
    target.sets = sets.length;
    target.setTargets = sets;
    renderTargets();
  });
  action(".remove-set", removePlannedSet);
  document.querySelectorAll("#targets select[data-index]").forEach((s) =>
    s.addEventListener("change", () => {
      captureTargets();
      const description =
        store.state.exercises[(s as HTMLSelectElement).value]?.description;
      s.closest(".target")!.querySelector(".description")!.textContent =
        description || "Select an exercise to see its description.";
    }),
  );
  document
    .querySelectorAll<HTMLSelectElement>("#targets [name=tracking], #targets [name=unit]")
    .forEach((select) =>
      select.addEventListener("change", () => {
        captureTargets();
        renderTargets();
      }),
    );
  action(".remove", (e) => {
    captureTargets();
    draftTargets.splice(
      Number((e.currentTarget as HTMLElement).dataset.index),
      1,
    );
    renderTargets();
  });
  action(".move", (e) => {
    captureTargets();
    const i = Number((e.currentTarget as HTMLElement).dataset.index);
    [draftTargets[i - 1], draftTargets[i]] = [
      draftTargets[i],
      draftTargets[i - 1],
    ];
    renderTargets();
  });
  action(".new-exercise", (e) => {
    captureTargets();
    exerciseDialog(Number((e.currentTarget as HTMLElement).dataset.index));
  });
}
function exerciseDialog(
  index: number,
  onSelected?: (exercise: Exercise) => Promise<void>,
) {
  modal(
    `<form id="exercise-form"><div class="eyebrow">${store.account === "local" ? "Device" : "Shared"} exercise library</div><h2>Add an exercise</h2><p>${store.account === "local" ? "Saved on this device. Export/import to bring it to a cloud account." : "Names and descriptions are shared with all signed-in users."}</p><label>Exercise name<input name="name" required maxlength="80" placeholder="e.g. Incline dumbbell press"></label><label>Description<textarea name="description" required maxlength="600" placeholder="Describe the movement, equipment and how to record weight."></textarea></label><p id="exercise-error" class="error" role="alert"></p><div class="actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="submit">Add to library</button></div></form>`,
  );
  $("#exercise-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $<HTMLButtonElement>("#exercise-form button[type=submit]");
    button.disabled = true;
    try {
      const f = new FormData(event.currentTarget as HTMLFormElement);
      const name = String(f.get("name"))
          .normalize("NFKC")
          .trim()
          .replace(/\s+/g, " "),
        description = String(f.get("description")).trim();
      if (!name || !description)
        throw new Error("Enter a name and description.");
      const id = await exerciseId(name);
      const existing =
        store.state.exercises[id] ||
        exercises().find((e) => normalize(e.name) === normalize(name));
      const exercise: Exercise = existing || {
        id,
        name,
        description,
        createdAt: Date.now(),
      };
      if (!existing) await store.put("exercises", exercise);
      if (onSelected) {
        await onSelected(exercise);
      } else {
        draftTargets[index] = {
          ...draftTargets[index],
          exerciseId: exercise.id,
          name: exercise.name,
          description: exercise.description,
        };
        close();
        renderTargets();
      }
      void cloud?.flush();
      toast(
        existing
          ? "Already in the library — selected the existing exercise."
          : "Exercise added to the library.",
      );
    } catch (e) {
      $("#exercise-error").textContent =
        e instanceof Error ? e.message : "Could not save exercise.";
      button.disabled = false;
    }
  });
}
function bindStart() {
  action("[data-start]", async (e) => {
    if (store.state.draft) {
      view = "today";
      render();
      toast("Resume or discard your current session first.");
      return;
    }
    await store.saveDraft(
      startSession(
        store.state.workouts[(e.currentTarget as HTMLElement).dataset.start!],
      ),
    );
    view = "today";
    render();
    window.scrollTo(0, 0);
  });
}
// Structural edits use the latest stored draft, after any pending input saves.
let sessionEditing = false;
function validSessionInputs() {
  for (const input of document.querySelectorAll<HTMLInputElement>(
    "#logging input",
  ))
    if (!input.disabled && !input.reportValidity()) return false;
  return true;
}
async function editSession(change: (session: Session) => void) {
  if (sessionEditing || !validSessionInputs()) return;
  sessionEditing = true;
  try {
    await store.mutate((state) => {
      if (state.draft) change(state.draft);
    });
    close();
    render();
  } finally {
    sessionEditing = false;
  }
}
function sessionDetails(isNew = false) {
  if (!isNew && !validSessionInputs()) return;
  const draft = store.state.draft;
  modal(
    `<form id="session-details"><h2>${isNew ? "Start a session" : "Session details"}</h2><label>Session name<input name="name" required maxlength="60" value="${esc(isNew ? "Freestyle workout" : draft!.workoutName)}"></label><label>Rest between sets (seconds)<input name="rest" type="number" required min="0" max="600" step="1" value="${isNew ? 90 : draft!.rest}"></label><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">${isNew ? "Start session" : "Save details"}</button></div></form>`,
  );
  $("#session-details").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form),
      name = String(values.get("name")).trim(),
      rest = Number(values.get("rest"));
    if (!name) {
      form.querySelector<HTMLInputElement>("[name=name]")!.focus();
      return;
    }
    try {
      if (isNew) {
        await store.mutate((state) => {
          if (!state.draft)
            state.draft = {
              id: uid(),
              workoutName: name,
              rest,
              startedAt: Date.now(),
              completedAt: 0,
              exercises: [],
            };
        });
        close();
        view = "today";
        render();
      } else
        await editSession((session) => {
          session.workoutName = name;
          session.rest = rest;
        });
    } catch (error) {
      fail(error);
    }
  });
}
function sessionExerciseDialog() {
  if (!validSessionInputs()) return;
  if (!store.state.draft || store.state.draft.exercises.length >= 30) return;
  const add = async (
    exercise: Exercise,
    tracking: TrackingType = "weight_reps",
    unit?: MeasureUnit,
    keepOpen = false,
  ) => {
    await editSession((session) => {
      if (session.exercises.length < 30)
        session.exercises.push({
          exerciseId: exercise.id,
          name: exercise.name,
          description: exercise.description,
          tracking,
          ...(unit ? { unit } : {}),
          sets: [
            {
              reps: tracking === "reps" ? 10 : 1,
              weight: 0,
              ...(["duration", "distance"].includes(tracking)
                ? { value: 0 }
                : {}),
              done: false,
            },
          ],
        });
    });
    if (keepOpen) sessionExerciseDialog();
  };
  modal(
    `<form id="session-exercise"><h2>Add exercises to session</h2><label>Search exercises<input id="session-exercise-search" type="search" placeholder="Search by exercise name"></label><label>Exercise from library<select required multiple size="8">${exercises()
      .map((e) => `<option value="${e.id}">${esc(e.name)}</option>`)
      .join(
        "",
      )}</select></label><p class="hint">Select one or several exercises.</p><div class="tracking-controls"><label>Track by<select id="session-tracking">${trackingOptions("weight_reps")}</select></label><label id="session-unit-label">Unit<select id="session-unit">${unitOptions("weight_reps", "kg")}</select></label></div><p id="session-description" class="description"></p><button type="button" class="text-button" id="session-new-exercise">＋ New exercise for the library</button><p class="hint">Each exercise starts with one set. You can add or remove sets while recording.</p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Add to session</button></div></form>`,
  );
  const select = $<HTMLSelectElement>("#session-exercise select[multiple]"),
    trackingSelect = $<HTMLSelectElement>("#session-tracking"),
    unitSelect = $<HTMLSelectElement>("#session-unit");
  select.addEventListener("change", () => {
    $("#session-description").textContent =
      select.selectedOptions.length === 1
        ? store.state.exercises[select.value]?.description || ""
        : `${select.selectedOptions.length} exercises selected`;
  });
  $("#session-exercise-search").addEventListener("input", (event) => {
    const query = normalize((event.currentTarget as HTMLInputElement).value);
    for (const option of select.options)
      option.hidden = !normalize(option.textContent || "").includes(query);
  });
  trackingSelect.addEventListener("change", () => {
    const tracking = trackingSelect.value as TrackingType,
      label = $("#session-unit-label");
    label.hidden = tracking === "reps";
    unitSelect.innerHTML = unitOptions(
      tracking,
      unitChoices[tracking][0] || "kg",
    );
  });
  $("#session-exercise").addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = [...select.selectedOptions]
      .map((option) => store.state.exercises[option.value])
      .filter(Boolean);
    if (!selected.length) return select.reportValidity();
    const tracking = trackingSelect.value as TrackingType,
      unit = tracking === "reps" ? undefined : (unitSelect.value as MeasureUnit);
    close();
    for (const exercise of selected) await add(exercise, tracking, unit);
  });
  action("#session-new-exercise", () =>
    exerciseDialog(0, (exercise) =>
      add(
        exercise,
        trackingSelect.value as TrackingType,
        trackingSelect.value === "reps"
          ? undefined
          : (unitSelect.value as MeasureUnit),
      ),
    ),
  );
}
function removeSessionItem(exerciseIndex: number, setIndex?: number) {
  if (!validSessionInputs()) return;
  const exercise = store.state.draft?.exercises[exerciseIndex];
  if (!exercise || (setIndex !== undefined && exercise.sets.length <= 1))
    return;
  const change = (session: Session) => {
    if (setIndex === undefined) session.exercises.splice(exerciseIndex, 1);
    else session.exercises[exerciseIndex].sets.splice(setIndex, 1);
  };
  return editSession(change);
}
function restStorageKey() {
  return `gtrack-rest-${store.account}`;
}
function persistRest(sessionId: string) {
  try {
    localStorage.setItem(
      restStorageKey(),
      JSON.stringify({ sessionId, until: restUntil, duration: restDuration }),
    );
  } catch {
    // The timer still works when private browsing blocks localStorage.
  }
}
function clearRestStorage() {
  try {
    localStorage.removeItem(restStorageKey());
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}
function createRestChimeUrl() {
  const sampleRate = 8000,
    duration = 0.44,
    sampleCount = Math.floor(sampleRate * duration),
    buffer = new ArrayBuffer(44 + sampleCount),
    view = new DataView(buffer),
    text = (offset: number, value: string) =>
      [...value].forEach((character, index) =>
        view.setUint8(offset + index, character.charCodeAt(0)),
      );
  text(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, sampleCount, true);
  for (let index = 0; index < sampleCount; index++) {
    const time = index / sampleRate;
    let sample = 0;
    if (time < 0.17)
      sample =
        Math.sin(2 * Math.PI * 880 * time) * Math.sin((Math.PI * time) / 0.17);
    else if (time >= 0.22 && time < 0.42) {
      const noteTime = time - 0.22;
      sample =
        Math.sin(2 * Math.PI * 1175 * noteTime) *
        Math.sin((Math.PI * noteTime) / 0.2);
    }
    view.setUint8(44 + index, 128 + Math.round(sample * 72));
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}
function prepareRestAudio() {
  try {
    if (!restChime) {
      restChime = new Audio(createRestChimeUrl());
      restChime.preload = "auto";
      restChime.setAttribute("playsinline", "");
    }
    restChime.volume = 0.0001;
    const unlock = restChime.play();
    void unlock
      ?.then(() => {
        restChime?.pause();
        if (restChime) {
          restChime.currentTime = 0;
          restChime.volume = 1;
        }
      })
      .catch(() => undefined);
    restAudio ||= new AudioContext();
    if (restAudio.state === "suspended") void restAudio.resume();
    const oscillator = restAudio.createOscillator(),
      gain = restAudio.createGain();
    gain.gain.setValueAtTime(0.0001, restAudio.currentTime);
    oscillator.connect(gain).connect(restAudio.destination);
    oscillator.start();
    oscillator.stop(restAudio.currentTime + 0.01);
  } catch {
    // Visual and vibration alerts remain available when audio is unsupported.
  }
}
function pingWebAudio() {
  if (!restAudio) return;
  void restAudio
    .resume()
    .then(() => {
      const now = restAudio!.currentTime;
      [
        [0, 880],
        [0.2, 1175],
      ].forEach(([delay, frequency]) => {
        const oscillator = restAudio!.createOscillator(),
          gain = restAudio!.createGain(),
          start = now + delay;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.24, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain).connect(restAudio!.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.18);
      });
    })
    .catch(() => undefined);
}
function pingRest() {
  if (!restChime) {
    pingWebAudio();
    return;
  }
  restChime.pause();
  restChime.currentTime = 0;
  restChime.volume = 1;
  void restChime.play().catch(pingWebAudio);
}
async function requestRestAlerts() {
  if (typeof Notification === "undefined") {
    toast("System notifications are not available in this browser.");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(
    permission === "granted"
      ? "Rest-complete alerts are enabled."
      : "Alerts remain off. You can change this in your phone settings.",
  );
  render();
}
function restCompletePopup() {
  document.querySelector("#rest-complete-popup")?.remove();
  const popup = document.createElement("div");
  popup.id = "rest-complete-popup";
  popup.setAttribute("role", "alert");
  popup.innerHTML = `<div><span class="eyebrow">Timer finished</span><strong>Rest complete</strong><p>Ready for your next set.</p></div><button aria-label="Dismiss rest complete notification">×</button>`;
  document.body.append(popup);
  popup.querySelector("button")!.addEventListener("click", () => popup.remove());
  window.setTimeout(() => popup.remove(), 12000);
}
async function notifyRestComplete() {
  restCompletePopup();
  if (typeof Notification === "undefined" || Notification.permission !== "granted")
    return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    await registration?.showNotification("Rest complete", {
      body: "Ready for your next set.",
      tag: "gtrack-rest-complete",
      icon: new URL("./icon-192.png", location.href).href,
    });
  } catch {
    // The in-app popup, sound and vibration still confirm completion.
  }
}
function startRest(seconds: number, unlockAudio = true) {
  const draft = store.state.draft;
  if (!draft || seconds <= 0) return;
  if (unlockAudio) prepareRestAudio();
  restDuration = seconds;
  restUntil = Date.now() + seconds * 1000;
  restAlerted = false;
  loadedRestSession = draft.id;
  persistRest(draft.id);
  updateRest();
}
function stopRest() {
  restUntil = 0;
  restAlerted = false;
  loadedRestSession = "";
  clearRestStorage();
  updateRest();
}
function restoreRest(draft: Session) {
  if (loadedRestSession === draft.id) return;
  loadedRestSession = draft.id;
  restDuration = draft.rest || 90;
  restUntil = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(restStorageKey()) || "null");
    if (
      saved?.sessionId === draft.id &&
      Number.isFinite(saved.until) &&
      Number.isFinite(saved.duration)
    ) {
      restUntil = saved.until;
      restDuration = saved.duration;
      restAlerted = false;
    } else clearRestStorage();
  } catch {
    clearRestStorage();
  }
}
function previousPerformance(exerciseId: string, name: string) {
  const normalizedName = normalize(name);
  for (const session of history()) {
    const exercise = session.exercises.find(
      (item) =>
        item.exerciseId === exerciseId ||
        normalize(item.name) === normalizedName,
    );
    const sets = exercise?.sets.filter((set) => set.done) || [];
    if (sets.length) return { session, sets };
  }
  return null;
}
function previousPerformanceHtml(exerciseId: string, name: string) {
  const previous = previousPerformance(exerciseId, name);
  if (!previous)
    return '<div class="previous-performance"><div class="eyebrow">Last time</div><p>No previous result yet.</p></div>';
  const exercise = previous.session.exercises.find(
    (item) =>
      item.exerciseId === exerciseId || normalize(item.name) === normalize(name),
  )!;
  const result = previous.sets
    .map((set) => setSummary(exercise, set))
    .join(" · ");
  return `<div class="previous-performance"><div class="eyebrow">Last time · ${date(previous.session.completedAt)}</div><strong>${previous.sets.length} ${previous.sets.length === 1 ? "set" : "sets"}</strong><p>${esc(result)}<br><span>${esc(previous.session.workoutName)}</span></p></div>`;
}
function sessionSetLabels(exercise: SessionExercise) {
  const tracking = trackingFor(exercise);
  if (tracking === "weight_reps") return [unitFor(exercise), "Reps"];
  if (tracking === "reps") return ["Reps", ""];
  return [trackingLabel[tracking], unitFor(exercise)];
}
function sessionSetRows(exercise: SessionExercise, exerciseIndex: number) {
  const tracking = trackingFor(exercise),
    unit = unitFor(exercise);
  return exercise.sets
    .map((set, setIndex) => {
      const label = `${esc(exercise.name)} set ${setIndex + 1}`;
      const fields =
        tracking === "weight_reps"
          ? `<input required type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${set.weight}" data-ex="${exerciseIndex}" data-set="${setIndex}" data-field="weight" aria-label="${label} weight" ${set.done ? "disabled" : ""}><input required type="number" inputmode="numeric" min="1" max="100" step="1" value="${set.reps}" data-ex="${exerciseIndex}" data-set="${setIndex}" data-field="reps" aria-label="${label} reps" ${set.done ? "disabled" : ""}>`
          : tracking === "reps"
            ? `<input required type="number" inputmode="numeric" min="1" max="100" step="1" value="${set.reps}" data-ex="${exerciseIndex}" data-set="${setIndex}" data-field="reps" aria-label="${label} reps" ${set.done ? "disabled" : ""}><span class="unit-cell">reps</span>`
            : `<input required type="number" inputmode="decimal" min="0" max="10000000" step="${unit === "sec" || unit === "m" ? "1" : "0.1"}" value="${set.value || 0}" data-ex="${exerciseIndex}" data-set="${setIndex}" data-field="value" aria-label="${label} ${tracking}" ${set.done ? "disabled" : ""}><span class="unit-cell">${unit}</span>`;
      return `<div class="set-grid session-set"><span>${setIndex + 1}</span>${fields}<button class="check" data-ex="${exerciseIndex}" data-set="${setIndex}" aria-pressed="${set.done}" aria-label="Complete ${label}">✓</button><button class="text-button" data-session-set-remove="${exerciseIndex}" data-set="${setIndex}" ${exercise.sets.length <= 1 ? "disabled" : ""} aria-label="Remove ${label}">×</button></div>`;
    })
    .join("");
}
function renderToday() {
  const draft = store.state.draft;
  if (!draft) {
    const list = workouts(),
      program = currentProgram(),
      alternatives = `${list.length ? `${list.map((w) => `<article class="card plan"><h2>${esc(w.name)}</h2><p>${w.exercises.length} exercises · ${w.exercises.reduce((n, e) => n + e.sets, 0)} sets</p><button class="primary" data-start="${w.id}">Start workout</button></article>`).join("")}` : empty("Make room for your first workout.", "Build a session, then come here to log every set.", '<button class="primary" id="first-workout">Create workout</button>')}<button class="secondary" id="start-empty">＋ Start empty session</button>`;
    $("#screen").innerHTML =
      `${program ? todayProgramCard(program) : '<div class="card pad no-program"><div class="eyebrow">Training plan</div><h2>Follow a program</h2><p>Choose a structured program once and Today will always show your next workout.</p><button class="primary" id="choose-program">Choose a program</button></div>'}${history().length ? `<div class="summary"><span><strong>${history().length}</strong> sessions</span><span><strong>${fmt(history().reduce((n, s) => n + volume(s), 0))}</strong> kg logged</span></div>` : ""}${program ? `<details class="other-workouts"><summary>Choose a different workout</summary>${alternatives}</details>` : `<div class="section-title"><h2>Choose a session</h2></div>${alternatives}`}`;
    action("#start-empty", () => sessionDetails(true));
    action("#first-workout", () => openBuilder());
    action("#choose-program", () => navigate("programs"));
    bindPrograms();
    bindStart();
    return;
  }
  restoreRest(draft);
  const total = draft.exercises.reduce((n, e) => n + e.sets.length, 0),
    done = completedSets(draft),
    draftEnrollment = draft.program
      ? store.state.programs[draft.program.enrollmentId]
      : undefined,
    draftTemplate = draftEnrollment
      ? templateForEnrollment(draftEnrollment)
      : undefined;
  $("#screen").innerHTML =
    `<div class="card session-head"><div class="eyebrow">In progress · ${done} / ${total} sets</div><h2>${esc(draft.workoutName)}</h2>${draft.program && draftTemplate ? `<p>${esc(draftTemplate.name)} · Week ${draft.program.week}, session ${draft.program.day}<br>${esc(phaseFor(draftTemplate, draft.program.week).name)}</p>` : ""}<button class="text-button" id="edit-session-details">Edit session details</button><p>Started ${new Date(draft.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · <span id="draft-status" role="status">Saved on phone</span></p><div class="progress-line"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div><button class="primary" id="finish" ${!done ? "disabled" : ""}>Finish workout${done < total ? " · " + done + "/" + total + " sets" : ""}</button><div id="rest-timer" role="status"></div></div><div id="logging">${draft.exercises.map((e, i) => { const labels = sessionSetLabels(e); return `<section class="card pad logging-exercise"><div class="eyebrow">Exercise ${i + 1} / ${draft.exercises.length} · ${trackingLabel[trackingFor(e)]}</div><h2>${esc(e.name)}</h2>${e.guidance ? `<p class="training-guidance">${esc(e.guidance)}</p>` : ""}<div class="actions"><button class="text-button" data-session-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(e.name)} up">↑ Move up</button><button class="text-button" data-session-remove="${i}" aria-label="Remove ${esc(e.name)}">Remove exercise</button></div>${guideButton(e.name)}<details><summary>Exercise description</summary><p class="description">${esc(e.description)}</p></details><div class="set-grid session-set labels"><span>Set</span><span>${labels[0]}</span><span>${labels[1]}</span><span>Done</span><span></span></div>${sessionSetRows(e, i)}<button class="text-button" data-session-set-add="${i}" ${e.sets.length >= 12 ? "disabled" : ""} aria-label="Add set to ${esc(e.name)}">＋ Add set</button></section>`; }).join("")}</div>${!draft.exercises.length ? '<p class="hint">Add your first exercise to start recording. Build this session as you go.</p>' : ""}<button class="secondary" id="session-add" ${draft.exercises.length >= 30 ? "disabled" : ""}>＋ Add exercise</button><button class="danger" id="discard">Discard this session</button>`;
  const restTimer = $("#rest-timer");
  restTimer.removeAttribute("role");
  restTimer.setAttribute("aria-label", "Rest timer");
  restTimer.innerHTML = `<div><span class="eyebrow">Rest timer</span><strong id="rest-time" role="timer" aria-live="polite">Ready</strong></div><div class="rest-actions"><button class="secondary" id="rest-start">Start ${draft.rest || 90} sec</button><button class="secondary" id="rest-add">+30 sec</button><button class="text-button" id="rest-skip">Skip</button></div>`;
  document
    .querySelectorAll(".logging-exercise")
    .forEach((card, index) =>
      card
        .querySelector(".set-grid.labels")
        ?.insertAdjacentHTML(
          "beforebegin",
          previousPerformanceHtml(
            draft.exercises[index].exerciseId,
            draft.exercises[index].name,
          ),
        ),
    );
  action("#edit-session-details", () => sessionDetails());
  action("#rest-start", () => startRest(draft.rest || 90));
  action("#rest-add", () => {
    if (restUntil > Date.now()) {
      restUntil += 30_000;
      restDuration += 30;
      restAlerted = false;
      persistRest(draft.id);
      updateRest();
    }
  });
  action("#rest-skip", stopRest);
  action("#session-add", sessionExerciseDialog);
  action("[data-session-remove]", (event) =>
    removeSessionItem(
      Number((event.currentTarget as HTMLElement).dataset.sessionRemove),
    ),
  );
  action("[data-session-set-remove]", (event) => {
    const button = event.currentTarget as HTMLElement;
    return removeSessionItem(
      Number(button.dataset.sessionSetRemove),
      Number(button.dataset.set),
    );
  });
  action("[data-session-up]", (event) => {
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.sessionUp,
    );
    return editSession((session) => {
      if (index > 0)
        [session.exercises[index - 1], session.exercises[index]] = [
          session.exercises[index],
          session.exercises[index - 1],
        ];
    });
  });
  action("[data-session-set-add]", (event) => {
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.sessionSetAdd,
    );
    return editSession((session) => {
      const sets = session.exercises[index].sets;
      if (sets.length < 12) sets.push({ ...sets.at(-1)!, done: false });
    });
  });
  document
    .querySelectorAll<HTMLInputElement>("#logging input")
    .forEach((input) =>
      input.addEventListener("input", async () => {
        if (!input.checkValidity()) {
          $("#draft-status").textContent =
            "Enter a valid weight and reps to save";
          return;
        }
        $("#draft-status").textContent = "Saving…";
        const value = Number(input.value);
        try {
          await store.mutate((state) => {
            if (state.draft)
              state.draft.exercises[Number(input.dataset.ex)].sets[
                Number(input.dataset.set)
              ][input.dataset.field as "weight" | "reps" | "value"] = value;
          });
          const status = document.querySelector("#draft-status");
          if (status) status.textContent = "Saved on phone";
        } catch (e) {
          const status = document.querySelector("#draft-status");
          if (status) status.textContent = "Not saved — check device storage";
          fail(e);
        }
      }),
    );
  action(".check", async (event) => {
    const b = event.currentTarget as HTMLElement;
    for (const input of b.parentElement!.querySelectorAll<HTMLInputElement>(
      "input",
    ))
      if (!input.disabled && !input.reportValidity()) return;
    // iOS standalone apps require audio to be unlocked during the tap itself.
    // IndexedDB work below can outlive the browser's transient user activation.
    prepareRestAudio();
    const inputs = b.parentElement!.querySelectorAll<HTMLInputElement>("input");
    await store.mutate((state) => {
      if (!state.draft) return;
      const set =
        state.draft.exercises[Number(b.dataset.ex)].sets[Number(b.dataset.set)];
      for (const input of inputs)
        set[input.dataset.field as "weight" | "reps" | "value"] = Number(
          input.value,
        );
      set.done = !set.done;
      const rest =
        state.draft.exercises[Number(b.dataset.ex)].rest ?? state.draft.rest;
      if (set.done && rest) startRest(rest, false);
    });
    render();
  });
  action("#finish", () => {
    const programRecord = draft.program
        ? store.state.programs[draft.program.enrollmentId]
        : undefined,
      canUpdateProgram = Boolean(programRecord?.custom);
    modal(
      `<h2>Finish this workout?</h2><p>${done} of ${total} sets completed. ${done < total ? "Only ticked sets count toward your progress." : ""}</p>${draft.program ? `<label class="checkbox"><input type="checkbox" id="advance-program" ${done === total ? "checked" : ""}>Mark this program session complete</label><p class="hint">When checked, your program advances to the next session. Leave unchecked to repeat this session later.</p>` : ""}${canUpdateProgram ? '<label class="checkbox"><input type="checkbox" id="update-program-workout">Use this exercise setup in future weeks</label><p class="hint">Leave unchecked to keep additions, removals, order and target changes for today only. When checked, the current exercise order, set count, first-set reps and rest replace this workout in your program.</p>' : ""}<div class="actions"><button class="secondary" data-close>Keep training</button><button class="primary" id="finish-confirm">Save session</button></div>`,
    );
    action("#finish-confirm", async () => {
      const s = {
        ...structuredClone(store.state.draft!),
        completedAt: Date.now(),
      };
      if (s.program)
        s.program.countsForProgress =
          $<HTMLInputElement>("#advance-program").checked;
      if (!validateRecord("sessions", s))
        throw new Error("Check the weights and reps before finishing.");
      await store.finish(s);
      if (
        programRecord?.custom &&
        document.querySelector<HTMLInputElement>("#update-program-workout")
          ?.checked
      ) {
        const updated = structuredClone(programRecord),
          day = updated.custom!.sessions[s.program!.day - 1];
        day.exercises = s.exercises.map((exercise) => ({
          exerciseName: exercise.name,
          sets: exercise.sets.length,
          reps: exercise.sets[0].reps,
          rest: exercise.rest ?? s.rest,
          effort:
            day.exercises.find(
              (target) => target.exerciseName === exercise.name,
            )?.effort || "Use a controlled effort",
        }));
        updated.updatedAt = Date.now();
        await store.put("programs", updated);
      }
      stopRest();
      close();
      view = s.program ? "today" : "history";
      await saved();
      toast(
        s.program?.countsForProgress
          ? "Workout complete. Your next program session is ready."
          : "Session saved. This program workout remains next so you can repeat it.",
      );
    });
  });
  action("#discard", () => {
    modal(
      '<h2>Discard this session?</h2><p>Its logged sets will be removed from this device.</p><div class="actions"><button class="secondary" data-close>Keep training</button><button class="primary" id="discard-confirm">Discard session</button></div>',
    );
    action("#discard-confirm", async () => {
      await store.saveDraft(null);
      stopRest();
      close();
      render();
    });
  });
  updateRest();
}
function updateRest() {
  const seconds = Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
  if (restUntil && !seconds) {
    restUntil = 0;
    clearRestStorage();
    if (!restAlerted) {
      restAlerted = true;
      if (document.querySelector("#toast"))
        toast("Rest complete. Ready for your next set.");
      void notifyRestComplete();
      pingRest();
      navigator.vibrate?.([200, 100, 200]);
    }
  }
  const times = document.querySelectorAll<HTMLElement>(
      "#rest-time, #global-rest-time",
    ),
    add = document.querySelector<HTMLButtonElement>("#rest-add"),
    skip = document.querySelector<HTMLButtonElement>("#rest-skip");
  const label = seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "Ready";
  times.forEach((time) => {
    time.textContent = label;
    time.closest("#rest-timer, .active-workout-bar")?.classList.toggle(
      "active",
      Boolean(seconds),
    );
  });
  if (add) add.disabled = !seconds;
  if (skip) skip.disabled = !seconds;
}
setInterval(updateRest, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") updateRest();
});
function renderHistory() {
  $("#screen").innerHTML =
    history()
      .map(
        (s) =>
          `<article class="card pad history"><div class="eyebrow">${date(s.completedAt)}</div><h2>${esc(s.workoutName)}</h2>${s.program ? `<p class="hint">Program week ${s.program.week} · Session ${s.program.day} · ${s.program.countsForProgress ? "Completed" : "To repeat"}</p>` : ""}<p>${completedSets(s)} sets · ${Math.max(1, Math.round((s.completedAt - s.startedAt) / 60000))} min${volume(s) ? ` · ${fmt(volume(s))} load volume` : ""}</p><button class="secondary edit-history" data-session-id="${s.id}">Edit logged workout</button><details><summary>View logged sets</summary>${s.exercises
            .map(
              (e) =>
                `<div class="history-exercise"><h3>${esc(e.name)}</h3><p>${
                  e.sets
                    .filter((x) => x.done)
                    .map((x) => setSummary(e, x))
                    .join(" · ") || "No completed sets"
                }</p></div>`,
            )
            .join("")}</details></article>`,
      )
      .join("") ||
    empty(
      "Your first session is ahead.",
      "Completed workouts will appear here with the weights and reps you actually logged.",
    );
  action(".edit-history", (event) =>
    editCompletedSession(
      (event.currentTarget as HTMLElement).dataset.sessionId!,
    ),
  );
}
function editCompletedSession(id: string) {
  const session = store.state.sessions[id];
  if (!session) return;
  modal(
    `<form id="history-edit"><h2>Edit logged workout</h2><label>Workout name<input name="workoutName" required maxlength="60" value="${esc(session.workoutName)}"></label><p class="hint">Correct values or include and exclude sets. The original workout date and program position stay the same.</p>${session.exercises
      .map(
        (exercise, exerciseIndex) =>
          `<section class="history-edit-exercise"><h3>${esc(exercise.name)}</h3><p class="hint">${trackingLabel[trackingFor(exercise)]}${trackingFor(exercise) === "reps" ? "" : ` · ${unitFor(exercise)}`}</p>${exercise.sets
            .map((set, setIndex) => {
              const tracking = trackingFor(exercise),
                field =
                  tracking === "weight_reps"
                    ? `<label>${unitFor(exercise)}<input name="weight" type="number" min="0" max="1000" step="0.5" value="${set.weight}"></label><label>Reps<input name="reps" type="number" min="1" max="100" step="1" value="${set.reps}"></label>`
                    : tracking === "reps"
                      ? `<label>Reps<input name="reps" type="number" min="1" max="100" step="1" value="${set.reps}"></label>`
                      : `<label>${unitFor(exercise)}<input name="value" type="number" min="0" max="10000000" step="0.1" value="${set.value || 0}"></label>`;
              return `<div class="history-edit-set" data-edit-ex="${exerciseIndex}" data-edit-set="${setIndex}"><span>Set ${setIndex + 1}</span>${field}<label class="checkbox"><input name="done" type="checkbox" ${set.done ? "checked" : ""}>Count</label></div>`;
            })
            .join("")}</section>`,
      )
      .join("")}<p id="history-edit-error" class="error" role="alert"></p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Save changes</button></div></form>`,
  );
  $("#history-edit").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) return;
    const updated = structuredClone(session);
    updated.workoutName = String(new FormData(form).get("workoutName")).trim();
    form.querySelectorAll<HTMLElement>(".history-edit-set").forEach((row) => {
      const set =
        updated.exercises[Number(row.dataset.editEx)].sets[
          Number(row.dataset.editSet)
        ];
      row.querySelectorAll<HTMLInputElement>("input[type=number]").forEach(
        (input) =>
          (set[input.name as "weight" | "reps" | "value"] =
            input.valueAsNumber),
      );
      set.done = row.querySelector<HTMLInputElement>("[name=done]")!.checked;
    });
    if (!validateRecord("sessions", updated)) {
      $("#history-edit-error").textContent =
        "Keep at least one valid completed set in this workout.";
      return;
    }
    await store.updateSession(updated);
    close();
    await saved();
    toast("Logged workout updated.");
  });
}
function renderProgress() {
  const entries = new Map<string, string>();
  history().forEach((s) =>
    s.exercises.forEach((e) => {
      if (e.sets.some((x) => x.done)) entries.set(e.exerciseId, e.name);
    }),
  );
  if (!entries.size) {
    $("#screen").innerHTML = empty(
      "Progress starts with a session.",
      "Log a workout to see your working weights and training volume over time.",
    );
    return;
  }
  $("#screen").innerHTML =
    `<label>Exercise<select id="progress-exercise">${[...entries].map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join("")}</select></label><div id="progress-results"></div>`;
  const draw = () => {
    const id = $<HTMLSelectElement>("#progress-exercise").value;
    const matching = history()
      .filter((s) =>
        s.exercises.some(
          (e) => e.exerciseId === id && e.sets.some((x) => x.done),
        ),
      )
      .map((session) => ({
        session,
        exercises: session.exercises.filter((exercise) => exercise.exerciseId === id),
      })),
      sample = matching[0].exercises[0],
      tracking = trackingFor(sample),
      unit = unitFor(sample),
      metric = (set: LoggedSet) =>
        tracking === "weight_reps"
          ? set.weight
          : tracking === "reps"
            ? set.reps
            : set.value || 0,
      points = matching
        .slice(0, 8)
        .reverse()
        .map(({ session, exercises }) => ({
          date: session.completedAt,
          value: Math.max(
            ...exercises.flatMap((exercise) =>
              exercise.sets.filter((set) => set.done).map(metric),
            ),
          ),
        })),
      allSets = matching.flatMap(({ exercises }) =>
        exercises.flatMap((exercise) => exercise.sets.filter((set) => set.done)),
      ),
      max = Math.max(1, ...points.map((point) => point.value)),
      bestReps = Math.max(...allSets.map((set) => set.reps)),
      bestSetVolume = Math.max(...allSets.map((set) => set.weight * set.reps)),
      bestSessionTotal = Math.max(
        ...matching.map(({ exercises }) =>
          exercises.flatMap((exercise) => exercise.sets.filter((set) => set.done)).reduce(
            (sum, set) =>
              sum +
              (tracking === "weight_reps"
                ? set.weight * set.reps
                : tracking === "reps"
                  ? set.reps
                  : set.value || 0),
            0,
          ),
        ),
      ),
      metricUnit = tracking === "reps" ? "reps" : unit,
      cards =
        tracking === "weight_reps"
          ? [
              ["Highest weight", Math.max(...allSets.map((set) => set.weight)), unit],
              ["Highest reps", bestReps, "reps"],
              ["Best set total", bestSetVolume, `${unit} × reps`],
              ["Best workout total", bestSessionTotal, `${unit} × reps`],
            ]
          : [
              [tracking === "reps" ? "Highest reps" : "Best set", Math.max(...allSets.map(metric)), metricUnit],
              ["Best workout total", bestSessionTotal, metricUnit],
            ];
    $("#progress-results").innerHTML =
      `<div class="pr-grid">${cards.map(([label, value, suffix]) => `<div class="card pr-card"><span class="eyebrow">PR · ${label}</span><strong>${fmt(Number(value))}</strong><small>${suffix}</small></div>`).join("")}</div><div class="card pad"><div class="eyebrow">Best ${tracking === "weight_reps" ? "working weight" : trackingLabel[tracking].toLowerCase()} per workout</div><div class="big">${fmt(points.at(-1)!.value)} <small>${metricUnit} latest</small></div><p class="hint">PRs use completed sets in your saved workout history.</p><div class="chart" aria-hidden="true">${points.map((point) => `<div class="bar" style="height:${Math.max(3, (point.value / max) * 100)}%"><span>${fmt(point.value)}</span></div>`).join("")}</div><table><caption>Last ${points.length} sessions</caption><thead><tr><th>Date</th><th>Best result</th></tr></thead><tbody>${points.map((point) => `<tr><td>${date(point.date)}</td><td>${fmt(point.value)} ${metricUnit}</td></tr>`).join("")}</tbody></table></div>`;
  };
  $("#progress-exercise").addEventListener("change", draw);
  draw();
}
function renderAccount() {
  const local = store.account === "local";
  $("#screen").innerHTML =
    `<div class="card pad"><div class="eyebrow">${local ? "Device-only workspace" : "Signed in"}</div><h2>${local ? "Training on this device" : esc(email)}</h2><p>${local ? "Your records are saved in this browser. They are not yet shared or synced." : "Your workouts and history are private. Exercise names and descriptions are shared."}</p>${cloud?.error ? `<p class="error">${esc(cloud.error)}</p>` : ""}${!local ? '<button class="secondary" id="retry-sync">Retry sync</button><button class="text-button" id="signout">Sign out</button>' : configured ? '<button class="primary" id="signin">Sign in or create account</button>' : '<p class="hint">Cloud accounts will be available after Firebase is configured.</p>'}</div><div class="card pad"><h2>Keep a copy</h2><p>Export your library, workouts and completed history. Active sessions stay on this device. Import adds missing records without replacing existing ones.</p><button class="primary" id="export">Export backup</button><label class="file-label">Import backup<input type="file" id="import" accept="application/json,.json"></label><p class="hint">${local ? "After signing in, import your backup to move device-only records into your account." : "Imported exercise names and descriptions will join the shared library."}</p></div><div class="card pad"><h2>Ready for the gym</h2><p>The app keeps downloaded workouts and pending changes on this device. Open it online before heading to the gym.</p><p id="offline-status" class="hint">Checking offline availability…</p><button class="secondary" id="persist">Request persistent storage</button><p class="hint">On iPhone: Safari → Share → Add to Home Screen. Browser storage can still be cleared; keep an export as well as syncing.</p></div>`;
  navigator.serviceWorker?.getRegistration().then((r) => {
    const el = document.querySelector("#offline-status");
    if (el)
      el.textContent = r?.active
        ? "App installed for offline launch on this browser."
        : "Offline launch becomes available from the production build after its first online load.";
  });
  action("#retry-sync", () => cloud?.retry());
  action("#signin", authDialog);
  action("#signout", async () => {
    if (store.state.pending.length || store.state.draft) {
      toast("Finish your session and sync pending records before signing out.");
      return;
    }
    await logout();
  });
  action("#export", () => {
    const records = {
      exercises: Object.values(store.state.exercises),
      workouts: Object.values(store.state.workouts),
      sessions: history(),
      programs: Object.values(store.state.programs),
    };
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { schema: 1, exportedAt: new Date().toISOString(), records },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `gtrack-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#import").addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error("Choose a backup smaller than 10 MB.");
      const records = await validateBackup(JSON.parse(await file.text()));
      modal(
        `<h2>Import this backup?</h2><p>${Object.keys(records.programs).length} programs, ${Object.keys(records.workouts).length} workouts, ${Object.keys(records.sessions).length} sessions and ${Object.keys(records.exercises).length} exercises. Existing records are kept.</p>${!local ? "<p>Exercise names and descriptions will be shared with other users.</p>" : ""}<div class="actions"><button class="secondary" data-close>Cancel</button><button class="primary" id="confirm-import">Import records</button></div>`,
      );
      action("#confirm-import", async () => {
        await store.import(records);
        close();
        await saved();
        toast("Backup imported.");
      });
    } catch (e) {
      fail(e);
    } finally {
      input.value = "";
    }
  });
  action("#persist", async () => {
    const ok = await navigator.storage?.persist?.();
    toast(
      ok
        ? "Persistent storage granted. Keep exporting backups too."
        : "This browser did not grant persistent storage. Keep regular backups.",
    );
  });
}
function authDialog() {
  if (store.state.draft) {
    toast(
      "Finish or discard the current local session before switching accounts.",
    );
    return;
  }
  modal(
    '<form id="auth-form"><h2>Your GTrack account</h2><p>Sign in to sync your private training data and use the shared library.</p><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Password<input name="password" type="password" required minlength="6" autocomplete="current-password"></label><label class="checkbox"><input name="create" type="checkbox"> Create a new account</label><p id="auth-error" class="error" role="alert"></p><div class="actions"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="submit">Continue</button></div><button class="text-button" type="button" id="reset-password">Reset password</button></form>',
  );
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const f = new FormData(form);
    const button = form.querySelector<HTMLButtonElement>(
      "button[type=submit]",
    )!;
    button.disabled = true;
    try {
      await login(
        String(f.get("email")),
        String(f.get("password")),
        f.has("create"),
      );
      close();
    } catch {
      $("#auth-error").textContent =
        "Could not sign in. Check your email, password and connection. New accounts need a password of at least 6 characters.";
      button.disabled = false;
    }
  });
  action("#reset-password", async () => {
    const input = $<HTMLInputElement>("#auth-form input[name=email]");
    if (!input.reportValidity()) return;
    try {
      await resetPassword(input.value);
      $("#auth-error").textContent =
        "If an account exists for that email, a reset link has been sent.";
    } catch {
      $("#auth-error").textContent =
        "Could not request a reset. Check your connection.";
    }
  });
}
async function boot() {
  startup("boot-started");
  watchAuth(async (user) => {
    startup("auth-state-ready", user ? "signed-in" : "signed-out");
    try {
      userReady = false;
      cloud?.stop();
      cloud = null;
      email = user?.email || "";
      store = new Store(user?.uid || "local");
      startup("storage-load-started");
      await store.load();
      startup("storage-load-complete");
      view = store.state.draft ? "today" : "workouts";
      userReady = true;
      render();
      startupReady();
      if (user) {
        cloud = new Cloud(store, changed);
        cloud.start();
      }
    } catch (error) {
      startup(
        "storage-load-error",
        error instanceof Error ? error.message : String(error),
      );
      $("#app").innerHTML =
        "<main><h1>Storage is unavailable.</h1><p>GTrack needs browser storage to protect your training log. Check available space and browser storage settings, then reload.</p></main>";
      startupReady();
    }
  });
  window.addEventListener("online", () => {
    void cloud?.flush();
    changed();
  });
  window.addEventListener("offline", changed);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void cloud?.flush();
      changed();
    }
  });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    startup("service-worker-registering");
    const hadController = !!navigator.serviceWorker.controller;
    let controlled = hadController;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controlled) location.reload();
      else controlled = true;
    });
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { updateViaCache: "none" },
    );
    startup(
      "service-worker-registered",
      registration.active?.state || "pending",
    );
    const waiting = () => {
      if (
        registration.waiting?.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        deferredUpdate = registration.waiting;
        changed();
        if (view !== "builder") render();
      }
    };
    // First-install activation can overlap with controllerchange in WebKit.
    // Only advertise a worker that was installed to replace an existing one.
    if (hadController) waiting();
    const observeInstalling = () => {
      const installing = registration.installing;
      const replacesActiveWorker =
        !!registration.active && registration.active !== installing;
      if (replacesActiveWorker)
        installing?.addEventListener("statechange", waiting);
    };
    observeInstalling();
    registration.addEventListener("updatefound", observeInstalling);
    void registration.update().catch(() => {});
  }
}
// One editing tab per origin prevents two tabs from changing the same active session.
if (navigator.locks) {
  startup("editor-lock-requested");
  void navigator.locks
    .request("gtrack-editor", { ifAvailable: true }, async (lock) => {
      startup(lock ? "editor-lock-acquired" : "editor-lock-unavailable");
      if (!lock) {
        $("#app").innerHTML =
          "<main><h1>GTrack is open in another tab.</h1><p>Use that tab to keep your session in one place. Close it, then reload here.</p></main>";
        startupReady();
        return;
      }
      await boot();
      await new Promise(() => {});
    })
    .catch((error) => {
      startup(
        "editor-lock-error",
        error instanceof Error ? error.message : String(error),
      );
      startupFailure("editor-lock-error");
    });
} else {
  startup("editor-lock-unsupported");
  void boot().catch((error) => {
    startup(
      "boot-error",
      error instanceof Error ? error.message : String(error),
    );
    startupFailure("boot-error");
  });
}
