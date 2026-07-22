package com.llmagal.vita.service.ai

import com.llmagal.vita.model.Muscles
import com.llmagal.vita.model.ai.EatingPlanDraft
import com.llmagal.vita.model.ai.MicrosPerUnit
import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.model.ai.TrainingProgramDraft
import com.llmagal.vita.service.plans.PortionBoundsHeuristic
import com.llmagal.vita.service.uploads.FileStore
import com.llmagal.vita.service.uploads.UnknownFileRefException
import org.slf4j.LoggerFactory
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
    private val log = LoggerFactory.getLogger(PlanParseService::class.java)

    /**
     * Decorates every item with server-authoritative portion bounds (never the model)
     * and drops any negative micro estimate the model produced (garbage, not a clamp).
     * Parse responses carry no ids — ids are assigned at save time (BE-037/A2).
     */
    fun parseEatingPlan(request: PlanImportRequest): EatingPlanDraft =
        decoratePlan(
            parse(
                request,
                ParseSpec(
                    system = PlanPrompts.EATING_PLAN_SYSTEM,
                    tool = PlanPrompts.EATING_PLAN_TOOL,
                    toolName = PlanPrompts.EATING_PLAN_TOOL_NAME,
                    type = EatingPlanDraft::class.java,
                    label = "an eating plan",
                    kind = "eating",
                    usable = { it.meals.isNotEmpty() },
                ),
            ),
        )

    fun parseTrainingProgram(request: PlanImportRequest): TrainingProgramDraft =
        decorateProgram(
            parse(
                request,
                ParseSpec(
                    system = PlanPrompts.TRAINING_PROGRAM_SYSTEM,
                    tool = PlanPrompts.TRAINING_PROGRAM_TOOL,
                    toolName = PlanPrompts.TRAINING_PROGRAM_TOOL_NAME,
                    type = TrainingProgramDraft::class.java,
                    label = "a training program",
                    kind = "training",
                    usable = { it.days.isNotEmpty() },
                ),
            ),
        )

    /** Normalize every exercise's muscles + roles onto the shared vocabulary (BE-040). */
    private fun decorateProgram(draft: TrainingProgramDraft): TrainingProgramDraft =
        draft.copy(
            days =
                draft.days.map { day ->
                    day.copy(
                        exercises =
                            day.exercises?.map { ex ->
                                val n = Muscles.normalize(ex.muscles, ex.muscleRoles)
                                ex.copy(muscles = n.muscles, muscleRoles = n.muscleRoles)
                            },
                    )
                },
        )

    private fun decoratePlan(draft: EatingPlanDraft): EatingPlanDraft =
        draft.copy(
            meals =
                draft.meals.map { meal ->
                    meal.copy(
                        items =
                            meal.items.map { item ->
                                item.copy(
                                    portion = PortionBoundsHeuristic.of(item.quantity, item.unit),
                                    microsPerUnit = item.microsPerUnit?.let(::sanitizeMicros),
                                )
                            },
                    )
                },
        )

    /** Coerce negative per-unit micros to null (drop); return null when nothing survives. */
    private fun sanitizeMicros(m: MicrosPerUnit): MicrosPerUnit? {
        fun nonNeg(v: Double?) = v?.takeIf { it >= 0 }
        val s = MicrosPerUnit(nonNeg(m.fiberG), nonNeg(m.sodiumMg), nonNeg(m.ironMg), nonNeg(m.calciumMg))
        return s.takeIf { it.fiberG != null || it.sodiumMg != null || it.ironMg != null || it.calciumMg != null }
    }

    private data class ParseSpec<T : Any>(
        val system: String,
        val tool: Map<String, Any>,
        val toolName: String,
        val type: Class<T>,
        val label: String,
        val kind: String,
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
                log.info("parse plan={} outcome=error inputTokens=0 outputTokens=0", spec.kind)
                throw e
            }
        val draft = result.value?.takeIf(spec.usable)
        // Tokens were spent whatever the shape of the output — record before the 422 branch.
        metrics.record(
            outcome = if (draft == null) "uninterpretable" else "success",
            inputTokens = result.usage.inputTokens,
            outputTokens = result.usage.outputTokens,
        )
        // One INFO line per parse: the token counters are otherwise trapped in the in-memory
        // SimpleMeterRegistry — this is what makes parse cost observable in CloudWatch (devops §5).
        log.info(
            "parse plan={} outcome={} inputTokens={} outputTokens={}",
            spec.kind,
            if (draft == null) "error" else "ok",
            result.usage.inputTokens,
            result.usage.outputTokens,
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
