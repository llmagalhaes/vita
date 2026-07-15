package com.llmagal.vita.model.entries

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import com.llmagal.vita.model.MacroTotals
import com.llmagal.vita.model.Micro

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
)

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
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class WaterDetail(
    val amountMl: Int,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class WorkoutDetail(
    val title: String,
    val durationMin: Int?,
    val kcal: Double?,
    val muscles: List<String>?,
    val exercises: List<Exercise>?,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class Exercise(
    val name: String,
    val sets: Int?,
    val reps: Int?,
    val loadKg: Double?,
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
