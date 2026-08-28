/**
 * APP-121/122/123 — the food builder's pure half: the estimate merge, the inline
 * editor's save, and the conversion to the wire document (handoff v4.2 §2.4, §4).
 */
import {
  anyK,
  fromPlanDoc,
  hasSwapsOrOptions,
  dayTotal,
  emptySlots,
  mealsFromSkel,
  mealTotal,
  mergeEstimates,
  saveEdit,
  toDraft,
  wireTime,
  type BuildMeal,
} from "../draft";

/** The whole pass as the screen runs it: snapshot the empty slots, then merge. */
const merge = (meals: BuildMeal[], values: (number | null)[]) => mergeEstimates(meals, emptySlots(meals), values);

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
  it("only sends the items that are still empty, and remembers where they were", () => {
    expect(emptySlots(sample())).toEqual([
      { mi: 0, ii: 0, item: { name: "Oats", quantity: 60, unit: "g" } },
      { mi: 1, ii: 0, item: { name: "Rice", quantity: 150, unit: "g" } },
    ]);
  });

  it("folds the answer back index-aligned and marks each one an estimate", () => {
    const next = merge(sample(), [235, 195]);
    expect(next[0]!.items[0]).toEqual({ n: "Oats", q: 60, u: "g", k: 235, est: true });
    expect(next[1]!.items[0]).toEqual({ n: "Rice", q: 150, u: "g", k: 195, est: true });
  });

  it("never overwrites a number the user typed (criterion 11)", () => {
    const next = merge(sample(), [235, 195]);
    expect(next[0]!.items[1]).toEqual({ n: "Egg", q: 2, u: "g", k: 160, est: false });
    // Re-running the pass on the result changes nothing at all.
    expect(merge(next, [])).toEqual(next);
  });

  it("leaves the dash alone when nothing could answer", () => {
    const next = merge(sample(), [null, 195]);
    expect(next[0]!.items[0]!.k).toBeNull();
    expect(next[1]!.items[0]!.k).toBe(195);
  });

  // MAJOR-1: the list is editable while the pass is in flight. Whatever moved
  // under the snapshot loses its estimate rather than taking someone else's.
  describe("the list changed mid-flight", () => {
    it("an item inserted ahead of the snapshot does not shift the answers", () => {
      const before = sample();
      const slots = emptySlots(before); // [Oats 0-0, Rice 1-0]
      const after = before.map((m, i) => (i === 0 ? { ...m, items: [item("Coffee", 1), ...m.items] } : m));
      const next = mergeEstimates(after, slots, [235, 195]);
      expect(next[0]!.items[0]).toEqual(item("Coffee", 1)); // untouched — not Oats' 235
      expect(next[0]!.items[1]!.k).toBeNull(); // Oats moved: no estimate at all
      expect(next[1]!.items[0]!.k).toBe(195); // Rice never moved
    });

    it("an item removed mid-flight drops its answer instead of sliding it up", () => {
      const before = sample();
      const slots = emptySlots(before);
      const after = before.map((m, i) => (i === 0 ? { ...m, items: m.items.slice(1) } : m)); // Oats gone
      const next = mergeEstimates(after, slots, [235, 195]);
      expect(next[0]!.items[0]).toEqual(item("Egg", 2, 160)); // the typed number survives
      expect(next[1]!.items[0]!.k).toBe(195);
    });

    it("a number typed mid-flight is never overwritten", () => {
      const before = sample();
      const slots = emptySlots(before);
      const after = saveEdit(before, "0-0", "400");
      expect(mergeEstimates(after, slots, [235, 195])[0]!.items[0]).toEqual(item("Oats", 60, 400));
    });
  });
});

describe("saveEdit", () => {
  const meals = merge(sample(), [235, 195]);

  it("a valid number lands and stops being an estimate (criterion 10)", () => {
    const next = saveEdit(meals, "0-0", "300");
    expect(next[0]!.items[0]).toEqual({ n: "Oats", q: 60, u: "g", k: 300, est: false });
    expect(dayTotal(next)).toBe(300 + 160 + 195);
  });

  it("empty, NaN or negative keeps whatever was there", () => {
    for (const bad of ["", "   ", "abc", "-5"]) expect(saveEdit(meals, "0-0", bad)).toEqual(meals);
  });

  // MINOR-7: a PT-BR keyboard types the decimal key as a comma.
  it("takes a decimal comma", () => {
    expect(saveEdit(meals, "0-0", "300,4")[0]!.items[0]!.k).toBe(300);
  });

  it("a stale key changes nothing", () => {
    expect(saveEdit(meals, "9-9", "300")).toBe(meals);
    expect(saveEdit(meals, "2-0", "300")).toBe(meals); // Supper has no items
  });
});

