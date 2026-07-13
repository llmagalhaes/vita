package com.llmagal.vita.ai.controller

import com.llmagal.vita.ai.service.ParseQuota
import com.llmagal.vita.ai.service.ParseService
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.util.UUID

/**
 * POST /v1/parse/text — natural language to draft entries (BE-013, ADR-0005).
 * Auth-protected by the resource server; drafts are never persisted server-side.
 * A per-user daily ceiling (BE-014) guards the Claude budget: over the limit the
 * request is rejected before the model call with 429 + Retry-After (RFC 7807).
 * On timeout/failure the app falls back to manual entry.
 */
@RestController
class ParseController(
    private val service: ParseService,
    private val quota: ParseQuota,
) {
    @PostMapping("/v1/parse/text")
    fun parseText(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: ParseTextRequest,
    ): ResponseEntity<Any> {
        val text = body.text?.takeIf { it.isNotBlank() } ?: badRequest("text is required.")
        if (text.length > MAX_TEXT) badRequest("text must be at most $MAX_TEXT characters.")

        quota.tryAcquire(UUID.fromString(jwt.subject))?.let { return tooManyRequests(it) }

        val capturedAt = body.capturedAt ?: OffsetDateTime.now()
        return ResponseEntity.ok(service.parseText(text, capturedAt))
    }

    private fun tooManyRequests(retryAfterSeconds: Long): ResponseEntity<Any> {
        val problem = ProblemDetail.forStatus(HttpStatus.TOO_MANY_REQUESTS)
        problem.title = "Too Many Requests"
        problem.detail = "Daily parse limit reached. Retry after the indicated delay."
        return ResponseEntity
            .status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, retryAfterSeconds.toString())
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem)
    }

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_TEXT = 2000
    }
}
