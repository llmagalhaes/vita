import { api } from "../../api";
import type { EatingPlanDraft } from "../../api/client";
import { resetDbForTests } from "../db";
import { getDb } from "../db";
import { clearDirty, isDirty, kvGet, kvSet, setDirty } from "../kv";
import { drainOutbox, pendingCount } from "../outbox";
import {
  clearPortions,
  dismissIntPrompt,
  getDaySkips,
  getPortions,
  getSelectedDay,
  hideSetupPrompt,
  isIntPromptDismissed,
  isSetupPromptHidden,
  mealPlanStatus,
  savePlan,
  setPortion,
  setSelectedDay,
  toggleDaySkip,
  trainStatus,
} from "../plan";

const flush = () => new Promise((r) => setTimeout(r, 0));
const yesterday = () => {
  const d = new Date(Date.now() - 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
  jest.spyOn(api, "putPlanPortions").mockResolvedValue(undefined);
  clearPortions();
});

// ── §2.2 day-scoped portions overlay ──────────────────────────────────────────
test("getPortions: a stale day returns {} and lazily resets (one empty push)", async () => {
  setPortion("a", 3); // stamps today
  expect(getPortions()).toEqual({ a: 3 });
  // simulate a rollover: the map is from yesterday
  kvSet("plan.portionsDate", yesterday());
  const spy = api.putPlanPortions as jest.Mock;
  spy.mockClear();
  expect(getPortions()).toEqual({}); // yesterday's tweak no longer counts
  expect(kvGet("plan.portions")).toEqual({}); // cleared on disk
  await flush();
  expect(spy).toHaveBeenCalledWith({}); // server map emptied too
  // idempotent: a second read this session does not roll over again
  spy.mockClear();
  expect(getPortions()).toEqual({});
});

// ── §2.6 portions drain-race ──────────────────────────────────────────────────
test("drain-race: a write during the in-flight PUT is re-sent, not lost", async () => {
  let calls = 0;
  const spy = jest.spyOn(api, "putPlanPortions").mockImplementation(async () => {
    calls++;
    if (calls === 1) {
      // a newer local write lands WHILE the first (stale) PUT is in flight
      kvSet("plan.portions", { a: 9 });
      kvSet("plan.portionsDate", todayISO());
    }
  });
  // seed a dirty {a:3} overlay + exactly one portions row, no auto-drain
  kvSet("plan.portions", { a: 3 });
  kvSet("plan.portionsDate", todayISO());
  setDirty("plan.portions");
  getDb().runSync(`INSERT INTO outbox (entryId, op) VALUES ('plan.portions', 'portions')`);

  await drainOutbox(api);
  await flush();
  expect(calls).toBe(2); // stale send detected the change → forced a re-send
  expect(spy.mock.calls[1]![0]).toEqual({ a: 9 }); // the newer value reached the server
  expect(pendingCount()).toBe(0); // settled
  expect(isDirty("plan.portions")).toBe(false); // dirty cleared only after the newer write landed
});

function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── §2.3 day workout skips + selected day ─────────────────────────────────────
test("day skips: toggle on/off, reset on a new day; selectedDay persists undated", () => {
  toggleDaySkip("Leg day", "Squat");
  toggleDaySkip("Leg day", "Lunge");
  expect(getDaySkips()).toEqual({ "Leg day": { Squat: true, Lunge: true } });
  toggleDaySkip("Leg day", "Squat"); // off
  expect(getDaySkips()).toEqual({ "Leg day": { Lunge: true } });
  // rollover empties skips
  kvSet("workout.daySkipsDate", yesterday());
  expect(getDaySkips()).toEqual({});

  setSelectedDay("Upper body");
  kvSet("workout.daySkipsDate", yesterday()); // unrelated
  expect(getSelectedDay()).toBe("Upper body"); // not date-scoped
});

// ── §2.1 status lifecycle ─────────────────────────────────────────────────────
test("mealPlanStatus: none → review → ready; legacy (no status) reads ready", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  expect(mealPlanStatus()).toBe("none");
  await savePlan({ summary: "s", status: "review", meals: [{ name: "M", items: [{ name: "A" }] }] } as EatingPlanDraft);
  expect(mealPlanStatus()).toBe("review");
  await savePlan({ summary: "s", meals: [{ name: "M", items: [{ name: "A" }] }] }); // no status field
  expect(mealPlanStatus()).toBe("ready");
  expect(trainStatus()).toBe("none");
});

// ── §2.4 setup prompts ────────────────────────────────────────────────────────
test("savePlan re-shows the setup prompt; dismissers persist", async () => {
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => d);
  hideSetupPrompt();
  expect(isSetupPromptHidden()).toBe(true);
  await savePlan({ summary: "s", meals: [{ name: "M", items: [{ name: "A" }] }] });
  expect(isSetupPromptHidden()).toBe(false); // a new import shows the banner again
  dismissIntPrompt();
  expect(isIntPromptDismissed()).toBe(true);
});

// ── APP-092 #2 pushPlan adopts the PUT response (ids on edit-added items) ──────
test("updatePlan adopts the server response so edit-added items gain ids", async () => {
  const { updatePlan } = require("../plan") as typeof import("../plan");
  // seed a saved plan (mock assigns ids on create)
  jest.spyOn(api, "createPlan").mockImplementation(async (d) => ({ ...d, meals: d.meals.map((m, i) => ({ ...m, items: m.items.map((it, j) => ({ ...it, id: it.id ?? `it-${i}${j}` })) })) }));
  await savePlan({ summary: "s", meals: [{ name: "M", items: [{ name: "A" }] }] });
  clearDirty("plan.current");
  // edit adds an item with no id; the PUT echo assigns one
  jest.spyOn(api, "updatePlan").mockImplementation(async (d) => ({ ...d, meals: d.meals.map((m) => ({ ...m, items: m.items.map((it, j) => ({ ...it, id: it.id ?? `new-${j}` })) })) }));
  const cur = kvGet<EatingPlanDraft>("plan.current")!;
  await updatePlan({ ...cur, meals: [{ ...cur.meals[0]!, items: [...cur.meals[0]!.items, { name: "B" }] }] });
  await flush();
  const after = kvGet<EatingPlanDraft>("plan.current")!;
  expect(after.meals[0]!.items.every((it) => it.id != null)).toBe(true);
});
