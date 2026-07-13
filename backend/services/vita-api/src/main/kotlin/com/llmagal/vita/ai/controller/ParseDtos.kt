package com.llmagal.vita.ai.controller

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty
import java.time.OffsetDateTime

/** POST /v1/parse/text body (contract): verbatim text + optional capture time. */
data class ParseTextRequest(
    val text: String?,
    val capturedAt: OffsetDateTime?,
)

/** Contract ParseResult — response only, never persisted (ADR-0005). */
data class ParseResponse(
    val drafts: List<Draft>,
)

/**
 * A draft entry in the exact shape of the contract NewEntry (the /entries create
 * body), so the app POSTs a confirmed draft as-is. `@JsonProperty("isEstimate")`
 * keeps the wire name stable regardless of the active Jackson version.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class Draft(
    val type: String,
    val occurredAt: OffsetDateTime,
    val inputMethod: String,
    val sourcePhrase: String?,
    @get:JsonProperty("isEstimate") val isEstimate: Boolean,
    val detail: Map<String, Any?>,
)
