package com.llmagal.vita.repository.account

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

/**
 * SQL for the deletion lifecycle (ADR-0004). The 7-day grace lives in
 * `users.deletion_requested_at`; the shred/hard-delete is driven by [deletionDue].
 */
@Repository
class AccountRepository(
    private val jdbc: JdbcTemplate,
) {
    /** Start the grace only if not already pending — repeat requests don't move the date. */
    fun markPendingIfAbsent(userId: UUID): Boolean =
        jdbc.update(
            "UPDATE users SET deletion_requested_at = now() WHERE id = ? AND deletion_requested_at IS NULL",
            userId,
        ) == 1

    fun deletionRequestedAt(userId: UUID): OffsetDateTime? =
        jdbc
            .queryForList(
                "SELECT deletion_requested_at FROM users WHERE id = ?",
                OffsetDateTime::class.java,
                userId,
            ).firstOrNull()

    fun revokeAllRefreshTokens(userId: UUID) {
        jdbc.update(
            "UPDATE refresh_token SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL",
            userId,
        )
    }

    /**
     * True only when deletion is still pending AND the grace has fully elapsed.
     * Re-checked at job time so a cancel (or a re-request that reset the clock)
     * makes the job a no-op — the guard, not the schedule, decides.
     */
    fun deletionDue(userId: UUID): Boolean =
        jdbc.queryForObject(
            """
            SELECT EXISTS (
                SELECT 1 FROM users
                WHERE id = ?
                  AND deletion_requested_at IS NOT NULL
                  AND deletion_requested_at <= now() - interval '7 days'
            )
            """.trimIndent(),
            Boolean::class.java,
            userId,
        ) == true

    /** Hard delete; FK cascade removes log_entry, refresh_token and user_keys. */
    fun hardDelete(userId: UUID) {
        jdbc.update("DELETE FROM users WHERE id = ?", userId)
    }
}
