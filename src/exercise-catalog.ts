import catalogue from "./exercise-catalog.json" with { type: "json" };
const normalized = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

export const muscleGroups = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;

export const primaryMuscleGroups = [
  "arms",
  "back",
  "chest",
  "core",
  "legs",
  "shoulders",
  "full body",
] as const;
export type PrimaryMuscleGroup = (typeof primaryMuscleGroups)[number];

const broadGroupByMuscle: Record<string, PrimaryMuscleGroup> = {
  abdominals: "core",
  abductors: "legs",
  adductors: "legs",
  biceps: "arms",
  calves: "legs",
  chest: "chest",
  forearms: "arms",
  glutes: "legs",
  hamstrings: "legs",
  lats: "back",
  "lower back": "back",
  "middle back": "back",
  neck: "back",
  quadriceps: "legs",
  shoulders: "shoulders",
  traps: "back",
  triceps: "arms",
};

export const muscleGroupFor = (value: {
  primaryMuscleGroup?: string;
  primaryMuscles?: string[];
}): PrimaryMuscleGroup =>
  primaryMuscleGroups.includes(value.primaryMuscleGroup as PrimaryMuscleGroup)
    ? (value.primaryMuscleGroup as PrimaryMuscleGroup)
    : broadGroupByMuscle[value.primaryMuscles?.[0] || ""] || "full body";

export const representativeMuscle: Record<PrimaryMuscleGroup, string> = {
  arms: "biceps",
  back: "lats",
  chest: "chest",
  core: "abdominals",
  legs: "quadriceps",
  shoulders: "shoulders",
  "full body": "",
};

export const equipmentTypes = [
  "bands",
  "barbell",
  "body only",
  "cable",
  "dumbbell",
  "e-z curl bar",
  "exercise ball",
  "foam roll",
  "kettlebells",
  "machine",
  "medicine ball",
  "other",
] as const;

export interface CatalogueExercise {
  name: string;
  description: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
}

export const exerciseCatalogue = catalogue as CatalogueExercise[];
const byName = new Map(
  exerciseCatalogue.map((exercise) => [normalized(exercise.name), exercise]),
);

const inferredMuscle = (name: string) => {
  const value = normalized(name);
  if (/bench|chest|fly|push-up|dip/.test(value)) return "chest";
  if (/pulldown|pull-up|chin-up|row|straight-arm/.test(value)) return "lats";
  if (/squat|leg press|leg extension|lunge|step-up/.test(value))
    return "quadriceps";
  if (/deadlift|leg curl|hamstring/.test(value)) return "hamstrings";
  if (/hip thrust|glute/.test(value)) return "glutes";
  if (/shoulder|overhead press|lateral raise|front raise/.test(value))
    return "shoulders";
  if (/curl/.test(value)) return "biceps";
  if (/triceps|skull crusher|pushdown/.test(value)) return "triceps";
  if (/calf/.test(value)) return "calves";
  if (/crunch|leg raise|ab wheel/.test(value)) return "abdominals";
  if (/back extension/.test(value)) return "lower back";
  return "";
};

export function catalogueMetadata(name: string): {
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
} {
  const exact = byName.get(normalized(name));
  if (exact)
    return {
      equipment: exact.equipment,
      primaryMuscles: exact.primaryMuscles,
      secondaryMuscles: exact.secondaryMuscles,
      category: exact.category,
    };
  const muscle = inferredMuscle(name);
  return {
    equipment: "other",
    primaryMuscles: muscle ? [muscle] : [],
    secondaryMuscles: [],
    category: "strength",
  };
}

export const displayLabel = (value: string) =>
  value.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

