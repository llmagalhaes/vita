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
    fun `a blank or oversized Idempotency-Key is a 400`() {
        // Blank collided every write under one key (409); an over-long key blew the btree
        // index limit as a 500 (review L3). Both are the client's mistake → 400.
        post(mealBody(), " ").expectStatus().isBadRequest
        post(mealBody(), "k".repeat(201)).expectStatus().isBadRequest
        post(mealBody(), "k".repeat(200)).expectStatus().isCreated
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

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `workout muscles are mapped to the contract vocabulary and unmappable ones dropped`() {
        val entry =
            post(
                mapOf(
                    "type" to "workout",
                    "occurredAt" to "2026-07-13T18:00:00Z",
                    "inputMethod" to "text",
                    "detail" to
                        mapOf(
                            "title" to "Pull day",
                            "durationMin" to 40,
                            "muscles" to listOf("lats", "abs", "chest", "banana"),
                        ),
                ),
                key(),
            ).expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val muscles = (entry["detail"] as Map<String, Any>)["muscles"] as List<String>
        // lats→back, abs→core, chest passes through, banana dropped.
        assertThat(muscles).containsExactlyInAnyOrder("back", "core", "chest")
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `per-exercise muscles are mapped to the contract vocabulary`() {
        val entry =
            post(
                mapOf(
                    "type" to "workout",
                    "occurredAt" to "2026-07-13T18:00:00Z",
                    "inputMethod" to "text",
                    "detail" to
                        mapOf(
                            "title" to "Push day",
                            "exercises" to
                                listOf(
                                    mapOf(
                                        "name" to "Bench press",
                                        "muscles" to listOf("chest", "triceps", "banana"),
                                    ),
                                ),
                        ),
                ),
                key(),
            ).expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val exercises = (entry["detail"] as Map<String, Any>)["exercises"] as List<Map<String, Any>>
        val exMuscles = exercises[0]["muscles"] as List<String>
        // chest/triceps pass through, banana dropped.
        assertThat(exMuscles).containsExactlyInAnyOrder("chest", "triceps")
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `per-exercise muscleRoles are normalized and derive muscles when muscles is absent`() {
        val entry =
            post(
                mapOf(
                    "type" to "workout",
                    "occurredAt" to "2026-07-13T18:00:00Z",
                    "inputMethod" to "text",
                    "detail" to
                        mapOf(
                            "title" to "Pull day",
                            "exercises" to
                                listOf(
                                    mapOf(
                                        "name" to "Pull-up",
                                        // lats→back (alias), dup primary+secondary back → one primary,
                                        // banana dropped; no `muscles` field → derived from roles.
                                        "muscleRoles" to
                                            listOf(
                                                mapOf("name" to "lats", "role" to "primary"),
                                                mapOf("name" to "back", "role" to "secondary"),
                                                mapOf("name" to "biceps", "role" to "secondary"),
                                                mapOf("name" to "banana", "role" to "primary"),
                                            ),
                                    ),
                                ),
                        ),
                ),
                key(),
            ).expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val exercises = (entry["detail"] as Map<String, Any>)["exercises"] as List<Map<String, Any>>
        val roles = exercises[0]["muscleRoles"] as List<Map<String, Any>>
        assertThat(roles.map { it["name"] to it["role"] })
            .containsExactly("back" to "primary", "biceps" to "secondary")
        // muscles derived from the normalized role names (banana dropped).
        assertThat(exercises[0]["muscles"] as List<String>).containsExactly("back", "biceps")
    }

    @Test
    fun `rejects a negative-kcal meal item`() {
        post(
            mapOf(
                "type" to "meal",
                "occurredAt" to "2026-07-13T09:30:00Z",
                "inputMethod" to "text",
                "detail" to mapOf("items" to listOf(item("Void", kcal = -10, p = 0, c = 0, f = 0))),
            ),
            key(),
        ).expectStatus().isBadRequest
    }

    @Test
    fun `rejects a workout with durationMin 0`() {
        post(
            mapOf(
                "type" to "workout",
                "occurredAt" to "2026-07-13T18:00:00Z",
                "inputMethod" to "text",
                "detail" to mapOf("title" to "Zero", "durationMin" to 0),
            ),
            key(),
        ).expectStatus().isBadRequest
    }

    @Test
    fun `rejects an out-of-enum inputMethod`() {
        post(
            mapOf(
                "type" to "water",
                "occurredAt" to "2026-07-13T10:00:00Z",
                "inputMethod" to "telepathy",
                "detail" to mapOf("amountMl" to 250),
            ),
            key(),
        ).expectStatus().isBadRequest
    }

    @Test
    fun `unauthenticated create is 401`() {
        post(mealBody(), key(), bearer = null)
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `C3 content is encrypted at rest`() {
        val id =
            post(mealBody(), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!["id"]
        // The class shares one DB across tests; other rows have a null source phrase.
        jdbc.queryForList("SELECT detail_enc, source_phrase_enc FROM log_entry").forEach { row ->
            val detail = String(row["detail_enc"] as ByteArray, Charsets.ISO_8859_1)
            assertThat(detail).doesNotContain("Scrambled eggs")
            (row["source_phrase_enc"] as ByteArray?)?.let {
                assertThat(String(it, Charsets.ISO_8859_1)).doesNotContain("scrambled eggs")
            }
        }
        // The denormalized kcal is plaintext C2 so trends can GROUP BY it (ADR-0003).
        // Scope to the row this test created: the shared test DB also holds water/checkin
        // rows (null kcal) and 0.8.0 skipped meals (kcal 0).
        val kcal =
            jdbc.queryForObject("SELECT kcal FROM log_entry WHERE id = ?::uuid", BigDecimal::class.java, id)
        assertThat(kcal!!.toInt()).isEqualTo(300)
    }

    // ── BE-048 · day-record fields (contract 0.8.0) ────────────────────────

    /** A meal that fulfils a plan meal; `items` already carry their swap provenance. */
    private fun planMealBody(
        status: String?,
        items: List<Map<String, Any>> = listOf(item("Sweet potato", 180, 4, 41, 0) + ("replacesItemId" to "it-7")),
        planMealId: String? = "m-2",
        optionIndex: Int? = null,
    ): Map<String, Any> {
        val detail = mutableMapOf<String, Any>("title" to "Lunch", "items" to items)
        planMealId?.let { detail["planMealId"] = it }
        status?.let { detail["planStatus"] = it }
        optionIndex?.let { detail["planOptionIndex"] = it }
        return mapOf(
            "type" to "meal",
            "occurredAt" to "2026-08-18T13:00:00Z",
            "inputMethod" to "text",
            "detail" to detail,
        )
    }

    /** GET one entry and return its body. */
    private fun fetchEntry(id: Any): Map<String, Any> =
        client
            .get()
            .uri("/v1/entries/$id")
            .header("Authorization", "Bearer $token")
            .exchange()
            .expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    private fun patchEntry(
        id: Any,
        body: Any,
    ) = client
        .patch()
        .uri("/v1/entries/$id")
        .contentType(MediaType.APPLICATION_JSON)
        .header("Authorization", "Bearer $token")
        .body(body)
        .exchange()

    @Suppress("UNCHECKED_CAST")
    private fun detailOf(entry: Map<String, Any>) = entry["detail"] as Map<String, Any>

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `records a plan meal as done, storing the plan linkage verbatim`() {
        val entry =
            post(planMealBody("done", optionIndex = 1), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val detail = detailOf(entry)
        assertThat(detail["planMealId"]).isEqualTo("m-2")
        assertThat(detail["planStatus"]).isEqualTo("done")
        assertThat((detail["planOptionIndex"] as Number).toInt()).isEqualTo(1)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `records an adjusted meal keeping replacesItemId on each item`() {
        val entry =
            post(
                planMealBody(
                    "adjusted",
                    items =
                        listOf(
                            item("Sweet potato", 180, 4, 41, 0) + ("replacesItemId" to "it-7"),
                            item("Chicken breast", 200, 40, 0, 5) + ("replacesItemId" to "it-8"),
                        ),
                ),
                key(),
            ).expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val detail = detailOf(entry)
        assertThat(detail["planStatus"]).isEqualTo("adjusted")
        val items = detail["items"] as List<Map<String, Any>>
        assertThat(items.map { it["replacesItemId"] }).containsExactly("it-7", "it-8")
        assertThat(((detail["totals"] as Map<String, Any>)["kcal"] as Number).toInt()).isEqualTo(380)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `a skipped plan meal may carry no items and totals zero`() {
        val entry =
            post(planMealBody("skipped", items = emptyList()), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val detail = detailOf(entry)
        assertThat(detail["items"] as List<Any>).isEmpty()
        assertThat(((detail["totals"] as Map<String, Any>)["kcal"] as Number).toInt()).isZero()
    }

    @Test
    fun `empty items with a non-skipped plan status is a 400`() {
        post(planMealBody("done", items = emptyList()), key()).expectStatus().isBadRequest
        post(planMealBody("adjusted", items = emptyList()), key()).expectStatus().isBadRequest
    }

    @Test
    fun `plan status without a planMealId, and an unknown status value, are 400s`() {
        post(planMealBody("done", planMealId = null), key()).expectStatus().isBadRequest
        post(planMealBody(null, planMealId = null, optionIndex = 0), key()).expectStatus().isBadRequest
        post(planMealBody("eaten"), key()).expectStatus().isBadRequest
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `records a workout against its program day, and rejects a status without one`() {
        fun workout(
            planDay: String?,
            status: String,
        ): Map<String, Any> {
            val detail = mutableMapOf<String, Any>("title" to "Leg day", "durationMin" to 50, "planStatus" to status)
            planDay?.let { detail["planDay"] = it }
            return mapOf(
                "type" to "workout",
                "occurredAt" to "2026-08-18T18:00:00Z",
                "inputMethod" to "text",
                "detail" to detail,
            )
        }

        val done =
            post(workout("Leg day", "done"), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(detailOf(done)["planDay"]).isEqualTo("Leg day")
        assertThat(detailOf(done)["planStatus"]).isEqualTo("done")

        val adjusted =
            post(workout("Leg day", "adjusted"), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(detailOf(adjusted)["planStatus"]).isEqualTo("adjusted")

        post(workout(null, "done"), key()).expectStatus().isBadRequest
    }

    @Test
    fun `plan fields survive POST GET PATCH GET unchanged`() {
        val created =
            post(planMealBody("done", optionIndex = 0), key())
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val id = created["id"]!!

        val fetched = fetchEntry(id)
        assertThat(detailOf(fetched)).isEqualTo(detailOf(created))

        val patchDetail = (planMealBody("adjusted", optionIndex = 0)["detail"] as Map<*, *>)
        val patched =
            patchEntry(id, mapOf("detail" to patchDetail))
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(detailOf(patched)["planStatus"]).isEqualTo("adjusted")

        val refetched = fetchEntry(id)
        assertThat(detailOf(refetched)).isEqualTo(detailOf(patched))
    }

    @Test
    fun `replaying a close-the-day write with the same key returns the same record`() {
        val k = "day:2026-08-18:m-2"
        val first =
            post(planMealBody("skipped", items = emptyList()), k)
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val replay =
            post(planMealBody("skipped", items = emptyList()), k)
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(replay["id"]).isEqualTo(first["id"])
        post(planMealBody("done"), k).expectStatus().isEqualTo(HttpStatus.CONFLICT)
    }

    // ── BE-049 · weight entries ────────────────────────────────────────────

    private fun weightBody(kg: Number) =
        mapOf(
            "type" to "weight",
            "occurredAt" to "2026-08-18T07:00:00Z",
            "inputMethod" to "tap",
            "detail" to mapOf("kg" to kg),
        )

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `creates a weight reading and reads it back`() {
        val entry =
            post(weightBody(82.4), "weight:2026-08-18")
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat((detailOf(entry)["kg"] as Number).toDouble()).isEqualTo(82.4)
        assertThat(entry["source"]).isEqualTo("user")

        val fetched = fetchEntry(entry["id"]!!)
        assertThat((detailOf(fetched)["kg"] as Number).toDouble()).isEqualTo(82.4)
        // No aggregatable numbers: the C2 columns stay null (trends are client-side).
        val kcal =
            jdbc.queryForObject(
                "SELECT kcal FROM log_entry WHERE type = 'weight' AND id = ?::uuid",
                BigDecimal::class.java,
                entry["id"],
            )
        assertThat(kcal).isNull()
    }

    @Test
    fun `the daily weight key replays on an identical body and 409s on a different one`() {
        val k = "weight:2026-08-17"
        val first =
            post(weightBody(80.0), k)
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        val replay =
            post(weightBody(80.0), k)
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(replay["id"]).isEqualTo(first["id"])
        post(weightBody(81.0), k).expectStatus().isEqualTo(HttpStatus.CONFLICT)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `a weight reading can be corrected with PATCH`() {
        val id =
            post(weightBody(79.0), "weight:2026-08-16")
                .expectStatus()
                .isCreated
                .expectBody(MAP)
                .returnResult()
                .responseBody!!["id"]!!
        val patched =
            patchEntry(id, mapOf("detail" to mapOf("kg" to 78.5)))
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat((detailOf(patched)["kg"] as Number).toDouble()).isEqualTo(78.5)
    }

    @Test
    fun `weight outside 20-500 kg is a 400`() {
        post(weightBody(19.9), key()).expectStatus().isBadRequest
        post(weightBody(500.1), key()).expectStatus().isBadRequest
        post(weightBody(20), key()).expectStatus().isCreated
        post(weightBody(500), key()).expectStatus().isCreated
    }

    @Test
    fun `weight is accepted in the GET entries type filter`() {
        post(weightBody(75.0), key()).expectStatus().isCreated
        val page =
            client
                .get()
                .uri("/v1/entries?type=weight,meal&limit=50")
                .header("Authorization", "Bearer $token")
                .exchange()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        @Suppress("UNCHECKED_CAST")
        val items = page["items"] as List<Map<String, Any>>
        assertThat(items.map { it["type"] }).contains("weight")
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
