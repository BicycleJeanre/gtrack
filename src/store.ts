import { openDB } from "idb";
import {
  emptyState,
  seedExercises,
  uid,
  type State,
  type Kind,
  type Records,
  type Session,
} from "./model";
const database = openDB("gtrack-v1", 1, {
  upgrade(db) {
    db.createObjectStore("accounts");
  },
});
export class Store {
  state: State = emptyState();
  constructor(public account: string) {}
  async load() {
    this.state =
      (await (await database).get("accounts", this.account)) || emptyState();
    const seeds = await seedExercises();
    await this.mutate((s) => {
      for (const e of seeds) if (!s.exercises[e.id]) s.exercises[e.id] = e;
    });
  }
  async mutate(change: (state: State) => void) {
    // Read and update inside one IndexedDB transaction: another open tab cannot erase our writes.
    const tx = (await database).transaction("accounts", "readwrite");
    const latest = (await tx.store.get(this.account)) || emptyState();
    latest.programs ||= {};
    change(latest);
    await tx.store.put(latest, this.account);
    await tx.done;
    this.state = latest;
  }
  async put(kind: Kind, record: any) {
    await this.mutate((s) => {
      if (kind === "sessions" && s.sessions[record.id]) return;
      (s[kind] as Record<string, any>)[record.id] = record;
      if (this.account !== "local") {
        s.pending = s.pending.filter(
          (p) => p.kind !== kind || p.id !== record.id,
        );
        s.pending.push({ kind, id: record.id, token: uid() });
      }
    });
  }
  async updateSession(session: Session) {
    await this.mutate((s) => {
      if (!s.sessions[session.id]) return;
      s.sessions[session.id] = session;
      if (this.account !== "local") {
        s.pending = s.pending.filter(
          (p) => p.kind !== "sessions" || p.id !== session.id,
        );
        s.pending.push({ kind: "sessions", id: session.id, token: uid() });
      }
    });
  }
  async saveDraft(draft: Session | null) {
    await this.mutate((s) => {
      s.draft = draft;
    });
  }
  async finish(session: Session) {
    await this.mutate((s) => {
      if (!s.sessions[session.id]) {
        s.sessions[session.id] = session;
        if (this.account !== "local")
          s.pending.push({ kind: "sessions", id: session.id, token: uid() });
      }
      s.draft = null;
    });
  }
  async import(records: Records) {
    await this.mutate((s) => {
      for (const kind of [
        "exercises",
        "workouts",
        "sessions",
        "programs",
      ] as Kind[]) {
        for (const r of Object.values(records[kind])) {
          // Merge missing IDs only. Import never overwrites existing history or newer plans.
          if (s[kind][r.id]) continue;
          (s[kind] as Record<string, any>)[r.id] = r;
          if (this.account !== "local")
            s.pending.push({ kind, id: r.id, token: uid() });
        }
      }
    });
  }
}
