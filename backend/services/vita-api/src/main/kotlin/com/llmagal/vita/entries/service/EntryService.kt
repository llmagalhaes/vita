package com.llmagal.vita.entries.service

import com.llmagal.vita.crypto.service.CryptoService
import com.llmagal.vita.entries.controller.EntryPage
import com.llmagal.vita.entries.controller.EntryType
import com.llmagal.vita.entries.controller.LogEntry
import com.llmagal.vita.entries.controller.NewEntry
import com.llmagal.vita.entries.controller.UpdateEntry
import com.llmagal.vita.entries.repository.DayRange
import com.llmagal.vita.entries.repository.Denorm
import com.llmagal.vita.entries.repository.EntryCursor
import com.llmagal.vita.entries.repository.EntryRepository
import com.llmagal.vita.entries.repository.InsertData
import com.llmagal.vita.entries.repository.StoredEntry
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.security.MessageDigest
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID

/** Outcome of a create, mapped to 201 / 200 / 409 by the controller. */
sealed interface EntryResult {
    data class Created(
        val entry: LogEntry,
    ) : EntryResult

    data class Replay(
        val entry: LogEntry,
    ) : EntryResult

    data object Conflict : EntryResult
}

/**
 * The single write path to the log (BE-011). Validates the typed detail against
 * `type`, recomputes meal totals server-side, extracts C2 denormalized numbers,
 * encrypts C3 content (detail, source phrase) with the per-user DEK (ADR-0003),
 * and enforces Idempotency-Key semantics (same key + same body → replay; same
 * key + different body → 409).
 *
 * `mapper` is the Boot-configured Jackson 3 mapper (same one the HTTP converter
 * uses), so typed round-trips of the detail behave identically to the wire.
 */
