package com.llmagal.vita.controller.account

import com.llmagal.vita.service.account.AccountDeletionService
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.util.UUID

/** Contract DELETE /v1/account (ADR-0004). Protected by the resource server. */
@RestController
@RequestMapping("/v1/account")
class AccountController(
    private val deletion: AccountDeletionService,
) {
    data class DeletionScheduled(
        val deletionEffectiveAt: OffsetDateTime,
    )

    @DeleteMapping
    fun delete(
        @AuthenticationPrincipal jwt: Jwt,
    ): ResponseEntity<DeletionScheduled> {
        val effectiveAt = deletion.requestDeletion(UUID.fromString(jwt.subject))
        return ResponseEntity.accepted().body(DeletionScheduled(effectiveAt))
    }
}
