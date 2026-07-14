package com.llmagal.vita.plans.controller

import tools.jackson.databind.JsonNode
import java.time.OffsetDateTime
import java.util.UUID

/**
 * One stored version for the `…/history` responses (BE-019/BE-020). `doc` is the
 * decrypted plan/program document (EatingPlanDraft / TrainingProgramDraft shape)
 * echoed back as-is — history versions are frozen, so it is display-only.
 */
data class PlanVersion(
    val id: UUID,
    val createdAt: OffsetDateTime,
    val doc: JsonNode,
)
