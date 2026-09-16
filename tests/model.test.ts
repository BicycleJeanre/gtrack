import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exerciseId,
  startSession,
  volume,
  validateBackup,
  validateRecord,
} from "../src/model.ts";
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
  assert.equal(volume(session), 160);
  session.completedAt = Date.now();
  assert.equal(validateRecord("sessions", session), true);
  session.exercises[0].sets[0].reps = -1;
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
