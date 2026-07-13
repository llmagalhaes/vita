# BE-005 · Crypto plumbing: per-user DEKs + field encryption — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216514543263820
- **Status**: In progress — code complete + tested locally 2026-07-13; Done blocked on production (BE-004) and the real KMS CMK (devops).

## 2026-07-13 — implementation

- `crypto/` package (flat, ADR-0001), three files, per ADR-0003:
  - `AesGcm.kt` — AES-256-GCM, random 12-byte IV, 128-bit tag, blob = iv‖ct‖tag, AAD support. Pure `javax.crypto`, no libraries.
  - `KeyWrapper.kt` — the one seam to KMS: `generateDek()/unwrap()`. `LocalKeyWrapper` wraps under a static master key from config; the KMS implementation (CMK `vita-app-data`) replaces the bean when devops provisions it. Tests never touch AWS.
  - `CryptoService.kt` — per-user DEK lifecycle against the existing `user_keys` table: create-on-signup, in-memory cache with 15-min TTL (plain map — ponytail: Caffeine only if pressure appears), AAD = owning user id, service-DEK encrypt/decrypt for account-boundary fields, `emailHash()` blind index (HMAC-SHA256, normalized), `shred()` = delete wrapped DEK + evict cache.
- Local/CI keys are committed dev defaults in `application.yaml` (protect throwaway data only); prod overrides via env from Secrets Manager/KMS — devops tickets already filed per Next_session.
- Tests (all green): AES roundtrip, random-IV distinctness, tamper detection, wrong-AAD/wrong-key rejection (`AesGcmTest`); DEK roundtrip with no plaintext at rest, cross-user AAD rejection, crypto-shred permanence, blind-index determinism/normalization, service-key roundtrip (`CryptoServiceTest`, Testcontainers).

## Remaining for Done

- KMS `KeyWrapper` implementation once devops delivers the CMK + Secrets Manager entries.
- Deployed to production (BE-004).
