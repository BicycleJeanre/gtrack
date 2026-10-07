# Exercise catalogue

GTrack bundles 876 source exercises and 93 curated GTrack names so search, pictures and filters continue to work offline. The 52 additional mobility entries cover every movement in the beginner prenatal stretching routine plus familiar yoga poses and common stretches. Each record includes a name, description, equipment, category, primary muscles and secondary muscles. The visual library provides a thumbnail for all 969 names without replacing GTrack's larger images and videos.

The picker derives a broad primary muscle group—Arms, Back, Chest, Core, Legs, Shoulders or Full body—from the detailed catalogue metadata. Custom shared exercises store the selected broad group and retain a representative detailed muscle so existing workload heat maps continue to work.

The data is derived from [Free Exercise DB at commit `a859101`](https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f), which is released into the public domain under The Unlicense. The source snapshot can be transformed with:

```sh
node scripts/import-exercise-catalog.mjs downloaded-exercises.json src/exercise-catalog.json
```

Review catalogue changes before committing them. Keep names at 80 characters or fewer and descriptions at 600 characters or fewer so records remain compatible with local validation and Firestore Security Rules.
