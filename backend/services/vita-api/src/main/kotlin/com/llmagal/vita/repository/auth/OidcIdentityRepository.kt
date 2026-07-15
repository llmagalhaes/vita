package com.llmagal.vita.repository.auth

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

/** `oidc_identity` access (BE-007): the (provider, subject) → user_id map. */
@Repository
class OidcIdentityRepository(
    private val jdbc: JdbcTemplate,
) {
    fun findUser(
        provider: String,
        subject: String,
    ): UUID? =
        jdbc
            .queryForList(
                "SELECT user_id FROM oidc_identity WHERE provider = ? AND subject = ?",
                UUID::class.java,
                provider,
                subject,
            ).firstOrNull()

    fun link(
        provider: String,
        subject: String,
        userId: UUID,
    ) {
        // ON CONFLICT DO NOTHING: a concurrent first sign-in that already linked this
        // identity is harmless — the caller re-reads and finds the same user.
        jdbc.update(
            "INSERT INTO oidc_identity (provider, subject, user_id) VALUES (?, ?, ?) " +
                "ON CONFLICT (provider, subject) DO NOTHING",
            provider,
            subject,
            userId,
        )
    }
}
