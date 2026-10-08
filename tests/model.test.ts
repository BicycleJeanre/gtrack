import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exerciseId,
  startSession,
  volume,
  validateBackup,
  validateRecord,
  seedExercises,
} from "../src/model.ts";
import { muscleGroupFor } from "../src/exercise-catalog.ts";
import { stretchingExercises } from "../src/stretching-exercises.ts";
test("exercise identities normalize spaces, Unicode and case", async () => {
  assert.equal(await exerciseId(" Cable  fly "), await exerciseId("cable fly"));
  assert.equal(await exerciseId("Ｃable fly"), await exerciseId("cable fly"));
});
test("completed history is independent from workout plans", () => {
  const workout = {
    id: "test",
    name: "Test",
    rest: 90,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: "a",
        name: "Press",
        description: "Fixture",
        sets: 2,
        reps: 8,
        weight: 20,
      },
    ],
  };
  const session = startSession(workout);
  workout.exercises[0].weight = 100;
  assert.equal(session.exercises[0].sets[0].weight, 20);
  session.exercises[0].sets[0].done = true;
  session.exercises[0].note = "Seat 4 and use the narrow handle.";
  assert.equal(volume(session), 160);
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), true);
  session.exercises[0].sets[0].reps = -1;
  assert.equal(validateRecord("sessions", session), false);
});

test("shared exercise photos and session notes are bounded", async () => {
  const exercise = {
    id: await exerciseId("Photo press"),
    name: "Photo press",
    description: "Fixture",
    createdAt: 1,
    image: "data:image/webp;base64,AAAA",
  };
  assert.equal(validateRecord("exercises", exercise), true);
  assert.equal(
    validateRecord("exercises", {
      ...exercise,
      image: "https://example.com/a.jpg",
    }),
    false,
  );
  const session = startSession({
    id: "photo-plan",
    name: "Photo plan",
    rest: 0,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: exercise.id,
        name: exercise.name,
        description: exercise.description,
        sets: 1,
        reps: 8,
        weight: 20,
      },
    ],
  });
  session.exercises[0].sets[0].done = true;
  session.exercises[0].note = "x".repeat(501);
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), false);
});
test("backup validation rejects a renamed exercise identity and invalid numeric values", async () => {
  await assert.rejects(() =>
    validateBackup({
      schema: 1,
      records: {
        exercises: [
          {
            id: "a".repeat(64),
            name: "Forged",
            description: "Fixture",
            createdAt: 1,
          },
        ],
        workouts: [],
        sessions: [],
      },
    }),
  );
  await assert.rejects(() => validateBackup({ schema: 2 }));
});

test("per-set plans preserve distinct targets and reject invalid backup sets", async () => {
  const plan = {
    id: "per-set",
    name: "Fixture",
    rest: 90,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: "press",
        name: "Press",
        description: "Fixture",
        sets: 2,
        reps: 12,
        weight: 20,
        setTargets: [
          { reps: 12, weight: 20 },
          { reps: 6, weight: 50 },
        ],
      },
    ],
  };
  const backup = {
    schema: 1,
    records: { exercises: [], workouts: [plan], sessions: [] },
  };
  const restored = await validateBackup(JSON.parse(JSON.stringify(backup)));
  const session = startSession(restored.workouts[plan.id]);
  assert.deepEqual(session.exercises[0].sets, [
    { reps: 12, weight: 20, done: false },
    { reps: 6, weight: 50, done: false },
  ]);
  session.exercises[0].sets[1].weight = 55;
  assert.equal(
    restored.workouts[plan.id].exercises[0].setTargets![1].weight,
    50,
  );
  plan.exercises[0].setTargets[1].reps = 0;
  await assert.rejects(() => validateBackup(backup));
  plan.exercises[0].setTargets.pop();
  assert.equal(validateRecord("workouts", plan), false);
});

test("program enrollments and optional session metadata validate; older backups still import", async () => {
  const enrollment = {
    id: "enrollment",
    templateId: "foundation-3",
    version: 1,
    startedAt: 1,
    updatedAt: 1,
    archived: false,
  };
  assert.equal(validateRecord("programs", enrollment), true);
  assert.equal(
    validateRecord("programs", { ...enrollment, version: 2 }),
    false,
  );
  const old = await validateBackup({
    schema: 1,
    records: { exercises: [], workouts: [], sessions: [] },
  });
  assert.deepEqual(old.programs, {});
  const restored = await validateBackup({
    schema: 1,
    records: {
      exercises: [],
      workouts: [],
      sessions: [],
      programs: [enrollment],
    },
  });
  assert.deepEqual(restored.programs.enrollment, enrollment);
});

