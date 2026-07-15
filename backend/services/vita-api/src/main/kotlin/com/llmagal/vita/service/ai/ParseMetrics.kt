package com.llmagal.vita.service.ai

import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

/**
 * Per-pipeline token/cost metrics for the parse pipeline (ADR-0005). This is the
 * counter the $10 Claude budget panel (devops OPS-015) reads later: input/output
 * token counts from the Claude usage block, tagged by outcome.
 *
 * ponytail: recorded against whatever MeterRegistry is wired (SimpleMeterRegistry
 * today, see AiConfig). OPS-015 swaps in a Prometheus registry + scrape endpoint;
 * this code is unchanged by that.
 */
@Component
class ParseMetrics(
    private val registry: MeterRegistry,
) {
    /** One parse run: always bumps the request counter, adds token counts when a response carried usage. */
    fun record(
        outcome: String,
        inputTokens: Int,
        outputTokens: Int,
    ) {
        registry.counter("vita.ai.parse.requests", "outcome", outcome).increment()
        if (inputTokens > 0) tokens("input", outcome, inputTokens)
        if (outputTokens > 0) tokens("output", outcome, outputTokens)
    }

    private fun tokens(
        direction: String,
        outcome: String,
        count: Int,
    ) = registry.counter("vita.ai.parse.tokens", "direction", direction, "outcome", outcome).increment(count.toDouble())
}
