package com.llmagal.vita.service.crypto

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-256-GCM helpers per ADR-0003: random 12-byte IV, 128-bit tag,
 * blob layout = iv ‖ ciphertext ‖ tag (the JCE cipher appends the tag itself).
 * AAD binds a ciphertext to its context (e.g. the owning user id).
 */
object AesGcm {
    const val KEY_BYTES = 32
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
    private val random = SecureRandom()

    fun encrypt(
        key: ByteArray,
        plaintext: ByteArray,
        aad: ByteArray = ByteArray(0),
    ): ByteArray {
        require(key.size == KEY_BYTES) { "AES-256 key must be 32 bytes" }
        val iv = ByteArray(IV_BYTES).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, iv))
        if (aad.isNotEmpty()) cipher.updateAAD(aad)
        return iv + cipher.doFinal(plaintext)
    }

    /** Throws [javax.crypto.AEADBadTagException] on tamper, wrong key, or wrong AAD. */
    fun decrypt(
        key: ByteArray,
        blob: ByteArray,
        aad: ByteArray = ByteArray(0),
    ): ByteArray {
        require(key.size == KEY_BYTES) { "AES-256 key must be 32 bytes" }
        require(blob.size > IV_BYTES) { "blob too short to contain iv + tag" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES),
        )
        if (aad.isNotEmpty()) cipher.updateAAD(aad)
        return cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
    }
}
