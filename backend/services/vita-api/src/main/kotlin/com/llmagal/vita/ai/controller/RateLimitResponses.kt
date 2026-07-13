package com.llmagal.vita.ai.controller

import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity

/**
 * Shared 429 body for the parse endpoints' daily ceiling (BE-014): RFC 7807
 * problem+json + Retry-After seconds. Used by every parse controller so the
 * over-limit response is identical.
 */
fun tooManyRequests(retryAfterSeconds: Long): ResponseEntity<Any> {
    val problem = ProblemDetail.forStatus(HttpStatus.TOO_MANY_REQUESTS)
    problem.title = "Too Many Requests"
    problem.detail = "Daily parse limit reached. Retry after the indicated delay."
    return ResponseEntity
        .status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, retryAfterSeconds.toString())
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem)
}
