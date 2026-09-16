# Exercise guides

Workouts → Exercise guide searches the shared exercise library by name or body area. View form opens the same guide from the workout editor, program preview and live session without rebuilding the underlying form or modifying records.

64 built-in exercises have original GTrack movement cues and common mistakes. 62 have two demonstration photographs. Dumbbell Romanian deadlift and hanging knee raise have text-only guides because an exact image match was unavailable. Custom exercises show their saved description with an explicit missing-guide message; names are normalized but never fuzzy-matched to a different movement.

## Media provenance

124 unmodified JPEGs from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), pinned to commit `a859101d633a01c4a1a920d6a8ce41dabba0705f`, downloaded September 16, 2026. The upstream project releases its data and images under the Unlicense. Its full license is retained in `src/assets/exercises/LICENSE.txt`. Each catalog entry records the original exercise directory and image paths. The app links directly to those pinned sources.

The photo pairs show two positions, not a continuous animation. High-pulley fly and bench leg-raise variations are labeled. The original photos have been visually checked against the exercise mappings. Coaching cues are general educational guidance, not individually assessed technique or official Sebastian Oreb material.

Further learning: [ACE exercise library](https://www.acefitness.org/resources/everyone/exercise-library/). Hip-hinge cues were cross-checked against [NASM’s barbell Romanian deadlift guide](https://www.nasm.org/resource-center/exercise-library/romanian-deadlift-barbell).

Images are imported through Vite and included in the service worker’s versioned precache. The initial download adds approximately 8.3 MB; subsequent viewing requires no external image host or connection. External learning/source links require internet. Existing accounts, backups and Firestore schema are unchanged.
