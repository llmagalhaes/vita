# OPS-007 · CloudTrail + GuardDuty — Progress

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216521831850510 · Status: **In progress** (code done, apply pending)

## 2026-07-13

- Written: `modules/audit/` — multi-region trail `vita-trail` (management events only, log-file validation, encrypted with the storage CMK) → audit bucket `vita-audit-<account-id>` (SSE-KMS + bucket key, public-blocked, TLS-only, CloudTrail-scoped bucket policy with `aws:SourceArn` conditions, 400 d lifecycle — retention still an open CEO question). GuardDuty base detector (no paid protection plans, ponytail-noted).
- "Org trail from both accounts" wording superseded by **ADR-0010** (single account) — plain multi-region trail covers everything. Module documented as instantiate-once-per-account (a future prod-br root adds only its regional GuardDuty detector).
- `validate` + `fmt` pass.

Remaining for Done: apply (runbook step 3); `get-trail-status` IsLogging + GuardDuty sample-findings verification.
