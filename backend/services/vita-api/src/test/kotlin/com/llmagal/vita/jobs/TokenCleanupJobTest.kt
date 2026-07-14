package com.llmagal.vita.jobs

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.auth.service.TokenService
import com.llmagal.vita.crypto.service.CryptoService
import com.llmagal.vita.jobs.service.TokenCleanupJob
import com.llmagal.vita.signInTestUser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import java.util.UUID

/**
 * BE-022: the retention sweep deletes consumed/expired magic-link tokens (their
 * encrypted email must not linger) and dead refresh tokens, while sparing live
 * ones. Auto-schedule is pushed out so each test drives sweep() explicitly.
 */
@SpringBootTest
@Import(TestcontainersConfig::class)
@TestPropertySource(properties = ["vita.jobs.token-cleanup-ms=3600000", "vita.jobs.poll-ms=3600000"])
class TokenCleanupJobTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var cleanup: TokenCleanupJob

    private fun insertMagicLink(
        label: String,
        expiresSql: String,
        consumedSql: String,
    ) {
        jdbc.update(
            "INSERT INTO magic_link_token (token_hash, email_enc, expires_at, consumed_at) " +
                "VALUES (?, ?, $expiresSql, $consumedSql)",
            "$label-${UUID.randomUUID()}".toByteArray(),
            crypto.encryptWithServiceKey("$label@test.dev".toByteArray()),
        )
    }

    private fun magicLinkCount(): Int = jdbc.queryForObject("SELECT count(*) FROM magic_link_token", Int::class.java)!!

    @Test
    fun `sweep drops consumed and long-expired magic links but keeps a live one`() {
        val before = magicLinkCount()
        insertMagicLink("expired", "now() - interval '2 days'", "NULL") // never used, long expired
        insertMagicLink("consumed", "now() + interval '5 minutes'", "now()") // spent
        insertMagicLink("live", "now() + interval '10 minutes'", "NULL") // valid, unconsumed

        cleanup.sweep()

        // Only the live unconsumed token survives (plus whatever pre-existed).
        assertThat(magicLinkCount()).isEqualTo(before + 1)
    }

    @Test
    fun `sweep drops dead refresh tokens but keeps a live one`() {
        val userId = signInTestUser(jdbc, crypto, tokens, "rt-${UUID.randomUUID()}@test.dev").id

        // signInTestUser already issued one live refresh token; count from there.
        fun liveCount() =
            jdbc.queryForObject(
                "SELECT count(*) FROM refresh_token WHERE user_id = ?",
                Int::class.java,
                userId,
            )!!
        val before = liveCount()

        fun insertRefresh(
            expiresSql: String,
            revokedSql: String,
        ) = jdbc.update(
            "INSERT INTO refresh_token (token_hash, user_id, family_id, expires_at, revoked_at) " +
                "VALUES (?, ?, ?, $expiresSql, $revokedSql)",
            UUID.randomUUID().toString().toByteArray(),
            userId,
            UUID.randomUUID(),
        )
        insertRefresh("now() - interval '2 days'", "NULL") // expired
        insertRefresh("now() + interval '30 days'", "now() - interval '2 days'") // revoked a while ago
        insertRefresh("now() + interval '30 days'", "NULL") // live

        cleanup.sweep()

        // The two dead ones are gone; the pre-existing live token plus my live one remain.
        assertThat(liveCount()).isEqualTo(before + 1)
    }
}
