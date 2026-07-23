package com.llmagal.vita.service.ai

import com.llmagal.vita.model.ai.PlanImportRequest
import com.llmagal.vita.repository.plans.JobState
import com.llmagal.vita.repository.plans.PlanParseJob
import com.llmagal.vita.repository.plans.PlanParseJobRepository
import com.llmagal.vita.service.plans.PlanService
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

/** Poll response for GET /parse/eating-plan/jobs/{id} (contract: state + optional failureReason). */
data class JobStatusResponse(
    val state: String,
    val failureReason: String? = null,
)

/**
 * Async eating-plan import (BE-044, V3-D2/D12). `accept` inserts a running job row and hands
 * the parse to the background [PlanImportWorker]; `poll` reports the row, marking a job that
 * has been running past the stale window as failed (an instance died mid-parse — the user
 * re-imports). One running import per user (a second POST → 409).
 */
@Service
class PlanImportService(
    private val jobs: PlanParseJobRepository,
    private val worker: PlanImportWorker,
    @param:Value("\${vita.ai.plan-job-stale-minutes:15}") private val staleMinutes: Long,
) {
    /** Insert a running job and kick off the background parse. 409 if one is already running. */
    fun accept(
        userId: UUID,
        request: PlanImportRequest,
    ): UUID {
        jobs.newest(userId)?.let { active ->
            if (active.state == JobState.running && !isStale(active)) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "An import is already running: ${active.id}")
            }
        }
        val jobId = UUID.randomUUID()
        jobs.insertRunning(jobId, userId)
        worker.run(jobId, userId, request)
        return jobId
    }

    /** The owner's job state; a running-but-stale job is flipped to failed and reported so. */
    fun poll(
        userId: UUID,
        jobId: UUID,
    ): JobStatusResponse {
        val job = jobs.find(jobId, userId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        if (job.state == JobState.running && isStale(job)) {
            jobs.markState(jobId, JobState.failed, STALE_REASON)
            return JobStatusResponse(JobState.failed.name, STALE_REASON)
        }
        return JobStatusResponse(job.state.name, job.failure)
    }

    private fun isStale(job: PlanParseJob): Boolean =
        Duration.between(job.updatedAt.toInstant(), OffsetDateTime.now().toInstant()).toMinutes() >= staleMinutes

    private companion object {
        const val STALE_REASON = "The import timed out — try again."
    }
}

/**
 * The background parse (BE-044). Parses the plan on the async knobs (16k tokens / minutes-long
 * timeout, V3-D13), then SAVES it as a new eating-plan version with status "review" — the
 * imported-but-unreviewed state is persistent (V3-D2). Failures become a fixed, human-safe
 * phrase on the job row; the real cause is logged, never surfaced.
 *
 * ponytail: in-process @Async, no durable retry — instance death → stale→failed, user re-imports.
 */
@Service
class PlanImportWorker(
    private val parse: PlanParseService,
    private val plans: PlanService,
    private val jobs: PlanParseJobRepository,
) {
    private val log = LoggerFactory.getLogger(PlanImportWorker::class.java)

    @Async("planParseExecutor")
    @Suppress("TooGenericExceptionCaught") // any failure must become a job "failed" state, never escape the worker
    fun run(
        jobId: UUID,
        userId: UUID,
        request: PlanImportRequest,
    ) {
        try {
            val draft = parse.parseEatingPlan(request) // 422→ResponseStatusException; upstream→RestClientException
            plans.importPlan(userId, draft.copy(status = "review"))
            jobs.markState(jobId, JobState.done)
        } catch (e: ResponseStatusException) {
            val reason = if (e.reason?.contains("fileRef") == true) UNKNOWN_FILE else UNREADABLE
            log.warn("plan import job {} failed (unusable): {}", jobId, e.reason)
            jobs.markState(jobId, JobState.failed, reason)
        } catch (e: Exception) {
            // upstream/model/DB failure — generic phrase, real cause logged
            log.warn("plan import job {} failed", jobId, e)
            jobs.markState(jobId, JobState.failed, GENERIC)
        }
    }

    private companion object {
        const val UNREADABLE = "The document could not be read as an eating plan."
        const val UNKNOWN_FILE = "The uploaded file is unknown or expired."
        const val GENERIC = "The import could not be completed — please try again."
    }
}
