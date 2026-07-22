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
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PlanMeal(
    val name: String,
    val time: String? = null,
    val items: List<PlanItem>,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PlanItem(
    val name: String,
    // Server-generated stable id ("it-1"…"it-N" in document order), assigned at
    // save time only (no backfill, CEO A2) — the key of the portions overlay.
    val id: String? = null,
    val quantity: Double? = null,
    val unit: String? = null,
    val nutritionPerUnit: MacroTotals? = null,
    // Per-single-unit micros (BE-039), same per-unit basis as nutritionPerUnit.
    val microsPerUnit: MicrosPerUnit? = null,
    // Server-authoritative slider bounds from the deterministic heuristic (BE-037);
    // recomputed on every save/parse, client-sent value discarded.
    val portion: PortionBounds? = null,
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
