import type { EatingPlanDraft, PlanItem } from "../../api/client";
import {
  barPct,
  boundsOf,
  itemTotals,
  kcalLabel,
  mealTotals,
  planDailyTotals,
  planMicroTotals,
  portionRange,
  pruneOverlayAfterEdit,
  qtyLabel,
  qtyOf,
} from "../compute";
import { tint } from "../../ui/tokens";
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

// ---- APP-077: portions/micros/labels/tint ------------------------------------

// A4: the handoff §1.2 table is EXAMPLE data used as a deterministic GOLDEN test
// input — every expected value below is COMPUTED from this in-test fixture, never
// hand-copied. Real plans get all nutrition from Claude parse estimates.
type Raw = [string, string, number, number, number, number, number, number, number, number, number, number, number, number];
// id, unit, qty, min, max, step, k, P, C, F, fb, na, fe, ca
const RAW: Raw[] = [
  ["eggs", "egg", 2, 0, 4, 1, 95, 6.5, 0.8, 7, 0, 95, 0.9, 28],
  ["bread", "slice", 1, 0, 3, 1, 145, 4, 27, 2, 1.4, 210, 1, 20],
  ["latte", "ml", 200, 0, 400, 50, 0.55, 0.033, 0.05, 0.018, 0, 0.4, 0, 1.2],
  ["chicken", "g", 180, 0, 300, 10, 1.65, 0.31, 0, 0.036, 0, 0.74, 0.007, 0.11],
  ["rice", "g", 200, 0, 350, 10, 1.05, 0.035, 0.21, 0.006, 0.025, 1.9, 0.009, 0.12],
  ["salad", "g", 100, 0, 200, 10, 1.1, 0.012, 0.05, 0.09, 0.02, 0.5, 0.005, 0.3],
  ["yog", "g", 170, 0, 300, 10, 0.59, 0.059, 0.047, 0.015, 0, 0.21, 0, 0.65],
  ["gran", "g", 30, 0, 80, 5, 2.33, 0.08, 0.42, 0.07, 0.09, 0.5, 0.04, 0.4],
  ["salmon", "g", 160, 0, 300, 10, 1.85, 0.25, 0, 0.088, 0, 0.55, 0.005, 0.09],
  ["veg", "g", 150, 0, 300, 10, 0.6, 0.02, 0.11, 0.01, 0.03, 0.3, 0.007, 0.25],
  ["spot", "g", 150, 0, 300, 10, 0.92, 0.016, 0.21, 0.001, 0.03, 0.36, 0.006, 0.3],
];
const item = ([id, unit, qty, min, max, step, k, P, C, F, fb, na, fe, ca]: Raw): PlanItem => ({
  id,
  name: id,
  unit,
  quantity: qty,
  nutritionPerUnit: { kcal: k, proteinG: P, carbsG: C, fatG: F },
  microsPerUnit: { fiberG: fb, sodiumMg: na, ironMg: fe, calciumMg: ca },
  portion: { min, max, step },
});
const goldenPlan: EatingPlanDraft = {
  summary: "Low-carb weekdays",
  meals: [{ name: "All", items: RAW.map(item) }],
};
// Expected totals computed directly from RAW — the single source of truth.
const expectSum = (sel: (r: Raw) => number, qtyIdx = (r: Raw) => r[2]) =>
  RAW.reduce((s, r) => s + sel(r) * qtyIdx(r), 0);

test("qtyOf: overlay → default quantity → 1 fallback chain", () => {
  const it: PlanItem = { id: "x", name: "x", quantity: 5 };
  expect(qtyOf(it, { x: 9 })).toBe(9); // overlay wins
  expect(qtyOf(it, {})).toBe(5); // default quantity
  expect(qtyOf({ name: "n" }, {})).toBe(1); // no id, no quantity → 1
});

test("planDailyTotals with vs without overlay (golden fixture, computed)", () => {
  const base = planDailyTotals(goldenPlan);
  expect(base.kcal).toBeCloseTo(expectSum((r) => r[6]), 6); // Σ k*qty
  // Override eggs 2→4: kcal grows by exactly 2 × per-egg kcal.
  const over = planDailyTotals(goldenPlan, { eggs: 4 });
  expect(over.kcal).toBeCloseTo(base.kcal + 2 * 95, 6);
});

