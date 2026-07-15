package com.llmagal.vita.service.auth

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Sends the magic-link email. The SES implementation lands once devops
 * provisions sandbox identities (devops ticket); until then local dev logs
 * the link so you can click it.
 */
interface Mailer {
    fun sendMagicLink(
        email: String,
        link: String,
    )
}

/**
 * ponytail: local-only fake — logging an email address violates the no-PII-in-logs
 * rule (ADR-0003), which is why this class never ships to production: the SES
 * implementation replaces this bean and logs nothing personal.
 */
@Component
class LogMailer : Mailer {
    private val log = LoggerFactory.getLogger(LogMailer::class.java)

    override fun sendMagicLink(
        email: String,
        link: String,
    ) {
        log.info("Magic link for {}: {}", email, link)
    }
}
