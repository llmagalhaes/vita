package com.llmagal.vita.service.plans

import com.llmagal.vita.model.plans.PlanVersion
import com.llmagal.vita.repository.plans.PlanRepository
import com.llmagal.vita.repository.plans.PlanTable
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * Persisted eating plan / training program: versioned, editable, encrypted
 * (BE-019/BE-020, ADR-0011 ext). The whole document is one AES-256-GCM blob
 * under the per-user DEK (ADR-0003), same envelope as log entries — the number
 * fields are NOT denormalized (plans aren't trends-aggregated), so nothing
 * about them is readable server-side.
 *
 * Edit is a full-doc replace + whole-blob re-encrypt in the service (D5): the
 * jsonb is never merge-patched in plaintext on the server.
 */
@Service
class PlanService(
    private val repo: PlanRepository,
    private val crypto: CryptoService,
    private val mapper: JsonMapper,
    @param:Value("\${vita.plans.history-max:5}") private val historyMax: Int,
) {
    /** POST import → new version; cap at [historyMax], oldest dropped. Echoes the stored doc. */
    fun importVersion(
        table: PlanTable,
        userId: UUID,
        doc: Any,
    ): JsonNode {
        val stored = repo.insert(table, userId, encrypt(table, userId, doc))
        repo.trim(table, userId, historyMax)
        return decode(table, userId, stored.docEnc)
    }

    /** GET current (newest) version, or null → 404. */
    fun current(
        table: PlanTable,
        userId: UUID,
    ): JsonNode? = repo.current(table, userId)?.let { decode(table, userId, it.docEnc) }

    /** PUT edit current: full-doc replace, whole-blob re-encrypt. Null if none exists → 404. */
    fun edit(
        table: PlanTable,
        userId: UUID,
        doc: Any,
    ): JsonNode? {
        val updated = repo.updateCurrent(table, userId, encrypt(table, userId, doc)) ?: return null
        return decode(table, userId, updated.docEnc)
    }

    /** GET history: the ≤[historyMax] stored versions, newest first (frozen, display-only). */
    fun history(
        table: PlanTable,
        userId: UUID,
    ): List<PlanVersion> =
        repo.history(table, userId, historyMax).map {
            PlanVersion(it.id, it.createdAt, decode(table, userId, it.docEnc))
        }

    private fun encrypt(
        table: PlanTable,
        userId: UUID,
        doc: Any,
    ): ByteArray = crypto.encryptForUser(userId, AadContext.planDoc(table.table), mapper.writeValueAsBytes(doc))

    private fun decode(
        table: PlanTable,
        userId: UUID,
        blob: ByteArray,
    ): JsonNode = mapper.readTree(crypto.decryptForUser(userId, AadContext.planDoc(table.table), blob))
}
