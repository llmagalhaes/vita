package com.llmagal.vita.entries.repository

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
                "SELECT id, type, occurred_at, input_method, source, is_estimate, " +
                    "source_phrase_enc, detail_enc, logged_at, updated_at, request_hash " +
                    "FROM log_entry WHERE user_id = ? AND idempotency_key = ?",
                ROW_MAPPER,
                userId,
                idempotencyKey,
            ).firstOrNull()

    private companion object {
        const val RETURNING_COLS =
            "RETURNING id, type, occurred_at, input_method, source, is_estimate, " +
                "source_phrase_enc, detail_enc, logged_at, updated_at, request_hash"

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
