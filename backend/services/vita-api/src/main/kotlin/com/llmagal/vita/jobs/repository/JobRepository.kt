package com.llmagal.vita.jobs.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/** A claimed job row; payload carries ids only (never C3 content, ADR-0007). */
data class Job(
    val id: UUID,
    val type: String,
    val payload: Map<String, String>,
)

/**
 * The ADR-0007 Postgres job queue. Generic on purpose but no framework: one
 * table, claim with FOR UPDATE SKIP LOCKED, mark done or reschedule for retry.
 */
@Repository
class JobRepository(
    private val jdbc: JdbcTemplate,
    private val json: JsonMapper,
) {
    fun enqueue(
        type: String,
        payload: Map<String, String>,
        runAfter: Instant,
    ) {
        jdbc.update(
            "INSERT INTO job (type, payload, run_after) VALUES (?, ?::jsonb, ?)",
            type,
            json.writeValueAsString(payload),
            Timestamp.from(runAfter),
        )
    }

    /**
     * Claim up to [limit] due jobs, skipping rows another worker already holds.
     * MUST run inside the worker's transaction — the row locks release on commit.
     */
    fun claimDue(limit: Int): List<Job> =
        jdbc.query(
            """
            SELECT id, type, payload::text AS payload
            FROM job
            WHERE state = 'pending' AND run_after <= now()
            ORDER BY run_after
            FOR UPDATE SKIP LOCKED
            LIMIT ?
            """.trimIndent(),
            rowMapper,
            limit,
        )

    fun markDone(id: UUID) {
        jdbc.update("UPDATE job SET state = 'done', updated_at = now() WHERE id = ?", id)
    }

    /**
     * Retry bookkeeping: bump attempts; give up (state='failed') at [maxAttempts],
     * otherwise stay pending and back off a minute before the next claim.
     */
    fun recordFailure(
        id: UUID,
        error: String,
        maxAttempts: Int,
    ) {
        jdbc.update(
            """
            UPDATE job SET
                attempts   = attempts + 1,
                last_error = ?,
                state      = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END,
                run_after  = now() + interval '1 minute',
                updated_at = now()
            WHERE id = ?
            """.trimIndent(),
            error.take(MAX_ERROR_LEN),
            maxAttempts,
            id,
        )
    }

    private val rowMapper =
        RowMapper { rs, _ ->
            @Suppress("UNCHECKED_CAST")
            Job(
                id = rs.getObject("id", UUID::class.java),
                type = rs.getString("type"),
                payload = json.readValue(rs.getString("payload"), Map::class.java) as Map<String, String>,
            )
        }

    private companion object {
        const val MAX_ERROR_LEN = 1000
    }
}
