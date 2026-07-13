package com.llmagal.vita.shared

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Ops-only liveness endpoint (outside the /v1 contract).
 * Checks the DB so the load balancer health check catches a dead pool.
 */
@RestController
class HealthController(
    private val jdbc: JdbcTemplate,
) {
    @GetMapping("/health")
    fun health(): Map<String, String> {
        jdbc.queryForObject("SELECT 1", Int::class.java)
        return mapOf("status" to "up")
    }
}
