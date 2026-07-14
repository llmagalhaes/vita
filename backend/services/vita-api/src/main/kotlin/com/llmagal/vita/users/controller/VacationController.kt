package com.llmagal.vita.users.controller

import com.llmagal.vita.users.service.VacationService
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
 * Vacation ranges (GET/PUT /v1/me/vacations, BE-025). Opaque encrypted durability
 * for the device-local vacation config (D1) — the body is a raw JsonNode array
 * the server stores verbatim. Protected by the resource server (BE-008).
 */
@RestController
@RequestMapping("/v1/me/vacations")
class VacationController(
    private val vacations: VacationService,
) {
    @GetMapping
    fun get(
        @AuthenticationPrincipal jwt: Jwt,
    ): JsonNode = vacations.get(UUID.fromString(jwt.subject))

    @PutMapping
    fun put(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: JsonNode,
    ): JsonNode = vacations.replace(UUID.fromString(jwt.subject), body)
}
