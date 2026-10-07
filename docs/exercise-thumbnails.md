# Exercise thumbnails

The visual exercise picker contains a thumbnail for all 917 bundled and curated exercise names. It uses ten 1280 × 1280 WebP sprite sheets under `src/assets/exercise-thumbnails/`, totaling about 1.6 MB. Grouping 100 square thumbnails per sheet keeps the installed app fast and avoids hundreds of offline-cache requests.

## Sources

- 873 of the 876 source-catalogue movements use the first exact image from [Free Exercise DB commit `a859101`](https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f). The project and images are released under The Unlicense.
- Curated GTrack aliases reuse the exact movement source recorded in `src/exercise-guides.json`.
- Five movements without an exact upstream photo use project-owned generated source images under `src/assets/exercise-thumbnail-sources/`: Kettlebell Halo, Kettlebell Halo with Overhead Extension, Kettlebell Overhead Triceps Extension, Dumbbell Romanian Deadlift and Hanging Knee Raise.

The generated images were created with OpenAI's built-in image generation tool on October 7, 2026. Each prompt requested a square, text-free instructional fitness image on a white studio background, with one athlete demonstrating the named movement using anatomically plausible neutral form. Movement-specific prompts described the exact implement, grip and exercise position. The retained source images are compressed 512 px WebP files; only the smaller sprite sheets ship in the app bundle.

## Rebuild

Download or check out the pinned Free Exercise DB revision, install Pillow, then run:

```sh
python3 scripts/build-exercise-thumbnails.py /path/to/free-exercise-db
```

The script verifies every source image, rebuilds the sprite sheets and rewrites `src/exercise-thumbnails.json`. Review the result visually before committing catalogue or source-mapping changes.

New user-created shared exercises store a phone-compressed 192 px image in their Firestore exercise record. Security rules accept only bounded PNG, JPEG or WebP data URLs and allow an existing image-less record to receive one photo without changing its name or metadata.
