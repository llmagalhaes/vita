package com.llmagal.vita.model.entries

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import com.llmagal.vita.model.MacroTotals
import com.llmagal.vita.model.Micro
import com.llmagal.vita.model.MuscleRole

/**
 * Typed views of the contract EntryDetail oneOf, used only inside the service
 * to validate, recompute meal totals and extract the C2 denormalized numbers.
 * Unknown fields are ignored (tolerant reader, ADR-0002); nulls are dropped so
 * the stored blob and the response stay tidy. MacroTotals / Micro are the shared
 * com.llmagal.vita.model shapes.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class MealDetail(
    val title: String?,
    val items: List<MealItem>,
    val totals: MacroTotals?,
    // 0.8.0 plan linkage — stored verbatim; the server never validates the id
    // against the current plan (a retro record may outlive the plan version).
    val planMealId: String? = null,
    val planStatus: PlanStatus? = null,
    val planOptionIndex: Int? = null,
)

/**
 * Day-record status of a plan meal / program day (contract 0.8.0, BE-048).
 * There is no `planned` value — a plan meal with no record is unrecorded.
 * An unknown wire value fails the typed read and surfaces as a 400.
 */
@Suppress("ktlint:standard:enum-entry-name-case", "EnumNaming")
enum class PlanStatus { done, adjusted, skipped }

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
@Suppress("LongParameterList") // contract MealItem shape
data class MealItem(
    val name: String,
    val quantity: Double?,
    val unit: String?,
    val kcal: Double,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
    val micros: List<Micro>?,
    // 0.8.0 swap provenance — the PlanItem.id this item stands in for. Server-opaque.
    val replacesItemId: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class WaterDetail(
    val amountMl: Int,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
@Suppress("LongParameterList") // contract WorkoutDetail shape
data class WorkoutDetail(
    val title: String,
    val durationMin: Int?,
    val kcal: Double?,
    val muscles: List<String>?,
    val exercises: List<Exercise>?,
    // 0.8.0 plan linkage — programs have no stable day ids, so the name is the pointer.
    val planDay: String? = null,
    val planStatus: PlanStatus? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class Exercise(
    val name: String,
    val sets: Int?,
    val reps: Int?,
    val loadKg: Double?,
    // Per-exercise muscles for the app's muscle tinting; same closed vocabulary
    // as WorkoutDetail.muscles, mapped/dropped by EntryService.
    val muscles: List<String>? = null,
    // Each muscle's role in this exercise (primary/secondary); normalized by
    // EntryService, derives `muscles` when that is absent (BE-040).
    val muscleRoles: List<MuscleRole>? = null,
)

/**
 * A habit check-in result (BE-024). Rides the entries path as a `checkin` entry,
 * encrypted in the detail like every other type. Server-opaque — stored verbatim,
 * never interpreted or aggregated (no denormalized numbers).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class CheckinDetail(
    val habitId: String,
    val habitName: String,
    val kind: String,
    val answer: String,
    val note: String? = null,
)

/**
 * One manually logged body-weight reading (BE-049, contract 0.8.0). Health-Connect
 * readings never come here (ADR-0016, device-local). Encrypted in the detail like
 * every other type; denormalizes to nothing (trends are client-side, ADR-0019).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class WeightDetail(
    val kg: Double,
)
