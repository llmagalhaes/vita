# Backend — Next session

## Current state (Phase 1 specification, 2026-07-13)

- **API contract v0 drafted**: `docs/contracts/vita-api-v0.yaml` (OpenAPI 3.1) — auth (magic link, Google/Apple oidc, refresh rotation, sign-out, account deletion w/ 7-day grace), profile (`/me`), log entries (idempotent create, timeline w/ date+tz filter and cursor pagination, get/patch/delete, `updatedAt` for offline sync), AI parse (`/parse/text`, `/parse/photo` multipart — drafts only, never persisted). RFC 7807 errors. **Awaiting app-team review** — open points are marked `TBD-APP-REVIEW` inside the spec (timeline flat-list vs day buckets; delta-sync `updatedSince`; multipart vs base64 photos + downscale target; multi-draft confirmation cards; muscle vocabulary for the body map; micro-name enum vs free-form; Apple first-sign-in name pass-through).
- **Asana backlog populated**: BE-001..BE-014 in the Backlog section of the Vita backend board (project `1216519867368580`), covering W0 (skeleton/CI/first deploy) → W1 (crypto, auth, profile, deletion) → W2 (entries/timeline) → W3 (AI text parse + guardrails). Note: board row order inside the section is API-scrambled; the BE-numbering and "Wave" line in each ticket are authoritative. W4+ tickets deliberately not created yet.
- No ticket started — `Progress/` intentionally empty.
- ADRs 0001–0009 unchanged and in force.

## Next steps

1. **Wait for app-team contract review** (orchestrator routes it). Resolve the `TBD-APP-REVIEW` points; contract changes after agreement require an ADR.
2. **Start W0** (BE-001 → BE-002 → BE-003) — these need no infra and no contract sign-off. BE-004 (first prod deploy) needs devops.
3. Agree the normalized health-sample schema with the app team (W6 prep, not urgent).

## Blockers / waiting on

- **BE-004** blocked on devops: prod environment (ECS + RDS t4g.micro + Secrets Manager + deploy pipeline). Infra ticket list (addendum §6) is being handled by the devops lead directly — SES production-access request should be filed first (AWS approval takes days).
- **BE-005/006** need the KMS CMK, Secrets Manager entries, and SES sandbox identities from devops.
- **BE-007** needs CEO-created Google/Apple developer credentials (config stored by devops).
- App-team review of `vita-api-v0.yaml` gates W1/W2/W3 endpoint implementation (W0 is unblocked).
