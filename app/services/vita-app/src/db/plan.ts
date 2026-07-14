/**
 * Persisted eating-plan / training-program, offline-first.
 *
 * The backend is the system of record (versioned, encrypted — BE-019/020), read
 * via GET /plan|/program. But Home must render offline, so the last known doc is
 * cached in kv and that cache is the display source. `sync*` hydrates it from the
 * server, but ONLY when the local copy is clean: a `dirty` flag (set on every
 * local write, cleared on push success) protects an offline edit from being
 * silently reverted by the next hydrate. A dirty doc is re-pushed instead of
 * overwritten (audit 1.4). `save*`/`update*` write the cache first (instant,
 * works offline) then push; a failed push leaves the doc dirty for next sync.
 */
import { api } from "../api";
import type { EatingPlanDraft, TrainingProgramDraft } from "../api/client";
import { ApiError } from "../api/client";
import { clearDirty, isDirty, kvGet, kvSet, setDirty } from "./kv";

const PLAN_KEY = "plan.current";
const PROGRAM_KEY = "program.current";

export const getCachedPlan = (): EatingPlanDraft | null => kvGet<EatingPlanDraft>(PLAN_KEY);
export const getCachedProgram = (): TrainingProgramDraft | null =>
  kvGet<TrainingProgramDraft>(PROGRAM_KEY);

export async function savePlan(doc: EatingPlanDraft): Promise<void> {
  kvSet(PLAN_KEY, doc);
  setDirty(PLAN_KEY);
  try {
    await api.createPlan(doc);
    clearDirty(PLAN_KEY);
  } catch {
    /* offline — stays dirty, re-pushed on next sync */
  }
}
export async function saveProgram(doc: TrainingProgramDraft): Promise<void> {
  kvSet(PROGRAM_KEY, doc);
  setDirty(PROGRAM_KEY);
  try {
    await api.createProgram(doc);
    clearDirty(PROGRAM_KEY);
  } catch {
    /* offline — stays dirty */
  }
}

/** Edit an existing plan: full-doc PUT (backend re-encrypts the whole blob). */
export async function updatePlan(doc: EatingPlanDraft): Promise<void> {
  kvSet(PLAN_KEY, doc);
  setDirty(PLAN_KEY);
  await pushPlan().catch(() => {});
}
export async function updateProgram(doc: TrainingProgramDraft): Promise<void> {
  kvSet(PROGRAM_KEY, doc);
  setDirty(PROGRAM_KEY);
  await pushProgram().catch(() => {});
}

// Re-push the cached doc (PUT replace; POST if the server never got a first
// version). Clears dirty on success; throws on failure so the caller keeps it dirty.
async function pushPlan(): Promise<void> {
  const doc = getCachedPlan();
  if (!doc) return;
  try {
    await api.updatePlan(doc);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) await api.createPlan(doc);
    else throw e;
  }
  clearDirty(PLAN_KEY);
}
async function pushProgram(): Promise<void> {
  const doc = getCachedProgram();
  if (!doc) return;
  try {
    await api.updateProgram(doc);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) await api.createProgram(doc);
    else throw e;
  }
  clearDirty(PROGRAM_KEY);
}

/**
 * Hydrate the cache from the server. A dirty local edit is re-pushed and kept —
 * NEVER overwritten (audit 1.4). Clean cache: refresh from server, keeping the
 * cache on 404/offline.
 */
export async function syncPlan(): Promise<void> {
  if (isDirty(PLAN_KEY)) return void pushPlan().catch(() => {});
  try {
    kvSet(PLAN_KEY, await api.getPlan());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return; // never persisted yet
    // network/other: keep the cached doc (offline-tolerant)
  }
}
export async function syncProgram(): Promise<void> {
  if (isDirty(PROGRAM_KEY)) return void pushProgram().catch(() => {});
  try {
    kvSet(PROGRAM_KEY, await api.getProgram());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return;
  }
}
