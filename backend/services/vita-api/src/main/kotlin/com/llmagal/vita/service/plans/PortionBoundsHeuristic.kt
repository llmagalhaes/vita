package com.llmagal.vita.service.plans

import com.llmagal.vita.model.ai.PortionBounds
import kotlin.math.max

/**
 * Deterministic slider bounds for the portion-adjust modal (BE-037, DESIGN-SPEC §3).
 * Never the model: countable units -> 0..max(2*q, q+2) step 1; grams -> 0..2*q step
 * 10; millilitres -> 0..2*q step 50. Server-authoritative — recomputed at parse and
 * every save from quantity+unit; a client-sent portion is discarded. Returns null when
 * no usable quantity exists (g/ml with quantity <= 0) so the app keeps its own fallback.
 * Rounding is half-up on non-negative doubles; every output is a whole number.
 */
object PortionBoundsHeuristic {
    private val G_UNITS = setOf("g", "gram", "grams")
    private val ML_UNITS = setOf("ml", "milliliter", "milliliters", "millilitre", "millilitres")

    fun of(
        quantity: Double?,
        unit: String?,
    ): PortionBounds? =
        when (unit?.trim()?.lowercase() ?: "") {
            in G_UNITS -> stepped(quantity, GRAM_STEP)
            in ML_UNITS -> stepped(quantity, ML_STEP)
            else -> countable(quantity)
        }

    // COUNTABLE (incl. null/blank unit, "slice", "egg", "cup", …): integer slider.
    private fun countable(quantity: Double?): PortionBounds {
        val q = max(1.0, roundHalfUp(quantity ?: 1.0))
        return PortionBounds(min = 0.0, max = max(2 * q, q + 2), step = 1.0)
    }

    // G / ML: 0..2*q rounded to the unit's step, at least one step wide.
    private fun stepped(
        quantity: Double?,
        step: Double,
    ): PortionBounds? {
        if (quantity == null || quantity <= 0) return null
        val hi = max(step, roundHalfUp(2 * quantity / step) * step)
        return PortionBounds(min = 0.0, max = hi, step = step)
    }

    private fun roundHalfUp(value: Double): Double = Math.round(value).toDouble()

    private const val GRAM_STEP = 10.0
    private const val ML_STEP = 50.0
}
