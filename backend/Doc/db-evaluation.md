# Database Evaluation — Document Store vs PostgreSQL

> Position paper by the Backend Team Lead, per CEO decision 2026-07-13 #8: "evaluate a non-relational DB; we'll hardly have high-performance transactional pressure; maybe a document per nutrition, activity, personal data, etc."
> A second agent writes an independent counter-review; the orchestrator brokers. This is my position, argued from Vita's actual access patterns.

## 0. My position up front

**PostgreSQL with `jsonb` documents inside it — on the cheapest RDS instance (t4g.micro, single-AZ), not Aurora.** The CEO's instinct about the data *shape* is correct: a meal, a plan, a workout are documents, and we store them as documents (`jsonb` blobs — encrypted blobs, per the data-protection design). What Vita cannot give up is the *read side*: Trends is eight SQL aggregations, and the job queue and transactional seams also come free with Postgres. A document *database* would give us the same document storage we already have, minus the query engine, minus the tooling, for a cost difference of roughly a coffee per month.

## 1. Ground truth first: the workload

- ~5 users initially; maybe hundreds later. Writes: a handful of entries per user per day plus health-sample batches. **The CEO is right: transactional pressure is ~zero. Any store works for writes — including SQLite.** So the decision is not performance; it is (a) read/aggregation patterns, (b) ops + cost on a single-env AWS setup, (c) fit with the encryption design, (d) how much code each option makes us write and test.

- The real access patterns (from the prototype, screen by screen):

| # | Pattern | Shape |
|---|---|---|
| P1 | Today timeline | entries by (user, day), mixed types, cursor-paginated |
| P2 | Entry detail | single row by id |
| P3 | Trends, Food tab | per-day SUM of kcal / macros / water over 7–90 days; meal-time dot plot (timestamps by day); consumed-vs-spent = log totals joined with health samples per day |
| P4 | Trends, Activity tab | muscle-heatmap counts (GROUP BY muscle enum), aerobic minutes per day, workout history |
| P5 | Habit dots | 14 days of yes/no per habit |
| P6 | Plan portions | read one plan doc, recompute, write back |
| P7 | Auth | user by email (blind index), token by hash |
| P8 | Health ingestion | idempotent batch upsert on (user, source, type, external_id) |
| P9 | Async jobs | claim-next-job with concurrency safety |
| P10 | Account deletion | delete everything for one user |

P1, P2, P5, P6, P7 are document-friendly — any store does them. **The decision hinges on P3/P4 (aggregations), P8 (conditional upsert) and P9 (queue semantics).**

## 2. The candidates, honestly

### DynamoDB
The serious contender. On-demand pricing at our volume is effectively **$0/month** — genuinely cheaper than RDS — zero ops, IAM-native, single-digit-ms reads. Single-table design handles P1/P2/P5/P7 beautifully; P8 works with condition expressions.

Where it costs us instead:
- **No aggregation.** P3/P4 become either (a) fetch 30–90 days of items and aggregate in Kotlin — workable at 5 users, and I'll concede that honestly — or (b) DynamoDB Streams maintaining pre-aggregated counters — real distributed-systems code with real failure modes, for a calm logging app. Path (a) means every one of the eight trends charts is hand-written aggregation code **we must unit-test**, versus a GROUP BY that Postgres has tested for 30 years. And "vacation days hidden from trends" becomes a filter re-implemented in every one of them.
- **Access patterns must be designed into keys up front.** Vita is a young product; the prototype already went through two capture-bar versions. Every future chart or filter that wasn't in the key design means a new GSI (with backfill) or a scan. In SQL a new chart is a new query.
- **P9 (job queue)**: no `SELECT … FOR UPDATE SKIP LOCKED`. We'd add SQS — a second infra component precisely when the CEO cut environments for cost and simplicity.
- **Local dev/test**: DynamoDB Local exists but diverges from the real service in limits and consistency details; Testcontainers-Postgres runs the *actual* engine byte-for-byte.
- **Ecosystem fit**: Spring Data JDBC, Flyway, one `docker run postgres` for local dev all disappear; we swap mature boring tooling for the AWS SDK enhanced client and hand-rolled migrations-as-code.

