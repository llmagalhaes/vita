package com.llmagal.vita.users.service

import com.fasterxml.jackson.annotation.JsonInclude
import com.llmagal.vita.crypto.CryptoService
import com.llmagal.vita.users.repository.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

/** Contract User. `deletionEffectiveAt` present only during the deletion grace. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class UserResponse(
    val id: UUID,
    val name: String,
    val email: String,
    val units: String,
    val createdAt: OffsetDateTime,
    val deletionEffectiveAt: OffsetDateTime?,
)

/** PATCH /v1/me body — at least one of name/units (contract minProperties 1). */
data class UpdateProfileRequest(
    val name: String? = null,
    val units: String? = null,
)

/**
 * Profile read/update (BE-009). Name is C3 per-user-DEK encrypted; email is C3
 * service-DEK encrypted (ADR-0003). Units are C1 plaintext. Display units never
 * change stored values — the app converts (contract).
 */
@Service
class UserService(
    private val repo: UserRepository,
    private val crypto: CryptoService,
) {
    fun get(userId: UUID): UserResponse {
        val row = repo.findById(userId) ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return UserResponse(
            id = row.id,
            name = row.nameEnc?.let { String(crypto.decryptForUser(userId, it)) } ?: "",
            email = String(crypto.decryptWithServiceKey(row.emailEnc)),
            units = row.units,
            createdAt = row.createdAt,
            deletionEffectiveAt = row.deletionRequestedAt?.plus(Duration.ofDays(GRACE_DAYS)),
        )
    }

    fun update(
        userId: UUID,
        req: UpdateProfileRequest,
    ): UserResponse {
        if (req.name == null && req.units == null) bad("Provide at least one of name or units.")
        req.name?.let { name ->
            if (name.length !in 1..MAX_NAME) bad("name must be 1-$MAX_NAME characters.")
            repo.updateName(userId, crypto.encryptForUser(userId, name.toByteArray()))
        }
        req.units?.let { units ->
            if (units !in UNITS) bad("units must be one of $UNITS.")
            repo.updateUnits(userId, units)
        }
        return get(userId)
    }

    private fun bad(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val GRACE_DAYS = 7L
        const val MAX_NAME = 100
        val UNITS = setOf("metric", "imperial")
    }
}
