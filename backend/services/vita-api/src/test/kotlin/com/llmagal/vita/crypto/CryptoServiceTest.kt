package com.llmagal.vita.crypto

import com.llmagal.vita.TestcontainersConfig
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

/** BE-005 acceptance: DEK lifecycle, AAD binding, blind index, crypto-shred (ADR-0003). */
@SpringBootTest
@Import(TestcontainersConfig::class)
class CryptoServiceTest {
    @Autowired
    lateinit var crypto: CryptoService

    @Autowired
    lateinit var jdbc: JdbcTemplate

    private fun newUser(): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO users (id, email_hash, email_enc) VALUES (?, ?, ?)",
            id,
            crypto.emailHash("$id@test"),
            crypto.encryptWithServiceKey("$id@test".toByteArray()),
        )
        crypto.createUserKey(id)
        return id
    }

    @Test
    fun `per-user roundtrip and raw column stores no plaintext`() {
        val userId = newUser()
        val blob = crypto.encryptForUser(userId, "ate a banana at the beach".toByteArray())
        assertThat(String(crypto.decryptForUser(userId, blob))).isEqualTo("ate a banana at the beach")
        assertThat(String(blob, Charsets.ISO_8859_1)).doesNotContain("banana")
    }

    @Test
    fun `ciphertext is bound to its owner - another user cannot decrypt`() {
        val alice = newUser()
        val mallory = newUser()
        val blob = crypto.encryptForUser(alice, "private".toByteArray())
        assertThatThrownBy { crypto.decryptForUser(mallory, blob) }.isInstanceOf(Exception::class.java)
    }

    @Test
    fun `shredding the DEK makes ciphertext permanently unreadable`() {
        val userId = newUser()
        val blob = crypto.encryptForUser(userId, "to be forgotten".toByteArray())
        crypto.shred(userId)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM user_keys WHERE user_id = ?", Int::class.java, userId))
            .isZero()
        assertThatThrownBy { crypto.decryptForUser(userId, blob) }.isInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `blind index is deterministic and normalizes case and whitespace`() {
        assertThat(crypto.emailHash("  Ada@Example.COM ")).isEqualTo(crypto.emailHash("ada@example.com"))
        assertThat(crypto.emailHash("ada@example.com")).isNotEqualTo(crypto.emailHash("bob@example.com"))
    }

    @Test
    fun `service key roundtrip`() {
        val blob = crypto.encryptWithServiceKey("ada@example.com".toByteArray())
        assertThat(String(crypto.decryptWithServiceKey(blob))).isEqualTo("ada@example.com")
        assertThat(String(blob, Charsets.ISO_8859_1)).doesNotContain("ada@example.com")
    }
}
