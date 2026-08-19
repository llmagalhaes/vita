/**
 * APP-094 — the pure day-record logic. No db, no React, no clock.
 */
import type { PlanMeal } from "../../api/client";
import { closeDay, retroClose } from "../close";
import {
  buildMealRecord,
  composeItems,
  dayMeals,
  emptyDay,
  emptyOverlay,
  fromMealEntry,
  mealEntryId,
  minutesOf,
  toMealEntry,
  type DayRecord,
} from "../record";
import { closeLine, dayCounters, dayStatus, isDue, isRetro, mealState, pendingMeals, recapLine } from "../state";

const DATE = "2026-08-19";

const per = (kcal: number) => ({ kcal, proteinG: 0.1, carbsG: 0.2, fatG: 0.05 });
const PLAN: PlanMeal[] = [
  {
    id: "m-1",
    name: "Breakfast",
    time: "08:00",
    items: [
      { id: "it-1", name: "Oats", quantity: 60, unit: "g", nutritionPerUnit: per(4) },
      {
        id: "it-2",
        name: "White rice",
        quantity: 150,
        unit: "g",
        nutritionPerUnit: per(1.3),
        swaps: [{ name: "Sweet potato", quantity: 200, unit: "g" }],
      },
    ],
  },
  { id: "m-2", name: "Lunch", time: "13:00", items: [{ id: "it-3", name: "Chicken", quantity: 200, unit: "g", nutritionPerUnit: per(1.65) }] },
  {
    id: "m-3",
    name: "Dinner",
    time: "19:30",
    items: [{ id: "it-4", name: "Salmon", quantity: 140, unit: "g", nutritionPerUnit: per(2) }],
    options: [{ name: "Lighter", items: [{ id: "it-5", name: "Soup", quantity: 1, unit: "bowl", nutritionPerUnit: per(180) }] }],
  },
];

const day = (over: Partial<DayRecord> = {}): DayRecord => ({ ...emptyDay(DATE), ...over });
const record = (meal: PlanMeal, state: "done" | "adjusted" | "skipped", ov = emptyOverlay()) =>
  buildMealRecord(DATE, meal, state, ov);

// ── basics ───────────────────────────────────────────────────────────────────

test("minutesOf / dayMeals: chronological, id-less meals dropped", () => {
  expect(minutesOf("19:30")).toBe(1170);
  expect(minutesOf(undefined)).toBe(0);
  const ms = dayMeals([...PLAN, { name: "unsaved", time: "07:00", items: [] }]);
  expect(ms.map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
  expect(ms[0]!.minutes).toBe(480);
});

test("isDue: a meal is due once its slot has passed", () => {
  expect(isDue({ minutes: 480 }, 480)).toBe(true);
  expect(isDue({ time: "19:30" }, 1169)).toBe(false);
});

test("mealState: planned is the ABSENCE of a record, never a stored value", () => {
  const d = day();
  expect(mealState(d, PLAN[0]!)).toBe("planned");
  const withRec = day({ meals: [record(PLAN[0]!, "done")] });
  expect(mealState(withRec, PLAN[0]!)).toBe("done");
  expect(mealState(withRec, PLAN[1]!)).toBe("planned");
  expect(JSON.stringify(withRec)).not.toContain("planned"); // nothing writes it
});

test("dayCounters: planned counted against the plan, recorded from the records", () => {
  const d = day({ meals: [record(PLAN[0]!, "done"), record(PLAN[1]!, "skipped")] });
  expect(dayCounters(d, dayMeals(PLAN))).toEqual({ done: 1, adjusted: 0, skipped: 1, planned: 1 });
  expect(dayCounters(d)).toMatchObject({ done: 1, skipped: 1, planned: 0 }); // no plan ⇒ records only
});

// ── the two named acceptance cases ───────────────────────────────────────────

test("closing the day does NOT close a future meal", () => {
  const noon = 12 * 60;
  const { day: after, written } = closeDay(day(), PLAN, noon);
  expect(written.map((r) => r.planMealId)).toEqual(["m-1"]); // 08:00 due; 13:00 and 19:30 are not
  expect(mealState(after, PLAN[1]!)).toBe("planned");
  expect(mealState(after, PLAN[2]!)).toBe("planned");
  expect(pendingMeals(after, dayMeals(PLAN), noon)).toEqual([]); // nothing left that is both due and planned
});

test("unrecorded ≠ empty record: a skipped meal is a real record", () => {
  expect(dayStatus(day())).toBe("unrecorded");
  expect(dayStatus(day({ waterMl: 2000 }))).toBe("unrecorded"); // water alone never closes a day
  const skipped = record(PLAN[1]!, "skipped");
  expect(skipped.items).toEqual([]); // R10 — empty items…
  expect(skipped.totals).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }); // …and zero totals
  expect(dayStatus(day({ meals: [skipped] }))).toBe("adjusted"); // recorded, just not as planned
});

// ── close / retro ────────────────────────────────────────────────────────────

test("close and retro produce ONE representation — only occurredAt differs (R10a)", () => {
  const live = closeDay(day(), PLAN, 23 * 60).written;
  const retro = retroClose(day(), PLAN).written;
  expect(retro.map((r) => r.planMealId)).toEqual(["m-1", "m-2", "m-3"]);
  expect(retro).toEqual(live); // same shape, same slots, same ids
  expect(retro[2]!.at.slice(0, 4)).toBe("2026");
});

test("close never overwrites an existing record", () => {
  const adjusted = record(PLAN[0]!, "adjusted");
  const { day: after, written } = closeDay(day({ meals: [adjusted] }), PLAN, 23 * 60);
  expect(written.map((r) => r.planMealId)).toEqual(["m-2", "m-3"]);
  expect(mealState(after, PLAN[0]!)).toBe("adjusted");
});

