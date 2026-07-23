package com.llmagal.vita.ai

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.PlanItem
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.PlanParseService
import com.llmagal.vita.service.uploads.FileStore
import com.llmagal.vita.service.uploads.PresignedUpload
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.within
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.io.File
import java.text.Normalizer
import java.time.OffsetDateTime

/**
 * BE-045 §6.1 — the CEO-authorized live eval: feeds the REAL `meal-plan.pdf` bytes through the
 * exact production parse path (prod prompt/model/schema, async knobs) against the live Anthropic
 * API and asserts the ground-truth structure + stated numbers of §2. Excluded from `check`
 * (@Tag("live")); run on demand:  ANTHROPIC_API_KEY=… ./gradlew liveEval  (≈ $0.30, 2–4 min).
 * The acceptance bar: importing THIS PDF works perfectly.
 */
@Tag("live")
class PlanParseV3LiveEvalTest {
    @Test
    @Suppress("LongMethod") // one parse (~$0.30, minutes) → assert the whole §6.1 table in sequence
    fun `the real meal-plan pdf parses to the ground truth`() {
        val apiKey = System.getenv("ANTHROPIC_API_KEY").orEmpty()
        assumeTrue(apiKey.isNotBlank(), "ANTHROPIC_API_KEY not set — skipping live eval")

        val pdf = findPdf()
        val fileStore =
            object : FileStore {
                override fun presignPut(contentType: String): PresignedUpload =
                    PresignedUpload("ref", "https://uploads.local.invalid/ref", OffsetDateTime.now())

                override fun read(fileRef: String): ByteArray = pdf.readBytes()
            }
        val baseUrl = System.getenv("ANTHROPIC_BASE_URL") ?: "https://api.anthropic.com"
        // Production knobs: async big-output budget (16384) + minutes-long timeout (300 s).
        val client = ClaudeClient(baseUrl, "claude-haiku-4-5", 1024, 15, apiKey, 25, 3072, 16384, 300)
        val metrics = ParseMetrics(SimpleMeterRegistry())
        val service = PlanParseService(client, fileStore, metrics, "claude-haiku-4-5", PDF_MODEL)

        val draft =
            service.parseEatingPlan(
                com.llmagal.vita.model.ai
                    .PlanImportRequest(text = null, fileRef = "x"),
            )
        val decorated = draft // parse already decorates portions on base+option items

        printSummary(decorated)

        // ── Structure ──────────────────────────────────────────────────────
        val names = decorated.meals.map { fold(it.name) }
        assertThat(names).hasSize(5)
        assertThat(names[0]).contains("pre-treino")
        assertThat(names[1]).contains("pos-treino")
        assertThat(names[2]).contains("almoco")
        assertThat(names[3]).contains("lanche")
        assertThat(names[4]).contains("jantar")

        val almoco = decorated.meals.first { fold(it.name).contains("almoco") }
        assertThat(almoco.options).hasSize(1)
        assertThat(fold(almoco.options!![0].name)).contains("brunch")
        assertThat(almoco.options!![0].items).hasSize(6)

        val jantar = decorated.meals.first { fold(it.name).contains("jantar") }
        assertThat(jantar.options).hasSize(3)
        assertThat(jantar.options!!.map { fold(it.name) })
            .anyMatch { it.contains("tortilha") }
            .anyMatch { it.contains("macarrao") }
            .anyMatch { it.contains("hamburguer") }

        assertThat(decorated.meals.map { it.items.size }).containsExactly(1, 1, 7, 1, 7)

        // ── Swap lists ─────────────────────────────────────────────────────
        val all = allItems(decorated)

        fun swaps(itemName: String) = all.first { fold(it.name).contains(fold(itemName)) }.swaps.orEmpty()
        assertThat(swaps("Banana")).hasSize(25)
        assertThat(swaps("Maçã verde")).hasSize(26)
        assertThat(swaps("Milho verde")).hasSize(19)
        val totalSwaps = all.sumOf { it.swaps.orEmpty().size }
        assertThat(totalSwaps).isBetween(265, 315)

        // Swap fidelity spot checks.
        val banana = swaps("Banana")
        assertThat(banana.map { fold(it.name) }).anyMatch { it.contains("abacaxi") }
        assertThat(banana.any { fold(it.name).contains("acai") }).isTrue()
        // An "à vontade" swap has no quantity.
        val avontade =
            all.flatMap { it.swaps.orEmpty() }.any { fold(it.unit ?: "").contains("vontade") && it.quantity == null }
        assertThat(avontade).isTrue()

        // ── Hydration + supplements ────────────────────────────────────────
        assertThat(decorated.hydration?.mlPerDay).isEqualTo(2500.0)
        val supps = decorated.supplements.orEmpty()
        assertThat(supps).hasSize(3)
        assertThat(supps.map { fold(it.name) })
            .anyMatch { it.contains("creatina") }
            .anyMatch { it.contains("mega") }
            .anyMatch { it.contains("vitamina d") }
        assertThat(supps.none { fold(it.name).contains("agua") || fold(it.name).contains("water") }).isTrue()

        // ── Stated report numbers (transcription, not estimation) ──────────
        val t = decorated.dailyTotals!!
        assertThat(t.kcal).isCloseTo(1716.0, within(1.0))
        assertThat(t.proteinG!!).isCloseTo(188.6, within(0.5))
        assertThat(t.carbsG!!).isCloseTo(153.4, within(0.5))
        assertThat(t.fatG!!).isCloseTo(47.9, within(0.5))

        // Per-meal / per-option stated kcal.
        assertKcal(decorated.meals.first { fold(it.name).contains("pre-treino") }.kcal, 109.0)
        assertKcal(decorated.meals.first { fold(it.name).contains("pos-treino") }.kcal, 121.0)
        assertKcal(almoco.kcal, 702.0)
        assertKcal(almoco.options!![0].kcal, 679.0)
        assertKcal(decorated.meals.first { fold(it.name).contains("lanche") }.kcal, 72.0)
        assertKcal(jantar.kcal, 702.0)

        // ── Estimate + decoration sanity ──────────────────────────────────
        val frango = all.first { fold(it.name).contains("frango desfiado") }
        // Per-single-unit trap: IF the model estimated per-unit macros, they're per-unit not per-100g.
        frango.nutritionPerUnit?.kcal?.let { assertThat(it).isLessThan(10.0) }
        // Frango's weight is transcribed somewhere (the model may use grams or quantity).
        assertThat(frango.grams ?: frango.quantity).isNotNull()
        // Deterministic decoration on a clearly-countable item: Banana "1 unidade" → 0..3 step 1.
        val banItem = all.first { fold(it.name) == "banana" }
        assertThat(banItem.portion?.max).isEqualTo(3.0)
        assertThat(banItem.portion?.step).isEqualTo(1.0)
    }

