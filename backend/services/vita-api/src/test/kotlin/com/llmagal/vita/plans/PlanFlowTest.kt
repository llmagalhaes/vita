package com.llmagal.vita.plans

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.repository.plans.PlanTable
import com.llmagal.vita.service.account.AccountDeletionService
import com.llmagal.vita.service.auth.TokenService
import com.llmagal.vita.service.crypto.CryptoService
import com.llmagal.vita.service.plans.PlanService
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
 * BE-019: persisted eating plan — versioned, history-capped, editable, encrypted
 * at rest, and swept by the account-deletion cascade + crypto-shred.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class PlanFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var deletion: AccountDeletionService

    @Autowired lateinit var plans: PlanService

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var userId: UUID
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        val user = signInTestUser(jdbc, crypto, tokens, "planner-${UUID.randomUUID()}@test.dev")
        userId = user.id
        token = user.accessToken
    }

    private fun planBody(summary: String) =
        mapOf(
            "summary" to summary,
            "dailyTotals" to mapOf("kcal" to 2100, "proteinG" to 150),
            "meals" to
                listOf(
                    mapOf(
                        "name" to "Breakfast",
                        "time" to "08:00",
                        "items" to listOf(mapOf("name" to "Oats", "quantity" to 50, "unit" to "g")),
                    ),
                ),
        )

    private fun post(
        body: Any,
        bearer: String? = token,
    ) = send("POST", "/v1/plan", body, bearer)

    private fun put(
        body: Any,
        bearer: String? = token,
    ) = send("PUT", "/v1/plan", body, bearer)

    private fun send(
        method: String,
        uri: String,
        body: Any,
        bearer: String?,
    ): RestTestClient.ResponseSpec {
        val spec =
            (if (method == "POST") client.post() else client.put())
                .uri(uri)
                .contentType(MediaType.APPLICATION_JSON)
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.body(body).exchange()
    }

    private fun getCurrent(bearer: String? = token) =
        client
            .get()
            .uri("/v1/plan")
            .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
            .exchange()

    private fun history() =
        client
            .get()
            .uri("/v1/plan/history")
            .header("Authorization", "Bearer $token")
            .exchange()
            .expectStatus()
            .isOk
            .expectBody(LIST)
            .returnResult()
            .responseBody!!

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `imports a plan and reads it back as current`() {
        post(planBody("Cut phase")).expectStatus().isCreated
        val current =
            getCurrent()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(current["summary"]).isEqualTo("Cut phase")
        assertThat(current["meals"] as List<Any>).hasSize(1)
    }

    @Test
    fun `GET current with no plan is 404`() {
        getCurrent().expectStatus().isEqualTo(HttpStatus.NOT_FOUND)
    }

    @Test
    fun `each POST is a new version and history keeps them newest-first`() {
        post(planBody("v1")).expectStatus().isCreated
        post(planBody("v2")).expectStatus().isCreated

        val versions = history()
        assertThat(versions).hasSize(2)
        assertThat(summaryOf(versions[0])).isEqualTo("v2")
        assertThat(summaryOf(versions[1])).isEqualTo("v1")
    }

    @Test
    fun `history caps at 5, dropping the oldest`() {
        (1..6).forEach { post(planBody("v$it")).expectStatus().isCreated }

        val versions = history()
        assertThat(versions).hasSize(5)
        assertThat(versions.map(::summaryOf)).containsExactly("v6", "v5", "v4", "v3", "v2")
        // v1 was dropped; the DB holds exactly the cap.
        assertThat(rowCount("eating_plan")).isEqualTo(5)
    }

    @Test
    fun `PUT edits the current version in place without adding a version`() {
        post(planBody("original")).expectStatus().isCreated

        put(planBody("edited")).expectStatus().isOk

        assertThat(
            getCurrent()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!["summary"],
        ).isEqualTo("edited")
        assertThat(history()).hasSize(1) // still one version — edit is not a new version
    }

    @Test
    fun `PUT before any import is 404`() {
        put(planBody("nothing to edit")).expectStatus().isEqualTo(HttpStatus.NOT_FOUND)
    }

    @Test
    fun `rejects an empty plan`() {
        post(mapOf("summary" to "x", "meals" to emptyList<Any>())).expectStatus().isBadRequest
        post(mapOf("summary" to " ", "meals" to listOf(mapOf("name" to "M", "items" to listOf(mapOf("name" to "i"))))))
            .expectStatus()
            .isBadRequest
    }

    @Test
    fun `unauthenticated is 401`() {
        post(planBody("x"), bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
        getCurrent(bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `plan doc is encrypted at rest`() {
        post(planBody("Secret cut plan")).expectStatus().isCreated
        jdbc.queryForList("SELECT doc_enc FROM eating_plan").forEach { row ->
            val blob = String(row["doc_enc"] as ByteArray, Charsets.ISO_8859_1)
            assertThat(blob).doesNotContain("Secret cut plan")
            assertThat(blob).doesNotContain("Oats")
        }
    }

    @Test
    fun `account purge shreds the DEK and cascades the plan rows`() {
        post(planBody("to be deleted")).expectStatus().isCreated
        assertThat(rowCount("eating_plan")).isEqualTo(1)

        deletion.requestDeletion(userId)
        jdbc.update("UPDATE users SET deletion_requested_at = now() - interval '8 days' WHERE id = ?", userId)
        deletion.purge(userId)

        // Rows gone via FK cascade, and the DEK is shredded so any blob elsewhere is unreadable.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM eating_plan WHERE user_id = ?", Int::class.java, userId))
            .isZero()
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_keys WHERE user_id = ?", Int::class.java, userId))
            .isZero()
    }

    // ── BE-037: item ids + portion bounds ───────────────────────────────────

    /** Two meals, four items in document order — for id-position and portion assertions. */
    private fun multiItemBody() =
        mapOf(
            "summary" to "Two-meal plan",
            "meals" to
                listOf(
                    mapOf(
                        "name" to "Breakfast",
                        "items" to
                            listOf(
                                mapOf("name" to "Eggs", "quantity" to 2, "unit" to "egg"),
                                mapOf("name" to "Latte", "quantity" to 200, "unit" to "ml"),
                            ),
                    ),
                    mapOf(
                        "name" to "Lunch",
                        "items" to
                            listOf(
                                mapOf("name" to "Chicken", "quantity" to 180, "unit" to "g"),
                                mapOf("name" to "Rice", "quantity" to 200, "unit" to "g"),
                            ),
                    ),
                ),
        )

    @Suppress("UNCHECKED_CAST")
    private fun itemsOf(doc: Map<String, Any>): List<Map<String, Any>> =
        (doc["meals"] as List<Map<String, Any>>).flatMap { it["items"] as List<Map<String, Any>> }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `POST assigns it-N in document order with recomputed portion, client ids and portion ignored`() {
        // A client that sends its own id + portion — both must be overwritten server-side.
        val body =
            mapOf(
                "summary" to "x",
                "meals" to
                    listOf(
                        mapOf(
                            "name" to "M",
                            "items" to
                                listOf(
                                    mapOf(
                                        "name" to "Eggs",
                                        "quantity" to 2,
                                        "unit" to "egg",
                                        "id" to "client-sent",
                                        "portion" to mapOf("min" to 0, "max" to 999, "step" to 7),
                                    ),
                                ),
                        ),
                    ),
            )
        post(body).expectStatus().isCreated
        val items = itemsOf(currentDoc())
        assertThat(items[0]["id"]).isEqualTo("it-1")
        val portion = items[0]["portion"] as Map<String, Any>
        assertThat(portion["max"]).isEqualTo(4.0) // 2 egg → 0..4 step 1, not the client's 999/7
        assertThat(portion["step"]).isEqualTo(1.0)
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `ids run flat across meals in document order`() {
        post(multiItemBody()).expectStatus().isCreated
        assertThat(itemsOf(currentDoc()).map { it["id"] }).containsExactly("it-1", "it-2", "it-3", "it-4")
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `PUT preserves round-tripped ids and gives a new item it-max+1`() {
        post(multiItemBody()).expectStatus().isCreated
        val stored = itemsOf(currentDoc())

        // Round-trip it-1/it-2/it-4, drop it-3, and add a brand-new id-less item.
        val edited =
            mapOf(
                "summary" to "edited",
                "meals" to
                    listOf(
                        mapOf(
                            "name" to "M",
                            "items" to
                                listOf(
                                    stored[0], // it-1
                                    stored[1], // it-2
                                    stored[3], // it-4
                                    mapOf("name" to "New", "quantity" to 1, "unit" to "slice"),
                                ),
                        ),
                    ),
            )
        put(edited).expectStatus().isOk
        // New item gets it-5 (max incoming suffix was 4), the rest keep their ids.
        assertThat(itemsOf(currentDoc()).map { it["id"] }).containsExactly("it-1", "it-2", "it-4", "it-5")
    }

    @Test
    fun `PUT with duplicate item ids is 400`() {
        post(planBody("seed")).expectStatus().isCreated
        val dup =
            mapOf(
                "summary" to "dup",
                "meals" to
                    listOf(
                        mapOf(
                            "name" to "M",
                            "items" to
                                listOf(
                                    mapOf("name" to "A", "id" to "it-9"),
                                    mapOf("name" to "B", "id" to "it-9"),
                                ),
                        ),
                    ),
            )
        put(dup).expectStatus().isBadRequest
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `a pre-0-6-0 id-less stored doc reads back without ids, and a later PUT assigns fresh ids`() {
        // Simulate a legacy doc by storing straight through the generic path (no decoration).
        val legacyItem = mapOf("name" to "Old")
        val legacyDoc = mapOf("name" to "M", "items" to listOf(legacyItem))
        plans.importVersion(
            PlanTable.EATING_PLAN,
            userId,
            mapOf("summary" to "legacy", "meals" to listOf(legacyDoc)),
        )
        assertThat(itemsOf(currentDoc())[0]["id"]).isNull() // no backfill on read (A2)

        // An edit save assigns fresh ids via the PUT rule (max suffix among incoming = 0 → it-1).
        put(mapOf("summary" to "now edited", "meals" to listOf(legacyDoc)))
            .expectStatus()
            .isOk
        assertThat(itemsOf(currentDoc())[0]["id"]).isEqualTo("it-1")
    }

    // ── BE-050: stable meal ids (m-N) ───────────────────────────────────────

    @Suppress("UNCHECKED_CAST")
    private fun mealsOf(doc: Map<String, Any>): List<Map<String, Any>> = doc["meals"] as List<Map<String, Any>>

    @Test
    fun `POST assigns m-N in document order, client-sent meal ids ignored`() {
        val body =
            mapOf(
                "summary" to "x",
                "meals" to
                    listOf(
                        mapOf("name" to "Breakfast", "id" to "client-sent", "items" to listOf(mapOf("name" to "Eggs"))),
                        mapOf("name" to "Lunch", "items" to listOf(mapOf("name" to "Rice"))),
                    ),
            )
        post(body).expectStatus().isCreated
        assertThat(mealsOf(currentDoc()).map { it["id"] }).containsExactly("m-1", "m-2")
    }

    @Test
    fun `PUT preserves round-tripped meal ids and gives a new meal m-max+1`() {
        post(multiItemBody()).expectStatus().isCreated
        val stored = mealsOf(currentDoc())

        // Drop m-1, round-trip m-2, add a brand-new id-less meal.
        val edited =
            mapOf(
                "summary" to "edited",
                "meals" to
                    listOf(
                        stored[1], // m-2
                        mapOf("name" to "Snack", "items" to listOf(mapOf("name" to "Apple", "quantity" to 1))),
                    ),
            )
        put(edited).expectStatus().isOk
        assertThat(mealsOf(currentDoc()).map { it["id"] }).containsExactly("m-2", "m-3")
    }

    @Test
    fun `PUT with duplicate meal ids is 400`() {
        post(planBody("seed")).expectStatus().isCreated
        val dup =
            mapOf(
                "summary" to "dup",
                "meals" to
                    listOf(
                        mapOf("name" to "A", "id" to "m-9", "items" to listOf(mapOf("name" to "X"))),
                        mapOf("name" to "B", "id" to "m-9", "items" to listOf(mapOf("name" to "Y"))),
                    ),
            )
        put(dup).expectStatus().isBadRequest
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `history versions carry the meal ids`() {
        post(multiItemBody()).expectStatus().isCreated
        val doc = history()[0]["doc"] as Map<String, Any>
        assertThat(mealsOf(doc).map { it["id"] }).containsExactly("m-1", "m-2")
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `the add-a-meal form's synthesized serving item gets 0 to 3 step 1 bounds`() {
        // APP add-a-meal (name · time · total kcal) synthesizes exactly one item.
        val body =
            mapOf(
                "summary" to "manual add",
                "meals" to
                    listOf(
                        mapOf(
                            "name" to "Late snack",
                            "time" to "22:00",
                            "items" to
                                listOf(
                                    mapOf(
                                        "name" to "Late snack",
                                        "quantity" to 1,
                                        "unit" to "serving",
                                        "nutritionPerUnit" to mapOf("kcal" to 320),
                                    ),
                                ),
                        ),
                    ),
            )
        post(body).expectStatus().isCreated
        val item = itemsOf(currentDoc())[0]
        assertThat(item["id"]).isEqualTo("it-1")
        assertThat(item["portion"]).isEqualTo(mapOf("min" to 0.0, "max" to 3.0, "step" to 1.0))
    }

    // ── BE-058: hand-built eating plans (contract 0.9.0 D1/D2/D3) ───────────

    private fun item(
        name: String,
        quantity: Int,
        unit: String,
        kcal: Int,
        estimated: Boolean,
    ) = mapOf(
        "name" to name,
        "quantity" to quantity,
        "unit" to unit,
        "kcal" to kcal,
        "kcalEstimated" to estimated,
    )

    /** The manual builder's "Finish setup" body, verbatim from backend-plan §1.1. */
    private fun handBuiltBody() =
        mapOf(
            "summary" to "5 meals, built by hand",
            "status" to "ready",
            "dailyTotals" to mapOf("kcal" to 2180),
            "meals" to
                listOf(
                    mapOf(
                        "name" to "Breakfast",
                        "time" to "07:00",
                        "kcal" to 465,
                        "items" to
                            listOf(
                                item("Oats", 60, "g", 235, estimated = true),
                                item("Egg", 2, "unit", 155, estimated = false),
                            ),
                    ),
                    // A named slot with no food yet — legal from 0.9.0 (D1).
                    mapOf("name" to "Supper", "time" to "21:30", "items" to emptyList<Any>()),
                ),
        )

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `a hand-built plan saves with ids, bounds and its empty meal preserved`() {
        post(handBuiltBody()).expectStatus().isCreated

        val meals = mealsOf(currentDoc())
        assertThat(meals.map { it["id"] }).containsExactly("m-1", "m-2")
        val items = meals[0]["items"] as List<Map<String, Any>>
        assertThat(items.map { it["id"] }).containsExactly("it-1", "it-2")
        assertThat(items[0]["portion"]).isEqualTo(mapOf("min" to 0.0, "max" to 120.0, "step" to 10.0))
        assertThat(items[1]["portion"]).isEqualTo(mapOf("min" to 0.0, "max" to 4.0, "step" to 1.0))
        // The empty meal survives as items: [] — not dropped, not rejected.
        assertThat(meals[1]["items"] as List<Any>).isEmpty()
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `per-item kcal and kcalEstimated come back exactly as sent`() {
        post(handBuiltBody()).expectStatus().isCreated

        val items = itemsOf(currentDoc())
        assertThat(items[0]["kcal"]).isEqualTo(235.0)
        assertThat(items[0]["kcalEstimated"]).isEqualTo(true)
        assertThat(items[1]["kcal"]).isEqualTo(155.0)
        assertThat(items[1]["kcalEstimated"]).isEqualTo(false)
        // The server computes no nutrition: it stamps ids/bounds and carries the rest through.
        assertThat(items[0]).doesNotContainKey("nutritionPerUnit")
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `PUT round-trips the ids and the kcal fields`() {
        post(handBuiltBody()).expectStatus().isCreated
        val stored = currentDoc()

        put(stored).expectStatus().isOk

        val meals = mealsOf(currentDoc())
        assertThat(meals.map { it["id"] }).containsExactly("m-1", "m-2")
        val items = meals[0]["items"] as List<Map<String, Any>>
        assertThat(items.map { it["id"] }).containsExactly("it-1", "it-2")
        assertThat(items[0]["kcal"]).isEqualTo(235.0)
        assertThat(items[0]["kcalEstimated"]).isEqualTo(true)
        assertThat(meals[1]["items"] as List<Any>).isEmpty()
    }

    @Test
    fun `a hand-built plan is born ready and never passes through review`() {
        post(handBuiltBody()).expectStatus().isCreated
        assertThat(currentDoc()["status"]).isEqualTo("ready")
        assertThat(history()).hasSize(1)
        assertThat(history().map { (it["doc"] as Map<*, *>)["status"] }).containsExactly("ready")
    }

    @Test
    fun `kcalEstimated without kcal is 400`() {
        val body =
            mapOf(
                "summary" to "no number to label",
                "meals" to listOf(mapOf("name" to "M", "items" to listOf(mapOf("name" to "Oats", "kcalEstimated" to true)))),
            )
        post(body).expectStatus().isBadRequest
    }

    @Test
    fun `negative kcal is 400`() {
        val body =
            mapOf(
                "summary" to "negative",
                "meals" to listOf(mapOf("name" to "M", "items" to listOf(mapOf("name" to "Oats", "kcal" to -5)))),
            )
        post(body).expectStatus().isBadRequest
    }

    @Suppress("UNCHECKED_CAST")
    private fun currentDoc(): Map<String, Any> =
        getCurrent()
            .expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    @Suppress("UNCHECKED_CAST")
    private fun summaryOf(version: Map<String, Any>) = (version["doc"] as Map<String, Any>)["summary"]

    // Scoped to this test's user — the class shares one DB across tests/users.
    private fun rowCount(table: String): Int? {
        val sql = "SELECT count(*) FROM $table WHERE user_id = ?"
        return jdbc.queryForObject(sql, Int::class.java, userId)
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
        val LIST = object : ParameterizedTypeReference<List<Map<String, Any>>>() {}
    }
}