### MongoDB (Atlas)
Best aggregation story of the document stores (pipeline handles P3/P4 fine). But: an **external vendor** — a new subprocessor for encrypted health data under GDPR, a separate account, separate billing, network peering or public endpoints from our VPC. The free M0 tier is a shared cluster with no backup guarantees; the first paid dedicated tier is ~$60/mo. We would take on vendor sprawl to solve a problem (document storage) that `jsonb` already solves inside the wall.

### DocumentDB
Eliminated on arrival: smallest instance ~**$200/month**, and it is Mongo-API-compatible-ish without being Mongo. Wrong on cost, wrong on fidelity.

### PostgreSQL + jsonb (the proposal)
- P1–P7 are each **one SQL statement**. The trends endpoints (P3/P4) are `GROUP BY date_trunc('day', occurred_at)` over the plaintext C2 numeric columns — this is exactly why the data-protection design keeps numbers as columns and encrypts the words as blobs.
- Documents where documents belong: meal items, exercises, plan contents are single `jsonb`/`bytea` blobs — **read whole, written whole, never queried into**, because they're encrypted (C3). We are not doing relational modeling of nutrition facts; the CEO's "a document per nutrition/activity" is literally the schema, one blob column per entity.
- P8: `INSERT … ON CONFLICT DO NOTHING` on the dedupe key. P9: the job table with `FOR UPDATE SKIP LOCKED` — no SQS. P10: cascade deletes + DEK crypto-shred.
- Cost: **RDS t4g.micro single-AZ ≈ $12–15/month** with storage. I'm recommending this instead of the Aurora Serverless option in the devops kickoff — at 5 users Aurora's 0.5-ACU floor (~$45/mo) buys nothing. That closes most of DynamoDB's cost gap.
- Ops: automated backups, one minor-version upgrade window, one instance. Not zero like Dynamo, but this is a managed service, not a DBA job.

## 3. Fit with the encryption design (deliverable 1)

Neutral-to-Postgres. Envelope encryption and the email blind index work identically in any store. But the design's core trade — *encrypt the words, aggregate the numbers* — only pays off if something can aggregate the numbers. In DynamoDB the C2/C3 split loses its purpose: since the app must fetch rows to aggregate anyway, we'd have paid the schema-design cost of the split without the SQL dividend.

## 4. Steelmanning the document side

If we adopted DynamoDB, the honest playbook is: single table, app-side aggregation for trends (defensible at ≤1k users), SQS for jobs, DynamoDB Local + a tagged live-AWS test suite. It would *work*, and it would be a few dollars cheaper per month. What it costs is: eight hand-tested aggregation functions instead of eight queries, a second messaging service, key-schema rigidity against a product that is still discovering its charts, and a weaker local test story. We would be trading **code we must write and maintain** for **a managed engine that already does it** — the opposite of ponytail. Cheapest is not the smallest bill; it is the least machinery we're responsible for.

## 5. Recommendation

1. **PostgreSQL 16 on RDS t4g.micro, single-AZ, KMS-encrypted** — down-sized from the devops Aurora proposal; ~$12–15/mo.
2. **Document-shaped storage inside it**: `jsonb`/encrypted `bytea` blobs for meal items, exercises, plans; plain columns only for what SQL aggregates (C2) and keys.
3. **No SQS, no DynamoDB, no second datastore.** Jobs stay in the Postgres job table.
4. Revisit trigger, on record: if user count grows to where RDS needs vertical scaling beyond ~1 small instance (≳tens of thousands of users) or a genuinely key-value-shaped hot path appears, re-evaluate DynamoDB **for that table**, not wholesale.

Open to the counter-review on one point in particular: if it can show the trends screens surviving on DynamoDB without either stream-maintained aggregates or per-chart app code, argument 2 collapses and cost decides. I don't believe it can.
