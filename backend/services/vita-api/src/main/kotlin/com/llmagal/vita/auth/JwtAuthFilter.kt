package com.llmagal.vita.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * JWT authentication filter — skeleton.
 *
 * ponytail: extracts the bearer token but validates nothing yet, so every request
 * stays anonymous and protected endpoints return 401. Real JWT verification
 * (signature, expiry, SecurityContext population) lands with BE-005/BE-006.
 */
@Component
class JwtAuthFilter : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val bearer = extractBearerToken(request)
        if (bearer != null) {
            // BE-005/BE-006: verify signature + expiry, set SecurityContext authentication.
        }
        filterChain.doFilter(request, response)
    }

    internal fun extractBearerToken(request: HttpServletRequest): String? =
        request
            .getHeader(HttpHeaders.AUTHORIZATION)
            ?.takeIf { it.startsWith("Bearer ", ignoreCase = true) }
            ?.substring("Bearer ".length)
            ?.takeIf { it.isNotBlank() }
}
