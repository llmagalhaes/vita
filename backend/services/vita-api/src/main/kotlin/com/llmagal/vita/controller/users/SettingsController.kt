package com.llmagal.vita.controller.users

import com.llmagal.vita.service.users.SettingsService
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.util.UUID

/**
 * The settings blob (GET/PUT /v1/me/settings, BE-056). Opaque encrypted durability
 * for the device-local settings bundle — the body is a raw JsonNode object the
 * server stores verbatim. Protected by the resource server (BE-008).
 */
@RestController
@RequestMapping("/v1/me/settings")
class SettingsController(
    private val settings: SettingsService,
) {
    @GetMapping
    fun get(
        @AuthenticationPrincipal jwt: Jwt,
    ): JsonNode = settings.get(UUID.fromString(jwt.subject))

    @PutMapping
    fun put(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: JsonNode,
    ): JsonNode = settings.replace(UUID.fromString(jwt.subject), body)
}
