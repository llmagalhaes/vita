package com.llmagal.vita.ai

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.containing
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.PlanParseService
import com.llmagal.vita.service.uploads.FileStore
import com.llmagal.vita.service.uploads.PresignedUpload
import com.llmagal.vita.service.uploads.UnknownFileRefException
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
 * BE-015 — plan/program parse against golden Claude responses served by WireMock
 * (never the live API). Covers the text happy paths, the empty/unusable 422s, the
 * native-PDF fileRef path (document block posted), and an unknown fileRef 422.
 */
class PlanParseFlowTest {
    private lateinit var service: PlanParseService
    private var pdfBytes: ByteArray? = null

    /** Fake S3 seam: read returns whatever [pdfBytes] holds (null → unknown fileRef). */
    private val fileStore =
        object : FileStore {
            override fun presignPut(contentType: String): PresignedUpload =
                PresignedUpload("ref", "https://uploads.local.invalid/ref", OffsetDateTime.now())

            override fun read(fileRef: String): ByteArray = pdfBytes ?: throw UnknownFileRefException(fileRef)
        }

    @BeforeEach
    fun setUp() {
        wm.resetAll()
        pdfBytes = null
        val client = ClaudeClient(wm.baseUrl(), "claude-haiku-4-5", 1024, 10, "test-key", 25, 2048)
        service =
            PlanParseService(
                client,
                fileStore,
                ParseMetrics(SimpleMeterRegistry()),
                "claude-haiku-4-5",
                "claude-sonnet-4-6",
            )
    }

    @Test
    fun `parses a described eating plan into a draft with a summary`() {
        stubMessages(
            toolResponse(
                "record_eating_plan",
                """
                {"summary":"Balanced 3-meal plan","dailyTotals":{"kcal":2000,"proteinG":120},
                 "micros":[{"name":"Iron","amount":14,"unit":"mg","percentDaily":78}],
                 "meals":[{"name":"Breakfast","time":"08:00","items":[
                   {"name":"Oats","quantity":80,"unit":"g","nutritionPerUnit":{"kcal":300}}]}]}
                """.trimIndent(),
            ),
        )

        val draft = service.parseEatingPlan(PlanImportRequest(text = "oats for breakfast, ...", fileRef = null))

        assertThat(draft.summary).isEqualTo("Balanced 3-meal plan")
        assertThat(draft.meals).hasSize(1)
        assertThat(draft.meals[0].items[0].name).isEqualTo("Oats")
        assertThat(draft.dailyTotals?.kcal).isEqualTo(2000.0)
    }

    @Test
    fun `an eating plan with no tool call is a 422`() {
        stubMessages(
            """
            {"id":"msg_1","type":"message","role":"assistant","stop_reason":"end_turn",
             "content":[{"type":"text","text":"I could not read a plan."}]}
            """.trimIndent(),
        )

        assertUnprocessable { service.parseEatingPlan(PlanImportRequest(text = "the weather is nice", fileRef = null)) }
    }

    @Test
    fun `an eating plan with empty meals is a 422`() {
        stubMessages(toolResponse("record_eating_plan", """{"summary":"nothing","meals":[]}"""))

        assertUnprocessable { service.parseEatingPlan(PlanImportRequest(text = "hmm", fileRef = null)) }
    }

    @Test
    fun `parses a described training program into a draft`() {
        stubMessages(
            toolResponse(
                "record_training_program",
                """
                {"summary":"Push/Pull/Legs, 3 days","splitDescription":"PPL",
                 "days":[{"name":"Day 1 - Push","exercises":[
                   {"name":"Bench press","sets":3,"reps":8,"loadKg":60}]}]}
                """.trimIndent(),
            ),
        )

        val draft = service.parseTrainingProgram(PlanImportRequest(text = "push pull legs", fileRef = null))

        assertThat(draft.summary).isEqualTo("Push/Pull/Legs, 3 days")
        assertThat(
            draft.days[0]
                .exercises
                ?.get(0)
                ?.loadKg,
        ).isEqualTo(60.0)
    }

    @Test
    fun `a fileRef reads the object and posts a native PDF document block`() {
        pdfBytes = "%PDF-1.4 fake plan".toByteArray()
        stubMessages(
            toolResponse(
                "record_eating_plan",
                """{"summary":"From PDF","meals":[{"name":"Lunch","items":[{"name":"Rice"}]}]}""",
            ),
        )

        val draft = service.parseEatingPlan(PlanImportRequest(text = null, fileRef = "any-ref"))

        assertThat(draft.summary).isEqualTo("From PDF")
        // The PDF went to the model as a native base64 document block, not as OCR'd text.
        wm.verify(
            postRequestedFor(urlEqualTo("/v1/messages"))
                .withRequestBody(containing("\"media_type\":\"application/pdf\"")),
        )
    }

    @Test
    fun `an unknown fileRef is a 422`() {
        pdfBytes = null // fileStore.read throws UnknownFileRefException
        assertUnprocessable { service.parseEatingPlan(PlanImportRequest(text = null, fileRef = "missing")) }
    }

    private fun assertUnprocessable(call: () -> Unit) {
        assertThatThrownBy { call() }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
            }
    }

    private fun stubMessages(responseJson: String) {
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(responseJson)))
    }

    private companion object {
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

        /** Wraps a tool `input` payload in a minimal Anthropic Messages response. */
        fun toolResponse(
            toolName: String,
            input: String,
        ): String =
            """
            {"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-4-5",
             "stop_reason":"tool_use",
             "content":[{"type":"tool_use","id":"toolu_1","name":"$toolName","input":$input}]}
            """.trimIndent()
    }
}
