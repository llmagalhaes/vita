package com.llmagal.vita.users.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * The single-row vacation blob per user (V005, BE-025). Blob-only — encryption
 * and the (opaque) JSON live in the service; the repository never sees plaintext.
 */
@Repository
class VacationRepository(
    private val jdbc: JdbcTemplate,
) {
    /** The user's stored ranges blob, or null if never set. */
    fun find(userId: UUID): ByteArray? =
        jdbc
            .queryForList("SELECT ranges_enc FROM vacation WHERE user_id = ?", ByteArray::class.java, userId)
            .firstOrNull()

    /** Replace-on-write: insert or overwrite the single row for this user. */
    fun upsert(
        userId: UUID,
        rangesEnc: ByteArray,
    ) {
        jdbc.update(
            """
            INSERT INTO vacation (user_id, ranges_enc) VALUES (?, ?)
            ON CONFLICT (user_id) DO UPDATE SET ranges_enc = EXCLUDED.ranges_enc, updated_at = now()
            """.trimIndent(),
            userId,
            rangesEnc,
        )
    }
}
