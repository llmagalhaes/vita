package com.llmagal.vita.ai

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.model.MacroTotals
import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.MealOption
import com.llmagal.vita.model.ai.PlanItem
import com.llmagal.vita.model.ai.PlanMeal
import com.llmagal.vita.model.ai.SwapOption
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.ai.ParseService
import com.llmagal.vita.service.plans.PlanService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.util.UUID

/**
 * BE-051 — plan-aware capture against golden Claude responses served by WireMock (never the
 * live API). Four cases: full match, partial match, no match, and NO PLAN — the last asserting
 * the request is byte-identical to the committed 0.7.0 golden, so a user without a plan pays
 * nothing (not a token, not a behaviour change) for this feature.
 */
class PlanAwareParseTest {
    private val plans = mockk<PlanService>()
    private lateinit var service: ParseService
    private lateinit var logs: ListAppender<ILoggingEvent>
    private lateinit var clientLogs: ListAppender<ILoggingEvent>

    @BeforeEach
    fun setUp() {
        wm.resetAll()
        // maxTokens stays 1024 here: the golden locks the PROMPT shape, and max_tokens is a
        // config value (prod runs 4096 since review M1), not part of what 0.7.0 vs 0.8.0 sends.
        val client = ClaudeClient(wm.baseUrl(), "claude-haiku-4-5", 1024, 10, "test-key", 25, 2048, 16384, 300)
        service = ParseService(client, ParseMetrics(SimpleMeterRegistry()), "claude-sonnet-4-6", plans)
        logs = ListAppender<ILoggingEvent>().apply { start() }
        (LoggerFactory.getLogger(ParseService::class.java) as Logger).addAppender(logs)
        clientLogs = ListAppender<ILoggingEvent>().apply { start() }
        (LoggerFactory.getLogger(ClaudeClient::class.java) as Logger).addAppender(clientLogs)
    }

    @AfterEach
    fun tearDown() {
        (LoggerFactory.getLogger(ParseService::class.java) as Logger).detachAppender(logs)
        (LoggerFactory.getLogger(ClaudeClient::class.java) as Logger).detachAppender(clientLogs)
    }

    @Test
    fun `no plan - the prompt is byte-identical to the 0-7-0 golden`() {
        every { plans.currentEatingPlan(USER) } returns null
        stub(toolResponse("""{"drafts":[{"type":"water","occurredAt":"$AT","detail":{"amountMl":250}}]}"""))

        val result = service.parseText("a glass of water", CAPTURED_AT, USER)

        assertThat(result.drafts).hasSize(1)
        assertThat(sentBody()).isEqualTo(golden())
    }

    @Test
    fun `a plan with no stamped meal ids also falls back to the 0-7-0 prompt`() {
        // Ids are stamped at save time with no backfill (CEO A2) — a pre-BE-050 plan is unaddressable.
        every { plans.currentEatingPlan(USER) } returns
            EatingPlanDraft(summary = "old", meals = listOf(PlanMeal(name = "Almoço", items = listOf(PlanItem(name = "Arroz")))))
        stub(toolResponse("""{"drafts":[{"type":"water","occurredAt":"$AT","detail":{"amountMl":250}}]}"""))

        service.parseText("a glass of water", CAPTURED_AT, USER)

        assertThat(sentBody()).isEqualTo(golden())
    }

    @Test
    fun `with a plan the digest and the day-record tool fields ride the prompt, swaps do not`() {
        givenPlan()
        stub(toolResponse("""{"drafts":[{"type":"water","occurredAt":"$AT","detail":{"amountMl":250}}]}"""))

        service.parseText("almocei", CAPTURED_AT, USER)

        val body = sentBody()
        assertThat(body)
            .contains("<eating_plan>")
            .contains("m-1 | Café da manhã | 07:00")
            .contains("it-1 | Banana | 1 unidade | 105 kcal/unit")
            .contains("m-2 | Almoço | 12:30")
            .contains("it-2 | Arroz branco | 150 g | 1.3 kcal/unit")
            .contains("option 0 | Opção 2 - Brunch")
            .contains("it-4 | Pão integral | 2 fatia")
        // Swap lists are deliberately excluded (§3.6), and a meal with no id is unaddressable.
        assertThat(body).doesNotContain("Batata doce").doesNotContain("Legado sem id")
        // The tool schema carries the §3.1/§3.2 fields, and the instruction block is present.
        assertThat(body).contains("planMealId").contains("planOptionIndex").contains("replacesItemId")
        assertThat(body).contains("planStatus").contains("The <eating_plan> block is the user's current plan")
    }

