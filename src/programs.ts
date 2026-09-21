import catalog from "../docs/research/example-programs.json";
import {
  uid,
  type ProgramEnrollment,
  type Session,
  type Exercise,
} from "./model";
export interface ProgramExercise {
  exerciseName: string;
  role: string;
  sets?: number;
  reps?: number;
  rest?: number;
  effort?: string;
}
export interface ProgramPhase {
  weeks: number[];
  name: string;
  rir: string;
  [role: string]: number[] | string;
}
export interface ProgramTemplate {
  id: string;
  name: string;
  weeks: number;
  audience: string;
  schedule: string[];
  estimatedMinutes: string;
  sessions: { name: string; exercises: ProgramExercise[] }[];
  phases: ProgramPhase[];
}
export const programs = catalog.programs as ProgramTemplate[];
export const templateFor = (id: string) => programs.find((p) => p.id === id)!;
export function templateForEnrollment(
  enrollment: ProgramEnrollment,
): ProgramTemplate {
  if (!enrollment.custom) return templateFor(enrollment.templateId);
  return {
    id: enrollment.templateId,
    name: enrollment.custom.name,
    weeks: enrollment.custom.weeks,
    audience: "Your custom training program",
    schedule: enrollment.custom.sessions.map((session) => session.schedule),
    estimatedMinutes: enrollment.custom.estimatedMinutes,
    sessions: enrollment.custom.sessions.map((session) => ({
      name: session.name,
      exercises: session.exercises.map((exercise) => ({
        ...exercise,
        role: "custom",
      })),
    })),
    phases: [
      {
        weeks: Array.from(
          { length: enrollment.custom.weeks },
          (_, index) => index + 1,
        ),
        name: "Your plan",
        rir: "",
      },
    ],
  };
}
export const phaseFor = (p: ProgramTemplate, week: number) =>
  p.phases.find((ph) => ph.weeks.includes(week))!;
export function programProgress(
  enrollment: ProgramEnrollment,
  sessions: Session[],
) {
  const template = templateForEnrollment(enrollment);
  const completed = new Set(
    sessions
      .filter(
        (s) =>
          s.program?.enrollmentId === enrollment.id &&
          s.program.templateId === template.id &&
          s.program.countsForProgress,
      )
      .map(
        (s) =>
          (s.program!.week - 1) * template.sessions.length + s.program!.day - 1,
      ),
  );
  const total = template.weeks * template.sessions.length;
  let next = 0;
  while (completed.has(next) && next < total) next++;
  return {
    completed: completed.size,
    total,
    finished: next === total,
    week: Math.floor(next / template.sessions.length) + 1,
    day: (next % template.sessions.length) + 1,
  };
}
export function prescription(phase: ProgramPhase, role: string): number[] {
  return phase[role] as number[];
}
export function exercisePrescription(
  phase: ProgramPhase,
  exercise: ProgramExercise,
): number[] {
  return exercise.sets && exercise.reps
    ? [exercise.sets, exercise.reps]
    : prescription(phase, exercise.role);
}
export function restFor(role: string): number {
  return role === "primary" || role === "practice"
    ? 180
    : role === "secondary"
      ? 120
      : 90;
}
export function effortFor(
  phase: ProgramPhase,
  role: string,
  week: number,
): string {
  if (role === "practice") return "4+ reps in reserve";
  if (phase.name.includes("Review") || phase.name.includes("benchmark"))
    return role === "primary"
      ? "2 reps in reserve on first set; 4+ thereafter"
      : "4+ reps in reserve";
  if (phase.rir.includes("→"))
    return `${["3", "2–3", "2"][phase.weeks.indexOf(week)]} reps in reserve`;
  return phase.rir.split(";")[0] + " reps in reserve";
}
export function exerciseEffort(
  phase: ProgramPhase,
  exercise: ProgramExercise,
  week: number,
) {
  return exercise.effort || effortFor(phase, exercise.role, week);
}
export function createProgramSession(
  enrollment: ProgramEnrollment,
  week: number,
  day: number,
  library: Exercise[],
  weights: number[],
): Session {
  const p = templateForEnrollment(enrollment),
    phase = phaseFor(p, week),
    template = p.sessions[day - 1];
  if (
    !template ||
    !phase ||
    weights.length !== template.exercises.length ||
    weights.some((w) => !Number.isFinite(w) || w < 0 || w > 1000)
  )
    throw Error("Enter a valid working weight for each exercise.");
  return {
    id: uid(),
    workoutName: `${p.name.split(" — ")[0]} · W${week} D${day}`,
    startedAt: Date.now(),
    completedAt: 0,
    rest: 180,
    program: {
      enrollmentId: enrollment.id,
      templateId: p.id,
      week,
      day,
      countsForProgress: false,
    },
    exercises: template.exercises.map((item, i) => {
      const exercise = library.find((e) => e.name === item.exerciseName);
      if (!exercise) throw Error(`Exercise unavailable: ${item.exerciseName}`);
      const [sets, reps] = exercisePrescription(phase, item);
      const rest = item.rest ?? restFor(item.role),
        restLabel = item.rest
          ? `${Math.round(item.rest / 60)} min`
          : item.role === "primary" || item.role === "practice"
            ? "3–5 min"
            : item.role === "secondary"
              ? "2–3 min"
              : "1–2 min";
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        description: exercise.description,
        rest,
        guidance: `${item.role === "custom" ? "Program target" : item.role} · ${exerciseEffort(phase, item, week)} · Rest ${restLabel}. Warm up separately; log working sets here.`,
        sets: Array.from({ length: sets }, () => ({
          weight: weights[i],
          reps,
          done: false,
        })),
      };
    }),
  };
}
