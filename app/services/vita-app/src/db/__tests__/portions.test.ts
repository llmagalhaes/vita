/**
 * APP-094 folded the v3 portions overlay into the day record: the sparse
 * `{ itemId: qty }` map is now the `qty` half of a date-keyed, device-local overlay.
 * What survives from v3 is the SPARSE semantics and the doc-prune; what dies is the
 * server push (`PUT /plan/portions`), its coalescing outbox op, its dirty flag and
 * the lazy day-rollover reset — day scoping is structural now.
 */
import { api } from "../../api";
import type { EatingPlanWithPortions } from "../../api/client";
import { getOverlay, setOverlay } from "../dayRecord";
import { resetDbForTests } from "../db";
import { dayKey } from "../../day/record";
import { pendingCount } from "../outbox";
import { clearPortions, getPortions, savePlan, setPortion, syncPlan } from "../plan";

const flush = () => new Promise((r) => setTimeout(r, 0));
const server = (over: Partial<EatingPlanWithPortions> = {}): EatingPlanWithPortions => ({
  summary: "s",
  meals: [{ name: "m", items: [{ id: "a", name: "A" }] }],
  portions: {},
  ...over,
});

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

test("sparse overlay: qty === default removes the key", () => {
  setPortion("eggs", 3, 2);
  expect(getPortions()).toEqual({ eggs: 3 });
  setPortion("eggs", 2, 2); // back to default
  expect(getPortions()).toEqual({});
});

test("no server push and no outbox op — the overlay is device-local now", async () => {
  const spy = jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  setPortion("a", 3);
  setPortion("a", 4);
  setPortion("b", 5);
  await flush();
  expect(getPortions()).toEqual({ a: 4, b: 5 });
  expect(spy).not.toHaveBeenCalled();
  expect(pendingCount()).toBe(0);
});

test("the overlay is keyed by DATE — yesterday's tweaks are a different key", () => {
  setOverlay("2026-08-18", { qty: { a: 9 } });
  setPortion("a", 3); // today
  expect(getPortions()).toEqual({ a: 3 });
  expect(getOverlay("2026-08-18").qty).toEqual({ a: 9 }); // untouched, and never read as today's
});

test("qty lives alongside skip/swap/option in ONE day-scoped overlay (kills the v3 asymmetry)", () => {
  setPortion("a", 3);
  setOverlay(dayKey(), { skip: { b: true }, option: { "m-1": 1 } });
  const ov = getOverlay();
  expect(ov).toMatchObject({ qty: { a: 3 }, skip: { b: true }, option: { "m-1": 1 } });
});

test("syncPlan IGNORES the server overlay but still prunes keys absent from the doc", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan({ summary: "s", meals: [{ name: "m", items: [{ id: "a", name: "A" }] }] });
  setPortion("a", 2);
  setPortion("ghost", 5); // no such item in the doc
  jest.spyOn(api, "getPlan").mockResolvedValue(server({ portions: { a: 99 } }));
  await syncPlan();
  expect(getPortions()).toEqual({ a: 2 }); // server's 99 ignored, ghost pruned
});

test("clearPortions empties today's overrides and pushes nothing", async () => {
  const spy = jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  setPortion("a", 3);
  clearPortions();
  await flush();
  expect(getPortions()).toEqual({});
  expect(spy).not.toHaveBeenCalled();
});

// ── M2: the overlay must never survive a plan version that re-binds its ids ──

/** Plan ids are POSITIONAL and reassigned on every POST (contract 0.8.0). */
const doc = (meal: string, itemA: string, itemB: string) => ({
  summary: "s",
  meals: [{ id: "m-1", name: meal, items: [{ id: "it-1", name: itemA }, { id: "it-2", name: itemB }] }],
});

test("a re-import drops the WHOLE overlay — a stale skip must not re-bind to another food", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan(doc("Lunch", "Chicken", "Banana"));
  setOverlay(dayKey(), { qty: { "it-1": 2 }, skip: { "it-2": true }, option: { "m-1": 0 }, swap: { "it-1": { name: "Tofu" } } });

  // The CEO re-imports: same ids, different foods behind them.
  await savePlan(doc("Lunch", "Rice", "Chicken"));
  expect(getOverlay()).toEqual({ option: {}, qty: {}, skip: {}, swap: {} });
});

test("a plan version imported elsewhere and synced down drops the overlay too", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan(doc("Lunch", "Chicken", "Banana"));
  setOverlay(dayKey(), { skip: { "it-2": true } }); // "didn't have the banana today"

  jest.spyOn(api, "getPlan").mockResolvedValue(doc("Lunch", "Rice", "Chicken") as never);
  await syncPlan();
  // it-2 still EXISTS in the new doc — pruning by id would have kept it, now pointing
  // at Chicken, and close-the-day would write that wrong composition permanently.
  expect(getOverlay().skip).toEqual({});
});

test("the same plan coming back unchanged keeps every overlay map", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan(doc("Lunch", "Chicken", "Banana"));
  setOverlay(dayKey(), { qty: { "it-1": 2 }, skip: { "it-2": true }, option: { "m-1": 0 } });

  jest.spyOn(api, "getPlan").mockResolvedValue(doc("Lunch", "Chicken", "Banana") as never);
  await syncPlan();
  expect(getOverlay()).toMatchObject({ qty: { "it-1": 2 }, skip: { "it-2": true }, option: { "m-1": 0 } });
});

test("prune drops skip/swap/option keys the doc no longer has, not just qty", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  await savePlan(doc("Lunch", "Chicken", "Banana"));
  setOverlay(dayKey(), { skip: { ghost: true }, swap: { ghost2: { name: "x" } }, option: { "m-9": 1 }, qty: { "it-1": 2 } });

  jest.spyOn(api, "getPlan").mockResolvedValue(doc("Lunch", "Chicken", "Banana") as never);
  await syncPlan();
  expect(getOverlay()).toEqual({ option: {}, qty: { "it-1": 2 }, skip: {}, swap: {} });
});
