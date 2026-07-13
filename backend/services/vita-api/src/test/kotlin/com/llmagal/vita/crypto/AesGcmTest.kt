package com.llmagal.vita.crypto

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import javax.crypto.AEADBadTagException

class AesGcmTest {
    private val key = ByteArray(32) { it.toByte() }
    private val aad = "user-1".toByteArray()

    @Test
    fun `roundtrip with aad`() {
        val blob = AesGcm.encrypt(key, "two scrambled eggs".toByteArray(), aad)
        assertThat(String(AesGcm.decrypt(key, blob, aad))).isEqualTo("two scrambled eggs")
    }

    @Test
    fun `same plaintext encrypts to different blobs (random iv)`() {
        val p = "latte".toByteArray()
        assertThat(AesGcm.encrypt(key, p)).isNotEqualTo(AesGcm.encrypt(key, p))
    }

    @Test
    fun `tampered ciphertext fails`() {
        val blob = AesGcm.encrypt(key, "secret".toByteArray())
        blob[blob.size / 2] = (blob[blob.size / 2] + 1).toByte()
        assertThatThrownBy { AesGcm.decrypt(key, blob) }.isInstanceOf(AEADBadTagException::class.java)
    }

    @Test
    fun `wrong aad fails`() {
        val blob = AesGcm.encrypt(key, "secret".toByteArray(), aad)
        assertThatThrownBy { AesGcm.decrypt(key, blob, "user-2".toByteArray()) }
            .isInstanceOf(AEADBadTagException::class.java)
    }

    @Test
    fun `wrong key fails`() {
        val blob = AesGcm.encrypt(key, "secret".toByteArray())
        assertThatThrownBy { AesGcm.decrypt(ByteArray(32), blob) }
            .isInstanceOf(AEADBadTagException::class.java)
    }
}
