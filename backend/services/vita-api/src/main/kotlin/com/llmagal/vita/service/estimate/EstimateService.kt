package com.llmagal.vita.service.estimate

import com.llmagal.vita.model.MuscleRole
import com.llmagal.vita.model.Muscles
import com.llmagal.vita.model.estimate.ExerciseMusclesResult
import com.llmagal.vita.model.estimate.FoodKcalItem
import com.llmagal.vita.model.estimate.WorkoutExercise
import com.llmagal.vita.repository.estimate.EstimateCacheRepository
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ClaudeUsage
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.TypedToolCall
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import tools.jackson.core.JacksonException
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.jacksonMapperBuilder
import kotlin.math.roundToInt

/**
 * The three "fill it in for me" passes (BE-061/063/065, ADR-0020), all riding one ladder:
 *
 * ```
 * seeded table (exact → alias → trigram)  →  estimate cache  →  Claude, misses only, ONE call
 *                    ↑ free, < 5 ms                   ↓ automatic write-back into the CACHE
 * ```
 *
 * A pass the table answers in full makes no outbound call at all. What the table misses goes
 * out ONCE per pass for the whole batch, and the answer is cached user-lessly, so a given name
 * is a miss exactly once, ever.
 *
 * Rounding is server-side on every leg (`max(5, round(k/5)*5)`, [FoodLookup.round5]): roundness
 * is a property of the answer, not of one screen, and it launders whatever the model returns.
 * Nothing here is persisted against a user, and no pass ever touches the user's plan.
 */