test("custom programs validate bounded workout days and targets", () => {
  const custom = {
    id: "custom-plan",
    templateId: "custom-custom-plan",
    version: 1,
    startedAt: 1,
    updatedAt: 1,
    archived: false,
    custom: {
      name: "My strength plan",
      weeks: 8,
      estimatedMinutes: "45–60",
      sessions: [
        {
          id: "day-1",
          name: "Upper",
          schedule: "Monday",
          exercises: [
            {
              exerciseName: "Barbell bench press",
              sets: 4,
              reps: 6,
              rest: 180,
              effort: "2 reps in reserve",
            },
          ],
        },
      ],
    },
  };
  assert.equal(validateRecord("programs", custom), true);
  assert.equal(
    validateRecord("programs", {
      ...custom,
      custom: { ...custom.custom, weeks: 53 },
    }),
    false,
  );
  assert.equal(
    validateRecord("programs", {
      ...custom,
      custom: {
        ...custom.custom,
        sessions: [
          {
            ...custom.custom.sessions[0],
            exercises: [{ ...custom.custom.sessions[0].exercises[0], sets: 0 }],
          },
        ],
      },
    }),
    false,
  );
});

test("timed and distance targets remain compatible with the session schema", () => {
  const workout = {
    id: "conditioning",
    name: "Conditioning",
    rest: 30,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: "plank",
        name: "Plank",
        description: "Hold position",
        tracking: "duration" as const,
        unit: "sec" as const,
        sets: 2,
        reps: 1,
        weight: 0,
        setTargets: [
          { reps: 1, weight: 0, value: 45 },
          { reps: 1, weight: 0, value: 60 },
        ],
      },
    ],
  };
  assert.equal(validateRecord("workouts", workout), true);
  const session = startSession(workout);
  assert.equal(session.exercises[0].sets[1].value, 60);
  session.exercises[0].sets[0].done = true;
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), true);
  assert.equal(volume(session), 0);
  assert.equal(
    validateRecord("workouts", {
      ...workout,
      exercises: [{ ...workout.exercises[0], unit: "kg" }],
    }),
    false,
  );
});

test("machine settings preserve plate numbers and reps without weight volume", () => {
  const workout = {
    id: "cable-day",
    name: "Cable day",
    rest: 0,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: "cable-row",
        name: "Cable row",
        description: "Use the numbered stack setting",
        tracking: "machine_setting" as const,
        unit: "plates" as const,
        sets: 1,
        reps: 12,
        weight: 0,
        setTargets: [{ reps: 12, weight: 0, value: 5 }],
      },
    ],
  };
  assert.equal(validateRecord("workouts", workout), true);
  const session = startSession(workout);
  assert.equal(session.rest, 0);
  assert.deepEqual(session.exercises[0].sets[0], {
    reps: 12,
    weight: 0,
    value: 5,
    done: false,
  });
  session.exercises[0].sets[0].done = true;
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), true);
  assert.equal(volume(session), 0);
  assert.equal(
    validateRecord("workouts", {
      ...workout,
      exercises: [{ ...workout.exercises[0], unit: "kg" }],
    }),
    false,
  );
});

test("decimal exercise weights retain precision in sessions and volume", () => {
  const workout = {
    id: "fractional-plates",
    name: "Fractional plates",
    rest: 90,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: "bench",
        name: "Bench press",
        description: "Use fractional plates",
        tracking: "weight_reps" as const,
        unit: "kg" as const,
        sets: 1,
        reps: 8,
        weight: 1.25,
        setTargets: [{ reps: 8, weight: 1.25 }],
      },
    ],
  };
  assert.equal(validateRecord("workouts", workout), true);
  const session = startSession(workout);
  assert.equal(session.exercises[0].sets[0].weight, 1.25);
  session.exercises[0].sets[0].done = true;
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), true);
  assert.equal(volume(session), 10);
});

test("guided interval settings copy into sessions and validate", () => {
  const workout = {
    id: "guided-flow",
    name: "Guided flow",
    rest: 0,
    updatedAt: 1,
    archived: false,
    exercises: [
      {
        exerciseId: "plank",
        name: "Plank",
        description: "Hold a stable position",
        tracking: "duration" as const,
        unit: "sec" as const,
        guided: true,
        setRest: 15,
        exerciseRest: 30,
        sets: 2,
        reps: 1,
        weight: 0,
        setTargets: [
          { reps: 1, weight: 0, value: 30 },
          { reps: 1, weight: 0, value: 45 },
        ],
      },
    ],
  };
  assert.equal(validateRecord("workouts", workout), true);
  const session = startSession(workout);
  assert.equal(session.exercises[0].guided, true);
  assert.equal(session.exercises[0].setRest, 15);
  assert.equal(session.exercises[0].exerciseRest, 30);
  assert.deepEqual(
    session.exercises[0].sets.map((set) => set.value),
    [30, 45],
  );
  assert.equal(
    validateRecord("workouts", {
      ...workout,
      exercises: [{ ...workout.exercises[0], setRest: 601 }],
    }),
    false,
  );
  assert.equal(
    validateRecord("workouts", {
      ...workout,
      exercises: [
        { ...workout.exercises[0], tracking: "reps", unit: undefined },
      ],
    }),
    false,
  );
});