test("kcalLabel: thousands separator + mandatory ~", () => {
  const tK = planDailyTotals(goldenPlan).kcal;
  expect(kcalLabel(tK)).toBe("~" + Math.round(tK).toLocaleString("en-US"));
  expect(kcalLabel(1756.2)).toBe("~1,756");
});

test("planMicroTotals: live sum equals computed; null when any item lacks micros", () => {
  const m = planMicroTotals(goldenPlan)!;
  expect(m.fiberG).toBeCloseTo(expectSum((r) => r[10]), 6);
  expect(m.sodiumMg).toBeCloseTo(expectSum((r) => r[11]), 6);
  expect(m.ironMg).toBeCloseTo(expectSum((r) => r[12]), 6);
  expect(m.calciumMg).toBeCloseTo(expectSum((r) => r[13]), 6);
  // Chip label rules (handoff §1.3): fiber/iron toFixed(1), sodium/calcium round.
  expect(`Fiber ${m.fiberG.toFixed(1)} g`).toMatch(/^Fiber \d+\.\d g$/);
  const missing: EatingPlanDraft = { summary: "x", meals: [{ name: "m", items: [{ id: "a", name: "a", quantity: 1 }] }] };
  expect(planMicroTotals(missing)).toBeNull();
});

test("barPct: 10% headroom means a bar never reaches 100; zero-macros guard", () => {
  const d = planDailyTotals(goldenPlan);
  for (const g of [d.proteinG, d.carbsG, d.fatG]) expect(barPct(g, d.proteinG, d.carbsG, d.fatG)).toBeLessThan(100);
  // the largest macro maps to round(1/1.1*100) = 91
  const largest = Math.max(d.proteinG, d.carbsG, d.fatG);
  expect(barPct(largest, d.proteinG, d.carbsG, d.fatG)).toBe(91);
  expect(barPct(0, 0, 0, 0)).toBe(0); // || 1 guard, no NaN
});

test("qtyLabel: grams/ml drop the ×, countable units keep it", () => {
  expect(qtyLabel("g", 180)).toBe("180 g");
  expect(qtyLabel("grams", 90)).toBe("90 g");
  expect(qtyLabel("ml", 200)).toBe("200 ml");
  expect(qtyLabel("egg", 2)).toBe("2 × egg");
  expect(qtyLabel("slice", 1)).toBe("1 × slice");
  expect(qtyLabel(undefined, 3)).toBe("3 × unit");
});

test("boundsOf: server bounds win; fallback to portionRange when absent", () => {
  expect(boundsOf(item(RAW[3]!))).toEqual({ min: 0, max: 300, step: 10 }); // chicken server bounds
  expect(boundsOf({ name: "n", quantity: 2 })).toEqual(portionRange(2));
});

test("tint: endpoints and a midpoint (sRGB lerp)", () => {
  expect(tint("#C4704E", 100)).toBe("#C4704E");
  expect(tint("#C4704E", 0)).toBe("#FFFDF7");
  // 50% between C4/70/4E and FF/FD/F7 → round each channel
  expect(tint("#C4704E", 50)).toBe("#E2B7A3");
});

test("pruneOverlayAfterEdit (A5): removed pruned, edited reset, untouched survive", () => {
  const mk = (items: PlanItem[]): EatingPlanDraft => ({ summary: "s", meals: [{ name: "m", items }] });
  const oldDoc = mk([
    { id: "a", name: "A", quantity: 2, unit: "egg" },
    { id: "b", name: "B", quantity: 100, unit: "g" },
    { id: "c", name: "C", quantity: 1, unit: "slice" },
  ]);
  const newDoc = mk([
    { id: "a", name: "A", quantity: 2, unit: "egg" }, // untouched
    { id: "b", name: "B", quantity: 150, unit: "g" }, // quantity changed → reset
    // c removed
  ]);
  const pruned = pruneOverlayAfterEdit(oldDoc, newDoc, { a: 3, b: 120, c: 2 });
  expect(pruned).toEqual({ a: 3 });
});
