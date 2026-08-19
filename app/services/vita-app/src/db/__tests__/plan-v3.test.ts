import { api } from "../../api";
import type { EatingPlanDraft } from "../../api/client";
import { resetDbForTests } from "../db";
import { getOverlay } from "../dayRecord";
import { clearDirty, kvGet, kvSet } from "../kv";
import { pendingCount } from "../outbox";
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

// ── APP-094: portions are the day record's overlay, keyed by date ─────────────
test("portions are day-scoped BY KEY — yesterday's tweak never leaks, nothing is pushed", async () => {
  const spy = api.putPlanPortions as jest.Mock;
  setPortion("a", 3);
  expect(getPortions()).toEqual({ a: 3 });
  // yesterday's overlay is simply a different key — no rollover logic, no reset push
  expect(getOverlay(yesterday()).qty).toEqual({});
  await flush();
  expect(spy).not.toHaveBeenCalled(); // the server overlay is no longer written to
  expect(pendingCount()).toBe(0); // and nothing was enqueued for it
});

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
