/**
 * APP-094 persistence: the day record rides ORDINARY ENTRIES (no /days resource),
 * `day_record` is a rebuildable cache, the overlay is durable, and an offline write
 * drains exactly once on reconnect.
 */
import { api } from "../../api";
import { ApiError, type LogEntry } from "../../api/client";
import { closeDay, retroClose } from "../../day/close";
import { dayKey, emptyDay, type DayRecord } from "../../day/record";
import type { PlanMeal } from "../../api/client";
import { applyClose, getDayRecord, getOverlay, hydrateDay, isDayDirty, setOverlay } from "../dayRecord";
import { getDb, resetDbForTests } from "../db";
import { addLocalEntry, entriesForDay } from "../entries";
import { drainOutbox, pendingCount } from "../outbox";

const TODAY = dayKey();
const PLAN: PlanMeal[] = [
  { id: "m-1", name: "Breakfast", time: "08:00", items: [{ id: "it-1", name: "Oats", quantity: 60, unit: "g", nutritionPerUnit: { kcal: 4 } }] },
  { id: "m-2", name: "Lunch", time: "13:00", items: [{ id: "it-2", name: "Chicken", quantity: 200, unit: "g", nutritionPerUnit: { kcal: 1.65 } }] },
];
const served = (): LogEntry =>
  ({ id: "srv-1", source: "user", loggedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as LogEntry;

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

const rows = (sql: string) => getDb().getAllSync<Record<string, unknown>>(sql);

test("close-the-day writes ordinary ENTRIES — no dayRecord op on the wire (R1)", async () => {
  jest.spyOn(api, "createEntry").mockImplementation(async (_k, e) => ({ ...e, ...served() }) as LogEntry);
  applyClose(closeDay(getDayRecord(TODAY), PLAN, 23 * 60));

  const ops = rows(`SELECT DISTINCT op FROM outbox`).map((r) => r.op);
  expect(ops.every((o) => o === "create" || o === "update")).toBe(true);
  const es = entriesForDay(new Date());
  expect(es.map((e) => e.id)).toEqual([`meal:${TODAY}:m-1`, `meal:${TODAY}:m-2`]);
  expect(es.every((e) => e.type === "meal")).toBe(true);
  expect((es[0]!.detail as Record<string, unknown>).planStatus).toBe("done");
});

test("the record is DERIVED from entries — and the cache row rebuilds after any write", async () => {
  jest.spyOn(api, "createEntry").mockImplementation(async (_k, e) => ({ ...e, ...served() }) as LogEntry);
  applyClose(closeDay(getDayRecord(TODAY), PLAN, 23 * 60));
  addLocalEntry({ type: "water", occurredAt: new Date().toISOString(), inputMethod: "tap", isEstimate: false, detail: { amountMl: 500 } });

  const rec = getDayRecord(TODAY);
  expect(rec.meals.map((m) => m.planMealId)).toEqual(["m-1", "m-2"]);
  expect(rec.waterMl).toBe(500);

  // the cache is disposable: drop it and the same record comes back
  getDb().runSync(`DELETE FROM day_record`);
  expect(getDayRecord(TODAY)).toEqual(rec);
});

test("the overlay is durable — an entry write invalidating the cache cannot eat it", async () => {
  jest.spyOn(api, "createEntry").mockImplementation(async (_k, e) => ({ ...e, ...served() }) as LogEntry);
  setOverlay(TODAY, { qty: { "it-1": 30 }, skip: { "it-2": true } });
  applyClose(closeDay(getDayRecord(TODAY), PLAN, 23 * 60)); // deletes the cache row
  expect(getOverlay(TODAY)).toMatchObject({ qty: { "it-1": 30 }, skip: { "it-2": true } });
  expect(getDayRecord(TODAY).overlay.qty).toEqual({ "it-1": 30 });
});

test("an offline write drains EXACTLY ONCE on reconnect", async () => {
  const offline = jest.spyOn(api, "createEntry").mockRejectedValue(new TypeError("Network request failed"));
  applyClose(closeDay(getDayRecord(TODAY), PLAN, 23 * 60));
  await new Promise((r) => setTimeout(r, 0));
  expect(pendingCount()).toBe(2); // parked, nothing lost
  expect(isDayDirty(TODAY)).toBe(true);

  offline.mockReset();
  let sent = 0;
  offline.mockImplementation(async (_k, e) => {
    sent++;
    return { ...e, ...served() } as LogEntry;
  });
  // reconnect past the failed op's backoff window
  const later = () => Date.now() + 60_000;
  expect((await drainOutbox(api, later)).synced).toBe(2);
  expect(sent).toBe(2);
  expect(pendingCount()).toBe(0);
  expect(isDayDirty(TODAY)).toBe(false);

  expect((await drainOutbox(api, later)).synced).toBe(0); // a second drain sends nothing
  expect(sent).toBe(2);
});

test("hydrate never overwrites a dirty day (audit 1.4)", async () => {
  jest.spyOn(api, "createEntry").mockRejectedValue(new TypeError("offline"));
  applyClose(closeDay(getDayRecord(TODAY), PLAN, 23 * 60));
  await new Promise((r) => setTimeout(r, 0));

  const fromServer: DayRecord = { ...emptyDay(TODAY), waterMl: 9999 };
  expect(hydrateDay(fromServer)).toBe(false); // refused
  expect(getDayRecord(TODAY).meals).toHaveLength(2); // local write survives
  expect(getDayRecord(TODAY).waterMl).toBe(0);
});

test("hydrate adopts a clean day but never the device-local overlay", () => {
  setOverlay(TODAY, { qty: { "it-1": 30 } });
  expect(hydrateDay({ ...emptyDay(TODAY), waterMl: 750 })).toBe(true);
  expect(getDayRecord(TODAY).waterMl).toBe(750);
  expect(getDayRecord(TODAY).overlay.qty).toEqual({ "it-1": 30 });
});

test("retro-close is the same batch on a past date (one representation, R10a)", async () => {
  const past = "2026-08-10";
  jest.spyOn(api, "createEntry").mockImplementation(async (_k, e) => ({ ...e, ...served() }) as LogEntry);
  applyClose(retroClose(getDayRecord(past), PLAN));
  const rec = getDayRecord(past);
  expect(rec.meals.map((m) => m.entryId)).toEqual([`meal:${past}:m-1`, `meal:${past}:m-2`]);
  expect(rec.meals.every((m) => m.at.startsWith("2026-08-10") || m.at.startsWith("2026-08-09"))).toBe(true);
  expect(getDayRecord(TODAY).meals).toEqual([]); // today untouched
});

test("re-recording a synced meal PATCHes the same entry instead of duplicating it", async () => {
  jest.spyOn(api, "createEntry").mockImplementation(async (_k, e) => ({ ...e, ...served() }) as LogEntry);
  const patch = jest.spyOn(api, "patchEntry").mockImplementation(async (_id, p) => ({ ...p, ...served() }) as LogEntry);
  applyClose(closeDay(getDayRecord(TODAY), PLAN, 23 * 60));
  await drainOutbox(api);

  // the user reopens Breakfast and marks it skipped
  const { buildMealRecord } = require("../../day/record") as typeof import("../../day/record");
  const { recordMeals } = require("../dayRecord") as typeof import("../dayRecord");
  recordMeals([buildMealRecord(TODAY, PLAN[0]!, "skipped")]);
  await new Promise((r) => setTimeout(r, 0)); // recordMeals fires its own drain

  expect(entriesForDay(new Date())).toHaveLength(2); // still two entries, not three
  expect(patch).toHaveBeenCalledTimes(1); // PATCHed the already-synced entry, no second POST
  expect(pendingCount()).toBe(0);
  const rec = getDayRecord(TODAY);
  expect(rec.meals.find((m) => m.planMealId === "m-1")!.state).toBe("skipped");
  expect(rec.meals.find((m) => m.planMealId === "m-1")!.items).toEqual([]);
});

test("a 409 on a day-record create reconciles by PATCH — it is not dropped as poison", async () => {
  jest.spyOn(api, "createEntry").mockRejectedValue(new ApiError(409, { type: "about:blank", title: "exists", status: 409 }));
  const server = { ...served(), id: "srv-9", type: "meal", occurredAt: new Date().toISOString(), inputMethod: "tap", detail: { planMealId: "m-1", planStatus: "done", items: [] } } as unknown as LogEntry;
  jest.spyOn(api, "listEntries").mockResolvedValue({ items: [server] });
  const patch = jest.spyOn(api, "patchEntry").mockImplementation(async (_id, p) => ({ ...server, ...p }) as LogEntry);

  applyClose(closeDay(getDayRecord(TODAY), [PLAN[0]!], 23 * 60));
  await drainOutbox(api);
  expect(patch).toHaveBeenCalledWith("srv-9", expect.objectContaining({ detail: expect.any(Object) }));
  expect(pendingCount()).toBe(0);
});
