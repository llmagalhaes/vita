package com.llmagal.vita.entries.controller

import com.fasterxml.jackson.annotation.JsonInclude
import tools.jackson.databind.JsonNode
import java.time.OffsetDateTime
import java.util.UUID

/** Contract `type` discriminator — lowercase names are the wire + DB values. */
@Suppress("ktlint:standard:enum-entry-name-case", "EnumNaming")
enum class EntryType { meal, water, workout, checkin }

/**
 * Create payload for POST /v1/entries — also exactly the draft shape the parse
 * endpoints return, so a confirmed draft is POSTed as-is (contract NewEntry).
 * `detail` stays a raw JsonNode on the wire; the service parses it against
 * `type` (Jackson can't discriminate a sibling-typed oneOf cleanly).
 */
data class NewEntry(
    val type: EntryType,
    val occurredAt: OffsetDateTime,
    val inputMethod: String,
    val sourcePhrase: String? = null,
    val isEstimate: Boolean = false,
    val detail: JsonNode,
)

/**
 * PATCH /v1/entries/{id} body — at least one of occurredAt/detail (contract
 * minProperties 1). `type` is immutable, so it is not accepted here; a `detail`
 * replaces the whole detail and must match the entry's existing type.
 */
data class UpdateEntry(
    val occurredAt: OffsetDateTime? = null,
    val detail: JsonNode? = null,
)

/** Contract GET /v1/entries response — a page ordered occurredAt desc. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class EntryPage(
    val items: List<LogEntry>,
    val nextCursor: String?,
)

/** Contract LogEntry = NewEntry + server-set fields. */
@JsonInclude(JsonInclude.Include.NON_NULL)
@Suppress("LongParameterList") // API shape: allOf NewEntry + {id, source, loggedAt, updatedAt}
data class LogEntry(
    val id: UUID,
    val type: EntryType,
    val occurredAt: OffsetDateTime,
    val inputMethod: String,
    val sourcePhrase: String?,
    val isEstimate: Boolean,
    val detail: JsonNode,
    val source: String,
    val loggedAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)
