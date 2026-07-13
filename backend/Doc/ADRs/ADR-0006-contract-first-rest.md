# ADR-0006 — Contract-first REST: OpenAPI 3.1, RFC 7807, cursor pagination

**Status:** Accepted — 2026-07-13

## Context

One backend, one app team, both AI-driven — implementation drift between them is the main integration risk. `DEVELOPMENT_PROCESS.md` mandates specified contracts.

## Decision

REST + JSON, base path `/v1`, `Authorization: Bearer <JWT>`. **OpenAPI 3.1 specs live in `docs/contracts/` and are written and app-reviewed BEFORE either side implements.** Contract changes require an ADR + notifying the app team via the orchestrator. Errors are **RFC 7807 problem+json** (`detail` strings stay English/developer-facing; the app owns user-facing copy). Timeline/history endpoints use **cursor pagination**. Long jobs (PDF import, export) are `POST → 202 + job id → GET` polling; parse endpoints are synchronous. No websockets/SSE in v1.

## Consequences

- Integration tests validate every request/response against the spec (openapi-validator filter) — drift fails the build; specs linted in CI.
- The app team can mock against a spec they trust before the endpoint exists.
- Cursor pagination means no stable page numbers — acceptable, the UI is infinite-scroll shaped.
