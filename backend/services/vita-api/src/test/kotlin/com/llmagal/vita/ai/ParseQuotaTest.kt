package com.llmagal.vita.ai

import com.llmagal.vita.service.ai.ParseQuota
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** BE-014 — the per-user daily parse ceiling: limit boundary, Retry-After, per-user + day-rollover isolation. */
class ParseQuotaTest {
    private val noon = Instant.parse("2026-07-13T12:00:00Z")

    private fun quotaAt(
        now: Instant,
        limit: Int = 3,
    ) = ParseQuota(limit, Clock.fixed(now, ZoneOffset.UTC))

    @Test
    fun `allows up to the limit then returns Retry-After`() {
        val quota = quotaAt(noon, limit = 3)
        val user = UUID.randomUUID()

        assertThat(quota.tryAcquire(user)).isNull()
        assertThat(quota.tryAcquire(user)).isNull()
        assertThat(quota.tryAcquire(user)).isNull()

        val retryAfter = quota.tryAcquire(user)
        assertThat(retryAfter).isNotNull()
        // Noon UTC → 12h to next midnight.
        assertThat(retryAfter).isEqualTo(12 * 60 * 60L)
    }

    @Test
    fun `counts are isolated per user`() {
        val quota = quotaAt(noon, limit = 1)
        val a = UUID.randomUUID()
        val b = UUID.randomUUID()

        assertThat(quota.tryAcquire(a)).isNull()
        assertThat(quota.tryAcquire(a)).isNotNull() // a is now over
        assertThat(quota.tryAcquire(b)).isNull() // b unaffected
    }

    @Test
    fun `a new UTC day resets the count on the same instance`() {
        var instant = noon
        val clock =
            object : Clock() {
                override fun instant() = instant

                override fun getZone() = ZoneOffset.UTC

                override fun withZone(zone: java.time.ZoneId) = this
            }
        val quota = ParseQuota(1, clock)
        val user = UUID.randomUUID()

        assertThat(quota.tryAcquire(user)).isNull()
        assertThat(quota.tryAcquire(user)).isNotNull() // over for day one

        instant = noon.plusSeconds(24 * 60 * 60L) // next UTC day
        assertThat(quota.tryAcquire(user)).isNull() // reset
    }
}
