# Prod documentation + board sweep (post first-deploy)

Not an Asana ticket — CEO-requested docs pass after the backend went live in prod (2026-07-15).

## Done
- **Notion**: created "Production — what's running & why" under the DevOps page
  (https://app.notion.com/p/39e213f6aff481628d49d95207772719). Sections: architecture
  overview (+ mermaid request path, why each hop), live resources (compute / data / network /
  security & audit / observability), secrets & config, security posture, cost, operations
  runbook, what's deferred, known drift. Every ID cross-checked against live AWS + terraform
  state (`terraform output`/`state list`, `aws ecs|rds|kms|logs|cloudtrail|guardduty|ssm|s3api|
  ec2|apigatewayv2|servicediscovery|backup describe`), not memory.
- **DevOps Notion page**: added a dated decision line linking the new doc.
- **Asana devops board** swept to reality (DoD = in prod). Moved to Done (with "live in prod,
  verified 2026-07-15" comments): OPS-001 (security baseline), OPS-003 (budgets), OPS-005 (VPC),
  OPS-008 (ECR), OPS-009 (RDS — cross-account copy deferred by ADR-0010), OPS-011 (S3),
  OPS-020 (LocalStack, local tooling). Already Done and left: OPS-002/006/007/010/013/014.
  Left open (accurate): OPS-004 (In progress — CEO negative tests + repo-var positive test),
  OPS-012 / OPS-015 / OPS-016 / OPS-017 (Backlog — SES, AMP/observability, magic-link redirect,
  restore rehearsal; none started).

## Drift found (docs vs live) — corrected in the Notion doc, no infra touched
- S3 **exports** lifecycle is `expire-30d`, NOT 90d as an old open-questions note carried.
  Both uploads and exports = 30d. Doc now states 30d.
- **uploads** bucket also expires objects at 30d → user photos vanish after a month. Flagged to
  CEO/backend to confirm intent (see Questions). Not changed (read-only task).
- CloudWatch `/ecs/vita` retention = 30d (fine at this volume; noted).

## Verified-live snapshot (2026-07-15)
health 200 · ECS vita/vita desired=running=1, task-def vita:2, arm64 0.25vCPU/1GB, image
vita-api:a03e194 · RDS pg16.13 t4g.micro encrypted/private/force_ssl, 14d PITR + AWS Backup
daily-45d · KMS app-data ad35b909 + storage 075c7c59 (both rotation on) · CloudTrail multi-region
+ logfile validation · GuardDuty active · 7 SSM SecureStrings · S3 uploads/exports SSE-KMS
public-blocked TLS-only expire-30d · API GW y9d7tlqsnl + VPC Link fxw25g + Cloud Map api.vita.local SRV.