    @Test
    fun `match - the matched meal comes back with plan fields and a fully tagged composition`() {
        givenPlan()
        stub(toolResponse(MATCHED_LUNCH))

        val meal = service.parseText("almocei como planejado, mas troquei o arroz por batata doce", CAPTURED_AT, USER).drafts.single()

        assertThat(meal.type).isEqualTo("meal")
        assertThat(meal.detail["planMealId"]).isEqualTo("m-2")
        assertThat(meal.detail["planStatus"]).isEqualTo("adjusted")
        @Suppress("UNCHECKED_CAST")
        val items = meal.detail["items"] as List<Map<String, Any?>>
        assertThat(items.map { it["replacesItemId"] }).containsExactly("it-2", "it-3") // full composition, every item tagged
        assertThat(items[0]["name"]).isEqualTo("Batata doce cozida")
        assertThat(meal.isEstimate).isTrue() // server-set fields still apply
        assertThat(meal.inputMethod).isEqualTo("text")
    }

    @Test
    fun `partial match - a plan meal plus an unplanned draft in one response`() {
        givenPlan()
        stub(toolResponse(PARTIAL))

        val drafts = service.parseText("almocei e tomei uma cerveja", CAPTURED_AT, USER).drafts

        assertThat(drafts).hasSize(2)
        assertThat(drafts[0].detail["planMealId"]).isEqualTo("m-2")
        assertThat(drafts[0].detail["planStatus"]).isEqualTo("done")
        assertThat(drafts[1].detail).doesNotContainKeys("planMealId", "planStatus", "planOptionIndex")
    }

    @Test
    fun `no match - a free-form draft passes through with no plan fields`() {
        givenPlan()
        stub(
            toolResponse(
                """{"drafts":[{"type":"meal","occurredAt":"$AT",
                   "detail":{"title":"Pastel","items":[{"name":"Pastel","kcal":320}]}}]}""",
            ),
        )

        val meal = service.parseText("comi um pastel na feira", CAPTURED_AT, USER).drafts.single()

        assertThat(meal.detail).doesNotContainKeys("planMealId", "planStatus", "planOptionIndex")
        assertThat(meal.detail["title"]).isEqualTo("Pastel")
    }

    @Test
    fun `the 422 branch is unchanged with a plan loaded`() {
        givenPlan()
        stub(toolResponse("""{"drafts":[]}"""))

        assertThatThrownBy { service.parseText("hmm", CAPTURED_AT, USER) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
            }
    }

    @Test
    fun `the INFO cost line reports inputTokens so the digest cost is queryable`() {
        givenPlan()
        stub(toolResponse(MATCHED_LUNCH, inputTokens = 2871, outputTokens = 412))

        service.parseText("almocei", CAPTURED_AT, USER)

        val line = logs.list.map { it.formattedMessage }.single { it.startsWith("parse capture=") }
        assertThat(line).isEqualTo("parse capture=text outcome=success plan=true inputTokens=2871 outputTokens=412")
    }

    @Test
    fun `a truncated response (stop_reason max_tokens) still 422s but is WARNed as truncation`() {
        // Review M1: without this line a cap trip is indistinguishable from "nothing to record".
        givenPlan()
        // What the API actually returns on a cap trip: a well-formed envelope whose tool `input`
        // stopped mid-generation — here before `drafts` was ever produced.
        stub(
            """
            {"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-4-5",
             "stop_reason":"max_tokens","usage":{"input_tokens":2871,"output_tokens":1024},
             "content":[{"type":"tool_use","id":"toolu_1","name":"record_log_entries","input":{}}]}
            """.trimIndent(),
        )

        assertThatThrownBy { service.parseText("almocei e jantei como planejado", CAPTURED_AT, USER) }
            .isInstanceOf(ResponseStatusException::class.java)

        val warn = clientLogs.list.single { it.level == Level.WARN }
        assertThat(warn.formattedMessage).contains("truncated").contains("max_tokens")
    }

