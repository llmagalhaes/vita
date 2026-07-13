package com.llmagal.vita.ai.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Per-user daily parse ceiling (abuse guard, ADR-0005). In-memory calendar-day
 * counter keyed by user, reset at UTC midnight: one API instance, ~5 users (CEO
 * sizing), no distributed limiter needed. Map size is bounded by the user count
 * (one entry per user, overwritten as the day rolls).
 * ponytail: move to a shared store only if the service ever scales out.
 */
@Component
class ParseQuota(
    @Value("\${vita.ai.daily-parse-limit:50}") private val dailyLimit: Int,
    private val clock: Clock,
) {
    private data class Day(
        val date: LocalDate,
        val count: Int,
    )

    private val counts = ConcurrentHashMap<UUID, Day>()

    /** Returns null when allowed, otherwise Retry-After seconds until UTC midnight. */
    fun tryAcquire(userId: UUID): Long? {
        val today = LocalDate.now(clock)
        val day =
            counts.compute(userId) { _, current ->
                if (current == null || current.date != today) Day(today, 1) else Day(today, current.count + 1)
            }!!
        return if (day.count > dailyLimit) secondsUntilUtcMidnight() else null
    }

    private fun secondsUntilUtcMidnight(): Long {
        val now = clock.instant()
        val nextMidnight =
            now
                .atZone(ZoneOffset.UTC)
                .toLocalDate()
                .plusDays(1)
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
        return Duration.between(now, nextMidnight).seconds.coerceAtLeast(1)
    }
}
