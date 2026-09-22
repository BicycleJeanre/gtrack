# Exercise catalogue

GTrack bundles 876 exercises so search and filters continue to work offline. Each record includes a name, description, equipment, category, primary muscles and secondary muscles. The catalogue does not replace or alter GTrack's own images and videos.

The data is derived from [Free Exercise DB at commit `a859101`](https://github.com/yuhonas/free-exercise-db/tree/a859101d633a01c4a1a920d6a8ce41dabba0705f), which is released into the public domain under The Unlicense. The source snapshot can be transformed with:

```sh
node scripts/import-exercise-catalog.mjs downloaded-exercises.json src/exercise-catalog.json
```

Review catalogue changes before committing them. Keep names at 80 characters or fewer and descriptions at 600 characters or fewer so records remain compatible with local validation and Firestore Security Rules.
