package com.llmagal.vita.auth

import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtEncoder
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID

/** Contract TokenPair: JWT access (~15 min) + opaque single-use refresh (60 days). */
data class TokenPair(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
)

/**
 * Sessions per BE-008: refresh tokens are stored SHA-256-hashed (C1), rotated
 * on every use; reuse of a rotated token revokes its whole family.
 */
@Service
class TokenService(
    private val jdbc: JdbcTemplate,
    private val jwtEncoder: JwtEncoder,
    private val props: AuthProps,
) {
    private val random = SecureRandom()

    fun issue(
        userId: UUID,
        familyId: UUID = UUID.randomUUID(),
    ): TokenPair {
        val refresh = newOpaqueToken()
        jdbc.update(
            "INSERT INTO refresh_token (token_hash, user_id, family_id, expires_at) VALUES (?, ?, ?, ?)",
            sha256(refresh),
            userId,
            familyId,
            java.sql.Timestamp.from(Instant.now().plus(Duration.ofDays(props.refreshTtlDays))),
        )
        return TokenPair(accessJwt(userId), refresh, props.accessTtlSeconds)
    }

    fun rotate(refreshToken: String): TokenPair {
        val hash = sha256(refreshToken)
        val live =
            jdbc
                .query(
                    """
                    UPDATE refresh_token SET revoked_at = now()
                    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now()
                    RETURNING user_id, family_id
                    """.trimIndent(),
                    { rs, _ ->
                        rs.getObject("user_id", UUID::class.java) to rs.getObject("family_id", UUID::class.java)
                    },
                    hash,
                ).firstOrNull()
        if (live == null) {
            // Rotated-token reuse (or expired/unknown): revoke the whole family.
            jdbc.update(
                """
                UPDATE refresh_token SET revoked_at = now()
                WHERE revoked_at IS NULL
                  AND family_id = (SELECT family_id FROM refresh_token WHERE token_hash = ?)
                """.trimIndent(),
                hash,
            )
            throw ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Refresh token invalid, expired, revoked, or reused.",
            )
        }
        val (userId, familyId) = live
        return issue(userId, familyId)
    }

    /** Idempotent revoke — sign-out is 204 even for unknown tokens. */
    fun revoke(refreshToken: String) {
        jdbc.update(
            "UPDATE refresh_token SET revoked_at = now() WHERE token_hash = ? AND revoked_at IS NULL",
            sha256(refreshToken),
        )
    }

    private fun accessJwt(userId: UUID): String {
        val now = Instant.now()
        val claims =
            JwtClaimsSet
                .builder()
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plusSeconds(props.accessTtlSeconds))
                .build()
        return jwtEncoder
            .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
            .tokenValue
    }

    private fun newOpaqueToken(): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(TOKEN_BYTES).also(random::nextBytes))

    companion object {
        private const val TOKEN_BYTES = 32

        fun sha256(token: String): ByteArray = MessageDigest.getInstance("SHA-256").digest(token.toByteArray())
    }
}
