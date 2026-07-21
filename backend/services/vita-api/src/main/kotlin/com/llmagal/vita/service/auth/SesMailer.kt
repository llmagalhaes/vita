package com.llmagal.vita.service.auth

import jakarta.activation.DataHandler
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import jakarta.mail.util.ByteArrayDataSource
import org.slf4j.LoggerFactory
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.ses.SesClient
import software.amazon.awssdk.services.ses.model.RawMessage
import software.amazon.awssdk.services.ses.model.SendRawEmailRequest
import java.io.ByteArrayOutputStream
import java.util.Properties

/**
 * BE-033/BE-034 — sends the magic-link email through Amazon SES (aws profile, real
 * MAIL_FROM_ADDRESS). The message is a multipart/related MIME (SendRawEmail): a plain-text part with
 * the raw vita://auth link (fallback + accessibility), an HTML part with a short quiet line plus an
 * inline QR of the same link, and the QR PNG attached with Content-ID `qr` so `<img src="cid:qr">`
 * renders it (data: URIs don't render in email clients). Quiet by design (product philosophy): no
 * template engine, no tracking. The CEO reads mail on desktop and scans the QR with the phone.
 *
 * Fail-safe: if building or sending the message throws for any reason (unverified identity, SES down,
 * throttling), we fall back to [fallback] (the [LogMailer]) so the link still lands in CloudWatch —
 * the established escape hatch — and the /auth request never fails on a mail-delivery problem.
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
        try {
            val raw = buildMime(email, link)
            ses.sendRawEmail(
                SendRawEmailRequest
                    .builder()
                    .source(from)
                    .destinations(email)
                    .rawMessage(RawMessage.builder().data(SdkBytes.fromByteArray(raw)).build())
                    .build(),
            )
        } catch (e: Exception) {
            log.warn("SES send failed; falling back to logging the magic link", e)
            fallback.sendMagicLink(email, link)
        }
    }

    private fun buildMime(
        email: String,
        link: String,
    ): ByteArray {
        val plain =
            """
            Tap the link below to sign in to Vita, or scan the QR code in the HTML version of this
            email with the phone you want to sign in on. It works once and expires in 15 minutes.

            $link

            If you didn't ask to sign in, you can ignore this email.
            """.trimIndent()
        val html =
            """
            <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#333;max-width:420px">
              <p>Scan this code with the phone you want to sign in on, or tap the link below.
                 It works once and expires in 15 minutes.</p>
              <p><img src="cid:qr" alt="Sign-in QR code" width="240" height="240" style="display:block"></p>
              <p><a href="$link">$link</a></p>
              <p style="color:#999;font-size:13px">If you didn't ask to sign in, you can ignore this email.</p>
            </div>
            """.trimIndent()

        val alternative = MimeMultipart("alternative")
        alternative.addBodyPart(MimeBodyPart().apply { setText(plain, "UTF-8") })
        alternative.addBodyPart(MimeBodyPart().apply { setContent(html, "text/html; charset=UTF-8") })

        val related = MimeMultipart("related")
        related.addBodyPart(MimeBodyPart().apply { setContent(alternative) })
        related.addBodyPart(
            MimeBodyPart().apply {
                dataHandler = DataHandler(ByteArrayDataSource(qrPng(link), "image/png"))
                contentID = "<qr>"
                disposition = MimeBodyPart.INLINE
                fileName = "qr.png"
            },
        )

        val msg = MimeMessage(Session.getInstance(Properties()))
        msg.setFrom(InternetAddress(from))
        msg.setRecipient(Message.RecipientType.TO, InternetAddress(email))
        msg.setSubject("Your Vita sign-in link", "UTF-8")
        msg.setContent(related)
        msg.saveChanges()

        return ByteArrayOutputStream().use { out ->
            msg.writeTo(out)
            out.toByteArray()
        }
    }
}
