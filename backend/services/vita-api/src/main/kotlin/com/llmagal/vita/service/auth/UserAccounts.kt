package com.llmagal.vita.service.auth

import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * Account provisioning shared by every sign-in path (magic-link + OIDC, BE-007).
 * One place creates a user so the crypto envelope (email blind index + service-DEK
 * email + per-user DEK + encrypted placeholder name) can never drift between paths.
 */
@Service
class UserAccounts(
    private val jdbc: JdbcTemplate,
    private val crypto: CryptoService,
) {
    /** User id for this normalized email, or null. Lookup via the blind index (no decrypt). */
    fun findByEmail(email: String): UUID? =
        jdbc
            .queryForList("SELECT id FROM users WHERE email_hash = ?", UUID::class.java, crypto.emailHash(email))
            .firstOrNull()

    /** Any successful sign-in cancels a pending account deletion (ADR-0004). */
    fun cancelPendingDeletion(userId: UUID) {
        jdbc.update("UPDATE users SET deletion_requested_at = NULL WHERE id = ?", userId)
    }

    /**
     * Create a user + wrapped DEK + encrypted name. [name] blank/absent → placeholder from
     * the email local-part (app review pt 1); the user renames in onboarding (PATCH /me).
     *
     * ponytail: no lock around create — a duplicate race just hits the email_hash unique
     * constraint and the caller's retry signs in. Fine at 5 users.
     */
    fun create(
        email: String,
        name: String?,
    ): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO users (id, email_hash, email_enc) VALUES (?, ?, ?)",
            id,
            crypto.emailHash(email),
            crypto.encryptWithServiceKey(email.toByteArray()),
        )
        crypto.createUserKey(id)
        val displayName = name?.trim()?.take(MAX_NAME)?.ifBlank { null } ?: email.substringBefore("@")
        jdbc.update(
            "UPDATE users SET name_enc = ? WHERE id = ?",
            crypto.encryptForUser(id, AadContext.USER_NAME, displayName.toByteArray()),
            id,
        )
        return id
    }

    private companion object {
        const val MAX_NAME = 100
    }
}
