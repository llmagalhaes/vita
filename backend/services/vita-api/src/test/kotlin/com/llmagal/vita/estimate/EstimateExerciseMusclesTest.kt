package com.llmagal.vita.estimate

import com.llmagal.vita.service.estimate.EstimatePrompts
import com.llmagal.vita.service.estimate.EstimateService
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/**
 * BE-063 acceptance — POST /v1/estimate/exercise-muscles. The bar: a curated mapping is
 * never confused with a guessed one, and a guess is never invented.
 */
class EstimateExerciseMusclesTest : EstimateTestBase() {
    @Test
    fun `a catalog name answers for free and is not marked estimated`() {
        val out = service.exerciseMuscles(listOf("Squat"))

        verifyModelCalls(0)
        assertThat(out).hasSize(1)
        assertThat(out[0].estimated).isFalse()
        assertThat(out[0].muscleRoles.filter { it.role == "primary" }.map { it.name })
            .contains("quads", "glutes")
        assertThat(out[0].wholeBody).isFalse()
    }

    @Test
    fun `an unknown name costs one call, is cached, and comes back estimated`() {
        stubTool(
            EstimatePrompts.MUSCLE_TOOL_NAME,
            """{"items":[{"n":1,"wholeBody":true,"muscles":[{"name":"core","role":"secondary"}]}]}""",
        )

        val first = service.exerciseMuscles(listOf("Pole dance"))
        verifyModelCalls(1)
        assertThat(first[0].estimated).isTrue()
        assertThat(first[0].wholeBody).isTrue()
        assertThat(first[0].muscleRoles.map { it.name }).containsExactly("core")

        wm.resetRequests()
        val again = service.exerciseMuscles(listOf("pole dance"))

        verifyModelCalls(0) // cache write-back proof
        assertThat(again[0]).isEqualTo(first[0])
    }

    @Test
    fun `a model answer is folded onto the closed vocabulary before it leaves`() {
        stubTool(
            EstimatePrompts.MUSCLE_TOOL_NAME,
            """{"items":[{"n":1,"muscles":[{"name":"lats","role":"primary"},{"name":"abs","role":"secondary"}]}]}""",
        )

        val out = service.exerciseMuscles(listOf("Zzyzx pull"))

        assertThat(out[0].muscleRoles.map { it.name }).containsExactly("back", "core")
        // …and what is cached is already normalized, so the fold can never be skipped later.
        assertThat(cache.exercise("zzyzx pull")).contains("back").doesNotContain("lats")
    }

    @Test
    fun `an answer with nothing mappable stays not mapped rather than guessing`() {
        stubTool(
            EstimatePrompts.MUSCLE_TOOL_NAME,
            """{"items":[{"n":1,"muscles":[{"name":"soul","role":"primary"}]}]}""",
        )

        val out = service.exerciseMuscles(listOf("Zzyzx flow"))

        assertThat(out[0].muscleRoles).isEmpty()
        assertThat(out[0].estimated).isTrue()
    }

    @Test
    fun `results are positional and only the misses reach the model`() {
        stubTool(
            EstimatePrompts.MUSCLE_TOOL_NAME,
            """{"items":[{"n":1,"muscles":[{"name":"chest","role":"primary"}]}]}""",
        )

        val out = service.exerciseMuscles(listOf("Squat", "Zzyzx press", "Bench press"))

        assertThat(out).hasSize(3)
        assertThat(out.map { it.estimated }).containsExactly(false, true, false)
        val body = lastRequestBody()
        assertThat(body).contains("Zzyzx press")
        assertThat(body).doesNotContain("Squat")
    }

    @Test
    fun `a failed model leg with no catalog hit is a 422, but a hit keeps it a 200`() {
        stubFailure()

        assertThatThrownBy { service.exerciseMuscles(listOf("Zzyzx press")) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
            }

        val partial = service.exerciseMuscles(listOf("Squat", "Zzyzx press"))
        assertThat(partial[0].estimated).isFalse()
        assertThat(partial[1].muscleRoles).isEmpty()
    }

    @Test
    fun `the output budget covers a 60-miss batch's worst-case answer`() {
        // Review fix M2: the budget was a flat 1024 and a batch this size needs ~5k output
        // tokens, so the answer came back TRUNCATED — unparseable, and the whole pass empty.
        // Worst case per exercise: six roles plus wholeBody, at a conservative 3 chars/token.
        val worstAnswer =
            """{"n":60,"wholeBody":true,"muscles":[""" +
                (1..6).joinToString(",") { """{"name":"hamstrings","role":"secondary"}""" } + "]}"
        val worstCase = 60 * Math.ceilDiv(worstAnswer.length, 3)

        assertThat(EstimateService.budget(60)).isGreaterThanOrEqualTo(worstCase)
        // …and the configured ceiling does not clamp it back under that.
        assertThat(CEILING).isGreaterThanOrEqualTo(worstCase)
        // A one-line pass still asks for a sane minimum, not 96 tokens.
        assertThat(EstimateService.budget(1)).isGreaterThanOrEqualTo(512)

        // …and it is what actually goes on the wire, not the old flat config value.
        stubTool(EstimatePrompts.MUSCLE_TOOL_NAME, """{"items":[]}""")
        service.exerciseMuscles((1..30).map { "Zzyzx $it" })
        assertThat(lastRequestBody()).contains(""""max_tokens":${EstimateService.budget(30)}""")
    }

    private companion object {
        /** `vita.ai.estimate-max-output-tokens` in application.yaml, and EstimateTestBase's. */
        const val CEILING = 8192
    }
}
