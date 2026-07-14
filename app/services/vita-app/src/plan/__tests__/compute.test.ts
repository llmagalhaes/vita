import type { EatingPlanDraft } from "../../api/client";
import { itemTotals, mealTotals, planDailyTotals, portionRange } from "../compute";
import { clampSlider, quantize, ratioOf, valueFromX } from "../../ui/Slider";

const plan: EatingPlanDraft = {
  summary: "Test",
  meals: [
    {
      name: "Breakfast",
      items: [
        { name: "Oats", quantity: 2, unit: "bowl", nutritionPerUnit: { kcal: 100, proteinG: 5, carbsG: 20, fatG: 2 } },
        { name: "Water", quantity: 1, unit: "glass" }, // no nutritionPerUnit → contributes 0
      ],
    },
    {
      name: "Lunch",
      items: [{ name: "Chicken", quantity: 150, unit: "g", nutritionPerUnit: { kcal: 1.65, proteinG: 0.31, carbsG: 0, fatG: 0.036 } }],
    },
  ],
};

test("itemTotals scales per-unit by quantity; missing per-unit → zeros", () => {
  expect(itemTotals(plan.meals[0]!.items[0]!)).toEqual({ kcal: 200, proteinG: 10, carbsG: 40, fatG: 4 });
  expect(itemTotals(plan.meals[0]!.items[1]!)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
});

test("mealTotals and planDailyTotals sum the tree", () => {
  expect(mealTotals(plan.meals[0]!).kcal).toBe(200);
  const daily = planDailyTotals(plan);
  expect(daily.kcal).toBeCloseTo(200 + 150 * 1.65, 5); // 447.5
  expect(daily.proteinG).toBeCloseTo(10 + 150 * 0.31, 5);
});

test("portionRange gives sensible bounds for small and gram quantities", () => {
  expect(portionRange(2)).toEqual({ min: 0, max: 6, step: 0.25 });
  expect(portionRange(150)).toEqual({ min: 0, max: 300, step: 5 });
  expect(portionRange(undefined)).toEqual({ min: 0, max: 4, step: 0.25 }); // defaults to 1
});

test("slider math: clamp, quantize, value↔ratio round-trip", () => {
  expect(clampSlider(12, 0, 6)).toBe(6);
  expect(clampSlider(-1, 0, 6)).toBe(0);
  expect(quantize(2.1, 0.25)).toBe(2);
  expect(quantize(2.2, 0.25)).toBe(2.25);
  // halfway across a 0..6 track → 3, quantized to step 0.25
  expect(valueFromX(50, 100, 0, 6, 0.25)).toBe(3);
  expect(ratioOf(3, 0, 6)).toBe(0.5);
  expect(valueFromX(-10, 100, 0, 6, 0.25)).toBe(0); // clamped
});
