import thumbnailMap from "./exercise-thumbnails.json" with { type: "json" };
import { normalize } from "./model";

const sheets = import.meta.glob<string>(
  "./assets/exercise-thumbnails/sheet-*.webp",
  { eager: true, query: "?url", import: "default" },
);

export type ExerciseThumbnail = {
  url: string;
  x: number;
  y: number;
};

export function bundledThumbnail(name: string): ExerciseThumbnail | null {
  const position = (
    thumbnailMap as unknown as Record<string, [number, number]>
  )[normalize(name)];
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
