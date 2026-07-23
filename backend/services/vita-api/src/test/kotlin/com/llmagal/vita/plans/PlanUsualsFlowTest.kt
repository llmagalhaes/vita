package com.llmagal.vita.plans

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.repository.plans.PlanTable
import com.llmagal.vita.service.auth.TokenService
import com.llmagal.vita.service.crypto.AadContext
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
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.client.RestTestClient
import java.util.UUID

/**
 * BE-043 §6.2 — v3 usual semantics (V3-D4/D9), plan status (V3-D3) and the portions null
 * guard (V3-D15), end to end (Testcontainers). Setting usualSwapIndex recomputes the item's
 * portion bounds from the swap's effective quantity/unit and resets only that item's overlay;
 * out-of-range usual indices are 400; a null portion value is 400 (was NPE→500).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class PlanUsualsFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var userId: UUID
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        val user = signInTestUser(jdbc, crypto, tokens, "usuals-${UUID.randomUUID()}@test.dev")
        userId = user.id
        token = user.accessToken
    }

    // it-1 Chicken 200 g with one countable swap (Fish, 1 unidade); it-2 Rice 100 g.
    private val seedMeals =
        listOf(
            mapOf(
                "name" to "Lunch",
                "items" to
                    listOf(
                        mapOf(
                            "name" to "Chicken",
                            "quantity" to 200,
                            "unit" to "g",
                            "swaps" to listOf(mapOf("name" to "Fish", "quantity" to 1, "unit" to "unidade")),
                        ),
                        mapOf("name" to "Rice", "quantity" to 100, "unit" to "g"),
                    ),
            ),
        )

    private fun seedPlan(status: String? = null): Map<String, Any> =
        buildMap {
            put("summary", "seed")
            put("meals", seedMeals)
            if (status != null) put("status", status)
        }

    // Full round-trip edit carrying ids + swaps; usualSwapIndex set on it-1 when idx != null.
    private fun editBody(usual: Int?): Map<String, Any?> =
        mapOf(
            "summary" to "seed",
            "meals" to
                listOf(
                    mapOf(
                        "name" to "Lunch",
                        "items" to
                            listOf(
                                mapOf(
                                    "name" to "Chicken",
                                    "id" to "it-1",
                                    "quantity" to 200,
                                    "unit" to "g",
                                    "swaps" to listOf(mapOf("name" to "Fish", "quantity" to 1, "unit" to "unidade")),
                                ).let { if (usual != null) it + ("usualSwapIndex" to usual) else it },
                                mapOf("name" to "Rice", "id" to "it-2", "quantity" to 100, "unit" to "g"),
                            ),
                    ),
                ),
        )

    private fun postPlan(body: Any) = send("POST", "/v1/plan", body)

    private fun putPlan(body: Any) = send("PUT", "/v1/plan", body)

    private fun putPortions(body: Map<String, Any?>) = send("PUT", "/v1/plan/portions", body)

    private fun send(
        method: String,
        uri: String,
        body: Any,
    ) = client
        .method(
            org.springframework.http.HttpMethod
                .valueOf(method),
        ).uri(uri)
        .header("Authorization", "Bearer $token")
        .contentType(MediaType.APPLICATION_JSON)
        .body(body)
        .exchange()

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
    private fun portionOf(id: String): Map<String, Any>? {
        val meals = currentDoc()["meals"] as List<Map<String, Any>>
        val item = meals.flatMap { it["items"] as List<Map<String, Any>> }.first { it["id"] == id }
        return item["portion"] as Map<String, Any>?
    }

    @Suppress("UNCHECKED_CAST")
    private fun portionsOverlay(): Map<String, Any>? = currentDoc()["portions"] as Map<String, Any>?

    @Test
    fun `setting a usual recomputes bounds from the swap and back`() {
        postPlan(seedPlan()).expectStatus().isCreated
        // Default: 200 g → step-10 bounds.
        assertThat(portionOf("it-1")).containsEntry("max", 400.0).containsEntry("step", 10.0)

        putPlan(editBody(usual = 0)).expectStatus().isOk
        // Effective is now the swap: 1 unidade → countable 0..3 step 1.
        assertThat(portionOf("it-1")).containsEntry("max", 3.0).containsEntry("step", 1.0)

        putPlan(editBody(usual = null)).expectStatus().isOk
        assertThat(portionOf("it-1")).containsEntry("max", 400.0).containsEntry("step", 10.0)
    }

    @Test
    fun `changing a usual resets that item's overlay but keeps untouched items`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 200, "it-2" to 50)).expectStatus().isOk

        putPlan(editBody(usual = 0)).expectStatus().isOk // it-1 effective qty/unit changed → reset
        val overlay = portionsOverlay()
        assertThat(overlay).containsOnlyKeys("it-2")
        assertThat(overlay!!["it-2"]).isEqualTo(50.0)
    }

    @Test
    fun `an out-of-range usualSwapIndex is a 400`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPlan(editBody(usual = 5)).expectStatus().isBadRequest
    }

    @Test
    fun `an out-of-range usualOptionIndex is a 400`() {
        val body =
            mapOf(
                "summary" to "opts",
                "meals" to
                    listOf(
                        mapOf(
                            "name" to "Lunch",
                            "items" to listOf(mapOf("name" to "Rice", "quantity" to 100, "unit" to "g")),
                            "options" to
                                listOf(
                                    mapOf(
                                        "name" to "Brunch",
                                        "items" to listOf(mapOf("name" to "Eggs", "quantity" to 2)),
                                    ),
                                ),
                            "usualOptionIndex" to 3, // only 1 option
                        ),
                    ),
            )
        postPlan(body).expectStatus().isBadRequest
    }

    @Test
    fun `a null portion value is a 400 not a 500`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to null)).expectStatus().isBadRequest
    }

    @Test
    fun `status defaults to ready and flips review to ready`() {
        postPlan(seedPlan()).expectStatus().isCreated
        assertThat(currentDoc()["status"]).isEqualTo("ready")

        putPlan(mapOf("summary" to "s", "status" to "review", "meals" to seedMeals)).expectStatus().isOk
        assertThat(currentDoc()["status"]).isEqualTo("review")

        putPlan(mapOf("summary" to "s", "status" to "ready", "meals" to seedMeals)).expectStatus().isOk
        assertThat(currentDoc()["status"]).isEqualTo("ready")
    }

    @Test
    fun `an invalid status is a 400`() {
        postPlan(seedPlan(status = "archived")).expectStatus().isBadRequest
    }

    @Test
    fun `a pre-0-7-0 doc without status reads back without the key`() {
        // Insert a legacy encrypted doc (no status key), exactly as PlanService would have stored it.
        val legacy = """{"summary":"old","meals":[{"name":"M","items":[{"name":"X"}]}]}"""
        val enc = crypto.encryptForUser(userId, AadContext.planDoc(PlanTable.EATING_PLAN.table), legacy.toByteArray())
        jdbc.update("INSERT INTO eating_plan (user_id, doc_enc) VALUES (?, ?)", userId, enc)
        assertThat(currentDoc()).doesNotContainKey("status")
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
