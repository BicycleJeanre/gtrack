import thumbnailMap from "./exercise-thumbnails.json" with { type: "json" };
import { normalize } from "./model";
import prenatalMobilityUrl from "./assets/exercise-thumbnails/prenatal-mobility.webp?url";
import yogaPosesUrl from "./assets/exercise-thumbnails/yoga-poses.webp?url";

const sheets = import.meta.glob<string>(
  "./assets/exercise-thumbnails/sheet-*.webp",
  { eager: true, query: "?url", import: "default" },
);

export type ExerciseThumbnail = {
  url: string;
  x: number;
  y: number;
  size?: number;
};

const prenatalNames = [
  "Gentle Walking",
  "Shoulder Rolls",
  "Diaphragmatic Breathing",
  "Cat-Cow Stretch",
  "Wide-Knee Child's Pose",
  "Seated Butterfly Stretch",
  "Pelvic Tilts",
  "Standing Side Stretch",
  "Neck Mobility",
];
const yogaNames = [
  "Mountain Pose",
  "Downward-Facing Dog",
  "Upward-Facing Dog",
  "Cobra Pose",
  "Forward Fold",
  "Half Forward Fold",
  "Warrior I",
  "Warrior II",
  "Reverse Warrior",
  "Triangle Pose",
  "Extended Side Angle",
  "Tree Pose",
  "Low Lunge",
  "High Lunge",
  "Pigeon Pose",
  "Bridge Pose",
  "Happy Baby Pose",
  "Supine Spinal Twist",
  "Seated Spinal Twist",
  "Sphinx Pose",
  "Camel Pose",
  "Corpse Pose (Savasana)",
  "Thread the Needle",
  "Legs Up the Wall",
  "Figure Four Stretch",
];
const gridThumbnail = (
  names: string[],
  name: string,
  columns: number,
  url: string,
): ExerciseThumbnail | null => {
  const cell = names.findIndex((candidate) => normalize(candidate) === name);
  if (cell < 0) return null;
  return {
    url,
    x: ((cell % columns) / (columns - 1)) * 100,
    y: (Math.floor(cell / columns) / (columns - 1)) * 100,
    size: columns * 100,
  };
};

const stretchingAliases: Record<string, string> = {
  "standing hamstring stretch": "standing hamstring and calf stretch",
  "kneeling hip flexor stretch": "kneeling hip flexor",
  "standing quadriceps stretch": "quad stretch",
  "wall calf stretch": "calf stretch hands against wall",
  "doorway chest stretch": "chest and front of shoulder stretch",
  "cross-body shoulder stretch": "shoulder stretch",
  "overhead triceps stretch": "triceps stretch",
  "forearm flexor stretch": "kneeling forearm stretch",
  "forearm extensor stretch": "side wrist pull",
  "upper trapezius stretch": "side neck stretch",
  "90/90 hip stretch": "ankle on the knee",
  "adductor rock back": "side lying groin stretch",
  "open book thoracic rotation": "spinal stretch",
  "frog stretch": "lying bent leg groin",
  "ankle dorsiflexion stretch": "standing soleus and achilles stretch",
  "lying glute stretch": "lying glute",
  "it band stretch": "it band and glute stretch",
  "chest opener stretch": "behind head chest stretch",
};

export function bundledThumbnail(name: string): ExerciseThumbnail | null {
  const normalizedName = normalize(name),
    curated =
      gridThumbnail(prenatalNames, normalizedName, 3, prenatalMobilityUrl) ||
      gridThumbnail(yogaNames, normalizedName, 5, yogaPosesUrl);
  if (curated) return curated;
  const position = (
    thumbnailMap as unknown as Record<string, [number, number]>
  )[stretchingAliases[normalizedName] || normalizedName];
  if (!position) return null;
  const [sheet, cell] = position,
    column = cell % 10,
    row = Math.floor(cell / 10),
    url = sheets[`./assets/exercise-thumbnails/sheet-${sheet}.webp`];
  return url
    ? {
        url,
        x: (column / 9) * 100,
        y: (row / 9) * 100,
      }
    : null;
}
