/**
 * In-process mock of the Vita API (APP-006, M1 "walkable app").
 * ponytail: chosen over MSW — one typed fake serves Expo Go and Jest with zero
 * interceptor machinery; swap to MSW only if we ever need to exercise the real
 * fetch stack. Active when no VITA_API_BASE_URL is configured.
 *
 * Parse is deterministic keyword-matching so the CEO can demo capture offline.
 * Every numeric value is an estimate and flagged isEstimate: true.
 */
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

/**
 * Seeded stored eating plan — the handoff §1.2 reference (11 items, 4 meals) in
 * contract shape, so a fresh mock session opens the Eating Plan screen walkable
 * with portions/micros/bounds. Items carry stable ids (as a saved server plan
 * always does — A2) so the portion overlay keys them. **A4: EXAMPLE data** — real
 * plans get all nutrition from Claude parse estimates; no product/test code treats
 * any number below as a constant.
 */
const seedItem = (
  id: string,
  name: string,
  unit: string,
  quantity: number,
  min: number,
  max: number,
  step: number,
  k: number,
  P: number,
  C: number,
  F: number,
  fb: number,
  na: number,
  fe: number,
  ca: number,
): PlanItem => ({
  id,
  name,
  unit,
  quantity,
  nutritionPerUnit: { kcal: k, proteinG: P, carbsG: C, fatG: F },
  microsPerUnit: { fiberG: fb, sodiumMg: na, ironMg: fe, calciumMg: ca },
  portion: { min, max, step },
});

export function handoffPlan(): EatingPlanDraft {
  return {
    summary: "Low-carb weekdays",
    micros: [
      { name: "Fiber", amount: 28, unit: "g", percentDaily: 100 },
      { name: "Iron", amount: 14, unit: "mg", percentDaily: 78 },
      { name: "Calcium", amount: 900, unit: "mg", percentDaily: 90 },
    ],
    meals: [
      {
        name: "Breakfast",
        time: "07:30",
        items: [
          seedItem("eggs", "Scrambled eggs", "egg", 2, 0, 4, 1, 95, 6.5, 0.8, 7, 0, 95, 0.9, 28),
          seedItem("bread", "Grilled bread", "slice", 1, 0, 3, 1, 145, 4, 27, 2, 1.4, 210, 1, 20),
          seedItem("latte", "Latte", "ml", 200, 0, 400, 50, 0.55, 0.033, 0.05, 0.018, 0, 0.4, 0, 1.2),
        ],
      },
      {
        name: "Lunch",
        time: "13:00",
        items: [
          seedItem("chicken", "Grilled chicken", "g", 180, 0, 300, 10, 1.65, 0.31, 0, 0.036, 0, 0.74, 0.007, 0.11),
          seedItem("rice", "Rice & beans", "g", 200, 0, 350, 10, 1.05, 0.035, 0.21, 0.006, 0.025, 1.9, 0.009, 0.12),
          seedItem("salad", "Salad + olive oil", "g", 100, 0, 200, 10, 1.1, 0.012, 0.05, 0.09, 0.02, 0.5, 0.005, 0.3),
        ],
      },
      {
        name: "Snack",
        time: "16:30",
        items: [
          seedItem("yog", "Yogurt", "g", 170, 0, 300, 10, 0.59, 0.059, 0.047, 0.015, 0, 0.21, 0, 0.65),
          seedItem("gran", "Granola", "g", 30, 0, 80, 5, 2.33, 0.08, 0.42, 0.07, 0.09, 0.5, 0.04, 0.4),
        ],
      },
      {
        name: "Dinner",
        time: "20:00",
        items: [
          seedItem("salmon", "Baked salmon", "g", 160, 0, 300, 10, 1.85, 0.25, 0, 0.088, 0, 0.55, 0.005, 0.09),
          seedItem("veg", "Roasted vegetables", "g", 150, 0, 300, 10, 0.6, 0.02, 0.11, 0.01, 0.03, 0.3, 0.007, 0.25),
          seedItem("spot", "Sweet potato", "g", 150, 0, 300, 10, 0.92, 0.016, 0.21, 0.001, 0.03, 0.36, 0.006, 0.3),
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
  // Seed the handoff plan so the Eating Plan screen is walkable in the mock build.
  let storedPlan: EatingPlanDraft | null = handoffPlan();
  let storedProgram: TrainingProgramDraft | null = null;
  // Sparse portion overlay for the current plan version (PUT /plan/portions).
  let storedPortions: PortionsMap = {};
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
    async parseEatingPlan({ text }) {
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
      storedPlan = doc;
      return doc;
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
