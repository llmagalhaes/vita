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
 * Portions (APP-076 → APP-094): the sparse `{ itemId: qty }` overlay is no longer a
 * kv map of its own with a coalescing server push — it is the `qty` half of the
 * DAY RECORD's day-scoped overlay (src/db/dayRecord.ts), alongside item skips, item
 * swaps and the option pick. One place, keyed by date, device-local. The server's
 * `PUT /plan/portions` still exists in the contract; this app round stops calling it.
 * The overlay remains a read-time lens over the doc; it never mutates it.
 */
import type { EatingPlanDraft, TrainingProgramDraft } from "../api/client";
import { api } from "../api";
import { ApiError } from "../api/client";
import { allPlanItems, pruneOverlayAfterEdit } from "../plan/compute";
import { dayKey } from "../day/record";
import { getOverlay, setOverlay } from "./dayRecord";
import { clearDirty, isDirty, kvGet, kvSet, setDirty } from "./kv";
import { logChanged } from "./notify";

const PLAN_KEY = "plan.current";
const PROGRAM_KEY = "program.current";
const META_KEY = "plan.meta";
const DAY_SKIPS_KEY = "workout.daySkips";
const DAY_SKIPS_DATE_KEY = "workout.daySkipsDate";
const SELECTED_DAY_KEY = "workout.selectedDay";
const SETUP_PROMPT_HIDDEN_KEY = "plan.setupPromptHidden";
const NAV_SWIPED_KEY = "nav.swiped";
const INT_PROMPT_DISMISSED_KEY = "int.promptDismissed";

/** Local calendar day YYYY-MM-DD. Kept local (not imported) to avoid a db↔habits cycle. */
function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
/** Adopt a restored meta verbatim (APP-110 blob hydrate) — keeps the original importedAt. */
export const adoptPlanMeta = (meta: PlanMeta): void => kvSet(META_KEY, meta);

export const getCachedPlan = (): EatingPlanDraft | null => kvGet<EatingPlanDraft>(PLAN_KEY);
export const getCachedProgram = (): TrainingProgramDraft | null =>
  kvGet<TrainingProgramDraft>(PROGRAM_KEY);

// ---- portion overlay (day-scoped, §2.2) --------------------------------------

/**
 * Today's portion overrides — the `qty` half of the day record's overlay. Day-scoping
 * is now structural (the overlay is keyed by date), so yesterday's tweaks simply live
 * under yesterday's key: no date stamp, no lazy reset, no empty PUT to the server.
 */
export const getPortions = (): Record<string, number> => getOverlay().qty;

/**
 * Set (or clear) one item's portion override. Sparse: a qty equal to the item's
 * default `quantity` REMOVES the key (slider back to default = no override).
 * Synchronous local write → the screen re-reads it on the next render; no network
 * on the interaction path, and none afterwards either (APP-094: device-local).
 */
export function setPortion(itemId: string, qty: number, itemDefault?: number): void {
  const map = { ...getPortions() };
  if (itemDefault != null && qty === itemDefault) delete map[itemId];
  else map[itemId] = qty;
  setOverlay(dayKey(), { qty: map }); // logChanged: screens re-read, live totals update
}

/** Drop today's portion overrides (new plan version resets them). */
export function clearPortions(): void {
  setOverlay(dayKey(), { qty: {} });
}

/** @deprecated APP-094 — nothing is pushed anymore; kept so v3 screens still build. */
export const clearPortionsAndPush = clearPortions;

/** Drop overlay keys whose itemId no longer appears in the doc (defensive prune).
 *  Options-aware: option items carry portion overrides too, so they must survive. */
