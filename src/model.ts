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
export interface CustomProgramExercise {
  exerciseName: string;
  sets: number;
  reps: number;
  rest: number;
  effort: string;
}
export interface CustomProgramDay {
  id: string;
  name: string;
  schedule: string;
  exercises: CustomProgramExercise[];
}
export interface CustomProgramDefinition {
  name: string;
  weeks: number;
  estimatedMinutes: string;
  sessions: CustomProgramDay[];
}
export interface ProgramEnrollment {
  id: string;
  templateId: string;
  version: number;
  startedAt: number;
  updatedAt: number;
  archived: boolean;
  deleted?: boolean;
  custom?: CustomProgramDefinition;
}
export interface ProgramSession {
  enrollmentId: string;
  templateId: string;
  week: number;
  day: number;
  countsForProgress: boolean;
}
export interface SessionExercise {
  guidance?: string;
  rest?: number;
  exerciseId: string;
  name: string;
  description: string;
  sets: LoggedSet[];
}
export interface Session {
  program?: ProgramSession;
  id: string;
  workoutName: string;
  startedAt: number;
  completedAt: number;
  rest: number;
  exercises: SessionExercise[];
}
export type Kind = "exercises" | "workouts" | "sessions" | "programs";
export interface Records {
  programs: Record<string, ProgramEnrollment>;
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
  programs: {},
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
const validCustomProgram = (value: any): value is CustomProgramDefinition =>
  value &&
  Object.keys(value).every((key) =>
    ["name", "weeks", "estimatedMinutes", "sessions"].includes(key),
  ) &&
  text(value.name, 60) &&
  count(value.weeks, 52) &&
  text(value.estimatedMinutes, 20) &&
  Array.isArray(value.sessions) &&
  value.sessions.length > 0 &&
  value.sessions.length <= 7 &&
  value.sessions.every(
    (session: any) =>
      session &&
      Object.keys(session).every((key) =>
        ["id", "name", "schedule", "exercises"].includes(key),
      ) &&
      validId(session.id) &&
      text(session.name, 60) &&
      text(session.schedule, 40) &&
      Array.isArray(session.exercises) &&
      session.exercises.length > 0 &&
      session.exercises.length <= 30 &&
      session.exercises.every(
        (exercise: any) =>
          exercise &&
          Object.keys(exercise).every((key) =>
            ["exerciseName", "sets", "reps", "rest", "effort"].includes(key),
          ) &&
          text(exercise.exerciseName, 80) &&
          count(exercise.sets, 12) &&
          count(exercise.reps, 100) &&
          number(exercise.rest, 0, 600) &&
          text(exercise.effort, 80),
      ),
  );
export function validateRecord(kind: Kind, value: any): boolean {
  if (!value || !validId(value.id)) return false;
  if (kind === "programs")
    return (
      Object.keys(value).every((k) =>
        [
          "id",
          "templateId",
          "version",
          "startedAt",
          "updatedAt",
          "archived",
          "deleted",
          "custom",
        ].includes(k),
      ) &&
      (["foundation-3", "strength-size-4", "barbell-strength-4"].includes(
        value.templateId,
      ) ||
        (typeof value.templateId === "string" &&
          value.templateId.startsWith("custom-") &&
          validCustomProgram(value.custom))) &&
      ((typeof value.templateId === "string" &&
        value.templateId.startsWith("custom-")) ||
        value.custom === undefined) &&
      value.version === 1 &&
      number(value.startedAt, 1, 9e15) &&
      number(value.updatedAt, value.startedAt, 9e15) &&
      typeof value.archived === "boolean" &&
      (value.deleted === undefined || typeof value.deleted === "boolean")
    );
  const allowed =
    kind === "exercises"
      ? ["id", "name", "description", "createdAt"]
      : kind === "workouts"
        ? ["id", "name", "rest", "exercises", "updatedAt", "archived"]
        : [
            "id",
            "workoutName",
            "program",
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
  const program = value.program;
  if (
    program !== undefined &&
    (!program ||
      Object.keys(program).some(
        (k) =>
          ![
            "enrollmentId",
            "templateId",
            "week",
            "day",
            "countsForProgress",
          ].includes(k),
      ) ||
      !validId(program.enrollmentId) ||
      !(
        typeof program.templateId === "string" &&
        (["foundation-3", "strength-size-4", "barbell-strength-4"].includes(
          program.templateId,
        ) ||
          program.templateId.startsWith("custom-"))
      ) ||
      !count(
        program.week,
        program.templateId === "foundation-3"
          ? 8
          : program.templateId.startsWith("custom-")
            ? 52
            : 12,
      ) ||
      !count(
        program.day,
        program.templateId === "foundation-3"
          ? 3
          : program.templateId.startsWith("custom-")
            ? 7
            : 4,
      ) ||
      typeof program.countsForProgress !== "boolean")
  )
    return false;
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
        (e.guidance === undefined || text(e.guidance, 500)) &&
        (e.rest === undefined || number(e.rest, 0, 600)) &&
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
  const result: Records = {
    exercises: {},
    workouts: {},
    sessions: {},
    programs: {},
  };
  for (const kind of [
    "exercises",
    "workouts",
    "sessions",
    "programs",
  ] as Kind[]) {
    if (kind === "programs" && data.records[kind] === undefined) continue;
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
    [
      "Incline barbell bench press",
      "Incline bench press using a barbell. Record total weight including the bar.",
    ],
    [
      "Dumbbell bench press",
      "Flat bench press using dumbbells. Record the weight of one dumbbell.",
    ],
    [
      "Incline dumbbell bench press",
      "Incline bench press using dumbbells. Record the weight of one dumbbell.",
    ],
    [
      "Dumbbell chest fly",
      "Chest fly on a flat bench using dumbbells. Record the weight of one dumbbell.",
    ],
    [
      "Cable chest fly",
      "Chest fly using two cable handles. Record the selected weight on one stack.",
    ],
    [
      "Machine chest press",
      "Seated chest press machine. Record the selected stack weight or added plates consistently.",
    ],
    ["Pec deck", "Seated chest fly machine. Record the selected stack weight."],
    [
      "Push-up",
      "Bodyweight press from the floor. Record 0 kg when unweighted, or added resistance only.",
    ],
    [
      "Dip",
      "Parallel-bar dip. Record added weight only, or 0 kg for bodyweight.",
    ],
    [
      "Lat pulldown",
      "Pull the cable bar toward the upper chest. Record the selected stack weight.",
    ],
    [
      "Pull-up",
      "Overhand-grip pull-up. Record added weight only, or 0 kg for bodyweight.",
    ],
    [
      "Chin-up",
      "Underhand-grip pull-up. Record added weight only, or 0 kg for bodyweight.",
    ],
    [
      "Barbell bent-over row",
      "Bent-over row using a barbell. Record total weight including the bar.",
    ],
    [
      "One-arm dumbbell row",
      "Row one dumbbell at a time. Record the dumbbell weight and reps per side; complete both sides before ticking the set.",
    ],
    [
      "Chest-supported dumbbell row",
      "Row dumbbells with the chest supported on an incline bench. Record the weight of one dumbbell.",
    ],
    [
      "Machine row",
      "Seated row machine. Record the selected stack weight or added plates consistently.",
    ],
    [
      "Straight-arm pulldown",
      "Cable pulldown with mostly straight arms. Record the selected stack weight.",
    ],
    [
      "Barbell deadlift",
      "Deadlift a barbell from the floor. Record total weight including the bar.",
    ],
    [
      "Trap bar deadlift",
      "Deadlift using a trap bar. Record total weight including the bar.",
    ],
    [
      "Barbell overhead press",
      "Standing overhead press using a barbell. Record total weight including the bar.",
    ],
    [
      "Machine shoulder press",
      "Seated overhead press machine. Record the selected stack weight or added plates consistently.",
    ],
    [
      "Dumbbell lateral raise",
      "Raise dumbbells out to the sides. Record the weight of one dumbbell.",
    ],
    [
      "Dumbbell front raise",
      "Raise dumbbells in front of the body. Record the weight of one dumbbell and reps per arm.",
    ],
    [
      "Reverse pec deck",
      "Rear-shoulder fly on a reverse pec deck machine. Record the selected stack weight.",
    ],
    [
      "Face pull",
      "Cable rope pull toward the face. Record the selected stack weight.",
    ],
    [
      "Dumbbell shrug",
      "Shoulder shrug holding dumbbells. Record the weight of one dumbbell.",
    ],
    [
      "Barbell curl",
      "Standing biceps curl using a barbell. Record total weight including the bar.",
    ],
    [
      "EZ-bar curl",
      "Biceps curl using an EZ bar. Record total weight including the bar.",
    ],
    [
      "Dumbbell curl",
      "Biceps curl using dumbbells. Record the weight of one dumbbell and reps per arm.",
    ],
    [
      "Hammer curl",
      "Dumbbell curl with palms facing inward. Record the weight of one dumbbell and reps per arm.",
    ],
    [
      "Preacher curl",
      "Biceps curl with the upper arms supported on a preacher bench. Record total bar weight, or stack weight for a machine.",
    ],
    [
      "Cable biceps curl",
      "Biceps curl using a cable attachment. Record the selected stack weight.",
    ],
    [
      "Triceps pushdown",
      "Cable triceps extension using a rope or bar. Record the selected stack weight and use the same attachment consistently.",
    ],
    [
      "Overhead cable triceps extension",
      "Overhead triceps extension using a cable attachment. Record the selected stack weight.",
    ],
    [
      "Dumbbell overhead triceps extension",
      "Two-handed overhead triceps extension using one dumbbell. Record that dumbbell’s weight.",
    ],
    [
      "EZ-bar skull crusher",
      "Lying triceps extension using an EZ bar. Record total weight including the bar.",
    ],
    [
      "Front squat",
      "Squat with a barbell supported at the front of the shoulders. Record total weight including the bar.",
    ],
    [
      "Goblet squat",
      "Squat holding one dumbbell or kettlebell at the chest. Record the weight of that implement.",
    ],
    [
      "Hack squat",
      "Squat using a hack squat machine. Record added plates consistently; note the machine used.",
    ],
    [
      "Smith machine squat",
      "Squat using a Smith machine. Record added plates consistently because bar resistance varies between machines.",
    ],
    [
      "Bulgarian split squat",
      "Rear-foot-elevated split squat holding dumbbells. Record one dumbbell’s weight and reps per leg; complete both legs before ticking the set.",
    ],
    [
      "Dumbbell lunge",
      "Lunge holding dumbbells. Record one dumbbell’s weight and reps per leg; complete both legs before ticking the set.",
    ],
    [
      "Dumbbell step-up",
      "Step onto a platform holding dumbbells. Record one dumbbell’s weight and reps per leg; complete both legs before ticking the set.",
    ],
    [
      "Dumbbell Romanian deadlift",
      "Hip-hinge movement using dumbbells. Record the weight of one dumbbell.",
    ],
    [
      "Barbell hip thrust",
      "Hip thrust with the upper back supported on a bench. Record total weight including the bar.",
    ],
    [
      "Leg extension",
      "Seated knee extension machine. Record the selected stack weight.",
    ],
    [
      "Seated leg curl",
      "Seated knee flexion machine. Record the selected stack weight.",
    ],
    [
      "Lying leg curl",
      "Prone knee flexion machine. Record the selected stack weight.",
    ],
    [
      "Hip abduction machine",
      "Seated machine movement pressing the legs outward. Record the selected stack weight.",
    ],
    [
      "Hip adduction machine",
      "Seated machine movement bringing the legs inward. Record the selected stack weight.",
    ],
    [
      "Standing calf raise",
      "Standing calf raise machine. Record the selected stack weight or added plates consistently.",
    ],
    [
      "Seated calf raise",
      "Seated calf raise machine. Record the selected stack weight or added plates consistently.",
    ],
    [
      "Cable crunch",
      "Kneeling abdominal crunch using a cable rope. Record the selected stack weight.",
    ],
    [
      "Crunch",
      "Floor abdominal crunch. Record 0 kg for bodyweight or added weight only.",
    ],
    [
      "Hanging knee raise",
      "Raise the knees while hanging from a bar. Record 0 kg for bodyweight or added weight only.",
    ],
    [
      "Lying leg raise",
      "Raise the legs while lying on the floor or a bench. Record 0 kg for bodyweight or added weight only.",
    ],
    [
      "Ab wheel rollout",
      "Kneeling rollout using an ab wheel. Record repetitions and 0 kg when unweighted.",
    ],
    [
      "Back extension",
      "Back extension on a bench. Record added weight only, or 0 kg for bodyweight.",
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
