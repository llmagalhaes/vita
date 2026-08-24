package com.llmagal.vita.service.estimate

import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import kotlin.math.max
import kotlin.math.roundToLong

/** A seeded food row, only the columns the kcal answer needs. */
data class FoodRow(
    val namePt: String,
    val kcal100g: Double,
    val gramsPerUnit: Double?,
)

/**
 * The table leg of the hybrid estimator (BE-060, ADR-0020 decision 6): the seeded TACO
 * table + our alias list, consulted before anything reaches Claude. A hit costs nothing
 * and answers in single-digit milliseconds.
 *
 * Order: exact `name_norm` -> `food_alias` -> trigram similarity >= [THRESHOLD], best
 * match wins, ties by shortest name then alphabetically (so a tie between "arroz, tipo
 * 1, cozido" and "arroz, tipo 2, cozido" is decided, not random). Below the threshold is
 * a MISS, not a bad guess — the table is consulted first and would never re-ask, so a
 * wrong row is worse than a model call.
 */
@Service
class FoodLookup(
    private val jdbc: JdbcTemplate,
) {
    /** The seeded row for [rawName], or null when nothing matched well enough. */
    fun find(rawName: String): FoodRow? {
        val key = NameNorm.of(rawName)
        return if (key.isEmpty()) null else one(EXACT, key) ?: one(BY_ALIAS, key) ?: one(FUZZY, key, key, key)
    }

    /**
     * Total kcal for [quantity] of [unit] of [rawName], already rounded, or null (a MISS)
     * when the name is unknown, the unit is not one we can convert, or the row has no
     * `grams_per_unit` for a countable unit. Deliberately no fallback gram assumption:
     * "1 unidade" of bread and of watermelon must not share a number.
     */
    fun kcal(
        rawName: String,
        quantity: Double,
        unit: String,
    ): Int? {
        val row = if (quantity > 0) find(rawName) else null
        return row?.let { r -> grams(r, quantity, unit)?.let { round5(it / GRAMS_BASIS * r.kcal100g) } }
    }

    private fun grams(
        row: FoodRow,
        quantity: Double,
        unit: String,
    ): Double? =
        when (unit.trim().lowercase()) {
            // ml is treated as g: for water, juice and milk the density error is inside
            // the noise of an estimate, and the number is labelled as one.
            in MASS_UNITS -> quantity
            in COUNT_UNITS -> row.gramsPerUnit?.times(quantity)
            else -> null
        }

    private fun one(
        sql: String,
        vararg args: Any,
    ): FoodRow? =
        jdbc
            .query(sql, { rs, _ ->
                FoodRow(
                    namePt = rs.getString("name_pt"),
                    kcal100g = rs.getDouble("kcal_100g"),
                    gramsPerUnit = rs.getBigDecimal("grams_per_unit")?.toDouble(),
                )
            }, *args)
            .firstOrNull()

    /** BE-064 probe hook: the seed size, once, at boot. */
    @EventListener(ApplicationReadyEvent::class)
    fun logSeedSize() {
        log.info(
            "seed table=food rows={} aliases={}",
            jdbc.queryForObject("SELECT count(*) FROM food", Int::class.java),
            jdbc.queryForObject("SELECT count(*) FROM food_alias", Int::class.java),
        )
    }

    companion object {
        private val log = LoggerFactory.getLogger(FoodLookup::class.java)

        /** ADR-0020 decision 6. If hit quality disappoints the lever is aliases, never this. */
        const val THRESHOLD = 0.45
        private const val GRAMS_BASIS = 100.0
        private const val STEP = 5.0

        private val MASS_UNITS = setOf("g", "gram", "grams", "grama", "gramas", "ml", "milliliter", "millilitre")
        private val COUNT_UNITS = setOf("unit", "units", "unidade", "unidades", "serving", "servings")

        private const val COLS = "name_pt, kcal_100g, grams_per_unit"
        private const val EXACT = "SELECT $COLS FROM food WHERE name_norm = ?"
        private const val BY_ALIAS =
            "SELECT f.name_pt, f.kcal_100g, f.grams_per_unit FROM food_alias a " +
                "JOIN food f ON f.id = a.food_id WHERE a.name_norm = ?"

        // `name_norm % ?` rides the GIN trigram index (its own default cut is 0.3, well
        // below ours, so it is a pure prefilter); the explicit similarity enforces OUR floor.
        private const val FUZZY =
            "SELECT $COLS, similarity(name_norm, ?) AS sim FROM food " +
                "WHERE name_norm % ? AND similarity(name_norm, ?) >= $THRESHOLD " +
                "ORDER BY sim DESC, length(name_norm), name_norm LIMIT 1"

        /**
         * `max(5, round(k/5)*5)` — server-side by design (ADR-0020 decision 6): roundness is
         * a property of the answer, not of one screen, and this launders whatever the model
         * returns. Shared with the estimate endpoints (BE-061).
         */
        fun round5(kcal: Double): Int = max(STEP, (kcal / STEP).roundToLong() * STEP).toInt()
    }
}
