package com.llmagal.vita.crypto

import com.llmagal.vita.config.AwsClientsConfig
import com.llmagal.vita.service.crypto.AesGcm
import com.llmagal.vita.service.crypto.KmsKeyWrapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.net.Socket

/**
 * BE-027 — the real KMS [KmsKeyWrapper] envelope against LocalStack KMS. Excluded from
 * `./gradlew check` (tag `localstack`); run with `docker compose --profile localstack up -d`
 * then `./gradlew localstackTest`.
 *
 * Proves: (1) wrap→unwrap round-trips the plaintext DEK, (2) the wrapped blob is NOT the
 * plaintext, and (3) the DEK KMS returns composes with the same AES-256-GCM path CryptoService
 * uses — it still decrypts a ciphertext after a KMS unwrap.
 */
@Tag("localstack")
class KmsKeyWrapperLocalStackTest {
    // AwsClientsConfig is the production wiring — reuse it as the KMS client factory.
    private val aws = AwsClientsConfig(region = "eu-west-1", endpointOverride = "http://localhost:4566")
    private val wrapper = KmsKeyWrapper(kms = aws.kmsClient(), keyId = "alias/vita-app-data")

    @Test
    fun `generateDek returns a 256-bit plaintext DEK and a wrapped blob that is not the plaintext`() {
        assumeLocalStackUp()
        val dek = wrapper.generateDek()

        assertThat(dek.plaintext).hasSize(AesGcm.KEY_BYTES) // 32 bytes = AES-256, what AesGcm expects
        assertThat(dek.wrapped).isNotEqualTo(dek.plaintext)
        // KMS ciphertext carries CMK metadata, so it is strictly larger than the raw 32-byte key.
        assertThat(dek.wrapped.size).isGreaterThan(dek.plaintext.size)
    }

    @Test
    fun `unwrap round-trips the plaintext DEK`() {
        assumeLocalStackUp()
        val dek = wrapper.generateDek()
        assertThat(wrapper.unwrap(dek.wrapped)).isEqualTo(dek.plaintext)
    }

    @Test
    fun `the KMS-wrapped DEK composes with AES-GCM - it still decrypts an entry after unwrap`() {
        assumeLocalStackUp()
        val dek = wrapper.generateDek()

        // Exactly what CryptoService does: encrypt content under the plaintext DEK...
        val plaintext = "ate two scrambled eggs and a latte".toByteArray()
        val ciphertext = AesGcm.encrypt(dek.plaintext, plaintext)

        // ...and later decrypt using the DEK recovered via a KMS unwrap of the stored wrapped blob.
        val recoveredDek = wrapper.unwrap(dek.wrapped)
        assertThat(String(AesGcm.decrypt(recoveredDek, ciphertext))).isEqualTo("ate two scrambled eggs and a latte")
    }

    private fun assumeLocalStackUp() =
        assumeTrue(
            runCatching { Socket("localhost", 4566).close() }.isSuccess,
            "LocalStack not reachable on :4566 — run `docker compose --profile localstack up -d`",
        )
}
