package com.llmagal.vita.controller.uploads

import com.llmagal.vita.service.uploads.FileStore
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime

/** POST /v1/uploads body (contract): what the upload feeds + the file's MIME type. */
data class UploadRequest(
    val purpose: String?,
    val contentType: String?,
)

/** Contract /v1/uploads 200 response: opaque handle + presigned PUT target. */
data class UploadResponse(
    val fileRef: String,
    val uploadUrl: String,
    val expiresAt: OffsetDateTime,
)

/**
 * POST /v1/uploads — vends a presigned S3 PUT URL + opaque fileRef (BE-015, OPS-011).
 * Bytes go direct to S3, never through the JSON body (API Gateway 10 MB cap). v0 only
 * supports the plan/program import: purpose `plan_document`, contentType `application/pdf`.
 */
@RestController
class UploadsController(
    private val fileStore: FileStore,
) {
    @PostMapping("/v1/uploads")
    fun createUpload(
        @RequestBody body: UploadRequest,
    ): ResponseEntity<UploadResponse> {
        if (body.purpose != PLAN_DOCUMENT) badRequest("purpose must be $PLAN_DOCUMENT.")
        if (body.contentType != APPLICATION_PDF) badRequest("contentType must be $APPLICATION_PDF.")

        val upload = fileStore.presignPut(body.contentType)
        return ResponseEntity.ok(UploadResponse(upload.fileRef, upload.uploadUrl, upload.expiresAt))
    }

    private fun badRequest(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)

    private companion object {
        const val PLAN_DOCUMENT = "plan_document"
        const val APPLICATION_PDF = "application/pdf"
    }
}
