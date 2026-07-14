/**
 * Persisted eating-plan / training-program, offline-first.
 *
 * The backend is the system of record (versioned, encrypted — BE-019/020), read
 * via GET /plan|/program. But Home must render offline, so the last known doc is
 * cached in kv and that cache is the display source. `sync*` hydrates it from the
 * server (200 → refresh; 404/error → keep what we have, never blow away local
 * data on a failed fetch). `save*`/`update*` write the cache first (instant, works
 * offline) then push to the server fire-and-forget — same pattern as PATCH /me.
 *
 * ponytail: fire-and-forget POST mirrors the existing patchMe. A POST that fails
 * while offline isn't retried (the cache still shows the plan); upgrade to an
 * outbox op if durability-on-reconnect for plans is ever needed.
 */
import { api } from "../api";
import type { EatingPlanDraft, TrainingProgramDraft } from "../api/client";
import { ApiError } from "../api/client";
import { kvGet, kvSet } from "./kv";

const PLAN_KEY = "plan.current";
const PROGRAM_KEY = "program.current";

export const getCachedPlan = (): EatingPlanDraft | null => kvGet<EatingPlanDraft>(PLAN_KEY);
export const getCachedProgram = (): TrainingProgramDraft | null =>
  kvGet<TrainingProgramDraft>(PROGRAM_KEY);

export async function savePlan(doc: EatingPlanDraft): Promise<void> {
  kvSet(PLAN_KEY, doc);
  await api.createPlan(doc).catch(() => {});
}
export async function saveProgram(doc: TrainingProgramDraft): Promise<void> {
  kvSet(PROGRAM_KEY, doc);
  await api.createProgram(doc).catch(() => {});
}

/** Edit an existing plan: full-doc PUT (backend re-encrypts the whole blob). */
export async function updatePlan(doc: EatingPlanDraft): Promise<void> {
  kvSet(PLAN_KEY, doc);
  await api.updatePlan(doc).catch(() => {});
}
export async function updateProgram(doc: TrainingProgramDraft): Promise<void> {
  kvSet(PROGRAM_KEY, doc);
  await api.updateProgram(doc).catch(() => {});
}

/** Hydrate the cache from the server. Keeps the cache on 404/offline. */
export async function syncPlan(): Promise<void> {
  try {
    kvSet(PLAN_KEY, await api.getPlan());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return; // never persisted yet
    // network/other: keep the cached doc (offline-tolerant)
  }
}
export async function syncProgram(): Promise<void> {
  try {
    kvSet(PROGRAM_KEY, await api.getProgram());
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return;
  }
}
