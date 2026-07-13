package com.llmagal.vita.users.controller

import com.llmagal.vita.users.service.UpdateProfileRequest
import com.llmagal.vita.users.service.UserResponse
import com.llmagal.vita.users.service.UserService
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/** Contract /me profile endpoints (BE-009). Protected by the resource server (BE-008). */
@RestController
@RequestMapping("/v1/me")
class MeController(
    private val users: UserService,
) {
    @GetMapping
    fun me(
        @AuthenticationPrincipal jwt: Jwt,
    ): UserResponse = users.get(UUID.fromString(jwt.subject))

    @PatchMapping
    fun update(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: UpdateProfileRequest,
    ): UserResponse = users.update(UUID.fromString(jwt.subject), body)
}
