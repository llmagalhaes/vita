package com.llmagal.vita.service.users

import com.llmagal.vita.repository.users.VacationRepository
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * Vacation ranges (BE-025, D1). The array of {start, end} is stored as one
 * AES-256-GCM blob under the per-user DEK (ADR-0003) — same envelope as plan
 * docs, replace-on-write. Server-opaque: nothing here reads or interprets the
 * dates; the only check is that the payload is a JSON array (trust boundary).
 */
@Service
class VacationService(
    private val repo: VacationRepository,
    private val crypto: CryptoService,
    private val mapper: JsonMapper,
) {
    /** Stored ranges, or an empty array when the user has never set any. */
    fun get(userId: UUID): JsonNode =
        repo.find(userId)?.let { mapper.readTree(crypto.decryptForUser(userId, AadContext.VACATION_RANGES, it)) }
            ?: mapper.createArrayNode()

    /** Replace-on-write. The array is stored verbatim as one encrypted opaque blob. */
    fun replace(
        userId: UUID,
        ranges: JsonNode,
    ): JsonNode {
        if (!ranges.isArray) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "vacations must be a JSON array.")
        repo.upsert(userId, crypto.encryptForUser(userId, AadContext.VACATION_RANGES, mapper.writeValueAsBytes(ranges)))
        return ranges
    }
}
