package com.llmagal.vita.auth

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter

@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    fun filterChain(
        http: HttpSecurity,
        jwtAuthFilter: JwtAuthFilter,
    ): SecurityFilterChain {
        http
            .csrf { it.disable() } // stateless bearer-token API, no cookies
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests {
                it.requestMatchers("/health").permitAll()
                it.anyRequest().authenticated()
            }.exceptionHandling { it.authenticationEntryPoint(problemEntryPoint()) }
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter::class.java)
        return http.build()
    }

    /** RFC 7807 body for 401, per ADR-0006. */
    private fun problemEntryPoint() =
        AuthenticationEntryPoint { _, response, _ ->
            response.status = HttpStatus.UNAUTHORIZED.value()
            response.characterEncoding = Charsets.UTF_8.name()
            response.contentType = MediaType.APPLICATION_PROBLEM_JSON_VALUE
            response.writer.write(
                """{"type":"about:blank","title":"Unauthorized","status":401,""" +
                    """"detail":"Missing or invalid bearer token."}""",
            )
        }
}
