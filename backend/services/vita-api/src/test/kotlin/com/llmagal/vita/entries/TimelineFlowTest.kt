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
import java.util.UUID

/**
 * BE-012 contract check: timeline list (day filter, ordering, cursor paging) and
 * per-entry get/update/delete (ownership → 404, whole-detail replace, type
 * immutability, idempotent delete).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class TimelineFlowTest {
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
        token = signInTestUser(jdbc, crypto, tokens, "timeline-${UUID.randomUUID()}@test.dev").accessToken
    }

    private fun water(
        occurredAt: String,
        amountMl: Int = 250,
    ) = mapOf(
        "type" to "water",
        "occurredAt" to occurredAt,
        "inputMethod" to "tap",
        "detail" to mapOf("amountMl" to amountMl),
    )

    @Suppress("UNCHECKED_CAST")
    private fun create(
        body: Any,
        bearer: String = token,
    ): String =
        (
            client
                .post()
                .uri("/v1/entries")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .header("Authorization", "Bearer $bearer")
                .body(body)
                .exchange()
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        )["id"] as String

    private fun get(
        path: String,
        bearer: String? = token,
    ): RestTestClient.ResponseSpec {
        val spec = client.get().uri(path)
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.exchange()
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `list returns entries newest first`() {
        create(water("2026-07-13T08:00:00Z"))
        create(water("2026-07-13T20:00:00Z"))
        create(water("2026-07-13T12:00:00Z"))

        val page =
            get("/v1/entries")
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val items = page["items"] as List<Map<String, Any>>
        val times = items.map { it["occurredAt"] as String }
        assertThat(times).isSortedAccordingTo(compareByDescending { it })
        assertThat(times.first()).startsWith("2026-07-13T20:00")
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `date plus tz filters to the local calendar day`() {
        // 2026-07-13T23:30-03:00 is 2026-07-14T02:30Z — belongs to the 13th in Sao_Paulo.
        create(water("2026-07-13T23:30:00-03:00"))
        // 2026-07-14T00:30-03:00 is the 14th locally.
        create(water("2026-07-14T00:30:00-03:00"))

        val page =
            get("/v1/entries?date=2026-07-13&tz=America/Sao_Paulo")
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val items = page["items"] as List<Map<String, Any>>
        // Only the entry that falls on the 13th in Sao_Paulo; timestamptz reads back in UTC.
        assertThat(items).hasSize(1)
        assertThat(items.first()["occurredAt"] as String).isEqualTo("2026-07-14T02:30:00Z")
    }

    @Test
    fun `date without tz is a 400`() {
        get("/v1/entries?date=2026-07-13").expectStatus().isBadRequest
    }

    private fun meal(occurredAt: String) =
        mapOf(
            "type" to "meal",
            "occurredAt" to occurredAt,
            "inputMethod" to "text",
            "detail" to mapOf("items" to listOf(mapOf("name" to "Toast", "kcal" to 100))),
        )

    @Suppress("UNCHECKED_CAST")
    private fun listItems(uri: String): List<Map<String, Any>> =
        (
            get(uri)
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        )["items"] as List<Map<String, Any>>

    @Test
    fun `from and to bound a half-open occurredAt window`() {
        create(water("2026-07-13T08:00:00Z"))
        create(water("2026-07-13T12:00:00Z"))
        create(water("2026-07-13T18:00:00Z")) // exactly the `to` bound → excluded

        val times =
            listItems("/v1/entries?from=2026-07-13T10:00:00Z&to=2026-07-13T18:00:00Z")
                .map { it["occurredAt"] as String }
        assertThat(times).hasSize(1)
        assertThat(times.first()).startsWith("2026-07-13T12:00")
    }

    @Test
    fun `type CSV filters the timeline`() {
        create(water("2026-07-13T08:00:00Z"))
        create(meal("2026-07-13T09:00:00Z"))

        assertThat(listItems("/v1/entries?type=water").map { it["type"] }).containsOnly("water")
        assertThat(listItems("/v1/entries?type=meal,water").map { it["type"] })
            .containsExactlyInAnyOrder("meal", "water")
    }

    @Test
    fun `type checkin is accepted and matches nothing yet`() {
        create(water("2026-07-13T08:00:00Z"))
        assertThat(listItems("/v1/entries?type=checkin")).isEmpty()
    }

    @Test
    fun `unknown type filter is a 400`() {
        get("/v1/entries?type=bogus").expectStatus().isBadRequest
    }

    @Test
    fun `date combined with from is a 400`() {
        get("/v1/entries?date=2026-07-13&tz=UTC&from=2026-07-13T00:00:00Z")
            .expectStatus()
            .isBadRequest
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `cursor pages through all entries without overlap`() {
        val ids = (0 until 5).map { create(water("2026-07-13T${"%02d".format(it + 8)}:00:00Z")) }.toSet()

        val seen = mutableSetOf<String>()
        var cursor: String? = null
        var guard = 0
        do {
            val uri = "/v1/entries?limit=2" + (cursor?.let { "&cursor=$it" } ?: "")
            val page =
                get(uri)
                    .expectStatus()
                    .isOk
                    .expectBody(MAP)
                    .returnResult()
                    .responseBody!!
            val items = page["items"] as List<Map<String, Any>>
            items.forEach { seen += it["id"] as String }
            cursor = page["nextCursor"] as String?
        } while (cursor != null && guard++ < 10)

        assertThat(seen).isEqualTo(ids)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `get returns one entry and a foreign entry is 404`() {
        val id = create(water("2026-07-13T09:00:00Z"))
        val body =
            get("/v1/entries/$id")
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(body["id"]).isEqualTo(id)

        val other = signInTestUser(jdbc, crypto, tokens, "other-${UUID.randomUUID()}@test.dev").accessToken
        get("/v1/entries/$id", bearer = other).expectStatus().isNotFound
        get("/v1/entries/${UUID.randomUUID()}").expectStatus().isNotFound
    }

    private fun patch(
        id: String,
        body: Any,
        bearer: String = token,
    ): RestTestClient.ResponseSpec =
        client
            .patch()
            .uri("/v1/entries/$id")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer $bearer")
            .body(body)
            .exchange()

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `patch occurredAt keeps the detail and bumps updatedAt`() {
        val id = create(water("2026-07-13T09:00:00Z", amountMl = 300))
        val before = get("/v1/entries/$id").expectBody(MAP).returnResult().responseBody!!

        val after =
            patch(id, mapOf("occurredAt" to "2026-07-13T10:00:00Z"))
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        assertThat(after["occurredAt"] as String).startsWith("2026-07-13T10:00")
        assertThat((after["detail"] as Map<String, Any>)["amountMl"]).isEqualTo(300)
        assertThat(after["updatedAt"] as String).isNotEqualTo(before["updatedAt"] as String)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `patch replaces the whole detail and recomputes meal totals`() {
        val id =
            create(
                mapOf(
                    "type" to "meal",
                    "occurredAt" to "2026-07-13T09:00:00Z",
                    "inputMethod" to "text",
                    "detail" to
                        mapOf(
                            "items" to listOf(mapOf("name" to "Toast", "kcal" to 100)),
                        ),
                ),
            )

        val after =
            patch(
                id,
                mapOf(
                    "detail" to
                        mapOf(
                            "title" to "Bigger breakfast",
                            "items" to
                                listOf(
                                    mapOf("name" to "Eggs", "kcal" to 180, "proteinG" to 12),
                                    mapOf("name" to "Latte", "kcal" to 120, "proteinG" to 6),
                                ),
                            "totals" to mapOf("kcal" to 1), // wrong on purpose
                        ),
                ),
            ).expectStatus().isOk.expectBody(MAP).returnResult().responseBody!!

        val totals = (after["detail"] as Map<String, Any>)["totals"] as Map<String, Any>
        assertThat((totals["kcal"] as Number).toInt()).isEqualTo(300)
        assertThat((totals["proteinG"] as Number).toInt()).isEqualTo(18)
        // C2 denormalized kcal followed the edit.
        val kcal = jdbc.queryForObject("SELECT kcal FROM log_entry WHERE id = ?::uuid", Int::class.java, id)
        assertThat(kcal).isEqualTo(300)
    }

    @Test
    fun `patch with a detail that mismatches the type is a 400`() {
        val id = create(water("2026-07-13T09:00:00Z"))
        // water entry, but a workout-shaped detail (no amountMl) → rejected.
        patch(id, mapOf("detail" to mapOf("title" to "Push day")))
            .expectStatus()
            .isBadRequest
    }

    @Test
    fun `empty patch body is a 400`() {
        val id = create(water("2026-07-13T09:00:00Z"))
        patch(id, emptyMap<String, Any>()).expectStatus().isBadRequest
    }

    @Test
    fun `patching another user's entry is 404`() {
        val id = create(water("2026-07-13T09:00:00Z"))
        val other = signInTestUser(jdbc, crypto, tokens, "other-${UUID.randomUUID()}@test.dev").accessToken
        patch(id, mapOf("occurredAt" to "2026-07-13T10:00:00Z"), bearer = other)
            .expectStatus()
            .isNotFound
    }

    private fun delete(
        id: String,
        bearer: String = token,
    ): RestTestClient.ResponseSpec =
        client
            .delete()
            .uri("/v1/entries/$id")
            .header("Authorization", "Bearer $bearer")
            .exchange()

    @Test
    fun `delete is idempotent and 204`() {
        val id = create(water("2026-07-13T09:00:00Z"))
        delete(id).expectStatus().isEqualTo(HttpStatus.NO_CONTENT)
        get("/v1/entries/$id").expectStatus().isNotFound
        // Deleting an already-gone entry still 204.
        delete(id).expectStatus().isEqualTo(HttpStatus.NO_CONTENT)
    }

    @Test
    fun `deleting another user's entry does not remove it`() {
        val id = create(water("2026-07-13T09:00:00Z"))
        val other = signInTestUser(jdbc, crypto, tokens, "other-${UUID.randomUUID()}@test.dev").accessToken
        delete(id, bearer = other).expectStatus().isEqualTo(HttpStatus.NO_CONTENT)
        // Still there for the owner.
        get("/v1/entries/$id").expectStatus().isOk
    }

    @Test
    fun `unauthenticated list is 401`() {
        get("/v1/entries", bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
