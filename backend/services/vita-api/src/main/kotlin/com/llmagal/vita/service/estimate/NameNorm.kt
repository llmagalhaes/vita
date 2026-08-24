package com.llmagal.vita.service.estimate

import java.text.Normalizer

/**
 * The one lookup key for both reference tables (BE-060/BE-062, ADR-0020 decision 6):
 * lowercase -> strip accents -> drop punctuation -> collapse whitespace -> drop one
 * leading quantity. "Pão Francês", "pao frances" and "PÃO FRANCES" all become
 * `pao frances`.
 *
 * These exact rules are mirrored in `backend/tools/gen_seed_migrations.py`, which
 * precomputes `name_norm` for every seeded row. `SeedNormalizationTest` re-derives the
 * whole table through this function, so the two can never drift apart unnoticed —
 * cheaper and safer than a second implementation in plpgsql that nobody would test.
 *
 * ponytail: only a DIGIT token counts as a quantity, and it is stripped once, not in a
 * loop. Stripping word-numbers collapsed "One-Arm Kettlebell Row" onto "Two-Arm
 * Kettlebell Row", and looping collapsed "3/4 Sit-Up" onto "Sit-Up" — two different
 * exercises sharing one key. If "duas fatias de pão" ever needs handling, it belongs in
 * the caller that already knows a quantity field exists, not here.
 */
object NameNorm {
    private val NOT_ALNUM = Regex("[^a-z0-9]+")
    private val COMBINING = Regex("\\p{Mn}+")
    private val NUMBER = Regex("\\d+([.,]\\d+)?")

    private val UNIT_WORDS =
        setOf(
            "g",
            "gr",
            "grama",
            "gramas",
            "kg",
            "ml",
            "l",
            "litro",
            "litros",
            "un",
            "unidade",
            "unidades",
            "fatia",
            "fatias",
            "colher",
            "colheres",
            "xicara",
            "xicaras",
            "copo",
            "copos",
        )
    private val FILLER = setOf("de", "do", "da", "of")

    fun of(raw: String): String {
        val folded =
            COMBINING
                .replace(Normalizer.normalize(raw.lowercase(), Normalizer.Form.NFD), "")
                .let { NOT_ALNUM.replace(it, " ") }
                .trim()
        val tokens = ArrayDeque(folded.split(" ").filter { it.isNotEmpty() })
        if (tokens.size > 1 && NUMBER.matches(tokens.first())) {
            tokens.removeFirst()
            if (tokens.size > 1 && tokens.first() in UNIT_WORDS) tokens.removeFirst()
            if (tokens.size > 1 && tokens.first() in FILLER) tokens.removeFirst()
        }
        return tokens.joinToString(" ")
    }
}
