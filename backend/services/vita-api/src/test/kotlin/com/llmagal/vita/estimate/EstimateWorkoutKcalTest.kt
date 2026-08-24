package com.llmagal.vita.estimate

import com.llmagal.vita.model.estimate.WorkoutExercise
import com.llmagal.vita.service.estimate.EstimatePrompts
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/**
 * BE-065 acceptance — POST /v1/estimate/workout-kcal (D9). One day in, one number out:
 * free whenever the catalog knows every name, one model call for the whole day when it
 * does not, and never a per-exercise fan-out.
 */
class EstimateWorkoutKcalTest : EstimateTestBase() {
    @Test
    fun `a day the catalog knows in full costs nothing`() {
        val kcal =
            service.workoutKcal(
                listOf(
                    WorkoutExercise("Squat", "set", 4, 8, null),
                    WorkoutExercise("Bench press", "set", 4, 8, null),
                    WorkoutExercise("Muay thai", "time", null, null, 30),
                ),
            )

        verifyModelCalls(0)
        assertThat(kcal % 5).isZero()
        assertThat(kcal).isBetween(150, 900)
    }

    @Test
    fun `whole-body minutes weigh more than the same minutes of sets`() {
        val thai = service.workoutKcal(listOf(WorkoutExercise("Muay thai", "time", null, null, 30)))
        val plank = service.workoutKcal(listOf(WorkoutExercise("Plank", "time", null, null, 30)))

        verifyModelCalls(0)
        assertThat(thai).isGreaterThan(plank)
        assertThat(listOf(thai, plank)).allSatisfy { assertThat(it % 5).isZero() }
    }

    @Test
    fun `one unknown name sends the whole day out in a single call, and that number wins`() {
        stubTool(EstimatePrompts.WORKOUT_TOOL_NAME, """{"kcal":412.4}""")

        val kcal =
            service.workoutKcal(
                listOf(
                    WorkoutExercise("Squat", "set", 4, 8, null),
                    WorkoutExercise("Pole dance", "time", null, null, 20),
                ),
            )

        verifyModelCalls(1)
        assertThat(kcal).isEqualTo(410)
        val body = lastRequestBody()
        assertThat(body).contains("Pole dance")
        assertThat(body).contains("Squat") // the whole session, not just the miss
        assertThat(body).contains("4x8")
    }

    @Test
    fun `a failed model leg falls back to the local estimate when anything resolved`() {
        stubFailure()

        val kcal =
            service.workoutKcal(
                listOf(
                    WorkoutExercise("Squat", "set", 4, 8, null),
                    WorkoutExercise("Pole dance", "time", null, null, 20),
                ),
            )

        assertThat(kcal % 5).isZero()
        assertThat(kcal).isGreaterThan(0)
    }

    @Test
    fun `nothing recognizable and a failed model leg is a 422`() {
        stubFailure()

        assertThatThrownBy { service.workoutKcal(listOf(WorkoutExercise("Zzyzx flow", null, null, null, 20))) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
            }
    }

    @Test
    fun `the family is derived when the caller does not state one`() {
        stubTool(EstimatePrompts.WORKOUT_TOOL_NAME, """{"kcal":100}""")

        service.workoutKcal(listOf(WorkoutExercise("Zzyzx flow", null, null, null, 25)))

        assertThat(lastRequestBody()).contains("25 min") // `min` present → the time family
    }
}
