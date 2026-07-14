package com.llmagal.vita.uploads.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

/** A presigned upload target vended by [FileStore.presignPut] (contract /v1/uploads response). */
data class PresignedUpload(
    val fileRef: String,
    val uploadUrl: String,
    val expiresAt: OffsetDateTime,
)

/** Thrown by [FileStore.read] when a fileRef is unknown or expired → 422 upstream. */
class UnknownFileRefException(
    fileRef: String,
) : RuntimeException("Unknown or expired fileRef: $fileRef")

/**
 * The one seam between our upload/read path and S3 (OPS-011), mirroring the
 * KMS [com.llmagal.vita.crypto.KeyWrapper] seam. Production gets a presigner
 * that vends real S3 PUT URLs and reads objects from the bucket; local dev and
 * CI use [LocalFileStore] so `./gradlew check` runs with no AWS.
 */
interface FileStore {
    /** Vends a short-lived presigned PUT URL + opaque fileRef for a `plan_document` upload. */
    fun presignPut(contentType: String): PresignedUpload

    /** Reads the uploaded object for one parse call. Nothing is persisted beyond that (ADR-0005). */
    fun read(fileRef: String): ByteArray
}

/**
 * Local stand-in for the real S3 presigner. presignPut returns a stub URL nobody
 * uploads to; read resolves the fileRef to a file under a local directory (a test
 * writes a fixture there). Default bean; the `aws` profile swaps in [S3FileStore].
 */
@Component
@Profile("!aws")
class LocalFileStore(
    @param:Value("\${vita.uploads.local-dir:\${java.io.tmpdir}/vita-uploads}") dir: String,
    @param:Value("\${vita.uploads.url-ttl-seconds:900}") private val ttlSeconds: Long,
) : FileStore {
    private val root: Path = Path.of(dir)

    override fun presignPut(contentType: String): PresignedUpload {
        val fileRef = UUID.randomUUID().toString()
        return PresignedUpload(
            fileRef = fileRef,
            uploadUrl = "https://uploads.local.invalid/$fileRef", // ponytail: real presigned S3 PUT in prod
            expiresAt = OffsetDateTime.now().plus(Duration.ofSeconds(ttlSeconds)),
        )
    }

    override fun read(fileRef: String): ByteArray {
        // fileRefs are opaque UUIDs; validating shape also blocks path traversal.
        val name =
            try {
                UUID.fromString(fileRef).toString()
            } catch (_: IllegalArgumentException) {
                throw UnknownFileRefException(fileRef)
            }
        val path = root.resolve(name)
        if (!Files.exists(path)) throw UnknownFileRefException(fileRef)
        return Files.readAllBytes(path)
    }
}
