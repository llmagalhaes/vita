package com.llmagal.vita.service.jobs

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service

/**
 * Retention sweep (BE-022, audit 2.3). Consumed/expired magic-link tokens carry a
 * C3 encrypted email that must not linger ("store strictly what's necessary"), and
 * dead refresh tokens are pure debris. Runs on the same @EnableScheduling the ADR-0007
 * job worker already turns on.
 *
 * ponytail: a plain @Scheduled DELETE, not a row on the job queue — the sweep is
 * idempotent and safe to run on every instance, so SKIP-LOCKED / retry buy nothing,
 * and forcing a recurring cron through a one-shot queue would just bloat the job
 * table this ticket exists to fight. Enqueue it if multi-instance coordination ever
 * matters.
 */
@Service
class TokenCleanupJob(
    private val jdbc: JdbcTemplate,
) {
    @Scheduled(fixedDelayString = "\${vita.jobs.token-cleanup-ms:3600000}")
    fun sweep() {
        // Consumed magic links are spent; expired ones were never used — either way the
        // encrypted email has no reason to exist (small grace past expiry).
        jdbc.update(
            "DELETE FROM magic_link_token WHERE consumed_at IS NOT NULL OR expires_at < now() - interval '1 day'",
        )
        // Dead refresh tokens (past expiry, or revoked a while ago). Lower stakes — C1 hashes only.
        jdbc.update(
            "DELETE FROM refresh_token WHERE expires_at < now() - interval '1 day' " +
                "OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '1 day')",
        )
    }
}
