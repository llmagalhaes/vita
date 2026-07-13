# ADR-0007 — Postgres-backed job queue instead of SQS

**Status:** Accepted — 2026-07-13

## Context

Async work in v1: magic-link cleanup, PDF plan import, export generation, account-deletion job, token/row purges. Volumes are tiny (~5 users). Single production environment, cost under a $40/mo AWS alarm; the CEO cut infrastructure for cost and simplicity.

## Decision

A `jobs` table in the application database, claimed by in-process workers with `SELECT … FOR UPDATE SKIP LOCKED`. Retry count, terminal states, 30-day cleanup via the same mechanism. **No SQS, no SNS topics, no second messaging service** (explicitly on the devops do-not-provision list).

## Consequences

- One database is one thing to operate, back up, and restore; job enqueue is transactional with the business write that caused it (no outbox pattern needed).
- **Coupling recorded honestly:** the queue lives and dies with the database — a DB outage stops job processing too, queue depth adds load to the same instance, and there is no cross-service fan-out. At this scale all three are non-issues; if job volume or isolation ever matters, the job interface makes SQS a swap behind it.
- This choice leans on ADR-0002: `SKIP LOCKED` is a Postgres feature; it is one of the reasons DynamoDB would have forced SQS in.
