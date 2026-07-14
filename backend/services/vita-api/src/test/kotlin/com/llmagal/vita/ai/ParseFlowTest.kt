package com.llmagal.vita.ai

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED
import com.llmagal.vita.ai.client.ClaudeClient
import com.llmagal.vita.ai.service.ParseMetrics
import com.llmagal.vita.ai.service.ParseService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime

/**
 * BE-013 — /parse/text against golden Claude responses served by WireMock (never
 * the live API). Covers the happy path with server-filled fields, the
 * uninterpretable-input 422s, occurredAt anchoring, the maxItems cap, and the
 * timeout/5xx retry. Every returned draft is asserted contract-shaped (NewEntry).
 */
class ParseFlowTest {
    private lateinit var service: ParseService

    @BeforeEach
    fun setUp() {
        wm.resetAll()
        val client = ClaudeClient(wm.baseUrl(), "claude-haiku-4-5", 1024, 10, "test-key", 25, 2048)
        service = ParseService(client, ParseMetrics(SimpleMeterRegistry()), "claude-sonnet-4-6")
    }

    @Test
    fun `parses a phrase into contract-shaped drafts and fills server fields`() {
        stubMessages(
            toolResponse(
                """
                {"drafts":[
                  {"type":"meal","occurredAt":"2026-07-13T09:30:00Z",
                   "detail":{"title":"Eggs & latte","items":[
                     {"name":"Scrambled eggs","kcal":180,"proteinG":12},
                     {"name":"Latte","kcal":120}]}},
                  {"type":"water","occurredAt":"2026-07-13T09:31:00Z",
                   "detail":{"amountMl":250}}]}
                """.trimIndent(),
            ),
        )

        val result = service.parseText("two scrambled eggs and a latte", CAPTURED_AT)

        assertThat(result.drafts).hasSize(2)
        result.drafts.forEach { draft ->
            assertThat(draft.type).isIn("meal", "water", "workout")
            assertThat(draft.inputMethod).isEqualTo("text") // server-set
            assertThat(draft.isEstimate).isTrue() // AI-derived
            assertThat(draft.sourcePhrase).isEqualTo("two scrambled eggs and a latte")
            assertThat(draft.occurredAt).isNotNull()
            assertThat(draft.detail).isNotEmpty()
        }
        assertThat(result.drafts[0].type).isEqualTo("meal")
        assertThat(result.drafts[1].detail["amountMl"]).isEqualTo(250)
    }

    @Test
    fun `text with no tool call is a 422`() {
        stubMessages(
            """
            {"id":"msg_1","type":"message","role":"assistant","stop_reason":"end_turn",
             "content":[{"type":"text","text":"I couldn't find anything to log."}]}
            """.trimIndent(),
        )

        assertUnprocessable("the weather is nice today")
    }

    @Test
    fun `empty drafts is a 422`() {
        stubMessages(toolResponse("""{"drafts":[]}"""))

        assertUnprocessable("hmm")
    }

    @Test
    fun `a missing occurredAt is anchored to capturedAt`() {
        stubMessages(
            toolResponse("""{"drafts":[{"type":"water","detail":{"amountMl":500}}]}"""),
        )

        val result = service.parseText("a big glass of water", CAPTURED_AT)

        assertThat(result.drafts).hasSize(1)
        assertThat(result.drafts[0].occurredAt).isEqualTo(CAPTURED_AT)
    }

    @Test
    fun `drafts are capped at five`() {
        stubMessages(toolResponse(waterDrafts(1, 2, 3, 4, 5, 6)))

        val result = service.parseText("water six times", CAPTURED_AT)

        assertThat(result.drafts).hasSize(5)
    }

    @Test
    fun `a 5xx is retried once and then succeeds`() {
        wm.stubFor(
            post(urlEqualTo("/v1/messages"))
                .inScenario("retry")
                .whenScenarioStateIs(STARTED)
                .willReturn(aResponse().withStatus(HttpStatus.SERVICE_UNAVAILABLE.value()))
                .willSetStateTo("recovered"),
        )
        wm.stubFor(
            post(urlEqualTo("/v1/messages"))
                .inScenario("retry")
                .whenScenarioStateIs("recovered")
                .willReturn(okJson(toolResponse(waterDrafts(300)))),
        )

        val result = service.parseText("a glass of water", CAPTURED_AT)

        assertThat(result.drafts).hasSize(1)
        wm.verify(2, postRequestedForMessages())
    }

    private fun assertUnprocessable(text: String) {
        assertThatThrownBy { service.parseText(text, CAPTURED_AT) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
            }
    }

    private fun stubMessages(responseJson: String) {
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(responseJson)))
    }

    private fun postRequestedForMessages() = postRequestedFor(urlEqualTo("/v1/messages"))

    private companion object {
        val CAPTURED_AT: OffsetDateTime = OffsetDateTime.parse("2026-07-13T09:30:00Z")

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

        /** One or more water drafts as a tool `input` payload (keeps lines short). */
        fun waterDrafts(vararg ml: Int): String =
            ml.joinToString(prefix = """{"drafts":[""", postfix = "]}", separator = ",") {
                """{"type":"water","occurredAt":"2026-07-13T09:30:00Z","detail":{"amountMl":$it}}"""
            }

        /** Wraps a tool `input` payload in a minimal Anthropic Messages response. */
        fun toolResponse(input: String): String =
            """
            {"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-4-5",
             "stop_reason":"tool_use",
             "content":[{"type":"tool_use","id":"toolu_1","name":"record_log_entries","input":$input}]}
            """.trimIndent()
    }
}