@Service
@Suppress("TooManyFunctions") // three passes over one shared ladder; splitting buys three files, not clarity
class EstimateService(
    private val food: FoodLookup,
    private val exercises: ExerciseLookup,
    private val cache: EstimateCacheRepository,
    private val client: ClaudeClient,
    private val metrics: ParseMetrics,
    @param:Value("\${vita.ai.estimate-model:claude-haiku-4-5}") private val model: String,
) {
    private val log = LoggerFactory.getLogger(EstimateService::class.java)

    private val mapper: JsonMapper =
        jacksonMapperBuilder().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false).build()

    // ── BE-061 · food kcal ─────────────────────────────────────────────────

    /**
     * Positional and total: same length, same order, `null` where nothing could answer.
     * 422 only when the whole pass came back empty — a model leg that fails while the table
     * answered some items is still a 200 with nulls for the rest (an estimate pass never puts
     * the user's plan at risk).
     */
    fun foodKcal(items: List<FoodKcalItem>): List<Int?> {
        val out = arrayOfNulls<Int>(items.size)
        val misses = LinkedHashMap<Basis, MutableList<Int>>()

        items.forEachIndexed { i, item ->
            val name = item.name.orEmpty().trim()
            val quantity = quantityOf(item)
            if (name.isEmpty() || quantity <= 0) return@forEachIndexed
            out[i] = food.kcal(name, quantity, item.unit.orEmpty())
            if (out[i] == null) {
                val basis = Basis(NameNorm.of(name), basisUnit(item.unit))
                if (basis.nameNorm.isNotEmpty()) misses.getOrPut(basis) { mutableListOf() }.add(i)
            }
        }
        val tableHits = out.count { it != null }

        val unresolved = LinkedHashMap<Basis, MutableList<Int>>()
        misses.forEach { (basis, idx) ->
            val cached = cache.foodKcal(basis.nameNorm, basis.unit)
            if (cached == null) unresolved[basis] = idx else idx.forEach { out[it] = total(cached, basis, items[it]) }
        }
        val cacheHits = out.count { it != null } - tableHits

        val usage = if (unresolved.isEmpty()) ClaudeUsage(0, 0) else askFood(unresolved, items, out)
        log.info(
            "estimate kind=food items={} tableHits={} cacheHits={} misses={} answered={} inputTokens={} outputTokens={}",
            items.size,
            tableHits,
            cacheHits,
            unresolved.size,
            out.count { it != null },
            usage.inputTokens,
            usage.outputTokens,
        )
        if (out.all { it == null }) unprocessable("No item could be estimated.")
        return out.toList()
    }

    /** The batched miss call: one request for the whole pass, answers written back into the cache. */
    private fun askFood(
        unresolved: Map<Basis, MutableList<Int>>,
        items: List<FoodKcalItem>,
        out: Array<Int?>,
    ): ClaudeUsage {
        val keys = unresolved.keys.toList()
        val lines =
            keys.mapIndexed { n, basis ->
                val asTyped = items[unresolved.getValue(basis).first()].name.orEmpty().trim()
                "${n + 1}. $asTyped | ${basisAmount(basis.unit)}"
            }
        val call =
            ask(
                EstimatePrompts.FOOD_SYSTEM,
                EstimatePrompts.FOOD_TOOL,
                EstimatePrompts.FOOD_TOOL_NAME,
                lines.joinToString("\n"),
                EstimatePrompts.FoodToolOutput::class.java,
            )
        call.value?.items.orEmpty().forEach { answer ->
            val basis = answer.n?.let { keys.getOrNull(it - 1) } ?: return@forEach
            val kcal = answer.kcal ?: return@forEach
            // Cached as the BASIS value (per 100 g/ml, or per one unit), never as a total —
            // that is what lets one user-less row answer every quantity anyone ever asks.
            val perBasis = kcal.roundToInt().coerceAtLeast(0)
            cache.putFoodKcal(basis.nameNorm, basis.unit, perBasis)
            unresolved.getValue(basis).forEach { out[it] = total(perBasis, basis, items[it]) }
        }
        return call.usage
    }

    private fun quantityOf(item: FoodKcalItem): Double = item.quantity ?: 1.0

    /** Total for the stated quantity, from a basis value, rounded on the way out. */
    private fun total(
        perBasis: Int,
        basis: Basis,
        item: FoodKcalItem,
    ): Int {
        val quantity = quantityOf(item)
        val raw = if (basis.unit == MASS_BASIS) perBasis * quantity / GRAMS_BASIS else perBasis * quantity
        return FoodLookup.round5(raw)
    }

    /**
     * The cache key's unit: mass units collapse onto one 100-g basis, count units onto one
     * per-unit basis, and anything else keeps the word the user typed ("1 colher of X").
     */
    private fun basisUnit(raw: String?): String {
        val unit = raw?.trim()?.lowercase().orEmpty()
        return when {
            unit.isEmpty() || unit in FoodLookup.COUNT_UNITS -> COUNT_BASIS
            unit in FoodLookup.MASS_UNITS -> MASS_BASIS
            else -> unit
        }
    }

    private fun basisAmount(unit: String): String = if (unit == MASS_BASIS) "100 g" else "1 $unit"

    // ── BE-063 · exercise muscles ──────────────────────────────────────────

    /**
     * Catalog hit → `estimated: false` (a curated mapping, the full tint). Cache or model →
     * `estimated: true` (the pale band). Nothing confident → an EMPTY list, which the app
     * renders as "not mapped": guessing a body map would invent data.
     */
    fun exerciseMuscles(names: List<String>): List<ExerciseMusclesResult> {
        val out = arrayOfNulls<ExerciseMusclesResult>(names.size)
        val misses = LinkedHashMap<String, MutableList<Int>>()

        names.forEachIndexed { i, raw ->
            val hit = exercises.find(raw)
            if (hit != null) {
                out[i] = ExerciseMusclesResult(normalize(hit.muscleRoles), hit.wholeBody, estimated = false)
            } else {
                val key = NameNorm.of(raw)
                if (key.isNotEmpty()) misses.getOrPut(key) { mutableListOf() }.add(i)
            }
        }
        val catalogHits = out.count { it != null }

        val unresolved = LinkedHashMap<String, MutableList<Int>>()
        misses.forEach { (key, idx) ->
            val cached = cache.exercise(key)?.let(::readCached)
            if (cached == null) unresolved[key] = idx else idx.forEach { out[it] = cached }
        }

        var legFailed = false
        var usage = ClaudeUsage(0, 0)
        if (unresolved.isNotEmpty()) {
            val call = askMuscles(unresolved, names, out)
            legFailed = call.value == null
            usage = call.usage
        }
        log.info(
            "estimate kind=exercise items={} catalogHits={} misses={} answered={} inputTokens={} outputTokens={}",
            names.size,
            catalogHits,
            unresolved.size,
            out.count { it != null },
            usage.inputTokens,
            usage.outputTokens,
        )
        if (legFailed && out.all { it == null }) unprocessable("No exercise could be mapped.")
        // Whatever the model left out stays honestly unmapped rather than guessed.
        return out.map { it ?: ExerciseMusclesResult(emptyList(), wholeBody = false, estimated = true) }
    }

    private fun askMuscles(
        unresolved: Map<String, MutableList<Int>>,
        names: List<String>,
        out: Array<ExerciseMusclesResult?>,
    ): TypedToolCall<EstimatePrompts.MuscleToolOutput> {
        val keys = unresolved.keys.toList()
        val lines = keys.mapIndexed { n, key -> "${n + 1}. ${names[unresolved.getValue(key).first()].trim()}" }
        val call =
            ask(
                EstimatePrompts.MUSCLE_SYSTEM,
                EstimatePrompts.MUSCLE_TOOL,
                EstimatePrompts.MUSCLE_TOOL_NAME,
                lines.joinToString("\n"),
                EstimatePrompts.MuscleToolOutput::class.java,
            )
        call.value?.items.orEmpty().forEach { answer ->
            val key = answer.n?.let { keys.getOrNull(it - 1) } ?: return@forEach
            val roles = normalize(answer.muscles.orEmpty().mapNotNull(::toRole))
            val result = ExerciseMusclesResult(roles, answer.wholeBody ?: false, estimated = true)
            // Cached already normalized — the vocabulary is closed on the way IN as well as out.
            cache.putExercise(key, mapper.writeValueAsString(CachedMuscles(result.muscleRoles, result.wholeBody)))
            unresolved.getValue(key).forEach { out[it] = result }
        }
        return call
    }

    private fun toRole(raw: EstimatePrompts.MuscleToolRole): MuscleRole? =
        raw.name?.let { name -> raw.role?.let { role -> MuscleRole(name, role) } }

    /** Every answer — catalog, cache and model alike — leaves through the closed vocabulary. */
    private fun normalize(roles: List<MuscleRole>): List<MuscleRole> = Muscles.normalize(null, roles).muscleRoles ?: emptyList()

    private fun readCached(json: String): ExerciseMusclesResult? =
        try {
            mapper.readValue(json, CachedMuscles::class.java).let {
                ExerciseMusclesResult(normalize(it.muscleRoles), it.wholeBody, estimated = true)
            }
        } catch (e: JacksonException) {
            log.warn("Discarding an unreadable exercise cache row: {}", e.javaClass.name)
            null
        }

    // ── BE-065 · workout kcal ──────────────────────────────────────────────

    /**
     * One day in, one number out (D9). Energy is a property of the session, so the day is
     * never a sum of independent model calls:
     *
     * - every exercise the catalog knows is priced LOCALLY from its family + whole-body flag
     *   and the volume the caller states — zero cost, zero latency;
     * - if any name is unknown, the whole day goes out in ONE model call, and its number wins;
     * - if that call fails, the local sum stands whenever at least one exercise resolved,
     *   otherwise there was nothing to estimate from → 422.
     *
     * ponytail: no cache leg here — the only reusable key would be the whole day's composition,
     * which is never asked twice. If day-level estimates ever get hot, cache per (name, volume).
     */
    fun workoutKcal(day: List<WorkoutExercise>): Int {
        val rows = day.map { it to exercises.find(it.name.orEmpty()) }
        val known = rows.count { it.second != null }
        val local = rows.sumOf { (ex, hit) -> localKcal(ex, hit) }

        var usage = ClaudeUsage(0, 0)
        var answer: Double? = null
        if (known < rows.size) {
            val lines = rows.mapIndexed { n, (ex, hit) -> "${n + 1}. ${ex.name.orEmpty().trim()} — ${volume(ex, hit)}" }
            val call =
                ask(
                    EstimatePrompts.WORKOUT_SYSTEM,
                    EstimatePrompts.WORKOUT_TOOL,
                    EstimatePrompts.WORKOUT_TOOL_NAME,
                    lines.joinToString("\n"),
                    EstimatePrompts.WorkoutToolOutput::class.java,
                )
            usage = call.usage
            answer = call.value?.kcal
        }
        log.info(
            "estimate kind=workout items={} catalogHits={} misses={} model={} inputTokens={} outputTokens={}",
            rows.size,
            known,
            rows.size - known,
            answer != null,
            usage.inputTokens,
            usage.outputTokens,
        )
        if (answer == null && known == 0) unprocessable("No exercise could be estimated.")
        return FoodLookup.round5(answer ?: local)
    }

    /**
     * A MET-style local estimate. The rates and the per-set timing are deliberate CALIBRATION
     * KNOBS, not physics: a real session drifts from any formula, and the number is labelled an
     * estimate on every screen it reaches.
     */
    private fun localKcal(
        ex: WorkoutExercise,
        hit: ExerciseHit?,
    ): Double {
        val family = famOf(ex, hit)
        val minutes =
            if (family == TIME_FAMILY) {
                (ex.min ?: DEFAULT_MIN).toDouble()
            } else {
                (ex.sets ?: DEFAULT_SETS) * ((ex.reps ?: DEFAULT_REPS) * SECONDS_PER_REP + REST_SECONDS) / SECONDS_PER_MIN
            }
        val rate =
            when {
                hit?.wholeBody == true -> WHOLE_BODY_KCAL_PER_MIN
                family == TIME_FAMILY -> CARDIO_KCAL_PER_MIN
                else -> STRENGTH_KCAL_PER_MIN
            }
        return minutes * rate
    }

    /** The caller's own family wins; else the catalog's; else whichever volume field is present. */
    private fun famOf(
        ex: WorkoutExercise,
        hit: ExerciseHit?,
    ): String =
        ex.fam
            ?.trim()
            ?.lowercase()
            ?.takeIf { it == SET_FAMILY || it == TIME_FAMILY }
            ?: hit?.family
            ?: if (ex.min != null) TIME_FAMILY else SET_FAMILY

    private fun volume(
        ex: WorkoutExercise,
        hit: ExerciseHit?,
    ): String =
        if (famOf(ex, hit) == TIME_FAMILY) {
            "${ex.min ?: DEFAULT_MIN} min"
        } else {
            "${ex.sets ?: DEFAULT_SETS}x${ex.reps ?: DEFAULT_REPS}"
        }

    // ── shared ─────────────────────────────────────────────────────────────

    /**
     * The one model leg. A transport failure is NOT an error the user sees: the table answers
     * stand and the misses come back empty (the 422 decision is the caller's, above).
     */
    private fun <T : Any> ask(
        system: String,
        tool: Map<String, Any>,
        toolName: String,
        userText: String,
        type: Class<T>,
    ): TypedToolCall<T> =
        try {
            val call = client.callEstimateTool(model, system, tool, toolName, userText, type)
            val outcome = if (call.value == null) "estimate-uninterpretable" else "estimate"
            metrics.record(outcome, call.usage.inputTokens, call.usage.outputTokens)
            call
        } catch (e: RestClientException) {
            metrics.record("estimate-error", 0, 0)
            log.warn("Estimate model leg failed — table answers stand: {}", e.javaClass.name)
            TypedToolCall(null, ClaudeUsage(0, 0))
        }

    private fun unprocessable(detail: String): Nothing = throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, detail)

    /** A food's cache key: the normalized name plus the basis its number is expressed in. */
    private data class Basis(
        val nameNorm: String,
        val unit: String,
    )

    private data class CachedMuscles(
        val muscleRoles: List<MuscleRole> = emptyList(),
        val wholeBody: Boolean = false,
    )

    private companion object {
        const val MASS_BASIS = "g" // the cached number is per 100 g/ml
        const val COUNT_BASIS = "unit" // …or per one of whatever the unit names
        const val GRAMS_BASIS = 100.0

        const val SET_FAMILY = "set"
        const val TIME_FAMILY = "time"
        const val SECONDS_PER_MIN = 60.0

        // Calibration knobs (BE-065). Round numbers on purpose — the answer is rounded to 5.
        const val SECONDS_PER_REP = 4
        const val REST_SECONDS = 75
        const val DEFAULT_SETS = 3
        const val DEFAULT_REPS = 10
        const val DEFAULT_MIN = 20
        const val STRENGTH_KCAL_PER_MIN = 6.0
        const val CARDIO_KCAL_PER_MIN = 8.0
        const val WHOLE_BODY_KCAL_PER_MIN = 10.0
    }
}
