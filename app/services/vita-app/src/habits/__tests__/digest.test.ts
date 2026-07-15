import { planDigestBody } from "../digest";
import type { EatingPlanDraft } from "../../api/client";

const plan: EatingPlanDraft = {
  summary: "test plan",
  meals: [
    {
      name: "Lunch",
      time: "13:00",
      items: [
        { name: "Grilled chicken", quantity: 1, nutritionPerUnit: { kcal: 300, proteinG: 40, carbsG: 5, fatG: 12 } },
        { name: "Rice & beans", quantity: 2, nutritionPerUnit: { kcal: 150, proteinG: 5, carbsG: 25, fatG: 2 } },
        { name: "Salad", quantity: 1, nutritionPerUnit: { kcal: 40, proteinG: 2, carbsG: 6, fatG: 1 } },
        { name: "Olive oil", quantity: 1, nutritionPerUnit: { kcal: 90, proteinG: 0, carbsG: 0, fatG: 10 } },
      ],
    },
  ],
};

test("planDigestBody sums the meal macros and lists up to 3 example foods", () => {
  const body = planDigestBody(plan, "Lunch");
  // protein 40+10+2 = 52, carbs 5+50+6 = 61, fat 12+4+1+10 = 27
  expect(body).toBe("Lunch, from your plan · 52 g protein · 61 g carbs · 27 g fat · e.g. Grilled chicken, Rice & beans, Salad");
});

test("planDigestBody returns null for a missing plan / meal (caller falls back)", () => {
  expect(planDigestBody(null, "Lunch")).toBeNull();
  expect(planDigestBody(plan, undefined)).toBeNull();
  expect(planDigestBody(plan, "Dinner")).toBeNull();
});
