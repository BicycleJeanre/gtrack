import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";
let env, alice, bob, guest;
const exercise = {
  id: "a".repeat(64),
  name: "Synthetic press",
  description: "Synthetic fixture exercise.",
  createdAt: 1,
};
const workout = {
  id: "plan",
  name: "Synthetic session",
  rest: 90,
  exercises: [
    {
      exerciseId: exercise.id,
      name: exercise.name,
      description: exercise.description,
      sets: 3,
      reps: 8,
      weight: 20,
    },
  ],
  updatedAt: 1,
  archived: false,
};
const session = {
  id: "session",
  workoutName: "Synthetic session",
  rest: 90,
  startedAt: 1,
  completedAt: 2,
  exercises: [
    {
      exerciseId: exercise.id,
      name: exercise.name,
      description: exercise.description,
      sets: [{ weight: 20, reps: 8, done: true }],
    },
  ],
};
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gtrack",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  alice = env.authenticatedContext("alice").firestore();
  bob = env.authenticatedContext("bob").firestore();
  guest = env.unauthenticatedContext().firestore();
});
after(async () => {
  await env?.cleanup();
});
test("signed-in users share the create-only exercise library", async () => {
  await assertSucceeds(setDoc(doc(alice, "exercises", exercise.id), exercise));
  await assertSucceeds(getDoc(doc(bob, "exercises", exercise.id)));
  await assertFails(getDoc(doc(guest, "exercises", exercise.id)));
  await assertFails(
    setDoc(doc(bob, "exercises", exercise.id), {
      ...exercise,
      description: "Replaced",
    }),
  );
  await assertFails(deleteDoc(doc(alice, "exercises", exercise.id)));
  await assertFails(
    setDoc(doc(guest, "exercises", "b".repeat(64)), {
      ...exercise,
      id: "b".repeat(64),
    }),
  );
  await assertFails(
    setDoc(doc(alice, "exercises", "bad-id"), { ...exercise, id: "bad-id" }),
  );
});
test("workouts are account isolated and validated", async () => {
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/workouts/plan"), workout),
  );
  await assertSucceeds(getDocs(collection(alice, "users/alice/workouts")));
  await assertFails(getDocs(collection(bob, "users/alice/workouts")));
  await assertFails(setDoc(doc(bob, "users/alice/workouts/plan"), workout));
  await assertFails(
    setDoc(doc(alice, "users/alice/workouts/plan"), { ...workout, rest: -1 }),
  );
  await assertFails(
    setDoc(doc(alice, "users/alice/workouts/plan"), {
      ...workout,
      extra: "invalid",
    }),
  );
});
test("completed sessions are private, editable by their owner, and keep their identity", async () => {
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/sessions/session"), session),
  );
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/sessions/session"), session),
  );
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/sessions/session"), {
      ...session,
      completedAt: 3,
    }),
  );
  await assertFails(
    setDoc(doc(alice, "users/alice/sessions/session"), {
      ...session,
      startedAt: 2,
      completedAt: 3,
    }),
  );
  await assertFails(getDoc(doc(bob, "users/alice/sessions/session")));
  await assertFails(deleteDoc(doc(alice, "users/alice/sessions/session")));
  await assertFails(setDoc(doc(alice, "users/bob/sessions/session"), session));
});
test("program enrollments are private and program session metadata is validated", async () => {
  const enrollment = {
    id: "enrollment",
    templateId: "foundation-3",
    version: 1,
    startedAt: 1,
    updatedAt: 1,
    archived: false,
  };
  const ref = doc(alice, "users/alice/programs/enrollment");
  await assertSucceeds(setDoc(ref, enrollment));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(bob, "users/alice/programs/enrollment")));
  await assertFails(getDoc(doc(guest, "users/alice/programs/enrollment")));
  await assertFails(
    setDoc(doc(bob, "users/alice/programs/enrollment"), enrollment),
  );
  await assertFails(setDoc(ref, { ...enrollment, templateId: "unknown" }));
  await assertFails(setDoc(ref, { ...enrollment, version: 2 }));
  await assertSucceeds(setDoc(ref, { ...enrollment, archived: true }));
  await assertFails(deleteDoc(ref));
  const logged = {
    ...session,
    id: "program-session",
    program: {
      enrollmentId: "enrollment",
      templateId: "foundation-3",
      week: 1,
      day: 1,
      countsForProgress: true,
    },
  };
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/sessions/program-session"), logged),
  );
  await assertFails(
    setDoc(doc(alice, "users/alice/sessions/invalid-program"), {
      ...logged,
      id: "invalid-program",
      program: { ...logged.program, week: 9 },
    }),
  );
  const custom = {
    id: "custom-plan",
    templateId: "custom-custom-plan",
    version: 1,
    startedAt: 1,
    updatedAt: 1,
    archived: false,
    custom: {
      name: "My strength plan",
      weeks: 6,
      estimatedMinutes: "45–60",
      sessions: [
        {
          id: "day-1",
          name: "Upper",
          schedule: "Monday",
          exercises: [
            {
              exerciseName: "Synthetic press",
              sets: 3,
              reps: 8,
              rest: 120,
              effort: "2 reps in reserve",
            },
          ],
        },
      ],
    },
  };
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/programs/custom-plan"), custom),
  );
  await assertFails(
    setDoc(doc(alice, "users/alice/programs/custom-bad"), {
      ...custom,
      id: "custom-bad",
      templateId: "custom-custom-bad",
      custom: { ...custom.custom, weeks: 53 },
    }),
  );
  await assertSucceeds(
    setDoc(doc(alice, "users/alice/sessions/custom-program-session"), {
      ...session,
      id: "custom-program-session",
      program: {
        enrollmentId: "custom-plan",
        templateId: "custom-custom-plan",
        week: 1,
        day: 1,
        countsForProgress: true,
      },
    }),
  );
});
