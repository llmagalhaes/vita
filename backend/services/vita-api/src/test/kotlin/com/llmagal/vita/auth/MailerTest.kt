package com.llmagal.vita.auth

import com.llmagal.vita.config.MailerConfig
import com.llmagal.vita.service.auth.LogMailer
import com.llmagal.vita.service.auth.Mailer
import com.llmagal.vita.service.auth.SesMailer
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.junit.jupiter.api.Test
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.services.ses.SesClient
import software.amazon.awssdk.services.ses.model.SendEmailRequest
import software.amazon.awssdk.services.ses.model.SendEmailResponse

/**
 * BE-033 — mailer selection (blank/sentinel → log; real → SES) and the SES fail-safe
 * (a send that throws must fall back to logging and never propagate, keeping the /auth
 * request alive and the CloudWatch link recipe working).
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
    fun `SesMailer sends via SES with the configured source`() {
        val req = slot<SendEmailRequest>()
        every { ses.sendEmail(capture(req)) } returns SendEmailResponse.builder().messageId("m-1").build()

        SesMailer(ses, "no-reply@vita.app", LogMailer()).sendMagicLink("u@test.dev", "vita://auth?token=abc")

        assertThat(req.captured.source()).isEqualTo("no-reply@vita.app")
        assertThat(req.captured.destination().toAddresses()).containsExactly("u@test.dev")
        assertThat(
            req.captured
                .message()
                .body()
                .text()
                .data(),
        ).contains("vita://auth?token=abc")
    }

    @Test
    fun `SesMailer fail-safe — a send that throws falls back to logging, does not propagate`() {
        every { ses.sendEmail(any<SendEmailRequest>()) } throws SdkClientException.create("SES down")
        val fallback = mockk<Mailer>(relaxed = true)

        assertThatCode {
            SesMailer(ses, "no-reply@vita.app", fallback).sendMagicLink("u@test.dev", "vita://auth?token=abc")
        }.doesNotThrowAnyException()

        verify(exactly = 1) { fallback.sendMagicLink("u@test.dev", "vita://auth?token=abc") }
    }
}
