/**
 * APP-101 — the v4 muscle model: intensities, fills, aggregate, chips, sheet rows.
 * Pure (no React, no db reads) so every number the map and the sheet show is unit-tested.
 * Source of truth: docs/v4/README.md §3 Muscle map + prototype `MUS`/`EXMU`/`muF`/`muT`.
 *
 * Two sources feed a session's intensities, in this order:
 *  1. `MUS`/`EXMU` keyed by the program name — the CEO's two programs, verbatim from
 *     the handoff (a real "Leg day" session therefore renders exactly like the prototype).
 *  2. Otherwise derived from the session's own exercises (`muscleIntensities`, APP-080),
 *     so an imported program nobody hand-tuned still tints the map honestly.
 * `traps` has no slot in the contract's 11-muscle vocabulary (backend folds it into
 * `back`), so `tr` only ever lights up from source 1.
 */
import type { Exercise, Muscle, WorkoutDetail } from "../api/client";
import type { LocalEntry } from "../db/entries";
import { muscleIntensities } from "../workout/muscleExercises";
import { mixOklab } from "../ui/oklab";
import { colors } from "../ui/tokens";

/** The 10 v4 map keys, in chip order (Trends shows the first 8; traps/core trail). */
export const MUSCLE_KEYS = ["qu", "gl", "ha", "ca", "ch", "bk", "sh", "ar", "tr", "co"] as const;
export type MuscleKey = (typeof MUSCLE_KEYS)[number];
export type Intensities = Partial<Record<MuscleKey, number>>;

/** Prototype `MUS` — per-program intensity 0..1. */
export const MUS: Record<string, Intensities> = {
  "Leg day": { qu: 1, gl: 0.85, ha: 0.8, ca: 0.55, co: 0.25 },
  "Upper body": { ch: 1, bk: 0.9, sh: 0.7, ar: 0.6, tr: 0.5, co: 0.25 },
};

/** Prototype `EXMU` — which exercises of a program hit which muscle. */
export const EXMU: Record<string, Partial<Record<MuscleKey, string[]>>> = {
  "Leg day": {
    qu: ["Squat", "Leg press", "Walking lunges"],
    gl: ["Squat", "Romanian deadlift", "Walking lunges"],
    ha: ["Romanian deadlift", "Leg curl"],
    ca: ["Standing calf raise"],
    co: ["Squat"],
  },
  "Upper body": {
    ch: ["Bench press", "Incline dumbbell press"],
    bk: ["Seated row"],
    sh: ["Lateral raise", "Incline dumbbell press"],
    ar: ["Bench press", "Seated row", "Triceps rope"],
    tr: ["Seated row"],
  },
};

/** Contract muscle → v4 map key. The three arm muscles share one capsule pair. */
const KEY_OF: Record<Muscle, MuscleKey> = {
  chest: "ch",
  back: "bk",
  shoulders: "sh",
  biceps: "ar",
  triceps: "ar",
  forearms: "ar",
  core: "co",
  glutes: "gl",
  quads: "qu",
  hamstrings: "ha",
  calves: "ca",
};

/**
 * `muF` — the fill for one muscle. `color-mix(in oklab, accent round(16 + v*70)%, #F0EDE2)`,
 * zero → the neutral capsule. Always pass the live accent so vacation mode follows.
 */
export const muF = (v: number, accent: string): string =>
  v > 0 ? mixOklab(accent, Math.round(16 + v * 70), colors.sandChip) : colors.muscleEmpty;

export type Tier = "primary" | "secondary" | "light";
// CEO 2026-08-24: unified with the v4.1 "As primary" stat cut (handoff §4) — was .75,
// which let a .70–.74 muscle count in the stat while its session rows showed no badge.
export const tierOf = (v: number): Tier => (v >= 0.7 ? "primary" : v >= 0.4 ? "secondary" : "light");

/** The slice of a workout the muscle model needs. `WorkoutRecord` (src/day/record) fits as-is. */
export type WorkoutSession = {
  entryId?: string;
  /** The program this session fulfils; falls back to the session title. */
  planDay?: string;
  title: string;
  exercises?: Exercise[];
  muscles?: Muscle[];
  /** occurredAt, ISO instant. */
  at: string;
};

/** Workout entries as the muscle model sees them (newest-first order is the caller's). */
export const sessionsFromEntries = (entries: LocalEntry[]): WorkoutSession[] =>
  entries.map((e) => ({ ...(e.detail as WorkoutDetail), entryId: e.id, at: e.occurredAt }));

const programOf = (s: WorkoutSession): string => s.planDay ?? s.title;

/** Per-muscle intensity of one session (see the file header for the two sources). */
export function intensitiesOf(session: WorkoutSession): Intensities {
  const canonical = MUS[programOf(session)];
  if (canonical) return canonical;
  const out: Intensities = {};
  for (const [muscle, hit] of Object.entries(muscleIntensities(session.exercises ?? []))) {
    const k = KEY_OF[muscle as Muscle];
    out[k] = Math.max(out[k] ?? 0, hit!.opacity);
  }
  // ponytail: sessions carrying only workout-level muscles (no per-exercise data) tint at
  // the primary tier — there is nothing finer to say. Raise it to a real table only if the
  // backend ever stops sending per-exercise muscles.
  if (Object.keys(out).length === 0) for (const m of session.muscles ?? []) out[KEY_OF[m]] = 0.78;
  return out;
}

