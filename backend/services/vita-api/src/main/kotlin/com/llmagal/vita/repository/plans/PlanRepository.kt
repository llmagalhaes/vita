package com.llmagal.vita.repository.plans

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

/**
 * The two versioned-doc tables (V004). The name is a fixed enum, never user
 * input, so interpolating it into the SQL is injection-safe — one repository
 * serves both the eating plan and the training program (identical shape).
 */
enum class PlanTable(
    val table: String,
) {
    EATING_PLAN("eating_plan"),
    TRAINING_PROGRAM("training_program"),
}

/** One stored version; [docEnc] is still the C3 blob (per-user DEK). */
data class StoredDoc(
    val id: UUID,
    val createdAt: OffsetDateTime,
    val docEnc: ByteArray,
)

/**
 * Versioned encrypted plan/program docs (BE-019/BE-020). Blob-only — the
 * repository never sees plaintext; encryption and doc typing live in the
 * service. Newest = highest (created_at, id).
 */
@Repository
class PlanRepository(
    private val jdbc: JdbcTemplate,
) {
    /** Append a new version. */
    fun insert(
        t: PlanTable,
        userId: UUID,
        docEnc: ByteArray,
    ): StoredDoc =
        jdbc
            .query(
                "INSERT INTO ${t.table} (user_id, doc_enc) VALUES (?, ?) RETURNING $COLS",
                ROW,
                userId,
                docEnc,
            ).first()

    /** Newest version, or null if the user has none. */
    fun current(
        t: PlanTable,
        userId: UUID,
    ): StoredDoc? =
        jdbc
            .query("SELECT $COLS FROM ${t.table} WHERE user_id = ? $NEWEST_FIRST LIMIT 1", ROW, userId)
            .firstOrNull()

    /** Re-encrypt the newest version in place (edit current). Null if none exists → 404. */
    fun updateCurrent(
        t: PlanTable,
        userId: UUID,
        docEnc: ByteArray,
    ): StoredDoc? =
        jdbc
            .query(
                """
                UPDATE ${t.table} SET doc_enc = ?
                WHERE id = (SELECT id FROM ${t.table} WHERE user_id = ? $NEWEST_FIRST LIMIT 1)
                RETURNING $COLS
                """.trimIndent(),
                ROW,
                docEnc,
                userId,
            ).firstOrNull()

    /** The ≤[limit] stored versions, newest first. */
    fun history(
        t: PlanTable,
        userId: UUID,
        limit: Int,
    ): List<StoredDoc> {
        val sql = "SELECT $COLS FROM ${t.table} WHERE user_id = ? $NEWEST_FIRST LIMIT ?"
        return jdbc.query(sql, ROW, userId, limit)
    }

    /** Cap enforcement: keep the newest [keep] versions, drop the rest. */
    fun trim(
        t: PlanTable,
        userId: UUID,
        keep: Int,
    ) {
        jdbc.update(
            """
            DELETE FROM ${t.table}
            WHERE user_id = ?
              AND id NOT IN (SELECT id FROM ${t.table} WHERE user_id = ? $NEWEST_FIRST LIMIT ?)
            """.trimIndent(),
            userId,
            userId,
            keep,
        )
    }

    private companion object {
        const val COLS = "id, created_at, doc_enc"
        const val NEWEST_FIRST = "ORDER BY created_at DESC, id DESC"

        val ROW =
            RowMapper { rs, _ ->
                StoredDoc(
                    id = rs.getObject("id", UUID::class.java),
                    createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                    docEnc = rs.getBytes("doc_enc"),
                )
            }
    }
}
