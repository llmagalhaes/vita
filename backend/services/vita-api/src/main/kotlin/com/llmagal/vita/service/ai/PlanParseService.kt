package com.llmagal.vita.service.ai

import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.model.ai.TrainingProgramDraft
import com.llmagal.vita.service.uploads.FileStore
import com.llmagal.vita.service.uploads.UnknownFileRefException
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import java.util.Base64

/**
 * Stateless plan/program parse (BE-015, ADR-0011): a described plan or an uploaded
 * PDF (read via [FileStore]) in, a structured draft out — nothing persisted (ADR-0005).
 * Text uses a Haiku-class model; PDF uses a model with native document input. Unusable
 * or empty output is a 422; an unknown/expired fileRef is a 422. Reuses [ParseMetrics]
 * for token/cost counters (BE-014) — no separate metric.
 */
@Service
class PlanParseService(
    private val client: ClaudeClient,
    private val fileStore: FileStore,
    private val metrics: ParseMetrics,
    @param:Value("\${vita.ai.plan-model:claude-haiku-4-5}") private val planModel: String,
    @param:Value("\${vita.ai.plan-pdf-model:claude-sonnet-4-6}") private val planPdfModel: String,
) {
    fun parseEatingPlan(request: PlanImportRequest): EatingPlanDraft =
        parse(
            request,
            ParseSpec(
                system = PlanPrompts.EATING_PLAN_SYSTEM,
                tool = PlanPrompts.EATING_PLAN_TOOL,
                toolName = PlanPrompts.EATING_PLAN_TOOL_NAME,
                type = EatingPlanDraft::class.java,
                label = "an eating plan",
                usable = { it.meals.isNotEmpty() },
            ),
        )

    fun parseTrainingProgram(request: PlanImportRequest): TrainingProgramDraft =
        parse(
            request,
            ParseSpec(
                system = PlanPrompts.TRAINING_PROGRAM_SYSTEM,
                tool = PlanPrompts.TRAINING_PROGRAM_TOOL,
                toolName = PlanPrompts.TRAINING_PROGRAM_TOOL_NAME,
                type = TrainingProgramDraft::class.java,
                label = "a training program",
                usable = { it.days.isNotEmpty() },
            ),
        )

    private data class ParseSpec<T : Any>(
        val system: String,
        val tool: Map<String, Any>,
        val toolName: String,
        val type: Class<T>,
        val label: String,
        val usable: (T) -> Boolean,
    )

    private fun <T : Any> parse(
        request: PlanImportRequest,
        spec: ParseSpec<T>,
    ): T {
        val (model, content) = resolve(request)
        val result =
            try {
                client.callTool(model, spec.system, spec.tool, spec.toolName, content, spec.type)
            } catch (e: RestClientException) {
                metrics.record("error", 0, 0)
                throw e
            }
        val draft = result.value?.takeIf(spec.usable)
        // Tokens were spent whatever the shape of the output — record before the 422 branch.
        metrics.record(
            outcome = if (draft == null) "uninterpretable" else "success",
            inputTokens = result.usage.inputTokens,
            outputTokens = result.usage.outputTokens,
        )
        return draft ?: unprocessable("The input could not be interpreted as ${spec.label}.")
    }

    /** Picks the model and Messages-API content blocks for text vs a native-PDF fileRef. */
    private fun resolve(request: PlanImportRequest): Pair<String, List<Map<String, Any?>>> =
        when {
            request.text != null ->
                planModel to listOf(mapOf("type" to "text", "text" to "<plan>\n${request.text}\n</plan>"))
            request.fileRef != null -> planPdfModel to pdfContent(request.fileRef)
            else -> unprocessable("Exactly one of text or fileRef is required.")
        }

    private fun pdfContent(fileRef: String): List<Map<String, Any?>> {
        val bytes =
            try {
                fileStore.read(fileRef)
            } catch (_: UnknownFileRefException) {
                unprocessable("The fileRef is unknown or expired.")
            }
        val data = Base64.getEncoder().encodeToString(bytes)
        return listOf(
            mapOf(
                "type" to "document",
                "source" to mapOf("type" to "base64", "media_type" to "application/pdf", "data" to data),
            ),
            mapOf("type" to "text", "text" to "Parse the attached plan document."),
        )
    }

    private fun unprocessable(message: String): Nothing =
        throw ResponseStatusException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            message,
        )
}
