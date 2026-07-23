import type { EatingPlanDraft, MealDetail, WaterDetail, WorkoutDetail } from "../client";
import { jobIdFromDetail } from "../client";
import { allPlanItems } from "../../plan/compute";
import { anchorTime, createMockApi, handoffPlanV3, mockParse } from "../mock";

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
  expect(detail.muscles).toEqual(["quads", "glutes", "hamstrings", "calves", "core"]);
  expect(detail.durationMin).toBe(60);
  // v0.6.0: leg-day exercises carry per-exercise muscleRoles for the body map.
  expect(detail.exercises?.[0]?.muscleRoles).toContainEqual({ name: "quads", role: "primary" });
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

// ── v3 fixture + async parse + updatePlan (APP-082 / APP-092 #1) ──────────────

test("v3 fixture: 5 meals, options, a >5-swap item, hydration + 4 supplements", () => {
  const p = handoffPlanV3();
  expect(p.meals).toHaveLength(5);
  expect(p.meals[2]!.options).toHaveLength(1); // Lunch: base + 1 option = 2 compositions
  expect(p.meals[4]!.options).toHaveLength(3); // Dinner: base + 3 = 4 compositions
  expect(p.meals[0]!.items[0]!.swaps!.length).toBeGreaterThan(5); // Banana → "+N more" sheet
  expect(p.hydration!.mlPerDay).toBe(2500);
  expect(p.supplements).toHaveLength(4);
  expect(p.status).toBe("ready");
});

test("async parse: start → job done → GET /plan arrives status review", async () => {
  const api = createMockApi();
  const { jobId } = await api.startEatingPlanImport({ text: "my nutritionist plan" });
  expect(jobId).toBeTruthy();
  const job = await api.getEatingPlanJob(jobId);
  expect(job.state).toBe("done");
  const plan = await api.getPlan();
  expect(plan.status).toBe("review");
  expect(plan.meals).toHaveLength(5);
  expect(plan.meals[0]!.items.every((it) => it.id != null)).toBe(true);
});

test("updatePlan assigns ids to new items and prunes the changed item's portion", async () => {
  const api = createMockApi();
  const plan = await api.getPlan();
  const first = plan.meals[0]!.items[0]!;
  await api.putPlanPortions({ [first.id!]: 2 }); // override on the first item
  // edit: change that item's quantity + append a brand-new (id-less) item
  const edited: EatingPlanDraft = {
    ...plan,
    meals: plan.meals.map((m, mi) => (mi === 0 ? { ...m, items: [{ ...first, quantity: (first.quantity ?? 0) + 5 }, { name: "New item", quantity: 1, unit: "g" }] } : m)),
  };
  const res = await api.updatePlan(edited);
  expect(res.meals[0]!.items.every((it) => it.id != null)).toBe(true); // new item got an id
  const newIds = res.meals[0]!.items.map((i) => i.id);
  expect(new Set(newIds).size).toBe(newIds.length); // unique
  const after = await api.getPlan();
  expect(after.portions).toEqual({}); // qty changed → its override pruned
});

test("putPlanPortions accepts an OPTION item's id, and updatePlan ids don't collide with option ids (#1)", async () => {
  const api = createMockApi();
  const plan = await api.getPlan();
  // an option item id (Lunch's "Brunch" option) — must NOT be rejected as unknown
  const optId = plan.meals[2]!.options![0]!.items[0]!.id!;
  await api.putPlanPortions({ [optId]: 3 });
  expect((await api.getPlan()).portions).toEqual({ [optId]: 3 });

  // append a brand-new (id-less) item; its stamped id must be globally unique — the
  // counter runs past the max ACROSS base + options, not just base (or it'd reuse an
  // option id like "it-16" that already exists).
  const edited: EatingPlanDraft = {
    ...plan,
    meals: plan.meals.map((m, i) => (i === 0 ? { ...m, items: [...m.items, { name: "New", quantity: 1, unit: "g" }] } : m)),
  };
  const res = await api.updatePlan(edited);
  const ids = allPlanItems(res).map((it) => it.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("jobIdFromDetail: pulls the running jobId out of a 409 detail (#4)", () => {
  expect(jobIdFromDetail("An import is already running: 123e4567-e89b-12d3-a456-426614174000")).toBe(
    "123e4567-e89b-12d3-a456-426614174000",
  );
  expect(jobIdFromDetail("already running job abc-123")).toBe("abc-123");
  expect(jobIdFromDetail(undefined)).toBeNull();
  expect(jobIdFromDetail("")).toBeNull();
});
