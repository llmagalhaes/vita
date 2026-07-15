package com.llmagal.vita.users

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
 * BE-025: vacation ranges (GET/PUT /v1/me/vacations) — replace-on-write, empty
 * array by default, encrypted opaque blob at rest, non-array rejected.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class VacationFlowTest {
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
        val user = signInTestUser(jdbc, crypto, tokens, "vac-${UUID.randomUUID()}@test.dev")
        userId = user.id
        token = user.accessToken
    }

    private fun get(bearer: String? = token): RestTestClient.ResponseSpec {
        val spec = client.get().uri("/v1/me/vacations")
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.exchange()
    }

    private fun put(
        body: Any,
        bearer: String? = token,
    ): RestTestClient.ResponseSpec {
        val spec =
            client
                .put()
                .uri("/v1/me/vacations")
                .contentType(MediaType.APPLICATION_JSON)
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.body(body).exchange()
    }

    @Test
    fun `defaults to an empty array`() {
        val ranges =
            get()
                .expectStatus()
                .isOk
                .expectBody(LIST)
                .returnResult()
                .responseBody!!
        assertThat(ranges).isEmpty()
    }

    @Test
    fun `PUT replaces on write and GET reads it back`() {
        val first = listOf(mapOf("start" to "2026-08-01", "end" to "2026-08-10"))
        put(first).expectStatus().isOk

        val second =
            listOf(
                mapOf("start" to "2026-12-20", "end" to "2026-12-31"),
                mapOf("start" to "2027-01-02", "end" to "2027-01-05"),
            )
        val echoed =
            put(second)
                .expectStatus()
                .isOk
                .expectBody(LIST)
                .returnResult()
                .responseBody!!
        assertThat(echoed).hasSize(2)

        val stored =
            get()
                .expectStatus()
                .isOk
                .expectBody(LIST)
                .returnResult()
                .responseBody!!
        assertThat(stored).isEqualTo(second) // replace-on-write, not append
    }

    @Test
    fun `a non-array body is a 400`() {
        put(mapOf("start" to "2026-08-01")).expectStatus().isBadRequest
    }

    @Test
    fun `ranges are encrypted at rest`() {
        put(listOf(mapOf("start" to "2026-08-01", "end" to "2026-08-10"))).expectStatus().isOk
        val blob =
            jdbc.queryForObject(
                "SELECT ranges_enc FROM vacation WHERE user_id = ?",
                ByteArray::class.java,
                userId,
            )!!
        assertThat(String(blob, Charsets.ISO_8859_1)).doesNotContain("2026-08-01")
    }

    @Test
    fun `unauthenticated is 401`() {
        get(bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
        put(emptyList<Any>(), bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    private companion object {
        val LIST = object : ParameterizedTypeReference<List<Map<String, Any>>>() {}
    }
}
