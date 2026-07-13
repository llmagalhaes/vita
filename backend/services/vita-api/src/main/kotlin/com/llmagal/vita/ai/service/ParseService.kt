package com.llmagal.vita.ai.service

import com.llmagal.vita.ai.client.ClaudeClient
import com.llmagal.vita.ai.client.ToolDraft
import com.llmagal.vita.ai.controller.Draft
import com.llmagal.vita.ai.controller.ParseResponse
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * Stateless natural-language parse (BE-013, ADR-0005): text in, draft entries out,
 * nothing persisted. The model produces {type, occurredAt, detail}; the server
 * fills the deterministic fields — inputMethod=text, isEstimate=true (AI numbers),
 * sourcePhrase=the user's words — and anchors a missing occurredAt to capturedAt.
 * Unusable output (no drafts / wrong type / missing detail) is a 422.
 */
@Service
class ParseService(
    private val client: ClaudeClient,
    private val metrics: ParseMetrics,
) {
    fun parseText(
        text: String,
        capturedAt: OffsetDateTime,
    ): ParseResponse {
        val result =
            try {
                client.parseText(text, capturedAt)
            } catch (e: RestClientException) {
                metrics.record("error", 0, 0)
                throw e
            }
        val drafts =
            (result.output?.drafts ?: emptyList())
                .mapNotNull { toDraft(text, capturedAt, it) }
                .take(MAX_DRAFTS)
        // Tokens were spent whatever the shape of the output — record before the 422 branch.
        metrics.record(
            outcome = if (drafts.isEmpty()) "uninterpretable" else "success",
            inputTokens = result.usage.inputTokens,
            outputTokens = result.usage.outputTokens,
        )
        if (drafts.isEmpty()) uninterpretable()
        return ParseResponse(drafts)
    }

    private fun toDraft(
        text: String,
        capturedAt: OffsetDateTime,
        t: ToolDraft,
    ): Draft? {
        val type = t.type?.lowercase()
        val detail = t.detail
        if (type == null || type !in ALLOWED_TYPES || detail == null) return null
        return Draft(
            type = type,
            occurredAt = parseOccurredAt(t.occurredAt) ?: capturedAt,
            inputMethod = "text",
            sourcePhrase = text,
            isEstimate = true,
            detail = detail,
        )
    }

    /** Anchored to capturedAt when the model omitted or mangled the timestamp. */
    private fun parseOccurredAt(raw: String?): OffsetDateTime? =
        raw?.let {
            try {
                OffsetDateTime.parse(it)
            } catch (_: DateTimeParseException) {
                null
            }
        }

    private fun uninterpretable(): Nothing =
        throw ResponseStatusException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "The text could not be interpreted as a meal, water, or workout.",
        )

    private companion object {
        const val MAX_DRAFTS = 5
        val ALLOWED_TYPES = setOf("meal", "water", "workout")
    }
}