test("isRetro: derived from loggedAt landing on a later day (no closed{} on the wire)", () => {
  const rec = record(PLAN[0]!, "done");
  expect(isRetro(rec)).toBe(false); // unsynced — nothing to derive from yet
  expect(isRetro({ ...rec, loggedAt: `${DATE}T22:00:00.000Z` })).toBe(false);
  expect(isRetro({ ...rec, loggedAt: "2026-08-21T09:00:00.000Z" })).toBe(true);
});

// ── self-describing records (risk R7) ────────────────────────────────────────

test("records are self-describing: every item carries its rendered name/qty + replacesItemId", () => {
  const items = composeItems(PLAN[0]!);
  expect(items).toEqual([
    { name: "Oats", quantity: 60, unit: "g", kcal: 240, proteinG: 6, carbsG: 12, fatG: 3, replacesItemId: "it-1" },
    { name: "White rice", quantity: 150, unit: "g", kcal: 195, proteinG: 15, carbsG: 30, fatG: 7.5, replacesItemId: "it-2" },
  ]);
});

test("a plan re-import cannot corrupt history — the record renders without the plan", () => {
  const rec = record(PLAN[0]!, "done");
  const entry = toMealEntry(rec);
  // the plan is re-imported: ids are reissued, names change, m-1 now means something else
  const rehydrated = fromMealEntry({ ...entry, id: rec.entryId });
  expect(rehydrated!.title).toBe("Breakfast");
  expect(rehydrated!.items.map((i) => i.name)).toEqual(["Oats", "White rice"]);
  expect(rehydrated!.totals.kcal).toBe(435);
  expect(rehydrated!.planMealId).toBe("m-1"); // the (now stale) back-pointer is kept, never trusted for rendering
});

// ── overlay: swaps, portions, skips, options ─────────────────────────────────

test("the day overlay drives the composition: swap, portion, skip and option in one place", () => {
  const ov = emptyOverlay();
  ov.swap["it-2"] = { name: "Sweet potato", quantity: 200, unit: "g" };
  ov.qty["it-1"] = 30;
  const swapped = composeItems(PLAN[0]!, ov);
  expect(swapped[0]).toMatchObject({ name: "Oats", quantity: 30, kcal: 120 });
  // the swap is priced in ITS OWN space (equivalence: 150g rice ≈ 200g sweet potato)
  expect(swapped[1]).toMatchObject({ name: "Sweet potato", quantity: 200, unit: "g", replacesItemId: "it-2" });
  expect(swapped[1]!.kcal).toBeCloseTo(195, 6);

  ov.skip["it-1"] = true;
  expect(composeItems(PLAN[0]!, ov).map((i) => i.name)).toEqual(["Sweet potato"]);

  const opt = emptyOverlay();
  opt.option["m-3"] = 0;
  const rec = buildMealRecord(DATE, PLAN[2]!, "adjusted", opt);
  expect(rec.planOptionIndex).toBe(0);
  expect(rec.items.map((i) => i.name)).toEqual(["Soup"]);
});

// ── wire mapping ─────────────────────────────────────────────────────────────

test("toMealEntry: planStatus/planOptionIndex only ever travel WITH planMealId", () => {
  const d = toMealEntry(record(PLAN[0]!, "adjusted")).detail as Record<string, unknown>;
  expect(d).toMatchObject({ planMealId: "m-1", planStatus: "adjusted" });
  expect(d.planOptionIndex).toBeUndefined();
  const free = toMealEntry({ ...record(PLAN[0]!, "done"), planMealId: undefined }).detail as Record<string, unknown>;
  expect(free.planMealId).toBeUndefined();
  expect(free.planStatus).toBeUndefined(); // sending it alone is a 400
});

test("entry ids are deterministic — one record per meal per day", () => {
  expect(mealEntryId(DATE, "m-1")).toBe("meal:2026-08-19:m-1");
  expect(record(PLAN[0]!, "done").entryId).toBe(mealEntryId(DATE, "m-1"));
});

test("fromMealEntry: an off-plan meal is a real record with no planStatus", () => {
  const rec = fromMealEntry({
    type: "meal",
    occurredAt: `${DATE}T12:00:00.000Z`,
    inputMethod: "voice",
    isEstimate: true,
    detail: { title: "Pastel na feira", items: [{ name: "Pastel", kcal: 300 }] },
  });
  expect(rec).toMatchObject({ title: "Pastel na feira", state: "adjusted" });
  expect(rec).not.toHaveProperty("planMealId");
  expect(rec!.totals.kcal).toBe(300); // totals derived when the wire omits them
});

// ── copy ─────────────────────────────────────────────────────────────────────

test("recapLine: counters only, domain-gated, empty when nothing was recorded", () => {
  const d = day({
    meals: [record(PLAN[0]!, "done"), record(PLAN[1]!, "adjusted"), record(PLAN[2]!, "skipped")],
    waterMl: 2250,
    workout: { entryId: "w", title: "Leg day", state: "done", exercises: [], at: `${DATE}T18:00:00.000Z` },
  });
  expect(recapLine(d)).toBe("1 meal as planned · 1 adjusted · 1 skipped · Leg day done · 2,250 ml of water");
  expect(recapLine(d, { meals: false, move: false })).toBe("2,250 ml of water");
  expect(recapLine(day())).toBe("");
});

test("closeLine names what is still planned AND due", () => {
  expect(closeLine(day(), dayMeals(PLAN), 14 * 60)).toBe(
    "Breakfast and Lunch are still marked planned — everything else is confirmed.",
  );
  expect(closeLine(day(), dayMeals(PLAN), 7 * 60)).toBe("Everything is confirmed — close the day whenever you like.");
});
