package com.llmagal.vita.entries.controller

import com.llmagal.vita.entries.service.EntryResult
import com.llmagal.vita.entries.service.EntryService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/** Contract /entries write path (BE-011). Protected by the resource server (BE-008). */
@RestController
class EntryController(
    private val entries: EntryService,
) {
    @PostMapping("/v1/entries")
    fun create(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestHeader("Idempotency-Key") idempotencyKey: String,
        @RequestBody body: NewEntry,
    ): ResponseEntity<Any> {
        val userId = UUID.fromString(jwt.subject)
        return when (val result = entries.create(userId, idempotencyKey, body)) {
            is EntryResult.Created -> ResponseEntity.status(HttpStatus.CREATED).body(result.entry)
            is EntryResult.Replay -> ResponseEntity.ok(result.entry)
            EntryResult.Conflict -> conflict()
        }
    }

    private fun conflict(): ResponseEntity<Any> {
        val problem = ProblemDetail.forStatus(HttpStatus.CONFLICT)
        problem.title = "Conflict"
        problem.detail = "Idempotency-Key was already used with a different request body."
        return ResponseEntity
            .status(HttpStatus.CONFLICT)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem)
    }
}
