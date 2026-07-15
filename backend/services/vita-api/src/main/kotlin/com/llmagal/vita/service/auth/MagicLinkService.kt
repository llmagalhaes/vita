package com.llmagal.vita.service.auth

import com.llmagal.vita.config.AuthProps
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.SecureRandom
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

/**
 * Magic-link auth per BE-006: single-use 256-bit token stored SHA-256-hashed,
 * 15-min expiry, consumed atomically on verify. Identical 202 whether or not
 * the email is registered (no account enumeration); the account is created on
 * first verify, not on request.
 */
@Service
class MagicLinkService(
    private val jdbc: JdbcTemplate,
    private val crypto: CryptoService,
    private val mailer: Mailer,
    private val tokens: TokenService,
    private val props: AuthProps,
) {
    private val random = SecureRandom()
    private val perEmail = RateLimiter(max = props.rateLimitPerEmail, window = LIMIT_WINDOW)
    private val perIp = RateLimiter(max = props.rateLimitPerIp, window = LIMIT_WINDOW)

    /** Returns null on success (202), or Retry-After seconds when rate-limited (429). */
    fun request(
        rawEmail: String,
        ip: String,
    ): Long? {
        val email = normalize(rawEmail)
        if ("@" !in email || email.length > MAX_EMAIL_LENGTH) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid email address.")
        }
        // Email key is the blind index, not the address — no plaintext emails in memory maps.
        val retryAfter =
            perEmail.tryAcquire(HexFormat.of().formatHex(crypto.emailHash(email)))
                ?: perIp.tryAcquire(ip)
        if (retryAfter == null) {
            val token =
                Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(TOKEN_BYTES).also(random::nextBytes))
            jdbc.update(
                "INSERT INTO magic_link_token (token_hash, email_enc, expires_at) VALUES (?, ?, ?)",
                TokenService.sha256(token),
                crypto.encryptWithServiceKey(email.toByteArray()),
                Timestamp.from(Instant.now().plus(TOKEN_TTL)),
            )
            mailer.sendMagicLink(email, "${props.magicLinkBaseUrl}?token=$token")
        }
        return retryAfter
    }

    /** Consumes the token, finds-or-creates the user, cancels a pending deletion, issues a session. */
    fun verify(token: String): TokenPair {
        val emailEnc =
            jdbc
                .queryForList(
                    """
                    UPDATE magic_link_token SET consumed_at = now()
                    WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > now()
                    RETURNING email_enc
                    """.trimIndent(),
                    ByteArray::class.java,
                    TokenService.sha256(token),
                ).firstOrNull()
                ?: throw ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Magic-link token invalid, expired, or already consumed.",
                )
        val email = String(crypto.decryptWithServiceKey(emailEnc))
        return tokens.issue(findOrCreateUser(email))
    }

    private fun findOrCreateUser(email: String): UUID {
        val hash = crypto.emailHash(email)
        val existing =
            jdbc.queryForList("SELECT id FROM users WHERE email_hash = ?", UUID::class.java, hash).firstOrNull()
        if (existing != null) {
            // Any successful sign-in cancels a pending account deletion (ADR-0004).
            jdbc.update("UPDATE users SET deletion_requested_at = NULL WHERE id = ?", existing)
            return existing
        }
        // ponytail: no lock around create — a duplicate race just hits the email_hash
        // unique constraint and the retry signs in. Fine at 5 users.
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO users (id, email_hash, email_enc) VALUES (?, ?, ?)",
            id,
            hash,
            crypto.encryptWithServiceKey(email.toByteArray()),
        )
        crypto.createUserKey(id)
        // Placeholder name from the email local-part (app review pt 1); user renames in onboarding.
        jdbc.update(
            "UPDATE users SET name_enc = ? WHERE id = ?",
            crypto.encryptForUser(id, AadContext.USER_NAME, email.substringBefore("@").toByteArray()),
            id,
        )
        return id
    }

    private fun normalize(email: String) = email.trim().lowercase()

    companion object {
        private val TOKEN_TTL: Duration = Duration.ofMinutes(15)
        private val LIMIT_WINDOW: Duration = Duration.ofMinutes(15)
        private const val TOKEN_BYTES = 32
        private const val MAX_EMAIL_LENGTH = 320
    }
}
