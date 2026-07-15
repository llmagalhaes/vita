package com.llmagal.vita.service.ai

import com.llmagal.vita.model.ai.Draft
import com.llmagal.vita.model.ai.ParseResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * Stateless product-AI parse (BE-013/BE-018, ADR-0005): text or a photo in, draft
 * entries out, nothing persisted. The model produces {type, occurredAt, detail}; the
 * server fills the deterministic fields — inputMethod, isEstimate=true (AI numbers),
 * sourcePhrase — and anchors a missing occurredAt to capturedAt. Unusable output (no
 * drafts / wrong type / missing detail) is a 422.
 */
@Service
class ParseService(
    private val client: ClaudeClient,
    private val metrics: ParseMetrics,
    @param:Value("\${vita.ai.photo-model:claude-sonnet-4-6}") private val photoModel: String,
) {
    fun parseText(
        text: String,
        capturedAt: OffsetDateTime,
    ): ParseResponse {
        val result = call { client.parseText(text, capturedAt) }
        return respond(result, capturedAt, inputMethod = "text", sourcePhrase = text)
    }

    /** Photo parse (BE-018/F3): a plate or gym-whiteboard image + optional caption in, drafts out. */
    fun parsePhoto(
        imageBytes: ByteArray,
        mediaType: String,
        caption: String?,
        capturedAt: OffsetDateTime,
    ): ParseResponse {
        val result = call { client.parsePhoto(imageBytes, mediaType, caption, capturedAt, photoModel) }
        return respond(result, capturedAt, inputMethod = "photo", sourcePhrase = caption)
    }

    /** Shared tail for both pipelines: map to drafts, record token/cost metrics, 422 if none. */
    private fun respond(
        result: ParseResult,
        capturedAt: OffsetDateTime,
        inputMethod: String,
        sourcePhrase: String?,
    ): ParseResponse {
        val drafts =
            (result.output?.drafts ?: emptyList())
                .mapNotNull { toDraft(it, capturedAt, inputMethod, sourcePhrase) }
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

    private inline fun call(block: () -> ParseResult): ParseResult =
        try {
            block()
        } catch (e: RestClientException) {
            metrics.record("error", 0, 0)
            throw e
        }

    private fun toDraft(
        t: ToolDraft,
        capturedAt: OffsetDateTime,
        inputMethod: String,
        sourcePhrase: String?,
    ): Draft? {
        val type = t.type?.lowercase()
        val detail = t.detail
        if (type == null || type !in ALLOWED_TYPES || detail == null) return null
        return Draft(
            type = type,
            occurredAt = parseOccurredAt(t.occurredAt) ?: capturedAt,
            inputMethod = inputMethod,
            sourcePhrase = sourcePhrase,
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
