package com.llmagal.vita

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

/**
 * Walking-skeleton smoke test against the real stack: Spring context, security
 * filter chain, real HTTP server, and a Testcontainers Postgres.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class SmokeTest {
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
    fun `health endpoint is public and reports up`() {
        client
            .get()
            .uri("/health")
            .exchange()
            .expectStatus()
            .isOk()
            .expectBody(MAP_OF_ANY)
            .value { assertThat(it).containsEntry("status", "up") }
    }

    @Test
    fun `me requires auth and returns 401 problem json`() {
        client
            .get()
            .uri("/v1/me")
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
            .expectHeader()
            .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
            .expectBody(MAP_OF_ANY)
            .value { assertThat(it).containsEntry("status", 401) }
    }

    @Test
    fun `database is reachable`() {
        assertThat(jdbc.queryForObject("SELECT 1", Int::class.java)).isEqualTo(1)
    }

    @Test
    fun `flyway baseline migration is applied`() {
        val tables =
            jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
                String::class.java,
            )
        assertThat(tables).contains("users", "user_keys", "log_entry", "flyway_schema_history")
    }

    @Test
    fun `C3 columns are bytea so they can never hold plaintext`() {
        // ADR-0003 enforcement: sensitive-content columns must be encrypted blobs.
        val types =
            jdbc.queryForList(
                """
                SELECT table_name || '.' || column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND column_name LIKE '%_enc' AND data_type = 'bytea'
                """.trimIndent(),
                String::class.java,
            )
        assertThat(types).containsExactlyInAnyOrder(
            "users.email_enc",
            "users.name_enc",
            "log_entry.source_phrase_enc",
            "log_entry.detail_enc",
            "magic_link_token.email_enc",
            "eating_plan.doc_enc",
            "training_program.doc_enc",
            "vacation.ranges_enc",
        )
    }

    companion object {
        private val MAP_OF_ANY = object : ParameterizedTypeReference<Map<String, Any>>() {}
    }
}
