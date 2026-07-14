package com.llmagal.vita.auth.service

import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Fixed-window in-memory rate limiter. Per-instance and unbounded by design:
 * one API instance, ~5 users (CEO sizing), and no IPs at rest per ADR-0003.
 * ponytail: move to a shared store only if the service ever scales out.
 */
class RateLimiter(
    private val max: Int,
    private val window: Duration,
) {
    private data class Window(
        val start: Instant,
        val count: Int,
    )

    private val windows = ConcurrentHashMap<String, Window>()

    /** Returns null when allowed, otherwise seconds until the window resets. */
    fun tryAcquire(key: String): Long? {
        val now = Instant.now()
        val w =
            windows.compute(key) { _, current ->
                if (current == null || current.start.plus(window).isBefore(now)) {
                    Window(now, 1)
                } else {
                    Window(current.start, current.count + 1)
                }
            }!!
        return if (w.count > max) {
            Duration.between(now, w.start.plus(window)).seconds.coerceAtLeast(1)
        } else {
            null
        }
    }
}
