package com.llmagal.vita.controller.ai

import com.llmagal.vita.model.ai.ParseTextRequest
import com.llmagal.vita.service.ai.ParseQuota
import com.llmagal.vita.service.ai.ParseService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import java.util.UUID

/**
 * POST /v1/parse/text and /v1/parse/photo — natural language / photo to draft entries
 * (BE-013/BE-018, ADR-0005). Auth-protected by the resource server; drafts are never
 * persisted server-side and the uploaded image is sent to the model and discarded (no
 * S3, no disk, no DB). A per-user daily ceiling (BE-014) guards the Claude budget: over
 * the limit the request is rejected before the model call with 429 + Retry-After (RFC
 * 7807). On timeout/failure the app falls back to manual entry.
 */
@RestController
class ParseController(
    private val service: ParseService,
    private val quota: ParseQuota,
) {
    @PostMapping("/v1/parse/text")
    fun parseText(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody body: ParseTextRequest,
    ): ResponseEntity<Any> {
        val text = body.text?.takeIf { it.isNotBlank() } ?: badRequest("text is required.")
        if (text.length > MAX_TEXT) badRequest("text must be at most $MAX_TEXT characters.")

        quota.tryAcquire(UUID.fromString(jwt.subject))?.let { return tooManyRequests(it) }

        val capturedAt = body.capturedAt ?: OffsetDateTime.now()
        return ResponseEntity.ok(service.parseText(text, capturedAt))
    }

    /**
     * Multipart `image` (JPEG/PNG/WebP, ≤ 5 MB — the app downscales to 1568 px q0.8, this
     * is a backstop) plus optional `caption`/`capturedAt` form fields (contract v0.4.0).
     * The 5 MB cap is enforced by Spring's multipart limit → 413 (see MultipartUploadAdvice).
     */
    @PostMapping("/v1/parse/photo", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun parsePhoto(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestPart("image") image: MultipartFile,
        @RequestParam("caption", required = false) caption: String?,
        @RequestParam("capturedAt", required = false) capturedAt: String?,
    ): ResponseEntity<Any> {
        if (image.isEmpty) badRequest("image is required.")
        val mediaType =
            image.contentType?.lowercase()?.takeIf { it in ALLOWED_IMAGE_TYPES }
                ?: throw ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "image must be JPEG, PNG, or WebP.")
        if ((caption?.length ?: 0) > MAX_CAPTION) badRequest("caption must be at most $MAX_CAPTION characters.")

        quota.tryAcquire(UUID.fromString(jwt.subject))?.let { return tooManyRequests(it) }

        val hint = caption?.takeIf { it.isNotBlank() }
        return ResponseEntity.ok(service.parsePhoto(image.bytes, mediaType, hint, parseCapturedAt(capturedAt)))
    }

    /** Lenient: a missing or unparseable capturedAt just anchors to now (matches /parse/text). */
    private fun parseCapturedAt(raw: String?): OffsetDateTime =
        raw?.takeIf { it.isNotBlank() }?.let {
            try {
                OffsetDateTime.parse(it)
            } catch (_: DateTimeParseException) {
                null
            }
        } ?: OffsetDateTime.now()

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val MAX_TEXT = 2000
        const val MAX_CAPTION = 500
        val ALLOWED_IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")
    }
}
