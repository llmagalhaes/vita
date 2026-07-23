/**
 * In-process mock of the Vita API (APP-006, M1 "walkable app").
 * ponytail: chosen over MSW — one typed fake serves Expo Go and Jest with zero
 * interceptor machinery; swap to MSW only if we ever need to exercise the real
 * fetch stack. Active when no VITA_API_BASE_URL is configured.
 *
 * Parse is deterministic keyword-matching so the CEO can demo capture offline.
 * Every numeric value is an estimate and flagged isEstimate: true.
 */
import { pruneOverlayAfterEdit } from "../plan/compute";
import { uuid } from "../lib/uuid";
import {
  ApiError,
  type Api,
  type EatingPlanDraft,
  type Exercise,
  type LogEntry,
  type NewEntry,
  type ParseResult,
  type PlanItem,
  type PortionsMap,
  type TokenPair,
  type TrainingProgramDraft,
  type User,
  type VacationRange,
} from "./client";

const LATENCY_MS = 700; // long enough to see "Making sense of it…"
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// name → per-unit estimate. Small on purpose; unknown food falls back below.
const FOODS: Record<string, { kcal: number; p: number; c: number; f: number }> = {
  banana: { kcal: 105, p: 1.3, c: 27, f: 0.4 },
  peanuts: { kcal: 160, p: 7, c: 5, f: 14 },
  egg: { kcal: 78, p: 6.3, c: 0.6, f: 5.3 },
  eggs: { kcal: 156, p: 12.6, c: 1.2, f: 10.6 },
  bread: { kcal: 145, p: 4, c: 27, f: 2 },
  toast: { kcal: 145, p: 4, c: 27, f: 2 },
  latte: { kcal: 110, p: 6.6, c: 10, f: 3.6 },
  coffee: { kcal: 5, p: 0.3, c: 0, f: 0 },
  chicken: { kcal: 300, p: 56, c: 0, f: 6.5 },
  rice: { kcal: 210, p: 7, c: 42, f: 1.2 },
  salad: { kcal: 110, p: 1.2, c: 5, f: 9 },
  yogurt: { kcal: 100, p: 10, c: 8, f: 2.5 },
  granola: { kcal: 140, p: 4.8, c: 25, f: 4.2 },
  sandwich: { kcal: 350, p: 15, c: 40, f: 14 },
  apple: { kcal: 95, p: 0.5, c: 25, f: 0.3 },
  salmon: { kcal: 296, p: 40, c: 0, f: 14 },
  pasta: { kcal: 390, p: 14, c: 76, f: 2.3 },
  pizza: { kcal: 570, p: 24, c: 64, f: 24 },
  soup: { kcal: 170, p: 8, c: 20, f: 6 },
};

/**
 * Leg-day exercises with per-exercise `muscleRoles` (handoff §2.2) so the mock
 * workout demonstrates the body-map opacity + PRIMARY/SECONDARY banner. The
 * muscleRoles opacity rule (DESIGN-SPEC §6.1) reproduces quads/glutes .92,
 * hams .78; calves/core deviate from the handoff's hand-tuned values (A9).
 */
const LEG_DAY_EXERCISES: Exercise[] = [
  { name: "Back squat", sets: 4, reps: 8, loadKg: 80, muscleRoles: [{ name: "quads", role: "primary" }, { name: "glutes", role: "primary" }, { name: "core", role: "secondary" }] },
  { name: "Leg press", sets: 3, reps: 12, muscleRoles: [{ name: "quads", role: "primary" }] },
  { name: "Romanian deadlift", sets: 3, reps: 10, loadKg: 60, muscleRoles: [{ name: "glutes", role: "primary" }, { name: "hamstrings", role: "primary" }] },
  { name: "Walking lunges", sets: 2, reps: 20, muscleRoles: [{ name: "quads", role: "primary" }, { name: "glutes", role: "primary" }, { name: "core", role: "secondary" }] },
  { name: "Seated calf raise", sets: 4, reps: 15, muscleRoles: [{ name: "calves", role: "secondary" }] },
  { name: "Leg curl", sets: 3, reps: 12, muscleRoles: [{ name: "hamstrings", role: "primary" }] },
];

