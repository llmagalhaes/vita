# ADR-0002 — PostgreSQL 16 + jsonb on RDS t4g.micro

**Status:** Accepted — 2026-07-13 (CEO-approved after two-agent review: `../db-evaluation.md` + independent `../db-second-opinion.md`)

## Context

CEO asked for a document/NoSQL evaluation (payloads are document-shaped; transactional pressure ~zero at ~5 users). Two independent evaluations were run against Vita's real access patterns. Both converged: writes are document-shaped and any store handles them; the **read side** (seven-plus trends aggregations, timeline, export, account deletion) is relational-shaped and only SQL handles it with zero bespoke code. DynamoDB is ~$0/mo but turns every trends chart into hand-tested app code and needs SQS for jobs; MongoDB adds a second vendor for health data; DocumentDB eliminated on cost (~$60+/mo).

## Decision

**PostgreSQL 16 on RDS `db.t4g.micro`, single-AZ, KMS-encrypted (~$16/mo; ~$3/mo year one on free tier).** Document-shaped payloads (meal items, exercises, plans) live as `jsonb`/encrypted `bytea` blobs — read whole, written whole, schema-versioned (`v` field, tolerant readers). Plain columns only for what SQL aggregates (C2 numbers/enums, per ADR-0003) and keys. No second datastore.

## Consequences

- Trends = one `GROUP BY` per chart; deletion = FK cascades; ingestion = `ON CONFLICT DO NOTHING`; jobs stay in Postgres (ADR-0007).
- Testcontainers runs the real engine locally; Flyway migrations, expand/contract only (single prod env).
- **Recorded switch condition:** if full field-level encryption of *numeric* health values (kcal, macros, water ml, durations) ever becomes required, SQL aggregation dies with it and the choice **flips to DynamoDB + AWS Database Encryption SDK**. Secondary revisit trigger: a health-sample firehose at real scale moves `health_sample` (that table only) to DynamoDB.
