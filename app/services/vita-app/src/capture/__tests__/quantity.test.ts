import type { MealItem } from "../../api";
import { mealTotals, stepItem } from "../quantity";

const item = (): MealItem => ({ name: "Rice", quantity: 1, unit: "cup", kcal: 210, proteinG: 7, carbsG: 42, fatG: 1.2 });

test("increasing quantity scales kcal and macros linearly", () => {
  const two = stepItem(item(), 1);
  expect(two.quantity).toBe(2);
  expect(two.kcal).toBe(420);
  expect(two.proteinG).toBe(14);
  expect(two.carbsG).toBe(84);
});

test("quantity never drops below 1", () => {
  const still = stepItem(item(), -1);
  expect(still.quantity).toBe(1);
  expect(still.kcal).toBe(210);
});

test("stepping up then back down is exactly reversible (no rounding drift)", () => {
  let it = item();
  it = stepItem(it, 1); // 2
  it = stepItem(it, 1); // 3
  it = stepItem(it, -1); // 2
  it = stepItem(it, -1); // 1
  expect(it.quantity).toBe(1);
  expect(it.kcal).toBe(210);
  expect(it.proteinG).toBe(7);
});

test("mealTotals sums items", () => {
  const totals = mealTotals([item(), { name: "Salad", kcal: 110, proteinG: 1.2, carbsG: 5, fatG: 9 }]);
  expect(totals.kcal).toBe(320);
  expect(totals.proteinG).toBeCloseTo(8.2);
});
