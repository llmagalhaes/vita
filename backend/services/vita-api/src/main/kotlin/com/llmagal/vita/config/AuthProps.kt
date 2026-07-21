package com.llmagal.vita.config

import org.springframework.boot.context.properties.ConfigurationProperties

/** `vita.auth.*` — values in application.yaml; prod overrides via env vars (Secrets Manager). */
@ConfigurationProperties("vita.auth")
data class AuthProps(
    val jwtSecret: String,
    val accessTtlSeconds: Long,
    val refreshTtlDays: Long,
    val magicLinkBaseUrl: String,
    val publicBaseUrl: String,
    val rateLimitPerEmail: Int,
    val rateLimitPerIp: Int,
)
