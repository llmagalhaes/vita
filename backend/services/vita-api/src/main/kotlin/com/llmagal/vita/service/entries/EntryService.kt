package com.llmagal.vita.service.entries

import com.llmagal.vita.model.MacroTotals
import com.llmagal.vita.model.entries.CheckinDetail
import com.llmagal.vita.model.entries.EntryPage
import com.llmagal.vita.model.entries.EntryType
import com.llmagal.vita.model.entries.Exercise
import com.llmagal.vita.model.entries.LogEntry
import com.llmagal.vita.model.entries.MealDetail
import com.llmagal.vita.model.entries.MealItem
import com.llmagal.vita.model.entries.NewEntry
import com.llmagal.vita.model.entries.UpdateEntry
import com.llmagal.vita.model.entries.WaterDetail
import com.llmagal.vita.model.entries.WorkoutDetail
import com.llmagal.vita.repository.entries.DayRange
import com.llmagal.vita.repository.entries.Denorm
import com.llmagal.vita.repository.entries.EntryCursor
import com.llmagal.vita.repository.entries.EntryRepository
import com.llmagal.vita.repository.entries.InsertData
import com.llmagal.vita.repository.entries.StoredEntry
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
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
import java.time.OffsetDateTime
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
        if (new.inputMethod !in INPUT_METHODS) badRequest("Unknown inputMethod: ${new.inputMethod}")
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
                sourcePhraseEnc =
                    new.sourcePhrase?.let {
                        crypto.encryptForUser(userId, AadContext.ENTRY_SOURCE_PHRASE, it.toByteArray())
                    },
                detailEnc = crypto.encryptForUser(userId, AadContext.ENTRY_DETAIL, mapper.writeValueAsBytes(detail)),
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

    /**
     * GET the timeline: newest first, cursor-paginated. Filters (BE-017):
     * `date`+`tz` for a single local day (unchanged from v0.3.0), OR a half-open
     * `[from, to)` occurredAt window — the two are mutually exclusive. A CSV
     * `type` allow-list narrows either, and is validated (unknown value → 400).
     */
    @Suppress("LongParameterList") // contract query params, each 1:1 with the OpenAPI spec
    fun list(
        userId: UUID,
        date: LocalDate?,
        tz: String?,
        from: OffsetDateTime?,
        to: OffsetDateTime?,
        types: List<String>?,
        cursor: String?,
        limit: Int,
    ): EntryPage {
        if (date != null && (from != null || to != null)) {
            badRequest("date cannot be combined with from/to.")
        }
        val (rangeFrom, rangeToExclusive) =
            if (date != null) {
                val range = dayRange(date, tz)!!
                range.start to range.endExclusive
            } else {
                from to to
            }
        val keyset = cursor?.let(::decodeCursor)
        val capped = limit.coerceIn(1, MAX_LIMIT)
        val rows = repo.list(userId, rangeFrom, rangeToExclusive, validTypes(types), keyset, capped + 1)
        val hasMore = rows.size > capped
        val page = if (hasMore) rows.take(capped) else rows
        val next = if (hasMore) encodeCursor(page.last()) else null
        return EntryPage(page.map { toLogEntry(userId, it) }, next)
    }

    /** CSV `type` filter: null/empty means no filter; any unknown value is a 400. */
    private fun validTypes(types: List<String>?): List<String>? {
        if (types.isNullOrEmpty()) return null
        val unknown = types.filterNot { it in FILTERABLE_TYPES }
        if (unknown.isNotEmpty()) badRequest("Unknown type filter: ${unknown.joinToString()}")
        return types
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
                val detailEnc = crypto.encryptForUser(userId, AadContext.ENTRY_DETAIL, mapper.writeValueAsBytes(detail))
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
                meal.items.forEach(::validateItem)
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
                workout.durationMin?.let { if (it < 1) badRequest("durationMin must be >= 1.") }
                nonNegative("workout kcal", workout.kcal)
                workout.exercises?.forEach(::validateExercise)
                // Closed-vocabulary muscle map: model output onto the 11 silhouettes,
                // known aliases folded in, anything unmappable dropped. Applied to the
                // workout-level list AND each exercise's list (same vocabulary).
                val exercises = workout.exercises?.map { it.copy(muscles = mapMuscles(it.muscles)) }
                mapper.valueToTree(workout.copy(muscles = mapMuscles(workout.muscles), exercises = exercises))
            }
            EntryType.checkin -> {
                // Server-opaque: validate the fields are present, then store verbatim.
                val c = read<CheckinDetail>(detail)
                if (c.habitId.isBlank()) badRequest("A check-in needs a habitId.")
                if (c.habitName.isBlank()) badRequest("A check-in needs a habitName.")
                if (c.kind.isBlank()) badRequest("A check-in needs a kind.")
                if (c.answer.isBlank()) badRequest("A check-in needs an answer.")
                mapper.valueToTree(c)
            }
        }

    /** Contract MealItem minimums — kcal/macros >= 0 (mirror the log_entry CHECKs → 400 not 500). */
    private fun validateItem(item: MealItem) {
        nonNegative("item kcal", item.kcal)
        nonNegative("item proteinG", item.proteinG)
        nonNegative("item carbsG", item.carbsG)
        nonNegative("item fatG", item.fatG)
    }

    /** Contract Exercise minimums — sets/reps >= 1, loadKg >= 0. */
    private fun validateExercise(ex: Exercise) {
        ex.sets?.let { if (it < 1) badRequest("exercise sets must be >= 1.") }
        ex.reps?.let { if (it < 1) badRequest("exercise reps must be >= 1.") }
        nonNegative("exercise loadKg", ex.loadKg)
    }

    private fun nonNegative(
        field: String,
        value: Double?,
    ) {
        if (value != null && value < 0) badRequest("$field must be >= 0.")
    }

    /** One muscle string → contract vocabulary, or null if unmappable (dropped). */
    private fun mapMuscle(raw: String): String? {
        val m = raw.trim().lowercase()
        return if (m in MUSCLES) m else MUSCLE_ALIASES[m]
    }

    /** A raw muscle list → distinct contract-vocabulary list, or null if none survive. */
    private fun mapMuscles(raw: List<String>?): List<String>? {
        val mapped = raw?.mapNotNull(::mapMuscle)?.distinct()
        return mapped?.takeIf { it.isNotEmpty() }
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
            // Check-ins carry no aggregatable numbers.
            EntryType.checkin -> Denorm(null, null, null, null, null, null)
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
            sourcePhrase =
                row.sourcePhraseEnc?.let { String(crypto.decryptForUser(userId, AadContext.ENTRY_SOURCE_PHRASE, it)) },
            isEstimate = row.isEstimate,
            detail = mapper.readTree(crypto.decryptForUser(userId, AadContext.ENTRY_DETAIL, row.detailEnc)),
            source = row.source,
            loggedAt = row.loggedAt,
            updatedAt = row.updatedAt,
        )

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_WATER_ML = 10_000
        const val MAX_LIMIT = 100

        // Accepted `type` filter values — every entry type (checkin now real, BE-024).
        val FILTERABLE_TYPES: Set<String> = EntryType.entries.map { it.name }.toSet()

        // Contract InputMethod enum — the wire values a create may carry.
        val INPUT_METHODS = setOf("voice", "text", "photo", "tap", "checkin", "import")

        // Contract WorkoutDetail.muscles closed vocabulary (11 body-map silhouettes)…
        val MUSCLES =
            setOf(
                "chest",
                "back",
                "shoulders",
                "biceps",
                "triceps",
                "forearms",
                "core",
                "glutes",
                "quads",
                "hamstrings",
                "calves",
            )

        // …plus the aliases the contract folds in; anything else is dropped.
        val MUSCLE_ALIASES = mapOf("lats" to "back", "traps" to "back", "abs" to "core", "obliques" to "core")
    }
}
