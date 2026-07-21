package com.llmagal.vita.auth

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.service.auth.Mailer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.core.ParameterizedTypeReference
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.web.servlet.client.RestTestClient
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * BE-006 + BE-008 end-to-end: magic-link request/verify, token pair, refresh
 * rotation with reuse detection, sign-out, rate limiting, no-plaintext-at-rest.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    // The per-IP limiter would trip across tests (everything is 127.0.0.1 here).
    properties = ["vita.auth.rate-limit-per-ip=1000"],
)
@Import(TestcontainersConfig::class, AuthFlowTest.RecordingMailerConfig::class)
class AuthFlowTest {
    class RecordingMailer : Mailer {
        val links = ConcurrentLinkedQueue<String>()

        override fun sendMagicLink(
            email: String,
            link: String,
        ) {
            links.add(link)
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    class RecordingMailerConfig {
        @Bean
        @Primary
        fun recordingMailer() = RecordingMailer()
    }

    @Autowired
    lateinit var mailer: RecordingMailer

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

    private fun requestLink(email: String): String {
        client
            .post()
            .uri("/v1/auth/magic-link")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("email" to email))
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.ACCEPTED)
        return mailer.links.poll()!!
    }

    private fun verify(token: String): Map<String, Any> =
        client
            .post()
            .uri("/v1/auth/magic-link/verify")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("token" to token))
            .exchange()
            .expectStatus()
            .isOk()
            .expectBody(MAP_OF_ANY)
            .returnResult()
            .responseBody!!

    private fun signIn(email: String): Map<String, Any> = verify(requestLink(email).substringAfter("?token="))

    @Test
    fun `full magic-link flow issues a working token pair`() {
        val pair = signIn("flow@test.dev")
        assertThat(pair).containsKeys("accessToken", "refreshToken")
        assertThat(pair["expiresIn"]).isEqualTo(900)

        // Access token is a valid JWT whose subject is the user id.
        val jwt = jwtDecoder.decode(pair["accessToken"] as String)
        val userId = UUID.fromString(jwt.subject)

        // The resource server accepts it on a protected route (/v1/me is a
        // BE-009 stub that 500s — the point is it no longer 401s).
        client
            .get()
            .uri("/v1/me")
            .header("Authorization", "Bearer ${pair["accessToken"]}")
            .exchange()
            .expectStatus()
            .value { assertThat(it).isNotEqualTo(HttpStatus.UNAUTHORIZED.value()) }

        // Account was created with placeholder name and no plaintext at rest.
        val emailEnc = jdbc.queryForObject("SELECT email_enc FROM users WHERE id = ?", ByteArray::class.java, userId)
        assertThat(String(emailEnc!!, Charsets.ISO_8859_1)).doesNotContain("flow@test.dev")
        val rawTokenRows = jdbc.queryForList("SELECT email_enc FROM magic_link_token", ByteArray::class.java)
        rawTokenRows.forEach { assertThat(String(it, Charsets.ISO_8859_1)).doesNotContain("flow@test.dev") }
    }

    @Test
    fun `magic-link email carries an https link to the redirect endpoint`() {
        val link = requestLink("httpslink@test.dev")
        assertThat(link).startsWith("https://")
        assertThat(link).contains("/v1/auth/link?token=")
    }

    @Test
    fun `link redirect bounces to the app scheme, serves html fallback, and passes the token through untouched`() {
        // A JDK client that does NOT follow redirects (the Location is a custom scheme the browser,
        // not this client, resolves). Token carries +,/,= so URL-encoding round-trips are exercised.
        val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
        val uri = URI.create("http://localhost:$port/v1/auth/link?token=a%2Bb%2Fc%3Dd")
        val res = http.send(HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofString())

        assertThat(res.statusCode()).isEqualTo(302)
        // Token decoded to a+b/c=d, re-encoded into the app-scheme query untouched.
        assertThat(res.headers().firstValue("Location")).hasValue("vita://auth?token=a%2Bb%2Fc%3Dd")
        assertThat(res.body()).contains("<a href=\"vita://auth?token=a%2Bb%2Fc%3Dd\"")
        assertThat(res.body()).contains("Open this on the phone with Vita installed")
    }

    @Test
    fun `magic-link token is single use`() {
        val token = requestLink("singleuse@test.dev").substringAfter("?token=")
        verify(token)
        client
            .post()
            .uri("/v1/auth/magic-link/verify")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("token" to token))
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
            .expectHeader()
            .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
    }

    @Test
    fun `signing in twice lands on the same account`() {
        val first = jwtDecoder.decode(signIn("repeat@test.dev")["accessToken"] as String).subject
        val second = jwtDecoder.decode(signIn("repeat@test.dev")["accessToken"] as String).subject
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun `sign-in cancels a pending account deletion`() {
        val userId = UUID.fromString(jwtDecoder.decode(signIn("undelete@test.dev")["accessToken"] as String).subject)
        jdbc.update("UPDATE users SET deletion_requested_at = now() WHERE id = ?", userId)
        signIn("undelete@test.dev")
        val pending =
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE id = ? AND deletion_requested_at IS NOT NULL",
                Int::class.java,
                userId,
            )
        assertThat(pending).isZero()
    }

    @Test
    fun `refresh rotates and reuse revokes the whole family`() {
        val pair = signIn("rotate@test.dev")
        val oldRefresh = pair["refreshToken"] as String

        val rotated =
            refresh(oldRefresh)
                .expectStatus()
                .isOk()
                .expectBody(MAP_OF_ANY)
                .returnResult()
                .responseBody!!
        val newRefresh = rotated["refreshToken"] as String
        assertThat(newRefresh).isNotEqualTo(oldRefresh)

        // Reusing the rotated token → 401 and the family dies with it.
        refresh(oldRefresh).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
        refresh(newRefresh).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `sign-out revokes and is idempotent`() {
        val refreshToken = signIn("signout@test.dev")["refreshToken"] as String
        signOut(refreshToken).expectStatus().isEqualTo(HttpStatus.NO_CONTENT)
        signOut(refreshToken).expectStatus().isEqualTo(HttpStatus.NO_CONTENT)
        refresh(refreshToken).expectStatus().isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `magic-link requests are rate limited per email`() {
        repeat(3) { requestLink("limited@test.dev") }
        client
            .post()
            .uri("/v1/auth/magic-link")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("email" to "limited@test.dev"))
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
            .expectHeader()
            .exists("Retry-After")
    }

    @Test
    fun `invalid email is a 400 problem`() {
        client
            .post()
            .uri("/v1/auth/magic-link")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("email" to "not-an-email"))
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.BAD_REQUEST)
    }

    private fun refresh(refreshToken: String) =
        client
            .post()
            .uri("/v1/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("refreshToken" to refreshToken))
            .exchange()

    private fun signOut(refreshToken: String) =
        client
            .post()
            .uri("/v1/auth/sign-out")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("refreshToken" to refreshToken))
            .exchange()

    companion object {
        private val MAP_OF_ANY = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
