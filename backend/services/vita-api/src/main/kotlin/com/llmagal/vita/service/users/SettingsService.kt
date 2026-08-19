package com.llmagal.vita.service.users

import com.llmagal.vita.repository.users.SettingsRepository
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * The settings blob (BE-056). One AES-256-GCM blob under the per-user DEK
 * (ADR-0003), same envelope as vacation ranges, replace-on-write. Server-opaque:
 * nothing here reads or interprets the contents — the only checks are the trust
 * boundary ones (is a JSON object, fits the cap). Last-write-wins, no merge.
 */
@Service
class SettingsService(
    private val repo: SettingsRepository,
    private val crypto: CryptoService,
    private val mapper: JsonMapper,
) {
    /** Stored settings, or an empty object when the user has never written any. */
    fun get(userId: UUID): JsonNode =
        repo.find(userId)?.let { mapper.readTree(crypto.decryptForUser(userId, AadContext.USER_SETTINGS, it)) }
            ?: mapper.createObjectNode()

    /** Replace-on-write. The object is stored verbatim as one encrypted opaque blob. */
    fun replace(
        userId: UUID,
        settings: JsonNode,
    ): JsonNode {
        if (!settings.isObject) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "settings must be a JSON object.")
        val bytes = mapper.writeValueAsBytes(settings)
        if (bytes.size > MAX_BYTES) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "settings exceeds the 64 KB cap.")
        }
        repo.upsert(userId, crypto.encryptForUser(userId, AadContext.USER_SETTINGS, bytes))
        return settings
    }

    private companion object {
        const val MAX_BYTES = 64 * 1024 // contract: ~64 KB, larger → 400
    }
}
