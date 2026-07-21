package com.llmagal.vita.auth

import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.llmagal.vita.config.MailerConfig
import com.llmagal.vita.service.auth.LogMailer
import com.llmagal.vita.service.auth.Mailer
import com.llmagal.vita.service.auth.SesMailer
import com.llmagal.vita.service.auth.qrPng
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import jakarta.mail.Multipart
import jakarta.mail.Part
import jakarta.mail.Session
import jakarta.mail.internet.MimeMessage
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.services.ses.SesClient
import software.amazon.awssdk.services.ses.model.SendRawEmailRequest
import software.amazon.awssdk.services.ses.model.SendRawEmailResponse
import java.io.ByteArrayInputStream
import java.util.Properties
import javax.imageio.ImageIO

/**
 * BE-033/BE-034 — mailer selection (blank/sentinel → log; real → SES), the multipart/related
 * message with a decodable inline QR of the vita://auth link, and the SES fail-safe (a send that
 * throws must fall back to logging and never propagate, keeping /auth alive and the CloudWatch
 * link recipe working).
 */
class MailerTest {
    private val ses = mockk<SesClient>()

    @Test
    fun `blank MAIL_FROM disables email — LogMailer`() {
        assertThat(MailerConfig.selectMailer("", ses)).isInstanceOf(LogMailer::class.java)
        assertThat(MailerConfig.selectMailer("   ", ses)).isInstanceOf(LogMailer::class.java)
    }

    @Test
    fun `SSM placeholder disables email — LogMailer`() {
        assertThat(MailerConfig.selectMailer(MailerConfig.SENTINEL, ses)).isInstanceOf(LogMailer::class.java)
        assertThat(MailerConfig.selectMailer("  ${MailerConfig.SENTINEL}  ", ses)).isInstanceOf(LogMailer::class.java)
    }

    @Test
    fun `real address without an SES client (non-aws) — LogMailer`() {
        assertThat(MailerConfig.selectMailer("no-reply@vita.app", null)).isInstanceOf(LogMailer::class.java)
    }

    @Test
    fun `real address with an SES client — SesMailer`() {
        assertThat(MailerConfig.selectMailer("no-reply@vita.app", ses)).isInstanceOf(SesMailer::class.java)
    }

    @Test
    fun `qrPng renders a QR that decodes back to the link`() {
        val link = "vita://auth?token=abc123"
        assertThat(decodeQr(qrPng(link))).isEqualTo(link)
    }

    @Test
    fun `SesMailer sends a multipart-related MIME with text, html and an inline QR that decodes to the link`() {
        val link = "vita://auth?token=abc123"
        val req = slot<SendRawEmailRequest>()
        every { ses.sendRawEmail(capture(req)) } returns SendRawEmailResponse.builder().messageId("m-1").build()

        SesMailer(ses, "no-reply@vita.app", LogMailer()).sendMagicLink("u@test.dev", link)

        assertThat(req.captured.source()).isEqualTo("no-reply@vita.app")
        assertThat(req.captured.destinations()).containsExactly("u@test.dev")

        val rawMime =
            req.captured
                .rawMessage()
                .data()
                .asByteArray()
        val msg = MimeMessage(Session.getInstance(Properties()), ByteArrayInputStream(rawMime))
        assertThat(msg.contentType).startsWith("multipart/related")
        assertThat(msg.subject).isEqualTo("Your Vita sign-in link")

        val leaves = leaves(msg)
        val text = leaves.first { it.isMimeType("text/plain") }.content as String
        val html = leaves.first { it.isMimeType("text/html") }.content as String
        val image = leaves.first { it.isMimeType("image/png") }

        assertThat(text).contains(link) // raw link kept as fallback + accessibility
        assertThat(html).contains("cid:qr") // html references the inline image
        assertThat(image.getHeader("Content-ID")?.first()).isEqualTo("<qr>")
        assertThat(image.disposition).isEqualTo(Part.INLINE)
        assertThat(decodeQr(image.inputStream.readBytes())).isEqualTo(link) // the embedded QR is the link
    }

    @Test
    fun `SesMailer fail-safe — a send that throws falls back to logging, does not propagate`() {
        every { ses.sendRawEmail(any<SendRawEmailRequest>()) } throws SdkClientException.create("SES down")
        val fallback = mockk<Mailer>(relaxed = true)

        assertThatCode {
            SesMailer(ses, "no-reply@vita.app", fallback).sendMagicLink("u@test.dev", "vita://auth?token=abc")
        }.doesNotThrowAnyException()

        verify(exactly = 1) { fallback.sendMagicLink("u@test.dev", "vita://auth?token=abc") }
    }

    /** Flatten a MIME message into its leaf parts. */
    private fun leaves(part: Part): List<Part> =
        when (val content = part.content) {
            is Multipart -> (0 until content.count).flatMap { leaves(content.getBodyPart(it)) }
            else -> listOf(part)
        }

    /** Decode a PNG QR back to its text using zxing-core only (RGBLuminanceSource, no `javase`). */
    private fun decodeQr(png: ByteArray): String {
        val img = ImageIO.read(ByteArrayInputStream(png))
        val pixels = img.getRGB(0, 0, img.width, img.height, null, 0, img.width)
        val bitmap = BinaryBitmap(HybridBinarizer(RGBLuminanceSource(img.width, img.height, pixels)))
        return QRCodeReader().decode(bitmap).text
    }
}
