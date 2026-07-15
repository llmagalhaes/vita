package com.llmagal.vita.controller.ai

import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.multipart.MaxUploadSizeExceededException

/**
 * 413 for /parse/photo uploads over the 5 MB multipart limit (contract v0.4.0). The limit
 * is a server-side backstop — the app already downscales to 1568 px JPEG q0.8. The failure
 * is raised during multipart resolution, before the controller runs, so it needs a global
 * advice rather than a controller-local handler.
 */
@RestControllerAdvice
class MultipartUploadAdvice {
    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun tooLarge(): ResponseEntity<ProblemDetail> {
        val problem = ProblemDetail.forStatus(HttpStatus.PAYLOAD_TOO_LARGE)
        problem.title = "Payload Too Large"
        problem.detail = "Image exceeds the 5 MB limit."
        return ResponseEntity
            .status(HttpStatus.PAYLOAD_TOO_LARGE)
            .contentType(MediaType.APPLICATION_PROBLEM_JSON)
            .body(problem)
    }
}
