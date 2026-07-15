package com.llmagal.vita.ai

import com.llmagal.vita.controller.ai.ParseController
import com.llmagal.vita.model.ai.Draft
import com.llmagal.vita.model.ai.ParseResponse
import com.llmagal.vita.model.ai.ParseTextRequest
import com.llmagal.vita.service.ai.ParseQuota
import com.llmagal.vita.service.ai.ParseService
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.security.oauth2.jwt.Jwt
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** BE-014 — the controller returns drafts under the ceiling and a 429 + Retry-After problem+json over it. */
class ParseControllerTest {
    private val service = mockk<ParseService>()
    private val quota = ParseQuota(1, Clock.fixed(Instant.parse("2026-07-13T12:00:00Z"), ZoneOffset.UTC))
    private val controller = ParseController(service, quota)

    private val jwt =
        Jwt
            .withTokenValue("t")
            .header("alg", "HS256")
            .subject(UUID.randomUUID().toString())
            .build()

    private val sampleDraft =
        Draft(
            type = "water",
            occurredAt = OffsetDateTime.parse("2026-07-13T12:00:00Z"),
            inputMethod = "text",
            sourcePhrase = "a glass of water",
            isEstimate = true,
            detail = mapOf("amountMl" to 250),
        )

    @Test
    fun `under the ceiling returns 200 with drafts`() {
        every { service.parseText(any(), any()) } returns ParseResponse(listOf(sampleDraft))

        val response = controller.parseText(jwt, ParseTextRequest("a glass of water", null))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.body).isInstanceOf(ParseResponse::class.java)
    }

    @Test
    fun `over the daily ceiling returns 429 with Retry-After and problem+json`() {
        every { service.parseText(any(), any()) } returns ParseResponse(listOf(sampleDraft))

        controller.parseText(jwt, ParseTextRequest("first", null)) // consumes the single allowed call
        val response = controller.parseText(jwt, ParseTextRequest("second", null))

        assertThat(response.statusCode).isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
        assertThat(response.headers.getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo((12 * 60 * 60L).toString())
        val problem = response.body as ProblemDetail
        assertThat(problem.status).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value())
    }
}
