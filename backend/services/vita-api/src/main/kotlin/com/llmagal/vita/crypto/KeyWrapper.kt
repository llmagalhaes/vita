package com.llmagal.vita.crypto

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.util.Base64

/**
 * Wraps/unwraps per-user DEKs. The one seam between our crypto and AWS KMS:
 * production gets a KMS implementation (CMK `vita-app-data`, devops ticket);
 * local dev and CI use [LocalKeyWrapper] so tests never touch AWS.
 */
interface KeyWrapper {
    /** Returns a fresh 256-bit DEK in both forms. */
    fun generateDek(): Dek

    fun unwrap(wrapped: ByteArray): ByteArray
}

data class Dek(
    val plaintext: ByteArray,
    val wrapped: ByteArray,
)

/**
 * Stand-in for KMS: wraps DEKs with AES-256-GCM under a static master key
 * from config. ponytail: only impl until devops provisions the CMK — the
 * KMS impl replaces this bean via config, nothing else changes.
 */
@Component
class LocalKeyWrapper(
    @param:Value("\${vita.crypto.master-key}") masterKeyB64: String,
) : KeyWrapper {
    private val masterKey = Base64.getDecoder().decode(masterKeyB64)
    private val random = SecureRandom()

    override fun generateDek(): Dek {
        val dek = ByteArray(AesGcm.KEY_BYTES).also(random::nextBytes)
        return Dek(plaintext = dek, wrapped = AesGcm.encrypt(masterKey, dek))
    }

    override fun unwrap(wrapped: ByteArray): ByteArray = AesGcm.decrypt(masterKey, wrapped)
}
