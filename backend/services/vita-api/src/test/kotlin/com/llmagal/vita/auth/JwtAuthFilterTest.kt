package com.llmagal.vita.auth

import io.mockk.every
import io.mockk.mockk
import jakarta.servlet.http.HttpServletRequest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpHeaders

class JwtAuthFilterTest {
    private val filter = JwtAuthFilter()

    private fun requestWithAuth(header: String?): HttpServletRequest =
        mockk { every { getHeader(HttpHeaders.AUTHORIZATION) } returns header }

    @Test
    fun `extracts token from bearer header`() {
        assertThat(filter.extractBearerToken(requestWithAuth("Bearer abc.def.ghi"))).isEqualTo("abc.def.ghi")
    }

    @Test
    fun `returns null without header, without bearer scheme, or with empty token`() {
        assertThat(filter.extractBearerToken(requestWithAuth(null))).isNull()
        assertThat(filter.extractBearerToken(requestWithAuth("Basic dXNlcg=="))).isNull()
        assertThat(filter.extractBearerToken(requestWithAuth("Bearer  "))).isNull()
    }
}
