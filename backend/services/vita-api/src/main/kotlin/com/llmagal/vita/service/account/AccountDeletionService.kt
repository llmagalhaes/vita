package com.llmagal.vita.service.account

import com.llmagal.vita.repository.account.AccountRepository
import com.llmagal.vita.repository.jobs.JobRepository
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

/**
 * Account deletion (ADR-0004): DELETE starts a 7-day grace, revokes sessions and
 * schedules the crypto-shred job; any sign-in in the window clears the timestamp
 * (see MagicLinkService.verify / TokenService.rotate). After grace, [purge]
 * deletes the wrapped DEK first (irreversible, even inside backups) then the rows.
 */
@Service
class AccountDeletionService(
    private val repo: AccountRepository,
    private val crypto: CryptoService,
    private val jobs: JobRepository,
) {
    /** DELETE /v1/account. Idempotent — returns the same effective date on repeats. */
    fun requestDeletion(userId: UUID): OffsetDateTime {
        if (repo.markPendingIfAbsent(userId)) {
            repo.revokeAllRefreshTokens(userId)
            jobs.enqueue(JOB_TYPE, mapOf("userId" to userId.toString()), Instant.now().plus(GRACE))
        }
        val requestedAt =
            repo.deletionRequestedAt(userId)
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return requestedAt.plus(GRACE)
    }

    /**
     * The scheduled job body. No-op unless deletion is still due (the guard, not
     * the run_after, decides), so it is safe to retry and safe against a cancel
     * or a re-request that reset the grace clock.
     */
    fun purge(userId: UUID) {
        if (!repo.deletionDue(userId)) return
        crypto.shred(userId) // DEK first: instant crypto-shred of all C3 data (ADR-0003)
        repo.hardDelete(userId) // then the rows, via FK cascade
    }

    companion object {
        const val JOB_TYPE = "account_deletion"
        private val GRACE: Duration = Duration.ofDays(7)
    }
}
