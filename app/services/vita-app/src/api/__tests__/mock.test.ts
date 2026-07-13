import type { MealDetail, WaterDetail, WorkoutDetail } from "../client";
import { anchorTime, mockParse } from "../mock";

test("banana + peanuts phrase → one meal draft with items and totals", () => {
  const { drafts } = mockParse("Had a banana and a handful of peanuts around 4");
  expect(drafts).toHaveLength(1);
  const meal = drafts[0]!;
  expect(meal.type).toBe("meal");
  expect(meal.isEstimate).toBe(true);
  expect(meal.sourcePhrase).toBe("Had a banana and a handful of peanuts around 4");
  const detail = meal.detail as MealDetail;
  expect(detail.items.map((i) => i.name)).toEqual(["Banana", "Peanuts"]);
  expect(detail.totals!.kcal).toBe(265);
});

test("sandwich and a big glass of water → two drafts (meal + water)", () => {
  const { drafts } = mockParse("had a sandwich and a big glass of water");
  expect(drafts.map((d) => d.type).sort()).toEqual(["meal", "water"]);
  const water = drafts.find((d) => d.type === "water")!;
  expect((water.detail as WaterDetail).amountMl).toBe(400);
});

test("explicit ml is not an estimate", () => {
  const { drafts } = mockParse("500 ml of water");
  expect(drafts[0]!.isEstimate).toBe(false);
  expect((drafts[0]!.detail as WaterDetail).amountMl).toBe(500);
});

test("leg day → workout draft with contract-enum muscles", () => {
  const { drafts } = mockParse("leg day at the gym, 60 min");
  const workout = drafts.find((d) => d.type === "workout")!;
  const detail = workout.detail as WorkoutDetail;
  expect(detail.muscles).toEqual(["quads", "hamstrings", "glutes", "calves"]);
  expect(detail.durationMin).toBe(60);
});

test("unrecognized text still yields a labeled meal estimate (never empty)", () => {
  const { drafts } = mockParse("something inscrutable");
  expect(drafts).toHaveLength(1);
  expect(drafts[0]!.isEstimate).toBe(true);
});

test("anchorTime resolves 'around 4' to 16:00 when captured in the evening", () => {
  const captured = new Date();
  captured.setHours(18, 30, 0, 0);
  const t = new Date(anchorTime("around 4", captured.toISOString()));
  expect(t.getHours()).toBe(16);
});
