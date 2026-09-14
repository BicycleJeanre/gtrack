export interface Exercise {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}
export interface PlannedSet {
  reps: number;
  weight: number;
}
export interface Target {
  exerciseId: string;
  name: string;
  description: string;
  sets: number;
  reps: number;
  weight: number;
  // Optional for compatibility with plans and backups made before per-set targets.
  setTargets?: PlannedSet[];
}
export interface Workout {
  id: string;
  name: string;
  rest: number;
  exercises: Target[];
  updatedAt: number;
  archived: boolean;
}
export interface LoggedSet {
  weight: number;
  reps: number;
  done: boolean;
}
export interface SessionExercise {
  exerciseId: string;
  name: string;
  description: string;
  sets: LoggedSet[];
}
export interface Session {
  id: string;
  workoutName: string;
  startedAt: number;
  completedAt: number;
  rest: number;
  exercises: SessionExercise[];
}
export type Kind = "exercises" | "workouts" | "sessions";
export interface Records {
  exercises: Record<string, Exercise>;
  workouts: Record<string, Workout>;
  sessions: Record<string, Session>;
}
export interface Pending {
  kind: Kind;
  id: string;
  token: string;
}
export interface State extends Records {
  schema: 1;
  draft: Session | null;
  pending: Pending[];
}
export const emptyState = (): State => ({
  schema: 1,
  exercises: {},
  workouts: {},
  sessions: {},
  draft: null,
  pending: [],
});
export const uid = () => crypto.randomUUID();
export const normalize = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export async function exerciseId(name: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalize(name)),
  );
  return Array.from(new Uint8Array(hash), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const count = (v: unknown, max: number) =>
  number(v, 1, max) && Number.isInteger(v);
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(v);
export function validateRecord(kind: Kind, value: any): boolean {
  if (!value || !validId(value.id)) return false;
  const allowed =
    kind === "exercises"
      ? ["id", "name", "description", "createdAt"]
      : kind === "workouts"
        ? ["id", "name", "rest", "exercises", "updatedAt", "archived"]
        : [
            "id",
            "workoutName",
            "rest",
            "startedAt",
            "completedAt",
            "exercises",
          ];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return false;
  if (kind === "exercises")
    return (
      text(value.name, 80) &&
      text(value.description, 600) &&
      number(value.createdAt, 1, 9e15)
    );
  if (kind === "workouts")
    return (
      text(value.name, 60) &&
      number(value.rest, 0, 600) &&
      number(value.updatedAt, 1, 9e15) &&
      typeof value.archived === "boolean" &&
      Array.isArray(value.exercises) &&
      value.exercises.length > 0 &&
      value.exercises.length <= 30 &&
      value.exercises.every(
        (e: any) =>
          validId(e.exerciseId) &&
          text(e.name, 80) &&
          text(e.description, 600) &&
          count(e.sets, 12) &&
          count(e.reps, 100) &&
          number(e.weight, 0, 1000) &&
          (e.setTargets === undefined ||
            (Array.isArray(e.setTargets) &&
              e.setTargets.length === e.sets &&
              e.setTargets.every(
                (set: any) =>
                  set && count(set.reps, 100) && number(set.weight, 0, 1000),
              ) &&
              e.setTargets[0].reps === e.reps &&
              e.setTargets[0].weight === e.weight)),
      )
    );
  return (
    text(value.workoutName, 60) &&
    number(value.rest, 0, 600) &&
    number(value.startedAt, 1, 9e15) &&
    number(value.completedAt, value.startedAt, 9e15) &&
    Array.isArray(value.exercises) &&
    value.exercises.length > 0 &&
    value.exercises.length <= 30 &&
    value.exercises.every(
      (e: any) =>
        validId(e.exerciseId) &&
        text(e.name, 80) &&
        text(e.description, 600) &&
        Array.isArray(e.sets) &&
        e.sets.length > 0 &&
        e.sets.length <= 12 &&
        e.sets.every(
          (s: any) =>
            number(s.weight, 0, 1000) &&
            count(s.reps, 100) &&
            typeof s.done === "boolean",
        ),
    ) &&
    value.exercises.some((e: any) => e.sets.some((s: any) => s.done))
  );
}
export function plannedSets(target: Target): PlannedSet[] {
  return target.setTargets
    ? target.setTargets.map((set) => ({ reps: set.reps, weight: set.weight }))
    : Array.from({ length: target.sets }, () => ({
        reps: target.reps,
        weight: target.weight,
      }));
}
export function startSession(workout: Workout): Session {
  return {
    id: uid(),
    workoutName: workout.name,
    startedAt: Date.now(),
    completedAt: 0,
    rest: workout.rest,
    exercises: workout.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      description: e.description,
      sets: plannedSets(e).map((set) => ({ ...set, done: false })),
    })),
  };
}
export const completedSets = (s: Session) =>
  s.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
export const volume = (s: Session) =>
  s.exercises.reduce(
    (n, e) =>
      n +
      e.sets.filter((x) => x.done).reduce((a, x) => a + x.weight * x.reps, 0),
    0,
  );
export async function validateBackup(input: unknown): Promise<Records> {
  const data = input as any;
  if (data?.schema !== 1 || !data.records)
    throw new Error("This is not a GTrack version 1 backup.");
  const result: Records = { exercises: {}, workouts: {}, sessions: {} };
  for (const kind of ["exercises", "workouts", "sessions"] as Kind[]) {
    if (!Array.isArray(data.records[kind]) || data.records[kind].length > 10000)
      throw new Error("Invalid or oversized backup.");
    for (const record of data.records[kind]) {
      if (!validateRecord(kind, record) || result[kind][record.id as string])
        throw new Error("Backup contains invalid or duplicate records.");
      if (kind === "exercises" && (await exerciseId(record.name)) !== record.id)
        throw new Error("Exercise identity does not match its name.");
      (result[kind] as Record<string, any>)[record.id] = record;
    }
  }
  // Active sessions stay device-local and are deliberately not restored as completed history.
  return result;
}
export async function seedExercises(): Promise<Exercise[]> {
  const seeds = [
    [
      "Barbell bench press",
      "Flat bench press using a barbell. Record total weight including the bar.",
    ],
    [
      "Seated cable row",
      "Seated row on a cable machine. Record the selected stack weight.",
    ],
    [
      "Dumbbell shoulder press",
      "Press dumbbells overhead. Record the weight of one dumbbell.",
    ],
    [
      "Barbell squat",
      "Back squat with a barbell. Record total weight including the bar.",
    ],
    [
      "Romanian deadlift",
      "Hip-hinge movement with a barbell. Record total weight including the bar.",
    ],
    [
      "Leg press",
      "Machine leg press. Use the same convention for loaded weight each session.",
    ],
  ];
  return Promise.all(
    seeds.map(async ([name, description]) => ({
      id: await exerciseId(name),
      name,
      description,
      createdAt: 1,
    })),
  );
}
