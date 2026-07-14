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
import { ApiError, type Api, type LogEntry, type NewEntry, type ParseResult, type TokenPair, type User } from "./client";

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

const WORKOUTS: Record<string, { title: string; muscles: NonNullable<import("./client").WorkoutDetail["muscles"]> }> = {
  "leg day": { title: "Leg day", muscles: ["quads", "hamstrings", "glutes", "calves"] },
  legs: { title: "Leg day", muscles: ["quads", "hamstrings", "glutes", "calves"] },
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
        exercises: [],
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

export function createMockApi(): Api {
  let me: User = {
    id: uuid(),
    name: "",
    email: "you@example.com",
    units: "metric",
    createdAt: new Date().toISOString(),
  };
  const byIdempotencyKey = new Map<string, LogEntry>();

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
  };
}
