package com.llmagal.vita.uploads.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

/**
 * Real S3-backed [FileStore] (BE-026). presignPut vends a genuine presigned PUT URL the app
 * uploads the PDF to; read pulls that object back for the one parse call (nothing persisted
 * beyond it, ADR-0005). Active only under the `aws` profile — LocalStack in tests, real S3 in
 * prod (see [com.llmagal.vita.aws.AwsClientsConfig]). Replaces [LocalFileStore].
 */
@Component
@Profile("aws")
class S3FileStore(
    private val s3: S3Client,
    private val presigner: S3Presigner,
    @param:Value("\${vita.uploads.bucket:vita-uploads-local}") private val bucket: String,
    @param:Value("\${vita.uploads.url-ttl-seconds:900}") private val ttlSeconds: Long,
) : FileStore {
    private val ttl: Duration = Duration.ofSeconds(ttlSeconds)

    override fun presignPut(contentType: String): PresignedUpload {
        val fileRef = UUID.randomUUID().toString()
        val put =
            PutObjectRequest
                .builder()
                .bucket(bucket)
                .key(keyFor(fileRef))
                .contentType(contentType)
                .build()
        val presigned =
            presigner.presignPutObject(
                PutObjectPresignRequest
                    .builder()
                    .signatureDuration(ttl)
                    .putObjectRequest(put)
                    .build(),
            )
        return PresignedUpload(
            fileRef = fileRef,
            uploadUrl = presigned.url().toString(),
            expiresAt = OffsetDateTime.now().plus(ttl),
        )
    }

    override fun read(fileRef: String): ByteArray {
        val key = keyFor(fileRef)
        return try {
            s3
                .getObjectAsBytes(
                    GetObjectRequest
                        .builder()
                        .bucket(bucket)
                        .key(key)
                        .build(),
                ).asByteArray()
        } catch (_: NoSuchKeyException) {
            throw UnknownFileRefException(fileRef)
        } catch (e: SdkException) {
            // LocalStack/S3 can surface a missing object as a 404 SdkException rather than the typed
            // NoSuchKeyException; treat only genuine not-founds as unknown, rethrow real failures.
            if (e.message?.contains("404") == true) throw UnknownFileRefException(fileRef)
            throw e
        }
    }

    /** fileRefs are opaque UUIDs; validating the shape keeps the S3 key namespace clean and blocks injection. */
    private fun keyFor(fileRef: String): String {
        val id =
            try {
                UUID.fromString(fileRef).toString()
            } catch (_: IllegalArgumentException) {
                throw UnknownFileRefException(fileRef)
            }
        return "plan-documents/$id"
    }
}
