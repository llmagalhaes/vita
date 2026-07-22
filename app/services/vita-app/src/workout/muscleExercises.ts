import type { Exercise, Muscle } from "../api/client";

/**
 * Pure muscle → exercise mapping for the workout-detail "tap a muscle" flow.
 * Given a workout's exercises and a selected muscle, return the exercises that
 * worked it — PRIMARY / secondary from the exercise's `muscleRoles` (v0.6.0)
 * when present, else the first-listed-muscle heuristic on `muscles`. Order is
 * preserved (0-based `index` is the list position, so callers can highlight rows).
 */
export type MuscleRole = "primary" | "secondary";
export type MuscleHit = { exercise: Exercise; index: number; role: MuscleRole };

/** One exercise's muscle→role map: `muscleRoles` verbatim, else first-listed = primary. */
function rolesOf(exercise: Exercise): Map<Muscle, MuscleRole> {
  const out = new Map<Muscle, MuscleRole>();
  if (exercise.muscleRoles && exercise.muscleRoles.length > 0) {
    for (const r of exercise.muscleRoles) out.set(r.name as Muscle, r.role as MuscleRole);
  } else {
    (exercise.muscles ?? []).forEach((m, i) => out.set(m as Muscle, i === 0 ? "primary" : "secondary"));
  }
  return out;
}

export function exercisesForMuscle(exercises: Exercise[], muscle: Muscle): MuscleHit[] {
  const hits: MuscleHit[] = [];
  exercises.forEach((exercise, index) => {
    const role = rolesOf(exercise).get(muscle);
    if (role) hits.push({ exercise, index, role });
  });
  return hits;
}

/** Overall role to show in the selected-muscle panel: PRIMARY if it leads any exercise. */
export function overallRole(hits: MuscleHit[]): MuscleRole {
  return hits.some((h) => h.role === "primary") ? "primary" : "secondary";
}

/** True when at least one exercise carries per-exercise muscle data (roles or muscles). */
export function hasPerExerciseMuscles(exercises: Exercise[]): boolean {
  return exercises.some((ex) => (ex.muscleRoles?.length ?? 0) > 0 || (ex.muscles?.length ?? 0) > 0);
}

// ---- APP-080: deterministic per-muscle opacity from muscleRoles ---------------

export type MuscleIntensity = { role: MuscleRole; opacity: number };

/**
 * Per-muscle "worked" intensity across a workout's exercises (DESIGN-SPEC §6.1).
 * Deterministic and monotone — reproduces the handoff's primary tier
 * (quads/glutes .92, hams .78); calves/core deviate from the handoff's hand-tuned
 * values, which is APPROVED (A9 — no per-muscle override table).
 *
 *   role(m)    = primary if any exercise lists m primary, else secondary
 *   count(m)   = # of exercises that work m (via muscleRoles, or the muscles fallback)
 *   opacity(m) = primary:   count>=3 → 0.92 else 0.78
 *                secondary: count>=2 → 0.62 else 0.30
 *
 * Empty exercises → {} (the screen renders workout-level muscles flat instead).
 */
export function muscleIntensities(exercises: Exercise[]): Partial<Record<Muscle, MuscleIntensity>> {
  const counts = new Map<Muscle, number>();
  const anyPrimary = new Set<Muscle>();
  for (const ex of exercises) {
    for (const [m, role] of rolesOf(ex)) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
      if (role === "primary") anyPrimary.add(m);
    }
  }
  const out: Partial<Record<Muscle, MuscleIntensity>> = {};
  for (const [m, count] of counts) {
    const role: MuscleRole = anyPrimary.has(m) ? "primary" : "secondary";
    const opacity = role === "primary" ? (count >= 3 ? 0.92 : 0.78) : count >= 2 ? 0.62 : 0.3;
    out[m] = { role, opacity };
  }
  return out;
}
