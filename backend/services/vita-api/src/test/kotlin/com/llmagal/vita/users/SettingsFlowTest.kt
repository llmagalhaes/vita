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
 * BE-056: the settings blob (GET/PUT /v1/me/settings) — empty object before the
 * first write, last-write-wins, encrypted opaque blob at rest, non-object and
 * oversize rejected, never visible across users.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class SettingsFlowTest {
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
        val user = newUser()
        userId = user.first
        token = user.second
    }

    private fun newUser(): Pair<UUID, String> {
        val user = signInTestUser(jdbc, crypto, tokens, "set-${UUID.randomUUID()}@test.dev")
        return user.id to user.accessToken
    }

    private fun get(bearer: String? = token): RestTestClient.ResponseSpec {
        val spec = client.get().uri("/v1/me/settings")
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.exchange()
    }

    private fun put(
        body: Any,
        bearer: String? = token,
    ): RestTestClient.ResponseSpec {
        val spec = client.put().uri("/v1/me/settings").contentType(MediaType.APPLICATION_JSON)
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.body(body).exchange()
    }

    private fun RestTestClient.ResponseSpec.blob(): Map<String, Any> =
        expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    @Test
    fun `defaults to an empty object before the first write`() {
        assertThat(get().blob()).isEmpty()
    }

    @Test
    fun `PUT round-trips and echoes what was stored`() {
        val settings = mapOf("recapStartHour" to 20, "habits" to listOf(mapOf("id" to "h1", "label" to "Stretch")))
        assertThat(put(settings).blob()).isEqualTo(settings)
        assertThat(get().blob()).isEqualTo(settings)
    }

    @Test
    fun `last write wins - no merge`() {
        put(mapOf("recapStartHour" to 20, "keepPhotos" to true)).expectStatus().isOk
        val second = mapOf("recapStartHour" to 7)
        put(second).expectStatus().isOk
        assertThat(get().blob()).isEqualTo(second) // the dropped key is gone, not merged
    }

    @Test
    fun `a non-object body is a 400`() {
        put(listOf(1, 2, 3)).expectStatus().isBadRequest
        put(42).expectStatus().isBadRequest
    }

    @Test
    fun `an oversize blob is a 400`() {
        put(mapOf("blob" to "x".repeat(70_000))).expectStatus().isBadRequest
        assertThat(get().blob()).isEmpty() // rejected before it was stored
    }

    @Test
    fun `settings are encrypted at rest and isolated per user`() {
        put(mapOf("secretHabit" to "midnight-snack")).expectStatus().isOk
        val stored =
            jdbc.queryForObject("SELECT settings_enc FROM user_settings WHERE user_id = ?", ByteArray::class.java, userId)!!
        assertThat(String(stored, Charsets.ISO_8859_1)).doesNotContain("midnight-snack")

        val (_, otherToken) = newUser()
        assertThat(get(bearer = otherToken).blob()).isEmpty()
    }

    @Test
    fun `unauthenticated is 401`() {
        get(bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
        put(emptyMap<String, Any>(), bearer = null).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