@Service
@Suppress("TooManyFunctions") // whole entries read+write path in one class, reusing private helpers
class EntryService(
    private val repo: EntryRepository,
    private val crypto: CryptoService,
    private val mapper: JsonMapper,
) {
    fun create(
        userId: UUID,
        idempotencyKey: String,
        new: NewEntry,
    ): EntryResult {
        // Normalize the detail (typed round-trip + meal-total recompute) so both
        // storage and the idempotency hash are canonical, whitespace-independent.
        val detail = normalize(new.type, new.detail)
        val denorm = denormalize(new.type, detail)
        val requestHash = hash(new, detail)

        val data =
            InsertData(
                userId = userId,
                type = new.type.name,
                occurredAt = new.occurredAt,
                inputMethod = new.inputMethod,
                isEstimate = new.isEstimate,
                sourcePhraseEnc = new.sourcePhrase?.let { crypto.encryptForUser(userId, it.toByteArray()) },
                detailEnc = crypto.encryptForUser(userId, mapper.writeValueAsBytes(detail)),
                denorm = denorm,
                idempotencyKey = idempotencyKey,
                requestHash = requestHash,
            )

        val inserted = repo.insertIfAbsent(data)
        if (inserted != null) return EntryResult.Created(toLogEntry(userId, inserted))

        // Key already used: replay only if the body matches, otherwise 409.
        val existing =
            repo.findByKey(userId, idempotencyKey)
                ?: error("Idempotency conflict but no existing row for $idempotencyKey")
        return if (existing.requestHash.contentEquals(requestHash)) {
            EntryResult.Replay(toLogEntry(userId, existing))
        } else {
            EntryResult.Conflict
        }
    }

    /** GET one entry; another user's row (or a missing one) is 404. */
    fun get(
        userId: UUID,
        id: UUID,
    ): LogEntry = toLogEntry(userId, repo.findByIdForUser(userId, id) ?: notFound())

    /** GET the timeline: newest first, optional single day, cursor-paginated. */
    fun list(
        userId: UUID,
        date: LocalDate?,
        tz: String?,
        cursor: String?,
        limit: Int,
    ): EntryPage {
        val range = dayRange(date, tz)
        val keyset = cursor?.let(::decodeCursor)
        val capped = limit.coerceIn(1, MAX_LIMIT)
        val rows = repo.list(userId, range, keyset, capped + 1)
        val hasMore = rows.size > capped
        val page = if (hasMore) rows.take(capped) else rows
        val next = if (hasMore) encodeCursor(page.last()) else null
        return EntryPage(page.map { toLogEntry(userId, it) }, next)
    }

    /**
     * PATCH: replace occurredAt and/or the whole detail. `type` is immutable, so
     * a new detail is validated against the stored type. updated_at is bumped.
     */
    fun update(
        userId: UUID,
        id: UUID,
        req: UpdateEntry,
    ): LogEntry {
        if (req.occurredAt == null && req.detail == null) badRequest("Provide occurredAt or detail.")
        val existing = repo.findByIdForUser(userId, id) ?: notFound()
        val occurredAt = req.occurredAt ?: existing.occurredAt
        val updated =
            if (req.detail == null) {
                repo.updateOccurredAt(userId, id, occurredAt)
            } else {
                val type = EntryType.valueOf(existing.type)
                val detail = normalize(type, req.detail)
                val detailEnc = crypto.encryptForUser(userId, mapper.writeValueAsBytes(detail))
                repo.updateDetail(userId, id, occurredAt, detailEnc, denormalize(type, detail))
            }
        return toLogEntry(userId, updated ?: notFound())
    }

    /** DELETE: hard delete, idempotent (deleting a missing/foreign entry is a no-op). */
    fun delete(
        userId: UUID,
        id: UUID,
    ) = repo.deleteByIdForUser(userId, id)

    private fun dayRange(
        date: LocalDate?,
        tz: String?,
    ): DayRange? {
        if (date == null) return null
        if (tz.isNullOrBlank()) badRequest("tz is required when date is set.")
        val zone =
            try {
                ZoneId.of(tz)
            } catch (_: DateTimeException) {
                badRequest("Unknown timezone: $tz")
            }
        return DayRange(
            start = date.atStartOfDay(zone).toOffsetDateTime(),
            endExclusive = date.plusDays(1).atStartOfDay(zone).toOffsetDateTime(),
        )
    }

    private fun encodeCursor(row: StoredEntry): String =
        Base64
            .getUrlEncoder()
            .withoutPadding()
            .encodeToString("${row.occurredAt.toInstant()}|${row.id}".toByteArray())

    private fun decodeCursor(cursor: String): EntryCursor =
        try {
            val (instant, id) = String(Base64.getUrlDecoder().decode(cursor)).split("|", limit = 2)
            EntryCursor(Instant.parse(instant).atOffset(ZoneOffset.UTC), UUID.fromString(id))
        } catch (_: IllegalArgumentException) {
            badRequest("Invalid cursor.")
        } catch (_: DateTimeException) {
            badRequest("Invalid cursor.")
        }

    private fun notFound(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND)

    /** Parse against the declared type, validate, and (meals) recompute totals. */
    private fun normalize(
        type: EntryType,
        detail: JsonNode,
    ): JsonNode =
        when (type) {
            EntryType.meal -> {
                val meal = read<MealDetail>(detail)
                if (meal.items.isEmpty()) badRequest("A meal needs at least one item.")
                mapper.valueToTree(meal.copy(totals = totalsOf(meal.items)))
            }
            EntryType.water -> {
                val water = read<WaterDetail>(detail)
                if (water.amountMl !in 1..MAX_WATER_ML) badRequest("Water amount must be 1-$MAX_WATER_ML ml.")
                mapper.valueToTree(water)
            }
            EntryType.workout -> {
                val workout = read<WorkoutDetail>(detail)
                if (workout.title.isBlank()) badRequest("A workout needs a title.")
                mapper.valueToTree(workout)
            }
        }

    private fun denormalize(
        type: EntryType,
        detail: JsonNode,
    ): Denorm =
        when (type) {
            EntryType.meal -> {
                val t = read<MealDetail>(detail).totals!!
                Denorm(t.kcal, t.proteinG, t.carbsG, t.fatG, null, null)
            }
            EntryType.water ->
                Denorm(null, null, null, null, read<WaterDetail>(detail).amountMl, null)
            EntryType.workout -> {
                val w = read<WorkoutDetail>(detail)
                Denorm(w.kcal, null, null, null, null, w.durationMin)
            }
        }

    private fun totalsOf(items: List<MealItem>): MacroTotals =
        MacroTotals(
            kcal = items.sumOf { it.kcal },
            proteinG = items.sumOf { it.proteinG ?: 0.0 },
            carbsG = items.sumOf { it.carbsG ?: 0.0 },
            fatG = items.sumOf { it.fatG ?: 0.0 },
        )

    private inline fun <reified T> read(node: JsonNode): T =
        try {
            mapper.treeToValue(node, T::class.java)
        } catch (e: JacksonException) {
            badRequest("detail does not match the entry type: ${e.message}")
        }

    /** Canonical form hashed for idempotency — stable across retries of an identical body. */
    private data class Canonical(
        val type: String,
        val occurredAt: String,
        val inputMethod: String,
        val sourcePhrase: String?,
        val isEstimate: Boolean,
        val detail: JsonNode,
    )

    private fun hash(
        new: NewEntry,
        detail: JsonNode,
    ): ByteArray {
        val canonical =
            Canonical(
                type = new.type.name,
                occurredAt = new.occurredAt.toInstant().toString(),
                inputMethod = new.inputMethod,
                sourcePhrase = new.sourcePhrase,
                isEstimate = new.isEstimate,
                detail = detail,
            )
        return MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(canonical))
    }

    private fun toLogEntry(
        userId: UUID,
        row: StoredEntry,
    ): LogEntry =
        LogEntry(
            id = row.id,
            type = EntryType.valueOf(row.type),
            occurredAt = row.occurredAt,
            inputMethod = row.inputMethod,
            sourcePhrase = row.sourcePhraseEnc?.let { String(crypto.decryptForUser(userId, it)) },
            isEstimate = row.isEstimate,
            detail = mapper.readTree(crypto.decryptForUser(userId, row.detailEnc)),
            source = row.source,
            loggedAt = row.loggedAt,
            updatedAt = row.updatedAt,
        )

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_WATER_ML = 10_000
        const val MAX_LIMIT = 100
    }
}
