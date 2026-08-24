package com.llmagal.vita.model.estimate

import com.llmagal.vita.model.MuscleRole

// Wire shapes for the three "fill it in for me" passes (contract v0.9.0, D7/D8/D9).
// Nothing here is persisted: items in, numbers out (ADR-0005, ADR-0020).
//
// Every request field is nullable on purpose — a missing or wrong-typed field is a 400
// the controller words, not a Jackson 500.

// ── POST /v1/estimate/food-kcal (D7) ───────────────────────────────────────
data class FoodKcalRequest(
    val items: List<FoodKcalItem>?,
)

data class FoodKcalItem(
    val name: String?,
    val quantity: Double?,
    val unit: String?,
)

data class FoodKcalResponse(
    val items: List<FoodKcalResult>,
)

/** `kcal: null` = nothing could answer this item. The caller leaves its dash; never a zero. */
data class FoodKcalResult(
    val kcal: Int?,
)

// ── POST /v1/estimate/exercise-muscles (D8) ────────────────────────────────
data class ExerciseMusclesRequest(
    val names: List<String>?,
)

data class ExerciseMusclesResponse(
    val items: List<ExerciseMusclesResult>,
)

/**
 * [estimated] = nobody curated this mapping. The app paints an estimated mapping in the
 * PALE band, never the full tone a catalog entry gets; an empty [muscleRoles] keeps
 * "not mapped", because guessing would invent data.
 */
data class ExerciseMusclesResult(
    val muscleRoles: List<MuscleRole>,
    val wholeBody: Boolean,
    val estimated: Boolean,
)

// ── POST /v1/estimate/workout-kcal (D9, CEO Round 16) ──────────────────────
data class WorkoutKcalRequest(
    val exercises: List<WorkoutExercise>?,
)

data class WorkoutExercise(
    val name: String?,
    val fam: String?,
    val sets: Int?,
    val reps: Int?,
    val min: Int?,
)

/** [estimated] is always true — this endpoint has no other kind of answer. */
data class WorkoutKcalResponse(
    val kcal: Int,
    val estimated: Boolean = true,
)
