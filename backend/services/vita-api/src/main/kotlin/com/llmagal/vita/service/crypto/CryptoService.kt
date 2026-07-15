package com.llmagal.vita.service.crypto

import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Envelope encryption per ADR-0003 ("encrypt the words, aggregate the numbers").
 *
 * - Per-user DEK: generated at account creation, stored KMS-wrapped in `user_keys`.
 *   Encrypts the user's C3 content; the AAD binds every blob to `userId:context`
 *   (the owning user AND the table.column it belongs to), so a ciphertext cannot be
 *   replayed into another user or another column even if the DB is tampered with.
 * - Service DEK (from config; Secrets Manager in prod): C3 identity fields that
 *   must exist around the account boundary (email, magic-link email).
 * - Blind index: HMAC-SHA256 of the normalized email for login lookup.
 * - Crypto-shred: [shred] deletes the wrapped DEK — every C3 blob of that user,
 *   including inside backups, becomes permanently unreadable.
 */
@Service
class CryptoService(
    private val jdbc: JdbcTemplate,
    private val keyWrapper: KeyWrapper,
    @param:Value("\${vita.crypto.service-dek}") serviceDekB64: String,
    @param:Value("\${vita.crypto.hmac-key}") hmacKeyB64: String,
) {
    private val serviceDek = Base64.getDecoder().decode(serviceDekB64)
    private val hmacKey = Base64.getDecoder().decode(hmacKeyB64)

    // ponytail: plain map + TTL beats a cache library at 5 users; swap for
    // Caffeine if entries or eviction pressure ever become real.
    private val dekCache = ConcurrentHashMap<UUID, CachedDek>()

    /** Generates and persists a wrapped DEK for a new user. Call once, at account creation. */
    fun createUserKey(userId: UUID) {
        val dek = keyWrapper.generateDek()
        jdbc.update("INSERT INTO user_keys (user_id, wrapped_dek) VALUES (?, ?)", userId, dek.wrapped)
        dekCache[userId] = CachedDek(dek.plaintext, Instant.now())
    }

    fun encryptForUser(
        userId: UUID,
        context: String,
        plaintext: ByteArray,
    ): ByteArray = AesGcm.encrypt(dek(userId), plaintext, aad(userId, context))

    fun decryptForUser(
        userId: UUID,
        context: String,
        blob: ByteArray,
    ): ByteArray = AesGcm.decrypt(dek(userId), blob, aad(userId, context))

    fun encryptWithServiceKey(plaintext: ByteArray): ByteArray = AesGcm.encrypt(serviceDek, plaintext)

    fun decryptWithServiceKey(blob: ByteArray): ByteArray = AesGcm.decrypt(serviceDek, blob)

    /** Deterministic blind index for `users.email_hash` — lookup without decrypting. */
    fun emailHash(email: String): ByteArray =
        Mac
            .getInstance("HmacSHA256")
            .apply { init(SecretKeySpec(hmacKey, "HmacSHA256")) }
            .doFinal(email.trim().lowercase().toByteArray())

    /**
     * Crypto-shred: delete the wrapped DEK and forget the cached plaintext.
     * All the user's C3 data is unreadable from this instant (ADR-0003/0004).
     */
    fun shred(userId: UUID) {
        jdbc.update("DELETE FROM user_keys WHERE user_id = ?", userId)
        dekCache.remove(userId)
    }

    private fun dek(userId: UUID): ByteArray {
        val cached = dekCache[userId]
        if (cached != null && cached.loadedAt.plus(DEK_TTL).isAfter(Instant.now())) {
            return cached.plaintext
        }
        dekCache.remove(userId)
        val wrapped =
            jdbc
                .queryForList("SELECT wrapped_dek FROM user_keys WHERE user_id = ?", ByteArray::class.java, userId)
                .firstOrNull() ?: error("No DEK for user $userId (shredded or never created)")
        val plaintext = keyWrapper.unwrap(wrapped)
        dekCache[userId] = CachedDek(plaintext, Instant.now())
        return plaintext
    }

    // AAD = userId:context (context is the table.column, see AadContext). Binds the
    // ciphertext to both its owner and its column; a wrong context fails the GCM tag.
    private fun aad(
        userId: UUID,
        context: String,
    ) = "$userId:$context".toByteArray()

    private data class CachedDek(
        val plaintext: ByteArray,
        val loadedAt: Instant,
    )

    companion object {
        private val DEK_TTL: Duration = Duration.ofMinutes(15)
    }
}

/**
 * Stable AAD contexts (`table.column`) for [CryptoService.encryptForUser] /
 * [CryptoService.decryptForUser]. Centralized so encrypt and decrypt sites — often in
 * different services — can never drift: a mismatch would fail the GCM tag and make the
 * blob unreadable. Same string MUST be used to write and read a given column.
 */
object AadContext {
    const val USER_NAME = "users.name"
    const val ENTRY_DETAIL = "log_entry.detail"
    const val ENTRY_SOURCE_PHRASE = "log_entry.source_phrase"
    const val VACATION_RANGES = "vacation.ranges"

    /** Plan/program docs share one shape across two tables — bind to the table. */
    fun planDoc(table: String) = "$table.doc"
}
