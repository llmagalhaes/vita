package com.llmagal.vita.service.plans

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.PlanItem
import com.llmagal.vita.model.ai.PortionBounds
import com.llmagal.vita.model.plans.PlanVersion
import com.llmagal.vita.repository.plans.PlanPortionsRepository
import com.llmagal.vita.repository.plans.PlanRepository
import com.llmagal.vita.repository.plans.PlanTable
import com.llmagal.vita.service.crypto.AadContext
import com.llmagal.vita.service.crypto.CryptoService
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode
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
 *
 * Eating plans go through [importPlan]/[editPlan], which stamp stable item ids
 * ("it-N" in document order, save-time only — no backfill, CEO A2) and the
 * server-authoritative portion bounds ([PortionBoundsHeuristic]) into the doc
 * before it is encrypted. Programs use the generic [importVersion]/[edit] and
 * get no ids this round (no consumer — the overlay is eating-plan-only, D-8).
 *
 * The portion overlay (BE-038, [PlanPortionsRepository]) is a plaintext sparse
 * itemId→qty map bound to the current version (CEO A1). It resets on a new
 * import and is pruned per-item on a doc edit (CEO A5); GET /plan attaches it.
 */
@Service
@Suppress("TooManyFunctions") // plan + program + portion overlay flow in one service, reusing private helpers
class PlanService(
    private val repo: PlanRepository,
    private val portionsRepo: PlanPortionsRepository,
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

    /**
     * POST /plan: assign fresh ids it-1…it-N in document order + recompute portion
     * bounds, then store as a new version. Client-sent ids/portion are ignored. The
     * overlay resets (new version = new identity space, CEO A5).
     */
    @Transactional
    fun importPlan(
        userId: UUID,
        draft: EatingPlanDraft,
    ): JsonNode {
        val doc = importVersion(PlanTable.EATING_PLAN, userId, decorate(draft, assignFreshIds = true))
        portionsRepo.delete(userId)
        return doc
    }

    /**
     * PUT /plan: preserve round-tripped ids, assign fresh ones above the max it-N
     * suffix, recompute portion bounds. Duplicate incoming ids → 400. Null → 404.
     * Then prune the overlay per CEO A5 (removed item dropped, edited item reset,
     * untouched item kept).
     */
    @Transactional
    fun editPlan(
        userId: UUID,
        draft: EatingPlanDraft,
    ): JsonNode? {
        val plan = PlanTable.EATING_PLAN
        val prev = repo.current(plan, userId) ?: return null
        val prevDoc = decode(plan, userId, prev.docEnc)
        val decorated = decorate(draft, assignFreshIds = false)
        val updated = repo.updateCurrent(plan, userId, encrypt(plan, userId, decorated))
        pruneOverlayAfterEdit(userId, prevDoc, decorated)
        return updated?.let { decode(plan, userId, it.docEnc) }
    }

    /**
     * GET /plan: the current doc with the portion overlay attached when it belongs
     * to this version. A stale overlay (version changed without cleanup) is lazily
     * dropped and treated as absent.
     */
    fun currentPlanWithPortions(userId: UUID): JsonNode? {
        val stored = repo.current(PlanTable.EATING_PLAN, userId) ?: return null
        val doc = decode(PlanTable.EATING_PLAN, userId, stored.docEnc)
        val overlay = portionsRepo.get(userId)
        if (overlay != null && overlay.planId != stored.id) {
            portionsRepo.delete(userId)
        } else if (overlay != null && overlay.portions.isNotEmpty()) {
            (doc as ObjectNode).set("portions", mapper.valueToTree<JsonNode>(overlay.portions))
        }
        return doc
    }

    /**
     * PUT /plan/portions: full replace of the current version's overlay. Clamps each
     * value to the item's stored bounds and snaps to its step; unknown ids → 422,
     * bad values → 400, no current plan → 404, empty map → clear the row.
     */
    @Transactional
    fun putPortions(
        userId: UUID,
        map: Map<String, Double>,
    ): Map<String, Double> {
        if (map.size > MAX_PORTIONS) badRequest("Too many portion keys (max $MAX_PORTIONS).")
        map.forEach { (k, v) ->
            if (v.isNaN() || v.isInfinite()) badRequest("Portion value for $k is not a finite number.")
            if (v < 0) badRequest("Portion value for $k must be >= 0.")
        }
        val stored = repo.current(PlanTable.EATING_PLAN, userId) ?: notFound()
        val bounds = itemBounds(decode(PlanTable.EATING_PLAN, userId, stored.docEnc))
        val unknown = map.keys - bounds.keys
        if (unknown.isNotEmpty()) unprocessable("Not item ids of the current plan version: ${unknown.sorted()}")

        val clamped = map.mapValues { (id, v) -> clamp(v, bounds[id]) }
        return if (clamped.isEmpty()) {
            portionsRepo.delete(userId)
            emptyMap()
        } else {
            portionsRepo.upsert(userId, stored.id, clamped)
            clamped
        }
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

    /**
     * Stamp every item with an id and recomputed portion bounds. On POST fresh ids
     * it-1…it-N by flat document order; on PUT preserve valid round-tripped ids
     * (non-blank, ≤40 chars, unique) and assign it-{max+1}… to the rest.
     */
    private fun decorate(
        draft: EatingPlanDraft,
        assignFreshIds: Boolean,
    ): EatingPlanDraft {
        val items = draft.meals.flatMap { it.items }
        val nextId: (PlanItem) -> String =
            if (assignFreshIds) {
                var n = 0
                { "it-${++n}" }
            } else {
                val valid = items.mapNotNull { it.id?.takeIf(::validId) }
                val dupes =
                    valid
                        .groupingBy { it }
                        .eachCount()
                        .filterValues { it > 1 }
                        .keys
                if (dupes.isNotEmpty()) badRequest("duplicate item id: ${dupes.joinToString()}")
                var next = valid.mapNotNull { itN(it) }.maxOrNull() ?: 0
                { item -> item.id?.takeIf(::validId) ?: "it-${++next}" }
            }
        return draft.copy(
            meals =
                draft.meals.map { meal ->
                    meal.copy(
                        items =
                            meal.items.map { item ->
                                item.copy(
                                    id = nextId(item),
                                    portion = PortionBoundsHeuristic.of(item.quantity, item.unit),
                                )
                            },
                    )
                },
        )
    }

    /** CEO A5: drop overlay keys for removed items and for items whose quantity/unit changed. */
    private fun pruneOverlayAfterEdit(
        userId: UUID,
        prevDoc: JsonNode,
        newDraft: EatingPlanDraft,
    ) {
        val overlay = portionsRepo.get(userId) ?: return
        val prev = qtyUnitById(mapper.treeToValue(prevDoc, EatingPlanDraft::class.java))
        val now = qtyUnitById(newDraft)
        val kept =
            overlay.portions.filterKeys { id ->
                val current = now[id] ?: return@filterKeys false // removed item → prune
                prev[id] == current // edited (qty/unit changed) → drop; untouched → keep
            }
        when {
            kept.isEmpty() -> portionsRepo.delete(userId)
            kept.size != overlay.portions.size -> portionsRepo.upsert(userId, overlay.planId, kept)
        }
    }

    /** itemId → (quantity, unit) for every item that has an id. */
    private fun qtyUnitById(draft: EatingPlanDraft): Map<String, Pair<Double?, String?>> =
        draft.meals
            .flatMap { it.items }
            .mapNotNull { item -> item.id?.let { it to (item.quantity to item.unit) } }
            .toMap()

    /** itemId → stored portion bounds (null when the item has no usable bounds) for the current doc. */
    private fun itemBounds(doc: JsonNode): Map<String, PortionBounds?> =
        mapper
            .treeToValue(doc, EatingPlanDraft::class.java)
            .meals
            .flatMap { it.items }
            .mapNotNull { item -> item.id?.let { it to item.portion } }
            .toMap()

    private fun clamp(
        value: Double,
        bounds: PortionBounds?,
    ): Double {
        if (bounds == null) return value // no bounds (g/ml qty≤0): accept ≥ 0 as-is
        val snapped = Math.round(value / bounds.step) * bounds.step
        return snapped.coerceIn(bounds.min, bounds.max)
    }

    private fun validId(id: String): Boolean = id.isNotBlank() && id.length <= MAX_ID_LEN

    /** The numeric suffix of an "it-N" id, or null if it is not that shape. */
    private fun itN(id: String): Int? =
        IT_N
            .matchEntire(id)
            ?.groupValues
            ?.get(1)
            ?.toIntOrNull()

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

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private fun notFound(): Nothing = throw ResponseStatusException(HttpStatus.NOT_FOUND)

    private fun unprocessable(message: String): Nothing = throw ResponseStatusException(UNPROCESSABLE, message)

    private companion object {
        const val MAX_ID_LEN = 40
        const val MAX_PORTIONS = 200
        val IT_N = Regex("^it-(\\d+)$")
        val UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY
    }
}
