package com.llmagal.vita

import com.llmagal.vita.service.auth.TokenService
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

/** A signed-in test user: real row + per-user DEK + a valid access token. */
data class TestUser(
    val id: UUID,
    val email: String,
    val accessToken: String,
)

/**
 * Creates a user exactly like MagicLinkService does (blind index + encrypted
 * email + placeholder name from the local-part) and issues a working JWT, so
 * protected-route tests don't reimplement the whole sign-in flow.
 */
fun signInTestUser(
    jdbc: JdbcTemplate,
    crypto: CryptoService,
    tokens: TokenService,
    email: String,
): TestUser {
    val id = UUID.randomUUID()
    jdbc.update(
        "INSERT INTO users (id, email_hash, email_enc) VALUES (?, ?, ?)",
        id,
        crypto.emailHash(email),
        crypto.encryptWithServiceKey(email.toByteArray()),
    )
    crypto.createUserKey(id)
    jdbc.update(
        "UPDATE users SET name_enc = ? WHERE id = ?",
        crypto.encryptForUser(id, AadContext.USER_NAME, email.substringBefore("@").toByteArray()),
        id,
    )
    return TestUser(id, email, tokens.issue(id).accessToken)
}
