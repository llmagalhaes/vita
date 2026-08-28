/**
 * APP-128 — the training builder's local shape and the one conversion into the
 * contract's `TrainingProgramDraft` (handoff v4.2 §3.7, §4, app-plan §B).
 *
 * Pure: no React, no db. The builder edits `BwDay[]`; `toProgramDraft` is the
 * only place that knows the wire.
 */
import type { Exercise, Muscle, ProgramDay, TrainingProgramDraft, WorkoutKcalRequest } from "../../api/client";
import { EXCAT, type ExWeights, type Family } from "../../workout/exerciseCatalog";
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

// ---- the other direction: a saved program back into the builder (APP-138) ----

/** Contract muscle → map key. The inverse of `WIRE_OF` (+ `forearms`, which the
 *  builder never writes but a parsed program can). */
const KEY_OF_WIRE = new Map<Muscle, MuscleKey>([
  ...(Object.entries(WIRE_OF) as [MuscleKey, Muscle[]][]).flatMap(([k, names]) =>
    names.map((n) => [n, k] as [Muscle, MuscleKey]),
  ),
  ["forearms", "ar"],
]);

/** Catalog by lowercased name — the authoring table is keyed by name by design. */
const CAT = new Map(EXCAT.map((e) => [e.name.toLowerCase(), e]));

/**
 * Roles → weights, for an exercise the catalog does not know: primary .9,
 * secondary .45 (both sides of `tierOf`'s .7 cut, so a re-save round-trips to the
 * same roles). Two wire muscles can share one capsule (biceps + triceps → `ar`) —
 * the stronger role wins, never a sum.
 */
function weightsOf(roles: Exercise["muscleRoles"]): ExWeights {
  const out: ExWeights = {};
  for (const r of roles ?? []) {
    const k = KEY_OF_WIRE.get(r.name);
    if (k) out[k] = Math.max(out[k] ?? 0, r.role === "primary" ? 0.9 : 0.45);
  }
  return out;
}

/**
 * One saved exercise → the builder's row. The catalog wins on name (it is
 * deterministic — that is why the weights never travel on the wire); anything else
 * rebuilds its weights from the roles it was saved with. `soft` means "the split is
 * a guess": a whole-body catalog entry, a `wholeBody` flag, or an exercise that
 * claims no muscles at all (a free-typed one).
 *
 * Family follows the contract's own rule — the fields present decide it — and only
 * falls back to the catalog's family when the exercise states no measure at all.
 */
function fromExercise(e: Exercise): BwExercise {
  const cat = CAT.get(e.name.toLowerCase());
  const roles = e.muscleRoles ?? [];
  const fam: Family = e.durationMin != null ? "time" : e.sets != null || e.reps != null ? "set" : (cat?.fam ?? "set");
  return {
    n: e.name,
    fam,
    mus: cat ? cat.mus : weightsOf(roles),
    soft: cat ? cat.whole : e.wholeBody === true || roles.length === 0,
    sets: e.sets != null ? String(e.sets) : "",
    reps: e.reps != null ? String(e.reps) : "",
    min: e.durationMin != null ? String(e.durationMin) : "",
  };
}

/**
 * Saved program → builder draft. Dropped, deliberately: `splitDescription`,
 * per-exercise `loadKg` and the derived `muscles` list (roles are the source),
 * plus any muscle role the app's 10-capsule map cannot hold.
 *
 * `kcalEstimate` comes back MARKED an estimate: the wire keeps no "who typed it"
 * flag, and the field the contract calls an estimate is shown as one.
 */
const fromDay = (d: ProgramDay): BwDay => ({
  n: d.name,
  ex: d.exercises.map(fromExercise),
  ...(d.kcalEstimate != null ? { kcal: String(d.kcalEstimate), kcalEst: true } : null),
});

export const fromProgramDoc = (doc: TrainingProgramDraft): { name: string; days: BwDay[] } => ({
  name: doc.summary,
  days: doc.days.map(fromDay),
});

/** The `n` days of a shape, keeping whatever was already filled in (handoff §3.2 → §3.3). */
export function resizeDays(days: BwDay[], n: number, name: (i: number) => string): BwDay[] {
  return Array.from({ length: n }, (_, i) => days[i] ?? { n: name(i), ex: [] });
}
