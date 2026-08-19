package com.llmagal.vita

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.client.RestTestClient

/** BE-055: GET /v1/privacy is public HTML — a store reviewer opens it with no token. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class PrivacyPageTest {
    @LocalServerPort var port = 0

    @Test
    fun `serves the page as html without auth`() {
        val body =
            RestTestClient
                .bindToServer()
                .baseUrl("http://localhost:$port")
                .build()
                .get()
                .uri("/v1/privacy")
                .exchange()
                .expectStatus()
                .isOk
                .expectHeader()
                .contentTypeCompatibleWith(MediaType.TEXT_HTML)
                .expectBody(String::class.java)
                .returnResult()
                .responseBody!!

        assertThat(body).contains("Vita").contains("AES-256-GCM") // name + a real section, not an error page
    }
}
