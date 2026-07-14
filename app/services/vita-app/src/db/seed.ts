import type { EntryDetail } from "../api/client";
import { uuid } from "../lib/uuid";
import { getDb } from "./db";
import { kvGet, kvSet } from "./kv";

/**
 * Mock-mode demo seed (M1 walkable app): a morning of already-synced entries so
 * Home has life on first launch. Never runs against a real backend.
 */
export function seedDemoDataOnce(): void {
  if (kvGet<boolean>("seeded")) return;
  const db = getDb();
  const at = (h: number, m: number) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const daysAgo = (n: number, h: number, m: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const rows: Array<{
    type: string;
    occurredAt: string;
    inputMethod: string;
    sourcePhrase: string | null;
    isEstimate: boolean;
    detail: EntryDetail;
  }> = [
    {
      type: "workout",
      occurredAt: daysAgo(6, 18, 0),
      inputMethod: "voice",
      sourcePhrase: "Push day — chest and shoulders",
      isEstimate: true,
      detail: {
        title: "Push day",
        durationMin: 50,
        kcal: 340,
        muscles: ["chest", "shoulders", "triceps"],
        exercises: [
          { name: "Bench press", sets: 4, reps: 8, loadKg: 60 },
          { name: "Overhead press", sets: 3, reps: 10, loadKg: 35 },
        ],
      },
    },
    {
      type: "workout",
      occurredAt: daysAgo(3, 7, 15),
      inputMethod: "text",
      sourcePhrase: "Morning run, half an hour",
      isEstimate: true,
      detail: {
        title: "Run",
        durationMin: 30,
        kcal: 280,
        muscles: ["quads", "hamstrings", "calves"],
        exercises: [],
      },
    },
    {
      type: "workout",
      occurredAt: at(7, 30),
      inputMethod: "text",
      sourcePhrase: "Leg day at the gym, about 45 minutes",
      isEstimate: true,
      detail: {
        title: "Leg day",
        durationMin: 45,
        kcal: 315,
        muscles: ["quads", "hamstrings", "glutes", "calves"],
        exercises: [
          { name: "Back squat", sets: 4, reps: 8, loadKg: 80 },
          { name: "Leg press", sets: 3, reps: 12 },
          { name: "Romanian deadlift", sets: 3, reps: 10, loadKg: 60 },
        ],
      },
    },
    {
      type: "meal",
      occurredAt: at(8, 10),
      inputMethod: "voice",
      sourcePhrase: "Yogurt with granola after the gym",
      isEstimate: true,
      detail: {
        title: "Yogurt & granola",
        items: [
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
        ],
        totals: { kcal: 240, proteinG: 14.8, carbsG: 33, fatG: 6.7 },
      },
    },
    {
      type: "water",
      occurredAt: at(8, 15),
      inputMethod: "tap",
      sourcePhrase: null,
      isEstimate: false,
      detail: { amountMl: 250 },
    },
  ];
  db.withTransactionSync(() => {
    for (const r of rows) {
      db.runSync(
        `INSERT INTO entries (id, serverId, type, occurredAt, inputMethod, sourcePhrase, isEstimate, detail, updatedAt, syncState)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [
          uuid(),
          uuid(),
          r.type,
          r.occurredAt,
          r.inputMethod,
          r.sourcePhrase,
          r.isEstimate ? 1 : 0,
          JSON.stringify(r.detail),
          new Date().toISOString(),
        ],
      );
    }
    // A demo habit so Habits/Today and the Home "N waiting" banner have life.
    db.runSync(
      `INSERT INTO habits (id, name, days, time, enabled, kind, planMealName, createdAt)
       VALUES (?, ?, ?, ?, 1, 'plain', NULL, ?)`,
      [uuid(), "Take creatine", JSON.stringify([true, true, true, true, true, true, true]), "21:00", new Date().toISOString()],
    );
  });
  kvSet("seeded", true);
}
