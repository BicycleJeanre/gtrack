import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  connectAuthEmulator,
  type User,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  runTransaction,
  connectFirestoreEmulator,
  type Unsubscribe,
} from "firebase/firestore";
import { type Kind, validateRecord } from "./model";
import { type Store } from "./store";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
const app = configured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : null;
if (import.meta.env.VITE_USE_EMULATORS === "true" && auth && db) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
export const watchAuth = (cb: (user: User | null) => void) =>
  auth ? onAuthStateChanged(auth, cb) : (cb(null), () => {});
export async function login(email: string, password: string, create: boolean) {
  if (!auth)
    throw new Error("Cloud accounts are not configured for this installation.");
  await (create
    ? createUserWithEmailAndPassword(auth, email, password)
    : signInWithEmailAndPassword(auth, email, password));
}
export async function logout() {
  if (auth) await signOut(auth);
}
export async function resetPassword(email: string) {
  if (auth) await sendPasswordResetEmail(auth, email);
}
export class Cloud {
  private stops: Unsubscribe[] = [];
  private working = false;
  private stopped = false;
  ready = new Set<string>();
  error = "";
  constructor(
    private store: Store,
    private changed: () => void,
  ) {}
  start() {
    if (!db) return;
    for (const kind of [
      "exercises",
      "workouts",
      "sessions",
      "programs",
      "bodyEntries",
    ] as Kind[]) {
      const ref =
        kind === "exercises"
          ? collection(db, "exercises")
          : collection(db, "users", this.store.account, kind);
      this.stops.push(
        onSnapshot(
          ref,
          { includeMetadataChanges: true },
          async (snapshot) => {
            try {
              if (this.stopped) return;
              await this.store.mutate((s) => {
                for (const d of snapshot.docs) {
                  if (s.pending.some((p) => p.kind === kind && p.id === d.id))
                    continue;
                  const data = d.data();
                  if (validateRecord(kind, data))
                    (s[kind] as Record<string, any>)[d.id] = data;
                }
              });
              if (!snapshot.metadata.fromCache) this.ready.add(kind);
              this.changed();
            } catch {
              this.error =
                "Could not save downloaded data on this device. Export your data and check available storage.";
              this.changed();
            }
          },
          () => {
            this.error =
              "Cloud access failed. Check your connection and account permissions, then retry.";
            this.changed();
          },
        ),
      );
    }
    void this.flush();
  }
  async flush() {
    if (this.working || this.stopped || !db || !navigator.onLine) return;
    this.working = true;
    this.error = "";
    this.changed();
    try {
      while (!this.stopped && navigator.onLine) {
        const pending = this.store.state.pending[0];
        if (!pending) break;
        const record = this.store.state[pending.kind][pending.id];
        const ref =
          pending.kind === "exercises"
            ? doc(db, "exercises", pending.id)
            : doc(db, "users", this.store.account, pending.kind, pending.id);
        if (pending.kind === "exercises") {
          // Stable name hashes + create-only library entries avoid duplicates across users.
          const remote = await runTransaction(db, async (transaction) => {
            const existing = await transaction.get(ref);
            if (existing.exists()) return existing.data();
            transaction.set(ref, record);
            return record;
          });
          await this.store.mutate((s) => {
            if (validateRecord("exercises", remote))
              s.exercises[pending.id] = remote as any;
          });
        } else await setDoc(ref, record);
        await this.store.mutate((s) => {
          s.pending = s.pending.filter((p) => p.token !== pending.token);
        });
        this.changed();
      }
    } catch {
      this.error =
        "Sync failed. Your data remains on this device. Check your connection or permissions and retry.";
    } finally {
      this.working = false;
      this.changed();
    }
  }
  retry() {
    this.stops.forEach((stop) => stop());
    this.stops = [];
    this.ready.clear();
    this.error = "";
    this.start();
  }
  stop() {
    this.stopped = true;
    this.stops.forEach((stop) => stop());
  }
}
