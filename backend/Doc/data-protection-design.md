# Data Protection Design — Vita Backend

> Implements CEO decision 2026-07-13 #7: "store strictly what is necessary; sensitive data must be encrypted."
> Companion to `kickoff-proposal.md` §4 (domain model). Status: awaiting CEO review.
> Design goal: implementable by an AI agent in about a week, on top of plain Kotlin + `javax.crypto` + AWS KMS. No crypto frameworks.

## 1. Classification

Three classes. Every column/field in every migration gets one; a Flyway migration review checks it.

| Class | Definition | Protection |
|---|---|---|
| **C1 — Operational** | Nothing personal: ids, enums, timestamps, job status, hashed tokens | TLS + RDS/S3 at-rest encryption (devops-provided). Nothing extra. |
| **C2 — Pseudonymous health numbers** | Numeric/enum health facts keyed by opaque user id: kcal totals, macro grams, water ml, workout duration, muscle-group enums, entry type + `occurred_at`, habit yes/no dots | Same as C1. Kept plaintext **because trends aggregate them in SQL** (see §3 trade-off). |
| **C3 — Sensitive content** | Anything that names the person or narrates their life: name, email, source phrases, food item names, exercise lists, plan contents, habit names, cycle phase | **Application-level field encryption** (AES-256-GCM, envelope keys via KMS) on top of C1 protections. |

## 2. Data inventory — what we store, why, and what we refuse to store

Per entity of the kickoff domain model. "Not stored" items are deliberate minimization decisions, not omissions.

