package com.llmagal.vita.service.estimate

import com.llmagal.vita.model.MuscleRole
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.util.UUID

/** A seeded exercise: the contract's `family`, `wholeBody` and `muscleRoles` for one name. */
data class ExerciseHit(
    val name: String,
    val family: String,
    val wholeBody: Boolean,
    val muscleRoles: List<MuscleRole>,
)

/**
 * The table leg for exercises (BE-062) — same lookup order and same threshold as
 * [FoodLookup], over the EXCAT + free-exercise-db seed. EXCAT wins every name collision
 * because it is inserted first and `name_norm` is unique (V014).
 *
 * A hit here is a CURATED mapping: the estimate endpoint (BE-063) reports it as
 * `estimated: false`, which is what earns it the full tint instead of the pale band.
 */
@Service
class ExerciseLookup(
    private val jdbc: JdbcTemplate,
) {
    /** The seeded exercise for [rawName], or null when nothing matched well enough. */
    fun find(rawName: String): ExerciseHit? {
        val key = NameNorm.of(rawName)
        val found = if (key.isEmpty()) null else one(EXACT, key) ?: one(BY_ALIAS, key) ?: one(FUZZY, key, key, key)
        return found?.let { (id, hit) -> hit.copy(muscleRoles = muscles(id)) }
    }

    private fun muscles(id: UUID): List<MuscleRole> =
        jdbc.query(
            // primary first, then alphabetical — a stable order for the app and for tests.
            "SELECT muscle, role FROM exercise_muscle WHERE exercise_id = ? ORDER BY role, muscle",
            { rs, _ -> MuscleRole(rs.getString("muscle"), rs.getString("role")) },
            id,
        )

    private fun one(
        sql: String,
        vararg args: Any,
    ): Pair<UUID, ExerciseHit>? =
        jdbc
            .query(sql, { rs, _ ->
                rs.getObject("id", UUID::class.java) to
                    ExerciseHit(
                        name = rs.getString("name"),
                        family = rs.getString("family"),
                        wholeBody = rs.getBoolean("whole_body"),
                        muscleRoles = emptyList(),
                    )
            }, *args)
            .firstOrNull()

    /** BE-064 probe hook: the seed size, once, at boot. */
    @EventListener(ApplicationReadyEvent::class)
    fun logSeedSize() {
        log.info(
            "seed table=exercise rows={} muscles={} aliases={}",
            jdbc.queryForObject("SELECT count(*) FROM exercise", Int::class.java),
            jdbc.queryForObject("SELECT count(*) FROM exercise_muscle", Int::class.java),
            jdbc.queryForObject("SELECT count(*) FROM exercise_alias", Int::class.java),
        )
    }

    companion object {
        private val log = LoggerFactory.getLogger(ExerciseLookup::class.java)

        private const val COLS = "id, name, family, whole_body"
        private const val EXACT = "SELECT $COLS FROM exercise WHERE name_norm = ?"
        private const val BY_ALIAS =
            "SELECT e.id, e.name, e.family, e.whole_body FROM exercise_alias a " +
                "JOIN exercise e ON e.id = a.exercise_id WHERE a.name_norm = ?"
        private const val FUZZY =
            "SELECT $COLS, similarity(name_norm, ?) AS sim FROM exercise " +
                "WHERE name_norm % ? AND similarity(name_norm, ?) >= ${FoodLookup.THRESHOLD} " +
                "ORDER BY sim DESC, length(name_norm), name_norm LIMIT 1"
    }
}
