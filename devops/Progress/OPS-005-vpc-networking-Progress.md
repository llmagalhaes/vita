# OPS-005 · VPC & networking (no NAT) — Progress

Asana: https://app.asana.com/1/1216482759560814/project/1216519867368584/task/1216514542881727 · Status: **Done** (applied + verified 2026-07-13)

## 2026-07-13

- Written: `modules/network/` per ADR-0004 — VPC (10.0.0.0/16), 2 AZs from `data.aws_availability_zones` (no literals, ADR-0002); public app subnets + IGW; DB subnets with **no internet route at all**; free S3 gateway endpoint on both route tables; default SG stripped of all rules.
- SGs created here as anchors: `vita-app` (zero inbound — the VPC Link rule lands with OPS-013; egress open, ponytail-noted) and `vita-db` (5432 from app SG only, no egress).
- No NAT, no interface endpoints. `validate` + `fmt` pass.
- Region check done (orchestrator ask): eu-north-1 vs eu-west-1 — **eu-west-1 stays** (Fargate ARM ~10% cheaper in Ireland outweighs RDS $0.001/h in Stockholm; net ≈ $0.10/mo for Ireland). Review note appended to ADR-0002.

Remaining for Done: apply (runbook step 3); checkov 0.0.0.0/0-ingress CI rule belongs to OPS-004.

## 2026-07-13 (session 2)

- `envs/prod-eu` `init` (S3 backend, post-bootstrap) + `plan`: network module = 19 of the 30 resources to add (VPC, 4 subnets, IGW, 2 route tables + associations, S3 gateway endpoint, app/db SGs + rules, stripped default SG). Plan saved as `prod-eu.tfplan`; **awaiting CEO approval before apply**.
- **CEO APPROVED → APPLIED** (30/30 added). `vpc-0f0535c15f51f4b6c`, app SG `sg-0642c4529d86f52cb`, db SG `sg-05bad5f5c67cafc3e`.
- **Verified**: `vita-db` route table has only `local` + the S3 endpoint prefix-list route — **no IGW route**; both db subnets associated. `vita-public` has 0.0.0.0/0 → IGW as intended.
- **DONE — in production.** (checkov 0.0.0.0/0 CI rule stays with OPS-004.)
