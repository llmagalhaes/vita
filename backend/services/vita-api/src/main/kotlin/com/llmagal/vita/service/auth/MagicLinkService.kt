package com.llmagal.vita.service.auth

import com.llmagal.vita.config.AuthProps
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
    private val accounts: UserAccounts,
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
        val existing = accounts.findByEmail(email)
        if (existing != null) {
            accounts.cancelPendingDeletion(existing)
            return existing
        }
        return accounts.create(email, null)
    }

    private fun normalize(email: String) = email.trim().lowercase()

    companion object {
        private val TOKEN_TTL: Duration = Duration.ofMinutes(15)
        private val LIMIT_WINDOW: Duration = Duration.ofMinutes(15)
        private const val TOKEN_BYTES = 32
        private const val MAX_EMAIL_LENGTH = 320
    }
}
