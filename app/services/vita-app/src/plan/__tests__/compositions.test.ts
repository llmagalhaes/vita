import type { PlanMeal } from "../../api/client";
import { compItems, compKcal, compLabel, usualChip } from "../setup";
import { swapLabel, swapQty } from "../SwapSheet";

const meal: PlanMeal = {
  name: "Lunch",
  kcal: 700,
  items: [{ id: "b1", name: "Corn", quantity: 200, unit: "g" }],
  options: [{ name: "Brunch", kcal: 679, items: [{ id: "o1", name: "Bread", quantity: 2, unit: "slices" }] }],
};

test("compItems/compKcal/compLabel: chip 0 = base, chip k = options[k-1]", () => {
  expect(compItems(meal, 0)[0]!.name).toBe("Corn");
  expect(compItems(meal, 1)[0]!.name).toBe("Bread");
  expect(compKcal(meal, 0)).toBe(700);
  expect(compKcal(meal, 1)).toBe(679);
  expect(compLabel(meal, 0)).toBe("Lunch");
  expect(compLabel(meal, 1)).toBe("Brunch");
});

test("usualChip: usualOptionIndex+1, or 0 (base) when unset", () => {
  expect(usualChip(meal)).toBe(0);
  expect(usualChip({ ...meal, usualOptionIndex: 0 })).toBe(1);
});

test("swapQty / swapLabel: qty fragment; à-vontade keeps the phrase; label joins with ·", () => {
  expect(swapQty(150, "g")).toBe("150 g");
  expect(swapQty(undefined, "as much as you like")).toBe("as much as you like");
  expect(swapQty()).toBe("");
  expect(swapLabel("Rice", 150, "g")).toBe("Rice · 150 g");
  expect(swapLabel("Lettuce", undefined, "as much as you like")).toBe("Lettuce · as much as you like");
  expect(swapLabel("Plain")).toBe("Plain");
});
