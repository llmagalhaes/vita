# ADR-0004 — Account deletion: 7-day grace, then crypto-shred + hard delete

**Status:** Accepted — 2026-07-13 (CEO decision, Round 3 #6)

## Context

Privacy-first product; deletion must be real, including inside backups. The original design proposed immediate deletion; the CEO decided on a short undo window.

## Decision

`DELETE /v1/account` starts a **7-day grace period**: account marked pending-deletion, all sessions revoked, sign-in during the window cancels the deletion. After 7 days a job **deletes the wrapped per-user DEK first** (instant crypto-shred — every C3 blob, including copies in the 35-day RDS backups, becomes permanently unreadable), then hard-deletes all rows (FK cascades) and S3 objects. No soft-delete flags remain, no export-before-delete upsell.

## Consequences

- Backups stop being a deletion loophole without any backup-rewriting machinery.
- Needs one `deletion_requested_at` timestamp on the user and one scheduled job (existing job table, ADR-0007).
- During the grace window data still exists and is still encrypted; a sign-in simply clears the timestamp.
- Supersedes the "default is immediate" line in `../data-protection-design.md` §4.
