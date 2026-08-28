import type { EatingPlanDraft } from "../../../api/client";
import { fromDoc, itemKcal, mealKcal, newItem, newMeal, projection, toSaveDoc, totalKcal } from "../draft";

/** A parsed-style plan: ids, per-unit nutrition, portion bounds, swaps, A/B options. */
const plan = (): EatingPlanDraft => ({
  summary: "5-meal plan",
  status: "ready",
  note: "up to 2 meals a week may go off-plan",
  meals: [
    {
      id: "m-1",
      name: "Pre-workout",
      time: "06:40",
      kcal: 109,
      items: [
        {
          id: "it-1",
          name: "Banana",
          quantity: 100,
          unit: "g",
          grams: 100,
          nutritionPerUnit: { kcal: 0.89, proteinG: 0.011 },
          portion: { min: 0, max: 200, step: 10 },
          swaps: [{ name: "Pear", quantity: 1, unit: "medium" }],
        },
        { id: "it-2", name: "Honey", quantity: 7, unit: "g", nutritionPerUnit: { kcal: 2.9 } },
      ],
    },
    {
      id: "m-2",
      name: "Lunch",
      time: "12:30",
      usualOptionIndex: 1,
      items: [{ id: "it-3", name: "Base rice", quantity: 100, unit: "g", nutritionPerUnit: { kcal: 1.3 } }],
      options: [
        { name: "Lunch A", items: [{ id: "it-4", name: "Rice", quantity: 100, unit: "g", nutritionPerUnit: { kcal: 1.3 } }] },
        { name: "Lunch B", items: [{ id: "it-5", name: "Pasta", quantity: 80, unit: "g", nutritionPerUnit: { kcal: 1.31 } }] },
      ],
    },
  ],
});

test("the draft is the USUAL composition, priced per item (round each, then sum)", () => {
  const d = fromDoc(plan());
  // Banana 100 × .89 = 89, Honey 7 × 2.9 = 20.3 → 20. Rounded per item = 109, not 109.3.
  expect(d[0]!.items.map(itemKcal)).toEqual([89, 20]);
  expect(mealKcal(d[0]!)).toBe(109);
  // The chosen option (index 1) is what the meal shows — not the base items.
  expect(d[1]!.items.map((i) => i.n)).toEqual(["Pasta"]);
  expect(totalKcal(d)).toBe(109 + 105); // 80 × 1.31 = 104.8 → 105
});

test("nothing edited: the saved doc keeps every item OBJECT and every meal field", () => {
  const doc = plan();
  const saved = toSaveDoc(doc, fromDoc(doc));
  // Item identity — the very same objects, so ids, swaps, per-unit macros and bounds
  // cannot have been reshaped by a round-trip through the editor.
  expect(saved.meals[0]!.items[0]).toBe(doc.meals[0]!.items[0]);
  expect(saved.meals[1]!.options![0]).toBe(doc.meals[1]!.options![0]); // untouched option: same object
  expect(saved.meals[0]).toEqual(doc.meals[0]); // incl. the stated meal kcal
  expect(saved.meals[1]!.usualOptionIndex).toBe(1);
  expect(saved.note).toBe(doc.note); // plan-level fields are the plan's, not this screen's
  expect(projection(fromDoc(doc))).toBe(projection(fromDoc(doc)));
});

test("a changed portion re-prices the item, drops the amount-derived fields, keeps swaps + id", () => {
  const doc = plan();
  const d = fromDoc(doc);
  d[0]!.items[0]!.q = "150";
  expect(itemKcal(d[0]!.items[0]!)).toBe(134); // 150 × .89 = 133.5
  expect(mealKcal(d[0]!)).toBe(154);

  const item = toSaveDoc(doc, d).meals[0]!.items[0]!;
  expect(item.quantity).toBe(150);
  expect(item.id).toBe("it-1");
  expect(item.swaps).toBe(doc.meals[0]!.items[0]!.swaps); // the swap list rides through
  expect(item.nutritionPerUnit).toEqual({ kcal: 0.89, proteinG: 0.011 });
  // Both describe the OLD amount; the server recomputes bounds from quantity on PUT.
  expect(item.portion).toBeUndefined();
  expect(item.grams).toBeUndefined();
  // The meal's stated kcal was a transcription of a composition that just moved.
  expect(toSaveDoc(doc, d).meals[0]!.kcal).toBeUndefined();
  expect(toSaveDoc(doc, d).meals[1]).toEqual(doc.meals[1]); // untouched meal, untouched
});

