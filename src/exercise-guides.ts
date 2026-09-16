import catalog from "./exercise-guides.json";
import { normalize } from "./model";
const photos = import.meta.glob<string>("./assets/exercises/**/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});
export const guides = catalog;
export const guideFor = (name: string) =>
  guides.find((g) => normalize(g.name) === normalize(name));
export const photoFor = (path: string) => photos[`./assets/exercises/${path}`];
