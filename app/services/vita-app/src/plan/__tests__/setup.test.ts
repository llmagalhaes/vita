import "../../i18n";
import type { EatingPlanDraft, ProgramDay } from "../../api/client";
import { effectiveName, effectivePerUnit, effectiveQuantity, effectiveUnit } from "../compute";
import { applyUsuals, changesToday, dayWorkoutKcal, setupFindings, supplementTime } from "../setup";

// A meal with a base composition (2 items, one swappable) + one option (1 item,
// swappable). Banana carries the equivalence-tested swap; "as much as you like"
// covers the no-quantity branch.
const doc: EatingPlanDraft = {
  summary: "x",
  status: "review",
  hydration: { mlPerDay: 2500 },
  supplements: [{ name: "Creatine", timing: "with lunch" }],
  meals: [
    {
      name: "Pre-workout",
      items: [
        { id: "it-1", name: "Banana", quantity: 100, unit: "g", nutritionPerUnit: { kcal: 0.89, proteinG: 0.011, carbsG: 0.23, fatG: 0.003 }, swaps: [{ name: "Rice", quantity: 150, unit: "g" }, { name: "Lettuce", unit: "as much as you like" }] },
      ],
    },
    {
      name: "Lunch",
      items: [{ id: "it-2", name: "Corn", quantity: 200, unit: "g", swaps: [{ name: "Potato", quantity: 220, unit: "g" }] }],
      options: [{ name: "Brunch", items: [{ id: "it-3", name: "Bread", quantity: 2, unit: "slices", swaps: [{ name: "Tortilla", quantity: 2, unit: "medium" }] }] }],
    },
  ],
};

test("setupFindings: counts from the doc; pageCount omitted → 2 lines, present → 3", () => {
  const two = setupFindings(doc);
  expect(two).toHaveLength(2);
  // meals=2, swaps = 2 (Banana) + 1 (Corn) + 1 (Brunch bread) = 4
  expect(two[0]).toBe("2 meals · 4 swap options");
  expect(two[1]).toBe("hydration & supplement notes");
  const three = setupFindings(doc, 13);
  expect(three[0]).toBe("13 pages");
  expect(three).toHaveLength(3);
});

test("setupFindings: no hydration/supplements → drops the notes line", () => {
  const bare: EatingPlanDraft = { summary: "x", meals: [{ name: "M", items: [{ name: "A" }] }] };
  expect(setupFindings(bare)).toEqual(["1 meals · 0 swap options"]);
});

test("effective swap: equivalence per-unit = base.perUnit × base.qty / swap.qty; à-vontade → undefined", () => {
  const item = doc.meals[0]!.items[0]!;
  // no usual → original
  expect(effectiveName(item)).toBe("Banana");
  expect(effectivePerUnit(item)).toEqual(item.nutritionPerUnit);
  // Rice usual (swap 0): total at 150g ≈ banana total at 100g → perUnit scaled by 100/150
  const rice = { ...item, usualSwapIndex: 0 };
  expect(effectiveName(rice)).toBe("Rice");
  expect(effectiveQuantity(rice)).toBe(150);
  expect(effectiveUnit(rice)).toBe("g");
  const per = effectivePerUnit(rice)!;
  expect(per.kcal).toBeCloseTo(0.89 * (100 / 150), 6);
  // "as much as you like" (swap 1, no quantity) → no computable per-unit
  const lettuce = { ...item, usualSwapIndex: 1 };
  expect(effectivePerUnit(lettuce)).toBeUndefined();
  expect(effectiveQuantity(lettuce)).toBe(100); // falls back to base quantity
});

test("changesToday: overrides ≠ effective default + skipped exercises", () => {
  const skips = { "Day 1": { Squat: true as const, Lunge: true as const }, "Day 2": { Press: true as const } };
  // it-1 overridden away from 100 (counts), it-2 set to its default 200 (does not)
  expect(changesToday(doc, { "it-1": 120, "it-2": 200 }, skips)).toBe(1 + 3);
  expect(changesToday(doc, {}, {})).toBe(0);
});

test("dayWorkoutKcal: scales by active/total; null when no estimate", () => {
  const day: ProgramDay = { name: "Leg day", exercises: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }], kcalEstimate: 430 };
  expect(dayWorkoutKcal(day, {})).toBe(430);
  expect(dayWorkoutKcal(day, { "Leg day": { A: true, B: true } })).toBe(Math.round((430 * 2) / 4));
  expect(dayWorkoutKcal({ name: "X", exercises: [{ name: "A" }] }, {})).toBeNull();
});

test("supplementTime: lunch/dinner → 13:00, morning → 08:00, else 10:00", () => {
  expect(supplementTime("once a day, with lunch or dinner")).toBe("13:00");
  expect(supplementTime("in the morning when you wake")).toBe("08:00");
  expect(supplementTime("any time")).toBe("10:00");
  expect(supplementTime()).toBe("10:00");
});

test("applyUsuals writes indices (no reorder/rewrite) and flips status to ready", () => {
  // Lunch: pick the option chip (index 1 → options[0]) and swap its bread to Tortilla (swap 0);
  // Pre-workout: keep base (chip 0), swap Banana → Rice (swap 0).
  const out = applyUsuals(doc, { 1: 1 }, { "0_0_0": 0, "1_1_0": 0 });
  expect(out.status).toBe("ready");
  // Pre-workout base item gets usualSwapIndex, structure unchanged
  expect(out.meals[0]!.items[0]!.usualSwapIndex).toBe(0);
  expect(out.meals[0]!.items[0]!.name).toBe("Banana"); // no rewrite
  // Lunch: usualOptionIndex = chip-1 = 0; the option's item gets the swap index
  expect(out.meals[1]!.usualOptionIndex).toBe(0);
  expect(out.meals[1]!.options![0]!.items[0]!.usualSwapIndex).toBe(0);
  // base lunch item untouched (option is the usual)
  expect(out.meals[1]!.items[0]!.usualSwapIndex).toBeUndefined();
});

test("applyUsuals: chip 0 on an options meal clears usualOptionIndex (base is usual)", () => {
  const out = applyUsuals(doc, { 1: 0 }, {});
  expect(out.meals[1]!.usualOptionIndex).toBeUndefined();
});
