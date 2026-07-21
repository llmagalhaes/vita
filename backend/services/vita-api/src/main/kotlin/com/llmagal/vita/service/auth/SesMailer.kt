package com.llmagal.vita.service.auth

import org.slf4j.LoggerFactory
import software.amazon.awssdk.services.ses.SesClient
import software.amazon.awssdk.services.ses.model.Body
import software.amazon.awssdk.services.ses.model.Content
import software.amazon.awssdk.services.ses.model.Destination
import software.amazon.awssdk.services.ses.model.Message
import software.amazon.awssdk.services.ses.model.SendEmailRequest

/**
 * BE-033 — sends the magic-link email through Amazon SES (aws profile, real MAIL_FROM_ADDRESS).
 * Content is deliberately plain and quiet (product philosophy): a subject, one line of purpose,
 * the vita://auth link, and a "you can ignore this" note. No template engine, no HTML, no tracking.
 *
 * Fail-safe: if the SES call throws for any reason (unverified identity, SES down, throttling),
 * we fall back to [fallback] (the [LogMailer]) so the link still lands in CloudWatch — the
 * established escape hatch — and the /auth request never fails on a mail-delivery problem.
 */
class SesMailer(
    private val ses: SesClient,
    private val from: String,
    private val fallback: Mailer,
) : Mailer {
    private val log = LoggerFactory.getLogger(SesMailer::class.java)

    // TooGenericExceptionCaught: the fail-safe is deliberately total — any send failure falls back to logging.
    @Suppress("TooGenericExceptionCaught")
    override fun sendMagicLink(
        email: String,
        link: String,
    ) {
        val body =
            """
            Tap the link below to sign in to Vita. It works once and expires in 15 minutes.

            $link

            If you didn't ask to sign in, you can ignore this email.
            """.trimIndent()
        val request =
            SendEmailRequest
                .builder()
                .source(from)
                .destination(Destination.builder().toAddresses(email).build())
                .message(
                    Message
                        .builder()
                        .subject(Content.builder().data("Your Vita sign-in link").build())
                        .body(Body.builder().text(Content.builder().data(body).build()).build())
                        .build(),
                ).build()
        try {
            ses.sendEmail(request)
        } catch (e: Exception) {
            log.warn("SES send failed; falling back to logging the magic link", e)
            fallback.sendMagicLink(email, link)
        }
    }
}
