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
 * Eating plans go through [importPlan]/[editPlan], which stamp stable meal ids
 * ("m-N") and item ids ("it-N") in document order — save-time only, no backfill,
 * CEO A2 — plus the server-authoritative portion bounds ([PortionBoundsHeuristic])
 * into the doc before it is encrypted. Programs use the generic [importVersion]/[edit] and
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
     * POST /plan: assign fresh ids m-1…m-N (meals) and it-1…it-N (items) in document
     * order + recompute portion
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
     * PUT /plan: preserve round-tripped meal/item ids, assign fresh ones above the max
     * suffix of each space, recompute portion bounds. Duplicate incoming ids → 400. Null → 404.
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

    /**
     * The current eating plan, typed, for the plan-aware capture digest (BE-051). Null when the
     * user has no plan — the parse prompt then stays byte-identical to 0.7.0.
     */
    fun currentEatingPlan(userId: UUID): EatingPlanDraft? =
        current(PlanTable.EATING_PLAN, userId)?.let { mapper.treeToValue(it, EatingPlanDraft::class.java) }

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
     * Stamp every item with an id and recomputed portion bounds, over the FLAT document
     * order — base `items` first, then each `options[k].items` in order, per meal (V3-D8).
     * On POST fresh ids it-1…it-N; on PUT preserve valid round-tripped ids (non-blank,
     * ≤40 chars, unique) and assign it-{max+1}… to the rest. Bounds derive from the
     * EFFECTIVE quantity/unit — the usual swap's when `usualSwapIndex` is set (V3-D9).
     * Validates the v3 constraints first (usual indices in range, list caps, status enum).
     */
    private fun decorate(
        draft: EatingPlanDraft,
        assignFreshIds: Boolean,
    ): EatingPlanDraft {
        validateV3(draft)
        val nextItemId = idStamper(allItems(draft).map { it.id }, "it", "item", assignFreshIds)
        val nextMealId = idStamper(draft.meals.map { it.id }, "m", "meal", assignFreshIds)

        fun stamp(item: PlanItem): PlanItem {
            val (q, u, g) = effective(item)
            // An "à vontade" usual swap (chosen swap with no quantity AND no grams) is unbounded →
            // no slider (spec §3.1). Without this it falls through to countable() = a bogus 0..3.
            val portion = if (item.usualSwapIndex != null && q == null && g == null) null else PortionBoundsHeuristic.of(q, u, g)
            return item.copy(id = nextItemId(item.id), portion = portion)
        }
        return draft.copy(
            meals =
                draft.meals.map { meal ->
                    meal.copy(
                        id = nextMealId(meal.id),
                        // base items are stamped before option items so ids follow flat order.
                        items = meal.items.map(::stamp),
                        options = meal.options?.map { opt -> opt.copy(items = opt.items.map(::stamp)) },
                    )
                },
        )
    }

    /**
     * One id space (items "it-N", meals "m-N"): on POST fresh 1…N in the order called;
     * on PUT preserve valid round-tripped ids (non-blank, ≤40 chars, unique) and assign
     * {prefix}-{max+1}… to the rest. Duplicate incoming ids → 400.
     */
    private fun idStamper(
        incoming: List<String?>,
        prefix: String,
        label: String,
        assignFreshIds: Boolean,
    ): (String?) -> String {
        if (assignFreshIds) {
            var n = 0
            return { "$prefix-${++n}" }
        }
        val valid = incoming.mapNotNull { it?.takeIf(::validId) }
        val dupes =
            valid
                .groupingBy { it }
                .eachCount()
                .filterValues { it > 1 }
                .keys
        if (dupes.isNotEmpty()) badRequest("duplicate $label id: ${dupes.joinToString()}")
        var next = valid.mapNotNull { suffixOf(prefix, it) }.maxOrNull() ?: 0
        return { id -> id?.takeIf(::validId) ?: "$prefix-${++next}" }
    }

    /** Contract v3 constraints that map to 400 (mirror the schema so bad saves fail loud). */
    private fun validateV3(draft: EatingPlanDraft) {
        if (draft.status !in VALID_STATUS) badRequest("status must be one of $VALID_STATUS.")
        draft.meals.forEach { meal ->
            val options = meal.options.orEmpty()
            if (options.size > MAX_OPTIONS) badRequest("A meal has more than $MAX_OPTIONS options.")
            meal.usualOptionIndex?.let { k ->
                if (k !in options.indices) badRequest("usualOptionIndex $k out of range for '${meal.name}'.")
            }
        }
        allItems(draft).forEach { item ->
            val swaps = item.swaps.orEmpty()
            if (swaps.size > MAX_SWAPS) badRequest("An item has more than $MAX_SWAPS swaps.")
            item.usualSwapIndex?.let { k ->
                if (k !in swaps.indices) badRequest("usualSwapIndex $k out of range for '${item.name}'.")
            }
        }
    }

    /** Every item in flat document order: base items then option items, per meal (V3-D8). */
    private fun allItems(draft: EatingPlanDraft): List<PlanItem> =
        draft.meals.flatMap { meal -> meal.items + meal.options.orEmpty().flatMap { it.items } }

    /** The item's effective (quantity, unit, grams): the usual swap's when chosen, else its own (V3-D9). */
    private fun effective(item: PlanItem): Triple<Double?, String?, Double?> {
        val k = item.usualSwapIndex
        val swaps = item.swaps
        return if (k != null && swaps != null && k in swaps.indices) {
            Triple(swaps[k].quantity, swaps[k].unit, swaps[k].grams)
        } else {
            Triple(item.quantity, item.unit, item.grams)
        }
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

    /**
     * itemId → EFFECTIVE (quantity, unit) for every item that has an id (V3-D9: usual-aware).
     * Grams is deliberately excluded: the prune resets an override only when the amount the slider
     * acts on changed, and a cosmetic grams-only doc edit (same quantity/unit) must keep the override.
     */
    private fun qtyUnitById(draft: EatingPlanDraft): Map<String, Pair<Double?, String?>> =
        allItems(draft)
            .mapNotNull { item ->
                val id = item.id ?: return@mapNotNull null
                val (q, u, _) = effective(item)
                id to (q to u)
            }.toMap()

    /** itemId → stored portion bounds (null when the item has no usable bounds) for the current doc. */
    private fun itemBounds(doc: JsonNode): Map<String, PortionBounds?> =
        allItems(mapper.treeToValue(doc, EatingPlanDraft::class.java))
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

    /** The numeric suffix of a "{prefix}-N" id, or null if it is not that shape. */
    private fun suffixOf(
        prefix: String,
        id: String,
    ): Int? = id.takeIf { it.startsWith("$prefix-") }?.removePrefix("$prefix-")?.toIntOrNull()

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
        const val MAX_SWAPS = 40
        const val MAX_OPTIONS = 8
        val VALID_STATUS = setOf("ready", "review")
        val UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY
    }
}
