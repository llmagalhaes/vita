package com.llmagal.vita.estimate

import com.llmagal.vita.model.estimate.FoodKcalItem
import com.llmagal.vita.service.estimate.EstimatePrompts
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/**
 * BE-061 acceptance — POST /v1/estimate/food-kcal, service side. The bar: the table leg
 * answers for free, the model is asked ONCE and only about what missed, and no answer ever
 * leaves unrounded.
 */
class EstimateFoodKcalTest : EstimateTestBase() {
    @Test
    fun `sixty items come back as sixty results in the same order`() {
        // Even = a seeded hit, odd = a name nothing knows and the model declines.
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[]}""")
        val items =
            (0 until 60).map { i ->
                if (i % 2 == 0) FoodKcalItem("Aveia", (i + 2).toDouble(), "g") else FoodKcalItem("Zzyzx $i", 1.0, "unit")
            }

        val out = service.foodKcal(items)

        assertThat(out).hasSize(60)
        assertThat(out.filterIndexed { i, _ -> i % 2 == 0 }).doesNotContainNull()
        assertThat(out.filterIndexed { i, _ -> i % 2 == 1 }).containsOnlyNulls()
        // Order intact: a larger quantity of the same food never comes back smaller.
        val hits = out.filterIndexed { i, _ -> i % 2 == 0 }.filterNotNull()
        assertThat(hits).isSorted
    }

    @Test
    fun `a pass the table answers in full makes zero outbound calls`() {
        val out =
            service.foodKcal(
                listOf(
                    FoodKcalItem("Aveia", 60.0, "g"),
                    FoodKcalItem("Pão francês", 1.0, "unit"),
                    FoodKcalItem("Arroz, tipo 1, cozido", 100.0, "g"),
                ),
            )

        assertThat(out).doesNotContainNull()
        assertThat(out[0]).isEqualTo(235)
        verifyModelCalls(0)
    }

    @Test
    fun `a mixed pass calls the model once, with only the missed names`() {
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":1,"kcal":283}]}""")

        val out = service.foodKcal(listOf(FoodKcalItem("Aveia", 60.0, "g"), FoodKcalItem("Coxinha", 1.0, "unit")))

        verifyModelCalls(1)
        val body = lastRequestBody()
        assertThat(body).contains("Coxinha")
        assertThat(body).doesNotContain("Aveia")
        assertThat(out).containsExactly(235, 285)
    }

    @Test
    fun `the same missed name is a miss exactly once`() {
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":1,"kcal":283}]}""")
        service.foodKcal(listOf(FoodKcalItem("Coxinha", 1.0, "unit")))
        wm.resetRequests()

        val again = service.foodKcal(listOf(FoodKcalItem("coxinha", 1.0, "unit")))

        verifyModelCalls(0) // the cache answered — write-back proof
        assertThat(again).containsExactly(285)
    }

    @Test
    fun `the cache holds a basis value, so any other quantity is priced from it`() {
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":1,"kcal":283}]}""")
        service.foodKcal(listOf(FoodKcalItem("Coxinha", 1.0, "unit")))
        wm.resetRequests()

        val three = service.foodKcal(listOf(FoodKcalItem("Coxinha", 3.0, "unit")))

        verifyModelCalls(0)
        assertThat(three).containsExactly(850) // 283 × 3 = 849 → 850
        assertThat(cache.foodKcal("coxinha", "unit")).isEqualTo(283)
    }

    @Test
    fun `every non-null answer is an integer multiple of five with a floor of five`() {
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":1,"kcal":0},{"n":2,"kcal":237.4}]}""")

        val out =
            service.foodKcal(
                listOf(
                    FoodKcalItem("Zzyzx water", 500.0, "ml"), // the model says 0 kcal per 100 ml
                    FoodKcalItem("Zzyzx bar", 1.0, "unit"),
                    FoodKcalItem("Aveia", 60.0, "g"),
                ),
            )

        assertThat(out.filterNotNull()).allSatisfy { assertThat(it % 5).isZero() }
        assertThat(out.filterNotNull()).allSatisfy { assertThat(it).isGreaterThanOrEqualTo(5) }
        assertThat(out[0]).isEqualTo(5) // a zero-energy drink is the floor, never a zero
        assertThat(out[1]).isEqualTo(235) // 237.4 → 237 per unit → rounded out at 235
    }

    @Test
    fun `a failed model leg keeps the table answers and nulls the rest`() {
        stubFailure()

        val out = service.foodKcal(listOf(FoodKcalItem("Aveia", 60.0, "g"), FoodKcalItem("Coxinha", 1.0, "unit")))

        assertThat(out).containsExactly(235, null)
    }

    @Test
    fun `a failed model leg with nothing from the table is a 422`() {
        stubFailure()

        assertThatThrownBy { service.foodKcal(listOf(FoodKcalItem("Coxinha", 1.0, "unit"))) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY)
            }
    }

    @Test
    fun `a model that answers nothing is a 200 of nulls, not a 422`() {
        // Review fix M4: 422 means the pass could not RUN (the leg failed and nothing else
        // answered). A model that succeeded and declined every line ran fine — the honest
        // answer is "no estimate", same as the exercise leg and the contract's wording.
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[]}""")

        assertThat(service.foodKcal(listOf(FoodKcalItem("Zzyzx bar", 1.0, "unit")))).containsOnlyNulls()
    }

    @Test
    fun `a pass with nothing askable in it is a 200 of nulls and never calls the model`() {
        val out = service.foodKcal(listOf(FoodKcalItem("Aveia", 0.0, "g"), FoodKcalItem("", 1.0, "unit")))

        verifyModelCalls(0)
        assertThat(out).containsOnlyNulls()
    }

    @Test
    fun `a plural unit and its singular share one cache row`() {
        // Review fix M5: "2 colheres" used to cache under "colheres" and "1 colher" under
        // "colher" — the same food asked twice, paid for twice.
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":1,"kcal":60}]}""")
        service.foodKcal(listOf(FoodKcalItem("Zzyzx paste", 2.0, "colheres")))
        wm.resetRequests()

        val single = service.foodKcal(listOf(FoodKcalItem("Zzyzx paste", 1.0, "colher")))

        verifyModelCalls(0)
        assertThat(single).containsExactly(60)
        assertThat(cache.foodKcal("zzyzx paste", "colher")).isEqualTo(60)
    }

    @Test
    fun `a model answer for a line nobody asked about is ignored`() {
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":9,"kcal":500},{"n":1,"kcal":283}]}""")

        val out = service.foodKcal(listOf(FoodKcalItem("Coxinha", 1.0, "unit")))

        assertThat(out).containsExactly(285)
    }

    @Test
    fun `an unconvertible unit still reaches the model as one of whatever was typed`() {
        stubTool(EstimatePrompts.FOOD_TOOL_NAME, """{"items":[{"n":1,"kcal":60}]}""")

        val out = service.foodKcal(listOf(FoodKcalItem("Zzyzx paste", 2.0, "colher")))

        assertThat(lastRequestBody()).contains("1 colher")
        assertThat(out).containsExactly(120)
        assertThat(cache.foodKcal("zzyzx paste", "colher")).isEqualTo(60)
    }
}
