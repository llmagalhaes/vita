package com.llmagal.vita.auth

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.time.Instant
import java.util.Date

/**
 * Test-only OIDC token minting. Generates an RSA key, exposes its public JWK set
 * (served via WireMock in the tests), and signs id tokens — the same mechanism
 * Google/Apple use, so [OidcVerifier][com.llmagal.vita.service.auth.OidcVerifier]
 * is exercised for real (signature, iss, aud, exp, nonce) without the live provider.
 */
object OidcTestTokens {
    /** The provider signing key. A second key models an attacker / key rotation gap. */
    val signingKey: RSAKey = RSAKeyGenerator(2048).keyID("vita-test-kid").generate()
    private val foreignKey: RSAKey = RSAKeyGenerator(2048).keyID("vita-test-kid").generate()

    /** Public JWK set JSON as a provider's /certs endpoint would serve it. */
    fun jwkSetJson(): String = JWKSet(signingKey.toPublicJWK()).toString()

    @Suppress("LongParameterList") // a token has many independently-varied claims; a holder buys nothing in a test
    fun idToken(
        issuer: String = "https://accounts.google.com",
        audience: String = "test-google-client",
        subject: String = "sub-123",
        email: String? = "person@test.dev",
        emailVerified: Any? = true,
        name: String? = "Test Person",
        nonce: String? = null,
        expiresAt: Instant = Instant.now().plusSeconds(300),
        signWith: RSAKey = signingKey,
    ): String {
        val claims =
            JWTClaimsSet
                .Builder()
                .issuer(issuer)
                .audience(audience)
                .subject(subject)
                .issueTime(Date.from(Instant.now().minusSeconds(5)))
                .expirationTime(Date.from(expiresAt))
                .apply {
                    email?.let { claim("email", it) }
                    emailVerified?.let { claim("email_verified", it) }
                    name?.let { claim("name", it) }
                    nonce?.let { claim("nonce", it) }
                }.build()
        val jwt = SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signWith.keyID).build(), claims)
        jwt.sign(RSASSASigner(signWith))
        return jwt.serialize()
    }

    /** A token (default Google audience) signed by a key NOT in the JWK set → bad signature. */
    fun forgedToken(): String = idToken(signWith = foreignKey)
}
