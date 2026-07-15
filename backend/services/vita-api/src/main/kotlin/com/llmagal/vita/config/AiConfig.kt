package com.llmagal.vita.config

import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

/**
 * Beans the parse guardrails need (BE-014). No Spring Boot actuator in this
 * service, so no MeterRegistry is auto-configured — provide the minimal one.
 * ConditionalOnMissingBean lets OPS-015 replace it with a Prometheus registry
 * without touching this file.
 */
@Configuration
class AiConfig {
    @Bean
    @ConditionalOnMissingBean(MeterRegistry::class)
    fun meterRegistry(): MeterRegistry = SimpleMeterRegistry()

    @Bean
    @ConditionalOnMissingBean(Clock::class)
    fun utcClock(): Clock = Clock.systemUTC()
}
