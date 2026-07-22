package com.llmagal.vita.model

/**
 * The closed 11-silhouette muscle vocabulary (contract Exercise.muscles /
 * muscleRoles), with alias folding and role normalization. Shared by capture
 * parse (EntryService) and plan/program parse (PlanParseService) so the two
 * paths never drift (BE-040). Pure — no Spring, no state.
 */
object Muscles {
    val VOCAB: List<String> =
        listOf(
            "chest",
            "back",
            "shoulders",
            "biceps",
            "triceps",
            "forearms",
            "core",
            "glutes",
            "quads",
            "hamstrings",
            "calves",
        )

    private val SET = VOCAB.toSet()
    private val ALIASES = mapOf("lats" to "back", "traps" to "back", "abs" to "core", "obliques" to "core")
    private val ROLES = setOf("primary", "secondary")

    /** One raw muscle → the contract vocabulary, or null if unmappable (dropped). */
    fun map(raw: String): String? {
        val m = raw.trim().lowercase()
        return if (m in SET) m else ALIASES[m]
    }

    /** A raw muscle list → distinct contract-vocabulary list, or null if none survive. */
    fun mapAll(raw: List<String>?): List<String>? = raw?.mapNotNull(::map)?.distinct()?.takeIf { it.isNotEmpty() }

    /**
     * Normalize an exercise's muscles + roles (BE-040 §5.2): map role names and drop
     * unmappable / invalid-role entries; dedupe by muscle with primary winning over
     * secondary; derive `muscles` from the role names only when `muscles` is absent
     * (roles are never derived from a bare muscle list). Both independent otherwise.
     */
    fun normalize(
        muscles: List<String>?,
        roles: List<MuscleRole>?,
    ): Normalized {
        val deduped = roles?.let(::normalizeRoles)?.takeIf { it.isNotEmpty() }
        val resolvedMuscles = mapAll(muscles) ?: deduped?.map { it.name }
        return Normalized(resolvedMuscles?.takeIf { it.isNotEmpty() }, deduped)
    }

    private fun normalizeRoles(roles: List<MuscleRole>): List<MuscleRole> {
        val byName = LinkedHashMap<String, String>() // first-seen order; primary wins
        roles
            .mapNotNull { r -> map(r.name)?.takeIf { r.role in ROLES }?.let { it to r.role } }
            .forEach { (name, role) ->
                val existing = byName[name]
                if (existing == null || (existing == "secondary" && role == "primary")) byName[name] = role
            }
        return byName.map { MuscleRole(it.key, it.value) }
    }

    data class Normalized(
        val muscles: List<String>?,
        val muscleRoles: List<MuscleRole>?,
    )
}

/** A muscle with its role in an exercise (contract Exercise.muscleRoles). */
data class MuscleRole(
    val name: String,
    val role: String,
)