const WORKOUTS: Record<string, { title: string; muscles: NonNullable<import("./client").WorkoutDetail["muscles"]>; exercises?: Exercise[] }> = {
  "leg day": { title: "Leg day", muscles: ["quads", "glutes", "hamstrings", "calves", "core"], exercises: LEG_DAY_EXERCISES },
  legs: { title: "Leg day", muscles: ["quads", "glutes", "hamstrings", "calves", "core"], exercises: LEG_DAY_EXERCISES },
  push: { title: "Push day", muscles: ["chest", "shoulders", "triceps"] },
  pull: { title: "Pull day", muscles: ["back", "biceps", "forearms"] },
  run: { title: "Run", muscles: ["quads", "hamstrings", "calves"] },
  ran: { title: "Run", muscles: ["quads", "hamstrings", "calves"] },
  swim: { title: "Swim", muscles: ["back", "shoulders", "core"] },
  yoga: { title: "Yoga", muscles: ["core"] },
  walk: { title: "Walk", muscles: ["quads", "calves"] },
  gym: { title: "Gym session", muscles: ["chest", "back", "core"] },
  workout: { title: "Workout", muscles: ["core"] },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "around 4", "at 16:30", "at 7am" → today at that time; else fallback. */
export function anchorTime(text: string, fallbackIso: string): string {
  const m = text.match(/(?:around|at|about|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?/i);
  const base = new Date(fallbackIso);
  if (!m) return base.toISOString();
  let hour = parseInt(m[1]!, 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  // Bare "around 4": pick the most recent occurrence (4 pm if it's past 4 pm).
  if (!suffix && hour <= 12 && base.getHours() >= hour + 12) hour += 12;
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function mockParse(text: string, capturedAt?: string): ParseResult {
  const lower = text.toLowerCase();
  const occurredAt = anchorTime(lower, capturedAt ?? new Date().toISOString());
  const drafts: NewEntry[] = [];

  // Water — a number of ml wins; "glass"/"bottle" are estimated sizes.
  const ml = lower.match(/(\d+)\s*ml/);
  if (ml || /\bwater\b|\bglass\b|\bbottle\b/.test(lower)) {
    const amountMl = ml
      ? parseInt(ml[1]!, 10)
      : /bottle/.test(lower)
        ? 500
        : /big|large/.test(lower)
          ? 400
          : 250;
    drafts.push({
      type: "water",
      occurredAt,
      inputMethod: "text",
      sourcePhrase: text,
      isEstimate: !ml,
      detail: { amountMl },
    });
  }

  // Manual energy spent (D8): "burned 300", "spent 450 kcal" → a workout entry
  // with only kcal (no exercises). Same shape the manual add on Home writes.
  const burned = lower.match(/(?:burn(?:ed|t)?|spent)\s+(\d{1,5})/);
  if (burned) {
    drafts.push({
      type: "workout",
      occurredAt,
      inputMethod: "text",
      sourcePhrase: text,
      isEstimate: true,
      detail: { title: "Energy", kcal: parseInt(burned[1]!, 10), exercises: [] },
    });
  }

  // Workout
  const workoutKey = Object.keys(WORKOUTS).find((k) => lower.includes(k));
  if (workoutKey) {
    const w = WORKOUTS[workoutKey]!;
    const dur = lower.match(/(\d+)\s*(?:min|minutes)/);
    drafts.push({
      type: "workout",
      occurredAt,
      inputMethod: "text",
      sourcePhrase: text,
      isEstimate: true,
      detail: {
        title: w.title,
        durationMin: dur ? parseInt(dur[1]!, 10) : 45,
        kcal: dur ? parseInt(dur[1]!, 10) * 7 : 315,
        muscles: w.muscles,
        exercises: w.exercises ?? [],
      },
    });
  }

  // Meal
  const foods = Object.keys(FOODS).filter((k) => new RegExp(`\\b${k}`).test(lower));
  if (foods.length > 0) {
    const items = foods.map((name) => ({
      name: cap(name),
      quantity: 1,
      unit: name === "peanuts" ? "handful" : name === "latte" || name === "coffee" ? "cup" : "portion",
      kcal: FOODS[name]!.kcal,
      proteinG: FOODS[name]!.p,
      carbsG: FOODS[name]!.c,
      fatG: FOODS[name]!.f,
      micros:
        name === "banana"
          ? [
              { name: "Potassium", amount: 422, unit: "mg", percentDaily: 9 },
              { name: "Vitamin B6", amount: 0.4, unit: "mg", percentDaily: 24 },
            ]
          : [],
    }));
    const totals = items.reduce(
      (t, i) => ({
        kcal: t.kcal + i.kcal,
        proteinG: (t.proteinG ?? 0) + (i.proteinG ?? 0),
        carbsG: (t.carbsG ?? 0) + (i.carbsG ?? 0),
        fatG: (t.fatG ?? 0) + (i.fatG ?? 0),
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
    drafts.push({
      type: "meal",
      occurredAt,
      inputMethod: "text",
      sourcePhrase: text,
      isEstimate: true,
      detail: { title: items.map((i) => i.name).join(" & "), items, totals },
    });
  }

  // Nothing recognized → generic meal estimate (mock never 422s; real backend may).
  if (drafts.length === 0) {
    drafts.push({
      type: "meal",
      occurredAt,
      inputMethod: "text",
      sourcePhrase: text,
      isEstimate: true,
      detail: {
        title: cap(text.slice(0, 40)),
        items: [{ name: cap(text.slice(0, 40)), kcal: 350, proteinG: 12, carbsG: 40, fatG: 15 }],
        totals: { kcal: 350, proteinG: 12, carbsG: 40, fatG: 15 },
      },
    });
  }

  return { drafts: drafts.slice(0, 5) }; // contract: maxItems 5
}

/**
 * Canned photo parse (BE-018 not live yet). A plate photo → meal draft with a
 * few items so the quantity steppers are demoable; a caption hinting at the gym
 * → workout (whiteboard) draft. Real backend returns the same ParseResult shape.
 */
export function mockPhotoParse(caption?: string, capturedAt?: string): ParseResult {
  const occurredAt = capturedAt ?? new Date().toISOString();
  const isWorkout = !!caption && /\b(gym|workout|whiteboard|wod|lift|training)\b/i.test(caption);
  if (isWorkout) {
    return {
      drafts: [
        {
          type: "workout",
          occurredAt,
          inputMethod: "photo",
          sourcePhrase: caption,
          isEstimate: true,
          detail: {
            title: "Whiteboard session",
            durationMin: 45,
            kcal: 320,
            muscles: ["chest", "shoulders", "triceps", "core"],
            exercises: [
              { name: "Back squat", sets: 5, reps: 5 },
              { name: "Bench press", sets: 5, reps: 5 },
              { name: "Pull-ups", sets: 3, reps: 10 },
            ],
          },
        },
      ],
    };
  }
  const items = [
    { name: "Chicken", quantity: 1, unit: "portion", kcal: 300, proteinG: 56, carbsG: 0, fatG: 6.5 },
    { name: "Rice", quantity: 1, unit: "cup", kcal: 210, proteinG: 7, carbsG: 42, fatG: 1.2 },
    { name: "Salad", quantity: 1, unit: "bowl", kcal: 110, proteinG: 1.2, carbsG: 5, fatG: 9 },
  ];
  return {
    drafts: [
      {
        type: "meal",
        occurredAt,
        inputMethod: "photo",
        sourcePhrase: caption,
        isEstimate: true,
        detail: { title: "Chicken, rice & salad", items, totals: mockPhotoTotals(items) },
      },
    ],
  };
}

const mockPhotoTotals = (items: { kcal: number; proteinG: number; carbsG: number; fatG: number }[]) =>
  items.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      proteinG: t.proteinG + i.proteinG,
      carbsG: t.carbsG + i.carbsG,
      fatG: t.fatG + i.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

/**
 * Canned plan/program parse (BE-019/020 not live yet). Real backend returns the
 * same draft shape. Items carry `nutritionPerUnit` so the Eating Plan screen's
 * portion slider recomputes totals as quantity × per-unit locally.
 */
export function mockParsePlan(text?: string): EatingPlanDraft {
  return {
    summary:
      (text?.trim().slice(0, 200) || "Low-carb weekdays, flexible weekends") +
      " — read back as a simple daily plan.",
    status: "review", // parse drafts arrive unreviewed (v3)
    micros: [
      { name: "Fiber", amount: 28, unit: "g", percentDaily: 100 },
      { name: "Potassium", amount: 3200, unit: "mg", percentDaily: 68 },
      { name: "Iron", amount: 14, unit: "mg", percentDaily: 78 },
    ],
    meals: [
      {
        name: "Breakfast",
        time: "08:00",
        items: [
          { name: "Greek yogurt", quantity: 200, unit: "g", nutritionPerUnit: { kcal: 0.59, proteinG: 0.1, carbsG: 0.036, fatG: 0.005 } },
          { name: "Berries", quantity: 80, unit: "g", nutritionPerUnit: { kcal: 0.5, proteinG: 0.007, carbsG: 0.12, fatG: 0.003 } },
        ],
      },
      {
        name: "Lunch",
        time: "13:00",
        items: [
          { name: "Chicken breast", quantity: 150, unit: "g", nutritionPerUnit: { kcal: 1.65, proteinG: 0.31, carbsG: 0, fatG: 0.036 } },
          { name: "Mixed salad", quantity: 1, unit: "bowl", nutritionPerUnit: { kcal: 110, proteinG: 3, carbsG: 9, fatG: 6 } },
        ],
      },
      {
        name: "Dinner",
        time: "19:30",
        items: [
          { name: "Salmon", quantity: 140, unit: "g", nutritionPerUnit: { kcal: 2.08, proteinG: 0.2, carbsG: 0, fatG: 0.13 } },
          { name: "Broccoli", quantity: 150, unit: "g", nutritionPerUnit: { kcal: 0.34, proteinG: 0.028, carbsG: 0.07, fatG: 0.004 } },
        ],
      },
    ],
  };
}


// ─── v3 fixture (APP-082) ────────────────────────────────────────────────────
// The prototype's `importedPlan` in contract shape: 5 meals (Pre-workout /
// Post-workout / Lunch [2 compositions] / Snack / Dinner [4 compositions]), full
// swap lists (Banana carries 20 so the "+N more" SwapSheet is exercisable in
// mock mode), hydration, 4 supplements, the report-page dailyTotals. **A4: EXAMPLE
// data** — every per-unit number is illustrative; no product/test code treats one
// as a constant (asserts compute from the fixture).
type Sw = { name: string; quantity?: number; unit?: string; grams?: number };
const sw = (name: string, quantity?: number, unit?: string, grams?: number): Sw => ({
  name,
  ...(quantity != null ? { quantity } : {}),
  ...(unit ? { unit } : {}),
  ...(grams != null ? { grams } : {}),
});

const v3Item = (
  id: string,
  name: string,
  quantity: number,
  unit: string,
  grams: number | undefined,
  per: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  swaps: Sw[] = [],
): PlanItem => ({
  id,
  name,
  quantity,
  unit,
  ...(grams != null ? { grams } : {}),
  nutritionPerUnit: per,
  portion: { min: 0, max: Math.max(quantity * 2, quantity + 2), step: unit === "g" || unit === "ml" ? 10 : 1 },
  swaps,
});

const BANANA_SWAPS: Sw[] = [
  sw("Pineapple", 2, "medium slices", 150), sw("Grapes", 20, "units", 160), sw("Pear", 1, "medium", 150),
  sw("Strawberries", 13, "units", 150), sw("Mango", 0.5, "large"), sw("Apple", 1, "medium", 155),
  sw("Orange", 1, "medium", 180), sw("Kiwi", 2, "medium", 152), sw("Plum", 3, "small", 150),
  sw("Tangerine", 2, "small", 200), sw("Blueberries", 9, "tbsp"), sw("Watermelon", 2, "slices", 300),
  sw("Melon", 1, "slice", 200), sw("Papaya", 1, "cup", 140), sw("Peach", 2, "medium", 300),
  sw("Fig", 3, "units", 150), sw("Cherries", 20, "units", 140), sw("Raspberries", 1, "cup", 125),
  sw("Apricot", 4, "units", 140), sw("Guava", 1, "medium", 165),
];

/**
 * Seeded stored eating plan for the v3 mock — a READY plan so the Eating Plan and
 * Today screens are walkable offline. The async parse mock produces the same shape
 * with status "review" for the setup flow. Ids present (a saved plan always has them).
 */
export function handoffPlanV3(): EatingPlanDraft {
  const per = (k: number, p: number, c: number, f: number) => ({ kcal: k, proteinG: p, carbsG: c, fatG: f });
  return {
    summary: "5-meal plan · pre-workout to dinner, with swaps, hydration and supplements",
    status: "ready",
    note: "Up to 2 meals a week can go off-plan — your nutritionist built that in. Plan valid for up to 6 months.",
    dailyTotals: { kcal: 1716, proteinG: 188.6, carbsG: 153.4, fatG: 47.9 },
    micros: [
      { name: "Fiber", amount: 31, unit: "g", percentDaily: 100 },
      { name: "Iron", amount: 15, unit: "mg", percentDaily: 83 },
      { name: "Calcium", amount: 980, unit: "mg", percentDaily: 98 },
    ],
    hydration: { mlPerDay: 2500 },
    supplements: [
      { name: "Creatine monohydrate", dose: "4g (1 dose) + 200ml water", timing: "once a day, any time", duration: "5 months" },
      { name: "Omega-3 (330mg EPA / 220mg DHA)", dose: "1 capsule 1g", timing: "once a day, with lunch or dinner" },
      { name: "Vitamin D — cholecalciferol", dose: "1 capsule 10µg", timing: "once a day, with lunch or dinner", duration: "5 months" },
      { name: "Magnesium glycinate", dose: "1 dose", timing: "at night, before bed" },
    ],
    meals: [
      {
        name: "Pre-workout", time: "06:40", kcal: 109, note: "A big glass of water when you wake up.",
        items: [v3Item("it-1", "Banana", 1, "unit", 100, per(89, 1.1, 23, 0.3), BANANA_SWAPS)],
      },
      {
        name: "Post-workout", time: "08:30", kcal: 121, note: "A pinch of cinnamon or pure cacao — optional.",
        items: [v3Item("it-2", "Whey protein, concentrate", 1, "scoop", 30, per(120, 24, 3, 1.5), [])],
      },
      {
        name: "Lunch", time: "13:00", kcal: 702, note: "Vary vegetables and preparation as you like — herbs, lemon and spices to taste.",
        items: [
          v3Item("it-3", "Steamed corn", 200, "g", 200, per(0.86, 0.032, 0.19, 0.012), [
            sw("White rice, cooked", 150, "g", 150), sw("Brown rice, cooked", 180, "g", 180),
            sw("Sweet potato, boiled", 210, "g", 210), sw("Beans or lentils", 185, "g", 185),
            sw("Quinoa, cooked", 170, "g", 170), sw("Potato, boiled", 220, "g", 220), sw("Pasta, cooked", 160, "g", 160),
          ]),
          v3Item("it-4", "Shredded chicken", 200, "g", 200, per(1.65, 0.31, 0, 0.036), [
            sw("Lean beef", 133, "g", 133), sw("Grilled pork loin", 208, "g", 208), sw("Grilled chicken breast", 2, "fillets", 200),
          ]),
          v3Item("it-5", "Olive oil", 1, "level tsp", 2, per(40, 0, 0, 4.5), []),
          v3Item("it-6", "Leafy greens", 2, "servings", 30, per(6, 0.5, 1, 0.1), [
            sw("Lettuce", undefined, "as much as you like"), sw("Arugula", undefined, "as much as you like"), sw("Spinach, sautéed", 25, "g", 25),
          ]),
        ],
        options: [
          {
            name: "Brunch", kcal: 679,
            items: [
              v3Item("it-7", "Whole-grain bread", 2, "slices", 70, per(1.1, 0.045, 0.2, 0.017), []),
              v3Item("it-8", "Cottage cheese", 2, "heaped tbsp", 80, per(0.98, 0.11, 0.034, 0.043), [
                sw("Ricotta", 47, "g", 47), sw("Light cream cheese", 40, "g", 40), sw("Hummus", 33, "g", 33),
              ]),
              v3Item("it-9", "Eggs — boiled, poached or scrambled", 4, "medium", 220, per(78, 6.3, 0.6, 5.3), [
                sw("Shredded chicken", 200, "g", 200),
              ]),
              v3Item("it-10", "Arugula or leafy greens", 25, "g", 25, per(0.25, 0.026, 0.036, 0.004), [
                sw("Lettuce", undefined, "as much as you like"), sw("Spinach, sautéed", 25, "g", 25),
              ]),
            ],
          },
        ],
      },
      {
        name: "Snack", time: "16:30", kcal: 72, note: "Swap the fruit freely — any option from the fruit group.",
        items: [
          v3Item("it-11", "Green apple", 1, "unit", 150, per(72, 0.4, 19, 0.2), [
            sw("Banana", 1, "medium", 100), sw("Kiwi", 2, "medium", 152), sw("Orange", 1, "medium", 180),
            sw("Blueberries", 9, "tbsp"), sw("Pear", 1, "medium", 150),
          ]),
        ],
      },
      {
        name: "Dinner", time: "20:00", kcal: 702, note: "Up to 2 meals a week can go off-plan — your nutritionist built that in.",
        items: [
          v3Item("it-12", "Steamed corn", 200, "g", 200, per(0.86, 0.032, 0.19, 0.012), [
            sw("White rice, cooked", 150, "g", 150), sw("Brown rice, cooked", 180, "g", 180), sw("Sweet potato, boiled", 210, "g", 210),
          ]),
          v3Item("it-13", "Shredded chicken", 200, "g", 200, per(1.65, 0.31, 0, 0.036), [
            sw("Lean beef", 133, "g", 133), sw("Grilled chicken breast", 2, "fillets", 200),
          ]),
          v3Item("it-14", "Olive oil", 1, "level tsp", 2, per(40, 0, 0, 4.5), []),
          v3Item("it-15", "Raw + cooked vegetables", 3, "servings", 225, per(0.3, 0.02, 0.06, 0.003), [
            sw("Broccoli, boiled", 200, "g", 200), sw("Tomato", 100, "g", 100), sw("Zucchini, roasted", 200, "g", 200),
          ]),
        ],
        options: [
          {
            name: "Tortilla", kcal: 718,
            items: [
              v3Item("it-16", "Whole-grain tortilla", 2, "medium", 84, per(1.3, 0.05, 0.22, 0.03), []),
              v3Item("it-17", "Jong Belegen cheese", 2, "large thin slices", 70, per(3.6, 0.25, 0.01, 0.29), [
                sw("Feta", 70, "g", 70), sw("Fresh mozzarella", 80, "g", 80),
              ]),
              v3Item("it-18", "Eggs — boiled, poached or scrambled", 3, "medium", 165, per(78, 6.3, 0.6, 5.3), [
                sw("Canned tuna", 1.5, "cans"), sw("Cooked salmon", 105, "g", 105),
              ]),
            ],
          },
          {
            name: "Pasta", kcal: 706,
            items: [
              v3Item("it-19", "Whole-grain pasta, cooked", 170, "g", 170, per(1.31, 0.05, 0.25, 0.011), [
                sw("Baked potato", 245, "g", 245), sw("Sweet potato, baked", 149, "g", 149),
              ]),
              v3Item("it-20", "Shredded chicken", 200, "g", 200, per(1.65, 0.31, 0, 0.036), [
                sw("Lean beef", 133, "g", 133), sw("Grilled chicken breast", 200, "g", 200),
              ]),
              v3Item("it-21", "Olive oil + pesto", 1, "serving", 25, per(4, 0.02, 0.05, 0.42), []),
            ],
          },
          {
            name: "Burger", kcal: 691,
            items: [
              v3Item("it-22", "Whole-grain bun", 1, "unit", 80, per(2.6, 0.09, 0.48, 0.04), []),
              v3Item("it-23", "Lean beef patty", 150, "g", 150, per(1.7, 0.26, 0, 0.08), [
                sw("Chicken patty", 150, "g", 150), sw("Black bean patty", 150, "g", 150),
              ]),
              v3Item("it-24", "Salad + light dressing", 1, "serving", 90, per(0.4, 0.02, 0.05, 0.02), []),
            ],
          },
        ],
      },
    ],
  };
}

export function mockParseProgram(text?: string): TrainingProgramDraft {
  return {
    summary:
      (text?.trim().slice(0, 200) || "3 strength days, Mon / Wed / Fri") +
      " — read back as a weekly split.",
    splitDescription: "Push / Pull / Legs, 3 days",
    days: [
      {
        name: "Day 1 — Push",
        exercises: [
          { name: "Bench press", sets: 4, reps: 8, loadKg: 60 },
          { name: "Overhead press", sets: 3, reps: 10, loadKg: 35 },
          { name: "Triceps pushdown", sets: 3, reps: 12 },
        ],
      },
      {
        name: "Day 2 — Pull",
        exercises: [
          { name: "Deadlift", sets: 4, reps: 5, loadKg: 100 },
          { name: "Pull-ups", sets: 3, reps: 8 },
          { name: "Barbell row", sets: 3, reps: 10, loadKg: 50 },
        ],
      },
      {
        name: "Day 3 — Legs",
        exercises: [
          { name: "Back squat", sets: 4, reps: 6, loadKg: 80 },
          { name: "Romanian deadlift", sets: 3, reps: 10, loadKg: 60 },
          { name: "Calf raise", sets: 4, reps: 15 },
        ],
      },
    ],
  };
}

export function createMockApi(): Api {
  let me: User = {
    id: uuid(),
    name: "",
    email: "you@example.com",
    units: "metric",
    createdAt: new Date().toISOString(),
  };
  const byIdempotencyKey = new Map<string, LogEntry>();
  // Persisted plan/program (in-memory for the session; POST/PUT store, GET reads).
  // Seed the v3 plan (ready) so the Eating Plan / Today screens are walkable.
  let storedPlan: EatingPlanDraft | null = handoffPlanV3();
  let storedProgram: TrainingProgramDraft | null = null;
  // Sparse portion overlay for the current plan version (PUT /plan/portions).
  let storedPortions: PortionsMap = {};
  // Async eating-plan import jobs (v3): the mock resolves them immediately.
  const parseJobs = new Map<string, { state: "done" | "failed"; failureReason?: string }>();
  // Vacation ranges — opaque blob to the server (D1); the mock just echoes them.
  let storedVacations: VacationRange[] = [];
  const notFound = () =>
    new ApiError(404, { type: "about:blank", title: "Not found", status: 404 });

  // Deterministic fake session. Tokens "expired"/"invalid" model the 401 paths so
  // the sign-in error copy and refresh-family-revoked branch are demoable offline.
  const issue = (): TokenPair => ({
    accessToken: `mock-access.${uuid()}`,
    refreshToken: `mock-refresh.${uuid()}`,
    expiresIn: 900,
  });
  const authError = () =>
    new ApiError(401, { type: "about:blank", title: "Unauthorized", status: 401 });

  return {
    async requestMagicLink() {
      await delay(300);
    },
    async verifyMagicLink(token) {
      await delay(300);
      if (token === "expired" || token === "invalid") throw authError();
      return issue();
    },
    async oidc() {
      await delay(300);
      return issue();
    },
    async refresh(refreshToken) {
      await delay(150);
      if (!refreshToken.startsWith("mock-refresh.")) throw authError();
      return issue();
    },
    async signOut() {
      await delay(100);
    },
    async parseText({ text, capturedAt }) {
      await delay(LATENCY_MS);
      return mockParse(text, capturedAt);
    },
    async parsePhoto({ caption, capturedAt }) {
      await delay(LATENCY_MS);
      return mockPhotoParse(caption, capturedAt);
    },
    async startEatingPlanImport({ text }) {
      await delay(LATENCY_MS);
      // The server saves the parse result as the current version, status "review".
      const draft = { ...handoffPlanV3(), status: "review" as const };
      if (text?.trim()) draft.summary = mockParsePlan(text).summary;
      let n = 0;
      storedPlan = { ...draft, meals: draft.meals.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it, id: it.id ?? `it-${++n}` })) })) };
      storedPortions = {};
      const jobId = uuid();
      parseJobs.set(jobId, { state: "done" });
      return { jobId };
    },
    async getEatingPlanJob(jobId) {
      await delay(120);
      const job = parseJobs.get(jobId);
      if (!job) throw notFound();
      return job;
    },
    async parseEatingPlan({ text }) {
      // Convenience (onboarding describe path): the review-status draft directly.
      await delay(LATENCY_MS);
      return mockParsePlan(text);
    },
    async parseTrainingProgram({ text }) {
      await delay(LATENCY_MS);
      return mockParseProgram(text);
    },
    async requestUpload() {
      await delay(150);
      // Non-https uploadUrl → putPresignedFile skips the network; the fake fileRef
      // then flows into parse*, which returns the canned draft (text undefined).
      return { fileRef: `mock-file.${uuid()}`, uploadUrl: "mock://plan-upload", expiresAt: new Date(Date.now() + 600_000).toISOString() };
    },
    async getPlan() {
      await delay(120);
      if (!storedPlan) throw notFound();
      // GET /plan additively carries the overlay (EatingPlanWithPortions).
      return { ...storedPlan, portions: storedPortions };
    },
    async createPlan(doc) {
      await delay(150);
      // A2: saving assigns stable ids to items lacking them (document order),
      // exactly like the server — a saved plan always has per-item ids.
      let n = 0;
      const withIds: EatingPlanDraft = {
        ...doc,
        meals: doc.meals.map((m) => ({
          ...m,
          items: m.items.map((it) => ({ ...it, id: it.id ?? `it-${++n}` })),
        })),
      };
      storedPlan = withIds;
      storedPortions = {}; // new version resets the overlay (DESIGN-SPEC)
      return withIds;
    },
    async putPlanPortions(portions) {
      await delay(120);
      if (!storedPlan) throw notFound();
      // Reject unknown ids like the server (422 → app resyncs).
      const ids = new Set(storedPlan.meals.flatMap((m) => m.items.map((it) => it.id)));
      for (const key of Object.keys(portions)) {
        if (!ids.has(key)) {
          throw new ApiError(422, { type: "about:blank", title: "Unknown plan item id", status: 422 });
        }
      }
      storedPortions = { ...portions };
    },
    async updatePlan(doc) {
      await delay(150);
      if (!storedPlan) throw notFound();
      // APP-092 #1 — mirror the server: assign ids to items lacking them (continuing
      // the "it-N" counter past the current max) and prune the overlay to the edit
      // (removed items dropped, an item whose qty·unit changed loses its override).
      const nums = storedPlan.meals.flatMap((m) => m.items.map((it) => Number((it.id ?? "").replace("it-", "")))).filter((x) => Number.isFinite(x));
      let n = nums.length ? Math.max(...nums) : 0;
      const withIds: EatingPlanDraft = {
        ...doc,
        meals: doc.meals.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it, id: it.id ?? `it-${++n}` })) })),
      };
      storedPortions = pruneOverlayAfterEdit(storedPlan, withIds, storedPortions);
      storedPlan = withIds;
      return withIds;
    },
    async getProgram() {
      await delay(120);
      if (!storedProgram) throw notFound();
      return storedProgram;
    },
    async createProgram(doc) {
      await delay(150);
      storedProgram = doc;
      return doc;
    },
    async updateProgram(doc) {
      await delay(150);
      if (!storedProgram) throw notFound();
      storedProgram = doc;
      return doc;
    },
    async createEntry(idempotencyKey, entry) {
      await delay(150);
      const existing = byIdempotencyKey.get(idempotencyKey);
      if (existing) return existing; // idempotent replay, like the real 200
      const now = new Date().toISOString();
      const created: LogEntry = {
        ...entry,
        id: uuid(),
        source: "user",
        loggedAt: now,
        updatedAt: now,
      };
      byIdempotencyKey.set(idempotencyKey, created);
      return created;
    },
    async patchEntry(id, patch) {
      await delay(150);
      for (const [key, e] of byIdempotencyKey) {
        if (e.id === id) {
          const updated: LogEntry = { ...e, ...patch, updatedAt: new Date().toISOString() };
          byIdempotencyKey.set(key, updated);
          return updated;
        }
      }
      throw notFound();
    },
    async listEntries() {
      await delay(150);
      // SQLite is the app's source of truth; the mock server starts empty.
      return { items: [] };
    },
    async getMe() {
      await delay(100);
      return me;
    },
    async patchMe(patch) {
      await delay(100);
      me = { ...me, ...patch };
      return me;
    },
    async getVacations() {
      await delay(100);
      return storedVacations;
    },
    async putVacations(ranges) {
      await delay(100);
      storedVacations = ranges;
      return ranges;
    },
  };
}
