package com.llmagal.vita.controller.auth

import com.llmagal.vita.config.AuthProps
import com.llmagal.vita.service.auth.MagicLinkService
import com.llmagal.vita.service.auth.OidcService
import com.llmagal.vita.service.auth.TokenPair
import com.llmagal.vita.service.auth.TokenService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Contract v0 auth endpoints (BE-006 magic link, BE-008 sessions). */
@RestController
@RequestMapping("/v1/auth")
class AuthController(
    private val magicLink: MagicLinkService,
    private val tokens: TokenService,
    private val oidc: OidcService,
    private val props: AuthProps,
) {
    data class EmailRequest(
        val email: String,
    )

    data class TokenRequest(
        val token: String,
    )

    data class RefreshRequest(
        val refreshToken: String,
    )

    /** POST /v1/auth/oidc — provider is google|apple; name is Apple's first-sign-in name. */
    data class OidcRequest(
        val provider: String,
        val idToken: String,
        val nonce: String? = null,
        val name: String? = null,
    )

    @PostMapping("/magic-link")
    fun requestMagicLink(
        @RequestBody body: EmailRequest,
        request: HttpServletRequest,
    ): ResponseEntity<Any> {
        val retryAfter = magicLink.request(body.email, request.remoteAddr) ?: return ResponseEntity.accepted().build()
        val problem = ProblemDetail.forStatus(HttpStatus.TOO_MANY_REQUESTS)
        problem.title = "Too Many Requests"
        problem.detail = "Rate limit exceeded. Retry after the indicated delay."
        return ResponseEntity
            .status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, retryAfter.toString())
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem)
    }

    @PostMapping("/magic-link/verify")
    fun verify(
        @RequestBody body: TokenRequest,
    ): TokenPair = magicLink.verify(body.token)

    @PostMapping("/oidc")
    fun oidc(
        @RequestBody body: OidcRequest,
    ): TokenPair = oidc.signIn(body.provider, body.idToken, body.nonce, body.name)

    @PostMapping("/refresh")
    fun refresh(
        @RequestBody body: RefreshRequest,
    ): TokenPair = tokens.rotate(body.refreshToken)

    @PostMapping("/sign-out")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun signOut(
        @RequestBody body: RefreshRequest,
    ) = tokens.revoke(body.refreshToken)

    /**
     * BE-035 — the entry door the email link points at (email clients only trust http(s)). Bounces
     * the browser to the app scheme so the phone opens Vita; the HTML body is the fallback for
     * clients that don't follow custom-scheme redirects. The token is opaque here: not verified,
     * consumed, or logged — magic-link/verify does that. No auth (the auth routes are permitAll).
     */
    @GetMapping("/link")
    fun link(
        @RequestParam token: String,
    ): ResponseEntity<String> {
        // Re-encode into the query component. URLEncoder output is ASCII with no HTML metacharacters,
        // so interpolating it into the anchor below cannot break out — no HTML escaping needed.
        val encoded = URLEncoder.encode(token, StandardCharsets.UTF_8)
        val target = "${props.magicLinkBaseUrl}?token=$encoded"
        val html =
            "<!doctype html><meta charset=\"utf-8\">" +
                "<p><a href=\"$target\">Open Vita to finish signing in</a></p>" +
                "<p style=\"color:#999;font-size:13px\">Open this on the phone with Vita installed.</p>"
        return ResponseEntity
            .status(HttpStatus.FOUND)
            .location(URI.create(target))
            .contentType(MediaType.TEXT_HTML)
            .body(html)
    }
}