    @Test
    fun `an unreadable plan degrades to the plan-less prompt instead of failing the capture`() {
        // Review M2: a bad plan blob (GCM tag mismatch, missing DEK, untypeable doc) must not take
        // down water/workout captures. Same request bytes as no plan at all.
        every { plans.currentEatingPlan(USER) } throws IllegalStateException("no DEK for user")
        stub(toolResponse("""{"drafts":[{"type":"water","occurredAt":"$AT","detail":{"amountMl":250}}]}"""))

        val result = service.parseText("a glass of water", CAPTURED_AT, USER)

        assertThat(result.drafts).hasSize(1)
        assertThat(sentBody()).isEqualTo(golden())
        assertThat(logs.list.single { it.level == Level.WARN }.formattedMessage)
            .contains("Plan unreadable")
            .contains("IllegalStateException")
        assertThat(logs.list.map { it.formattedMessage }.single { it.startsWith("parse capture=") })
            .contains("plan=false")
    }

    private fun givenPlan() {
        every { plans.currentEatingPlan(USER) } returns PLAN
    }

    private fun stub(responseJson: String) {
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(responseJson)))
    }

    private fun sentBody(): String =
        wm.allServeEvents
            .single()
            .request.bodyAsString

    private fun golden(): String =
        requireNotNull(javaClass.getResourceAsStream("/golden/parse-text-request-v0.7.0.json")) {
            "missing /golden/parse-text-request-v0.7.0.json"
        }.readBytes().decodeToString()

    private companion object {
        val USER: UUID = UUID.fromString("11111111-2222-3333-4444-555555555555")
        const val AT = "2026-07-13T09:30:00Z"
        val CAPTURED_AT: OffsetDateTime = OffsetDateTime.parse(AT)

        /** Two addressable meals (one with an option) plus a pre-BE-050 meal that has no id. */
        val PLAN =
            EatingPlanDraft(
                summary = "test plan",
                meals =
                    listOf(
                        PlanMeal(
                            name = "Café da manhã",
                            id = "m-1",
                            time = "07:00",
                            items =
                                listOf(
                                    PlanItem(
                                        name = "Banana",
                                        id = "it-1",
                                        quantity = 1.0,
                                        unit = "unidade",
                                        nutritionPerUnit = MacroTotals(kcal = 105.0),
                                    ),
                                ),
                        ),
                        PlanMeal(
                            name = "Almoço",
                            id = "m-2",
                            time = "12:30",
                            items =
                                listOf(
                                    PlanItem(
                                        name = "Arroz branco",
                                        id = "it-2",
                                        quantity = 150.0,
                                        unit = "g",
                                        nutritionPerUnit = MacroTotals(kcal = 1.3),
                                        swaps = listOf(SwapOption(name = "Batata doce cozida", quantity = 200.0, unit = "g")),
                                    ),
                                    PlanItem(
                                        name = "Frango grelhado",
                                        id = "it-3",
                                        quantity = 120.0,
                                        unit = "g",
                                        nutritionPerUnit = MacroTotals(kcal = 1.65),
                                    ),
                                ),
                            options =
                                listOf(
                                    MealOption(
                                        name = "Opção 2 - Brunch",
                                        items = listOf(PlanItem(name = "Pão integral", id = "it-4", quantity = 2.0, unit = "fatia")),
                                    ),
                                ),
                        ),
                        PlanMeal(name = "Legado sem id", items = listOf(PlanItem(name = "Legado sem id"))),
                    ),
            )

        val MATCHED_LUNCH =
            """
            {"drafts":[{"type":"meal","occurredAt":"$AT","detail":{
              "title":"Almoço","planMealId":"m-2","planStatus":"adjusted","items":[
                {"name":"Batata doce cozida","quantity":200,"unit":"g","kcal":154,"replacesItemId":"it-2"},
                {"name":"Frango grelhado","quantity":120,"unit":"g","kcal":198,"replacesItemId":"it-3"}]}}]}
            """.trimIndent()

        val PARTIAL =
            """
            {"drafts":[
              {"type":"meal","occurredAt":"$AT","detail":{"title":"Almoço","planMealId":"m-2","planStatus":"done",
                "items":[{"name":"Arroz branco","kcal":195,"replacesItemId":"it-2"},
                         {"name":"Frango grelhado","kcal":198,"replacesItemId":"it-3"}]}},
              {"type":"meal","occurredAt":"$AT","detail":{"title":"Cerveja","items":[{"name":"Cerveja","kcal":150}]}}]}
            """.trimIndent()

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

        fun toolResponse(
            input: String,
            inputTokens: Int = 1,
            outputTokens: Int = 1,
        ): String =
            """
            {"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-4-5",
             "stop_reason":"tool_use","usage":{"input_tokens":$inputTokens,"output_tokens":$outputTokens},
             "content":[{"type":"tool_use","id":"toolu_1","name":"record_log_entries","input":$input}]}
            """.trimIndent()
    }
}
