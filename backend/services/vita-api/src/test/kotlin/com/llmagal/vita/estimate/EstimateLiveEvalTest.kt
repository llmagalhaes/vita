package com.llmagal.vita.estimate

import com.llmagal.vita.TestcontainersConfig
import com.llmagal.vita.model.estimate.FoodKcalItem
import com.llmagal.vita.model.estimate.WorkoutExercise
import com.llmagal.vita.service.estimate.EstimateService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import kotlin.system.measureTimeMillis

/**
 * BE-061/063/065 live eval (≈ $0.01 the whole file). Runs the REAL production path — the
 * autowired service, the real seed, the real prompts, the real model — against the live
 * Anthropic API. Excluded from `check` (@Tag("live")); run on demand:
 *
 *   ./gradlew liveEval           (key from secrets.yaml or ANTHROPIC_API_KEY)
 *
 * Skips (does not fail) without a key, so an accidental run is a no-op. Both caches are
 * truncated first, so the model leg is genuinely exercised rather than replayed.
 */
@Tag("live")
@SpringBootTest
@Import(TestcontainersConfig::class)
class EstimateLiveEvalTest {
    @Autowired
    lateinit var service: EstimateService

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Autowired
    lateinit var env: Environment

    @BeforeEach
    fun requireKeyAndColdCache() {
        assumeTrue(env.getProperty("keys.anthropic").orEmpty().isNotBlank(), "No Anthropic key — skipping live eval")
        jdbc.update("TRUNCATE food_estimate_cache")
        jdbc.update("TRUNCATE exercise_estimate_cache")
    }

    @Test
    fun `four PT-BR foods, one of them a deliberate miss, come back in a sane band`() {
        val items =
            listOf(
                FoodKcalItem("Aveia", 60.0, "g"),
                FoodKcalItem("Pão francês", 1.0, "unit"),
                FoodKcalItem("Coxinha", 1.0, "unit"), // nothing in the table matches this bare word
                FoodKcalItem("Água", 500.0, "ml"),
            )

        lateinit var out: List<Int?>
        val millis = measureTimeMillis { out = service.foodKcal(items) }
        println("LIVE EVAL food-kcal -> $out in ${millis}ms")

        assertThat(millis).isLessThan(20_000)
        assertThat(out).hasSize(4).doesNotContainNull()
        assertThat(out.filterNotNull()).allSatisfy { assertThat(it % 5).isZero() }
        assertThat(out[0]).isBetween(180, 300) // 60 g of oats
        assertThat(out[1]).isBetween(100, 250) // one pão francês
        assertThat(out[2]).isBetween(150, 500) // one coxinha, from the model
        assertThat(out[3]).isEqualTo(5) // water is the floor, never a zero

        // Write-back: the miss is now free forever.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM food_estimate_cache", Int::class.java)).isGreaterThan(0)
        val cachedMillis = measureTimeMillis { assertThat(service.foodKcal(items)).isEqualTo(out) }
        println("LIVE EVAL food-kcal (cached) -> ${cachedMillis}ms")
        assertThat(cachedMillis).isLessThan(2_000)
    }

    @Test
    fun `a free-typed exercise gets a pale mapping or an honest nothing`() {
        val out = service.exerciseMuscles(listOf("Pole dance"))
        println("LIVE EVAL exercise-muscles -> ${out[0]}")

        assertThat(out).hasSize(1)
        assertThat(out[0].estimated).isTrue() // never mistaken for a catalog entry
        assertThat(out[0].muscleRoles.map { it.name }).isSubsetOf(com.llmagal.vita.model.Muscles.VOCAB)
        assertThat(out[0].muscleRoles.map { it.role }).allSatisfy { assertThat(it).isIn("primary", "secondary") }
    }

    @Test
    fun `a four-exercise hand-built day gets a sane energy figure`() {
        val day =
            listOf(
                WorkoutExercise("Squat", "set", 4, 8, null),
                WorkoutExercise("Bench press", "set", 4, 8, null),
                WorkoutExercise("Pole dance", "time", null, null, 20), // forces the model leg
                WorkoutExercise("Muay thai", "time", null, null, 30),
            )

        val kcal = service.workoutKcal(day)
        println("LIVE EVAL workout-kcal -> $kcal")

        assertThat(kcal % 5).isZero()
        assertThat(kcal).isBetween(150, 900)
    }
}
