# ADR-0006 — RDS PostgreSQL t4g.micro, single-AZ, KMS

**Status**: Accepted 2026-07-13

## Context

Aurora Serverless v2's 0.5-ACU floor (~$48/mo) never pauses under a live API — paying for elasticity 5 users won't exercise. PostgreSQL + jsonb confirmed by CEO Round 3 decision #9 after the DynamoDB trade-off review.

## Decision

**RDS PostgreSQL `db.t4g.micro`, single-AZ, 20 GB gp3** (~$16/mo; **$0 in year 1** — 750 h/mo + 20 GB storage + 20 GB backup are free-tier). Never bends: KMS CMK at rest, `rds.force_ssl`, automated backups 14 d + cross-account vault copy (ADR-0003), deletion protection, `prevent_destroy`.

## Consequences

- **Single-AZ**: AZ failure ⇒ restore-from-snapshot, RTO ~1 h, RPO minutes (PITR). Upgrade is one tfvars flip: `multi_az = true` (+$13/mo).
- **1 GB RAM**: ~80 connections, modest queries. `t4g.small` is a tfvars flip.
- Documented switch condition (CEO log): full field-level encryption of numeric values would flip the choice to DynamoDB; module boundary keeps it swappable.
- Quarterly restore rehearsal is a standing ticket.
