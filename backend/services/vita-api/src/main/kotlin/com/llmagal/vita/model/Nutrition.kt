package com.llmagal.vita.model

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude

/**
 * Shared nutrition shapes (contract MacroTotals / Micro). One declaration for both
 * the entry detail and the plan/program drafts — same wire shape, so they must not
 * drift. Tolerant reader (unknown fields ignored) and null-dropping serializer, so
 * the same type serves both parsed input and echoed output.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class MacroTotals(
    val kcal: Double,
    val proteinG: Double? = null,
    val carbsG: Double? = null,
    val fatG: Double? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
data class Micro(
    val name: String,
    val amount: Double,
    val unit: String,
    val percentDaily: Double? = null,
)
