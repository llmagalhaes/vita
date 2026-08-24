package com.llmagal.vita.estimate

import com.llmagal.vita.controller.estimate.EstimateController
import com.llmagal.vita.model.estimate.ExerciseMusclesRequest
import com.llmagal.vita.model.estimate.FoodKcalItem
import com.llmagal.vita.model.estimate.FoodKcalRequest
import com.llmagal.vita.model.estimate.FoodKcalResponse
import com.llmagal.vita.model.estimate.WorkoutExercise
import com.llmagal.vita.model.estimate.WorkoutKcalRequest
import com.llmagal.vita.service.ai.ParseQuota
import com.llmagal.vita.service.estimate.EstimateService
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/**
 * BE-061/063/065 — the boundary the service never sees: list sizes, name sanity, and the
 * EXISTING daily parse ceiling. No DB and no model here on purpose.
 */
class EstimateControllerTest {
    private val service = mockk<EstimateService>()
    private val quota = ParseQuota(1, Clock.fixed(Instant.parse("2026-08-24T12:00:00Z"), ZoneOffset.UTC))
    private val controller = EstimateController(service, quota)

    private val jwt =
        Jwt
            .withTokenValue("t")
            .header("alg", "HS256")
            .subject(UUID.randomUUID().toString())
            .build()

    private fun oneItem() = FoodKcalRequest(listOf(FoodKcalItem("Aveia", 60.0, "g")))

    @Test
    fun `an empty list is a 400`() {
        assertBadRequest { controller.foodKcal(jwt, FoodKcalRequest(emptyList())) }
        assertBadRequest { controller.foodKcal(jwt, FoodKcalRequest(null)) }
        assertBadRequest { controller.exerciseMuscles(jwt, ExerciseMusclesRequest(emptyList())) }
        assertBadRequest { controller.workoutKcal(jwt, WorkoutKcalRequest(emptyList())) }
    }

    @Test
    fun `more than sixty entries is a 400`() {
        val items = (1..61).map { FoodKcalItem("Aveia", 60.0, "g") }
        assertBadRequest { controller.foodKcal(jwt, FoodKcalRequest(items)) }
        assertBadRequest { controller.exerciseMuscles(jwt, ExerciseMusclesRequest((1..61).map { "Squat" })) }
    }

    @Test
    fun `a blank or oversized name is a 400`() {
        assertBadRequest { controller.foodKcal(jwt, FoodKcalRequest(listOf(FoodKcalItem("  ", 1.0, "g")))) }
        assertBadRequest {
            controller.foodKcal(jwt, FoodKcalRequest(listOf(FoodKcalItem("x".repeat(101), 1.0, "g"))))
        }
        assertBadRequest { controller.workoutKcal(jwt, WorkoutKcalRequest(listOf(WorkoutExercise(null, null, 3, 10, null)))) }
    }

    @Test
    fun `under the ceiling returns the positional results`() {
        every { service.foodKcal(any()) } returns listOf(235)

        val response = controller.foodKcal(jwt, oneItem())

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat((response.body as FoodKcalResponse).items.map { it.kcal }).containsExactly(235)
    }

    @Test
    fun `over the daily parse ceiling returns 429 with Retry-After`() {
        every { service.foodKcal(any()) } returns listOf(235)

        controller.foodKcal(jwt, oneItem()) // consumes the single allowed call
        val response = controller.foodKcal(jwt, oneItem())

        assertThat(response.statusCode).isEqualTo(HttpStatus.TOO_MANY_REQUESTS)
        assertThat(response.headers.getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo((12 * 60 * 60L).toString())
        assertThat((response.body as ProblemDetail).status).isEqualTo(HttpStatus.TOO_MANY_REQUESTS.value())
    }

    private fun assertBadRequest(call: () -> Unit) {
        assertThatThrownBy { call() }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
            }
    }
}
