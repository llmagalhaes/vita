package com.llmagal.vita.auth

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.get
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.llmagal.vita.config.OidcProps
import com.llmagal.vita.service.auth.OidcVerifier
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

/**
 * BE-007 — id-token verification against a WireMock JWKS (never a live provider).
 * This is the security path: every negative case (wrong aud/iss, expired, bad
 * signature, nonce mismatch, unconfigured audience) must be rejected.
 */
class OidcVerifierTest {
    private fun verifier(
        googleAudience: String = AUDIENCE,
        appleAudience: String = "test-apple-client",
    ): OidcVerifier =
        OidcVerifier(
            OidcProps(
                google = OidcProps.Provider(audience = googleAudience, jwksUri = wm.baseUrl() + "/certs"),
                apple = OidcProps.Provider(audience = appleAudience, jwksUri = wm.baseUrl() + "/certs"),
            ),
        )

    @Test
    fun `a valid Google token yields the verified identity`() {
        val identity =
            verifier().verify("google", OidcTestTokens.idToken(subject = "g-1", email = "a@test.dev"), nonce = null)
        assertThat(identity.subject).isEqualTo("g-1")
        assertThat(identity.email).isEqualTo("a@test.dev")
        assertThat(identity.name).isEqualTo("Test Person")
    }

    @Test
    fun `Google's scheme-less issuer is accepted`() {
        val token = OidcTestTokens.idToken(issuer = "accounts.google.com")
        assertThat(verifier().verify("google", token, null).subject).isEqualTo("sub-123")
    }

    @Test
    fun `a valid Apple token yields the verified identity`() {
        val token =
            OidcTestTokens.idToken(
                issuer = "https://appleid.apple.com",
                audience = "test-apple-client",
                emailVerified = "true", // Apple sends email_verified as a string
            )
        assertThat(verifier().verify("apple", token, null).email).isEqualTo("person@test.dev")
    }

    @Test
    fun `wrong audience is rejected`() {
        val token = OidcTestTokens.idToken(audience = "someone-elses-client")
        assertUnauthorized { verifier().verify("google", token, null) }
    }

    @Test
    fun `wrong issuer is rejected`() {
        val token = OidcTestTokens.idToken(issuer = "https://evil.example.com")
        assertUnauthorized { verifier().verify("google", token, null) }
    }

    @Test
    fun `an Apple issuer on the Google provider is rejected`() {
        val token = OidcTestTokens.idToken(issuer = "https://appleid.apple.com", audience = AUDIENCE)
        assertUnauthorized { verifier().verify("google", token, null) }
    }

    @Test
    fun `an expired token is rejected`() {
        val token = OidcTestTokens.idToken(expiresAt = Instant.now().minusSeconds(3600))
        assertUnauthorized { verifier().verify("google", token, null) }
    }

    @Test
    fun `a token signed by an unknown key is rejected`() {
        assertUnauthorized { verifier().verify("google", OidcTestTokens.forgedToken(), null) }
    }

    @Test
    fun `a nonce mismatch is rejected`() {
        val token = OidcTestTokens.idToken(nonce = "abc")
        assertUnauthorized { verifier().verify("google", token, nonce = "xyz") }
    }

    @Test
    fun `a missing token nonce when the request expects one is rejected`() {
        val token = OidcTestTokens.idToken(nonce = null)
        assertUnauthorized { verifier().verify("google", token, nonce = "expected") }
    }

    @Test
    fun `a matching nonce is accepted`() {
        val token = OidcTestTokens.idToken(nonce = "match")
        assertThat(verifier().verify("google", token, nonce = "match").subject).isEqualTo("sub-123")
    }

    @Test
    fun `an unverified email is dropped`() {
        val token = OidcTestTokens.idToken(email = "x@test.dev", emailVerified = false)
        assertThat(verifier().verify("google", token, null).email).isNull()
    }

    @Test
    fun `an absent email is null`() {
        val token = OidcTestTokens.idToken(email = null, emailVerified = null)
        assertThat(verifier().verify("google", token, null).email).isNull()
    }

    @Test
    fun `an unconfigured audience fails closed with 503`() {
        val token = OidcTestTokens.idToken()
        assertThatThrownBy { verifier(googleAudience = "").verify("google", token, null) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
            }
    }

    @Test
    fun `the SSM placeholder audience fails closed with 503`() {
        val token = OidcTestTokens.idToken()
        assertThatThrownBy { verifier(googleAudience = "REPLACE_ME_IN_CONSOLE").verify("google", token, null) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
            }
    }

    @Test
    fun `an unknown provider is a 400`() {
        assertThatThrownBy { verifier().verify("facebook", "x", null) }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
            }
    }

    private fun assertUnauthorized(call: () -> Unit) {
        assertThatThrownBy { call() }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.UNAUTHORIZED)
            }
    }

    private companion object {
        const val AUDIENCE = "test-google-client"
        lateinit var wm: WireMockServer

        @JvmStatic
        @BeforeAll
        fun startWireMock() {
            wm = WireMockServer(options().dynamicPort())
            wm.start()
            wm.stubFor(
                get(urlEqualTo("/certs")).willReturn(
                    aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody(OidcTestTokens.jwkSetJson()),
                ),
            )
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wm.stop()
        }
    }
}