const exerciseFamilies: Array<[RegExp, string]> = [
  [/\batlas stones?(?: trainer)?\b/i, "Atlas stone"],
  [
    /(?:\bdumbbell\b.*\bpress(?:es)?\b|\bpress(?:es)?\b.*\bdumbbell\b)/i,
    "Dumbbell press",
  ],
  [
    /(?:\bkettlebells?\b.*\bpress(?:es)?\b|\bpress(?:es)?\b.*\bkettlebells?\b)/i,
    "Kettlebell press",
  ],
  [/\bclean and jerks?\b/i, "Clean and jerk"],
  [/\bclean and press(?:es)?\b/i, "Clean and press"],
  [/\bclean(?:s| pull)?(?: from blocks)?\b/i, "Clean"],
  [/\bsnatch(?:es| balance| pull)?\b/i, "Snatch"],
  [/\bjerks?(?: balance)?\b/i, "Jerk"],
  [/\bpush press(?:es)?\b/i, "Push press"],
  [/\bfloor press(?:es)?\b/i, "Floor press"],
  [/\b(?:ab |barbell )?rollouts?\b/i, "Ab rollout"],
  [/\bpullovers?\b/i, "Pullover"],
  [/\bbox jumps?\b/i, "Box jump"],
  [/\brussian twists?\b/i, "Russian twist"],
  [/\bexternal rotations?\b/i, "External rotation"],
  [/\binternal rotations?\b/i, "Internal rotation"],
  [/\bwindmills?\b/i, "Windmill"],
  [/\bturkish get[- ]?ups?\b/i, "Turkish get-up"],
  [/\b(?:hip )?adductions?\b/i, "Hip adduction"],
  [/\b(?:hip )?abductions?\b/i, "Hip abduction"],
  [
    /\b(front|back|goblet|hack|split|overhead|box|zercher|sissy|pistol|smith machine)?\s*squats?\b/i,
    "Squat",
  ],
  [
    /\b(deadlifts?|romanian deadlifts?|stiff[- ]leg(?:ged)? deadlifts?|rack pulls?)\b/i,
    "Deadlift",
  ],
  [/\b(bench press(?:es)?|chest press(?:es)?)\b/i, "Bench press"],
  [/\b(shoulder|overhead|military|arnold) press(?:es)?\b/i, "Overhead press"],
  [/\b(rows?|rowing)\b/i, "Row"],
  [/\b(pull[- ]?ups?|chin[- ]?ups?)\b/i, "Pull-up"],
  [/\b(pulldowns?|pull-downs?)\b/i, "Pulldown"],
  [/\b(push[- ]?ups?)\b/i, "Push-up"],
  [/\b(lunges?|reverse lunges?|walking lunges?)\b/i, "Lunge"],
  [/\b(step[- ]?ups?)\b/i, "Step-up"],
  [/\b(leg press(?:es)?)\b/i, "Leg press"],
  [/\b(leg extensions?)\b/i, "Leg extension"],
  [/\b(leg curls?|hamstring curls?)\b/i, "Leg curl"],
  [/\b(calf raises?)\b/i, "Calf raise"],
  [/\b(hip thrusts?)\b/i, "Hip thrust"],
  [/\b(glute bridges?)\b/i, "Glute bridge"],
  [/\b(curls?)\b/i, "Curl"],
  [/\b(triceps pushdowns?|pushdowns?)\b/i, "Triceps pushdown"],
  [
    /\b(triceps extensions?|skull crushers?|french press(?:es)?)\b/i,
    "Triceps extension",
  ],
  [
    /\b(?:rear delt|reverse|back|sled reverse).*fl(?:y|yes|ies)\b/i,
    "Rear delt fly",
  ],
  [
    /\b(?:chest |pec |dumbbell |cable |machine |bodyweight )*fl(?:y|yes|ies)\b/i,
    "Chest fly",
  ],
  [/\bcable crossovers?\b|\bbutterfl(?:y|ies)\b/i, "Chest fly"],
  [/\b(lateral raises?)\b/i, "Lateral raise"],
  [/\b(front raises?)\b/i, "Front raise"],
  [/\b(reverse fly(?:es)?|rear delt fly(?:es)?)\b/i, "Rear delt fly"],
  [/\b(face pulls?)\b/i, "Face pull"],
  [/\b(shrugs?)\b/i, "Shrug"],
  [/\b(dips?)\b/i, "Dip"],
  [/\b(planks?)\b/i, "Plank"],
  [/\b(crunch(?:es)?)\b/i, "Crunch"],
  [/\b(sit[- ]?ups?)\b/i, "Sit-up"],
  [/\b(leg raises?|knee raises?)\b/i, "Leg raise"],
  [/\b(back extensions?|hyperextensions?)\b/i, "Back extension"],
  [/\b(good mornings?)\b/i, "Good morning"],
  [/\b(burpees?)\b/i, "Burpee"],
  [/\b(mountain climbers?)\b/i, "Mountain climber"],
];

/** A stable movement family used to browse a large catalogue before choosing a variant. */
export function exerciseFamilyName(name: string) {
  for (const [pattern, family] of exerciseFamilies)
    if (pattern.test(name)) return family;
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
