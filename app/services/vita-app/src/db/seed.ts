import type { EntryDetail, MealItem, NewEntry, SwapOption, WorkoutDetail } from "../api/client";
import { handoffPlanV3 } from "../api/mock";
import { buildMealRecord, dayKey, emptyOverlay, toMealEntry, workoutEntryId, type DayOverlay } from "../day/record";
import { uuid } from "../lib/uuid";
import { getDb } from "./db";
import { kvGet, kvSet } from "./kv";

/**
 * Mock-mode demo seed — three weeks of a real-looking log so every v4 surface has
 * something to show on a fresh install: the dock's 10 status dots, the calendar
 * month, past-day cards (as-planned · adjusted · unrecorded · one retro-closed),
 * Trends' three ranges + weight line + record counter, and the habit strip.
 *
 * **Everything goes in as ordinary entries** (APP-094: there is no `/days` resource
 * and no aggregate table). Meal records are built by the same `buildMealRecord` /
 * `toMealEntry` pair the Close-the-day button uses, with the same deterministic ids,
 * so day status, counters, retro detection and the charts all *derive* — nothing here
 * is hand-computed. Never runs against a real backend.
 *
 * ponytail: deterministic pseudo-variation from the day index — no randomness, so a
 * screenshot taken twice looks the same and tests can rely on it.
 */
