package com.llmagal.vita.service.ai

import com.llmagal.vita.model.ai.Draft
import com.llmagal.vita.model.ai.ParseResponse
import com.llmagal.vita.service.plans.PlanService
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.UUID

/**
 * Stateless product-AI parse (BE-013/BE-018, ADR-0005): text or a photo in, draft
 * entries out, nothing persisted. The model produces {type, occurredAt, detail}; the
 * server fills the deterministic fields — inputMethod, isEstimate=true (AI numbers),
 * sourcePhrase — and anchors a missing occurredAt to capturedAt. Unusable output (no
 * drafts / wrong type / missing detail) is a 422.
 *
 * BE-051: when [userId] has a current eating plan, a compact [PlanDigest] of it rides the
 * prompt so a matched meal comes back carrying planMealId/planStatus/planOptionIndex and
 * per-item replacesItemId. Those fields pass through this service untouched (the drafts are
 * never persisted here; POST /entries validates them). No plan, no userId, or no match → the
 * 0.7.0 behaviour verbatim, including the 422 branch.
 */
@Service
class ParseService(
    private val client: ClaudeClient,
    private val metrics: ParseMetrics,
    @param:Value("\${vita.ai.photo-model:claude-sonnet-4-6}") private val photoModel: String,
    private val plans: PlanService,
) {
    private val log = LoggerFactory.getLogger(ParseService::class.java)

    fun parseText(
        text: String,
        capturedAt: OffsetDateTime,
        userId: UUID? = null,
    ): ParseResponse {
        val digest = planDigest(userId)
        val result = call { client.parseText(text, capturedAt, digest) }
        return respond(result, capturedAt, inputMethod = "text", sourcePhrase = text, planAware = digest != null)
    }

    /** Photo parse (BE-018/F3): a plate or gym-whiteboard image + optional caption in, drafts out. */
    fun parsePhoto(
        imageBytes: ByteArray,
        mediaType: String,
        caption: String?,
        capturedAt: OffsetDateTime,
        userId: UUID? = null,
    ): ParseResponse {
        val digest = planDigest(userId)
        val result = call { client.parsePhoto(imageBytes, mediaType, caption, capturedAt, photoModel, digest) }
        return respond(result, capturedAt, inputMethod = "photo", sourcePhrase = caption, planAware = digest != null)
    }

    /** The user's current plan as prompt text, or null (no user, no plan, no ids) → 0.7.0 prompt. */
    private fun planDigest(userId: UUID?): String? = userId?.let { plans.currentEatingPlan(it) }?.let(PlanDigest::of)

    /** Shared tail for both pipelines: map to drafts, record token/cost metrics, 422 if none. */
    @Suppress("LongParameterList") // one call's worth of context; a holder object buys nothing
    private fun respond(
        result: ParseResult,
        capturedAt: OffsetDateTime,
        inputMethod: String,
        sourcePhrase: String?,
        planAware: Boolean,
    ): ParseResponse {
        val drafts =
            (result.output?.drafts ?: emptyList())
                .mapNotNull { toDraft(it, capturedAt, inputMethod, sourcePhrase) }
                .take(MAX_DRAFTS)
        // Tokens were spent whatever the shape of the output — record before the 422 branch.
        val outcome = if (drafts.isEmpty()) "uninterpretable" else "success"
        metrics.record(
            outcome = outcome,
            inputTokens = result.usage.inputTokens,
            outputTokens = result.usage.outputTokens,
        )
        // One INFO line per capture (mirrors PlanParseService): the counters are otherwise trapped
        // in the in-memory SimpleMeterRegistry. `plan=true` marks the runs carrying the digest, so
        // its input-token cost (BE-051 Q4) is queryable in CloudWatch.
        log.info(
            "parse capture={} outcome={} plan={} inputTokens={} outputTokens={}",
            inputMethod,
            outcome,
            planAware,
            result.usage.inputTokens,
            result.usage.outputTokens,
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