// MAJOR-3: the meal time is a free text field; the contract wants HH:MM exactly.
describe("wireTime", () => {
  it("pads a single-digit hour and ignores whitespace", () => {
    expect(wireTime("7:00")).toBe("07:00");
    expect(wireTime("  12:30 ")).toBe("12:30");
    expect(wireTime("23:59")).toBe("23:59");
    expect(wireTime("00:00")).toBe("00:00");
  });

  it("drops anything that is not a time of day", () => {
    for (const bad of ["", "morning", "7", "7h", "24:00", "25:10", "12:60", "12:5", "7:00 pm"]) {
      expect(wireTime(bad)).toBeUndefined();
    }
  });

  it("a meal whose time makes no sense saves with no time at all", () => {
    const meals: BuildMeal[] = [{ n: "Breakfast", t: "whenever", items: [] }, { n: "Lunch", t: "7:00", items: [] }];
    const doc = toDraft(meals, "s");
    expect(doc.meals[0]).toEqual({ name: "Breakfast", items: [] });
    expect(doc.meals[1]!.time).toBe("07:00");
  });
});

describe("toDraft", () => {
  it("carries kcal + the estimate mark, and omits the totals it cannot complete", () => {
    const doc = toDraft(merge(sample(), [235, null]), "Built here");
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
    const doc = toDraft(merge(sample(), [235, 195]), "s");
    expect(doc.dailyTotals).toEqual({ kcal: 590 });
  });

  it("a plan with no food at all carries no daily total", () => {
    expect(toDraft(mealsFromSkel(3), "s").dailyTotals).toBeUndefined();
  });
});

/**
 * APP-138 — the way back in: a saved plan becomes the same draft a fresh build
 * types out. What the builder cannot hold is dropped here, deterministically.
 */
describe("fromPlanDoc", () => {
  it("round-trips a plan the builder itself made", () => {
    const doc = toDraft(merge(sample(), [235, 195]), "My plan");
    expect(toDraft(fromPlanDoc(doc), "My plan")).toEqual(doc);
  });

  it("keeps a stated total verbatim and prices a per-unit item as an estimate", () => {
    const meals = fromPlanDoc({
      summary: "s",
      meals: [
        {
          name: "Breakfast",
          time: "08:00",
          items: [
            { id: "it-1", name: "Oats", quantity: 60, unit: "g", kcal: 235, kcalEstimated: true },
            { id: "it-2", name: "Egg", quantity: 2, unit: "unit", kcal: 160 },
            { id: "it-3", name: "Rice", quantity: 100, unit: "g", nutritionPerUnit: { kcal: 1.3, proteinG: 0.03 } },
            { id: "it-4", name: "Salad", unit: "à vontade" },
          ],
        },
      ],
    });
    expect(meals).toEqual([
      {
        n: "Breakfast",
        t: "08:00",
        items: [
          { n: "Oats", q: 60, u: "g", k: 235, est: true },
          { n: "Egg", q: 2, u: "unit", k: 160, est: false },
          // 1.3 × 100 — derived here, so it wears the mark
          { n: "Rice", q: 100, u: "g", k: 130, est: true },
          // nothing to price and no quantity: empty, never a zero
          { n: "Salad", q: 0, u: "à vontade", k: null, est: false },
        ],
      },
    ]);
  });

  it("drops what the builder cannot hold: the usual option/swap wins, the rest goes", () => {
    const doc = {
      summary: "Nutri",
      note: "up to 2 meals a week off-plan",
      hydration: { mlPerDay: 2500 },
      meals: [
        {
          name: "Lunch",
          items: [{ name: "Rice", quantity: 100, unit: "g", kcal: 130, swaps: [{ name: "Pasta", quantity: 80, unit: "g" }], usualSwapIndex: 0 }],
          options: [{ name: "Brunch", items: [{ name: "Toast", quantity: 2, unit: "slice", kcal: 180 }] }],
          usualOptionIndex: 0,
        },
      ],
    };
    expect(hasSwapsOrOptions(doc)).toBe(true);
    // The usual composition is the option — that is what this person actually eats.
    expect(fromPlanDoc(doc)).toEqual([{ n: "Lunch", t: "", items: [{ n: "Toast", q: 2, u: "slice", k: 180, est: false }] }]);

    // Without the option pick, the item's usual SWAP is folded in as the item.
    const noOption = { ...doc, meals: [{ ...doc.meals[0]!, options: undefined, usualOptionIndex: undefined }] };
    // Contract equivalence: 80 g of pasta stands in for the whole 130 kcal item —
    // derived, so it comes back marked an estimate.
    expect(fromPlanDoc(noOption)[0]!.items).toEqual([{ n: "Pasta", q: 80, u: "g", k: 130, est: true }]);

    // Saving it back keeps the food and the numbers, and nothing else.
    expect(toDraft(fromPlanDoc(doc), doc.summary)).toEqual({
      summary: "Nutri",
      status: "ready",
      dailyTotals: { kcal: 180 },
      meals: [{ name: "Lunch", kcal: 180, items: [{ name: "Toast", quantity: 2, unit: "slice", kcal: 180 }] }],
    });
  });

  it("says nothing is lost for a plain plan", () => {
    expect(hasSwapsOrOptions(toDraft(sample(), "s"))).toBe(false);
  });
});
