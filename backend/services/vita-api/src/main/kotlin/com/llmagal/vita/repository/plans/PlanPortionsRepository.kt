package com.llmagal.vita.repository.plans

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue
import java.util.UUID

/** The stored overlay: which plan version it belongs to + the sparse itemId→qty map. */
data class StoredPortions(
    val planId: UUID,
    val portions: Map<String, Double>,
)

/**
 * The eating-plan portion overlay (BE-038, V008). Plaintext jsonb — portions are
 * not sensitive (CEO A1), so no crypto here (unlike the doc blob). One row per
 * user, replace-on-write upsert keyed on user_id (the `vacation` pattern).
 */
@Repository
class PlanPortionsRepository(
    private val jdbc: JdbcTemplate,
    private val json: JsonMapper,
) {
    /** The user's overlay, or null if none is stored. */
    fun get(userId: UUID): StoredPortions? =
        jdbc
            .query(
                "SELECT plan_id, portions::text AS portions FROM plan_portions WHERE user_id = ?",
                { rs, _ ->
                    StoredPortions(
                        planId = rs.getObject("plan_id", UUID::class.java),
                        portions = json.readValue(rs.getString("portions")),
                    )
                },
                userId,
            ).firstOrNull()

    /** Replace the user's overlay for [planId] with [portions] (upsert on user_id). */
    fun upsert(
        userId: UUID,
        planId: UUID,
        portions: Map<String, Double>,
    ) {
        jdbc.update(
            """
            INSERT INTO plan_portions (user_id, plan_id, portions, updated_at)
            VALUES (?, ?, ?::jsonb, now())
            ON CONFLICT (user_id) DO UPDATE
              SET plan_id = EXCLUDED.plan_id, portions = EXCLUDED.portions, updated_at = now()
            """.trimIndent(),
            userId,
            planId,
            json.writeValueAsString(portions),
        )
    }

    /** Drop the user's overlay (no-op if absent). */
    fun delete(userId: UUID) {
        jdbc.update("DELETE FROM plan_portions WHERE user_id = ?", userId)
    }
}
