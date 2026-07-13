# Database Second Opinion — Vita

> Independent review, requested by the CEO ("evaluate a non-relational database — we could have a document for nutrition, activity, personal data").
> Author: external senior data-architecture reviewer. Deliberately written without reading the backend lead's own db evaluation.
> Date: 2026-07-13.

## TL;DR

**Recommendation: PostgreSQL with the jsonb hybrid, on RDS `db.t4g.micro` single-AZ (~$16/mo, ~$3/mo in year one on a new account's free tier).** The CEO is right that Vita's *payloads* are document-shaped — and the jsonb hybrid already stores them as documents. The disagreement is only about where documents live. What is *not* document-shaped is Vita's **read side**: the Trends screen alone is seven different ad-hoc aggregations over the same entries, and SQL answers all of them with zero application code.

**However — DynamoDB is closer than a Postgres-leaning team will admit.** It is effectively **$0/mo** at this scale, has the best field-level-encryption tooling on the market, and the "you can't aggregate" objection is weak at 5 users (a 30-day trend is ~300 rows; summing them in Kotlin is trivial). It loses on developer velocity and flexibility, not on capability. DocumentDB is a nonstarter on cost alone (~$60/mo minimum footprint for an API-compatibility layer nobody asked for).

---

## 1. Method: judge from real access patterns, not vibes

The CEO's framing — "we'll hardly deal with very high-performance transactions" — is true but points the wrong way. Low transactional pressure is not an argument *for* NoSQL. NoSQL's payoff is horizontal **write** scale, which Vita will never need at 5 (or 5,000) users. Its price is **query flexibility**, which Vita's read side consumes heavily. So the evaluation must run on the actual queries:

| # | Access pattern | Shape |
|---|---|---|
| P1 | Day timeline | all entries for (user, day), sorted by `occurred_at` |
| P2 | Trends: daily kcal/macros/water over 7/15/30 days | `SUM(...) GROUP BY day` filtered by type, minus vacation days |
| P3 | Trends: muscles-worked counts, meal-time dot plot, in/out energy, aerobic minutes | count/sum over entries + health samples, several groupings |
| P4 | Habit 14-day dots | check-ins for (habit, last 14 days) |
| P5 | Eating-plan portion math | read one plan document, recompute totals from nutrition-per-unit |
| P6 | Health-sample ingestion | idempotent batch upsert keyed on `(user, source, type, external_id)` |
| P7 | Account deletion | hard-delete everything for one user |
| P8 | Export PDF | read 30 days of everything for one user, shape it |

### How each store handles them

| Pattern | PostgreSQL (+jsonb) | DynamoDB single-table | MongoDB / DocumentDB |
|---|---|---|---|
| P1 timeline | index on `(user_id, occurred_at)` — one query | **best fit**: PK=`user`, SK=`occurred_at#id` — one `Query` | index on `{user, occurred_at}` — one `find` |
| P2 daily sums | one `GROUP BY` — zero app code | fetch ~300 items, sum in app **or** maintain per-day rollup items on every write | aggregation pipeline — works, verbose |
| P3 many-shaped aggs | one SQL query per chart | one *hand-written app aggregation* per chart, or pre-computed rollups per shape | one pipeline per chart |
| P4 habit dots | trivial | trivial (`Query` on habit partition) | trivial |
| P5 plan math | jsonb document read + recompute | document read + recompute — **native fit** | document read + recompute — **native fit** |
| P6 idempotent ingest | `INSERT … ON CONFLICT DO NOTHING` on unique index | conditional `PutItem` (`attribute_not_exists`) — **equally elegant** | unique index + unordered bulk insert |
| P7 delete account | FK `ON DELETE CASCADE`, one transaction | `Query` the partition, `BatchWriteItem` in 25s, mind the GSIs — a job, not a statement | `deleteMany` per collection — fine |
| P8 export | a few queries | a few `Query` calls | a few `find`s |

Reading of the table, honestly: **P1, P4, P5, P6, P8 are a wash** — every store does them fine, and P1/P6 arguably read *nicer* in DynamoDB. The whole decision hinges on **P2/P3 (Trends) and P7 (deletion)**, plus everything below the line: cost, encryption, ops, portability.

The scale caveat cuts both ways: at 5 users, DynamoDB's aggregation weakness is cosmetic (300-row in-app sums). But at 5 users, Postgres's cost weakness is also nearly cosmetic ($16/mo). Neither side gets to use scale as a trump card.

---

## 2. The options

### Option A — DynamoDB, single-table

**Fit.** Timeline, habits, ingestion, plan documents: excellent. Trends: every chart shape becomes application code (or write-path rollup items — don't; that's write-amplification and transactional coupling to save reading 300 items). New chart in v2 = new code path, possibly a new GSI + backfill script. The prototype already shows *seven* trend visualizations; product evolution here is likely.

**Cost.** Effectively **$0–1/mo**. Storage: always-free 25 GB (Vita's 5 users won't produce 1 GB in a year). On-demand requests: 5 users × a generous 2,000 ops/day ≈ 300K ops/mo ≈ **well under $0.50**. PITR backups: pennies. This is the strongest single argument on the table for a cost-is-top-priority CEO.

**Field-level encryption.** Best in class: the **AWS Database Encryption SDK for DynamoDB** gives attribute-level envelope encryption *and signing* with KMS, as a supported library. (Caveat: it's strongest in Java — fine for Kotlin.)

**Ops for AI agents.** Zero infrastructure to operate (no instance, no patching, no storage sizing, no maintenance windows) — but **single-table design is a design-time art**: access patterns must be enumerated up front, key overloading is easy for an agent to model subtly wrong, and mistakes are corrected with GSI backfills, not `ALTER TABLE`. Local testing via DynamoDB Local/LocalStack (fine, but a second-class citizen next to Testcontainers-Postgres). Also: the backend proposal uses Postgres as its **job queue**; with DynamoDB you either model a queue in Dynamo (awkward) or add SQS — a second service either way.

**Portability.** In every AWS region including `sa-east-1` (Brazil). Terraform: first-class (`aws_dynamodb_table`). But it is **AWS-proprietary**: portable across regions, not across clouds.

**Migration risk if outgrown.** You don't outgrow DynamoDB on scale — you outgrow it on *query shapes*. Each unforeseen pattern costs a GSI or an ETL. Escaping to SQL later = full export/reimport plus rewriting every repository.

### Option B — MongoDB / DocumentDB

**Fit.** Genuinely good: documents native, aggregation pipelines cover Trends (verbose but complete), unique indexes cover ingestion. Functionally the middle ground.

**Cost — this kills it.**
- **DocumentDB**: smallest instance is `db.t3.medium` ≈ **$60–70/mo** (instance ~$57 + storage + I/O) in EU, no free tier. 4× the RDS option to get a *compatibility layer* (DocumentDB is not MongoDB; it trails the API and lacks client-side FLE server support).
- **MongoDB Atlas**: M0 free tier is not production-appropriate (no backups, 512 MB); Flex is ~$8–30/mo — but it's a **third-party vendor**: separate account, separate billing, a GDPR data-processor agreement for health data, and it contradicts the CEO's plan to personally set up AWS accounts and the AWS+Terraform decision (Atlas has a Terraform provider, but it's a second provider and a second pane of glass).

**Verdict:** eliminated. It buys nothing over jsonb that's worth $45–55/mo extra or a second vendor holding health data.

### Option C — PostgreSQL, plain + jsonb hybrid (the backend proposal)

**Fit.** The hybrid *is* the document model the CEO is asking about: meal items, exercises, micros, plan payloads live as jsonb documents; only the fields the read side aggregates on (kcal, P/C/F totals, duration, muscle groups, occurred_at) are promoted to columns. Trends = one SQL statement per chart. Account deletion = FK cascades in one transaction — the cleanest privacy story of the three. Idempotent ingestion = one unique index. Vacation-day exclusion = a `WHERE`.

**Cost.** RDS `db.t4g.micro` single-AZ EU: ~$13–14/mo instance + ~$3 for 20 GB gp3 + snapshot storage ≈ **~$16–18/mo**. On a **new AWS account, t4g.micro is free-tier eligible for 12 months** → year one ≈ **~$3/mo** (storage only). Aurora Serverless v2 with scale-to-zero was considered and rejected: ~$44/mo if it never pauses, and an all-day logging app rarely pauses; cold starts hurt the capture UX.

**Field-level encryption.** The weakest of the three *ergonomically*: no first-class AWS client SDK. The workable pattern is app-side AES-256-GCM envelope encryption (KMS data keys) via Spring Data JDBC converters — boring, small, but hand-rolled. Avoid `pgcrypto` (keys transit SQL). See §3 for the caveat that matters.

**Ops for AI agents.** The strongest card. SQL + Spring Data JDBC + Flyway + Testcontainers is the most-documented, most-training-data-saturated stack there is; agents write correct `GROUP BY`s and correct migrations. Schema mistakes are fixed with a migration, not a backfill. One database also carries the job queue — one thing to operate, patch, back up, and restore.

**Portability.** RDS Postgres in every region including `sa-east-1`; Terraform first-class; and uniquely, **portable off AWS entirely** (any Postgres anywhere) — the most region- *and vendor*-agnostic option.

**Migration risk if outgrown.** Vertical headroom is enormous (micro → small → … → r7g) before any redesign; read replicas after that. The realistic ceiling is years away at any plausible growth. Escaping *to* NoSQL later, if a genuine write-scale need appears, migrates one bounded table (likely `health_sample`) — not the whole model.

---

## 3. The encryption caveat that cuts against Postgres

Honesty requires this section, because it undermines the pro-SQL argument more than Postgres advocates usually admit:

**Field-level-encrypted values cannot be aggregated by the database.** If the data-classification exercise (CEO decision #7) concludes that kcal/macro totals are themselves "sensitive data [that] must be encrypted" at the field level, then `SUM(kcal_total) GROUP BY day` is impossible — Postgres would fetch encrypted rows and aggregate in app code, exactly like DynamoDB. **Postgres's headline advantage survives only if the aggregation columns stay plaintext-in-the-database** (protected by at-rest KMS encryption, TLS, network isolation, and access control — which is a defensible reading of "sensitive data encrypted").

The sensible classification, and the one I'd recommend regardless of store:

| Tier | Examples | Protection |
|---|---|---|
| Field-encrypted | source phrases (free text/voice transcripts), cycle data, plan/PDF originals, email in secondary tables | app-side envelope encryption (KMS) |
| At-rest only | numeric aggregates: kcal, macros, water ml, durations, muscle tags, timestamps | KMS-encrypted storage + TLS + IAM/SG isolation |

If the CEO instead mandates field-level encryption of *all* health values, the stores converge — and DynamoDB's better encryption SDK plus $0 cost would flip my recommendation. This is the single most decision-relevant open question.

---

## 4. Cost summary (single production env, EU, ~5 users)

| Option | Monthly (steady) | Year-one note |
|---|---|---|
| DynamoDB on-demand + PITR | **~$0–1** | always-free tier covers it entirely |
| RDS Postgres `db.t4g.micro` single-AZ, 20 GB | **~$16–18** | ~$3/mo for 12 months (new-account free tier) |
| Aurora Serverless v2 (0.5 ACU floor) | ~$44 (less with auto-pause, unlikely to pause) | — |
| MongoDB Atlas Flex | ~$8–30 + second vendor for health data | — |
| DocumentDB `db.t3.medium` minimum | **~$60–70** | no free tier |

All numbers are list-price estimates for EU regions, July 2026; DevOps should confirm in the region actually chosen. The real spread that matters: **DynamoDB saves ~$16/mo over the recommendation.** That is the entire hard-dollar case for NoSQL here.

---

## 5. Scorecard

| Criterion (weight for Vita) | DynamoDB | DocumentDB/Mongo | Postgres + jsonb |
|---|---|---|---|
| Timeline / ingestion / documents | ++ | + | + |
| Trends & ad-hoc aggregation | − (app code per chart) | + (pipelines) | ++ (SQL) |
| Account deletion / privacy ops | − | ∘ | ++ (cascades) |
| Cost at this scale | ++ ($0) | −− ($60+ or 2nd vendor) | + ($16, $3 yr-1) |
| Field-level encryption ergonomics | ++ (AWS Encryption SDK) | ∘/− | ∘ (hand-rolled converters) |
| Operational simplicity for AI agents | ∘ (zero infra, but single-table design is a trap) | − | ++ (boring, saturated in training data, Testcontainers) |
| Region portability (EU → Brazil) | ++ (any region; AWS-locked) | + | ++ (any region, any cloud) |
| Migration risk if outgrown | query-shape risk, GSI backfills | migrate off compat layer | vertical headroom for years |
| Terraform support | ++ | + | ++ |

---

## 6. Recommendation

**PostgreSQL + jsonb hybrid on RDS `db.t4g.micro` single-AZ.** Concur with the backend lead's direction — but for sharper reasons than "relational is safe":

1. **The read side decides it.** Vita's write side is document-shaped and every candidate handles it; Vita's read side (seven trend charts, export, timeline, deletion) is relational-shaped, and only SQL handles it with zero bespoke code. The jsonb hybrid gives the CEO his documents *and* keeps the aggregations one statement each.
2. **AI-agent leverage.** The team is AI agents. SQL/Spring/Flyway/Testcontainers is the substrate agents get right most often; single-table DynamoDB design is the substrate they get subtly wrong most often, and its mistakes are the expensive kind (backfills, not migrations).
3. **Privacy is a first-class access pattern here.** "Store only what's necessary" and hard account deletion are product commitments; FK cascades and `DELETE WHERE user_id` are the strongest possible implementation of them.
4. The $16/mo premium over DynamoDB (~$3/mo in year one) is the cheapest developer-velocity insurance this project can buy. It is also the *only* cost DynamoDB actually saves.

Adopt from the NoSQL column anyway: treat jsonb payloads as **schema-versioned documents** (a `v` field, tolerant readers), and copy DynamoDB's discipline of writing the access-pattern list (§1) into the schema design doc before Phase 1 — it is a good design tool even when the answer is SQL.

## 7. What would change my mind

- **Cost mandate goes to ~$0.** If the CEO says the database line must round to zero even after year one, DynamoDB single-table is viable: accept in-app aggregation for trends (fine at this scale) and a written access-pattern registry as a standing artifact.
- **Field-level encryption is mandated for the numeric health values** (kcal/macros/water/duration). SQL aggregation dies with it, Postgres's core advantage evaporates, and DynamoDB's superior encryption SDK + $0 cost win on points. This is the live question — resolve the data classification (§3) before locking the schema.
- **The app goes truly offline-first with server-as-sync-log.** If the backend degrades to an append-only event sync store and all views render on device, the server needs no query flexibility and DynamoDB (or even S3) fits better.
- **A health-sample firehose materializes** (v2 Garmin/Strava at real user counts, high-frequency samples). Then move `health_sample` — that one table — to DynamoDB and keep the rest; the hybrid makes this a bounded migration, not a rewrite.
- **DocumentDB never.** No future fact pattern makes a $60/mo minimum compatibility layer the right answer for this product.
