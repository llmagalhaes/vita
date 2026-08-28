/**
 * APP-140 — the training-program editor's draft (handoff v4.3 §3.2, §3.6; PLAN R6/R7).
 *
 * The draft is BORN from the saved document and every row keeps a `src` reference
 * to the original `Exercise`. Saving spreads `{...src, ...measure}`, so everything
 * the editor has no opinion about — `muscleRoles`, `wholeBody`, `loadKg`, the
 * derived `muscles` list — rides through byte-identical. Without that, changing one
 * rep count would quietly strip the muscle data off every other exercise.
 *
 * Pure: no React, no db. The route edits `EpDay[]`; `toDoc` is the only place that
 * knows the wire.
 */
import type { Exercise, Muscle, ProgramDay, TrainingProgramDraft } from "../../api/client";
import { lookup, type ExWeights } from "../../workout/exerciseCatalog";
import { rolesOf } from "../../build/train/draft";
import type { BwExercise } from "../../build/train/draft";
import type { MuscleKey } from "../../muscle/muscleData";
import { numOf } from "../../build/parts";

/** A builder row plus the saved exercise it came from (absent = added here). */
export type EpExercise = BwExercise & { src?: Exercise };

/** One session. Its `src` day carries `name` and anything else the doc holds. */
export type EpDay = { n: string; ex: EpExercise[]; src: ProgramDay };

/**
 * Contract muscle → map key. ponytail: a third private copy of this table (one in
 * `muscleData`, one in the builder's draft) rather than exporting either — both are
 * in files this ticket must not touch, and the table is closed vocabulary.
 */
const KEY_OF_WIRE: Record<Muscle, MuscleKey> = {
  chest: "ch",
  back: "bk",
  shoulders: "sh",
  biceps: "ar",
  triceps: "ar",
  forearms: "ar",
  traps: "tr",
  core: "co",
  glutes: "gl",
  quads: "qu",
  hamstrings: "ha",
  calves: "ca",
};

/** Roles → weights for an exercise the catalog misses: primary .9, secondary .45 —
 *  both sides of `tierOf`'s .7 cut, so a re-save round-trips to the same roles. */
function weightsOf(roles: Exercise["muscleRoles"]): ExWeights {
  const out: ExWeights = {};
  for (const r of roles ?? []) {
    const k = KEY_OF_WIRE[r.name as Muscle];
    if (k) out[k] = Math.max(out[k] ?? 0, r.role === "primary" ? 0.9 : 0.45);
  }
  return out;
}

/**
 * What paints this row. The catalog wins on name (it is curated and deterministic);
 * an exercise it misses rebuilds its weights from the roles it was SAVED with, so a
 * PDF-imported program lights the map exactly as the Day screen does. Neither →
 * `{}` + soft, which reads "not mapped" and paints nothing.
 */
function musOf(e: Exercise): { mus: ExWeights; soft: boolean } {
  const lk = lookup(e.name);
  if (Object.keys(lk.mus).length > 0) return { mus: lk.mus, soft: lk.soft };
  const roles = e.muscleRoles ?? [];
  if (roles.length === 0) return { mus: {}, soft: true };
  return { mus: weightsOf(roles), soft: e.wholeBody === true };
}

/**
 * Saved exercise → editable row. The family is the contract's own rule (the fields
 * present decide it); the OTHER family's fields get the handoff's defaults so the
 * input exists if the row is ever switched — nothing is guessed onto the wire.
 */
const fromExercise = (e: Exercise): EpExercise => ({
  n: e.name,
  fam: e.durationMin != null ? "time" : "set",
  sets: e.sets != null ? String(e.sets) : "3",
  reps: e.reps != null ? String(e.reps) : "10",
  min: e.durationMin != null ? String(e.durationMin) : "30",
  ...musOf(e),
  src: e,
});

export const fromDoc = (doc: TrainingProgramDraft): EpDay[] =>
  doc.days.map((d) => ({ n: d.name, ex: d.exercises.map(fromExercise), src: d }));

/**
 * The session's volume. Sets × reps for strength, minutes × 15 for time — one
 * number so kcal can move WITH the edit instead of being invented again (§3.6).
 */
export const load = (ex: EpExercise[]): number =>
  ex.reduce((a, e) => a + (e.fam === "set" ? (numOf(e.sets) || 0) * (numOf(e.reps) || 0) : (numOf(e.min) || 0) * 15), 0);

/**
 * The session's new `kcalEstimate`. Proportional, never reinvented: the old number
 * scaled by the load ratio, so a calibrated 430 survives an untouched session and
 * moves honestly when the volume does. `load × 1.85` only where there was no number
 * to scale; load 0 → `undefined`, i.e. no line at all rather than a phantom estimate.
 */
export function kcalFor(l0: number, l1: number, k0: number | undefined): number | undefined {
  if (l1 === 0) return undefined;
  return l0 > 0 && (k0 ?? 0) > 0 ? Math.round(k0! * (l1 / l0)) : Math.round(l1 * 1.85);
}

/** A typed field that never became a usable number just doesn't go on the wire. */
const num = (s: string): number | undefined => {
  const n = numOf(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Only the ACTIVE family's measure travels — a leftover default is not what the session is made of. */
function measureOf(e: EpExercise): Partial<Exercise> {
  const m: Partial<Exercise> = e.fam === "set" ? { sets: num(e.sets), reps: num(e.reps) } : { durationMin: num(e.min) };
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined));
}

/**
 * One row → the wire. A row with a `src` is a spread of it: every field this screen
 * has no opinion about survives verbatim. A row added here gets its roles from the
 * catalog weights at the same `.7` cut the builder uses — one convention, one place.
 */
function toExercise(e: EpExercise): Exercise {
  if (e.src) return { ...e.src, ...measureOf(e) };
  const roles = rolesOf(e.mus);
  return {
    name: e.n,
    ...measureOf(e),
    ...(e.soft && roles.length > 0 ? { wholeBody: true } : null),
    ...(roles.length > 0 ? { muscleRoles: roles } : null),
  };
}

/**
 * The whole draft → the document to PUT. Session keys are untouched (§3.7: the name
 * is the primary key of every history lookup), so each day is a spread of its own
 * `src` with new exercises and the recomputed estimate. `snap` is the draft as it
 * was opened — it holds the load the stored kcal was calibrated against.
 */
export function toDoc(base: TrainingProgramDraft, draft: EpDay[], snap: EpDay[]): TrainingProgramDraft {
  return {
    ...base,
    days: draft.map((d, i) => {
      const kcal = kcalFor(snap[i] ? load(snap[i]!.ex) : 0, load(d.ex), d.src.kcalEstimate);
      // Rebuilt WITHOUT the old estimate: an emptied session must lose the number,
      // and a spread would carry it.
      const { kcalEstimate: _old, ...rest } = d.src;
      return { ...rest, exercises: d.ex.map(toExercise), ...(kcal != null ? { kcalEstimate: kcal } : null) };
    }),
  };
}

/**
 * The dirty-check's comparison value (PLAN R12). `src` is dropped: it is the same
 * object on both sides, but stringifying a whole saved document per keystroke to
 * compare references is work with no answer in it.
 */
export const projection = (draft: EpDay[]): string =>
  JSON.stringify(draft.map((d) => ({ n: d.n, ex: d.ex.map(({ src: _s, ...e }) => e) })));
