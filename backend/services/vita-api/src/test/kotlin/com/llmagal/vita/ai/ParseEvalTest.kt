package com.llmagal.vita.ai

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.ai.client.ClaudeClient
import com.llmagal.vita.ai.service.ParseMetrics
import com.llmagal.vita.ai.service.ParseService
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime

/**
 * BE-014 — the versioned eval set run against golden Claude responses (WireMock, never
 * the live API), one dynamic test per fixture case. Guards the parse contract shape and
 * kcal tolerances against prompt/model regressions in CI. The live-API twin
 * (ParseLiveEvalTest, @Tag("live")) runs the same cases on demand.
 */
class ParseEvalTest {
    @TestFactory
    fun evalCases(): List<DynamicTest> =
        ParseEvalCases.load().map { case ->
            DynamicTest.dynamicTest(case.name) {
                wm.resetAll()
                wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(case.goldenJson())))
                val client = ClaudeClient(wm.baseUrl(), "claude-haiku-4-5", 1024, 10, "test-key", 25, 2048)
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
    }
}
