package com.llmagal.vita.ai

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.containing
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.auth.service.TokenService
import com.llmagal.vita.crypto.service.CryptoService
import com.llmagal.vita.signInTestUser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.core.ParameterizedTypeReference
import org.springframework.core.io.ByteArrayResource
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.client.RestTestClient
import org.springframework.util.LinkedMultiValueMap
import org.springframework.util.MultiValueMap
import java.util.UUID

/**
 * BE-018 — /parse/photo end to end over real HTTP: multipart parsing under Spring Boot 4 /
 * Jackson 3 (the flagged risk), the vision request reaching the model (WireMock, never the
 * live API), server-set fields (inputMethod=photo, isEstimate), and the 413/415/422/401
 * error paths. Proves the image is carried to the model as an `image` block and that the
 * response is the same ParseResult the app confirms — nothing persisted.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class PhotoParseFlowTest {
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
        wm.resetAll()
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        token = signInTestUser(jdbc, crypto, tokens, "eater-${UUID.randomUUID()}@test.dev").accessToken
    }

    private fun photoBody(
        bytes: ByteArray = SMALL_JPEG,
        filename: String = "plate.jpg",
        type: MediaType = MediaType.IMAGE_JPEG,
        caption: String? = "leftover pasta",
    ): MultiValueMap<String, Any> {
        val parts = LinkedMultiValueMap<String, Any>()
        val headers = HttpHeaders().apply { contentType = type }
        val file =
            object : ByteArrayResource(bytes) {
                override fun getFilename() = filename
            }
        parts.add("image", HttpEntity(file, headers))
        caption?.let { parts.add("caption", it) }
        return parts
    }

    private fun postPhoto(
        body: MultiValueMap<String, Any>,
        bearer: String? = token,
    ): RestTestClient.ResponseSpec {
        val spec =
            client
                .post()
                .uri("/v1/parse/photo")
                .contentType(MediaType.MULTIPART_FORM_DATA)
        if (bearer != null) spec.header("Authorization", "Bearer $bearer")
        return spec.body(body).exchange()
    }

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `a plate photo yields a meal draft and sends the image to the model`() {
        stubMessages(
            toolResponse(
                """
                {"drafts":[{"type":"meal","occurredAt":"2026-07-13T12:30:00Z",
                 "detail":{"title":"Pasta","items":[{"name":"Penne","kcal":520,"proteinG":18}]}}]}
                """.trimIndent(),
            ),
        )

        val body =
            postPhoto(photoBody())
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!

        val drafts = body["drafts"] as List<Map<String, Any>>
        assertThat(drafts).hasSize(1)
        assertThat(drafts[0]["type"]).isEqualTo("meal")
        assertThat(drafts[0]["inputMethod"]).isEqualTo("photo") // server-set
        assertThat(drafts[0]["isEstimate"]).isEqualTo(true)
        assertThat(drafts[0]["sourcePhrase"]).isEqualTo("leftover pasta") // caption carried through
        // The image reached the model as a native vision block, base64-encoded.
        wm.verify(
            postRequestedFor(urlEqualTo("/v1/messages"))
                .withRequestBody(containing("\"type\":\"image\""))
                .withRequestBody(containing("\"media_type\":\"image/jpeg\"")),
        )
    }

    @Test
    fun `an unrecognizable image is a 422`() {
        stubMessages(toolResponse("""{"drafts":[]}"""))

        postPhoto(photoBody(caption = null))
            .expectStatus()
            .isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT) // 422 (renamed from UNPROCESSABLE_ENTITY in Spring 7)
            .expectHeader()
            .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
    }

    @Test
    fun `an image over 5 MB is a 413`() {
        postPhoto(photoBody(bytes = ByteArray(FIVE_MB + 1)))
            .expectStatus()
            .isEqualTo(HttpStatus.CONTENT_TOO_LARGE) // 413 (renamed from PAYLOAD_TOO_LARGE in Spring 7)
            .expectHeader()
            .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
    }

    @Test
    fun `a non-image part is a 415`() {
        postPhoto(photoBody(filename = "note.txt", type = MediaType.TEXT_PLAIN))
            .expectStatus()
            .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
    }

    @Test
    fun `unauthenticated parse is a 401`() {
        postPhoto(photoBody(), bearer = null)
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    private fun stubMessages(responseJson: String) {
        wm.stubFor(post(urlEqualTo("/v1/messages")).willReturn(okJson(responseJson)))
    }

    private companion object {
        const val FIVE_MB = 5 * 1024 * 1024

        // A minimal valid JPEG (SOI + EOI markers); the model call is stubbed, so bytes need only be sent.
        val SMALL_JPEG = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xD9.toByte())

        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}

        val wm: WireMockServer = WireMockServer(options().dynamicPort()).apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun claudeBaseUrl(registry: DynamicPropertyRegistry) {
            registry.add("vita.ai.base-url") { wm.baseUrl() }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wm.stop()
        }

        fun toolResponse(input: String): String =
            """
            {"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-6",
             "stop_reason":"tool_use",
             "content":[{"type":"tool_use","id":"toolu_1","name":"record_log_entries","input":$input}]}
            """.trimIndent()
    }
}
