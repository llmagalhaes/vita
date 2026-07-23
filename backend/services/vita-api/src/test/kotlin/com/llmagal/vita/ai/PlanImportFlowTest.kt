package com.llmagal.vita.ai

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.service.auth.TokenService
import com.llmagal.vita.service.crypto.CryptoService
import com.llmagal.vita.service.jobs.TokenCleanupJob
import com.llmagal.vita.signInTestUser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.core.ParameterizedTypeReference
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.client.RestTestClient
import java.util.UUID

/**
 * BE-044 §6.2 — the async eating-plan import end to end (Testcontainers + WireMock, never the
 * live API): POST → 202 + jobId, the background worker parses the golden and SAVES it as
 * status "review" with ids it-1…it-42, the poll reports running→done, and the failure paths
 * (409 already-running, upstream 500, unknown fileRef, stale row, 7-day sweep).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class PlanImportFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var cleanup: TokenCleanupJob

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var userId: UUID
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        wm.resetAll()
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        val user = signInTestUser(jdbc, crypto, tokens, "import-${UUID.randomUUID()}@test.dev")
        userId = user.id
        token = user.accessToken
    }

    private fun stubGolden() {
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(goldenResponse())))
    }

    private fun postImport(body: Map<String, Any?>) =
        client
            .post()
            .uri("/v1/parse/eating-plan")
            .header("Authorization", "Bearer $token")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .exchange()

    @Suppress("UNCHECKED_CAST")
    private fun startJob(): String =
        (
            postImport(mapOf("text" to "my nutritionist plan"))
                .expectStatus()
                .isAccepted
                .expectBody(MAP)
                .returnResult()
                .responseBody!!["jobId"] as String
        )

    @Suppress("UNCHECKED_CAST")
    private fun poll(jobId: String): Map<String, Any> =
        client
            .get()
            .uri("/v1/parse/eating-plan/jobs/$jobId")
            .header("Authorization", "Bearer $token")
            .exchange()
            .expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    private fun pollUntilTerminal(jobId: String): Map<String, Any> {
        repeat(POLL_TRIES) {
            val s = poll(jobId)
            if (s["state"] != "running") return s
            Thread.sleep(POLL_SLEEP_MS)
        }
        error("job $jobId still running after ${POLL_TRIES * POLL_SLEEP_MS} ms")
    }

    @Suppress("UNCHECKED_CAST")
    private fun currentDoc(): Map<String, Any> =
        client
            .get()
            .uri("/v1/plan")
            .header("Authorization", "Bearer $token")
            .exchange()
            .expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    @Suppress("UNCHECKED_CAST")
    private fun collectIds(doc: Map<String, Any>): List<String> {
        val meals = doc["meals"] as List<Map<String, Any>>
        return meals.flatMap { meal ->
            val base = (meal["items"] as List<Map<String, Any>>).mapNotNull { it["id"] as String? }
            val opts =
                (meal["options"] as? List<Map<String, Any>>).orEmpty().flatMap { opt ->
                    (opt["items"] as List<Map<String, Any>>).mapNotNull { it["id"] as String? }
                }
            base + opts
        }
    }

    @Test
    fun `import saves the golden as status review with 42 flat ids and overlay reset`() {
        stubGolden()
        val jobId = startJob()
        assertThat(pollUntilTerminal(jobId)["state"]).isEqualTo("done")

        val doc = currentDoc()
        assertThat(doc["status"]).isEqualTo("review")
        assertThat(doc).doesNotContainKey("portions") // fresh import → overlay empty
        val ids = collectIds(doc)
        assertThat(ids).hasSize(42)
        assertThat(ids.toSet()).hasSize(42) // all distinct
        assertThat(ids).contains("it-1", "it-42")
        // Option items are decorated like base items (ids + portion bounds, V3-D8).
        assertThat(optionItemsHavePortion(doc)).isTrue()
    }

    @Suppress("UNCHECKED_CAST")
    private fun optionItemsHavePortion(doc: Map<String, Any>): Boolean =
        (doc["meals"] as List<Map<String, Any>>)
            .flatMap { (it["options"] as? List<Map<String, Any>>).orEmpty() }
            .flatMap { it["items"] as List<Map<String, Any>> }
            .any { it["id"] != null && it["portion"] != null }

    @Test
    fun `a second import while one is running is a 409`() {
        // A running row already exists (inserted directly for determinism).
        jdbc.update(
            "INSERT INTO plan_parse_job (id, user_id, state) VALUES (?, ?, 'running')",
            UUID.randomUUID(),
            userId,
        )
        postImport(mapOf("text" to "x")).expectStatus().isEqualTo(HttpStatus.CONFLICT)
    }

    @Test
    fun `an upstream error fails the job with a human-safe reason`() {
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(aResponse().withStatus(500)))
        val jobId = startJob()
        val s = pollUntilTerminal(jobId)
        assertThat(s["state"]).isEqualTo("failed")
        assertThat(s["failureReason"] as String).isNotBlank()
    }

    @Test
    fun `an unknown fileRef fails the job`() {
        val jobId =
            (
                postImport(mapOf("fileRef" to "missing-ref"))
                    .expectStatus()
                    .isAccepted
                    .expectBody(MAP)
                    .returnResult()
                    .responseBody!!["jobId"] as String
            )
        val s = pollUntilTerminal(jobId)
        assertThat(s["state"]).isEqualTo("failed")
    }

    @Test
    fun `a running job past the stale window is reported failed`() {
        val jobId = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO plan_parse_job (id, user_id, state, created_at, updated_at) " +
                "VALUES (?, ?, 'running', now() - interval '20 minutes', now() - interval '20 minutes')",
            jobId,
            userId,
        )
        assertThat(poll(jobId.toString())["state"]).isEqualTo("failed")
    }

    @Test
    fun `another user's job is a 404`() {
        val jobId = UUID.randomUUID()
        jdbc.update("INSERT INTO plan_parse_job (id, user_id, state) VALUES (?, ?, 'done')", jobId, userId)
        val other = signInTestUser(jdbc, crypto, tokens, "other-${UUID.randomUUID()}@test.dev")
        client
            .get()
            .uri("/v1/parse/eating-plan/jobs/$jobId")
            .header("Authorization", "Bearer ${other.accessToken}")
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.NOT_FOUND)
    }

    @Test
    fun `the cleanup sweep drops job rows older than 7 days`() {
        val old = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO plan_parse_job (id, user_id, state, created_at) " +
                "VALUES (?, ?, 'done', now() - interval '8 days')",
            old,
            userId,
        )
        cleanup.sweep()
        val count = jdbc.queryForObject("SELECT count(*) FROM plan_parse_job WHERE id = ?", Int::class.java, old)
        assertThat(count).isZero()
    }

    private companion object {
        const val POLL_TRIES = 80
        const val POLL_SLEEP_MS = 100L
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}

        val wm: WireMockServer = WireMockServer(options().dynamicPort()).apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun claudeBaseUrl(registry: DynamicPropertyRegistry) {
            registry.add("vita.ai.base-url") { wm.baseUrl() }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wm.stop()
        }

        /** The committed golden (real parse of meal-plan.pdf) wrapped as a Claude tool_use response. */
        fun goldenResponse(): String {
            val input =
                PlanImportFlowTest::class.java
                    .getResourceAsStream("/eval/v3-meal-plan-golden.json")!!
                    .bufferedReader()
                    .readText()
            return """
                {"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-6",
                 "stop_reason":"tool_use",
                 "content":[{"type":"tool_use","id":"toolu_1","name":"record_eating_plan","input":$input}]}
                """.trimIndent()
        }
    }
}
