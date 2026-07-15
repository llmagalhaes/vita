package com.llmagal.vita.auth

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.get
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.TestcontainersConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
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
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.client.RestTestClient
import java.util.UUID

/**
 * BE-007 end-to-end: POST /v1/auth/oidc against a WireMock JWKS. Covers find-or-create
 * on (provider, subject), linking to an existing account by verified email, the
 * sign-in-cancels-deletion rule, Apple's first-sign-in name, and the 401/400 paths.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class OidcFlowTest {
    @Autowired
    lateinit var jwtDecoder: JwtDecoder

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @LocalServerPort
    var port = 0

    lateinit var client: RestTestClient

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
    }

    @Test
    fun `first Google sign-in creates a working account`() {
        val token = OidcTestTokens.idToken(subject = "g-new", email = "new@test.dev", name = "New Person")
        val pair = signIn("google", token)
        assertThat(pair).containsKeys("accessToken", "refreshToken")

        val userId = UUID.fromString(jwtDecoder.decode(pair["accessToken"] as String).subject)
        val me = me(pair["accessToken"] as String)
        assertThat(me["email"]).isEqualTo("new@test.dev")
        assertThat(me["name"]).isEqualTo("New Person")

        // Identity row links (provider, subject) → this user; no plaintext email at rest.
        val linked =
            jdbc.queryForObject(
                "SELECT user_id FROM oidc_identity WHERE provider='google' AND subject='g-new'",
                UUID::class.java,
            )
        assertThat(linked).isEqualTo(userId)
        val emailEnc = jdbc.queryForObject("SELECT email_enc FROM users WHERE id=?", ByteArray::class.java, userId)
        assertThat(String(emailEnc!!, Charsets.ISO_8859_1)).doesNotContain("new@test.dev")
    }

    @Test
    fun `signing in twice with the same subject lands on one account`() {
        val token = OidcTestTokens.idToken(subject = "g-repeat", email = "repeat@test.dev")
        val first = jwtDecoder.decode(signIn("google", token)["accessToken"] as String).subject
        val second = jwtDecoder.decode(signIn("google", token)["accessToken"] as String).subject
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun `a new provider identity links to an existing account by verified email`() {
        val email = "shared@test.dev"
        val google = signIn("google", OidcTestTokens.idToken(subject = "g-shared", email = email))
        val googleUser = jwtDecoder.decode(google["accessToken"] as String).subject

        val appleToken =
            OidcTestTokens.idToken(
                issuer = "https://appleid.apple.com",
                audience = "test-apple-client",
                subject = "a-shared",
                email = email,
                emailVerified = "true",
                name = null,
            )
        val apple = signIn("apple", appleToken)
        assertThat(jwtDecoder.decode(apple["accessToken"] as String).subject).isEqualTo(googleUser)

        // Two identity rows, one user.
        val users =
            jdbc.queryForList(
                "SELECT DISTINCT user_id FROM oidc_identity WHERE subject IN ('g-shared','a-shared')",
                UUID::class.java,
            )
        assertThat(users).hasSize(1)
    }

    @Test
    fun `sign-in cancels a pending account deletion`() {
        val token = OidcTestTokens.idToken(subject = "g-undelete", email = "undelete@test.dev")
        val userId = UUID.fromString(jwtDecoder.decode(signIn("google", token)["accessToken"] as String).subject)
        jdbc.update("UPDATE users SET deletion_requested_at = now() WHERE id = ?", userId)

        signIn("google", token)
        val pending =
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE id=? AND deletion_requested_at IS NOT NULL",
                Int::class.java,
                userId,
            )
        assertThat(pending).isZero()
    }

    @Test
    fun `Apple passes the name on first sign-in when the token omits it`() {
        val token =
            OidcTestTokens.idToken(
                issuer = "https://appleid.apple.com",
                audience = "test-apple-client",
                subject = "a-named",
                email = "named@test.dev",
                emailVerified = "true",
                name = null,
            )
        val pair = signInWithName("apple", token, "Ada Lovelace")
        assertThat(me(pair["accessToken"] as String)["name"]).isEqualTo("Ada Lovelace")
    }

    @Test
    fun `a token with an unverified email cannot create an account`() {
        val token = OidcTestTokens.idToken(subject = "g-unverified", email = "nope@test.dev", emailVerified = false)
        postOidc(mapOf("provider" to "google", "idToken" to token))
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `a forged token is a 401 problem`() {
        postOidc(mapOf("provider" to "google", "idToken" to OidcTestTokens.forgedToken()))
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
            .expectHeader()
            .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
    }

    @Test
    fun `an unknown provider is a 400`() {
        postOidc(mapOf("provider" to "facebook", "idToken" to "x"))
            .expectStatus()
            .isEqualTo(HttpStatus.BAD_REQUEST)
    }

    private fun signIn(
        provider: String,
        idToken: String,
    ): Map<String, Any> = exchange(mapOf("provider" to provider, "idToken" to idToken))

    private fun signInWithName(
        provider: String,
        idToken: String,
        name: String,
    ): Map<String, Any> = exchange(mapOf("provider" to provider, "idToken" to idToken, "name" to name))

    private fun exchange(body: Map<String, String>): Map<String, Any> =
        postOidc(body)
            .expectStatus()
            .isOk()
            .expectBody(MAP_OF_ANY)
            .returnResult()
            .responseBody!!

    private fun postOidc(body: Map<String, String>) =
        client
            .post()
            .uri("/v1/auth/oidc")
            .contentType(MediaType.APPLICATION_JSON)
            .body(body)
            .exchange()

    private fun me(accessToken: String): Map<String, Any> =
        client
            .get()
            .uri("/v1/me")
            .header("Authorization", "Bearer $accessToken")
            .exchange()
            .expectStatus()
            .isOk()
            .expectBody(MAP_OF_ANY)
            .returnResult()
            .responseBody!!

    companion object {
        private val MAP_OF_ANY = object : ParameterizedTypeReference<Map<String, Any>>() {}

        private val wm =
            WireMockServer(options().dynamicPort()).apply {
                start()
                stubFor(
                    get(urlEqualTo("/certs")).willReturn(
                        aResponse()
                            .withHeader("Content-Type", "application/json")
                            .withBody(OidcTestTokens.jwkSetJson()),
                    ),
                )
            }

        @JvmStatic
        @DynamicPropertySource
        fun oidcProps(registry: DynamicPropertyRegistry) {
            registry.add("vita.oidc.google.jwks-uri") { wm.baseUrl() + "/certs" }
            registry.add("vita.oidc.google.audience") { "test-google-client" }
            registry.add("vita.oidc.apple.jwks-uri") { wm.baseUrl() + "/certs" }
            registry.add("vita.oidc.apple.audience") { "test-apple-client" }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wm.stop()
        }
    }
}
