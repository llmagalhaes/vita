package com.llmagal.vita.plans

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
 * BE-020: training program — the mechanical mirror of the eating plan on the
 * same versioned-doc engine. Confirms the program path shares import / version /
 * edit-in-place / encryption behaviour; PlanFlowTest owns the exhaustive cases.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfig::class)
class ProgramFlowTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var crypto: CryptoService

    @Autowired lateinit var tokens: TokenService

    @LocalServerPort var port = 0

    lateinit var client: RestTestClient
    lateinit var token: String

    @BeforeEach
    fun setUp() {
        client = RestTestClient.bindToServer().baseUrl("http://localhost:$port").build()
        token = signInTestUser(jdbc, crypto, tokens, "lifter-${UUID.randomUUID()}@test.dev").accessToken
    }

    private fun programBody(summary: String) =
        mapOf(
            "summary" to summary,
            "splitDescription" to "Push / Pull / Legs",
            "days" to
                listOf(
                    mapOf(
                        "name" to "Day 1 - Push",
                        "exercises" to listOf(mapOf("name" to "Bench press", "sets" to 4, "reps" to 8)),
                    ),
                ),
        )

    private fun post(body: Any) =
        client
            .post()
            .uri("/v1/program")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer $token")
            .body(body)
            .exchange()

    private fun put(body: Any) =
        client
            .put()
            .uri("/v1/program")
            .contentType(MediaType.APPLICATION_JSON)
            .header("Authorization", "Bearer $token")
            .body(body)
            .exchange()

    private fun current() =
        client
            .get()
            .uri("/v1/program")
            .header("Authorization", "Bearer $token")
            .exchange()

    @Suppress("UNCHECKED_CAST")
    @Test
    fun `imports, versions, edits in place and reads back`() {
        post(programBody("Block 1")).expectStatus().isCreated
        post(programBody("Block 2")).expectStatus().isCreated
        put(programBody("Block 2 - deload")).expectStatus().isOk

        val versions =
            client
                .get()
                .uri("/v1/program/history")
                .header("Authorization", "Bearer $token")
                .exchange()
                .expectStatus()
                .isOk
                .expectBody(LIST)
                .returnResult()
                .responseBody!!
        // Two versions (edit replaced the newest, didn't add one); newest reflects the edit.
        assertThat(versions).hasSize(2)
        assertThat((versions[0]["doc"] as Map<String, Any>)["summary"]).isEqualTo("Block 2 - deload")

        val body =
            current()
                .expectStatus()
                .isOk
                .expectBody(MAP)
                .returnResult()
                .responseBody!!
        assertThat(body["summary"]).isEqualTo("Block 2 - deload")
        assertThat(body["days"] as List<Any>).hasSize(1)
    }

    @Test
    fun `rejects an empty program and requires auth`() {
        post(mapOf("summary" to "x", "days" to emptyList<Any>())).expectStatus().isBadRequest
        client
            .get()
            .uri("/v1/program")
            .exchange()
            .expectStatus()
            .isEqualTo(HttpStatus.UNAUTHORIZED)
    }

    @Test
    fun `program doc is encrypted at rest`() {
        post(programBody("Hypertrophy secret")).expectStatus().isCreated
        jdbc.queryForList("SELECT doc_enc FROM training_program").forEach { row ->
            val blob = String(row["doc_enc"] as ByteArray, Charsets.ISO_8859_1)
            assertThat(blob).doesNotContain("Hypertrophy secret")
            assertThat(blob).doesNotContain("Bench press")
        }
    }

    // ── BE-059: hand-built programs (contract 0.9.0 D4/D5/D6 + save-path normalization) ──

    /** The manual training builder's body, verbatim from backend-plan §1.2. */
    private fun handBuiltProgram() =
        mapOf(
            "summary" to "Gym + Muay thai",
            "days" to
                listOf(
                    mapOf(
                        "name" to "Day A",
                        "exercises" to
                            listOf(
                                mapOf(
                                    "name" to "Squat",
                                    "sets" to 4,
                                    "reps" to 8,
                                    "muscleRoles" to
                                        listOf(
                                            mapOf("name" to "quads", "role" to "primary"),
                                            mapOf("name" to "glutes", "role" to "primary"),
                                            mapOf("name" to "core", "role" to "secondary"),
                                        ),
                                ),
                                mapOf(
                                    "name" to "Muay thai",
                                    "durationMin" to 30,
                                    "wholeBody" to true,
                                    "muscleRoles" to
                                        listOf(
                                            mapOf("name" to "quads", "role" to "secondary"),
                                            mapOf("name" to "core", "role" to "secondary"),
                                        ),
                                ),
                                // Nothing matched and nothing guessed — "not mapped".
                                mapOf("name" to "Pole dance"),
                            ),
                    ),
                ),
        )

    @Suppress("UNCHECKED_CAST")
    private fun exercisesOf(doc: Map<String, Any>): List<Map<String, Any>> =
        (doc["days"] as List<Map<String, Any>>).flatMap { it["exercises"] as List<Map<String, Any>> }

    @Suppress("UNCHECKED_CAST")
    private fun currentDoc(): Map<String, Any> =
        current()
            .expectStatus()
            .isOk
            .expectBody(MAP)
            .returnResult()
            .responseBody!!

    @Test
    fun `a hand-built program round-trips durationMin, wholeBody and its muscle roles`() {
        post(handBuiltProgram()).expectStatus().isCreated

        val ex = exercisesOf(currentDoc())
        assertThat(ex.map { it["name"] }).containsExactly("Squat", "Muay thai", "Pole dance")
        assertThat(ex[0]["sets"]).isEqualTo(4)
        assertThat(ex[0]["reps"]).isEqualTo(8)
        assertThat(ex[0]["muscleRoles"]).isEqualTo(
            listOf(
                mapOf("name" to "quads", "role" to "primary"),
                mapOf("name" to "glutes", "role" to "primary"),
                mapOf("name" to "core", "role" to "secondary"),
            ),
        )
        assertThat(ex[1]["durationMin"]).isEqualTo(30)
        assertThat(ex[1]["wholeBody"]).isEqualTo(true)
        // A set-family exercise carries no durationMin, and vice versa (the family is derived).
        assertThat(ex[0]).doesNotContainKey("durationMin")
        assertThat(ex[1]).doesNotContainKey("sets")
    }

    @Test
    fun `an exercise nobody mapped stays unmapped`() {
        post(handBuiltProgram()).expectStatus().isCreated
        val poleDance = exercisesOf(currentDoc())[2]
        assertThat(poleDance).doesNotContainKey("muscles")
        assertThat(poleDance).doesNotContainKey("muscleRoles")
    }

    @Test
    fun `traps survives the save path instead of folding into back`() {
        val body =
            mapOf(
                "summary" to "pull day",
                "days" to
                    listOf(
                        mapOf(
                            "name" to "Day B",
                            "exercises" to
                                listOf(
                                    mapOf(
                                        "name" to "Face pull",
                                        "muscleRoles" to listOf(mapOf("name" to "traps", "role" to "primary")),
                                    ),
                                ),
                        ),
                    ),
            )
        post(body).expectStatus().isCreated
        val ex = exercisesOf(currentDoc())[0]
        assertThat(ex["muscles"]).isEqualTo(listOf("traps"))
        assertThat(ex["muscleRoles"]).isEqualTo(listOf(mapOf("name" to "traps", "role" to "primary")))
    }

    @Test
    fun `POST normalizes client muscles - unmappables dropped, aliases folded, dupes primary-wins`() {
        val body =
            mapOf(
                "summary" to "typo day",
                "days" to
                    listOf(
                        mapOf(
                            "name" to "Day C",
                            "exercises" to
                                listOf(
                                    mapOf(
                                        "name" to "Pulldown",
                                        "muscles" to listOf("lats", "spleen", "BACK"),
                                        "muscleRoles" to
                                            listOf(
                                                mapOf("name" to "lats", "role" to "secondary"),
                                                mapOf("name" to "lats", "role" to "primary"),
                                                mapOf("name" to "spleen", "role" to "primary"),
                                                mapOf("name" to "abs", "role" to "bogus"),
                                            ),
                                    ),
                                ),
                        ),
                    ),
            )
        post(body).expectStatus().isCreated
        val ex = exercisesOf(currentDoc())[0]
        assertThat(ex["muscles"]).isEqualTo(listOf("back")) // lats → back, "spleen" dropped, BACK deduped
        // One entry, primary winning over the earlier secondary; the invalid role is dropped.
        assertThat(ex["muscleRoles"]).isEqualTo(listOf(mapOf("name" to "back", "role" to "primary")))
    }

    @Test
    fun `PUT normalizes too, and durationMin below 1 is 400`() {
        post(handBuiltProgram()).expectStatus().isCreated
        val edited =
            mapOf(
                "summary" to "edited",
                "days" to
                    listOf(
                        mapOf(
                            "name" to "Day A",
                            "exercises" to
                                listOf(
                                    mapOf(
                                        "name" to "Row",
                                        "muscleRoles" to listOf(mapOf("name" to "obliques", "role" to "secondary")),
                                    ),
                                ),
                        ),
                    ),
            )
        put(edited).expectStatus().isOk
        assertThat(exercisesOf(currentDoc())[0]["muscleRoles"])
            .isEqualTo(listOf(mapOf("name" to "core", "role" to "secondary")))

        val zeroMinutes =
            mapOf(
                "summary" to "bad",
                "days" to listOf(mapOf("name" to "D", "exercises" to listOf(mapOf("name" to "Run", "durationMin" to 0)))),
            )
        post(zeroMinutes).expectStatus().isBadRequest
    }

    private companion object {
        val MAP = object : ParameterizedTypeReference<Map<String, Any>>() {}
        val LIST = object : ParameterizedTypeReference<List<Map<String, Any>>>() {}
    }
}
