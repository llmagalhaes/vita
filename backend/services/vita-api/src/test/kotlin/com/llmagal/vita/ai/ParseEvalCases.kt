package com.llmagal.vita.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties // annotations are shared across Jackson 2/3
import com.llmagal.vita.model.ai.ParseResponse
import org.assertj.core.api.Assertions.assertThat
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonObjectMapper
import tools.jackson.module.kotlin.readValue

/**
 * The versioned parse eval set (BE-014, ADR-0005): fixture inputs → expected shapes
 * and numeric tolerances, loaded from `/eval/parse-text-cases.json`. Shared by the
 * CI eval (golden Claude responses via WireMock) and the on-demand live-API eval so
 * both check the same expectations.
 */
object ParseEvalCases {
    private val mapper: ObjectMapper = jacksonObjectMapper()

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class Case(
        val name: String,
        val input: String,
        val expectTypes: List<String> = emptyList(),
        val expect422: Boolean = false,
        val kcalTotalMin: Int? = null,
        val kcalTotalMax: Int? = null,
        val golden: JsonNode? = null,
    ) {
        /** The golden Anthropic Messages response as a string, for stubbing WireMock in the CI eval. */
        fun goldenJson(): String = requireNotNull(golden) { "case '$name' has no golden response" }.toString()
    }

    fun load(): List<Case> {
        val stream =
            requireNotNull(javaClass.getResourceAsStream("/eval/parse-text-cases.json")) {
                "missing /eval/parse-text-cases.json"
            }
        return stream.use { mapper.readValue(it) }
    }

    /** Asserts a successful parse matches the case: server-filled fields, ordered types, and kcal tolerance. */
    fun assertShape(
        case: Case,
        response: ParseResponse,
    ) {
        assertThat(response.drafts.map { it.type })
            .describedAs(case.name)
            .isEqualTo(case.expectTypes)
        response.drafts.forEach { draft ->
            assertThat(draft.inputMethod).describedAs(case.name).isEqualTo("text")
            assertThat(draft.isEstimate).describedAs(case.name).isTrue()
            assertThat(draft.sourcePhrase).describedAs(case.name).isEqualTo(case.input)
            assertThat(draft.occurredAt).describedAs(case.name).isNotNull()
            assertThat(draft.detail).describedAs(case.name).isNotEmpty()
        }
        if (case.kcalTotalMin != null || case.kcalTotalMax != null) {
            val kcal = mealKcalTotal(response)
            case.kcalTotalMin?.let { assertThat(kcal).describedAs("${case.name} kcal").isGreaterThanOrEqualTo(it) }
            case.kcalTotalMax?.let { assertThat(kcal).describedAs("${case.name} kcal").isLessThanOrEqualTo(it) }
        }
    }

    private fun mealKcalTotal(response: ParseResponse): Int =
        response.drafts
            .filter { it.type == "meal" }
            .flatMap { (it.detail["items"] as? List<*>).orEmpty() }
            .filterIsInstance<Map<*, *>>()
            .sumOf { (it["kcal"] as? Number)?.toInt() ?: 0 }
}
