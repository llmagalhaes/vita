package com.llmagal.vita.service.auth

import org.slf4j.LoggerFactory

/**
 * Sends the magic-link email. [SesMailer] does the real send under the `aws` profile with a
 * real MAIL_FROM_ADDRESS; [LogMailer] is the local/dev default and the prod fail-safe (blank
 * MAIL_FROM, or an SES send that throws). The bean is chosen by
 * [com.llmagal.vita.config.MailerConfig].
 */
interface Mailer {
    fun sendMagicLink(
        email: String,
        link: String,
    )
}

/**
 * Logs the magic link. Used locally/dev and as the prod fail-safe escape hatch (the CloudWatch
 * recipe). Logging the email address is PII in logs (ADR-0003) — an accepted trade-off only for
 * the fallback path; when SES is active nothing personal is logged. Bean wiring is in MailerConfig
 * (no @Component — a single Mailer bean is selected there).
 */
class LogMailer : Mailer {
    private val log = LoggerFactory.getLogger(LogMailer::class.java)

    override fun sendMagicLink(
        email: String,
        link: String,
    ) {
        log.info("Magic link for {}: {}", email, link)
    }
}
