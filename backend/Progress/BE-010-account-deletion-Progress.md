# BE-010 · Account deletion: 7-day grace + crypto-shred job

Asana: https://app.asana.com/0/1216519867368580/1216521831716302
ADRs: ADR-0004 (account deletion), ADR-0007 (Postgres job queue). Status: In progress (Done = production).

## What shipped (session 5, 2026-07-13)

New package `account/` (controller→service→repository) + the first use of the ADR-0007 job queue in `jobs/`.

- **DELETE /v1/account** → `202 { deletionEffectiveAt }` (= `deletion_requested_at + 7d`). Protected route (resource server); `@AuthenticationPrincipal` subject is the user id.
- **Grace start is idempotent**: `UPDATE users SET deletion_requested_at = now() WHERE id = ? AND deletion_requested_at IS NULL`. Only on the null→now transition do we revoke tokens + enqueue the job, so a repeat DELETE returns the same date and does **not** enqueue a second job.
- **All refresh tokens revoked** on request (`revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL`).
- **Sign-in cancels deletion** (both paths):
  - magic-link verify — already cleared it in `MagicLinkService.findOrCreateUser` (pre-existing).
  - refresh — **new hook** in `TokenService.rotate`: on a successful rotate, `UPDATE users SET deletion_requested_at = NULL`.
- **Job queue (ADR-0007, minimal, no framework)**: migration `V003__jobs.sql` — one generic `job` table (`type`, `payload` jsonb ids-only, `run_after`, `state` pending/done/failed, `attempts`, `last_error`), partial index `job_claim` on pending rows. `JobRepository` claims with `FOR UPDATE SKIP LOCKED`. `JobWorker` (`@Scheduled`, `@EnableScheduling`) drains due jobs **one per transaction**; on handler failure it records the attempt in a **fresh** transaction (the handler tx may be poisoned/rolled back) and backs off 1 min, giving up at 5 attempts.
- **Deletion job body** (`AccountDeletionService.purge`): guarded by `deletionDue` (`deletion_requested_at IS NOT NULL AND <= now() - interval '7 days'`) — the **guard**, not `run_after`, decides, so a cancel or a re-request-that-reset-the-clock makes the job a safe no-op. When due: `crypto.shred(userId)` (delete wrapped DEK **first** — instant crypto-shred, unreadable even in backups) **then** `DELETE FROM users` (FK cascade removes log_entry, refresh_token, user_keys).

## Tests (Testcontainers, real Postgres + Flyway V001–V003)

`account/AccountFlowTest` (8 tests):
- DELETE schedules ~7d out, revokes tokens, enqueues exactly one job.
- Repeat DELETE doesn't move the date or enqueue a second job.
- Refresh during grace cancels; magic-link verify during grace cancels.
- After grace the worker shreds the DEK + hard-deletes; the pre-shred ciphertext is permanently undecryptable; `user_keys`/`users` rows gone; job `done`.
- Cancelled deletion → due job is a harmless no-op (rows survive, job `done`).
- `purge` idempotent (safe to run twice).
- A failing job (unknown type) is retried, not lost, and doesn't block the worker (`pending`, attempts=1, `last_error` set).

`./gradlew check` green — **62 tests** (was 54). detekt/ktlint clean (`TooGenericExceptionCaught` suppressed on the worker catch — a worker must survive any handler error; `UNCHECKED_CAST` suppressed on the jsonb→Map read).

## Contract

No change needed — `DELETE /account` (202 + `deletionEffectiveAt`) was already specced in v0.3.0. redocly exit 0.

## Notes / decisions

- Job worker poll interval `vita.jobs.poll-ms` (default 60000). Tests park it at 1h so the background poll can't race the deterministic `runOnce()`.
- `ponytail:` single-instance / one-job-per-tx worker; SKIP LOCKED already makes batching or multiple instances safe if throughput ever matters (recorded in `JobWorker`).
- Grace is a hard-coded 7 days (`AccountDeletionService.GRACE` + the `interval '7 days'` in `deletionDue`), matching ADR-0004 and the contract.

## Not done here (DoD = production)

- Deploy: waits on BE-004 (prod env + CI deploy chain, OPS-004/OPS-014). Stays In progress until in production.
