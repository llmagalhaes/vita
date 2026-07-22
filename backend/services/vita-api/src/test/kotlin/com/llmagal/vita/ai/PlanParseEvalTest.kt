package com.llmagal.vita.ai

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.containing
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.model.ai.PortionBounds
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.PlanParseService
import com.llmagal.vita.service.uploads.FileStore
import com.llmagal.vita.service.uploads.PresignedUpload
import com.llmagal.vita.service.uploads.UnknownFileRefException
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

/**
 * BE-039 — the eating-plan parse eval against golden Claude responses (WireMock,
 * never the live API): per-unit micros pass through, the deterministic portion
 * heuristic decorates every item, totals recompute from per-item data (CEO A4),
 * and the per-single-unit instruction reaches the model (per-100g trap).
 */
class PlanParseEvalTest {
    private lateinit var service: PlanParseService

    private val fileStore =
        object : FileStore {
            override fun presignPut(contentType: String): PresignedUpload =
                PresignedUpload("ref", "https://uploads.local.invalid/ref", OffsetDateTime.now())

            override fun read(fileRef: String): ByteArray = throw UnknownFileRefException(fileRef)
        }

    @BeforeEach
    fun setUp() {
        wm.resetAll()
        val client = ClaudeClient(wm.baseUrl(), "claude-haiku-4-5", 1024, 10, "test-key", 25, 3072)
        val metrics = ParseMetrics(SimpleMeterRegistry())
        service = PlanParseService(client, fileStore, metrics, "claude-haiku-4-5", "claude-sonnet-4-6")
    }

    @Test
    fun `reference 11-item plan - portion decorated, micros pass through, totals recompute`() {
        val draft = parseGolden("reference-11-item-plan")
        val items = draft.meals.flatMap { it.items }
        assertThat(items).hasSize(EXPECTED_ITEMS)

        // Every item gets its §3.4 heuristic portion (parse carries no ids).
        assertThat(items.map { it.portion }).isEqualTo(EXPECTED_PORTIONS)
        assertThat(items.all { it.id == null }).isTrue()

        // Per-unit micros survived deserialization (fallback source is per-item now).
        val chicken = items.first { it.name == "Grilled chicken" }
        assertThat(chicken.microsPerUnit?.sodiumMg).isEqualTo(0.74)

        // Totals recomputed from the fixture's OWN per-item data (Σ per·qty), cross-checks §7's 1756.2.
        val kcal = items.sumOf { (it.nutritionPerUnit?.kcal ?: 0.0) * (it.quantity ?: 0.0) }
        assertThat(kcal).isCloseTo(
            1756.2,
            org.assertj.core.api.Assertions
                .within(1.0),
        )
    }

    @Test
    fun `a plan without per-item micros - micros absent, portion still derived, daily micros pass through`() {
        val draft = parseGolden("plan-without-micros")
        val items = draft.meals.flatMap { it.items }
        assertThat(items.all { it.microsPerUnit == null }).isTrue() // NON_NULL drops them
        assertThat(items.all { it.portion != null }).isTrue() // heuristic still runs
        assertThat(draft.micros).isNotEmpty() // the app's static-chips fallback source
    }

    @Test
    fun `per-100g trap - the request carries the per-single-unit instruction`() {
        val case = PlanParseEvalCases.byName("per-100g-trap")
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(case.goldenJson())))

        val draft = service.parseEatingPlan(PlanImportRequest(text = case.input, fileRef = null))
        assertThat(draft.meals.flatMap { it.items }).hasSize(1)

        // The system prompt that reached the model hardens against the classic per-100g failure.
        wm.verify(
            postRequestedFor(urlEqualTo("/v1/messages"))
                .withRequestBody(containing("never per 100 g and never per serving")),
        )
    }

    @Test
    fun `program with roles - roles survive, muscles derived where omitted, invalid role dropped`() {
        val draft = parseProgramGolden("program-with-roles")
        val ex = draft.days.flatMap { it.exercises.orEmpty() }.associateBy { it.name }

        // Squat: roles kept and muscles derived from the role names (golden omitted muscles).
        val squat = ex.getValue("Back squat")
        assertThat(squat.muscleRoles?.map { it.name to it.role })
            .containsExactly("quads" to "primary", "glutes" to "primary", "core" to "secondary")
        assertThat(squat.muscles).containsExactly("quads", "glutes", "core")

        // RDL: the unmappable "lowback" is dropped from both roles and derived muscles.
        val rdl = ex.getValue("Romanian deadlift")
        assertThat(rdl.muscleRoles?.map { it.name }).containsExactly("hamstrings", "glutes")
        assertThat(rdl.muscles).doesNotContain("lowback")

        // Walking lunge: the "tertiary" (invalid) role entry is dropped.
        val lunge = ex.getValue("Walking lunge")
        assertThat(lunge.muscleRoles?.map { it.name }).containsExactly("quads", "glutes")
    }

    @Test
    fun `program alias fold - lats folds to back and dup primary+secondary collapses to one primary`() {
        val draft = parseProgramGolden("program-alias-fold")
        val pull = draft.days.flatMap { it.exercises.orEmpty() }.first { it.name == "Pull-up" }
        // lats→back; the secondary back collapses into the primary back (primary wins).
        assertThat(pull.muscleRoles?.map { it.name to it.role })
            .containsExactly("back" to "primary", "biceps" to "secondary")
        assertThat(pull.muscles).containsExactly("back", "biceps")
    }

    private fun parseGolden(name: String): EatingPlanDraft {
        val case = PlanParseEvalCases.byName(name)
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(case.goldenJson())))
        return service.parseEatingPlan(PlanImportRequest(text = "plan", fileRef = null))
    }

    private fun parseProgramGolden(name: String): com.llmagal.vita.model.ai.TrainingProgramDraft {
        val case = PlanParseEvalCases.byName(name)
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(case.goldenJson())))
        return service.parseTrainingProgram(PlanImportRequest(text = "program", fileRef = null))
    }

    private companion object {
        const val EXPECTED_ITEMS = 11

        // §3.4 expected heuristic bounds, in flat document order (bf, lu, sn, di).
        val EXPECTED_PORTIONS =
            listOf(
                b(0, 4, 1), // eggs 2 egg
                b(0, 3, 1), // bread 1 slice
                b(0, 400, 50), // latte 200 ml
                b(0, 360, 10), // chicken 180 g
                b(0, 400, 10), // rice 200 g
                b(0, 200, 10), // salad 100 g
                b(0, 340, 10), // yogurt 170 g
                b(0, 60, 10), // granola 30 g
                b(0, 320, 10), // salmon 160 g
                b(0, 300, 10), // veg 150 g
                b(0, 300, 10), // sweet potato 150 g
            )

        fun b(
            min: Int,
            max: Int,
            step: Int,
        ) = PortionBounds(min.toDouble(), max.toDouble(), step.toDouble())

        lateinit var wm: WireMockServer

        @JvmStatic
        @BeforeAll
        fun startWireMock() {
            wm = WireMockServer(options().dynamicPort())
            wm.start()
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wm.stop()
        }
    }
}
