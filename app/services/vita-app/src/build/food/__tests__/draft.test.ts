/**
 * APP-121/122/123 — the food builder's pure half: the estimate merge, the inline
 * editor's save, and the conversion to the wire document (handoff v4.2 §2.4, §4).
 */
import { anyK, dayTotal, emptyItems, mealsFromSkel, mealTotal, mergeEstimates, saveEdit, toDraft, type BuildMeal } from "../draft";

const item = (n: string, q: number, k: number | null = null, est = false) => ({ n, q, u: "g", k, est });

const sample = (): BuildMeal[] => [
  { n: "Breakfast", t: "07:00", items: [item("Oats", 60), item("Egg", 2, 160)] },
  { n: "Lunch", t: "12:30", items: [item("Rice", 150)] },
  { n: "Supper", t: "21:30", items: [] },
];

describe("mealsFromSkel", () => {
  it("turns the skeleton into empty, named, timed meals", () => {
    expect(mealsFromSkel(3)).toEqual([
      { n: "Breakfast", t: "07:00", items: [] },
      { n: "Lunch", t: "12:30", items: [] },
      { n: "Dinner", t: "19:30", items: [] },
    ]);
  });
});

describe("totals", () => {
  it("sums what is known and reports 0 (the dash) when nothing is", () => {
    const meals = sample();
    expect(mealTotal(meals[0]!)).toBe(160);
    expect(mealTotal(meals[2]!)).toBe(0);
    expect(dayTotal(meals)).toBe(160);
    expect(anyK(meals)).toBe(true);
    expect(anyK(mealsFromSkel(3))).toBe(false);
  });
});

describe("estimate pass", () => {
  it("only sends the items that are still empty", () => {
    expect(emptyItems(sample())).toEqual([
      { name: "Oats", quantity: 60, unit: "g" },
      { name: "Rice", quantity: 150, unit: "g" },
    ]);
  });

  it("folds the answer back index-aligned and marks each one an estimate", () => {
    const next = mergeEstimates(sample(), [235, 195]);
    expect(next[0]!.items[0]).toEqual({ n: "Oats", q: 60, u: "g", k: 235, est: true });
    expect(next[1]!.items[0]).toEqual({ n: "Rice", q: 150, u: "g", k: 195, est: true });
  });

  it("never overwrites a number the user typed (criterion 11)", () => {
    const next = mergeEstimates(sample(), [235, 195]);
    expect(next[0]!.items[1]).toEqual({ n: "Egg", q: 2, u: "g", k: 160, est: false });
    // Re-running the pass on the result changes nothing at all.
    expect(mergeEstimates(next, [])).toEqual(next);
  });

  it("leaves the dash alone when nothing could answer", () => {
    const next = mergeEstimates(sample(), [null, 195]);
    expect(next[0]!.items[0]!.k).toBeNull();
    expect(next[1]!.items[0]!.k).toBe(195);
  });
});

describe("saveEdit", () => {
  const meals = mergeEstimates(sample(), [235, 195]);

  it("a valid number lands and stops being an estimate (criterion 10)", () => {
    const next = saveEdit(meals, "0-0", "300");
    expect(next[0]!.items[0]).toEqual({ n: "Oats", q: 60, u: "g", k: 300, est: false });
    expect(dayTotal(next)).toBe(300 + 160 + 195);
  });

  it("empty, NaN or negative keeps whatever was there", () => {
    for (const bad of ["", "   ", "abc", "-5"]) expect(saveEdit(meals, "0-0", bad)).toEqual(meals);
  });

  it("a stale key changes nothing", () => {
    expect(saveEdit(meals, "9-9", "300")).toBe(meals);
    expect(saveEdit(meals, "2-0", "300")).toBe(meals); // Supper has no items
  });
});

describe("toDraft", () => {
  it("carries kcal + the estimate mark, and omits the totals it cannot complete", () => {
    const doc = toDraft(mergeEstimates(sample(), [235, null]), "Built here");
    expect(doc.summary).toBe("Built here");
    expect(doc.status).toBe("ready");
    expect(doc.dailyTotals).toBeUndefined(); // Rice is still empty
    expect(doc.meals[0]).toEqual({
      name: "Breakfast",
      time: "07:00",
      kcal: 395,
      items: [
        { name: "Oats", quantity: 60, unit: "g", kcal: 235, kcalEstimated: true },
        { name: "Egg", quantity: 2, unit: "g", kcal: 160 },
      ],
    });
    expect(doc.meals[1]!.kcal).toBeUndefined();
    expect(doc.meals[1]!.items[0]!.kcal).toBeUndefined();
    expect(doc.meals[1]!.items[0]!.kcalEstimated).toBeUndefined();
  });

  it("an empty meal saves as a named slot with no food (contract 0.9.0 minItems 0)", () => {
    const doc = toDraft(sample(), "s");
    expect(doc.meals[2]).toEqual({ name: "Supper", time: "21:30", items: [] });
  });

  it("gives the day a total only once every item has one", () => {
    const doc = toDraft(mergeEstimates(sample(), [235, 195]), "s");
    expect(doc.dailyTotals).toEqual({ kcal: 590 });
  });

  it("a plan with no food at all carries no daily total", () => {
    expect(toDraft(mealsFromSkel(3), "s").dailyTotals).toBeUndefined();
  });
});