test("detailed catalogue muscles map to broad primary muscle groups", () => {
  assert.equal(muscleGroupFor({ primaryMuscles: ["lats"] }), "back");
  assert.equal(muscleGroupFor({ primaryMuscles: ["quadriceps"] }), "legs");
  assert.equal(
    muscleGroupFor({ primaryMuscleGroup: "arms", primaryMuscles: ["chest"] }),
    "arms",
  );
});

test("bundled exercise catalogue includes equipment and muscle metadata", async () => {
  const exercises = await seedExercises();
  assert.ok(exercises.length >= 800);
  assert.ok(
    exercises.some(
      (exercise) =>
        exercise.equipment === "barbell" &&
        exercise.primaryMuscles?.includes("chest"),
    ),
  );
  assert.equal(
    new Set(exercises.map((exercise) => exercise.id)).size,
    exercises.length,
  );
});

test("prenatal, common stretching and yoga movements are bundled", async () => {
  const exercises = await seedExercises(),
    byName = new Map(exercises.map((exercise) => [exercise.name, exercise]));
  assert.equal(stretchingExercises.length, 52);
  assert.equal(
    new Set(stretchingExercises.map((exercise) => exercise.name)).size,
    stretchingExercises.length,
  );
  for (const name of [
    "Gentle Walking",
    "Shoulder Rolls",
    "Neck Mobility",
    "Diaphragmatic Breathing",
    "Cat-Cow Stretch",
    "Wide-Knee Child's Pose",
    "Seated Butterfly Stretch",
    "Pelvic Tilts",
    "Standing Side Stretch",
    "Downward-Facing Dog",
    "Warrior II",
    "Corpse Pose (Savasana)",
    "Open Book Thoracic Rotation",
  ]) {
    const exercise = byName.get(name);
    assert.ok(exercise, `${name} should be available`);
    assert.equal(exercise.category, "stretching");
    assert.equal(validateRecord("exercises", exercise), true);
  }
});

test("private body measurements validate and round-trip through backups", async () => {
  const bodyEntry = {
    id: "body-2026-09-22",
    recordedAt: 1_800_000_000_000,
    weight: 82.4,
    weightUnit: "kg",
    bodyFat: 18.5,
    waist: 86,
    measurementUnit: "cm",
  };
  assert.equal(validateRecord("bodyEntries", bodyEntry), true);
  assert.equal(
    validateRecord("bodyEntries", { ...bodyEntry, weight: 0 }),
    false,
  );
  assert.equal(
    validateRecord("bodyEntries", {
      id: "empty-body",
      recordedAt: bodyEntry.recordedAt,
    }),
    false,
  );
  const restored = await validateBackup({
    schema: 1,
    records: {
      exercises: [],
      workouts: [],
      sessions: [],
      bodyEntries: [bodyEntry],
    },
  });
  assert.deepEqual(restored.bodyEntries[bodyEntry.id], bodyEntry);
});

test("name-only exercises, training profiles and profile-owned records validate", async () => {
  const exercise = {
    id: await exerciseId("Partner carry"),
    name: "Partner carry",
    description: "",
    createdAt: 1,
    exerciseType: "strength",
  };
  assert.equal(validateRecord("exercises", exercise), true);
  assert.equal(
    validateRecord("profiles", {
      id: "daniel",
      name: "Daniel",
      createdAt: 1,
      updatedAt: 1,
    }),
    true,
  );
  assert.equal(
    validateRecord("bodyEntries", {
      id: "body-daniel",
      recordedAt: 1,
      weight: 80,
      profileId: "daniel",
    }),
    true,
  );
});

test("unilateral workout targets become separate left and right set rows", () => {
  const session = startSession({
    id: "unilateral",
    name: "Single arm work",
    rest: 60,
    updatedAt: 1,
    archived: false,
    profileId: "daniel",
    exercises: [
      {
        exerciseId: "curl",
        name: "Single arm curl",
        description: "",
        sets: 2,
        reps: 10,
        weight: 12.5,
        sides: true,
      },
    ],
  });
  assert.equal(session.profileId, "daniel");
  assert.deepEqual(
    session.exercises[0].sets.map((set) => set.side),
    ["left", "right", "left", "right"],
  );
  session.exercises[0].sets[0].done = true;
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), true);
});
