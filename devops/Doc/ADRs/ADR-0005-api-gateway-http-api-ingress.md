# ADR-0005 — API Gateway HTTP API instead of ALB

**Status**: Accepted 2026-07-13

## Context

An ALB costs ~$18–20/mo before a single request. We have one HTTP service and ~5 users.

## Decision

**API Gateway HTTP API → VPC Link (free) → Cloud Map → Fargate task.** ~$1.11 per million requests (cents for us; 1 M/mo free in year 1). AWS-managed TLS on the default `execute-api` endpoint (custom domain deferred, ADR-0009). Built-in throttling as crude DDoS/cost protection. Task SG inbound: VPC Link ENIs only.

## Consequences

- **29 s integration timeout**: long AI parses must respond fast or go async — good discipline anyway.
- **10 MB payloads**: uploads already go direct to S3 via presigned URLs.
- No ALB health checks: ECS container health check + deployment circuit breaker provide rollback instead.
- No WebSockets on HTTP API — not needed in v1.