function pruneOverlayToDoc(doc: EatingPlanDraft): void {
  const ids = new Set<string>();
  for (const it of allPlanItems(doc)) if (it.id != null) ids.add(it.id);
  const map = { ...getPortions() };
  let changed = false;
  for (const key of Object.keys(map)) {
    if (!ids.has(key)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) setOverlay(dayKey(), { qty: map });
}

// ---- plan / program status (§2.1) --------------------------------------------

/**
 * Derived plan lifecycle — no new storage. No cached doc → "none" (GET /plan
 * 404); else the doc's own `status`, defaulting to "ready" (docs saved before
 * 0.7.0 carry no status and read as active).
 */
export function mealPlanStatus(): "ready" | "review" | "none" {
  const doc = getCachedPlan();
  if (!doc) return "none";
  return doc.status ?? "ready";
}

/** Programs have no review flow — presence is the only state. */
export const trainStatus = (): "ready" | "none" => (getCachedProgram() ? "ready" : "none");

// ---- day workout skips + selected program day (§2.3) -------------------------
// Device-local ONLY, never the outbox — day skips are ephemeral UI state, the
// backend builds nothing. Skips are day-scoped (same lazy reset as §2.2); the
// selected day chip persists across days.

type DaySkips = Record<string, Record<string, true>>;

export function getDaySkips(): DaySkips {
  const map = kvGet<DaySkips>(DAY_SKIPS_KEY) ?? {};
  if (Object.keys(map).length === 0) return map;
  if (kvGet<string>(DAY_SKIPS_DATE_KEY) === todayISO()) return map;
  kvSet(DAY_SKIPS_KEY, {}); // new day → nothing is skipped anymore
  kvSet(DAY_SKIPS_DATE_KEY, todayISO());
  return {};
}

/** Toggle one exercise's skip within a program day (today only). */
export function toggleDaySkip(dayName: string, exercise: string): void {
  const map = getDaySkips();
  const day = { ...(map[dayName] ?? {}) };
  if (day[exercise]) delete day[exercise];
  else day[exercise] = true;
  if (Object.keys(day).length) map[dayName] = day;
  else delete map[dayName];
  kvSet(DAY_SKIPS_KEY, map);
  kvSet(DAY_SKIPS_DATE_KEY, todayISO());
  logChanged();
}

export function clearDaySkips(): void {
  kvSet(DAY_SKIPS_KEY, {});
  kvSet(DAY_SKIPS_DATE_KEY, todayISO());
  logChanged();
}

export const getSelectedDay = (): string | null => kvGet<string>(SELECTED_DAY_KEY);
export const setSelectedDay = (name: string): void => kvSet(SELECTED_DAY_KEY, name);

// ---- setup prompts state (§2.4) ----------------------------------------------

export const isSetupPromptHidden = (): boolean => kvGet<boolean>(SETUP_PROMPT_HIDDEN_KEY) === true;
export const hideSetupPrompt = (): void => kvSet(SETUP_PROMPT_HIDDEN_KEY, true);
export const isNavSwiped = (): boolean => kvGet<boolean>(NAV_SWIPED_KEY) === true;
export const setNavSwiped = (): void => kvSet(NAV_SWIPED_KEY, true);
export const isIntPromptDismissed = (): boolean => kvGet<boolean>(INT_PROMPT_DISMISSED_KEY) === true;
export const dismissIntPrompt = (): void => kvSet(INT_PROMPT_DISMISSED_KEY, true);

// ---- plan / program docs -----------------------------------------------------

export async function savePlan(doc: EatingPlanDraft, source: PlanSource = "manual"): Promise<void> {
  kvSet(PLAN_KEY, doc);
  setPlanMeta(source);
  setDirty(PLAN_KEY);
  kvSet(SETUP_PROMPT_HIDDEN_KEY, false); // any new import shows the Home banner again (§2.4)
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
/**
 * Adopt a plan the server ALREADY persisted at parse time (async import saves it as
 * status "review" — contract 0.7.0). The parse call returned that saved doc (with
 * ids), so we cache it locally as clean — NO extra POST. Using savePlan here would
 * re-POST the same doc and churn a duplicate version (the describe/onboarding
 * double-save bug). Offline-safe: reuses the already-fetched doc, no round-trip.
 */
export function adoptServerPlan(doc: EatingPlanDraft, source: PlanSource = "manual"): void {
  kvSet(PLAN_KEY, doc);
  setPlanMeta(source);
  clearDirty(PLAN_KEY);
  kvSet(SETUP_PROMPT_HIDDEN_KEY, false); // a fresh import re-shows the Home setup banner
  clearPortions(); // new plan version → overlay resets (server already reset it)
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
      setOverlay(dayKey(), { qty: after });
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
  // Adopt the PUT/POST response (APP-092 #2) — the server assigns ids to any
  // edit-added items, so the cache carries them without waiting for the next sync.
  try {
    kvSet(PLAN_KEY, await api.updatePlan(doc));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) kvSet(PLAN_KEY, await api.createPlan(doc));
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
 * NEVER overwritten (audit 1.4). GET /plan still carries the server's `portions`
 * overlay; APP-094 **ignores it** — today's tweaks are device-local day-record state
 * now, and adopting a server map would resurrect the very asymmetry this ticket kills.
 * After any doc write, overlay keys absent from the doc are pruned.
 */
export async function syncPlan(): Promise<void> {
  if (isDirty(PLAN_KEY)) return void pushPlan().catch(() => {});
  try {
    const { portions: _serverPortions, ...doc } = await api.getPlan();
    kvSet(PLAN_KEY, doc);
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
