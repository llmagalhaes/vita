package com.llmagal.vita.ai

import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.PlanParseService
import com.llmagal.vita.service.uploads.FileStore
import com.llmagal.vita.service.uploads.PresignedUpload
import com.llmagal.vita.service.uploads.UnknownFileRefException
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

/**
 * BE-039 — the LIVE twin of the plan parse eval (@Tag("live"), excluded from the
 * default build; run with ANTHROPIC_API_KEY=… ./gradlew liveEval). The one
 * meaningful live assert is the per-single-unit semantics: a "150 g chicken
 * (165 kcal per 100 g)" input must NOT come back at ~165 kcal per unit.
 */
@Tag("live")
class PlanParseLiveEvalTest {
    private val fileStore =
        object : FileStore {
            override fun presignPut(contentType: String): PresignedUpload =
                PresignedUpload("ref", "https://uploads.local.invalid/ref", OffsetDateTime.now())

            override fun read(fileRef: String): ByteArray = throw UnknownFileRefException(fileRef)
        }

    @Test
    fun `per-100g trap - live kcal per unit stays per-single-unit`() {
        val apiKey = System.getenv("ANTHROPIC_API_KEY").orEmpty()
        assumeTrue(apiKey.isNotBlank(), "ANTHROPIC_API_KEY not set — skipping live eval")
        val baseUrl = System.getenv("ANTHROPIC_BASE_URL") ?: "https://api.anthropic.com"
        val model = System.getenv("VITA_AI_PLAN_MODEL") ?: "claude-haiku-4-5"

        val client = ClaudeClient(baseUrl, model, 1024, 15, apiKey, 25, 3072)
        val metrics = ParseMetrics(SimpleMeterRegistry())
        val service = PlanParseService(client, fileStore, metrics, model, "claude-sonnet-4-6")

        val case = PlanParseEvalCases.byName("per-100g-trap")
        val draft = service.parseEatingPlan(PlanImportRequest(text = case.input, fileRef = null))
        val item = draft.meals.flatMap { it.items }.first()
        assertThat(item.nutritionPerUnit?.kcal).isBetween(1.2, 2.2) // per gram, not per 100 g
    }
}
