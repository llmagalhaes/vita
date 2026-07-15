package com.llmagal.vita.service.jobs

import com.llmagal.vita.repository.jobs.Job
import com.llmagal.vita.repository.jobs.JobRepository
import com.llmagal.vita.service.account.AccountDeletionService
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

/**
 * In-process worker for the ADR-0007 queue. Polls, claims one due job at a time
 * with FOR UPDATE SKIP LOCKED, runs it, marks done — or, on failure, records the
 * attempt in a fresh transaction so a poisoned handler tx can't lose the count.
 *
 * ponytail: one job per transaction, single instance assumed. If throughput ever
 * needs batching or multiple instances, SKIP LOCKED already makes them safe.
 */
@Service
class JobWorker(
    private val repo: JobRepository,
    private val accountDeletion: AccountDeletionService,
    txManager: PlatformTransactionManager,
) {
    private val tx = TransactionTemplate(txManager)

    @Scheduled(fixedDelayString = "\${vita.jobs.poll-ms:60000}")
    fun poll() = runOnce()

    /** Drain every currently-due job. Returns when the queue has none left. */
    fun runOnce() {
        while (processNext()) {
            // keep draining
        }
    }

    /** @return true if a job was consumed (done or failed), false if none were due. */
    @Suppress("TooGenericExceptionCaught") // a worker must survive any handler error
    private fun processNext(): Boolean {
        var claimed: Job? = null
        return try {
            tx.execute {
                val job = repo.claimDue(1).firstOrNull() ?: return@execute false
                claimed = job
                handle(job)
                repo.markDone(job.id)
                true
            } == true
        } catch (e: Exception) {
            val job = claimed ?: throw e // failure in the claim itself — surface it
            tx.execute { repo.recordFailure(job.id, e.message ?: e.javaClass.simpleName, MAX_ATTEMPTS) }
            true
        }
    }

    private fun handle(job: Job) {
        when (job.type) {
            AccountDeletionService.JOB_TYPE ->
                accountDeletion.purge(UUID.fromString(job.payload.getValue("userId")))
            else -> error("Unknown job type: ${job.type}")
        }
    }

    private companion object {
        const val MAX_ATTEMPTS = 5
    }
}
