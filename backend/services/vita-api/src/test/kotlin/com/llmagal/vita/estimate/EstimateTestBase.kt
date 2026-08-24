package com.llmagal.vita.estimate

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.repository.estimate.EstimateCacheRepository
import com.llmagal.vita.service.ai.ClaudeClient
import com.llmagal.vita.service.ai.ParseMetrics
import com.llmagal.vita.service.estimate.EstimateService
import com.llmagal.vita.service.estimate.ExerciseLookup
import com.llmagal.vita.service.estimate.FoodLookup
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate

/**
 * BE-061/063/065 acceptance harness: the REAL V013/V014 seed in a Testcontainers Postgres,
 * and Claude behind WireMock — never the live API. Both caches are truncated before every
 * test, so "a repeat is free" is proven, not inherited from a neighbouring test.
 */
@SpringBootTest
@Import(TestcontainersConfig::class)
abstract class EstimateTestBase {
    @Autowired
    lateinit var foodLookup: FoodLookup

    @Autowired
    lateinit var exerciseLookup: ExerciseLookup

    @Autowired
    lateinit var cache: EstimateCacheRepository

    @Autowired
    lateinit var jdbc: JdbcTemplate

    lateinit var service: EstimateService

    @BeforeEach
    fun resetEstimateFixture() {
        wm.resetAll()
        jdbc.update("TRUNCATE food_estimate_cache")
        jdbc.update("TRUNCATE exercise_estimate_cache")
        val client = ClaudeClient(wm.baseUrl(), "claude-haiku-4-5", 1024, 10, "test-key", 25, 2048, 16384, 300, 1024, 10)
        service =
            EstimateService(
                foodLookup,
                exerciseLookup,
                cache,
                client,
                ParseMetrics(SimpleMeterRegistry()),
                "claude-haiku-4-5",
            )
    }

    /** The model answers with this tool input. */
    fun stubTool(
        toolName: String,
        input: String,
    ) {
        wm.stubFor(post(urlEqualTo(MESSAGES)).willReturn(okJson(toolResponse(toolName, input))))
    }

    /** The model leg is down: ClaudeClient retries once, then throws. */
    fun stubFailure() {
        wm.stubFor(
            post(urlEqualTo(MESSAGES)).willReturn(aResponse().withStatus(HttpStatus.SERVICE_UNAVAILABLE.value())),
        )
    }

    fun verifyModelCalls(count: Int) = wm.verify(count, postRequestedFor(urlEqualTo(MESSAGES)))

    fun lastRequestBody(): String = wm.findAll(postRequestedFor(urlEqualTo(MESSAGES))).last().bodyAsString

    companion object {
        private const val MESSAGES = "/v1/messages"

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
            toolName: String,
            input: String,
        ): String =
            """
            {"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-4-5",
             "stop_reason":"tool_use","usage":{"input_tokens":120,"output_tokens":30},
             "content":[{"type":"tool_use","id":"toolu_1","name":"$toolName","input":$input}]}
            """.trimIndent()
    }
}
