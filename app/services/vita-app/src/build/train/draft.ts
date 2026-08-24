/**
 * APP-128 — the training builder's local shape and the one conversion into the
 * contract's `TrainingProgramDraft` (handoff v4.2 §3.7, §4, app-plan §B).
 *
 * Pure: no React, no db. The builder edits `BwDay[]`; `toProgramDraft` is the
 * only place that knows the wire.
 */
import type { Exercise, Muscle, TrainingProgramDraft, WorkoutKcalRequest } from "../../api/client";
import type { ExWeights, Family } from "../../workout/exerciseCatalog";
import { tierOf, type MuscleKey } from "../../muscle/muscleData";
import { numOf } from "../parts";

/**
 * One exercise as the builder holds it. `sets`/`reps`/`min` are ALL kept as the
 * strings they came from, even the ones the current family ignores — switching
 * family must not lose what was typed (handoff §4).
 */
export type BwExercise = {
  n: string;
  fam: Family;
  mus: ExWeights;
  /** Whole-body catalog entry, or a free-typed one: the split is a guess, so it paints pale. */
  soft: boolean;
  sets: string;
  reps: string;
  min: string;
};

export type BwDay = {
  n: string;
  ex: BwExercise[];
  /**
   * Round-16 #4 / APP-135: a hand-built day keeps the `~kcal` line — typed here
   * or answered by POST /estimate/workout-kcal. Absent/empty = no line at all.
   */
  kcal?: string;
  /** True only while `kcal` came from the endpoint (renders `~`, dashed, ink).
   *  Typing over it clears the flag: a corrected estimate is not an estimate. */
  kcalEst?: boolean;
};

/** `Day A … Day J` — the ceiling of 10 sessions is exactly the letter J (criterion 15). */
export const dayLetter = (i: number): string => String.fromCharCode(65 + i);

/**
 * App map key → contract muscle names. The inverse of `muscleData`'s `KEY_OF`,
 * which is many-to-one: the map's single arm capsule covers biceps AND triceps,
 * so an arm weight lands on both.
 */
const WIRE_OF: Record<MuscleKey, Muscle[]> = {
  ch: ["chest"],
  bk: ["back"],
  sh: ["shoulders"],
  ar: ["biceps", "triceps"],
  tr: ["traps"],
  co: ["core"],
  qu: ["quads"],
  ha: ["hamstrings"],
  gl: ["glutes"],
  ca: ["calves"],
};

/** Catalog weights → contract roles. One cut, shared with the map's `tierOf` (.7). */
export function rolesOf(mus: ExWeights): NonNullable<Exercise["muscleRoles"]> {
  return (Object.entries(mus) as [MuscleKey, number][]).flatMap(([k, w]) =>
    WIRE_OF[k].map((name) => ({ name, role: tierOf(w) === "primary" ? ("primary" as const) : ("secondary" as const) })),
  );
}

/** A typed field that never made it to a usable number just doesn't go on the wire. */
const num = (s: string): number | undefined => {
  const n = numOf(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function toExercise(e: BwExercise): Exercise {
  const roles = rolesOf(e.mus);
  return {
    name: e.n,
    // The family is derived on read from which fields are present (contract 0.9.0
    // `durationMin`) — only the active family's fields go on the wire.
    ...(e.fam === "set" ? { sets: num(e.sets), reps: num(e.reps) } : { durationMin: num(e.min) }),
    // `wholeBody` marks a CATALOG whole-body activity. A free-typed entry is soft
    // too, but has no weights at all — it claims nothing, so it says nothing.
    ...(e.soft && roles.length > 0 ? { wholeBody: true } : null),
    ...(roles.length > 0 ? { muscleRoles: roles } : null),
  };
}

/**
 * One day's exercises as `POST /estimate/workout-kcal` wants them (D9). Only the
 * ACTIVE family's measure travels, for the same reason `toExercise` does it: a
 * `min` left over from a family switch is not what this day is made of.
 */
export const workoutKcalBody = (day: BwDay): WorkoutKcalRequest["exercises"] =>
  day.ex.map((e) => ({
    name: e.n,
    fam: e.fam,
    ...(e.fam === "set" ? { sets: num(e.sets), reps: num(e.reps) } : { min: num(e.min) }),
  }));

/** The whole builder → the contract doc. `fallback` is `t("build.program.fallbackName")`. */
export function toProgramDraft(name: string, days: BwDay[], fallback: string): TrainingProgramDraft {
  return {
    summary: name.trim() || fallback,
    days: days.map((d) => ({
      name: d.n,
      exercises: d.ex.map(toExercise),
      ...(num(d.kcal ?? "") !== undefined ? { kcalEstimate: num(d.kcal ?? "") } : null),
    })),
  };
}

/** The `n` days of a shape, keeping whatever was already filled in (handoff §3.2 → §3.3). */
export function resizeDays(days: BwDay[], n: number, name: (i: number) => string): BwDay[] {
  return Array.from({ length: n }, (_, i) => days[i] ?? { n: name(i), ex: [] });
}
