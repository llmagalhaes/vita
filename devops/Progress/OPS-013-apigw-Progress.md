# OPS-013 — API Gateway HTTP API + VPC Link + Cloud Map

Asana: https://app.asana.com/0/1216519867368584/1216517969814549 (OPS-013)
Model: Opus 4.8 · ADR-0005 · Status: In progress (APPLIED; e2e verification deferred)

## APPLIED 2026-07-13, then CEO pivot
API Gateway is live: `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com/`. VPC Link,
Cloud Map `vita.local`, app-SG ingress rule all applied. **E2E health-200 verification is
DEFERRED**: CEO moved to local-dev + milestone-only prod deploys (2026-07-13), and the ECS
service behind this API is parked at 0 (no image). The URL returns 503 until a deploy
milestone. URL recorded in bootstrap-ids.md; hand to app team only when prod dev resumes
(they develop against the local backend now).

## Built (session 3, 2026-07-13)
`modules/apigw/main.tf`, wired as `module.apigw` in prod-eu.
- HTTP API `vita` (`$default` stage, auto_deploy, throttling 50 rps / burst 20),
  `prevent_destroy` (shipped apps couple to the URL — ADR-0009).
- VPC Link `vita` (public subnets) + a `vita-vpclink` SG.
- **The app SG's only ingress rule** (deferred to here by OPS-005):
  `app_from_vpc_link` — from the VPC-Link SG on the container port, no CIDR.
- Cloud Map private DNS namespace `vita.local` + service `api` (A records, MULTIVALUE)
  — the OPS-014 ECS service registers task IPs here.
- Integration: HTTP_PROXY / VPC_LINK → the Cloud Map service ARN. Route `$default`.
- Output `api_endpoint` (execute-api URL) → bootstrap-ids.md + app build config.

## Plan
Part of the OPS-013+014 batch: **19 to add, 1 to change, 0 to destroy** (apigw = 10).
The `api_endpoint` is known-after-apply.

## Notes / flags
- `container_port` defaults to **8080** — backend to confirm the Kotlin app's port.
- Apply is independent of the backend image (unlike OPS-014); can be applied now if the
  CEO wants the URL early, but full e2e (health 200 over https) needs OPS-014's service.

## Remaining for Done
Apply; record the URL in bootstrap-ids.md + hand to app team; e2e health 200 with OPS-014.
