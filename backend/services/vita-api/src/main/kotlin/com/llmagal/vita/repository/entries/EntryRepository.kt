package com.llmagal.vita.repository.entries

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

/** C2 denormalized numbers extracted from the detail on write (ADR-0003). */
data class Denorm(
    val kcal: Double?,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
    val waterMl: Int?,
    val durationMin: Int?,
)

/** Everything needed to persist a new entry; C3 blobs already encrypted. */
@Suppress("LongParameterList") // inherent column set for one insert
data class InsertData(
    val userId: UUID,
    val type: String,
    val occurredAt: OffsetDateTime,
    val inputMethod: String,
    val isEstimate: Boolean,
    val sourcePhraseEnc: ByteArray?,
    val detailEnc: ByteArray,
    val denorm: Denorm,
    val idempotencyKey: String,
    val requestHash: ByteArray,
)

/** A persisted row read back for the response; C3 blobs still encrypted. */
@Suppress("LongParameterList") // one row of log_entry
data class StoredEntry(
    val id: UUID,
    val type: String,
    val occurredAt: OffsetDateTime,
    val inputMethod: String,
    val source: String,
    val isEstimate: Boolean,
    val sourcePhraseEnc: ByteArray?,
    val detailEnc: ByteArray,
    val loggedAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
    val requestHash: ByteArray,
)

/** Half-open [start, endExclusive) instant range for a local calendar day. */
data class DayRange(
    val start: OffsetDateTime,
    val endExclusive: OffsetDateTime,
)

/** Keyset cursor for the timeline (occurred_at DESC, id DESC tiebreaker). */
data class EntryCursor(
    val occurredAt: OffsetDateTime,
    val id: UUID,
)

