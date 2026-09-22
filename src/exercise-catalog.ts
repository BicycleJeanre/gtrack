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
