package com.llmagal.vita.ai.controller

import com.llmagal.vita.ai.service.ParseQuota
import com.llmagal.vita.ai.service.PlanParseService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
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
    private val quota: ParseQuota,
) {
    @PostMapping("/v1/parse/eating-plan")
    fun eatingPlan(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: PlanImportRequest,
    ): ResponseEntity<Any> {
        validate(body)
        quota.tryAcquire(UUID.fromString(jwt.subject))?.let { return tooManyRequests(it) }
        return ResponseEntity.ok(service.parseEatingPlan(body))
    }

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