export function seedDemoDataOnce(): void {
  if (kvGet<boolean>("seeded")) return;
  const db = getDb();
  const plan = handoffPlanV3();
  const meals = plan.meals.filter((m) => m.id != null);
  const habitId = uuid();

  type Row = { id: string; occurredAt: string; loggedAt: string; entry: Omit<NewEntry, "occurredAt"> };
  const rows: Row[] = [];
  /** `loggedAt` defaults to the moment it happened — a LATER day is what makes a
   *  record read as "closed later, by you" (PLAN R2), so it is never accidental. */
  const put = (id: string, e: NewEntry, loggedAt?: string) =>
    rows.push({ id, occurredAt: e.occurredAt, loggedAt: loggedAt ?? e.occurredAt, entry: e });

  const dateOf = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const at = (n: number, h: number, m: number): string => {
    const d = dateOf(n);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  // ── Day shapes ──────────────────────────────────────────────────────────────
  // 21 days back. Gaps are days with no meal/workout record at all — an absence the
  // app must render as "Vita assumed nothing", never as a failure.
  const DAYS = 21;
  const GAPS = new Set([4, 11, 17, 18]);
  // Closed the morning after — the only days `isRetro` may fire on.
  const RETRO = new Set([9, 14]);
  const shapeOf = (n: number): "gap" | "asPlanned" | "adjusted" =>
    GAPS.has(n) ? "gap" : n % 3 === 0 ? "asPlanned" : "adjusted";

  /** Today's stand-in for the Lunch/Dinner staple, taken from the plan's own swaps. */
  const swapOf = (planItemId: string, i: number): SwapOption | undefined =>
    meals.flatMap((m) => m.items).find((it) => it.id === planItemId)?.swaps?.[i];

  /** The day's tweaks: a swap on the staple + a smaller portion of the protein. */
  const overlayFor = (n: number): DayOverlay => {
    const ov = emptyOverlay();
    const sw = swapOf("it-3", n % 3); // rice · brown rice · sweet potato
    if (sw) ov.swap["it-3"] = sw;
    ov.qty["it-4"] = 150 + (n % 3) * 25; // 150–200 g of chicken
    if (n % 5 === 2) ov.option["m-5"] = 0; // Dinner as the "Tortilla" option
    return ov;
  };

  for (let n = 1; n <= DAYS; n++) {
    const date = dayKey(dateOf(n));
    const shape = shapeOf(n);
    const retro = RETRO.has(n);
    // Retro days were closed the next morning; that is the ONLY difference on the wire.
    const loggedAt = retro ? at(n - 1, 9, 30) : undefined;

    if (shape !== "gap") {
      const ov = shape === "adjusted" ? overlayFor(n) : emptyOverlay();
      meals.forEach((meal, i) => {
        // An adjusted day: the two anchor meals land as planned, Lunch/Dinner carry
        // the day's swaps and portions, and the Snack is skipped every so often.
        const state =
          shape === "asPlanned" ? "done" : i < 2 ? "done" : i === 3 && n % 4 === 1 ? "skipped" : "adjusted";
        const rec = buildMealRecord(date, meal, state, ov);
        put(rec.entryId, toMealEntry(rec), loggedAt);
      });
    }

    // Water on every day, gaps included — a drink is not a day record (R1).
    const drinks = 6 + (n % 5); // 1 500–2 500 ml
    for (let d = 0; d < drinks; d++) {
      put(uuid(), {
        type: "water",
        occurredAt: at(n, 8 + d * 2, (n * 7) % 60),
        inputMethod: "tap",
        isEstimate: false,
        detail: { amountMl: 250 },
      });
    }

    // ~4 sessions a week, alternating lower/upper.
    if (shape !== "gap" && [0, 2, 4, 5].includes(n % 7)) {
      const w = n % 14 < 7 ? SESSIONS.leg : SESSIONS.upper;
      put(workoutEntryId(date), {
        type: "workout",
        occurredAt: at(n, 18, 30),
        inputMethod: n % 2 ? "text" : "voice",
        isEstimate: true,
        detail: {
          title: w.title,
          durationMin: w.min + (n % 4) * 3,
          kcal: w.kcal + (n % 5) * 12,
          muscles: [...w.muscles],
          exercises: w.exercises.map((e) => ({ ...e })),
        } satisfies WorkoutDetail,
      }, loggedAt);
    }

    // Habit answers ~70% yes; a gap day was simply never answered.
    if (shape !== "gap") {
      put(`${habitId}:${date}`, {
        type: "checkin",
        occurredAt: at(n, 21, 5),
        inputMethod: "checkin",
        isEstimate: false,
        detail: { habitId, habitName: HABIT_NAME, kind: "plain", answer: (n * 7) % 10 < 7 ? "yes" : "no" },
      });
    }

    // Weekly weigh-in, drifting 84.2 → 83.1 kg. No goal, no delta — a value and a time.
    const weekly = WEIGHTS[n];
    if (weekly != null) {
      put(`weight:${date}`, {
        type: "weight",
        occurredAt: at(n, 7, 10),
        inputMethod: "tap",
        isEstimate: false,
        detail: { kg: weekly },
      });
    }
  }

  // ── Today: part-recorded, exactly where the CEO's morning would be ───────────
  const today = dayKey();
  put(workoutEntryId(today), {
    type: "workout",
    occurredAt: at(0, 7, 30),
    inputMethod: "text",
    sourcePhrase: "Leg day at the gym, about 45 minutes",
    isEstimate: true,
    detail: { title: SESSIONS.leg.title, durationMin: 52, kcal: 430, muscles: [...SESSIONS.leg.muscles], exercises: SESSIONS.leg.exercises.map((e) => ({ ...e })) },
  });
  put(uuid(), {
    type: "meal",
    occurredAt: at(0, 8, 10),
    inputMethod: "voice",
    sourcePhrase: "Yogurt with granola after the gym",
    isEstimate: true,
    detail: { title: "Yogurt & granola", items: YOGURT_ITEMS, totals: { kcal: 240, proteinG: 14.8, carbsG: 33, fatG: 6.7 } },
  });
  put(uuid(), { type: "water", occurredAt: at(0, 8, 15), inputMethod: "tap", isEstimate: false, detail: { amountMl: 250 } });
  put(`weight:${today}`, { type: "weight", occurredAt: at(0, 7, 10), inputMethod: "tap", isEstimate: false, detail: { kg: 83.1 } });
  // Today's habit is deliberately unanswered — the ✓/— row needs something to do.

  db.withTransactionSync(() => {
    for (const r of rows) {
      db.runSync(
        `INSERT OR REPLACE INTO entries (id, serverId, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail, updatedAt, syncState)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          r.id,
          uuid(),
          r.entry.type,
          r.occurredAt,
          r.entry.inputMethod,
          r.entry.sourcePhrase ?? null,
          r.entry.isEstimate ? 1 : 0,
          JSON.stringify(r.entry.detail as EntryDetail),
          r.loggedAt,
        ],
      );
    }
    db.runSync(
      `INSERT INTO habits (id, name, days, time, enabled, createdAt)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [habitId, HABIT_NAME, JSON.stringify([true, true, true, true, true, true, true]), "21:00", at(DAYS, 21, 0)],
    );
  });
  kvSet("seeded", true);
}

const HABIT_NAME = "Take creatine";

/** n (days ago) → that morning's reading. Weekly, drifting down 1.1 kg over 3 weeks. */
const WEIGHTS: Record<number, number> = { 21: 84.2, 14: 83.8, 7: 83.4 };

/** Two alternating sessions, with the per-exercise muscles the body map tints (0.5.0). */
type Session = {
  title: string;
  muscles: NonNullable<WorkoutDetail["muscles"]>;
  kcal: number;
  min: number;
  exercises: NonNullable<WorkoutDetail["exercises"]>;
};
const SESSIONS: Record<"leg" | "upper", Session> = {
  leg: {
    title: "Leg day",
    muscles: ["quads", "hamstrings", "glutes", "calves"],
    kcal: 360,
    min: 52,
    exercises: [
      { name: "Back squat", sets: 4, reps: 8, loadKg: 80, muscles: ["quads", "glutes"] },
      { name: "Leg press", sets: 3, reps: 12, loadKg: 140, muscles: ["quads"] },
      { name: "Romanian deadlift", sets: 3, reps: 10, loadKg: 60, muscles: ["hamstrings", "glutes"] },
      { name: "Walking lunges", sets: 2, reps: 20, muscles: ["quads", "glutes"] },
      { name: "Seated calf raise", sets: 4, reps: 15, loadKg: 45, muscles: ["calves"] },
    ],
  },
  upper: {
    title: "Upper body",
    muscles: ["chest", "back", "shoulders", "biceps", "triceps"],
    kcal: 330,
    min: 48,
    exercises: [
      { name: "Bench press", sets: 4, reps: 8, loadKg: 60, muscles: ["chest", "triceps"] },
      { name: "Pull-ups", sets: 3, reps: 8, muscles: ["back", "biceps"] },
      { name: "Overhead press", sets: 3, reps: 10, loadKg: 35, muscles: ["shoulders", "triceps"] },
      { name: "Barbell row", sets: 3, reps: 10, loadKg: 50, muscles: ["back", "biceps"] },
      { name: "Face pull", sets: 3, reps: 15, loadKg: 20, muscles: ["shoulders", "back"] },
    ],
  },
};

const YOGURT_ITEMS: MealItem[] = [
  {
    name: "Yogurt",
    quantity: 170,
    unit: "g",
    kcal: 100,
    proteinG: 10,
    carbsG: 8,
    fatG: 2.5,
    micros: [
      { name: "Calcium", amount: 210, unit: "mg", percentDaily: 16 },
      { name: "Vitamin B12", amount: 1.1, unit: "µg", percentDaily: 46 },
    ],
  },
  {
    name: "Granola",
    quantity: 30,
    unit: "g",
    kcal: 140,
    proteinG: 4.8,
    carbsG: 25,
    fatG: 4.2,
    micros: [
      { name: "Fiber", amount: 4.1, unit: "g", percentDaily: 15 },
      { name: "Iron", amount: 3.1, unit: "mg", percentDaily: 17 },
    ],
  },
];
