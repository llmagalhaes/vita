package com.llmagal.vita.controller.ai

import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.service.ai.JobStatusResponse
import com.llmagal.vita.service.ai.ParseQuota
import com.llmagal.vita.service.ai.PlanImportService
import com.llmagal.vita.service.ai.PlanParseService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * POST /v1/parse/eating-plan and /v1/parse/training-program — onboarding steps 3–4
 * (BE-015, ADR-0011). Stateless, drafts never persisted (ADR-0005). Same per-user daily
 * ceiling as capture parse (BE-014): over the limit → 429 + Retry-After before the model
 * call. On timeout/failure the app falls back to manual entry.
 */
@RestController
class PlanParseController(
    private val service: PlanParseService,
    private val imports: PlanImportService,
    private val quota: ParseQuota,
) {
    /**
     * v3 (BREAKING): the eating-plan parse is async — a full plan takes minutes (V3-D2).
     * 202 + jobId, parses in the background, and on success SAVES the plan as status "review".
     * The app polls [job]. A running import already in flight → 409.
     */
    @PostMapping("/v1/parse/eating-plan")
    fun eatingPlan(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: PlanImportRequest,
    ): ResponseEntity<Any> {
        validate(body)
        val userId = UUID.fromString(jwt.subject)
        quota.tryAcquire(userId)?.let { return tooManyRequests(it) }
        val jobId = imports.accept(userId, body)
        return ResponseEntity.accepted().body(mapOf("jobId" to jobId))
    }

    @GetMapping("/v1/parse/eating-plan/jobs/{jobId}")
    fun job(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable jobId: UUID,
    ): JobStatusResponse = imports.poll(UUID.fromString(jwt.subject), jobId)

    @PostMapping("/v1/parse/training-program")
    fun trainingProgram(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: PlanImportRequest,
    ): ResponseEntity<Any> {
        validate(body)
        quota.tryAcquire(UUID.fromString(jwt.subject))?.let { return tooManyRequests(it) }
        return ResponseEntity.ok(service.parseTrainingProgram(body))
    }

    /** Contract PlanImportRequest: exactly one of `text` or `fileRef`; text ≤ 8000 chars. */
    private fun validate(body: PlanImportRequest) {
        val text = body.text?.takeIf { it.isNotBlank() }
        val fileRef = body.fileRef?.takeIf { it.isNotBlank() }
        if ((text == null) == (fileRef == null)) {
            badRequest("Exactly one of text or fileRef is required.")
        }
        if (text != null && text.length > MAX_TEXT) badRequest("text must be at most $MAX_TEXT characters.")
    }

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_TEXT = 8000
    }
}
