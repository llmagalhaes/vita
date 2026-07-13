# ADR-0001 — Single production environment

**Status**: Accepted 2026-07-13

## Context

~5 initial users, cost is the top priority (CEO post-kickoff decision #4/#6). Three AWS environments were sized at ~$590/mo; dev and staging would serve nobody.

## Decision

One AWS environment: **production only**. All pre-prod testing is local — `docker compose` with the prod PostgreSQL major version, backend integration tests on Testcontainers in CI. Nothing merges red.

The missing staging net is replaced by discipline (cost-revision §6): expand/contract backward-compatible migrations (append-only, immutable files), deploy = image by git SHA → one-off migration task → ECS rolling deploy with circuit breaker + auto-rollback → smoke test; rollback is redeploying the previous tag, DB rolls forward only; small frequent deploys, none when the CEO is unreachable for alarms.

## Consequences

- ~$286/mo saved; a bad deploy can reach the 5 users — bounded by auto-rollback and small deltas.
- Terraform stays multi-root-capable (`envs/prod-eu/`), so adding an environment later is additive.