| Entity | Stored (class) | Why necessary | Deliberately NOT stored |
|---|---|---|---|
| **user** | name (C3), email (C3 + blind index), units, prefs, accent, created_at (C1) | Sign-in consent promises exactly "name and email — nothing else" | Birthdate, gender, height, weight, phone, avatar — the product never asks |
| **auth_identity** | provider, provider_subject (C1) | Account linking | Provider profile payloads, provider access/refresh tokens (id-token verification only, nothing to store) |
| **magic_link_token** | hashed token, email (C3), expiry (C1) | Send + verify the link | Plaintext token; rows purged after 24h (§4) |
| **refresh_token** | hashed token, device label, expiry (C1) | Sessions, per-device revoke | Device model/OS fingerprints, IPs |
| **log_entry** | type, occurred_at, logged_at, input_method, source, estimate flag (C1); `source_phrase` (C3) | Timeline spine; the meal-detail screen quotes the original phrase — product requirement | **Voice audio — never reaches the backend** (app transcribes on device, sends text). Raw transcript beyond the confirmed phrase. Unconfirmed drafts (never persisted — structural, per kickoff §5) |
| **meal_detail** | items jsonb (C3, encrypted blob); denormalized totals kcal/P/C/F (C2 columns) | Detail screen needs items; trends need only the numbers | Photos — **parsed in memory, sent to Claude, discarded; never written to S3 or DB.** Restaurant/location context |
| **water_detail** | amount_ml (C2) | Water card | — |
| **workout_detail** | title + exercises jsonb (C3 blob); duration, kcal, muscle-group enums (C2 columns) | Detail screen; heatmap aggregates muscle enums | **GPS routes/locations — never ingested.** Heart-rate series (v1 features don't use it) |
| **eating_plan / plan_meal / plan_item** | structure + items jsonb (C3 blob); daily kcal/macros (C2) | Plan screen, portion recompute, plan-linked check-ins | Nutritionist's name/contact from the PDF (parse strips it). **Original PDF deleted after user confirms the import** (§4) |
| **training_program** | description + days/exercises jsonb (C3 blob) | Program screen | Gym app credentials (v2 problem) |
| **habit** | name (C3); schedule, enabled, type, plan link (C1) | Habit names are free text and can reveal health/medication facts | — |
| **habit_checkin** | date, yes/no, answered_at (C2) | 14-day dots | Free-text notes (product has none — single yes/no) |
| **integration_connection** | source, state, approved types, last_sync_at (C1) | Integrations screen | Platform tokens (v1 is device-side, there are none) |
| **health_sample** | type, start/end, numeric value (C2); workout payload jsonb (C3); external_id + dedupe hash (C1) | Energy card, imported workouts | Location samples, device serials/names, sample types the user didn't approve — the ingestion endpoint **rejects unapproved and unknown types**, it doesn't quietly keep them |
| **cycle** | latest derived phase + as-of date only (C3) | The Home chip shows one phase | Raw cycle samples, history, symptoms. Excluded from exports by default. (Pending CEO answer to kickoff Q3 — this is the minimal proposal we proceed with.) |
| **export/import jobs** | type, status, S3 ref, error (C1) | Polling | Job params echoing user content; result files expire (§4) |
| **Logs/metrics (CloudWatch)** | request id, route, latency, user id (opaque UUID), AI token counts | Ops | **No PII in log lines, ever**: no emails, no phrases, no Claude request/response bodies. Enforced by a logging convention test that greps structured fields. |

Also not collected anywhere: IP addresses at rest (rate limiting is in-memory), analytics/tracking events, contact lists, advertising ids.

## 3. Encryption

### Layer 0 — everywhere (devops-owned)
TLS 1.2+ in transit; KMS-encrypted RDS storage, S3 (SSE-KMS), Secrets Manager, CloudWatch Logs. This alone covers stolen disks and leaked snapshots. It does **not** cover a leaked DB dump, SQL injection, or an over-privileged query — that is what C3 field encryption is for.

### Layer 1 — C3 field encryption (application-level)

**Mechanism: KMS envelope encryption, two kinds of data keys, ~150 lines of Kotlin.**

- One **KMS CMK** (`vita-app-data`), provisioned by devops, decryptable only by the API task role. Separate from the RDS storage key.
- **Per-user DEK**: 256-bit key generated at account creation (`kms:GenerateDataKey`), stored KMS-wrapped in the `user` row. Encrypts all the user's C3 health content (phrases, item blobs, habit names, cycle phase).
- **Service DEK**: one KMS-wrapped key in Secrets Manager. Encrypts identity fields that must exist around the account boundary (email, name, magic-link email) — needed before a user row exists at signup.
- Cipher: **AES-256-GCM**, random 12-byte IV per value, stored as `bytea` = `iv ‖ ciphertext ‖ tag`. Encrypt/decrypt in the service layer, right at the repository boundary; jsonb C3 payloads are serialized then encrypted as one blob per row.
- Unwrapped DEKs cached in memory (bounded cache, 15-min TTL) so KMS is called once per user per quarter-hour, not per request.
- **Email lookup**: email is encrypted, so uniqueness/login lookup uses a **blind index** — `HMAC-SHA256(email_normalized, hmac_key)` in an indexed column; HMAC key lives in Secrets Manager. Deterministic, so `WHERE email_hash = ?` works; the email itself stays ciphertext.
- Key rotation: KMS CMK auto-rotates (KMS handles it; wrapped DEKs stay valid). `// ponytail: no DEK re-encryption machinery in v1 — add a re-wrap job only if a DEK is ever suspected leaked.`

**The crypto-shredding bonus**: account deletion deletes the wrapped DEK first. From that instant every C3 blob for that user — including copies inside the 35-day RDS backups — is permanently unreadable. Backups stop being a deletion loophole.

### What stays queryable (the trade-off, thought through)

Trends is the whole reason C2 exists. The aggregation endpoints (calorie bars/curve, in/out, macro balance, water, meal-time dots, muscle heatmap, aerobic minutes) are `GROUP BY day` sums over **numbers, enums and timestamps only**. So:

- Plaintext (C2): kcal/macro totals, water ml, durations, muscle-group enums, entry types, timestamps, yes/no dots.
- Ciphertext (C3): every word — what was eaten, what was said, what the habit is called, who the person is.

**Accepted residual risk, stated honestly:** an attacker with full DB read access learns that opaque user `7f3a…` consumed ~2,100 kcal, logged 500 ml water at 13:02 and trained chest on Tuesday — but not their name, email, meals, phrases, habits or cycle. Encrypting C2 too would force every trends chart through client-side or in-app aggregation and buy little (the numbers are meaningless without identity, and identity is C3). This is the deliberate line.

### Claude API boundary
Parse inputs (text, photos, PDFs) necessarily leave for Anthropic's API in plaintext over TLS. Anthropic does not train on API data by default. Requests carry no user identifiers (no email/name/user id in prompts). Question for the CEO in §6 about a zero-data-retention agreement.

## 4. Retention & deletion

| Data | Retention | Mechanism |
|---|---|---|
| Confirmed log entries, plans, habits, health samples | Life of the account — **the log is the product**; users delete individual entries anytime via the API | Row delete |
| Photos | **Zero** — never persisted | In-memory parse only |
| Imported PDFs (S3 uploads) | Until import confirmed + 7 days, or 30 days unconfirmed | Delete on confirm (job); S3 lifecycle 30d as backstop |
| Export PDFs (S3) | 30 days | S3 lifecycle |
| Magic-link tokens | 15-min validity; rows purged 24h after expiry/consumption | Daily cleanup job (existing job table) |
| Refresh tokens | Purged 30 days after expiry/revocation | Same job |
| Cycle phase | Latest value only — each sync overwrites | Upsert, no history |
| Jobs | 30 days after terminal state | Same cleanup job |
| CloudWatch logs | Per devops policy (no PII in them by contract) | devops |
| DB backups | 35 days (devops) — deleted users' C3 unreadable inside them via crypto-shredding | Backup expiry |

**Account deletion** (`DELETE /v1/account`, in-app): synchronously revoke all tokens and **delete the wrapped DEK** (instant crypto-shred), then a hard-delete job removes all rows and S3 objects. No soft-delete, no export-before-delete upsell. Grace period pending CEO (kickoff Q5); default is immediate.

## 5. Enforcement so this survives contact with development

- Every Flyway migration PR states the class of each new column (one-line table in the PR description).
- A repository-layer test fixture asserts C3 columns are `bytea` and unreadable as text straight from the DB (Testcontainers: insert via service, `SELECT` raw, assert no plaintext substring).
- Log-line PII test as in §2.
- The parse endpoints have no persistence dependency to inject — drafts structurally cannot be stored.

## 6. Questions for the CEO

1. **Cycle minimalism** (carries kickoff Q3): confirmed that storing only the latest derived phase — no history, excluded from exports by default — is acceptable?
2. **Anthropic zero-data-retention**: want us to request a ZDR arrangement for the Claude API key (available to API customers), or is default no-training + our no-identifiers rule sufficient for v1?
3. **Deletion grace period** (carries kickoff Q5): immediate crypto-shred as designed, or a grace window?
