package com.llmagal.vita.controller.estimate

import com.llmagal.vita.controller.ai.tooManyRequests
import com.llmagal.vita.model.estimate.ExerciseMusclesRequest
import com.llmagal.vita.model.estimate.ExerciseMusclesResponse
import com.llmagal.vita.model.estimate.FoodKcalRequest
import com.llmagal.vita.model.estimate.FoodKcalResponse
import com.llmagal.vita.model.estimate.FoodKcalResult
import com.llmagal.vita.model.estimate.WorkoutKcalRequest
import com.llmagal.vita.model.estimate.WorkoutKcalResponse
import com.llmagal.vita.service.ai.ParseQuota
import com.llmagal.vita.service.estimate.EstimateService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * The three estimation endpoints (contract v0.9.0, D7/D8/D9): items in, numbers out, nothing
 * about the user stored and nothing about the user's plan touched.
 *
 * Auth is the resource server's (bearer JWT). The abuse cap is the EXISTING per-user daily
 * parse ceiling — one estimate pass counts as one parse (over it: 429 + Retry-After, the same
 * body /parse/text returns). No second limiter: the batching plus the write-back cache already
 * bound the model spend to fractions of a cent per pass (ADR-0020 §2.6).
 */
@RestController
class EstimateController(
    private val service: EstimateService,
    private val quota: ParseQuota,
) {
    @PostMapping("/v1/estimate/food-kcal")
    fun foodKcal(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: FoodKcalRequest,
    ): ResponseEntity<Any> {
        val items = sized(body.items, "items")
        items.forEach { name(it.name) }
        quota.tryAcquire(uid(jwt))?.let { return tooManyRequests(it) }
        return ResponseEntity.ok(FoodKcalResponse(service.foodKcal(items).map(::FoodKcalResult)))
    }

    @PostMapping("/v1/estimate/exercise-muscles")
    fun exerciseMuscles(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: ExerciseMusclesRequest,
    ): ResponseEntity<Any> {
        val names = sized(body.names, "names").map { name(it) }
        quota.tryAcquire(uid(jwt))?.let { return tooManyRequests(it) }
        return ResponseEntity.ok(ExerciseMusclesResponse(service.exerciseMuscles(names)))
    }

    @PostMapping("/v1/estimate/workout-kcal")
    fun workoutKcal(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: WorkoutKcalRequest,
    ): ResponseEntity<Any> {
        val day = sized(body.exercises, "exercises")
        day.forEach { name(it.name) }
        quota.tryAcquire(uid(jwt))?.let { return tooManyRequests(it) }
        return ResponseEntity.ok(WorkoutKcalResponse(service.workoutKcal(day)))
    }

    /** 0 or more than [MAX_ITEMS] → 400; a longer list is two passes behind the same progress box. */
    private fun <T> sized(
        list: List<T>?,
        field: String,
    ): List<T> {
        if (list.isNullOrEmpty()) badRequest("$field must contain at least one entry.")
        if (list.size > MAX_ITEMS) badRequest("$field must contain at most $MAX_ITEMS entries.")
        return list
    }

    private fun name(raw: String?): String {
        val value = raw?.trim().orEmpty()
        if (value.isEmpty()) badRequest("name is required.")
        if (value.length > MAX_NAME) badRequest("name must be at most $MAX_NAME characters.")
        return value
    }

    private fun uid(jwt: Jwt): UUID = UUID.fromString(jwt.subject)

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_ITEMS = 60
        const val MAX_NAME = 100
    }
}
