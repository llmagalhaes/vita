package com.llmagal.vita.controller.plans

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.TrainingProgramDraft
import com.llmagal.vita.model.plans.PlanVersion
import com.llmagal.vita.repository.plans.PlanTable
import com.llmagal.vita.service.plans.PlanService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.util.UUID

/**
 * Persisted eating plan (/v1/plan) and training program (/v1/program):
 * versioned, editable (BE-019/BE-020, ADR-0011 ext). The two are structurally
 * identical (versioned encrypted docs), so one controller serves both to avoid
 * a duplicate mirror class — they differ only in path, body type and table.
 *
 * - GET            → current (newest) version; 404 if the user has none yet.
 * - POST (import)  → a new version; caps history at vita.plans.history-max.
 * - PUT  (edit)    → full-doc replace of the current version (re-encrypted);
 *                    404 if there is no current version to edit.
 * - GET  /history  → the ≤max stored versions (frozen; no restore in v1).
 */
@RestController
@Suppress("TooManyFunctions") // plan + program (mirror) on one controller; 4 endpoints each + 3 helpers
class PlanController(
    private val plans: PlanService,
) {
    // ── Eating plan ────────────────────────────────────────────────────────
    @GetMapping("/v1/plan")
    fun currentPlan(
        @AuthenticationPrincipal jwt: Jwt,
    ): JsonNode = plans.current(PlanTable.EATING_PLAN, uid(jwt)) ?: notFound()

    @PostMapping("/v1/plan")
    fun importPlan(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: EatingPlanDraft,
    ): ResponseEntity<JsonNode> {
        validatePlan(body)
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(plans.importVersion(PlanTable.EATING_PLAN, uid(jwt), body))
    }

    @PutMapping("/v1/plan")
    fun editPlan(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: EatingPlanDraft,
    ): JsonNode {
        validatePlan(body)
        return plans.edit(PlanTable.EATING_PLAN, uid(jwt), body) ?: notFound()
    }

    @GetMapping("/v1/plan/history")
    fun planHistory(
        @AuthenticationPrincipal jwt: Jwt,
    ): List<PlanVersion> = plans.history(PlanTable.EATING_PLAN, uid(jwt))

    // ── Training program (mechanical mirror) ─────────────────────────────────
    @GetMapping("/v1/program")
    fun currentProgram(
        @AuthenticationPrincipal jwt: Jwt,
    ): JsonNode = plans.current(PlanTable.TRAINING_PROGRAM, uid(jwt)) ?: notFound()

    @PostMapping("/v1/program")
    fun importProgram(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: TrainingProgramDraft,
    ): ResponseEntity<JsonNode> {
        validateProgram(body)
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(plans.importVersion(PlanTable.TRAINING_PROGRAM, uid(jwt), body))
    }

    @PutMapping("/v1/program")
    fun editProgram(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: TrainingProgramDraft,
    ): JsonNode {
        validateProgram(body)
        return plans.edit(PlanTable.TRAINING_PROGRAM, uid(jwt), body) ?: notFound()
    }

    @GetMapping("/v1/program/history")
    fun programHistory(
        @AuthenticationPrincipal jwt: Jwt,
    ): List<PlanVersion> = plans.history(PlanTable.TRAINING_PROGRAM, uid(jwt))

    /** Contract EatingPlanDraft minimums (mirror the schema so bad edits are 400, not bad data). */
    private fun validatePlan(body: EatingPlanDraft) {
        if (body.summary.isBlank()) badRequest("summary is required.")
        if (body.meals.isEmpty()) badRequest("A plan needs at least one meal.")
        if (body.meals.any { it.items.isEmpty() }) badRequest("Each meal needs at least one item.")
    }

    /** Contract TrainingProgramDraft minimums. */
    private fun validateProgram(body: TrainingProgramDraft) {
        if (body.summary.isBlank()) badRequest("summary is required.")
        if (body.days.isEmpty()) badRequest("A program needs at least one day.")
    }

    private fun uid(jwt: Jwt): UUID = UUID.fromString(jwt.subject)

    private fun notFound(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND)

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
}
