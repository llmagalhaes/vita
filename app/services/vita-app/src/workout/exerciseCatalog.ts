/**
 * APP-115 — the training builder's authoring catalog (handoff v4.2 §3.4/§3.6).
 *
 * Not `muscleData.ts`: that is the READ model over the contract's muscle
 * vocabulary (Trends, records). This is an authoring table keyed by exercise
 * NAME, used only while someone hand-builds a program. The weights never reach
 * the wire — `EXCAT` is deterministic, so a saved program re-derives them from
 * the name alone (`tr` has no contract muscle; the backend folds it into `back`).
 *
 * Pure: no React, no db, no i18n. Every number here is data from the handoff —
 * treat it as such, don't "improve" a weight.
 */
import { mixOklab } from "../ui/oklab";
import { colors } from "../ui/tokens";
import type { MuscleKey } from "../muscle/muscleData";

/** Two families, two fields. Deliberately nothing else (handoff §3.3). */
export type Family = "set" | "time";

/** Per-exercise muscle weights, 0…1. */
export type ExWeights = Partial<Record<MuscleKey, number>>;

export type CatalogEntry = {
  name: string;
  fam: Family;
  mus: ExWeights;
  /** Whole-body activity — the per-muscle split is a guess, so it paints pale. */
  whole: boolean;
};

const set = (name: string, mus: ExWeights): CatalogEntry => ({ name, fam: "set", mus, whole: false });
const time = (name: string, mus: ExWeights, whole = true): CatalogEntry => ({ name, fam: "time", mus, whole });

/** Handoff §3.4, verbatim. 23 by set, 23 by time (`Plank` the only non-whole-body one). */
export const EXCAT: CatalogEntry[] = [
  set("Squat", { qu: 1, gl: 0.85, co: 0.3 }),
  set("Front squat", { qu: 1, co: 0.4, gl: 0.6 }),
  set("Leg press", { qu: 1, gl: 0.6 }),
  set("Lunges", { qu: 0.9, gl: 0.9, ha: 0.4 }),
  set("Romanian deadlift", { ha: 1, gl: 0.85, bk: 0.5 }),
  set("Deadlift", { ha: 1, gl: 0.9, bk: 0.75, tr: 0.5, co: 0.45 }),
  set("Hip thrust", { gl: 1, ha: 0.5 }),
  set("Leg curl", { ha: 1 }),
  set("Calf raise", { ca: 1 }),
  set("Bench press", { ch: 1, ar: 0.6, sh: 0.5 }),
  set("Incline press", { ch: 1, sh: 0.7, ar: 0.5 }),
  set("Push-up", { ch: 0.9, ar: 0.6, co: 0.4 }),
  set("Dip", { ch: 0.8, ar: 0.9 }),
  set("Pull-up", { bk: 1, ar: 0.7 }),
  set("Lat pulldown", { bk: 1, ar: 0.55 }),
  set("Seated row", { bk: 1, ar: 0.6, tr: 0.5 }),
  set("Barbell row", { bk: 1, tr: 0.6, ar: 0.55, co: 0.3 }),
  set("Overhead press", { sh: 1, ar: 0.6, tr: 0.45 }),
  set("Lateral raise", { sh: 1 }),
  set("Face pull", { sh: 0.7, tr: 0.8, bk: 0.5 }),
  set("Biceps curl", { ar: 1 }),
  set("Triceps rope", { ar: 1 }),
  set("Ab wheel", { co: 1 }),
  time("Plank", { co: 1 }, false),
  time("Running", { qu: 0.5, ha: 0.45, ca: 0.6, gl: 0.3 }),
  time("Trail run", { qu: 0.55, ha: 0.5, ca: 0.6, gl: 0.4 }),
  time("Cycling", { qu: 0.65, gl: 0.4, ca: 0.35 }),
  time("Spinning class", { qu: 0.7, gl: 0.45, ca: 0.3 }),
  time("Swimming", { bk: 0.6, sh: 0.6, ar: 0.5, co: 0.4 }),
  time("Rowing machine", { bk: 0.7, qu: 0.5, ar: 0.45, co: 0.35 }),
  time("Jump rope", { ca: 0.6, qu: 0.35 }),
  time("Boxing", { sh: 0.5, ar: 0.5, co: 0.5, bk: 0.35 }),
  time("Muay thai", { qu: 0.45, co: 0.5, sh: 0.45, ar: 0.4 }),
  time("BJJ", { bk: 0.5, ar: 0.5, co: 0.5, gl: 0.3 }),
  time("Football", { qu: 0.55, ha: 0.5, ca: 0.45, gl: 0.35 }),
  time("Basketball", { qu: 0.5, ca: 0.45, co: 0.35 }),
  time("Tennis", { sh: 0.4, ar: 0.4, qu: 0.4, co: 0.35 }),
  time("Crossfit WOD", { qu: 0.5, sh: 0.5, bk: 0.45, ar: 0.45, co: 0.45, gl: 0.4 }),
  time("HIIT circuit", { qu: 0.5, co: 0.45, sh: 0.35, ar: 0.35 }),
  time("Yoga", { co: 0.5, ha: 0.4, sh: 0.35 }),
  time("Pilates", { co: 0.7, gl: 0.35 }),
  time("Stair climber", { qu: 0.6, gl: 0.55, ca: 0.4 }),
  time("Hiking", { qu: 0.5, gl: 0.45, ca: 0.4 }),
  time("Climbing", { bk: 0.6, ar: 0.7, co: 0.5 }),
  time("Dance class", { qu: 0.4, ca: 0.35, co: 0.35 }),
  time("Walk", { qu: 0.3, ca: 0.3 }),
];

