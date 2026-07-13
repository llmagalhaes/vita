# BE-006 · Magic-link auth: request + verify — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368580/task/1216523338586974
- **Status**: In progress — code complete + tested locally 2026-07-13; Done blocked on SES identities (devops) and production deploy (BE-004).

## 2026-07-13 — implementation

- `V002__auth_tokens.sql`: `magic_link_token` (SHA-256 token hash C1, `email_enc` C3 via service DEK, 15-min expiry, `consumed_at`) + `refresh_token` (for BE-008).
- `MagicLinkService`:
  - request: single-use 256-bit token, stored hashed; identical 202 registered-or-not (no enumeration); rate-limited per email (3/15 min, keyed by blind index — no plaintext emails in memory) and per IP (10/15 min, in-memory per ADR-0003 no-IPs-at-rest) → 429 + `Retry-After`.
  - verify: atomic consume (`UPDATE … WHERE consumed_at IS NULL RETURNING`), find-or-create by email blind index, per-user DEK created at signup, placeholder name from email local-part (app review pt 1), sign-in cancels pending deletion (ADR-0004), returns TokenPair.
- `Mailer` interface; `LogMailer` local fake logs the link (SES implementation comes with devops sandbox identities — WireMock-stubbed SES test deferred to that change, the seam is the interface).
- `AuthController`: `/v1/auth/magic-link` + `/verify` per contract v0.2.0; errors RFC 7807.
- Tests green (`AuthFlowTest`, Testcontainers, end-to-end over HTTP): full flow issues working pair, single-use enforcement, same-account on re-sign-in, deletion cancel, per-email 429 with Retry-After, invalid email 400, no plaintext email at rest in `users` or `magic_link_token`.
- Full local loop verified live: compose up → bootRun → 202 → link from log → verify 200 → tokens work.

## Remaining for Done

- SES `Mailer` implementation (devops sandbox identities ticket) — token purge job rides the future job table (BE-010 territory).
- Production deploy (BE-004).
