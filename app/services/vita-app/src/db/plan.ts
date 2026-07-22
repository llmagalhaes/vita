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
 *
 * Portions (APP-076): a sparse `{ itemId: qty }` overlay cached under
 * `plan.portions`, pushed via a single coalescing `portions` outbox op that
 * carries no payload (the drain reads the map fresh at send time — last write
 * wins). The overlay is a read-time lens over the doc; it never mutates it.
 */
import { api } from "../api";
import type { EatingPlanDraft, TrainingProgramDraft } from "../api/client";
import { ApiError } from "../api/client";
import { pruneOverlayAfterEdit } from "../plan/compute";
import { getDb } from "./db";
import { clearDirty, isDirty, kvGet, kvSet, setDirty } from "./kv";
import { logChanged } from "./notify";

const PLAN_KEY = "plan.current";
const PROGRAM_KEY = "program.current";
export const PORTIONS_KEY = "plan.portions";
const META_KEY = "plan.meta";

/**
 * Where the current plan came from — drives the Eating Plan source badge. Local
 * device metadata (not in the doc/contract). ponytail ceiling: fold into the doc
 * if a plan imported on another device ever needs to show its badge.
 */
export type PlanSource = "pdf" | "text" | "manual";
export type PlanMeta = { source: PlanSource; importedAt: string };
export const getPlanMeta = (): PlanMeta | null => kvGet<PlanMeta>(META_KEY);
export const setPlanMeta = (source: PlanSource): void =>
  kvSet(META_KEY, { source, importedAt: new Date().toISOString() });

export const getCachedPlan = (): EatingPlanDraft | null => kvGet<EatingPlanDraft>(PLAN_KEY);
export const getCachedProgram = (): TrainingProgramDraft | null =>
  kvGet<TrainingProgramDraft>(PROGRAM_KEY);

// ---- portion overlay ---------------------------------------------------------

export const getPortions = (): Record<string, number> => kvGet<Record<string, number>>(PORTIONS_KEY) ?? {};

/**
 * Set (or clear) one item's portion override. Sparse: a qty equal to the item's
 * default `quantity` REMOVES the key (slider back to default = no override).
 * Synchronous kv write → the screen re-reads it on the next render; no network on
 * the interaction path. Enqueues a coalesced push + fires a drain when online.
 */
export function setPortion(itemId: string, qty: number, itemDefault?: number): void {
  const map = getPortions();
  if (itemDefault != null && qty === itemDefault) delete map[itemId];
  else map[itemId] = qty;
  kvSet(PORTIONS_KEY, map);
  setDirty(PORTIONS_KEY);
  logChanged(); // notify seam: screens re-read the overlay (live totals update)
  enqueuePortionsPush();
}

/** Drop the whole overlay (new plan version resets it). */
export function clearPortions(): void {
  kvSet(PORTIONS_KEY, {});
  clearDirty(PORTIONS_KEY);
}

/**
 * Enqueue exactly ONE `portions` outbox row ever (coalescing): many slider
 * sessions collapse to one op, and the drain reads the live map at send time so
 * the last map wins. Fires a best-effort drain right after.
 */
export function enqueuePortionsPush(): void {
  getDb().runSync(
    `INSERT INTO outbox (entryId, op) SELECT 'plan.portions', 'portions' WHERE NOT EXISTS (SELECT 1 FROM outbox WHERE op = 'portions')`,
  );
  // Lazy require breaks the plan↔outbox cycle (outbox reads the overlay from here).
  const { drainOutbox } = require("./outbox") as typeof import("./outbox");
  void drainOutbox(api).catch(() => {});
}

/** Drop overlay keys whose itemId no longer appears in the doc (defensive prune). */
function pruneOverlayToDoc(doc: EatingPlanDraft): void {
  const ids = new Set<string>();
  for (const m of doc.meals) for (const it of m.items) if (it.id != null) ids.add(it.id);
  const map = getPortions();
  let changed = false;
  for (const key of Object.keys(map)) {
    if (!ids.has(key)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) kvSet(PORTIONS_KEY, map);
}

// ---- plan / program docs -----------------------------------------------------

export async function savePlan(doc: EatingPlanDraft, source: PlanSource = "manual"): Promise<void> {
  kvSet(PLAN_KEY, doc);
  setPlanMeta(source);
  setDirty(PLAN_KEY);
  clearPortions(); // new import = new plan version → overlay resets (server does too)
  try {
    // Adopt the stored doc — the server assigns the stable item ids (A2) the
    // portion overlay keys, so the cache carries them before the first sync.
    kvSet(PLAN_KEY, await api.createPlan(doc));
    clearDirty(PLAN_KEY);
  } catch {
    /* offline — stays dirty (id-less until sync), re-pushed on next sync */
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

/**
 * Edit an existing plan: full-doc PUT (backend re-encrypts the whole blob). A5 —
 * the edit touches ONLY the edited item's override: removed items are pruned,
 * an item whose quantity/unit changed has its override reset, all others survive.
 */
export async function updatePlan(doc: EatingPlanDraft): Promise<void> {
  const oldDoc = getCachedPlan();
  const before = getPortions();
  kvSet(PLAN_KEY, doc);
  setDirty(PLAN_KEY);
  if (oldDoc) {
    const after = pruneOverlayAfterEdit(oldDoc, doc, before);
    if (Object.keys(after).length !== Object.keys(before).length || Object.keys(after).some((k) => after[k] !== before[k])) {
      kvSet(PORTIONS_KEY, after);
      setDirty(PORTIONS_KEY);
      enqueuePortionsPush();
    }
  }
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
 * NEVER overwritten (audit 1.4). GET /plan now also carries the sparse `portions`
 * overlay; the overlay follows its own dirty flag:
 *   1. doc dirty → re-push, skip hydrate.
 *   2. portions dirty → hydrate the doc, KEEP the local map (it re-pushes).
 *   3. both clean → adopt server doc + server portions.
 *   4. after any doc write → prune overlay keys absent from the doc.
 */
export async function syncPlan(): Promise<void> {
  if (isDirty(PLAN_KEY)) return void pushPlan().catch(() => {});
  try {
    const { portions, ...doc } = await api.getPlan();
    kvSet(PLAN_KEY, doc);
    if (!isDirty(PORTIONS_KEY)) kvSet(PORTIONS_KEY, portions ?? {});
    pruneOverlayToDoc(doc);
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