/** The exercises of a session that hit `key` — `EXMU` for the known programs, else the real ones. */
export function exercisesFor(session: WorkoutSession, key: MuscleKey): string[] {
  const table = EXMU[programOf(session)];
  if (table) return table[key] ?? [];
  return (session.exercises ?? [])
    .filter((ex) => (ex.muscleRoles?.map((r) => r.name as Muscle) ?? ex.muscles ?? []).some((m) => KEY_OF[m as Muscle] === key))
    .map((ex) => ex.name);
}

/**
 * `muT` — the Trends aggregate: each muscle's mean intensity across the sessions in the
 * range. Identical to the prototype's `(legIntensity·legSessions + upperIntensity·upperSessions)
 * / totalSessions`, generalised to any mix of programs. No sessions → all zeros.
 */
export function muT(sessions: WorkoutSession[]): Intensities {
  const out: Intensities = {};
  if (sessions.length === 0) return out;
  const per = sessions.map(intensitiesOf);
  for (const k of MUSCLE_KEYS) {
    const sum = per.reduce((acc, mu) => acc + (mu[k] ?? 0), 0);
    if (sum > 0) out[k] = sum / sessions.length;
  }
  return out;
}

export type ProgramChip = { key: MuscleKey; intensity: number; tier: Tier };

/** Workout-card / past-day chips: every muscle the program touches, map order, tier-labelled. */
export const programChips = (mu: Intensities): ProgramChip[] =>
  MUSCLE_KEYS.filter((k) => (mu[k] ?? 0) > 0).map((k) => ({ key: k, intensity: mu[k]!, tier: tierOf(mu[k]!) }));

export type TrendChip = { key: MuscleKey; intensity: number; sessions: number; tinted: boolean };

/**
 * Trends chips: the first 8 muscles with an aggregate over .15, strongest first, up to 8.
 * The label is the same session COUNT the sheet's "Sessions" card shows (any intensity —
 * the old ≥ .4 criterion under-counted and contradicted the sheet), and the chip tints
 * at the .4 threshold — not the .7 the per-program chips use.
 */
export function trendChips(sessions: WorkoutSession[]): TrendChip[] {
  const agg = muT(sessions);
  const per = sessions.map(intensitiesOf);
  return MUSCLE_KEYS.slice(0, 8)
    .filter((k) => (agg[k] ?? 0) > 0.15)
    .sort((a, b) => agg[b]! - agg[a]!)
    .map((k) => ({
      key: k,
      intensity: agg[k]!,
      sessions: per.filter((mu) => (mu[k] ?? 0) > 0).length,
      tinted: agg[k]! >= 0.4,
    }));
}

export type MuscleRange = "week" | "month" | "year";

/** Weeks a range spans — the divisor of the sheet's "Per week" card (prototype `rngWks`). */
const RANGE_WEEKS: Record<MuscleRange, number> = { week: 1, month: 4.3, year: 52 };

export type MuscleStats = {
  /** Sessions in the range that touched the muscle at all (`muCnt`). */
  sessions: number;
  /** …of those, the ones that had it as a main target, intensity ≥ .7 (`muPri`). */
  primary: number;
  /** `sessions / weeks`, one decimal, trailing ".0" dropped. */
  perWeek: string;
  /** Sessions beyond the `shown` listed rows — by construction never more than `sessions`. */
  earlier: number;
};

/** The three numbers above the muscle sheet's session list, plus its footer's remainder. */
export function muscleStats(
  sessions: WorkoutSession[],
  key: MuscleKey,
  range: MuscleRange,
  shown = 0,
): MuscleStats {
  const per = sessions.map((s) => intensitiesOf(s)[key] ?? 0);
  const count = per.filter((v) => v > 0).length;
  return {
    sessions: count,
    primary: per.filter((v) => v >= 0.7).length,
    perWeek: (count / RANGE_WEEKS[range]).toFixed(1).replace(".0", ""),
    earlier: count - shown,
  };
}

/** Days back from `today`, local calendar days (0 = today). */
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const dayOffsetOf = (at: string, today: Date): number =>
  Math.round((midnight(today) - midnight(new Date(at))) / 86_400_000);

/** ponytail: the dock shows today + the previous 9 days (`NDAYS` in src/day/dock/dock.ts). */
const DOCK_DAYS = 10;

export type SessionRow = {
  id: string;
  program: string;
  date: Date;
  dayOffset: number;
  /** "Open this day →" only reaches days the dock can travel to. */
  canOpenDay: boolean;
  intensity: number;
  tier: Tier;
  exercises: string[];
};

/**
 * The muscle sheet's rows: the sessions that actually worked `key` — it must both carry
 * intensity AND name the exercises, so a program that doesn't hit the muscle never appears.
 * Newest first.
 */
export function sessionRows(sessions: WorkoutSession[], key: MuscleKey, today: Date = new Date()): SessionRow[] {
  return sessions
    .map((s, i) => {
      const intensity = intensitiesOf(s)[key] ?? 0;
      const date = new Date(s.at);
      const dayOffset = dayOffsetOf(s.at, today);
      return {
        id: s.entryId ?? `${s.at}-${i}`,
        program: programOf(s),
        date,
        dayOffset,
        canOpenDay: dayOffset >= 0 && dayOffset < DOCK_DAYS,
        intensity,
        tier: tierOf(intensity),
        exercises: exercisesFor(s, key),
      };
    })
    .filter((r) => r.intensity > 0 && r.exercises.length > 0)
    .sort((a, b) => a.dayOffset - b.dayOffset);
}
