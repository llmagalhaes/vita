package com.llmagal.vita.uploads

import com.llmagal.vita.aws.AwsClientsConfig
import com.llmagal.vita.uploads.service.S3FileStore
import com.llmagal.vita.uploads.service.UnknownFileRefException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URI
import java.util.UUID

/**
 * BE-026 — the real S3 [S3FileStore] presigner against LocalStack. Excluded from `./gradlew check`
 * (tag `localstack`); run with `docker compose --profile localstack up -d` then `./gradlew localstackTest`.
 *
 * Proves the full round-trip: presign a PUT → upload bytes to that URL → read the object back.
 */
@Tag("localstack")
class S3FileStoreLocalStackTest {
    private val endpoint = "http://localhost:4566"

    // AwsClientsConfig is the production wiring — reuse it as the client factory so the test
    // exercises exactly the endpoint/creds/path-style setup prod (minus endpoint) uses.
    private val aws = AwsClientsConfig(region = "eu-west-1", endpointOverride = endpoint)
    private val store =
        S3FileStore(
            s3 = aws.s3Client(),
            presigner = aws.s3Presigner(),
            bucket = "vita-uploads-local",
            ttlSeconds = 900,
        )

    @Test
    fun `presign PUT, upload bytes, read them back`() {
        assumeLocalStackUp()
        val pdf = "%PDF-1.4 vita plan fixture ${UUID.randomUUID()}".toByteArray()

        val upload = store.presignPut("application/pdf")
        assertThat(upload.fileRef).isNotBlank()
        assertThat(upload.uploadUrl).contains(endpoint)

        putBytes(upload.uploadUrl, "application/pdf", pdf)

        assertThat(store.read(upload.fileRef)).isEqualTo(pdf)
    }

    @Test
    fun `read of a never-uploaded ref throws UnknownFileRefException`() {
        assumeLocalStackUp()
        assertThatThrownBy { store.read(UUID.randomUUID().toString()) }
            .isInstanceOf(UnknownFileRefException::class.java)
    }

    @Test
    fun `read of a non-uuid ref throws instead of hitting S3`() {
        assertThatThrownBy { store.read("../../etc/passwd") }
            .isInstanceOf(UnknownFileRefException::class.java)
    }

    private fun putBytes(
        url: String,
        contentType: String,
        body: ByteArray,
    ) {
        val conn = URI.create(url).toURL().openConnection() as HttpURLConnection
        conn.requestMethod = "PUT"
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", contentType) // must match the presigned content-type
        conn.outputStream.use { it.write(body) }
        check(conn.responseCode in 200..299) { "S3 PUT failed: ${conn.responseCode}" }
        conn.disconnect()
    }

    private fun assumeLocalStackUp() =
        assumeTrue(
            runCatching { Socket("localhost", 4566).close() }.isSuccess,
            "LocalStack not reachable on :4566 — run `docker compose --profile localstack up -d`",
        )
}
