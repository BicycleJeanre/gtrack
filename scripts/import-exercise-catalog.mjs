import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error(
    "Usage: node scripts/import-exercise-catalog.mjs input.json output.json",
  );
}

const source = JSON.parse(await readFile(input, "utf8"));
const catalogue = source.map((exercise) => {
  const description = exercise.instructions
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  return {
    name: exercise.name,
    description,
    equipment: exercise.equipment || "other",
    primaryMuscles: exercise.primaryMuscles || [],
    secondaryMuscles: exercise.secondaryMuscles || [],
    category: exercise.category || "strength",
  };
});

await writeFile(output, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Wrote ${catalogue.length} exercises to ${output}`);
