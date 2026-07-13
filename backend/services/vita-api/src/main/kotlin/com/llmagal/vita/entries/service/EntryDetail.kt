package com.llmagal.vita.entries.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude

/**
 * Typed views of the contract EntryDetail oneOf, used only inside the service
 * to validate, recompute meal totals and extract the C2 denormalized numbers.
 * Unknown fields are ignored (tolerant reader, ADR-0002); nulls are dropped so
 * the stored blob and the response stay tidy.
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

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class Micro(
    val name: String,
    val amount: Double,
    val unit: String,
    val percentDaily: Double?,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class MacroTotals(
    val kcal: Double,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
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
