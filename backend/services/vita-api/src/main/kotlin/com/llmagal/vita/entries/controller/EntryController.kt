package com.llmagal.vita.entries.controller

import com.llmagal.vita.entries.service.EntryResult
import com.llmagal.vita.entries.service.EntryService
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.time.OffsetDateTime
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

    @GetMapping("/v1/entries")
    @Suppress("LongParameterList") // contract query params, each 1:1 with the OpenAPI spec
    fun list(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestParam(required = false) date: LocalDate?,
        @RequestParam(required = false) tz: String?,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) from: OffsetDateTime?,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) to: OffsetDateTime?,
        @RequestParam(required = false) type: List<String>?,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(defaultValue = "50") limit: Int,
    ): EntryPage = entries.list(UUID.fromString(jwt.subject), date, tz, from, to, type, cursor, limit)

    @GetMapping("/v1/entries/{id}")
    fun get(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable id: UUID,
    ): LogEntry = entries.get(UUID.fromString(jwt.subject), id)

    @PatchMapping("/v1/entries/{id}")
    fun update(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable id: UUID,
        @RequestBody body: UpdateEntry,
    ): LogEntry = entries.update(UUID.fromString(jwt.subject), id, body)

    @DeleteMapping("/v1/entries/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable id: UUID,
    ) = entries.delete(UUID.fromString(jwt.subject), id)

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
