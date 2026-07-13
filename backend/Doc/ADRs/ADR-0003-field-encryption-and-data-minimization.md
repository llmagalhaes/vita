# ADR-0003 — Field encryption, crypto-shredding, and data minimization

**Status:** Accepted — 2026-07-13 (full design: `../data-protection-design.md`)

## Context

CEO premise: store strictly what is necessary; sensitive data encrypted. RDS/S3 at-rest encryption does not cover a leaked dump or an over-privileged query. Trends must still aggregate in SQL (ADR-0002).

## Decision

**Encrypt the words, aggregate the numbers.** Three classes: C1 operational (ids, enums, hashed tokens — TLS + at-rest only), C2 pseudonymous health numbers (kcal/macro totals, water ml, durations, muscle enums, timestamps — plaintext columns so SQL can aggregate), C3 sensitive content (name, email, source phrases, item names, habit names, cycle phase — application-level encryption).

Mechanism: KMS envelope encryption, one CMK (`vita-app-data`), **per-user 256-bit DEK** stored KMS-wrapped in the user row; a service DEK (Secrets Manager) for identity fields needed around the account boundary. Cipher **AES-256-GCM**, random 12-byte IV, `bytea` = `iv ‖ ciphertext ‖ tag`, applied at the repository boundary. Email lookup via HMAC-SHA256 blind index. DEKs cached in memory, 15-min TTL. Deleting the wrapped DEK = **crypto-shredding**: all the user's C3 data, including inside 35-day backups, becomes unreadable.

Non-storage list (deliberate refusals): **photos parsed in-memory only, never persisted; no voice audio (app transcribes on device); no GPS/routes; no IPs at rest; no push tokens; no birthdate/gender/height/weight; cycle = latest derived phase only; imported PDFs deleted after import confirmation (30-day S3 lifecycle backstop); no PII in logs** (enforced by test).

## Consequences

- Accepted residual risk, stated honestly: full DB read reveals that opaque user X consumed ~2,100 kcal Tuesday — but not who they are or what they ate.
- Every migration PR states the class of each new column; a Testcontainers fixture asserts C3 columns are unreadable as raw text.
- No DEK re-wrap machinery in v1 (KMS CMK auto-rotation covers rotation); add only if a DEK is suspected leaked.
