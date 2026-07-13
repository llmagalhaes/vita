# BE-008 · Sessions: JWT access + refresh rotation + sign-out — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216517969774190
- **Status**: In progress — code complete + tested locally 2026-07-13; Done blocked on production deploy (BE-004).

## 2026-07-13 — implementation

- Replaced the BE-001 `JwtAuthFilter` stub with Spring's OAuth2 resource server (`spring-boot-starter-oauth2-resource-server`): bearer JWT required on all protected routes, 401 always RFC 7807 problem+json. HS256 with a shared secret (one service signs and verifies its own tokens; asymmetric keys buy nothing here) — secret from config, Secrets Manager in prod.
- `TokenService`: access JWT (sub = user id, 900 s) via `NimbusJwtEncoder`; opaque 256-bit refresh tokens stored SHA-256-hashed, 60-day expiry, `family_id` per sign-in.
  - `/v1/auth/refresh`: single-use rotation via atomic `UPDATE … RETURNING`; reuse of a rotated (or expired/unknown) token revokes the whole family → 401.
  - `/v1/auth/sign-out`: revoke, 204 idempotent.
- `AuthProps` (`vita.auth.*` config properties): jwt secret, TTLs, magic-link base URL, rate limits.
- Tests green (`AuthFlowTest`): rotation returns a new pair, reuse kills old and new tokens, sign-out idempotent + refresh-after-signout 401, resource server accepts issued access token on a protected route (and SmokeTest still proves 401 without one). Verified live via curl in the local loop.

## Remaining for Done

- Production deploy (BE-004). Refresh-token purge job comes with the cleanup job table (BE-010).
