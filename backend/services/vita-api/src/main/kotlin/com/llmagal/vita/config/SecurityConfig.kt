package com.llmagal.vita.config

import com.nimbusds.jose.jwk.source.ImmutableSecret
import com.nimbusds.jose.proc.SecurityContext
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtEncoder
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import java.util.Base64
import javax.crypto.spec.SecretKeySpec

/**
 * Stateless bearer-JWT resource server (BE-008). HS256 with a shared secret:
 * one service signs and verifies its own tokens — asymmetric keys buy nothing
 * here. Secret comes from config (Secrets Manager in prod).
 */
@Configuration
@EnableWebSecurity
class SecurityConfig(
    props: AuthProps,
) {
    private val jwtKey = SecretKeySpec(Base64.getDecoder().decode(props.jwtSecret), "HmacSHA256")

    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.disable() } // stateless bearer-token API, no cookies
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests {
                it.requestMatchers("/health", "/v1/auth/**").permitAll()
                it.anyRequest().authenticated()
            }.oauth2ResourceServer {
                it.jwt { }
                it.authenticationEntryPoint(problemEntryPoint())
            }.exceptionHandling { it.authenticationEntryPoint(problemEntryPoint()) }
        return http.build()
    }

    @Bean
    fun jwtDecoder(): JwtDecoder = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build()

    @Bean
    fun jwtEncoder(): JwtEncoder = NimbusJwtEncoder(ImmutableSecret<SecurityContext>(jwtKey))

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
