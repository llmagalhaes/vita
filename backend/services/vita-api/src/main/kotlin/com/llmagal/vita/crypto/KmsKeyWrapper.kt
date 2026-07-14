package com.llmagal.vita.crypto

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.kms.KmsClient
import software.amazon.awssdk.services.kms.model.DataKeySpec
import software.amazon.awssdk.services.kms.model.DecryptRequest
import software.amazon.awssdk.services.kms.model.GenerateDataKeyRequest

/**
 * Real KMS-backed [KeyWrapper] (BE-027) — the security value of the envelope scheme (ADR-0003).
 *
 * generateDek asks KMS for a fresh data key: KMS returns the DEK in plaintext AND wrapped
 * (encrypted under the CMK). We keep only the wrapped blob at rest (`user_keys.wrapped_dek`);
 * the plaintext lives in memory for the request/DEK-cache TTL and is never persisted.
 * unwrap sends the wrapped blob back to KMS to recover the plaintext DEK — KMS reads which CMK
 * from the blob's metadata, so no key id is needed on decrypt.
 *
 * The plaintext DEK is a raw 256-bit key [CryptoService] hands straight to AES-256-GCM, exactly
 * as it does with [LocalKeyWrapper]'s output — this bean only changes how the DEK is wrapped.
 * Active under the `aws` profile (LocalStack KMS in tests, real CMK in prod).
 */
@Component
@Profile("aws")
class KmsKeyWrapper(
    private val kms: KmsClient,
    @param:Value("\${vita.crypto.kms-key-alias:alias/vita-app-data}") private val keyId: String,
) : KeyWrapper {
    override fun generateDek(): Dek {
        val resp =
            kms.generateDataKey(
                GenerateDataKeyRequest
                    .builder()
                    .keyId(keyId) // alias — KMS resolves it (the underlying key id rotates per boot in LocalStack)
                    .keySpec(DataKeySpec.AES_256)
                    .build(),
            )
        return Dek(
            plaintext = resp.plaintext().asByteArray(),
            wrapped = resp.ciphertextBlob().asByteArray(),
        )
    }

    override fun unwrap(wrapped: ByteArray): ByteArray =
        kms
            .decrypt(
                DecryptRequest.builder().ciphertextBlob(SdkBytes.fromByteArray(wrapped)).build(),
            ).plaintext()
            .asByteArray()
}