    private fun assertKcal(
        actual: Double?,
        expected: Double,
    ) = assertThat(actual!!).isCloseTo(expected, within(1.0))

    private fun allItems(d: EatingPlanDraft): List<PlanItem> = d.meals.flatMap { m -> m.items + m.options.orEmpty().flatMap { it.items } }

    private fun printSummary(d: EatingPlanDraft) {
        val items = allItems(d)
        val swaps = items.sumOf { it.swaps.orEmpty().size }
        @Suppress("ForbiddenComment")
        println(
            "V3 LIVE EVAL: meals=${d.meals.size} items=${items.size} swaps=$swaps " +
                "options=${d.meals.sumOf { it.options.orEmpty().size }} " +
                "hydration=${d.hydration?.mlPerDay} supplements=${d.supplements.orEmpty().size} " +
                "dailyKcal=${d.dailyTotals?.kcal}",
        )
    }

    /** Accent/case-insensitive fold so asserts don't hinge on exact diacritics. */
    private fun fold(s: String): String =
        Normalizer
            .normalize(s, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .lowercase()
            .trim()

    /** Walk up from the module dir to the repo's committed private fixture PDF. */
    private fun findPdf(): File {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        while (dir != null) {
            val candidate = File(dir, "docs/v3/design_handoff_vita_v3/meal-plan.pdf")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("meal-plan.pdf not found walking up from ${System.getProperty("user.dir")}")
    }

    private companion object {
        const val PDF_MODEL = "claude-sonnet-4-6"
    }
}
