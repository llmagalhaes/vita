# BE-022 — Magic-link / refresh token cleanup sweep (audit 2.3)

Asana: Vita backend board (project `1216519867368580`). Debt (slice 8, anytime).
No contract change, no migration, no new infra.

## Done (local)

`jobs/service/TokenCleanupJob.kt` — a `@Scheduled` retention sweep on the same
`@EnableScheduling` the ADR-0007 job worker already turns on:

- **magic_link_token**: `DELETE WHERE consumed_at IS NOT NULL OR expires_at <
  now() - interval '1 day'`. Consumed links are spent and expired ones were never
  used — either way the C3 encrypted email must not linger ("store strictly what's
  necessary" — closes audit 2.3).
- **refresh_token**: `DELETE WHERE expires_at < now() - 1 day OR (revoked_at
  IS NOT NULL AND revoked_at < now() - 1 day)`. Lower stakes — C1 hashes only.
- Interval config `vita.jobs.token-cleanup-ms` (default 1h), inline default like
  the worker's `poll-ms`.

**Design note (ponytail, flagged for the orchestrator):** implemented as a direct
`@Scheduled` DELETE, **not** a row on the `job` queue. A recurring cron doesn't
fit a one-shot pending→done queue without self-rescheduling hackery that would
bloat the `job` table this ticket exists to fight; the DELETE is idempotent and
safe on every instance, so SKIP-LOCKED/retry buy nothing. It still reuses the
`jobs/` package + the queue's scheduling infrastructure, and adds no infra. If we
ever want it coordinated through the `job` table across instances, that's a small
follow-up.

## Tests (`jobs/TokenCleanupJobTest.kt`)

sweep drops consumed + long-expired magic links, keeps a live one; sweep drops
expired + revoked refresh tokens, keeps live ones. Auto-schedule pushed out
(`token-cleanup-ms=3600000`) so each test drives `sweep()` explicitly.

`./gradlew check` green — 122 tests, detekt/ktlint clean.
