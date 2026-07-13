package com.llmagal.vita.users.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

/** A user row; name/email are still-encrypted C3 blobs (ADR-0003). */
data class UserRow(
    val id: UUID,
    val nameEnc: ByteArray?,
    val emailEnc: ByteArray,
    val units: String,
    val createdAt: OffsetDateTime,
    val deletionRequestedAt: OffsetDateTime?,
)

@Repository
class UserRepository(
    private val jdbc: JdbcTemplate,
) {
    fun findById(id: UUID): UserRow? =
        jdbc
            .query(
                "SELECT id, name_enc, email_enc, units, created_at, deletion_requested_at " +
                    "FROM users WHERE id = ?",
                ROW_MAPPER,
                id,
            ).firstOrNull()

    fun updateName(
        id: UUID,
        nameEnc: ByteArray,
    ) {
        jdbc.update("UPDATE users SET name_enc = ? WHERE id = ?", nameEnc, id)
    }

    fun updateUnits(
        id: UUID,
        units: String,
    ) {
        jdbc.update("UPDATE users SET units = ? WHERE id = ?", units, id)
    }

    private companion object {
        val ROW_MAPPER =
            RowMapper { rs, _ ->
                UserRow(
                    id = rs.getObject("id", UUID::class.java),
                    nameEnc = rs.getBytes("name_enc"),
                    emailEnc = rs.getBytes("email_enc"),
                    units = rs.getString("units"),
                    createdAt = rs.getObject("created_at", OffsetDateTime::class.java),
                    deletionRequestedAt = rs.getObject("deletion_requested_at", OffsetDateTime::class.java),
                )
            }
    }
}
