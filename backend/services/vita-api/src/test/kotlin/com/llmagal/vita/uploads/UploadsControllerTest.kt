package com.llmagal.vita.uploads

import com.llmagal.vita.uploads.controller.UploadRequest
import com.llmagal.vita.uploads.controller.UploadsController
import com.llmagal.vita.uploads.service.FileStore
import com.llmagal.vita.uploads.service.PresignedUpload
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.OffsetDateTime

/** BE-015 — the uploads endpoint vends the presigned target and rejects unsupported purpose/type. */
class UploadsControllerTest {
    private val fileStore = mockk<FileStore>()
    private val controller = UploadsController(fileStore)

    @Test
    fun `a valid plan_document PDF request returns the presigned target`() {
        val expiresAt = OffsetDateTime.parse("2026-07-13T12:15:00Z")
        every { fileStore.presignPut("application/pdf") } returns PresignedUpload("ref-1", "https://s3/put", expiresAt)

        val response = controller.createUpload(UploadRequest("plan_document", "application/pdf"))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.body?.fileRef).isEqualTo("ref-1")
        assertThat(response.body?.uploadUrl).isEqualTo("https://s3/put")
        assertThat(response.body?.expiresAt).isEqualTo(expiresAt)
    }

    @Test
    fun `an unsupported purpose is a 400`() {
        assertBadRequest { controller.createUpload(UploadRequest("avatar", "application/pdf")) }
    }

    @Test
    fun `a non-pdf content type is a 400`() {
        assertBadRequest { controller.createUpload(UploadRequest("plan_document", "image/png")) }
    }

    private fun assertBadRequest(call: () -> Unit) {
        assertThatThrownBy { call() }
            .isInstanceOfSatisfying(ResponseStatusException::class.java) {
                assertThat(it.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
            }
    }
}
