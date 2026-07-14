package com.llmagal.vita.entries

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.auth.service.TokenService
import com.llmagal.vita.crypto.service.CryptoService
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
import java.math.BigDecimal
import java.util.UUID

/**
 * BE-011 contract check: the single write path. Idempotency (replay vs. clash),
 * server-side meal-total recompute, server-set fields, C3-at-rest, auth guard.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class EntryFlowTest {
    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Autowired
    lateinit var crypto: CryptoService

    @Autowired
    lateinit var tokens: TokenService

    @LocalServerPort
    var port = 0

    lateinit var client: RestTestClient
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        token = signInTestUser(jdbc, crypto, tokens, "eater-${UUID.randomUUID()}@test.dev").accessToken
    }

    private fun mealBody(claimedKcal: Int = 9999) =
        mapOf(
            "type" to "meal",
            "occurredAt" to "2026-07-13T09:30:00Z",
            "inputMethod" to "text",
            "sourcePhrase" to "two scrambled eggs and a latte",
            "isEstimate" to true,
            "detail" to
                mapOf(
                    "title" to "Eggs & latte",
                    "items" to
                        listOf(
                            item("Scrambled eggs", kcal = 180, p = 12, c = 2, f = 14),
                            item("Latte", kcal = 120, p = 6, c = 10, f = 6),
                        ),
                    "totals" to mapOf("kcal" to claimedKcal), // wrong on purpose — server recomputes
                ),
        )

    private fun item(
        name: String,
        kcal: Int,
        p: Int,
        c: Int,
        f: Int,
    ) = mapOf("name" to name, "kcal" to kcal, "proteinG" to p, "carbsG" to c, "fatG" to f)

    private fun waterBody(amountMl: Int) =
        mapOf(
            "type" to "water",
            "occurredAt" to "2026-07-13T10:00:00Z",
            "inputMethod" to "tap",
            "detail" to mapOf("amountMl" to amountMl),
        )

    private fun post(
        body: Any,
        key: String,
        bearer: String? = token,
    ): RestTestClient.ResponseSpec {
        val spec =
            client
                .post()
                .uri("/v1/entries")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", key)
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.body(body).exchange()
    }

    private fun key() = UUID.randomUUID().toString()

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `creates a meal, sets server fields and recomputes totals`() {
        val entry =
            post(mealBody(), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        assertThat(entry["id"]).isNotNull()
        assertThat(entry["source"]).isEqualTo("user")
        assertThat(entry["isEstimate"]).isEqualTo(true)
        assertThat(entry).containsKeys("loggedAt", "updatedAt")

        val totals = (entry["detail"] as Map<String, Any>)["totals"] as Map<String, Any>
        assertThat((totals["kcal"] as Number).toInt()).isEqualTo(300) // 180 + 120, not the claimed 9999
        assertThat((totals["proteinG"] as Number).toInt()).isEqualTo(18)
    }

    @Test
    fun `same key and same body replays the original entry (200)`() {
        val k = key()
        val first =
            post(mealBody(), k)
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val replay =
            post(mealBody(), k)
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(replay["id"]).isEqualTo(first["id"])
    }

    @Test
    fun `same key with a different body is a 409`() {
        val k = key()
        post(mealBody(), k).expectStatus().isCreated
        post(waterBody(250), k)
            .expectStatus()
            .isEqualTo(HttpStatus.CONFLICT)
            .expectHeader()
            .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
    }

    @Test
    fun `creates water and workout entries`() {
        post(waterBody(500), key()).expectStatus().isCreated
        post(
            mapOf(
                "type" to "workout",
                "occurredAt" to "2026-07-13T18:00:00Z",
                "inputMethod" to "text",
                "detail" to
                    mapOf(
                        "title" to "Push day",
                        "durationMin" to 45,
                        "kcal" to 300,
                        "muscles" to listOf("chest", "triceps"),
                    ),
            ),
            key(),
        ).expectStatus().isCreated
    }

    @Test
    fun `rejects an empty meal and an out-of-range water amount`() {
        post(
            mapOf(
                "type" to "meal",
                "occurredAt" to "2026-07-13T09:30:00Z",
                "inputMethod" to "text",
                "detail" to mapOf("items" to emptyList<Any>()),
            ),
            key(),
        ).expectStatus().isBadRequest
        post(waterBody(0), key()).expectStatus().isBadRequest
    }

    @Test
    fun `unauthenticated create is 401`() {
        post(mealBody(), key(), bearer = null)
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `C3 content is encrypted at rest`() {
        post(mealBody(), key()).expectStatus().isCreated
        // The class shares one DB across tests; other rows have a null source phrase.
        jdbc.queryForList("SELECT detail_enc, source_phrase_enc FROM log_entry").forEach { row ->
            val detail = String(row["detail_enc"] as ByteArray, Charsets.ISO_8859_1)
            assertThat(detail).doesNotContain("Scrambled eggs")
            (row["source_phrase_enc"] as ByteArray?)?.let {
                assertThat(String(it, Charsets.ISO_8859_1)).doesNotContain("scrambled eggs")
            }
        }
        // The denormalized kcal is plaintext C2 so trends can GROUP BY it (ADR-0003).
        val kcal = jdbc.queryForObject("SELECT kcal FROM log_entry LIMIT 1", BigDecimal::class.java)
        assertThat(kcal!!.toInt()).isEqualTo(300)
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
