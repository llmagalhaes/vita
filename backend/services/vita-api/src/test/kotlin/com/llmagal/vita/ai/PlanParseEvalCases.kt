package com.llmagal.vita.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties // annotations are shared across Jackson 2/3
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonObjectMapper
import tools.jackson.module.kotlin.readValue

/**
 * The plan/program parse eval set (BE-039/BE-040): fixture inputs → golden Claude
 * responses loaded from `/eval/plan-parse-cases.json`. Shared by the CI eval
 * (golden responses via WireMock, [PlanParseEvalTest]) and the on-demand live twin
 * ([PlanParseLiveEvalTest], @Tag("live")). The 11-item golden mirrors the handoff
 * §1.2 EXAMPLE table — deterministic test input only, never product truth (CEO A4).
 */
object PlanParseEvalCases {
    private val mapper: ObjectMapper = jacksonObjectMapper()

    @JsonIgnoreProperties(ignoreUnknown = true)
    data class Case(
        val name: String,
        val kind: String,
        val input: String? = null,
        val golden: JsonNode,
    ) {
        fun goldenJson(): String = golden.toString()
    }

    fun load(): List<Case> {
        val stream =
            requireNotNull(javaClass.getResourceAsStream("/eval/plan-parse-cases.json")) {
                "missing /eval/plan-parse-cases.json"
            }
        return stream.use { mapper.readValue(it) }
    }

    fun byName(name: String): Case = load().first { it.name == name }
}
