import { api } from "../../api";
import { ApiError, type EatingPlanWithPortions } from "../../api/client";
import { resetDbForTests } from "../db";
import { drainOutbox, pendingCount } from "../outbox";
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
  clearPortions();
});

test("sparse overlay: qty === default removes the key", () => {
  jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  setPortion("eggs", 3, 2);
  expect(getPortions()).toEqual({ eggs: 3 });
  setPortion("eggs", 2, 2); // back to default
  expect(getPortions()).toEqual({});
});

test("coalescing: many edits collapse to one outbox row", () => {
  jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  setPortion("a", 3);
  setPortion("a", 4);
  setPortion("b", 5);
  expect(pendingCount()).toBe(1); // one 'portions' row (auto-drain suspended on the awaited push)
});

test("drain reads the map FRESH — last write wins", async () => {
  const spy = jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  setPortion("a", 3); // enqueue
  setPortion("a", 7); // mutate after enqueue (coalesced)
  await drainOutbox(api);
  expect(spy).toHaveBeenLastCalledWith({ a: 7 });
  expect(pendingCount()).toBe(0);
});

test("422 poison: drop op, keep display overlay, then resync prunes stale keys", async () => {
  jest.spyOn(api, "putPlanPortions").mockRejectedValue(new ApiError(422, { type: "about:blank", title: "unknown id", status: 422 }));
  const getSpy = jest.spyOn(api, "getPlan").mockResolvedValue(server({ portions: {} }));
  setPortion("stale", 3);
  await drainOutbox(api);
  expect(pendingCount()).toBe(0); // op dropped
  await flush(); // the fire-and-forget resync
  expect(getSpy).toHaveBeenCalled();
  expect(getPortions()).toEqual({}); // server overlay adopted, stale key gone
});

test("404 poison: drop op but keep the local overlay for display", async () => {
  jest.spyOn(api, "putPlanPortions").mockRejectedValue(new ApiError(404, { type: "about:blank", title: "no plan", status: 404 }));
  setPortion("a", 3);
  await drainOutbox(api);
  expect(pendingCount()).toBe(0);
  expect(getPortions()).toEqual({ a: 3 });
});

test("savePlan (new version) clears the overlay", async () => {
  jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  setPortion("a", 3);
  await savePlan({ summary: "new", meals: [{ name: "m", items: [] }] });
  expect(getPortions()).toEqual({});
});

test("syncPlan keeps a dirty local overlay (local wins, re-pushes)", async () => {
  jest.spyOn(api, "putPlanPortions").mockRejectedValue(new Error("offline")); // stays dirty
  setPortion("a", 3);
  await flush();
  jest.spyOn(api, "getPlan").mockResolvedValue(server({ portions: { a: 99 } }));
  await syncPlan();
  expect(getPortions()).toEqual({ a: 3 }); // dirty local overlay untouched
});

test("syncPlan (clean) adopts server overlay and prunes keys absent from the doc", async () => {
  clearPortions();
  setPortionRaw({ ghost: 5 });
  jest.spyOn(api, "getPlan").mockResolvedValue(server({ meals: [{ name: "m", items: [{ id: "real", name: "R" }] }], portions: { real: 2 } }));
  await syncPlan();
  expect(getPortions()).toEqual({ real: 2 }); // ghost pruned, server map adopted
});

// helper: seed a clean overlay directly (bypasses enqueue/drain)
function setPortionRaw(map: Record<string, number>): void {
  const { kvSet, clearDirty } = require("../kv") as typeof import("../kv");
  kvSet("plan.portions", map);
  clearDirty("plan.portions");
}
