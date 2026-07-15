import type { Exercise, Muscle } from "../api/client";

/**
 * Pure muscle → exercise mapping for the workout-detail "tap a muscle" flow
 * (APP-049). Given a workout's exercises and a selected muscle, return the
 * exercises that worked it — PRIMARY when the muscle is that exercise's
 * first-listed muscle, else secondary. Order is preserved (0-based `index`
 * is the list position, so callers can highlight the matching rows).
 */
export type MuscleRole = "primary" | "secondary";
export type MuscleHit = { exercise: Exercise; index: number; role: MuscleRole };

export function exercisesForMuscle(exercises: Exercise[], muscle: Muscle): MuscleHit[] {
  const hits: MuscleHit[] = [];
  exercises.forEach((exercise, index) => {
    const pos = (exercise.muscles ?? []).indexOf(muscle);
    if (pos === -1) return;
    hits.push({ exercise, index, role: pos === 0 ? "primary" : "secondary" });
  });
  return hits;
}

/** Overall role to show in the selected-muscle panel: PRIMARY if it leads any exercise. */
export function overallRole(hits: MuscleHit[]): MuscleRole {
  return hits.some((h) => h.role === "primary") ? "primary" : "secondary";
}

/** True when at least one exercise carries per-exercise `muscles` (else older/seeded flat data). */
export function hasPerExerciseMuscles(exercises: Exercise[]): boolean {
  return exercises.some((ex) => (ex.muscles?.length ?? 0) > 0);
}
