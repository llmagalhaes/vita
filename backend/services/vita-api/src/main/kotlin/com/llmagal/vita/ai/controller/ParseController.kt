package com.llmagal.vita.ai.controller

import com.llmagal.vita.ai.service.ParseService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime

/**
 * POST /v1/parse/text — natural language to draft entries (BE-013, ADR-0005).
 * Auth-protected by the resource server; drafts are never persisted server-side.
 * On timeout/failure the app falls back to manual entry (ClaudeClient surfaces
 * the upstream error).
 */
@RestController
class ParseController(
    private val service: ParseService,
) {
    @PostMapping("/v1/parse/text")
    fun parseText(
        @RequestBody body: ParseTextRequest,
    ): ParseResponse {
        val text = body.text?.takeIf { it.isNotBlank() } ?: badRequest("text is required.")
        if (text.length > MAX_TEXT) badRequest("text must be at most $MAX_TEXT characters.")
        val capturedAt = body.capturedAt ?: OffsetDateTime.now()
        return service.parseText(text, capturedAt)
    }

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_TEXT = 2000
    }
}
