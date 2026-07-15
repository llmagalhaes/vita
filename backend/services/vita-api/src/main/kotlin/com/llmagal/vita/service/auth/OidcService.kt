package com.llmagal.vita.service.auth

import com.llmagal.vita.repository.auth.OidcIdentityRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/**
 * Sign in with a Google/Apple id token (BE-007, ADR-0015). Verifies the token, then
 * find-or-creates the user keyed on (provider, subject), linking to an existing
 * account by verified email so OIDC and magic-link converge on one session model
 * (same [TokenService] issuance). Signing in cancels a pending deletion (ADR-0004).
 */
@Service
class OidcService(
    private val verifier: OidcVerifier,
    private val identities: OidcIdentityRepository,
    private val accounts: UserAccounts,
    private val tokens: TokenService,
) {
    fun signIn(
        provider: String,
        idToken: String,
        nonce: String?,
        name: String?,
    ): TokenPair {
        if (idToken.isBlank()) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "idToken is required.")
        val identity = verifier.verify(provider, idToken, nonce)
        val userId = resolveUser(provider, identity, name)
        accounts.cancelPendingDeletion(userId)
        return tokens.issue(userId)
    }

    private fun resolveUser(
        provider: String,
        identity: VerifiedIdentity,
        requestName: String?,
    ): UUID {
        // 1. Known identity → its user, verbatim.
        identities.findUser(provider, identity.subject)?.let { return it }
        // A first sign-in needs a verified email to create or link an account.
        val email =
            identity.email
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Id token has no verified email.")
        // 2. Link to an existing account by verified email, else 3. create one.
        // Apple only reveals the name to the app (first authorization), passed as `requestName`;
        // Google carries it in the token (identity.name). Either seeds the placeholder.
        val userId = accounts.findByEmail(email) ?: accounts.create(email, identity.name ?: requestName)
        identities.link(provider, identity.subject, userId)
        return userId
    }
}
