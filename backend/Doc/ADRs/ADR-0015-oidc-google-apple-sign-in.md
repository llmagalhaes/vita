# ADR-0015 — OIDC sign-in (Google + Apple): id-token verification, find-or-create, linking

**Status:** Accepted — 2026-07-15 (BE-007; contract `/auth/oidc`, already specced in v0)

## Context

The contract has always carried `POST /auth/oidc` (provider `google|apple`,
`idToken`, `nonce?`, `name?`): the app does native sign-in and posts the provider
id token; the backend verifies it and issues the same session as magic-link. It
was the last unshipped auth path. Verification is a security boundary — a wrong
`aud`/`iss`, an expired token, a bad signature, or a replayed nonce must all be
rejected — so the negative cases matter more than the happy path.

## Decision

### Verify with Spring Security's `NimbusJwtDecoder`, one per provider (no new dep)

`spring-boot-starter-oauth2-resource-server` already ships `nimbus-jose-jwt` and
`NimbusJwtDecoder`. We reuse it rather than hand-roll JOSE:

- `NimbusJwtDecoder.withJwkSetUri(jwksUri).jwsAlgorithm(RS256)` fetches and
  **caches** the provider JWKS (Nimbus `RemoteJWKSet` — held in memory, refreshed
  on an unknown `kid`), validates the RS256 signature and `exp`. Built **lazily**
  per provider (`ConcurrentHashMap`), so there is no JWKS fetch at boot.
- Composed validators (`DelegatingOAuth2TokenValidator`): timestamp (`exp`, 60 s
  skew), **issuer** and **audience**.
  - **Issuer** is a hardcoded provider constant, not config (it never varies):
    Google accepts both `https://accounts.google.com` and `accounts.google.com`
    (Google mints either); Apple only `https://appleid.apple.com`.
  - **Audience** = the OAuth client id, from config (see below). The token's
    `aud` must contain it.
- **Nonce** is checked in code, not as a static validator (it is per-request):
  when the app sent a `nonce`, the token's `nonce` claim must equal it (mismatch
  or absent → 401).
- **Email** is taken only when the token asserts it verified (`email_verified`
  true; Apple sends the string `"true"`, Google a JSON boolean). An unverified or
  absent email is treated as no email.

Any verification failure → **401**. `NimbusJwtDecoder` is the only JOSE code we
run; we do not parse or validate JWTs ourselves.

### Audience from config, fail closed — SSM `google-client-config` / `apple-client-config`

`vita.oidc.<provider>.audience` binds to the SSM-backed env vars
(`GOOGLE_OIDC_AUDIENCE` / `APPLE_OIDC_AUDIENCE`); `jwks-uri` is the fixed provider
URL (overridden to a WireMock stub in tests). Both are **blank in dev**, keeping
`./gradlew check` AWS-free. **A blank audience makes that provider fail closed —
503 (`sign-in is not configured`)** — the endpoint never accepts a token whose
audience it cannot check.

### Find-or-create keyed on (provider, subject), link by verified email

New table `oidc_identity (provider, subject, user_id)` (V007) maps a verified
provider identity to a Vita user. Resolution (in `OidcService`):

1. **Known identity** — `(provider, subject)` already linked → that user, verbatim.
2. **Link by verified email** — else, if the token has a verified email that
   matches an existing account (blind-index lookup), link a new `oidc_identity`
   row to it. So Google-then-Apple on the same verified email converges on one
   account.
3. **Create** — else create a user (same envelope as magic-link) and link.

A first sign-in with **no verified email** is a 401 — we cannot provision or link
an account without one. `subject` is the provider's opaque `sub` (C1, not
readable PII); email/name stay encrypted in `users`. Nothing extra is stored
(data minimization, ADR-0003); `oidc_identity` cascades on the account-deletion
hard-delete + crypto-shred (ADR-0004).

### Converge on one session + provisioning model

- Session issuance is `TokenService.issue` — the **same `TokenPair`** as
  magic-link, so refresh/rotation/sign-out are identical downstream.
- User creation moved into a shared `UserAccounts` service (`findByEmail`,
  `create`, `cancelPendingDeletion`) used by **both** magic-link and OIDC, so the
  crypto envelope (email blind index + service-DEK email + per-user DEK +
  encrypted placeholder name) can never drift between the two paths.
- **Sign-in cancels a pending deletion** (ADR-0004), like magic-link/refresh.
- **Name**: Google carries it in the token; Apple only reveals it to the app on
  first authorization and it is absent from the token, so the app passes it as
  `name` — either seeds the placeholder on create; absent → placeholder from the
  email local-part (user renames in onboarding via PATCH /me).

## Consequences

- No new dependency; no contract change (`/auth/oidc` was already in v0).
- The only per-deployment config is the two client ids (audiences); the CEO
  provisions the Google/Apple OAuth clients and drops the ids into the SSM params.
- JWKS caching is the library's `RemoteJWKSet` default (refresh on unknown kid) —
  adequate at ~5 users; revisit only if a provider key rotation ever misbehaves.
- Verification is unit-tested against a WireMock JWKS with an RSA key we control
  (happy path + wrong aud + wrong iss + expired + bad signature + nonce
  mismatch/missing + unverified email + unconfigured-audience 503); find-or-create,
  email-linking and delete-cancel are covered by a Testcontainers flow test.