test("the meal's stated kcal survives a rename and a time move — only composition strips it", () => {
  const doc = plan();
  const d = fromDoc(doc);
  d[0]!.name = "Café da manhã";
  d[0]!.t = "07:10";
  const renamed = toSaveDoc(doc, d).meals[0]!;
  // The plate did not move, so the PDF's transcribed 109 is still true (F3).
  expect(renamed.kcal).toBe(109);
  expect(renamed.name).toBe("Café da manhã");
  expect(renamed.time).toBe("07:10");
  expect(renamed.items[0]).toBe(doc.meals[0]!.items[0]);

  // The other direction: same name, same time, one portion moved → the number goes.
  const e = fromDoc(doc);
  e[0]!.items[1]!.q = "12";
  expect(toSaveDoc(doc, e).meals[0]!.kcal).toBeUndefined();
});

test("an edited option item is written back INTO its option", () => {
  const doc = plan();
  const d = fromDoc(doc);
  d[1]!.items[0]!.q = "160";
  const meal = toSaveDoc(doc, d).meals[1]!;
  expect(meal.options![1]!.items[0]!.quantity).toBe(160);
  expect(meal.options![0]).toBe(doc.meals[1]!.options![0]);
  expect(meal.items).toBe(doc.meals[1]!.items); // the base composition is untouched
});

test("a hand-added food carries its own total, flagged an estimate; a new meal has no id", () => {
  const doc = plan();
  const d = fromDoc(doc);
  d.push(newMeal("New meal", "09:00"));
  d[2]!.items.push(newItem("Yogurt", 170, "g", 120));
  expect(itemKcal(d[2]!.items[0]!)).toBe(120); // per-unit storage re-prices exactly

  const saved = toSaveDoc(doc, d);
  // Sorted at SAVE (never while typing): 06:40 · 09:00 · 12:30.
  expect(saved.meals.map((m) => m.name)).toEqual(["Pre-workout", "New meal", "Lunch"]);
  const added = saved.meals[1]!;
  expect(added.id).toBeUndefined(); // the server stamps m-N / it-N on PUT
  expect(added.items[0]).toEqual({ name: "Yogurt", quantity: 170, unit: "g", kcal: 120, kcalEstimated: true });
});

test("a removed food leaves the rest byte-identical; an empty name falls back to 'Meal'", () => {
  const doc = plan();
  const d = fromDoc(doc);
  d[0]!.items.splice(1, 1); // drop Honey
  d[0]!.name = "   ";
  const meal = toSaveDoc(doc, d).meals[0]!;
  expect(meal.name).toBe("Meal");
  expect(meal.items).toHaveLength(1);
  expect(meal.items[0]).toBe(doc.meals[0]!.items[0]);
});

test("an item under a chosen usual swap is locked: the swap's amount, saved untouched", () => {
  const doc = plan();
  doc.meals[0]!.items[0]!.usualSwapIndex = 0; // "Pear, 1 medium"
  const d = fromDoc(doc);
  expect(d[0]!.items[0]).toMatchObject({ n: "Pear", q: "1", u: "medium", locked: true });
  d[0]!.items[0]!.q = "9"; // even if something did write to it
  expect(toSaveDoc(doc, d).meals[0]!.items[0]).toBe(doc.meals[0]!.items[0]);
});

test("dirty is a structural compare of an src-free projection", () => {
  const doc = plan();
  const snap = projection(fromDoc(doc));
  const d = fromDoc(doc);
  expect(projection(d)).toBe(snap);

  d[0]!.t = "07:00";
  expect(projection(d)).not.toBe(snap);
  d[0]!.t = "06:40";
  expect(projection(d)).toBe(snap); // undoing the edit reads as clean again

  d.push(newMeal("New meal"));
  expect(projection(d)).not.toBe(snap);
});
