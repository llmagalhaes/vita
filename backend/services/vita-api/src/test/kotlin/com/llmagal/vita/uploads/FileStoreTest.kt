package com.llmagal.vita.uploads

import com.llmagal.vita.service.uploads.LocalFileStore
import com.llmagal.vita.service.uploads.UnknownFileRefException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.time.OffsetDateTime
import java.util.UUID

/** BE-015 — the local S3 stand-in: vends a stub presigned PUT, reads fixtures, 422s the rest. */
class FileStoreTest {
    @TempDir
    lateinit var dir: Path

    private fun store() = LocalFileStore(dir.toString(), 900)

    @Test
    fun `presignPut vends an opaque ref, a stub url and a future expiry`() {
        val upload = store().presignPut("application/pdf")

        assertThat(upload.fileRef).isNotBlank()
        assertThat(upload.uploadUrl).contains(upload.fileRef)
        assertThat(upload.expiresAt).isAfter(OffsetDateTime.now())
    }

    @Test
    fun `read returns the bytes of an uploaded fixture`() {
        val ref = UUID.randomUUID().toString()
        val bytes = "%PDF-1.4 fixture".toByteArray()
        Files.write(dir.resolve(ref), bytes)

        assertThat(store().read(ref)).isEqualTo(bytes)
    }

    @Test
    fun `read of an unknown ref throws UnknownFileRefException`() {
        assertThatThrownBy { store().read(UUID.randomUUID().toString()) }
            .isInstanceOf(UnknownFileRefException::class.java)
    }

    @Test
    fun `read of a non-uuid ref throws instead of traversing`() {
        assertThatThrownBy { store().read("../etc/passwd") }
            .isInstanceOf(UnknownFileRefException::class.java)
    }
}
