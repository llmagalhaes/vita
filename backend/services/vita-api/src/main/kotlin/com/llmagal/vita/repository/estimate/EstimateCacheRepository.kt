package com.llmagal.vita.repository.estimate

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

/**
 * The write-back cache for what the seeded tables missed (V013/V014, ADR-0020 decision 8).
 *
 * USER-LESS BY DESIGN: a normalized name, a unit, a number. No user id, no user-tied
 * timestamp, no quantity — divorced from who typed it, a food name is not personal data,
 * which is what keeps a plaintext shared cache inside Vita's data stance. Do NOT add a
 * `user_id` here; that would turn a reference table into an unencrypted log of what people
 * eat. Disposable: one TRUNCATE resets either table.
 *
 * The cached food number is a BASIS value, not a total — kcal per 100 g/ml for a mass unit,
 * kcal per one <unit> for a countable one. That is what makes a quantity-less cache correct:
 * the row answers "Coxinha, 1 unit" for every quantity anyone ever asks.
 */
@Repository
class EstimateCacheRepository(
    private val jdbc: JdbcTemplate,
) {
    /** Cached basis kcal for a (name, unit) pair, or null when this name has never missed. */
    fun foodKcal(
        nameNorm: String,
        unit: String,
    ): Int? =
        jdbc
            .queryForList(
                "SELECT kcal FROM food_estimate_cache WHERE name_norm = ? AND unit = ?",
                Int::class.java,
                nameNorm,
                unit,
            ).firstOrNull()

    /** Write-back: a fresher answer replaces an older one (still one row per name+unit). */
    fun putFoodKcal(
        nameNorm: String,
        unit: String,
        kcal: Int,
    ) {
        jdbc.update(
            """
            INSERT INTO food_estimate_cache (name_norm, unit, kcal) VALUES (?, ?, ?)
            ON CONFLICT (name_norm, unit) DO UPDATE SET kcal = EXCLUDED.kcal, created_at = now()
            """.trimIndent(),
            nameNorm,
            unit,
            kcal,
        )
    }

    /** The cached muscle payload for an exercise name, as JSON, or null. */
    fun exercise(nameNorm: String): String? =
        jdbc
            .queryForList(
                "SELECT payload_json::text FROM exercise_estimate_cache WHERE name_norm = ?",
                String::class.java,
                nameNorm,
            ).firstOrNull()

    fun putExercise(
        nameNorm: String,
        payloadJson: String,
    ) {
        jdbc.update(
            """
            INSERT INTO exercise_estimate_cache (name_norm, payload_json) VALUES (?, ?::jsonb)
            ON CONFLICT (name_norm) DO UPDATE SET payload_json = EXCLUDED.payload_json, created_at = now()
            """.trimIndent(),
            nameNorm,
            payloadJson,
        )
    }
}
