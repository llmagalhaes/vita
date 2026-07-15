# BE-007 — Google/Apple id-token sign-in (`POST /v1/auth/oidc`)

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216519895528720
ADR: `backend/Doc/ADRs/ADR-0015-oidc-google-apple-sign-in.md`
Status: **implemented + green locally (session 15, 2026-07-15)**. In progress on Asana
— NOT in the live image `a03e194`; ships in the next image. Blocked on devops redeploy
+ CEO OAuth client ids (fail-closed 503 until configured).

## What shipped (to contract, no contract change — `/auth/oidc` was already in v0)

- **`POST /v1/auth/oidc`** (`controller/auth/AuthController.OidcRequest`): `provider`
  (`google|apple`), `idToken`, `nonce?`, `name?` → `TokenPair` (200), same session as
  magic-link. Public route (already covered by `SecurityConfig` `/v1/auth/**`).
- **Verification — `service/auth/OidcVerifier`** (reuses Spring Security
  `NimbusJwtDecoder`, **no new dependency** — nimbus-jose-jwt already ships with the
  resource server):
  - JWKS fetched + cached per provider (Nimbus `RemoteJWKSet`, refresh on unknown kid),
    decoder built **lazily** (no JWKS fetch at boot). RS256 only.
  - Validators: `exp` (JwtTimestampValidator, 60s skew), **issuer** (Google accepts both
    `https://accounts.google.com` and scheme-less `accounts.google.com`; Apple only
    `https://appleid.apple.com` — read `iss` as a **string** claim, since the scheme-less
    form is not a valid URL and `jwt.issuer` would throw), **audience** (token `aud` must
    contain the configured client id).
  - **nonce** checked in code (per-request, not a static claim): when the app sent one,
    the token's `nonce` must equal it.
  - **email** taken only when `email_verified` is truthy (Google boolean `true`, Apple
    string `"true"`); unverified/absent → treated as no email.
  - **Fail closed**: unconfigured audience → **503** (never accept an unverifiable token);
    any verification failure → **401**; unknown provider → **400**.
- **Find-or-create — `service/auth/OidcService` + `repository/auth/OidcIdentityRepository`
  + migration `V007__oidc_identity.sql`** (`(provider, subject)` PK → `user_id`, cascade):
  1. known `(provider, subject)` → its user;
  2. else link to an existing account by **verified email** (blind-index lookup);
  3. else create. First sign-in with **no verified email → 401** (can't provision/link).
  - `subject` is the opaque provider `sub` (C1, not readable PII); email/name stay
    encrypted in `users`. Nothing extra stored (data minimization, ADR-0003).
- **Convergence — `service/auth/UserAccounts`** (new shared service): `findByEmail`,
  `create` (same envelope: email blind index + service-DEK email + per-user DEK +
  encrypted placeholder name), `cancelPendingDeletion`. **Both** magic-link and OIDC use
  it, so the crypto envelope can never drift between paths. `MagicLinkService` refactored
  onto it (its inline find-or-create/create deleted).
  - Sign-in **cancels a pending deletion** (ADR-0004), like magic-link/refresh.
  - **Name**: Google carries it in the token; Apple passes it as `name` on first sign-in
    (absent from the token). Either seeds the placeholder; absent → email local-part.

## Config

`vita.oidc.<google|apple>.{audience,jwks-uri}` (`config/OidcProps`, `@ConfigurationPropertiesScan`).
- `audience` ← env `GOOGLE_OIDC_AUDIENCE` / `APPLE_OIDC_AUDIENCE` (devops maps the SSM
  params `google-client-config` / `apple-client-config` → these). **Blank in dev** →
  provider fails closed (503), so `./gradlew check` stays AWS-free and no unverified token
  is ever accepted.
- `jwks-uri` defaults to the real provider URL; tests override to a WireMock stub.
- Issuers are hardcoded provider constants in `OidcVerifier` (they never vary).

## Tests (this is the security path — negatives are the point)

- **`OidcVerifierTest`** (unit, WireMock JWKS, RSA key we control — mints tokens the way
  Google/Apple do): valid Google; Google scheme-less issuer; valid Apple (`email_verified`
  as string); wrong aud; wrong iss; Apple-issuer-on-Google; expired; **bad signature**
  (key not in JWKS); nonce mismatch; missing token nonce when expected; matching nonce;
  unverified email dropped; absent email null; **unconfigured audience → 503**; unknown
  provider → 400.
- **`OidcFlowTest`** (`@SpringBootTest` RANDOM_PORT + Testcontainers, WireMock JWKS via
  `@DynamicPropertySource`): first Google sign-in creates a working account (/me, identity
  row, no plaintext email at rest); same subject twice → one account; **Google-then-Apple
  same verified email links to one user**; sign-in cancels a pending deletion; Apple name
  on first sign-in; unverified email can't create (401); forged token → 401 problem+json;
  unknown provider → 400.
- Shared helper `OidcTestTokens` (RSA keygen + JWK set + signer via nimbus-jose-jwt).

## Verify

`./gradlew check` green — **147 tests, 0 failures** (was 124 at `881834f`; +16 OidcVerifierTest,
+7 OidcFlowTest), detekt + ktlint clean. Contract unchanged (redocly N/A). Not deployed yet.

## Also in this session (BE-028 residual debt)

- **Jackson 2→3 convergence in `ClaudeClient`** (the documented BE-013/BE-028 debt):
  ClaudeClient + the eval helper `ParseEvalCases` now use Jackson 3 (`tools.jackson`) like
  the rest of the service (`jacksonMapperBuilder()`, `asText()`→`asString()`,
  `tools.jackson.core.JacksonException`). Removed `com.fasterxml.jackson.module:jackson-module-kotlin`
  from `build.gradle.kts` — only shared `jackson-annotations` remains (transitive). Verified
  against the WireMock golden-response parse tests (ParseFlowTest/ParseEvalTest green). The
  dual-mapper debt is retired.
