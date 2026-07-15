package com.llmagal.vita.config

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * `vita.oidc.*` (BE-007). Only the per-deployment values live here: the **audience**
 * (the OAuth client id we must see in the token's `aud`) and the **jwks-uri** (fixed
 * provider constant in prod; overridden to a stub in tests). Issuers are hardcoded
 * provider constants in [com.llmagal.vita.service.auth.OidcVerifier] — they never vary.
 *
 * The audiences come from the `google-client-config` / `apple-client-config` SSM
 * params (devops maps each SSM value → the env var below → this property). Blank in
 * dev; a blank audience makes that provider **fail closed** (503) — never accept an
 * unverified token.
 */
@ConfigurationProperties("vita.oidc")
data class OidcProps(
    val google: Provider = Provider(),
    val apple: Provider = Provider(),
) {
    data class Provider(
        val audience: String = "",
        val jwksUri: String = "",
    )
}