@Repository
class EntryRepository(
    private val jdbc: JdbcTemplate,
) {
    /**
     * Insert unless (user_id, idempotency_key) already exists. Returns the new
     * row on insert, or null on conflict — the caller then compares request
     * hashes to decide replay (200) vs. clash (409).
     */
    fun insertIfAbsent(data: InsertData): StoredEntry? =
        jdbc
            .query(
                """
                INSERT INTO log_entry
                    (user_id, type, occurred_at, input_method, is_estimate,
                     source_phrase_enc, detail_enc,
                     kcal, protein_g, carbs_g, fat_g, water_ml, duration_min,
                     idempotency_key, request_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, idempotency_key) DO NOTHING
                $RETURNING_COLS
                """.trimIndent(),
                ROW_MAPPER,
                data.userId,
                data.type,
                data.occurredAt,
                data.inputMethod,
                data.isEstimate,
                data.sourcePhraseEnc,
                data.detailEnc,
                data.denorm.kcal,
                data.denorm.proteinG,
                data.denorm.carbsG,
                data.denorm.fatG,
                data.denorm.waterMl,
                data.denorm.durationMin,
                data.idempotencyKey,
                data.requestHash,
            ).firstOrNull()

    fun findByKey(
        userId: UUID,
        idempotencyKey: String,
    ): StoredEntry? =
        jdbc
            .query(
                "SELECT $SELECT_COLS FROM log_entry WHERE user_id = ? AND idempotency_key = ?",
                ROW_MAPPER,
                userId,
                idempotencyKey,
            ).firstOrNull()

    /** One entry scoped to its owner; other users' rows read as absent (→ 404). */
    fun findByIdForUser(
        userId: UUID,
        id: UUID,
    ): StoredEntry? =
        jdbc
            .query(
                "SELECT $SELECT_COLS FROM log_entry WHERE user_id = ? AND id = ?",
                ROW_MAPPER,
                userId,
                id,
            ).firstOrNull()

    /**
     * Timeline page: newest first, optionally bounded by a half-open [from,
     * toExclusive) occurredAt window (either end optional) and/or a `type`
     * allow-list (BE-017), walking older than [cursor]. Caller fetches limit+1
     * to detect a next page. All filters run on the (user_id, occurred_at, id)
     * timeline index; `type` is a residual filter (fine at this scale).
     */
    @Suppress("SpreadOperator", "LongParameterList") // dynamic WHERE: one param per optional filter
    fun list(
        userId: UUID,
        from: OffsetDateTime?,
        toExclusive: OffsetDateTime?,
        types: List<String>?,
        cursor: EntryCursor?,
        limit: Int,
    ): List<StoredEntry> {
        val sql = StringBuilder("SELECT $SELECT_COLS FROM log_entry WHERE user_id = ?")
        val params = mutableListOf<Any>(userId)
        if (from != null) {
            sql.append(" AND occurred_at >= ?")
            params += from
        }
        if (toExclusive != null) {
            sql.append(" AND occurred_at < ?")
            params += toExclusive
        }
        if (!types.isNullOrEmpty()) {
            sql.append(" AND type IN (").append(types.joinToString(",") { "?" }).append(")")
            params.addAll(types)
        }
        if (cursor != null) {
            sql.append(" AND (occurred_at, id) < (?, ?)")
            params += cursor.occurredAt
            params += cursor.id
        }
        sql.append(" ORDER BY occurred_at DESC, id DESC LIMIT ?")
        params += limit
        return jdbc.query(sql.toString(), ROW_MAPPER, *params.toTypedArray())
    }

    /** occurredAt-only edit; keeps the detail and its denormalized numbers. */
    fun updateOccurredAt(
        userId: UUID,
        id: UUID,
        occurredAt: OffsetDateTime,
    ): StoredEntry? =
        jdbc
            .query(
                "UPDATE log_entry SET occurred_at = ?, updated_at = now() " +
                    "WHERE user_id = ? AND id = ? $RETURNING_COLS",
                ROW_MAPPER,
                occurredAt,
                userId,
                id,
            ).firstOrNull()

    /** Whole-detail replace (contract PATCH): new blob + re-extracted C2 numbers. */
    fun updateDetail(
        userId: UUID,
        id: UUID,
        occurredAt: OffsetDateTime,
        detailEnc: ByteArray,
        denorm: Denorm,
    ): StoredEntry? =
        jdbc
            .query(
                """
                UPDATE log_entry
                SET occurred_at = ?, detail_enc = ?,
                    kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, water_ml = ?, duration_min = ?,
                    updated_at = now()
                WHERE user_id = ? AND id = ?
                $RETURNING_COLS
                """.trimIndent(),
                ROW_MAPPER,
                occurredAt,
                detailEnc,
                denorm.kcal,
                denorm.proteinG,
                denorm.carbsG,
                denorm.fatG,
                denorm.waterMl,
                denorm.durationMin,
                userId,
                id,
            ).firstOrNull()

    /** Hard delete scoped to the owner. Idempotent — no-op if the row is gone. */
    fun deleteByIdForUser(
        userId: UUID,
        id: UUID,
    ) {
        jdbc.update("DELETE FROM log_entry WHERE user_id = ? AND id = ?", userId, id)
    }

    private companion object {
        const val SELECT_COLS =
            "id, type, occurred_at, input_method, source, is_estimate, " +
                "source_phrase_enc, detail_enc, logged_at, updated_at, request_hash"

        const val RETURNING_COLS = "RETURNING $SELECT_COLS"

        val ROW_MAPPER =
            RowMapper { rs, _ ->
                StoredEntry(
                    id = rs.getObject("id", UUID::class.java),
                    type = rs.getString("type"),
                    occurredAt = rs.getObject("occurred_at", OffsetDateTime::class.java),
                    inputMethod = rs.getString("input_method"),
                    source = rs.getString("source"),
                    isEstimate = rs.getBoolean("is_estimate"),
                    sourcePhraseEnc = rs.getBytes("source_phrase_enc"),
                    detailEnc = rs.getBytes("detail_enc"),
                    loggedAt = rs.getObject("logged_at", OffsetDateTime::class.java),
                    updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
                    requestHash = rs.getBytes("request_hash"),
                )
            }
    }
}
