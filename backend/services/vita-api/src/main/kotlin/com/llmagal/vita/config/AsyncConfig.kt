package com.llmagal.vita.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import java.util.concurrent.Executor

/**
 * The @Async executor for the eating-plan import worker (BE-044, V3-D2/D12). A tiny fixed
 * pool caps concurrent Claude spend — each running import is a multi-minute Sonnet call.
 * ponytail: in-process pool, no durable queue; an instance dying mid-parse leaves a stale
 * row that the poll endpoint reports as failed (the user re-imports).
 */
@Configuration
@EnableAsync
class AsyncConfig {
    @Bean("planParseExecutor")
    fun planParseExecutor(): Executor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = POOL_SIZE
            maxPoolSize = POOL_SIZE
            queueCapacity = QUEUE_CAPACITY
            setThreadNamePrefix("plan-parse-")
            initialize()
        }

    private companion object {
        const val POOL_SIZE = 2 // caps concurrent Claude spend
        const val QUEUE_CAPACITY = 20
    }
}
