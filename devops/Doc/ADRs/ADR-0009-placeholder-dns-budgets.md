# ADR-0009 — Placeholder DNS (domain deferred) and budget guardrails

**Status**: Accepted 2026-07-13

## Context

CEO Round 3: domain purchase deferred; AWS budget alarm $40/mo; Claude API $10/mo. Bundle IDs must not depend on a future domain.

## Decision

v1 runs without a domain:

- **API**: default `execute-api` URL; app treats the base URL as build config. `prevent_destroy` on the API (recreating it would change the URL under shipped apps).
- **Email**: SES stays in **sandbox** — sender + the ~5 testers' addresses as verified email identities (Terraform; each tester clicks one verification mail). No production-access request.
- **Magic links**: https route on the backend (`GET /auth/open?token=…` behind the same API GW) 302-redirects to `vita://auth?token=…` with an HTML fallback. No extra infra.
- **Bundle ID / package name**: reverse-DNS of something permanently owned, proposed `com.lucasmagalhaes.vita` — never domain-derived.
- **Budgets as enforcement**: AWS Budget $40/mo (management account, alerts 50/80/100%); Anthropic console hard limit $10/mo (stops, doesn't overspend) + backend token-usage metrics to AMP.

## Consequences

Accepted risks: unverified `vita://` scheme (any Android app can claim it — mitigated by single-use short-TTL tokens and a 5-known-tester audience), per-tester SES verification friction, app coupled to the `execute-api` URL. Domain-purchase switch list (SES domain identity + production access, API custom domain, universal links — nothing else) lives in `docs/ceo-setup-guide.md`.
