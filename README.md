# gtrack

A personal gym training app for planning workouts and tracking progress, designed to work offline on an iPhone and sync data online when connected.

## Purpose and audience

The app is primarily for personal use, with possibly one or two friends using their own accounts. There is no planned public product launch or App Store release. This repository is private.

The intended core features are:

- Plan workouts and exercises.
- Log completed workouts, including weights, sets, and reps.
- Review workout history and progress over time.
- Use downloaded plans and record training without an internet connection.
- Sync training data across devices when online.

The detailed screens and first-release feature set have not yet been defined.

## Agreed direction

We will build a **Progressive Web App (PWA)** using **Firebase Authentication and Cloud Firestore** for accounts and online data. Keeping deployment and maintenance simple is a priority.

| Component | Responsibility |
| --- | --- |
| GitHub Pages, intended hosting target | Serve the PWA's static files over HTTPS. Availability for this private repository still needs to be checked against the GitHub account's plan. |
| Service worker and app cache | Keep the app's essential screens and assets available for offline launch after an initial online load. |
| Firestore persistent browser cache | Make downloaded data and pending writes available across app restarts and while offline. Web persistence must be explicitly enabled. |
| Firebase Authentication | Provide a separate account for each user. |
| Cloud Firestore | Store the online data and synchronize local changes when connected. |

The frontend framework is still undecided. No custom application server is currently planned.

## Installation and deployment

Users will open the hosted URL on their iPhone and choose **Add to Home Screen**, then launch the app from its own icon. The initial installation, sign-in, and data download require connectivity.

App updates will be published through the GitHub hosting workflow. No Apple Developer membership, signing renewal, TestFlight build, or App Store review is needed for the PWA.

A private source repository does not by itself make the hosted website private. Access to training data must be enforced through authentication and database security rules, regardless of whether the app's URL is publicly reachable.

## Offline operation and synchronization

The intended experience is:

1. Plan a workout on a phone or laptop while online.
2. Download the plans and history needed on the training device.
3. At the gym, record sets, reps, and weights without needing reception.
4. Keep pending changes locally across closing and reopening the app.
5. Synchronize while the app is open and connected again, making the results available on other signed-in devices.

The interface should clearly distinguish **Saved on phone**, **Sync pending**, and **Synced**, and make sync errors visible. We should not depend on background sync while the iPhone app is closed.

Firestore only makes cached data available offline; it does not automatically download an entire account. We must deliberately load the plans and history needed for offline use and define cache retention accordingly.

Firestore uses last-write-wins behavior for competing changes to the same document. Record structure and edit-conflict handling still need to be designed so that updates from different devices do not unexpectedly overwrite training history.

## Privacy and data recovery

- Keep each user's training data private by default using Firestore Security Rules tied to their authenticated user ID.
- Any sharing of plans or results between friends would be an explicit future feature.
- Never include administrative credentials or service-account keys in the frontend or repository.
- Include export and import so users can retain an independent copy of their training history.
- Treat synchronization and backup as separate concerns: synchronization also propagates deletions.

Browser storage can be cleared or evicted. Persistent storage should be requested where supported, but it cannot replace online synchronization and independent exports. Unsynced records remain vulnerable if local storage is lost.

## Cost expectations

For a few users storing mainly workout text and numbers, the expectation is that Firestore usage will fit within its free allowance. This is an estimate, not a guarantee; current quotas and usage should be checked during setup. Media storage is outside the currently discussed scope.

## Implementation status and next steps

This repository currently records the agreed direction only. The PWA, Firebase project, authentication, database rules, and deployment workflow have not been implemented or configured.

Next steps:

1. Define the first version's workout-planning, logging, and progress screens.
2. Choose the frontend framework and design the data model.
3. Configure Firebase Authentication and Firestore with per-user access rules.
4. Build a small working PWA and set up hosting.
5. Verify installation, offline launch, workout logging in airplane mode, restart recovery, reconnection sync, and app updates on a real iPhone.
6. Verify isolation between accounts, cross-device edits, and export/import recovery.

## References

- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firestore pricing and free quotas](https://firebase.google.com/docs/firestore/pricing)
- [WebKit browser storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
