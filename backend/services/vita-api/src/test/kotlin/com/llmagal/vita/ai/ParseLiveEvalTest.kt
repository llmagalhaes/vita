package com.llmagal.vita.ai

import com.llmagal.vita.ai.client.ClaudeClient
import com.llmagal.vita.ai.service.ParseMetrics
import com.llmagal.vita.ai.service.ParseService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.TestFactory
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime

/**
 * BE-014 — the same eval set run against the LIVE Claude API. Excluded from the normal
 * build (@Tag("live") is excluded in build.gradle.kts); run on demand with:
 *   ANTHROPIC_API_KEY=sk-... ./gradlew liveEval
 * Skips (does not fail) when no key is set, so an accidental run is a no-op.
 */
@Tag("live")
class ParseLiveEvalTest {
    @TestFactory
    fun liveEvalCases(): List<DynamicTest> {
        val apiKey = System.getenv("ANTHROPIC_API_KEY").orEmpty()
        val baseUrl = System.getenv("ANTHROPIC_BASE_URL") ?: "https://api.anthropic.com"
        val model = System.getenv("VITA_AI_MODEL") ?: "claude-haiku-4-5"

        return ParseEvalCases.load().map { case ->
            DynamicTest.dynamicTest(case.name) {
                assumeTrue(apiKey.isNotBlank(), "ANTHROPIC_API_KEY not set — skipping live eval")
                val client = ClaudeClient(baseUrl, model, 1024, 15, apiKey, 25, 2048)
                val service = ParseService(client, ParseMetrics(SimpleMeterRegistry()))

                if (case.expect422) {
                    assertThatThrownBy { service.parseText(case.input, CAPTURED_AT) }
                        .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                            assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
                        }
                } else {
                    ParseEvalCases.assertShape(case, service.parseText(case.input, CAPTURED_AT))
                }
            }
        }
    }

    private companion object {
        val CAPTURED_AT: OffsetDateTime = OffsetDateTime.parse("2026-07-13T09:30:00Z")
    }
}
