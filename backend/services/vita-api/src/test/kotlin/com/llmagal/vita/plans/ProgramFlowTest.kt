package com.llmagal.vita.plans

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.service.auth.TokenService
import com.llmagal.vita.service.crypto.CryptoService
import com.llmagal.vita.signInTestUser
import org.assertj.core.api.Assertions.assertThat
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
import org.springframework.test.web.servlet.client.RestTestClient
import java.util.UUID

/**
 * BE-020: training program — the mechanical mirror of the eating plan on the
 * same versioned-doc engine. Confirms the program path shares import / version /
 * edit-in-place / encryption behaviour; PlanFlowTest owns the exhaustive cases.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class ProgramFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        token = signInTestUser(jdbc, crypto, tokens, "lifter-${UUID.randomUUID()}@test.dev").accessToken
    }

    private fun programBody(summary: String) =
        mapOf(
            "summary" to summary,
            "splitDescription" to "Push / Pull / Legs",
            "days" to
                listOf(
                    mapOf(
                        "name" to "Day 1 - Push",
                        "exercises" to listOf(mapOf("name" to "Bench press", "sets" to 4, "reps" to 8)),
                    ),
                ),
        )

    private fun post(body: Any) =
        client
            .post()
            .uri("/v1/program")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer $token")
            .body(body)
            .exchange()

    private fun put(body: Any) =
        client
            .put()
            .uri("/v1/program")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer $token")
            .body(body)
            .exchange()

    private fun current() =
        client
            .get()
            .uri("/v1/program")
            .header("Authorization", "Bearer $token")
            .exchange()

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `imports, versions, edits in place and reads back`() {
        post(programBody("Block 1")).expectStatus().isCreated
        post(programBody("Block 2")).expectStatus().isCreated
        put(programBody("Block 2 - deload")).expectStatus().isOk

        val versions =
            client
                .get()
                .uri("/v1/program/history")
                .header("Authorization", "Bearer $token")
                .exchange()
                .expectStatus()
                .isOk
                .expectBody(LIST)
                .returnResult()
                .responseBody!!
        // Two versions (edit replaced the newest, didn't add one); newest reflects the edit.
        assertThat(versions).hasSize(2)
        assertThat((versions[0]["doc"] as Map<String, Any>)["summary"]).isEqualTo("Block 2 - deload")

        val body =
            current()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(body["summary"]).isEqualTo("Block 2 - deload")
        assertThat(body["days"] as List<Any>).hasSize(1)
    }

    @Test
    fun `rejects an empty program and requires auth`() {
        post(mapOf("summary" to "x", "days" to emptyList<Any>())).expectStatus().isBadRequest
        client
            .get()
            .uri("/v1/program")
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `program doc is encrypted at rest`() {
        post(programBody("Hypertrophy secret")).expectStatus().isCreated
        jdbc.queryForList("SELECT doc_enc FROM training_program").forEach { row ->
            val blob = String(row["doc_enc"] as ByteArray, Charsets.ISO_8859_1)
            assertThat(blob).doesNotContain("Hypertrophy secret")
            assertThat(blob).doesNotContain("Bench press")
        }
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
        val LIST = object : ParameterizedTypeReference<List<Map<String, Any>>>() {}
    }
}
