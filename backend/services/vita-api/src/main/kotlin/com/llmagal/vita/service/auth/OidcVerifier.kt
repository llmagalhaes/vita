package com.llmagal.vita.service.auth

import com.llmagal.vita.config.OidcProps
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2TokenValidator
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.jwt.JwtTimestampValidator
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import java.util.concurrent.ConcurrentHashMap

/** A verified Google/Apple identity. `email` is present only when the token asserts it verified. */
data class VerifiedIdentity(
    val subject: String,
    val email: String?,
    val name: String?,
)

/**
 * Verifies a Google/Apple OpenID Connect id token (BE-007, ADR-0015). Reuses Spring
 * Security's [NimbusJwtDecoder]: it fetches + caches the provider JWKS (RemoteJWKSet,
 * refresh on unknown kid), validates the RS256 signature and `exp`, and we compose
 * validators for `iss` and `aud`. `nonce` is checked here (it is per-request, not a
 * static claim). No new dependency — nimbus-jose-jwt already ships with the resource
 * server. One decoder per provider, built lazily (no JWKS fetch at boot).
 *
 * Fails closed: an unconfigured audience → 503 (never accept an unverified token);
 * any verification failure → 401.
 */
@Component
class OidcVerifier(
    private val props: OidcProps,
) {
    private val log = LoggerFactory.getLogger(OidcVerifier::class.java)
    private val decoders = ConcurrentHashMap<String, NimbusJwtDecoder>()

    fun verify(
        provider: String,
        idToken: String,
        nonce: String?,
    ): VerifiedIdentity {
        val cfg = configFor(provider)
        val jwt =
            try {
                decoder(provider, cfg).decode(idToken)
            } catch (e: JwtException) {
                log.debug("OIDC {} token rejected: {}", provider, e.message)
                throw unauthorized()
            }
        // nonce binds the token to this sign-in attempt; enforced when the app sent one.
        if (nonce != null && jwt.getClaimAsString("nonce") != nonce) {
            log.debug("OIDC {} token nonce mismatch", provider)
            throw unauthorized()
        }
        return VerifiedIdentity(
            subject = jwt.subject,
            email = jwt.getClaimAsString("email")?.takeIf { emailVerified(jwt) },
            name = jwt.getClaimAsString("name"),
        )
    }

    private fun decoder(
        provider: String,
        cfg: ProviderConfig,
    ): NimbusJwtDecoder =
        decoders.computeIfAbsent(provider) {
            NimbusJwtDecoder
                .withJwkSetUri(cfg.props.jwksUri)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build()
                .apply {
                    setJwtValidator(
                        DelegatingOAuth2TokenValidator(
                            JwtTimestampValidator(),
                            issuerValidator(cfg.issuers),
                            audienceValidator(cfg.props.audience),
                        ),
                    )
                }
        }

    private fun configFor(provider: String): ProviderConfig {
        val cfg =
            when (provider) {
                "google" -> ProviderConfig(props.google, GOOGLE_ISSUERS)
                "apple" -> ProviderConfig(props.apple, APPLE_ISSUERS)
                else -> throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown provider: $provider")
            }
        // Fail closed: without a configured audience we cannot check `aud`, so we never
        // accept the token (rather than trust an unverified one). The SSM placeholder is
        // non-blank but not a real client id — treat it as unconfigured too (→ 503, not 401).
        if (cfg.props.audience.isBlank() || cfg.props.audience == SSM_PLACEHOLDER) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "$provider sign-in is not configured.")
        }
        return cfg
    }

    // Google email_verified is a JSON boolean; Apple sends it as the string "true".
    private fun emailVerified(jwt: Jwt): Boolean =
        when (val v = jwt.getClaim<Any?>("email_verified")) {
            is Boolean -> v
            is String -> v == "true"
            else -> false
        }

    private class ProviderConfig(
        val props: OidcProps.Provider,
        val issuers: Set<String>,
    )

    private companion object {
        // The unconfigured-provider sentinel devops seeds into the SSM client-config params
        // until the CEO pastes the real OAuth client id. Non-blank, so guard it explicitly.
        const val SSM_PLACEHOLDER = "REPLACE_ME_IN_CONSOLE"

        // Google mints tokens with either issuer form; Apple only the https one.
        val GOOGLE_ISSUERS = setOf("https://accounts.google.com", "accounts.google.com")
        val APPLE_ISSUERS = setOf("https://appleid.apple.com")

        fun issuerValidator(issuers: Set<String>): OAuth2TokenValidator<Jwt> =
            // Read `iss` as a raw string — Google's scheme-less "accounts.google.com" is not a
            // valid URL, so jwt.issuer (getClaimAsURL) would throw on it.
            OAuth2TokenValidator { jwt ->
                if (jwt.getClaimAsString("iss") in issuers) {
                    OAuth2TokenValidatorResult.success()
                } else {
                    OAuth2TokenValidatorResult.failure(OAuth2Error("invalid_issuer"))
                }
            }

        fun audienceValidator(audience: String): OAuth2TokenValidator<Jwt> =
            OAuth2TokenValidator { jwt ->
                if (audience in jwt.audience) {
                    OAuth2TokenValidatorResult.success()
                } else {
                    OAuth2TokenValidatorResult.failure(OAuth2Error("invalid_audience"))
                }
            }

        fun unauthorized() = ResponseStatusException(HttpStatus.UNAUTHORIZED, "Id token failed verification.")
    }
}
