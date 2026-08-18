package com.llmagal.vita.model.ai

import com.fasterxml.jackson.annotation.JsonInclude
import com.llmagal.vita.model.MacroTotals
import com.llmagal.vita.model.Micro
import com.llmagal.vita.model.MuscleRole

/**
 * POST /v1/parse/{eating-plan,training-program} body (contract PlanImportRequest):
 * exactly one of `text` or `fileRef`. Validated in [PlanParseController].
 */
data class PlanImportRequest(
    val text: String?,
    val fileRef: String?,
)

/**
 * Draft shapes for the plan/program parse endpoints (BE-015, ADR-0011). Never
 * persisted server-side (ADR-0005) — response only. Required fields are non-null
 * so a malformed model output fails to deserialize and becomes a 422 upstream;
 * `@JsonInclude(NON_NULL)` drops the estimates the model couldn't fill.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class EatingPlanDraft(
    val summary: String,
    val dailyTotals: MacroTotals? = null,
    val micros: List<Micro>? = null,
    val meals: List<PlanMeal>,
    // Plan lifecycle (V3-D3): "review" = imported, not yet reviewed (stamped by the
    // async parse-save); "ready" = active. Default "ready" so every saved doc is
    // explicit; absent on pre-0.7.0 docs reads as "ready" (contract).
    val status: String = "ready",
    // Plan-level nutritionist guidance transcribed from the document (V3-D7/D11).
    val note: String? = null,
    val hydration: Hydration? = null,
    val supplements: List<Supplement>? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PlanMeal(
    val name: String,
    // Server-generated stable meal id ("m-1"…"m-N" in document order), assigned at
    // save time only (no backfill, CEO A2) — the target of MealDetail.planMealId.
    val id: String? = null,
    val time: String? = null,
    val items: List<PlanItem>,
    // Per-meal kcal for the DEFAULT composition — stated report number or estimate (V3-D7).
    val kcal: Double? = null,
    // The meal's "Observações", transcribed.
    val note: String? = null,
    // Alternative complete compositions ("Opção 2 – Brunch"), each a full item list (V3-D8).
    val options: List<MealOption>? = null,
    // The user's usual composition: absent = the meal's own items; k = options[k] (V3-D4).
    val usualOptionIndex: Int? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PlanItem(
    val name: String,
    // Server-generated stable id ("it-1"…"it-N" in document order, base items then
    // option items per meal — V3-D8), assigned at save time only (no backfill, CEO A2)
    // — the key of the portions overlay.
    val id: String? = null,
    val quantity: Double? = null,
    val unit: String? = null,
    val nutritionPerUnit: MacroTotals? = null,
    // Per-single-unit micros (BE-039), same per-unit basis as nutritionPerUnit.
    val microsPerUnit: MicrosPerUnit? = null,
    // Server-authoritative slider bounds from the deterministic heuristic (BE-037);
    // recomputed on every save/parse from the EFFECTIVE qty/unit (V3-D9), client value discarded.
    val portion: PortionBounds? = null,
    // Gram/ml equivalent when the plan states a count plus grams ("1 unidade (100g)" → 100).
    val grams: Double? = null,
    // Full substitution list in document order; swaps carry NO nutrition (V3-D5/D6).
    val swaps: List<SwapOption>? = null,
    // The user's usual for this item: absent = the original item; k = swaps[k] (V3-D4/D9).
    val usualSwapIndex: Int? = null,
)

/** An alternative complete composition for a meal (contract MealOption, V3-D8). */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class MealOption(
    val name: String,
    val kcal: Double? = null,
    val items: List<PlanItem>,
)

/**
 * One entry of an item's substitution list (contract SwapOption, V3-D5). Carries NO
 * nutrition — a swap at its stated quantity is equivalent to the original item's total;
 * the app derives macros by equivalence. "À vontade" entries have no quantity.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class SwapOption(
    val name: String,
    val quantity: Double? = null,
    val unit: String? = null,
    val grams: Double? = null,
)

/** Daily water target stated by the plan (contract Hydration). */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class Hydration(
    val mlPerDay: Double,
    val note: String? = null,
)

/** A supplement prescription transcribed from the plan (contract Supplement, V3-D10). */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class Supplement(
    val name: String,
    val dose: String? = null,
    val timing: String? = null,
    val duration: String? = null,
)

/** Per-1-unit micronutrient estimates for a plan item (contract MicrosPerUnit). All optional. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class MicrosPerUnit(
    val fiberG: Double? = null,
    val sodiumMg: Double? = null,
    val ironMg: Double? = null,
    val calciumMg: Double? = null,
)

/** Portion-adjust slider bounds (contract PortionBounds); all whole numbers by construction. */
data class PortionBounds(
    val min: Double,
    val max: Double,
    val step: Double,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class TrainingProgramDraft(
    val summary: String,
    val splitDescription: String? = null,
    val days: List<ProgramDay>,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ProgramDay(
    val name: String,
    val exercises: List<PlanExercise>? = null,
    // Optional per-day energy estimate (v3 reconciliation) — powers the workout tab's "~{kcal}" line.
    val kcalEstimate: Double? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PlanExercise(
    val name: String,
    val sets: Int? = null,
    val reps: Int? = null,
    val loadKg: Double? = null,
    // Per-exercise muscles + roles (BE-040/D-11), normalized by PlanParseService.
    val muscles: List<String>? = null,
    val muscleRoles: List<MuscleRole>? = null,
)
