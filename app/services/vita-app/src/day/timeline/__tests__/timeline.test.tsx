/**
 * APP-098 — "Your day".
 *
 * The pure half (node order, stagger, rail dots, the composition rows) is asserted
 * directly; the component half asserts the three things that must never regress:
 * a future meal offers nothing to confirm, confirming writes a REAL day-record entry
 * under its deterministic id, and Close-the-day records only the meals that are DUE.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import "../../../i18n";
import i18n from "../../../i18n";
import type { EatingPlanDraft, PlanMeal, TrainingProgramDraft } from "../../../api/client";
import { effectiveName } from "../../../plan/compute";
import { resetDbForTests } from "../../../db/db";
import { getEntry } from "../../../db/entries";
import { kvSet } from "../../../db/kv";
import { saveSettings, type Settings } from "../../../db/settings";
import { getToast } from "../../../ui/toast";
import { getDayRecord, setOverlay } from "../../../db/dayRecord";
import { dayKey, emptyDay, emptyOverlay, mealEntryId, type DayRecord } from "../../record";
import { isDayClosed } from "../../../db/dayRecord";
import { Timeline, dotColor, timelineNodes } from "../Timeline";
import { itemRows } from "../MealNode";
import { workoutState } from "../WorkoutNode";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/day",
}));

const t = (k: string, v?: Record<string, unknown>) => i18n.t(k, v ?? {});
const ALL: Settings["domains"] = { meals: true, water: true, move: true, habits: true, weight: true };

const item = (id: string, name: string, kcal: number, quantity = 1) => ({
  id,
  name,
  quantity,
  unit: "serving",
  nutritionPerUnit: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
});

/** Two meals: one always due (00:01), one never (23:59) — no clock flakiness. */
const PLAN: EatingPlanDraft = {
  summary: "test plan",
  meals: [
    { id: "m-1", name: "Breakfast", time: "00:01", items: [item("i-1", "Oats", 200), item("i-2", "Milk", 100)] },
    {
      id: "m-2",
      name: "Dinner",
      time: "23:59",
      items: [item("i-3", "Rice", 300)],
      options: [{ name: "Sweet potato", kcal: 260, items: [item("i-4", "Sweet potato", 260)] }],
    },
  ],
};

const PROGRAM: TrainingProgramDraft = {
  summary: "test program",
  days: [
    { name: "Leg day", kcalEstimate: 400, exercises: [{ name: "Squat", sets: 4, reps: 8 }, { name: "Leg press", sets: 3, reps: 12 }] },
    { name: "Upper body", exercises: [{ name: "Bench press", sets: 4, reps: 8 }] },
  ],
};

beforeEach(() => {
  resetDbForTests();
  // recapStartHour 0 ⇒ it is always "evening", so the Close-the-day node is testable.
  saveSettings({ name: "Sam", domains: ALL, recapStartHour: 0 });
  kvSet("plan.current", PLAN);
  kvSet("program.current", PROGRAM);
});

const today = () => dayKey();
const empty = (): DayRecord => emptyDay(today());

// ── pure: node list ──────────────────────────────────────────────────────────

test("nodes are chronological, meals stagger 45ms in plan order, the workout at 18:00/160ms", () => {
  const nodes = timelineNodes({
    day: empty(),
    meals: PLAN.meals,
    program: PROGRAM.days[0]!,
    domains: { meals: true, move: true },
    nowMin: 12 * 60,
  });
  expect(nodes.map((n) => n.kind)).toEqual(["meal", "workout", "meal"]);
  expect(nodes.map((n) => n.time)).toEqual(["00:01", "18:00", "23:59"]);
  expect(nodes.map((n) => n.delayMs)).toEqual([0, 160, 45]);
  // due-ness follows the slot, not the render order
  expect(nodes.map((n) => n.due)).toEqual([true, false, false]);
});

test("a composition flag off removes its nodes — it never deletes anything", () => {
  const only = (domains: { meals: boolean; move: boolean }) =>
    timelineNodes({ day: empty(), meals: PLAN.meals, program: PROGRAM.days[0]!, domains, nowMin: 0 }).map((n) => n.kind);
  expect(only({ meals: false, move: true })).toEqual(["workout"]);
  expect(only({ meals: true, move: false })).toEqual(["meal", "meal"]);
  expect(only({ meals: false, move: false })).toEqual([]);
});

test("a meal with no id has nothing to record against and is dropped", () => {
  const meals: PlanMeal[] = [{ name: "Unsaved", time: "08:00", items: [] }];
  expect(timelineNodes({ day: empty(), meals, program: null, domains: { meals: true, move: true }, nowMin: 600 })).toEqual([]);
});

// ── pure: rail dots ──────────────────────────────────────────────────────────

test("the rail dot says the state, and only a DUE planned meal is the accent one", () => {
  expect(dotColor("done", true, "#ACC")).toBe("#8CA58A");
  expect(dotColor("adjusted", true, "#ACC")).toBe("#C98A3F");
  expect(dotColor("skipped", true, "#ACC")).toBe("#D9CFBD");
  expect(dotColor("planned", true, "#ACC")).toBe("#ACC");
  expect(dotColor("planned", false, "#ACC")).toBe("#E4DCCB");
});

// ── pure: composition rows ───────────────────────────────────────────────────

