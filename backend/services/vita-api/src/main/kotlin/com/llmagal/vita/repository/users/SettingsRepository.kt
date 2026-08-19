package com.llmagal.vita.repository.users

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

/**
 * The single-row settings blob per user (V012, BE-056). Blob-only — encryption
 * and the (opaque) JSON live in the service; the repository never sees plaintext.
 */
@Repository
class SettingsRepository(
    private val jdbc: JdbcTemplate,
) {
    /** The user's stored settings blob, or null if never set. */
    fun find(userId: UUID): ByteArray? =
        jdbc
            .queryForList("SELECT settings_enc FROM user_settings WHERE user_id = ?", ByteArray::class.java, userId)
            .firstOrNull()

    /** Replace-on-write: insert or overwrite the single row for this user. */
    fun upsert(
        userId: UUID,
        settingsEnc: ByteArray,
    ) {
        jdbc.update(
            """
            INSERT INTO user_settings (user_id, settings_enc) VALUES (?, ?)
            ON CONFLICT (user_id) DO UPDATE SET settings_enc = EXCLUDED.settings_enc, updated_at = now()
            """.trimIndent(),
            userId,
            settingsEnc,
        )
    }
}
