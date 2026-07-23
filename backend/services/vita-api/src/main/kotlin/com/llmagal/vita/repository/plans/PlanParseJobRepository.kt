package com.llmagal.vita.repository.plans

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

/** Wire/DB states of an async eating-plan import job (V3-D2). Lowercase = contract/DB values. */
@Suppress("ktlint:standard:enum-entry-name-case", "EnumNaming")
enum class JobState { running, done, failed }

/** One import-job row (V009). State only — no input, no result (the result IS the saved plan). */
data class PlanParseJob(
    val id: UUID,
    val userId: UUID,
    val state: JobState,
    val failure: String?,
    val updatedAt: OffsetDateTime,
)

/**
 * The async eating-plan import tracker (BE-044, V009). Tracks only job state — the parse
 * runs in-process ([PlanImportWorker]) and its result is the saved eating_plan version, so
 * the row never holds document text or PII (failure is a fixed server phrase).
 */
@Repository
class PlanParseJobRepository(
    private val jdbc: JdbcTemplate,
) {
    fun insertRunning(
        id: UUID,
        userId: UUID,
    ) {
        jdbc.update("INSERT INTO plan_parse_job (id, user_id, state) VALUES (?, ?, 'running')", id, userId)
    }

    /** This user's newest job, whatever its state, or null. */
    fun newest(userId: UUID): PlanParseJob? =
        jdbc
            .query(
                "SELECT $COLS FROM plan_parse_job WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
                ROW,
                userId,
            ).firstOrNull()

    /** The user's own job by id (404 for anyone else — no ownership leak). */
    fun find(
        id: UUID,
        userId: UUID,
    ): PlanParseJob? =
        jdbc
            .query("SELECT $COLS FROM plan_parse_job WHERE id = ? AND user_id = ?", ROW, id, userId)
            .firstOrNull()

    /**
     * Move a job out of `running` to a terminal state. Conditional on the row still being running
     * (every caller transitions FROM running), so a late worker can't flip a failed row back to
     * done and the poll's stale-flip can't clobber a just-written terminal state — last writer
     * from `running` wins, no un-terminalizing. A no-op UPDATE (0 rows) means someone already won.
     */
    fun markState(
        id: UUID,
        state: JobState,
        failure: String? = null,
    ) {
        jdbc.update(
            "UPDATE plan_parse_job SET state = ?::text, failure = ?, updated_at = now() " +
                "WHERE id = ? AND state = 'running'",
            state.name,
            failure,
            id,
        )
    }

    private companion object {
        const val COLS = "id, user_id, state, failure, updated_at"

        val ROW =
            RowMapper { rs, _ ->
                PlanParseJob(
                    id = rs.getObject("id", UUID::class.java),
                    userId = rs.getObject("user_id", UUID::class.java),
                    state = JobState.valueOf(rs.getString("state")),
                    failure = rs.getString("failure"),
                    updatedAt = rs.getObject("updated_at", OffsetDateTime::class.java),
                )
            }
    }
}
