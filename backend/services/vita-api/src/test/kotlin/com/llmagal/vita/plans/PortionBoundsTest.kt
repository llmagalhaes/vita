package com.llmagal.vita.plans

import com.llmagal.vita.model.ai.PortionBounds
import com.llmagal.vita.service.plans.PortionBoundsHeuristic
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory

/**
 * BE-037 — the deterministic portion-bounds heuristic (DESIGN-SPEC §3): the 11
 * reference rows, the edge rows, half-up rounding, and unit classification
 * (case/whitespace, word forms, countable fallback, g/ml degenerate → omitted).
 */
class PortionBoundsTest {
    private data class Row(
        val quantity: Double?,
        val unit: String?,
        val expected: PortionBounds?,
    )

    @TestFactory
    fun heuristic(): List<DynamicTest> =
        listOf(
            // §3.4 reference table (heuristic values, which differ from the handoff's hand-authored ones).
            Row(2.0, "egg", b(0, 4, 1)),
            Row(1.0, "slice", b(0, 3, 1)),
            Row(200.0, "ml", b(0, 400, 50)),
            Row(180.0, "g", b(0, 360, 10)),
            Row(200.0, "g", b(0, 400, 10)),
            Row(100.0, "g", b(0, 200, 10)),
            Row(170.0, "g", b(0, 340, 10)),
            Row(30.0, "g", b(0, 60, 10)),
            Row(160.0, "g", b(0, 320, 10)),
            Row(150.0, "g", b(0, 300, 10)),
            // Edge rows (§3.4).
            Row(null, "egg", b(0, 3, 1)),
            Row(1.5, "scoop", b(0, 4, 1)), // q rounds half-up to 2
            Row(null, "g", null), // degenerate → omitted
            Row(0.0, "ml", null), // degenerate → omitted
            Row(0.4, "g", b(0, 10, 10)), // ≥ one step
            Row(7.0, "g", b(0, 10, 10)), // 14/10 → 1 → 10
            Row(8.0, "g", b(0, 20, 10)), // 16/10 → 2 → 20
            Row(25.0, "ml", b(0, 50, 50)),
            Row(200.0, null, b(0, 400, 1)), // null unit → countable
            // Classification: case/whitespace and word forms.
            Row(150.0, " G ", b(0, 300, 10)),
            Row(150.0, "Grams", b(0, 300, 10)),
            Row(200.0, "millilitres", b(0, 400, 50)),
            Row(2.0, "cup", b(0, 4, 1)), // countable (not a gram/ml word)
        ).map { row ->
            DynamicTest.dynamicTest("${row.quantity} ${row.unit} -> ${row.expected}") {
                assertThat(PortionBoundsHeuristic.of(row.quantity, row.unit)).isEqualTo(row.expected)
            }
        }

    private fun b(
        min: Int,
        max: Int,
        step: Int,
    ) = PortionBounds(min.toDouble(), max.toDouble(), step.toDouble())
}