test("item rows apply today's option, quantity, swap and skip", () => {
  const base = itemRows(PLAN.meals[0]!, emptyOverlay());
  expect(base.map((r) => [r.lens.name, r.kcal, r.skipped])).toEqual([
    ["Oats", 200, false],
    ["Milk", 100, false],
  ]);

  const tweaked = itemRows(PLAN.meals[0]!, { ...emptyOverlay(), qty: { "i-1": 2 }, skip: { "i-2": true } });
  expect(tweaked[0]!.kcal).toBe(400);
  expect(tweaked[1]!.skipped).toBe(true);

  // The option pick swaps the whole composition.
  const opted = itemRows(PLAN.meals[1]!, { ...emptyOverlay(), option: { "m-2": 0 } });
  expect(opted.map((r) => r.lens.name)).toEqual(["Sweet potato"]);

  // A day swap is priced through the same equivalence lens the plan screen uses.
  const swapped = itemRows(PLAN.meals[1]!, { ...emptyOverlay(), swap: { "i-3": { name: "Quinoa", quantity: 1, unit: "serving" } } });
  expect(swapped[0]!.swapped).toBe(true);
  expect(effectiveName(swapped[0]!.lens)).toBe("Quinoa");
});

test("a workout with no record is planned; the record's state is the truth", () => {
  expect(workoutState(empty())).toBe("planned");
  expect(
    workoutState({
      ...empty(),
      workout: { entryId: "workout:x", title: "Leg day", state: "adjusted", exercises: [], at: new Date().toISOString() },
    }),
  ).toBe("adjusted");
});

// ── component ────────────────────────────────────────────────────────────────

test("a meal later today shows '· later today' and offers nothing to confirm", async () => {
  await render(<Timeline />);
  // Dinner is at 23:59: its sub-line carries the note and its card offers no confirm.
  expect(await screen.findByText(`${t("timeline.itemsOne", { n: 1 })}${t("timeline.laterToday")}`)).toBeTruthy();
  expect(screen.getAllByText(t("timeline.meal.confirm"))).toHaveLength(1);
});

test("confirming a due meal writes its day-record entry under the deterministic id", async () => {
  await render(<Timeline />);
  fireEvent.press(await screen.findByText(t("timeline.meal.confirm")));

  await waitFor(() => expect(getEntry(mealEntryId(today(), "m-1"))).not.toBeNull());
  const entry = getEntry(mealEntryId(today(), "m-1"))!;
  expect(entry.type).toBe("meal");
  const detail = entry.detail as { planMealId?: string; planStatus?: string; totals?: { kcal?: number } };
  expect(detail.planMealId).toBe("m-1");
  expect(detail.planStatus).toBe("done");
  expect(detail.totals?.kcal).toBe(300); // 200 + 100, today's composition
  // and the undo affordance is offered, never a silent write
  expect(getToast()?.text).toBe(t("timeline.meal.confirmedToast", { name: "Breakfast" }));
  expect(getToast()?.undo).toBeInstanceOf(Function);
});

test("Close the day records ONLY the meals already due, and the recap replaces the card", async () => {
  await render(<Timeline />);
  fireEvent.press(await screen.findByText(t("timeline.close.cta")));

  await waitFor(() => expect(getEntry(mealEntryId(today(), "m-1"))).not.toBeNull());
  expect(getEntry(mealEntryId(today(), "m-2"))).toBeNull(); // 23:59 has not happened
  expect(isDayClosed(today())).toBe(true);
  expect(await screen.findByText(t("timeline.recap.footer"))).toBeTruthy();
  expect(screen.queryByText(t("timeline.close.cta"))).toBeNull();
});

test("Reopen puts the day back without erasing a single record", async () => {
  await render(<Timeline />);
  fireEvent.press(await screen.findByText(t("timeline.close.cta")));
  fireEvent.press(await screen.findByText(t("timeline.recap.reopen")));

  await waitFor(() => expect(isDayClosed(today())).toBe(false));
  expect(getEntry(mealEntryId(today(), "m-1"))).not.toBeNull();
});

test("the close line names the meals still marked planned, never a verdict", async () => {
  // Nothing recorded and only the 00:01 meal due ⇒ it is the one named.
  await render(<Timeline />);
  expect(await screen.findByText(/Breakfast is still marked planned/)).toBeTruthy();
});

test("'Didn't have this meal' records a real skip — zero items, zero totals (R10)", async () => {
  await render(<Timeline />);
  fireEvent.press(await screen.findByLabelText("Breakfast")); // expand
  fireEvent.press(await screen.findByText(t("timeline.meal.skip")));

  await waitFor(() => expect(getEntry(mealEntryId(today(), "m-1"))).not.toBeNull());
  const detail = getEntry(mealEntryId(today(), "m-1"))!.detail as {
    planStatus?: string;
    items?: unknown[];
    totals?: { kcal?: number };
  };
  expect(detail.planStatus).toBe("skipped");
  expect(detail.items).toEqual([]);
  expect(detail.totals?.kcal).toBe(0);
});

test("ticking exercises records the session: some ⇒ adjusted, all ⇒ done", async () => {
  await render(<Timeline />);
  fireEvent.press(await screen.findByLabelText("Leg day")); // expand the workout card
  fireEvent.press(await screen.findByLabelText("Squat"));

  await waitFor(() => expect(getDayRecord(today()).workout).toBeDefined());
  expect(getDayRecord(today()).workout).toMatchObject({ state: "adjusted", planDay: "Leg day" });
  expect(getDayRecord(today()).workout!.exercises.map((e) => e.name)).toEqual(["Squat"]);

  fireEvent.press(await screen.findByLabelText("Leg press"));
  await waitFor(() => expect(getDayRecord(today()).workout!.state).toBe("done"));
});

test("the day overlay is date-keyed, so 'only counts for today' needs no rollover reset", () => {
  setOverlay(today(), { qty: { "i-1": 3 } });
  expect(getDayRecord(today()).overlay.qty["i-1"]).toBe(3);
  expect(getDayRecord("2020-01-01").overlay.qty["i-1"]).toBeUndefined();
});
