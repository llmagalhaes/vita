package com.llmagal.vita.ai

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.PlanItem
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.ParseService
import com.llmagal.vita.service.plans.PlanService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import tools.jackson.module.kotlin.jacksonObjectMapper
import tools.jackson.module.kotlin.readValue
import java.time.OffsetDateTime
import java.util.UUID

/**
 * BE-051 — plan-aware capture against the LIVE Claude API and the REAL imported plan
 * (`/eval/v3-meal-plan-golden.json`, the committed parse of meal-plan.pdf). Excluded from the
 * normal build (@Tag("live")); run on demand with:
 *   ANTHROPIC_API_KEY=sk-... ./gradlew liveEval
 * Skips (does not fail) when no key is set. ≈$0.02 per run.
 *
 * DEVIATION from the plan's example phrase: the real plan has no rice item — its lunch starch is
 * "Milho verde cozido no vapor", whose swap list includes "Batata doce cozida". The eval swaps the
 * corn for sweet potato instead; the assertion is the same shape (matched meal + a replacesItemId
 * pointing at the starch item the note replaced).
 */
@Tag("live")
class PlanAwareParseLiveEvalTest {
    private val log = LoggerFactory.getLogger(PlanAwareParseLiveEvalTest::class.java)

    @Test
    fun `lunch as planned but the corn swapped for sweet potato comes back matched and adjusted`() {
        val apiKey = System.getenv("ANTHROPIC_API_KEY").orEmpty()
        assumeTrue(apiKey.isNotBlank(), "ANTHROPIC_API_KEY not set — skipping live eval")
        val baseUrl = System.getenv("ANTHROPIC_BASE_URL") ?: "https://api.anthropic.com"
        val model = System.getenv("VITA_AI_MODEL") ?: "claude-haiku-4-5"

        val plan = stampIds(realPlan())
        val lunch = plan.meals.first { it.name == "Almoço" }
        val corn = lunch.items.first { it.name.startsWith("Milho") }

        val plans = mockk<PlanService>()
        every { plans.currentEatingPlan(USER) } returns plan
        val client = ClaudeClient(baseUrl, model, 1024, 20, apiKey, 25, 2048, 16384, 300)
        val service = ParseService(client, ParseMetrics(SimpleMeterRegistry()), "claude-sonnet-4-6", plans)

        val drafts = service.parseText(NOTE, CAPTURED_AT, USER).drafts
        log.info("live plan-aware drafts: {}", drafts)

        val meal = drafts.first { it.type == "meal" }
        assertThat(meal.detail["planMealId"]).isEqualTo(lunch.id)
        assertThat(meal.detail["planStatus"]).isEqualTo("adjusted")

        @Suppress("UNCHECKED_CAST")
        val items = meal.detail["items"] as List<Map<String, Any?>>
        val replacement = items.first { it["replacesItemId"] == corn.id }
        assertThat(replacement["name"].toString().lowercase()).contains("batata doce")
    }

    private fun realPlan(): EatingPlanDraft =
        jacksonObjectMapper().readValue(
            requireNotNull(javaClass.getResourceAsStream("/eval/v3-meal-plan-golden.json")) {
                "missing /eval/v3-meal-plan-golden.json"
            },
        )

    /**
     * The parse fixture carries no ids (parse output never does) — stamp them exactly as
     * PlanService.decorate() would on POST /plan: meals m-1…m-N, items it-1…it-N in flat
     * document order (a meal's base items, then its options' items).
     */
    private fun stampIds(plan: EatingPlanDraft): EatingPlanDraft {
        var meal = 0
        var item = 0

        fun stamp(i: PlanItem) = i.copy(id = "it-${++item}")
        return plan.copy(
            meals =
                plan.meals.map { m ->
                    m.copy(
                        id = "m-${++meal}",
                        items = m.items.map(::stamp),
                        options = m.options?.map { o -> o.copy(items = o.items.map(::stamp)) },
                    )
                },
        )
    }

    private companion object {
        val USER: UUID = UUID.fromString("11111111-2222-3333-4444-555555555555")
        val CAPTURED_AT: OffsetDateTime = OffsetDateTime.parse("2026-08-19T13:10:00-03:00")
        const val NOTE = "almocei como planejado, mas troquei o milho por batata doce"
    }
}
