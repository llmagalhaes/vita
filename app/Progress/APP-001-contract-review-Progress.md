# APP-001 — Contract review of vita-api-v0 — Progress

- **Asana**: https://app.asana.com/1/1216482759560814/project/1216519867368576/task/1216514543214496
- **Status**: review complete 2026-07-13 — deliverable `app/Doc/contract-review-v0.md`, awaiting backend ack via orchestrator.

## 2026-07-13

- Reviewed `docs/contracts/vita-api-v0.yaml` against onboarding/capture/timeline/outbox needs.
- Answered all 7 TBD-APP-REVIEW points (see the deliverable). Two contract edits requested: `muscles` becomes an 11-value enum; `ParseResult.drafts` gets `maxItems: 5`. Explicitly declined `?updatedSince=` for v0 (single-device reality; fetch-by-day covers deletes).
- Offline outbox needs verified present: Idempotency-Key semantics, `updatedAt`, idempotent PATCH/DELETE, Retry-After.
- Next: backend applies the two edits; ticket closes on their ack.
