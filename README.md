# GTrack

A personal gym training PWA for iPhone: plan workouts, log sets without reception, and review actual training progress. Intended for personal use and a few friends with separate accounts. The mobile UI follows FTrack’s charcoal and cyan theme.

## Current implementation

- Create, edit and archive workout plans; set exercise order, rest periods, and individual reps and weights for each set. Add or remove sets for warm-ups and working sets. Existing plans with uniform targets remain compatible.
- Select exercises from a reusable library, with descriptions and new exercise contributions. Six common exercises are included; no fake workouts or history are created.
- Log a session with automatic device saves, a rest countdown, restart recovery, and partial-session completion.
- Review completed sessions and best working weights by exercise.
- Export/import JSON backups; imports add missing records and preserve existing IDs.
- Installable PWA with a versioned offline app cache and safe update prompt.
- Optional Firebase email/password accounts, a shared exercise library, private plans/history, and a durable synchronization queue.
- Automated Chromium and WebKit browser tests, data-model tests, Firebase Rules tests and an emulator-based multi-account sync test.

**The Firebase project is configured locally: Firestore rules/indexes are deployed and email/password sign-in is enabled. The site is deployed through GitHub Pages.** Without Firebase configuration the app is fully usable in device-only mode. Its records survive page refreshes, but are not synced or shared between users. The original design exploration remains in `mockups/workout.html`.

## Run locally

Use Node 24 LTS (minimum 22.12):

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To test the installable/offline production build:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/`, allow the first online load to finish, then use Account → Ready for the gym to check offline availability. The development server does not register a service worker. On iPhone, installation requires a reachable HTTPS deployment; the computer’s localhost URL is not reachable from the phone.

## Connect Firebase

1. Create or select a Firebase project. Register a **Web app** and copy its public web configuration.
2. Enable **Authentication → Email/Password**. Add the deployed hostname to Authentication’s authorized domains (and localhost for local development where needed).
3. Create Cloud Firestore in the chosen region. Use the locked rules in this repository, not open test-mode rules.
4. Copy `.env.example` to `.env.local` and set all four `VITE_FIREBASE_*` values. These are public web-app identifiers; never put administrative credentials or service-account keys in the frontend.
5. Deploy the access rules to the selected project:

   ```sh
   npx firebase login
   npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
   ```

6. Restart Vite, or rebuild for production. In Account, choose **Sign in or create account**.

Device-only records and account records are intentionally separate. To move local records into an account, export before signing in, then import in that account. Imported exercise names/descriptions are shared; workout plans and training logs remain private.

All signed-in users can read and create library entries. Entries cannot be edited or deleted by clients, so a user cannot replace another user’s description. Normalized names use deterministic IDs to deduplicate normal app contributions. Security Rules validate the shared entry shape but cannot verify the client’s SHA-256 normalization; a hostile client could bypass name uniqueness. This is a small trusted-user application, without public signup moderation or shared-library administration.

## Data and offline behavior

| Record                        | Storage and access                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `exercises/{nameHash}`        | Shared with authenticated users; create-only.                                                                                           |
| `users/{uid}/workouts/{id}`   | Private plan documents; soft archive. Concurrent plan edits use the last server write.                                                  |
| `users/{uid}/sessions/{uuid}` | Private, immutable completed sessions; snapshots preserve exercise names, descriptions and set values. Identical retries are permitted. |
| Active session                | IndexedDB on the current device, scoped to the current account. Does not move between devices while in progress.                        |
| Pending sync queue            | IndexedDB, alongside the records, scoped to each account. Removed only after cloud acknowledgement.                                     |

Every user edit is saved to IndexedDB before the UI reports success. Cloud mode also explicitly enables Firestore’s persistent multi-tab cache. Listeners download the shared library and all plans/completed sessions for the signed-in account, then merge downloaded records around pending local edits. This full-history approach is appropriate for a few users; add pagination/retention before growing the app.

The service worker precaches static app files only; it does not cache Firebase authentication responses. Sync runs when the app is open and connected, at sign-in, after saves, on reconnection and when returning to the app. Errors remain visible with a retry action. There is no dependency on closed-app background sync. An active draft is always device-local, even if other records say Synced.

One editor tab is allowed per origin using Web Locks where supported. This prevents two tabs from changing the same active session. IndexedDB transactions protect record writes independently. Workouts remain editable while a session exists, but those edits do not alter the already-started session. Across devices, plan edits are last-write-wins; completed history uses unique immutable session IDs to avoid overwrites.

Use the app on trusted devices: locally cached account data remains in browser storage after sign-out and is not encrypted by GTrack. Signing out does not expose it in another account’s UI. Pending records or active sessions must be finished/synced before app sign-out. Browser storage can be cleared or evicted; synchronization is not a backup.

Exports contain exercises, plans (including archived plans) and **completed** sessions. Active sessions stay device-local and are not exported. Import validates the format before any write, merges missing IDs in one transaction, and does not replace existing records. Keep an independent export even when syncing.

## Deployment

`.github/workflows/check.yml` runs the checks. `.github/workflows/deploy.yml` is **manual** and publishes the production build to GitHub Pages with `/gtrack/` as its base path.

The source repository is public. Live Firebase configuration stays in the ignored `.env.local` file and encrypted GitHub Actions secrets, injected only during deployment. The published JavaScript necessarily contains Firebase web identifiers; authentication and Firestore Security Rules protect the data. No service-account keys or login credentials belong in this repository.

Before deploying:

- The live site is available at https://bicyclejeanre.github.io/gtrack/.
- Select **GitHub Actions** as the Pages source.
- Set the four public `VITE_FIREBASE_*` values as repository Actions secrets.
- Configure Firebase and deploy its Security Rules separately.
- Run **Deploy to GitHub Pages**. The workflow refuses a build with missing Firebase values.

The app also supports other static HTTPS hosts. Set `BASE_PATH=/` for a root-domain deployment or the appropriate subdirectory. Never serve the repository root as a public production website; publish `dist/` only.

Updates wait for an explicit reload; an active session or open editor prevents applying an update. Every build has a distinct app cache. The prior version remains active until the new build is completely cached and activated.

## Verification

```sh
npx playwright install chromium webkit
npm run test:unit
npm run build
npm test
# Requires Java 21+ for the Firestore emulator:
npm run test:rules
npm run test:cloud
```

Tests use synthetic fixtures and the `demo-gtrack` emulator project only. No production data is queried. Browser coverage includes exercise contributions and reuse, editing/reordering, durable session logs, offline restart with the actual origin stopped, history/progress, export/import and account/tab isolation. Emulator coverage checks library sharing, private records, immutable history, offline sync and a second device.

Before relying on it at the gym, validate on a real iPhone: Add to Home Screen, airplane-mode launch, log sets, close/reopen, reconnect and sync, install an update, and restore an exported backup. Desktop WebKit testing does not replace this device check. Real-project authentication and reconnection also need a smoke test after configuration.

## Technical references

- [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Vite static deployment](https://vite.dev/guide/static-deploy)
- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
