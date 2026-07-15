package com.llmagal.vita.entries

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
 * BE-024: `checkin` as an entry type. Rides the shared entries path — deterministic
 * `habitId:date` idempotency, change-answer via PATCH, encrypted at rest, and the
 * Home/Habits `type` split (Home excludes check-ins, Habits selects them).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class CheckinFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        token = signInTestUser(jdbc, crypto, tokens, "checkin-${UUID.randomUUID()}@test.dev").accessToken
    }

    private fun checkin(
        answer: String,
        habitName: String = "Drink water",
    ) = mapOf(
        "type" to "checkin",
        "occurredAt" to "2026-07-14T09:00:00Z",
        "inputMethod" to "checkin",
        "detail" to
            mapOf(
                "habitId" to "habit-1",
                "habitName" to habitName,
                "kind" to "yes_no",
                "answer" to answer,
            ),
    )

    private fun post(
        body: Any,
        key: String,
    ): RestTestClient.ResponseSpec =
        client
            .post()
            .uri("/v1/entries")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Idempotency-Key", key)
            .header("Authorization", "Bearer $token")
            .body(body)
            .exchange()

    @Suppress("UNCHECKED_CAST")
    private fun listItems(uri: String): List<Map<String, Any>> =
        (
            client
                .get()
                .uri(uri)
                .header("Authorization", "Bearer $token")
                .exchange()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        )["items"] as List<Map<String, Any>>

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `checkin creates, is idempotent per habit-day, and change-answer conflicts then PATCHes`() {
        val key = "habit-1:2026-07-14"
        val created =
            post(checkin("yes"), key)
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val id = created["id"] as String
        assertThat((created["detail"] as Map<String, Any>)["answer"]).isEqualTo("yes")

        // Same key + same body → idempotent replay (same entry, 200).
        val replay =
            post(checkin("yes"), key)
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(replay["id"]).isEqualTo(id)

        // Same key + a different answer → 409 (the create path won't silently overwrite).
        post(checkin("no"), key).expectStatus().isEqualTo(HttpStatus.CONFLICT)

        // Change the answer the supported way: PATCH the existing entry.
        val patched =
            client
                .patch()
                .uri("/v1/entries/$id")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer $token")
                .body(mapOf("detail" to (checkin("no")["detail"])))
                .exchange()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat((patched["detail"] as Map<String, Any>)["answer"]).isEqualTo("no")
        assertThat(patched["id"]).isEqualTo(id)
    }

    @Test
    fun `Home excludes check-ins and Habits selects them`() {
        post(checkin("yes"), "habit-1:2026-07-14").expectStatus().isCreated
        client
            .post()
            .uri("/v1/entries")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .header("Authorization", "Bearer $token")
            .body(
                mapOf(
                    "type" to "water",
                    "occurredAt" to "2026-07-14T10:00:00Z",
                    "inputMethod" to "tap",
                    "detail" to mapOf("amountMl" to 250),
                ),
            ).exchange()
            .expectStatus()
            .isCreated

        assertThat(listItems("/v1/entries?type=meal,water,workout").map { it["type"] }).doesNotContain("checkin")
        assertThat(listItems("/v1/entries?type=checkin").map { it["type"] }).containsOnly("checkin")
    }

    @Test
    fun `a check-in missing an answer is a 400`() {
        post(checkin(""), "habit-1:2026-07-14").expectStatus().isBadRequest
    }

    @Test
    fun `check-in detail is encrypted at rest`() {
        post(checkin("yes", habitName = "Meditate quietly"), "habit-1:2026-07-14").expectStatus().isCreated
        jdbc.queryForList("SELECT detail_enc FROM log_entry WHERE type = 'checkin'").forEach { row ->
            val blob = String(row["detail_enc"] as ByteArray, Charsets.ISO_8859_1)
            assertThat(blob).doesNotContain("Meditate quietly")
        }
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
