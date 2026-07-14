package com.llmagal.vita.users

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
 * BE-009 contract check: GET/PATCH /v1/me. Decrypted profile, validation,
 * deletion-grace field, auth guard.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class MeFlowTest {
    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Autowired
    lateinit var crypto: CryptoService

    @Autowired
    lateinit var tokens: TokenService

    @LocalServerPort
    var port = 0

    lateinit var client: RestTestClient
    lateinit var userId: UUID
    lateinit var email: String
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        email = "profile-${UUID.randomUUID()}@test.dev"
        val user = signInTestUser(jdbc, crypto, tokens, email)
        userId = user.id
        token = user.accessToken
    }

    private fun getMe() =
        client
            .get()
            .uri("/v1/me")
            .header("Authorization", "Bearer $token")
            .exchange()

    private fun patch(body: Any) =
        client
            .patch()
            .uri("/v1/me")
            .header("Authorization", "Bearer $token")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .exchange()

    private fun me() =
        getMe()
            .expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    @Test
    fun `returns the decrypted profile`() {
        val me = me()
        assertThat(me["id"]).isEqualTo(userId.toString())
        assertThat(me["email"]).isEqualTo(email)
        assertThat(me["name"]).isEqualTo(email.substringBefore("@")) // placeholder from local-part
        assertThat(me["units"]).isEqualTo("metric")
        assertThat(me).containsKey("createdAt")
        assertThat(me).doesNotContainKey("deletionEffectiveAt")
    }

    @Test
    fun `updates name and units`() {
        patch(mapOf("name" to "Marina", "units" to "imperial"))
            .expectStatus()
            .isOk
        val me = me()
        assertThat(me["name"]).isEqualTo("Marina")
        assertThat(me["units"]).isEqualTo("imperial")
    }

    @Test
    fun `rejects empty patch, bad units and over-long name`() {
        patch(emptyMap<String, Any>()).expectStatus().isBadRequest
        patch(mapOf("units" to "furlongs")).expectStatus().isBadRequest
        patch(mapOf("name" to "x".repeat(101))).expectStatus().isBadRequest
    }

    @Test
    fun `exposes deletionEffectiveAt during the grace period`() {
        jdbc.update("UPDATE users SET deletion_requested_at = now() WHERE id = ?", userId)
        assertThat(me()["deletionEffectiveAt"]).isNotNull()
    }

    @Test
    fun `unauthenticated is 401`() {
        client
            .get()
            .uri("/v1/me")
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
