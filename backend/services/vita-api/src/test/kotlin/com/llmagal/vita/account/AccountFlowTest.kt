package com.llmagal.vita.account

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.repository.account.AccountRepository
import com.llmagal.vita.service.account.AccountDeletionService
import com.llmagal.vita.service.auth.MagicLinkService
import com.llmagal.vita.service.auth.TokenService
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import com.llmagal.vita.service.jobs.JobWorker
import com.llmagal.vita.signInTestUser
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.core.ParameterizedTypeReference
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.client.RestTestClient
import java.sql.Timestamp
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

/**
 * BE-010 (ADR-0004 + ADR-0007): account deletion grace, crypto-shred job, the
 * sign-in cancel hook, idempotency and job retry safety.
 *
 * Polling is parked (huge fixedDelay) so the background worker can't race the
 * deterministic runOnce() calls; each test drives the queue explicitly.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
@TestPropertySource(properties = ["vita.jobs.poll-ms=3600000"])
class AccountFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var magicLink: MagicLinkService

    @Autowired lateinit var deletion: AccountDeletionService

    @Autowired lateinit var accounts: AccountRepository

    @Autowired lateinit var worker: JobWorker

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var userId: UUID
    lateinit var email: String
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        email = "delete-${UUID.randomUUID()}@test.dev"
        val user = signInTestUser(jdbc, crypto, tokens, email)
        userId = user.id
        token = user.accessToken
    }

    private fun deleteAccount() =
        client
            .delete()
            .uri("/v1/account")
            .header("Authorization", "Bearer $token")
            .exchange()

    private fun effectiveAt(): OffsetDateTime {
        val body =
            deleteAccount()
                .expectStatus()
                .isAccepted
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        return OffsetDateTime.parse(body["deletionEffectiveAt"] as String)
    }

    private fun requestedAt() = accounts.deletionRequestedAt(userId)

    @Test
    fun `DELETE schedules deletion ~7d out, revokes tokens, enqueues one job`() {
        val refresh = tokens.issue(userId).refreshToken

        val effective = effectiveAt()

        assertThat(effective).isAfter(OffsetDateTime.now().plusDays(6))
        assertThat(effective).isBefore(OffsetDateTime.now().plusDays(8))
        // All refresh tokens revoked → the live one can no longer rotate.
        assertThatThrownBy { tokens.rotate(refresh) }
        assertThat(pendingJobsFor(userId)).isEqualTo(1)
    }

    @Test
    fun `repeat DELETE does not move the date or enqueue a second job`() {
        val first = effectiveAt()
        val firstRequestedAt = requestedAt()

        val second = effectiveAt()

        assertThat(second).isEqualTo(first)
        assertThat(requestedAt()).isEqualTo(firstRequestedAt)
        assertThat(pendingJobsFor(userId)).isEqualTo(1)
    }

    @Test
    fun `refresh during the grace window cancels the deletion`() {
        val refresh = tokens.issue(userId).refreshToken
        jdbc.update("UPDATE users SET deletion_requested_at = now() WHERE id = ?", userId)

        tokens.rotate(refresh)

        assertThat(requestedAt()).isNull()
    }

    @Test
    fun `magic-link verify during the grace window cancels the deletion`() {
        jdbc.update("UPDATE users SET deletion_requested_at = now() WHERE id = ?", userId)
        val linkToken = insertMagicLinkToken(email)

        magicLink.verify(linkToken)

        assertThat(requestedAt()).isNull()
    }

    @Test
    fun `after the grace the worker shreds the DEK and hard-deletes, unreadably`() {
        val ciphertext = crypto.encryptForUser(userId, AadContext.ENTRY_DETAIL, "a private meal note".toByteArray())
        deletion.requestDeletion(userId)
        elapseGrace(userId)

        worker.runOnce()

        // DEK gone → the old ciphertext can never be decrypted again (crypto-shred).
        assertThatThrownBy { crypto.decryptForUser(userId, AadContext.ENTRY_DETAIL, ciphertext) }
        assertThat(userExists(userId)).isFalse()
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_keys WHERE user_id = ?", Int::class.java, userId))
            .isZero()
        assertThat(jobState(userId)).isEqualTo("done")
    }

    @Test
    fun `a cancelled deletion makes the due job a harmless no-op`() {
        deletion.requestDeletion(userId)
        elapseGrace(userId)
        // Signed back in before the job ran: timestamp cleared, rows must survive.
        jdbc.update("UPDATE users SET deletion_requested_at = NULL WHERE id = ?", userId)

        worker.runOnce()

        assertThat(userExists(userId)).isTrue()
        assertThat(jobState(userId)).isEqualTo("done")
    }

    @Test
    fun `purge is idempotent - safe to run twice`() {
        deletion.requestDeletion(userId)
        elapseGrace(userId)

        deletion.purge(userId)
        deletion.purge(userId) // row already gone → deletionDue false → no-op, no throw

        assertThat(userExists(userId)).isFalse()
    }

    @Test
    fun `a failing job is retried, not lost, and does not block the worker`() {
        jdbc.update(
            "INSERT INTO job (type, payload, run_after) VALUES ('bogus', '{}'::jsonb, now() - interval '1 minute')",
        )

        worker.runOnce()

        val row =
            jdbc.queryForMap("SELECT state, attempts, last_error FROM job WHERE type = 'bogus'")
        assertThat(row["state"]).isEqualTo("pending") // still retryable (< max attempts)
        assertThat(row["attempts"]).isEqualTo(1)
        assertThat(row["last_error"]).asString().contains("Unknown job type")
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun elapseGrace(id: UUID) {
        jdbc.update("UPDATE users SET deletion_requested_at = now() - interval '8 days' WHERE id = ?", id)
        jdbc.update(
            "UPDATE job SET run_after = now() - interval '1 minute' WHERE payload->>'userId' = ?",
            id.toString(),
        )
    }

    private fun insertMagicLinkToken(forEmail: String): String {
        val token = "test-link-${UUID.randomUUID()}"
        jdbc.update(
            "INSERT INTO magic_link_token (token_hash, email_enc, expires_at) VALUES (?, ?, ?)",
            TokenService.sha256(token),
            crypto.encryptWithServiceKey(forEmail.toByteArray()),
            Timestamp.from(Instant.now().plusSeconds(900)),
        )
        return token
    }

    private fun pendingJobsFor(id: UUID) =
        jdbc.queryForObject(
            "SELECT count(*) FROM job WHERE type = ? AND payload->>'userId' = ? AND state = 'pending'",
            Int::class.java,
            AccountDeletionService.JOB_TYPE,
            id.toString(),
        )

    private fun jobState(id: UUID) =
        jdbc.queryForObject(
            "SELECT state FROM job WHERE payload->>'userId' = ?",
            String::class.java,
            id.toString(),
        )

    private fun userExists(id: UUID): Boolean {
        val count = jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Int::class.java, id)
        return count == 1
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
