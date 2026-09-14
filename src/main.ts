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
  validateRecord,
  validateBackup,
  type Workout,
  type Target,
  type Session,
  type Exercise,
} from "./model";
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
const icon =
  '<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 12h10M3 9v6m4-9v12m10-12v12m4-9v6M3 12h4m10 0h4"/></svg>';
let store: Store,
  cloud: Cloud | null = null,
  email = "",
  view = "today",
  editing: string | null = null,
  draftTargets: Target[] = [],
  restUntil = 0;
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
  return cloud?.ready.size === 3 ? "Synced" : "Saved on phone · connecting";
}
function changed() {
  if (!userReady) return;
  const label = document.querySelector("#sync");
  if (label) label.textContent = syncLabel();
  if (
    !["builder", "today"].includes(view) &&
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
  today: ["Ready to train?", "Your session, one set at a time."],
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
    `<header><div class="brand">${icon}GTrack</div><button class="profile" id="account" aria-label="Account and data settings">${email ? esc(email[0].toUpperCase()) : "⚙"}</button></header><main><div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div><h1>${h[0]}</h1><p class="subtitle">${h[1]}</p><button class="sync" id="sync">${esc(syncLabel())}</button>${deferredUpdate ? '<button class="secondary update" id="update-app">App update ready · reload safely</button>' : ""}<div id="screen"></div></main><nav aria-label="Main navigation">${["today", "workouts", "history", "progress"].map((n, i) => `<button data-view="${n}" ${view === n || (view === "builder" && n === "workouts") ? 'aria-current="page"' : ""}><span aria-hidden="true">${["◷", "▤", "↺", "↗"][i]}</span>${n[0].toUpperCase() + n.slice(1)}</button>`).join("")}</nav>`;
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
      builder: renderBuilder,
      history: renderHistory,
      progress: renderProgress,
      account: renderAccount,
    }) as Record<string, () => void>
  )[view]();
}
async function navigate(next: string) {
  if (view === "builder" && next !== "builder") {
    modal(
      '<h2>Leave this workout?</h2><p>Your changes to this plan have not been saved.</p><div class="actions"><button class="secondary" data-close>Keep editing</button><button class="primary" id="leave-editor">Discard changes</button></div>',
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
function renderWorkouts() {
  $("#screen").innerHTML =
    `<button class="primary" id="new-workout">＋ Create workout</button><button class="secondary" id="start-empty">＋ Start empty session</button><div class="section-title"><h2>My sessions</h2><span>${workouts().length} saved</span></div>${
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
      const id = card.querySelector<HTMLSelectElement>("select")!.value;
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
  const rows = [
    ...card.querySelectorAll<HTMLElement>(".set-rows .planned-set"),
  ];
  const values = rows.map((row) => ({
    reps: row.querySelector<HTMLInputElement>("[name=reps]")!.valueAsNumber,
    weight: row.querySelector<HTMLInputElement>("[name=weight]")!.valueAsNumber,
  }));
  const count =
    card.querySelector<HTMLInputElement>("[name=sets]")!.valueAsNumber;
  // A changed count preserves existing sets and copies the last set for new rows.
  if (Number.isInteger(count) && count >= 1 && count <= 12) {
    while (values.length < count)
      values.push({ ...(values.at(-1) || { reps: 10, weight: 0 }) });
    values.length = count;
  }
  return {
    sets: count,
    reps: values[0]?.reps ?? 10,
    weight: values[0]?.weight ?? 0,
    setTargets: values,
  };
}
function targetRows(target: Target, exerciseIndex: number) {
  const sets = plannedSets(target);
  return sets
    .map(
      (set, index) =>
        `<div class="planned-set"><span class="set-number">${index + 1}</span><input name="reps" required type="number" inputmode="numeric" min="1" max="100" step="1" value="${set.reps}" aria-label="Exercise ${exerciseIndex + 1} set ${index + 1} reps"><input name="weight" required type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${set.weight}" aria-label="Exercise ${exerciseIndex + 1} set ${index + 1} weight (kg)"><button type="button" class="remove-set" data-exercise="${exerciseIndex}" data-set="${index}" ${sets.length === 1 ? "disabled" : ""} aria-label="Remove exercise ${exerciseIndex + 1} set ${index + 1}">×</button></div>`,
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
        `<div class="card pad target"><div class="target-head"><h3>Exercise ${i + 1}</h3><div><button type="button" class="text-button move" data-index="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move exercise ${i + 1} up">↑</button><button type="button" class="text-button remove" data-index="${i}" aria-label="Remove exercise ${i + 1}">Remove</button></div></div><label>Exercise from library<select required data-index="${i}"><option value="">Choose an exercise…</option>${exercises()
          .map(
            (e) =>
              `<option value="${e.id}" ${e.id === t.exerciseId ? "selected" : ""}>${esc(e.name)}</option>`,
          )
          .join(
            "",
          )}</select></label><p class="description">${esc(t.description || "Select an exercise to see its description.")}</p><button type="button" class="text-button new-exercise" data-index="${i}">＋ New exercise for the library</button><div class="set-controls"><label>Sets<input name="sets" required type="number" inputmode="numeric" min="1" max="12" step="1" value="${t.sets}" data-exercise="${i}"></label><p class="hint">Set your reps and weight for each set.</p></div><div class="planned-set labels"><span>Set</span><span>Reps</span><span>kg</span><span></span></div><div class="set-rows">${targetRows(t, i)}</div><button type="button" class="text-button add-set" data-exercise="${i}" ${t.sets >= 12 ? "disabled" : ""}>＋ Add set</button></div>`,
    )
    .join("");
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
  document.querySelectorAll("#targets select").forEach((s) =>
    s.addEventListener("change", () => {
      captureTargets();
      const description =
        store.state.exercises[(s as HTMLSelectElement).value]?.description;
      s.closest(".target")!.querySelector(".description")!.textContent =
        description || "Select an exercise to see its description.";
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
  const add = async (exercise: Exercise) => {
    await editSession((session) => {
      if (session.exercises.length < 30)
        session.exercises.push({
          exerciseId: exercise.id,
          name: exercise.name,
          description: exercise.description,
          sets: [{ reps: 10, weight: 0, done: false }],
        });
    });
  };
  modal(
    `<form id="session-exercise"><h2>Add exercise to session</h2><label>Exercise from library<select required><option value="">Choose an exercise…</option>${exercises()
      .map((e) => `<option value="${e.id}">${esc(e.name)}</option>`)
      .join(
        "",
      )}</select></label><p id="session-description" class="description"></p><button type="button" class="text-button" id="session-new-exercise">＋ New exercise for the library</button><p class="hint">Starts with one set. Adjust its reps and weight, then add more sets as needed.</p><div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Add to session</button></div></form>`,
  );
  const select = $<HTMLSelectElement>("#session-exercise select");
  select.addEventListener("change", () => {
    $("#session-description").textContent =
      store.state.exercises[select.value]?.description || "";
  });
  $("#session-exercise").addEventListener("submit", (event) => {
    event.preventDefault();
    const exercise = store.state.exercises[select.value];
    if (exercise) void add(exercise).catch(fail);
  });
  action("#session-new-exercise", () => exerciseDialog(0, add));
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
  const completed =
    setIndex === undefined
      ? exercise.sets.some((s) => s.done)
      : exercise.sets[setIndex].done;
  if (!completed) return editSession(change);
  modal(
    `<h2>Remove ${setIndex === undefined ? esc(exercise.name) : "this set"}?</h2><p>This removes completed work from the current session and its totals.</p><div class="actions"><button class="secondary" data-close>Keep training</button><button class="danger" id="remove-session-confirm">Remove completed work</button></div>`,
  );
  action("#remove-session-confirm", () => editSession(change));
}
function renderToday() {
  const draft = store.state.draft;
  if (!draft) {
    const list = workouts();
    $("#screen").innerHTML =
      `${history().length ? `<div class="summary"><span><strong>${history().length}</strong> sessions</span><span><strong>${fmt(history().reduce((n, s) => n + volume(s), 0))}</strong> kg logged</span></div>` : ""}${list.length ? `<div class="section-title"><h2>Choose a session</h2></div>${list.map((w) => `<article class="card plan"><h2>${esc(w.name)}</h2><p>${w.exercises.length} exercises · ${w.exercises.reduce((n, e) => n + e.sets, 0)} sets</p><button class="primary" data-start="${w.id}">Start workout</button></article>`).join("")}` : empty("Make room for your first workout.", "Build a session, then come here to log every set.", '<button class="primary" id="first-workout">Create workout</button>')}`;
    $("#screen").insertAdjacentHTML(
      "afterbegin",
      '<button class="secondary" id="start-empty">＋ Start empty session</button>',
    );
    action("#start-empty", () => sessionDetails(true));
    action("#first-workout", () => openBuilder());
    bindStart();
    return;
  }
  const total = draft.exercises.reduce((n, e) => n + e.sets.length, 0),
    done = completedSets(draft);
  $("#screen").innerHTML =
    `<div class="card session-head"><div class="eyebrow">In progress · ${done} / ${total} sets</div><h2>${esc(draft.workoutName)}</h2><button class="text-button" id="edit-session-details">Edit session details</button><p>Started ${new Date(draft.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · <span id="draft-status" role="status">Saved on phone</span></p><div class="progress-line"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div><button class="primary" id="finish" ${!done ? "disabled" : ""}>Finish workout${done < total ? " · " + done + "/" + total + " sets" : ""}</button><div id="rest-timer" role="status"></div></div><div id="logging">${draft.exercises.map((e, i) => `<section class="card pad logging-exercise"><div class="eyebrow">Exercise ${i + 1} / ${draft.exercises.length}</div><h2>${esc(e.name)}</h2><div class="actions"><button class="text-button" data-session-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(e.name)} up">↑ Move up</button><button class="text-button" data-session-remove="${i}" aria-label="Remove ${esc(e.name)}">Remove exercise</button></div><details><summary>Exercise description</summary><p class="description">${esc(e.description)}</p></details><div class="set-grid session-set labels"><span>Set</span><span>kg</span><span>Reps</span><span>Done</span><span></span></div>${e.sets.map((s, j) => `<div class="set-grid session-set"><span>${j + 1}</span><input required type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${s.weight}" data-ex="${i}" data-set="${j}" data-field="weight" aria-label="${esc(e.name)} set ${j + 1} weight" ${s.done ? "disabled" : ""}><input required type="number" inputmode="numeric" min="1" max="100" step="1" value="${s.reps}" data-ex="${i}" data-set="${j}" data-field="reps" aria-label="${esc(e.name)} set ${j + 1} reps" ${s.done ? "disabled" : ""}><button class="check" data-ex="${i}" data-set="${j}" aria-pressed="${s.done}" aria-label="Complete ${esc(e.name)} set ${j + 1}">✓</button><button class="text-button" data-session-set-remove="${i}" data-set="${j}" ${e.sets.length <= 1 ? "disabled" : ""} aria-label="Remove ${esc(e.name)} set ${j + 1}">×</button></div>`).join("")}<button class="text-button" data-session-set-add="${i}" ${e.sets.length >= 12 ? "disabled" : ""} aria-label="Add set to ${esc(e.name)}">＋ Add set</button></section>`).join("")}</div>${!draft.exercises.length ? '<p class="hint">Add your first exercise to start recording. Build this session as you go.</p>' : ""}<button class="secondary" id="session-add" ${draft.exercises.length >= 30 ? "disabled" : ""}>＋ Add exercise</button><button class="danger" id="discard">Discard this session</button>`;
  action("#edit-session-details", () => sessionDetails());
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
              ][input.dataset.field as "weight" | "reps"] = value;
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
    const inputs = b.parentElement!.querySelectorAll<HTMLInputElement>("input");
    const weight = Number(inputs[0].value),
      reps = Number(inputs[1].value);
    await store.mutate((state) => {
      if (!state.draft) return;
      const set =
        state.draft.exercises[Number(b.dataset.ex)].sets[Number(b.dataset.set)];
      set.weight = weight;
      set.reps = reps;
      set.done = !set.done;
      if (set.done && state.draft.rest)
        restUntil = Date.now() + state.draft.rest * 1000;
    });
    render();
  });
  action("#finish", () => {
    modal(
      `<h2>Finish this workout?</h2><p>${done} of ${total} sets completed. ${done < total ? "Only ticked sets count toward your progress." : ""}</p><div class="actions"><button class="secondary" data-close>Keep training</button><button class="primary" id="finish-confirm">Save session</button></div>`,
    );
    action("#finish-confirm", async () => {
      const s = {
        ...structuredClone(store.state.draft!),
        completedAt: Date.now(),
      };
      if (!validateRecord("sessions", s))
        throw new Error("Check the weights and reps before finishing.");
      await store.finish(s);
      restUntil = 0;
      close();
      view = "history";
      await saved();
      toast("Session saved. Well done.");
    });
  });
  action("#discard", () => {
    modal(
      '<h2>Discard this session?</h2><p>Its logged sets will be removed from this device.</p><div class="actions"><button class="secondary" data-close>Keep training</button><button class="primary" id="discard-confirm">Discard session</button></div>',
    );
    action("#discard-confirm", async () => {
      await store.saveDraft(null);
      restUntil = 0;
      close();
      render();
    });
  });
  updateRest();
}
function updateRest() {
  const target = document.querySelector("#rest-timer");
  if (!target) return;
  const seconds = Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
  target.textContent = seconds
    ? `Rest · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "";
}
setInterval(updateRest, 1000);
function renderHistory() {
  $("#screen").innerHTML =
    history()
      .map(
        (s) =>
          `<article class="card pad history"><div class="eyebrow">${date(s.completedAt)}</div><h2>${esc(s.workoutName)}</h2><p>${completedSets(s)} sets · ${Math.max(1, Math.round((s.completedAt - s.startedAt) / 60000))} min · ${fmt(volume(s))} kg volume</p><details><summary>View logged sets</summary>${s.exercises
            .map(
              (e) =>
                `<div class="history-exercise"><h3>${esc(e.name)}</h3><p>${
                  e.sets
                    .filter((x) => x.done)
                    .map((x) => `${fmt(x.weight)} kg × ${x.reps}`)
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
    const points = history()
      .filter((s) =>
        s.exercises.some(
          (e) => e.exerciseId === id && e.sets.some((x) => x.done),
        ),
      )
      .slice(0, 8)
      .reverse()
      .map((s) => ({
        date: s.completedAt,
        weight: Math.max(
          ...s.exercises
            .filter((e) => e.exerciseId === id)
            .flatMap((e) => e.sets.filter((x) => x.done).map((x) => x.weight)),
        ),
      }));
    const max = Math.max(1, ...points.map((p) => p.weight));
    $("#progress-results").innerHTML =
      `<div class="card pad"><div class="eyebrow">Best working weight per session</div><div class="big">${fmt(points.at(-1)!.weight)} <small>kg latest</small></div><p class="hint">Weights are recorded as entered. Rep counts and equipment may vary.</p><div class="chart" aria-hidden="true">${points.map((p) => `<div class="bar" style="height:${Math.max(3, (p.weight / max) * 100)}%"><span>${fmt(p.weight)}</span></div>`).join("")}</div><table><caption>Last ${points.length} sessions</caption><thead><tr><th>Date</th><th>Best weight</th></tr></thead><tbody>${points.map((p) => `<tr><td>${date(p.date)}</td><td>${fmt(p.weight)} kg</td></tr>`).join("")}</tbody></table></div>`;
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
        `<h2>Import this backup?</h2><p>${Object.keys(records.workouts).length} workouts, ${Object.keys(records.sessions).length} sessions and ${Object.keys(records.exercises).length} exercises. Existing records are kept.</p>${!local ? "<p>Exercise names and descriptions will be shared with other users.</p>" : ""}<div class="actions"><button class="secondary" data-close>Cancel</button><button class="primary" id="confirm-import">Import records</button></div>`,
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
  watchAuth(async (user) => {
    try {
      userReady = false;
      cloud?.stop();
      cloud = null;
      email = user?.email || "";
      store = new Store(user?.uid || "local");
      await store.load();
      view = store.state.draft ? "today" : "workouts";
      userReady = true;
      render();
      if (user) {
        cloud = new Cloud(store, changed);
        cloud.start();
      }
    } catch {
      $("#app").innerHTML =
        "<main><h1>Storage is unavailable.</h1><p>GTrack needs browser storage to protect your training log. Check available space and browser storage settings, then reload.</p></main>";
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
    const hadController = !!navigator.serviceWorker.controller;
    let controlled = hadController;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controlled) location.reload();
      else controlled = true;
    });
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
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
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      const replacesActiveWorker =
        !!registration.active && registration.active !== installing;
      if (replacesActiveWorker)
        installing?.addEventListener("statechange", waiting);
    });
  }
}
// One editing tab per origin prevents two tabs from changing the same active session.
if (navigator.locks) {
  void navigator.locks.request(
    "gtrack-editor",
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        $("#app").innerHTML =
          "<main><h1>GTrack is open in another tab.</h1><p>Use that tab to keep your session in one place. Close it, then reload here.</p></main>";
        return;
      }
      await boot();
      await new Promise(() => {});
    },
  );
} else void boot();
