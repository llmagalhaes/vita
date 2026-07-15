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
