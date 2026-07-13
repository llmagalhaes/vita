# ADR-0007 — Observability: OTel/ADOT → X-Ray + AMP + CloudWatch, Grafana local

**Status**: Accepted 2026-07-13

## Context

CEO: OpenTelemetry as the pipe, Prometheus hosted on AWS, Grafana **only** on the CEO's Mac — never hosted. Dashboards must be AI-queryable.

## Decision

One **ADOT collector sidecar** in the API task:

- traces → X-Ray (sampled; 100 k/mo always free ⇒ $0)
- metrics → **Amazon Managed Prometheus** via remote_write (~$2/mo at ~22 M samples; cheaper *and* less ops than self-hosting)
- logs → stdout JSON → `awslogs` driver → CloudWatch Logs (skips the collector deliberately; structured, no-PII contract applies). Alarms stay CloudWatch → SNS email.

**Local Grafana reaches AMP with no tunnel and no public unauthenticated endpoint**: the AMP query API is TLS + SigV4-only. CEO flow: `aws sso login --profile vita-metrics` (Identity Center permission set with only the four `aps:Query*/Get*` actions on the workspace ARN) → Grafana Prometheus datasource with SigV4 auth. Dashboards JSON versioned in `devops/services/grafana-dashboards/`.

## Consequences

Zero hosted-Grafana cost/attack surface; per-session SSO login is the accepted friction (fallback Tailscale proxy rejected — more parts, less security). AI diagnosis path: CloudWatch Logs Insights + `aws amp`/`aws xray` CLI queries.
