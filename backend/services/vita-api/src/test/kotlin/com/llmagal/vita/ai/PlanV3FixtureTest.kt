package com.llmagal.vita.ai

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.PlanItem
import com.llmagal.vita.model.ai.PortionBounds
import com.llmagal.vita.service.plans.PortionBoundsHeuristic
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import tools.jackson.module.kotlin.readValue

/**
 * BE-045 §6.2 — the committed golden (`/eval/v3-meal-plan-golden.json`, the real parse of
 * meal-plan.pdf) deserializes cleanly into the v3 DTOs and matches the §2 ground-truth table.
 * Counts are computed from the fixture (A4-style), so the test is the structure, not magic
 * numbers. This is the deterministic twin of the on-demand live eval (never hits the API).
 */
class PlanV3FixtureTest {
    private val draft: EatingPlanDraft =
        jacksonObjectMapper().readValue(
            requireNotNull(javaClass.getResourceAsStream("/eval/v3-meal-plan-golden.json")) {
                "missing /eval/v3-meal-plan-golden.json"
            },
        )

    private fun allItems(): List<PlanItem> = draft.meals.flatMap { m -> m.items + m.options.orEmpty().flatMap { it.items } }

    @Test
    fun `five meals in document order`() {
        assertThat(draft.meals.map { it.name.lowercase() })
            .containsExactly("pré-treino", "pós-treino", "almoço", "lanche", "jantar")
    }

    @Test
    fun `meal options - Almoco has Brunch, Jantar has three`() {
        val almoco = draft.meals.first { it.name == "Almoço" }
        assertThat(almoco.options).hasSize(1)
        assertThat(almoco.options!![0].name).contains("Brunch")
        assertThat(almoco.options!![0].items).hasSize(6)

        val jantar = draft.meals.first { it.name == "Jantar" }
        assertThat(jantar.options).hasSize(3)
        assertThat(jantar.options!!.map { it.name })
            .anyMatch { it.contains("Tortilha") }
            .anyMatch { it.contains("Macarrão") }
            .anyMatch { it.contains("Hamburguer") }
    }

    @Test
    fun `base item counts and total item count`() {
        assertThat(draft.meals.map { it.items.size }).containsExactly(1, 1, 7, 1, 7)
        assertThat(allItems()).hasSize(42) // 17 base + 25 in options
    }

    @Test
    fun `swap totals and named-list spot counts`() {
        val totalSwaps = allItems().sumOf { it.swaps.orEmpty().size }
        assertThat(totalSwaps).isBetween(265, 315) // 308 in this capture; merge slack

        fun swapsOf(name: String) = allItems().first { it.name == name }.swaps.orEmpty()
        assertThat(swapsOf("Banana")).hasSize(25)
        assertThat(swapsOf("Maçã verde")).hasSize(26)
    }

    @Test
    fun `swaps carry no nutrition and an a-vontade swap has no quantity`() {
        // SwapOption has name/quantity/unit/grams only — no nutrition field exists to leak.
        val avontade =
            allItems()
                .flatMap { it.swaps.orEmpty() }
                .first { it.unit == "à vontade" }
        assertThat(avontade.quantity).isNull()
        assertThat(avontade.name).isNotBlank()
    }

    @Test
    fun `hydration and supplements transcribed - water is not a supplement`() {
        assertThat(draft.hydration?.mlPerDay).isEqualTo(2500.0)
        val supps = draft.supplements!!
        assertThat(supps).hasSize(3)
        assertThat(supps.map { it.name.lowercase() })
            .anyMatch { it.contains("creatina") }
            .anyMatch { it.contains("mega") } // ômega/omega
            .anyMatch { it.contains("vitamina d") }
        assertThat(supps.map { it.name.lowercase() }.none { it.contains("água") || it.contains("water") }).isTrue()
    }

    @Test
    fun `a gram item with its amount in grams still gets a step-10 slider`() {
        // The v3 model routes a plain weight ("Frango desfiado 200 g") into grams, quantity null.
        val frango = allItems().first { it.name.contains("Frango desfiado") }
        assertThat(frango.quantity).isNull()
        assertThat(frango.grams).isEqualTo(200.0)
        // The heuristic falls back to grams for a g/ml unit → 0..400 step 10 (not a null slider).
        assertThat(PortionBoundsHeuristic.of(frango.quantity, frango.unit, frango.grams))
            .isEqualTo(PortionBounds(0.0, 400.0, 10.0))
    }

    @Test
    fun `daily totals and per-meal kcal are the stated report numbers`() {
        val t = draft.dailyTotals!!
        assertThat(t.kcal).isEqualTo(1716.0)
        assertThat(t.proteinG).isEqualTo(188.6)
        assertThat(t.carbsG).isEqualTo(153.4)
        assertThat(t.fatG).isEqualTo(47.9)
        assertThat(draft.meals.map { it.kcal }).containsExactly(109.0, 121.0, 702.0, 72.0, 702.0)
    }
}
