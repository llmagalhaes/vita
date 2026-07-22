package com.llmagal.vita.plans

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.service.account.AccountDeletionService
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
 * BE-038 — the eating-plan portion overlay: PUT /v1/plan/portions store/replace,
 * clamp+snap, unknown-id 422, bad-value 400, no-plan 404, empty-clear, GET /plan
 * attachment, reset-on-new-version, and the CEO-A5 per-item edit prune.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class PlanPortionsFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var deletion: AccountDeletionService

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var userId: UUID
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        val user = signInTestUser(jdbc, crypto, tokens, "portions-${UUID.randomUUID()}@test.dev")
        userId = user.id
        token = user.accessToken
    }

    /** Three g-unit items → ids it-1/it-2/it-3, each with step-10 bounds. */
    private fun seedPlan(
        q1: Int = 180,
        q2: Int = 200,
        q3: Int = 100,
    ) = mapOf(
        "summary" to "seed",
        "meals" to
            listOf(
                mapOf(
                    "name" to "Lunch",
                    "items" to
                        listOf(
                            mapOf("name" to "Chicken", "quantity" to q1, "unit" to "g"), // it-1: 0..2*q1 step 10
                            mapOf("name" to "Rice", "quantity" to q2, "unit" to "g"), // it-2
                            mapOf("name" to "Salad", "quantity" to q3, "unit" to "g"), // it-3
                        ),
                ),
            ),
    )

    private fun postPlan(body: Any) =
        client
            .post()
            .uri("/v1/plan")
            .header("Authorization", "Bearer $token")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .exchange()

    private fun putPlan(body: Any) =
        client
            .put()
            .uri("/v1/plan")
            .header("Authorization", "Bearer $token")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .exchange()

    private fun putPortions(
        body: Map<String, Any>,
        bearer: String? = token,
    ) = client
        .put()
        .uri("/v1/plan/portions")
        .apply { if (bearer != null) header("Authorization", "Bearer $bearer") }
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

    private fun portionsOf(): Map<String, Any>? {
        @Suppress("UNCHECKED_CAST")
        return currentDoc()["portions"] as Map<String, Any>?
    }

    private fun rowCount(): Int? = jdbc.queryForObject(ROW_COUNT_SQL, Int::class.java, userId)

    @Test
    fun `PUT stores the overlay and GET attaches it`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 200, "it-3" to 50)).expectStatus().isOk

        val portions = portionsOf()!!
        assertThat(portions["it-1"]).isEqualTo(200.0)
        assertThat(portions["it-3"]).isEqualTo(50.0)
        assertThat(portions).doesNotContainKey("it-2")
    }

    @Test
    fun `PUT is idempotent and a changed body fully replaces`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 200)).expectStatus().isOk
        putPortions(mapOf("it-1" to 200)).expectStatus().isOk
        assertThat(portionsOf()).containsOnlyKeys("it-1")

        // A body without it-1 drops it — full replace, not merge.
        putPortions(mapOf("it-2" to 100)).expectStatus().isOk
        assertThat(portionsOf()).containsOnlyKeys("it-2")
    }

    @Test
    fun `clamp above max and snap off-step`() {
        postPlan(seedPlan(q1 = 180)).expectStatus().isCreated // it-1: 0..360 step 10
        putPortions(mapOf("it-1" to 500, "it-2" to 187)).expectStatus().isOk

        val portions = portionsOf()!!
        assertThat(portions["it-1"]).isEqualTo(360.0) // clamped to max
        assertThat(portions["it-2"]).isEqualTo(190.0) // 187 snapped to step 10
    }

    @Test
    fun `unknown itemId is 422 and nothing is applied`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 100, "it-99" to 5)).expectStatus().isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT)
        assertThat(portionsOf()).isNull() // whole request rejected
    }

    @Test
    fun `negative value and too many keys are 400`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to -5)).expectStatus().isBadRequest
        putPortions((1..201).associate { "it-$it" to 1 }).expectStatus().isBadRequest
    }

    @Test
    fun `no current plan is 404`() {
        putPortions(mapOf("it-1" to 100)).expectStatus().isEqualTo(HttpStatus.NOT_FOUND)
    }

    @Test
    fun `empty map clears the overlay and GET omits portions`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 100)).expectStatus().isOk
        assertThat(rowCount()).isEqualTo(1)

        putPortions(emptyMap()).expectStatus().isOk
        assertThat(rowCount()).isZero()
        assertThat(portionsOf()).isNull()
    }

    @Test
    fun `overlay resets when a new version is imported`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 100)).expectStatus().isOk
        assertThat(rowCount()).isEqualTo(1)

        postPlan(seedPlan()).expectStatus().isCreated // new version
        assertThat(rowCount()).isZero()
        assertThat(portionsOf()).isNull()
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `A5 edit prunes removed and reset edited items but keeps untouched`() {
        postPlan(seedPlan(q1 = 180, q2 = 200, q3 = 100)).expectStatus().isCreated
        putPortions(mapOf("it-1" to 200, "it-2" to 100, "it-3" to 50)).expectStatus().isOk

        // Edit: remove it-3, change it-1's quantity, leave it-2 untouched (same qty/unit).
        val edited =
            mapOf(
                "summary" to "edited",
                "meals" to
                    listOf(
                        mapOf(
                            "name" to "Lunch",
                            // it-1 quantity changed (override resets), it-2 untouched (override kept).
                            "items" to
                                listOf(
                                    mapOf("name" to "Chicken", "id" to "it-1", "quantity" to 220, "unit" to "g"),
                                    mapOf("name" to "Rice", "id" to "it-2", "quantity" to 200, "unit" to "g"),
                                ),
                        ),
                    ),
            )
        putPlan(edited).expectStatus().isOk

        val portions = portionsOf()
        assertThat(portions).containsOnlyKeys("it-2") // it-3 pruned (removed), it-1 reset (edited)
        assertThat(portions!!["it-2"]).isEqualTo(100.0)
    }

    @Test
    fun `account purge cascades the overlay row via the plain FK`() {
        postPlan(seedPlan()).expectStatus().isCreated
        putPortions(mapOf("it-1" to 100)).expectStatus().isOk
        assertThat(rowCount()).isEqualTo(1)

        deletion.requestDeletion(userId)
        jdbc.update("UPDATE users SET deletion_requested_at = now() - interval '8 days' WHERE id = ?", userId)
        deletion.purge(userId)

        assertThat(rowCount()).isZero() // plaintext row gone via ON DELETE CASCADE (no crypto-shred)
    }

    private companion object {
        const val ROW_COUNT_SQL = "SELECT count(*) FROM plan_portions WHERE user_id = ?"
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
