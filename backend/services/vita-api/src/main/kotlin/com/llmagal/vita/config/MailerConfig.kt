package com.llmagal.vita.config

import com.llmagal.vita.service.auth.LogMailer
import com.llmagal.vita.service.auth.Mailer
import com.llmagal.vita.service.auth.SesMailer
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.services.ses.SesClient

/**
 * BE-033 — picks the [Mailer]. The env contract (agreed with devops) is a single value,
 * `MAIL_FROM_ADDRESS` → `vita.mail.from`:
 *   blank or the SSM placeholder `REPLACE_ME_IN_CONSOLE` → email disabled → [LogMailer]
 *     (keeps the CloudWatch link recipe, the BE-030 sentinel lesson);
 *   a real address (aws profile, so a [SesClient] bean exists) → [SesMailer].
 * The [SesClient] bean only exists under the `aws` profile ([AwsClientsConfig]); an [ObjectProvider]
 * makes the non-aws case (local/dev) resolve to null → [LogMailer], with no AWS on the classpath path.
 */
@Configuration
class MailerConfig {
    @Bean
    fun mailer(
        @Value("\${vita.mail.from:}") from: String,
        sesClient: ObjectProvider<SesClient>,
    ): Mailer = selectMailer(from, sesClient.ifAvailable)

    companion object {
        const val SENTINEL = "REPLACE_ME_IN_CONSOLE"

        /** True when email sending is configured: a non-blank address that isn't the SSM placeholder. */
        fun mailEnabled(from: String): Boolean = from.isNotBlank() && from.trim() != SENTINEL

        /** Pure selection so the branch is unit-testable without a Spring context. */
        fun selectMailer(
            from: String,
            ses: SesClient?,
        ): Mailer =
            if (mailEnabled(from) && ses != null) {
                SesMailer(ses, from.trim(), LogMailer())
            } else {
                LogMailer()
            }
    }
}
