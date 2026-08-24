/**
 * APP-131 — the measure one exercise line shows.
 *
 * One helper, both callers (the Day timeline's `WorkoutNode` and the program
 * screen): a hand-built time-family exercise (`durationMin`, contract 0.9.0 D4)
 * used to render as an empty string in both, so the number the user typed was
 * invisible everywhere outside the builder. Fixing it in the shared helper is
 * the whole fix — every surface that shows a program line goes through here.
 *
 * `sets`/`reps` win over `durationMin`: the families are exclusive on the wire,
 * and if a document somehow carries both, the set family is the more specific.
 */
import type { Exercise } from "../api/client";

export function exerciseMeasure(ex: Pick<Exercise, "sets" | "reps" | "durationMin">): string {
  if (ex.sets != null && ex.reps != null) return `${ex.sets} × ${ex.reps}`;
  if (ex.sets != null) return `${ex.sets}`;
  if (ex.reps != null) return `${ex.reps}`;
  if (ex.durationMin != null) return `${ex.durationMin} min`;
  return "";
}