/** The slice of a builder exercise coverage reads. A free entry has `mus: {}`. */
export type CoverageSource = { mus?: ExWeights; soft?: boolean };

export type Coverage = {
  /** By-set work — a trustworthy mapping. */
  covS: ExWeights;
  /** Whole-body / free-form work — the split is a guess. */
  covD: ExWeights;
};

/**
 * Two maps, never one: the map answers "was this worked?", not "how much
 * volume" — so `Math.max`, never a sum (criterion 20). Summing would turn
 * coverage into a score, which is precisely what the product does not do.
 */
export function coverage(exercises: CoverageSource[]): Coverage {
  const covS: ExWeights = {};
  const covD: ExWeights = {};
  for (const e of exercises) {
    const into = e.soft ? covD : covS;
    for (const [g, w] of Object.entries(e.mus ?? {}) as [MuscleKey, number][]) {
      into[g] = Math.max(into[g] ?? 0, w);
    }
  }
  return { covS, covD };
}

/**
 * One muscle's fill. Two non-overlapping bands so a glance separates direct
 * work from a diffuse activity: by-set 20 %→70 % accent, whole-body 8 %→28 %.
 * `covS` always beats `covD` on the same group.
 */
export function mfill(key: MuscleKey, { covS, covD }: Coverage, accent: string): string {
  const s = covS[key] ?? 0;
  const d = covD[key] ?? 0;
  if (s > 0) return mixOklab(accent, Math.round(20 + s * 50), colors.muscleEmptyAlt);
  if (d > 0) return mixOklab(accent, Math.round(8 + d * 20), colors.muscleEmptyAlt);
  return colors.muscleEmptyAlt;
}

/** The heaviest `n` muscles of one exercise, strongest first (ties keep the table's order). */
export function dominant(mus: ExWeights | undefined, n = 3): MuscleKey[] {
  return (Object.entries(mus ?? {}) as [MuscleKey, number][])
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** Lowercased words of a name — the only tokenisation `lookup` knows. */
const words = (s: string): string[] => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);

/**
 * APP-140 (handoff v4.3 §3.2 `exLook`) — a SAVED exercise name → the catalog.
 *
 * A plan says "Standing calf raise"; the catalog says "Calf raise". Two passes:
 * exact name, then every catalog word present in the name, longest catalog name
 * first — so "Front squat com pausa" resolves to `Front squat`, not `Squat`.
 * No match returns no muscles: an unknown name paints nothing and reads "not
 * mapped". Guessing a split for a name the app does not know would be inventing data.
 */
export function lookup(name: string): { mus: ExWeights; soft: boolean; fam: Family } {
  const l = String(name).toLowerCase();
  const tw = words(l);
  const hit =
    EXCAT.find((e) => e.name.toLowerCase() === l) ??
    EXCAT.filter((e) => {
      const ct = words(e.name);
      return ct.length > 0 && ct.every((t) => tw.includes(t));
    }).sort((a, b) => b.name.length - a.name.length)[0];
  return hit ? { mus: hit.mus, soft: hit.whole, fam: hit.fam } : { mus: {}, soft: true, fam: "set" };
}

/** Catalog rows for the pick sheet: the family is the first cut, then the query. */
export function search(query: string, fam: Family): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return EXCAT.filter((e) => e.fam === fam && (!q || e.name.toLowerCase().includes(q)));
}
