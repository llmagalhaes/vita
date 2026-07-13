# Backend — Next session

## Current state (Phase 2 session 2, 2026-07-13)

- **Code complete: BE-001/002/003 (W0) + BE-005 (crypto) + BE-006 (magic link) + BE-008 (sessions)** — all In progress on Asana (Done = production, blocked on BE-004/devops). Details in `Progress/BE-00{1,2,3,5,6,8}-Progress.md`.
- **Contract v0.3.0** (BE-015, contract-only, CEO Round 8 #3): added plan/program parse-import for onboarding steps 3–4 — `POST /parse/eating-plan`, `POST /parse/training-program` (drafts-not-saved, shared `PlanImportRequest` = one of `text`/`fileRef`, returning `EatingPlanDraft`/`TrainingProgramDraft`), and `POST /uploads` (presigned S3 PUT; PDF bytes bypass the 10 MB JSON body). ADR-0011. redocly exit 0 (25 cosmetic warnings). App-team review note in `app/Doc/contract-review-v0.md`; **orchestrator must relay to app team**. Devops dependency: S3 plan-doc bucket + presigned PUT + lifecycle expiry (OPS-011).
- **Contract v0.2.0**: app review (APP-001) answered and acked — muscles 11-value enum, `drafts` maxItems 5, `?updatedSince=` declined, TBD markers resolved. ADR-0010. redocly exit 0 (same 21 cosmetic operationId warnings).
- `crypto/` package per ADR-0003: `AesGcm` (GCM, iv‖ct‖tag, AAD), `KeyWrapper` interface + `LocalKeyWrapper` (static-key fake — real KMS impl pending devops CMK), `CryptoService` (per-user DEK in `user_keys`, 15-min cache, service DEK, email blind index, `shred()`).
- `auth/` complete for magic link + sessions: `V002__auth_tokens.sql` (`magic_link_token`, `refresh_token`), `MagicLinkService` (single-use hashed tokens, no-enumeration 202, in-memory rate limits → 429+Retry-After, find-or-create with placeholder name from local-part, deletion cancel), `TokenService` (HS256 JWT 900 s + hashed rotating refresh, family revocation on reuse), `AuthController`, `SecurityConfig` now a real Spring resource server (JwtAuthFilter stub deleted). `Mailer`/`LogMailer` fake SES — link printed to the log (see README "Auth in local dev").
- Config: `vita.crypto.*` + `vita.auth.*` (`AuthProps`); committed dev keys, prod overrides via env from Secrets Manager/KMS. `spring.mvc.problemdetails.enabled=true`.
- **Verified this session**: `./gradlew check` green — 23/23 tests (AesGcm 5, CryptoService 5, AuthFlow 8, Smoke 5); full local loop live (compose up → bootRun → /health 200 → magic-link 202 → verify 200 → /v1/me 401/500-stub → refresh rotate 200 → reuse 401 → sign-out 204 → compose down); redocly exit 0.

### Boot 4 gotchas (still valid, save yourself an hour)

- Canonical web starter `spring-boot-starter-webmvc`; Flyway needs `spring-boot-starter-flyway`; `spring-boot-starter-oauth2-resource-server` works as-is.
- Testcontainers pinned 1.21.4; `RestTestClient.bindToServer()` instead of TestRestTemplate; detekt needs Kotlin 2.0.21 forced on its configuration.
- New this session: detekt caps constructor params at 7 (use `@ConfigurationProperties` like `AuthProps`), and `./gradlew ktlintFormat` fixes style fallout cheaply.

## Next steps

1. **BE-009 (GET/PATCH /v1/me)** — unblocked: replace the MeController stub using CryptoService (decrypt name/email); the AuthFlow test already asserts the route accepts our JWT.
2. **BE-011 (log_entry + POST /entries)** — unblocked: contract 0.2.0 is signed off.
3. **BE-007 (OIDC)** still waits on CEO Google/Apple accounts; **BE-010 (deletion)** can reuse `CryptoService.shred()` + needs the job table (which also owns token purges).
4. **BE-004 (first prod deploy)** — waiting on devops prod environment.

## Blockers / waiting on

- Devops: prod env (BE-004), KMS CMK `vita-app-data` + Secrets Manager entries (real `KeyWrapper` + prod keys), SES sandbox identities (real `Mailer`).
- BE-007: CEO Google/Apple developer accounts (deferred per Round 5).
- Nothing from the app team — contract loop is closed.
