# Cost Revision — single production environment, ~5 users

> Revises `kickoff-proposal.md` per CEO decisions of 2026-07-13 (items 4, 5, 6, 9, 10, 12 in `docs/ceo-decisions.md`).
> Author: team-lead-devops. Date: 2026-07-13. Documents only — nothing provisioned.

**New reality**: production only (all pre-prod testing is local), ~5 initial users, cost is the top priority, security/encryption never bends. Region: Europe, region-agnostic Terraform. Grafana runs only on the CEO's Mac. No mobile build pipeline.

**Result: ~$42/mo AWS (±30%) vs the previous ~$590/mo.**

---

## 1. Line-by-line re-examination

### 1.1 Account structure: 4 → 2 accounts

The 4-account org existed to isolate dev/staging/prod. With one environment, that collapses. But going to a **single** account loses the one isolation that still matters at any scale: **backup copies that survive account compromise** (ransomware / stolen credentials deleting both data and backups).

**Decision: AWS Organization with 2 accounts** — accounts themselves are free:

| Account | Holds |
|---|---|
| `management` | Org root, consolidated billing, budgets, the cross-account **backup vault copy** |
| `prod` | Everything else (the workload) |

Risk of the cut: none material — we keep the boundary that protects data. What we lose is per-env blast radius, which no longer exists as a concept.

### 1.2 NAT gateway: eliminated ($35–40/mo → $0)

Three options weighed honestly:

| Option | Cost/mo | Verdict |
|---|---|---|
| NAT gateway | ~$37 | The thing being cut |
| VPC interface endpoints instead | ~$8 **each**; we'd need 6–8 (ECR api+dkr, Logs, Secrets Manager, STS, KMS, SSM×3) ≈ $50–60 — **and** we still need real internet egress for the Claude API | Worse than NAT. Rejected |
| fck-nat (t4g.nano EC2) | ~$4 | Cheap but adds an instance to patch/own. Rejected while option below works |
| **Fargate task in a public subnet with a public IP + strict SGs** | **$0** | **Chosen** |

Honest security assessment of the chosen option: the task ENI gets a public IP (needed for egress to the Claude API, ECR, etc.), but its security group allows **zero inbound** except the ingress path's ENIs (§1.4) on the container port. Nothing is reachable from the internet: SGs are stateful default-deny. The residual risk vs a private subnet is *misconfiguration* — someone later adding an open inbound rule. Mitigations: SG rules live only in Terraform (plan reviewed on every PR), checkov rule forbidding `0.0.0.0/0` ingress, and the DB stays in a **private subnet with no internet route at all** (RDS needs no egress). The data tier keeps full private-subnet protection; only the stateless app tier is in public subnets. This is the standard cost-sensitive pattern and I'm comfortable signing it for 5 users. `# ponytail: public-subnet Fargate; move to private subnets + NAT (or fck-nat) if compliance review or scale ever demands it`.

### 1.3 Database: Aurora Serverless v2 → RDS PostgreSQL t4g.micro

| Option | Cost/mo (eu-west-1) | Notes |
|---|---|---|
| Aurora Serverless v2, min 0.5 ACU | ~$48 + storage | Min-capacity floor never pauses under a live API; paying for elasticity 5 users will never exercise |
| **RDS `db.t4g.micro`, single-AZ, 20 GB gp3** | **~$16** | ~$13 instance + ~$2.5 storage; automated backups free up to DB size |

**Decision: RDS PostgreSQL `db.t4g.micro`, single-AZ**, with everything that never bends: KMS encryption at rest (CMK), TLS required (`rds.force_ssl`), automated backups 14 days + cross-account vault copy, deletion protection, `prevent_destroy`.

Risks of the cut, stated plainly:
- **Single-AZ**: an AZ failure means restore-from-snapshot into another AZ — RTO ~1h, RPO minutes (PITR). Acceptable for 5 test users; the upgrade is one tfvars change (`multi_az = true`, +$13/mo).
- **micro sizing**: 1 GB RAM caps connections (~80) and heavy queries. Fine at this load; `t4g.small` is a tfvars change.

Open dependency: backend is evaluating a document/NoSQL store (CEO decision #8). If they land on **DynamoDB**, this line drops to ~$1/mo on-demand and the single-AZ risk disappears entirely (DynamoDB is multi-AZ by design). The Terraform module boundary keeps this swappable.

### 1.4 Ingress: ALB → API Gateway HTTP API ($20–25/mo → ~$0)

An ALB costs ~$18/mo before a single request. For one HTTP service:

**Decision: API Gateway HTTP API → VPC Link (free) → Cloud Map service discovery → the Fargate task.**

- Cost: ~$1.11 per **million** requests in EU. At 5 users: cents.
- TLS: ACM certificate on the custom domain (`api.<domain>`), free, TLS 1.2+.
- Built-in throttling (free, crude DDoS/cost protection an ALB doesn't give us).
- Task SG inbound: only the VPC Link ENIs' SG on the container port.

Known limits, all acceptable: 29 s integration timeout (long AI parses must respond or go async anyway — good discipline), 10 MB payloads (PDF/photo uploads already go direct to S3 via presigned URLs, never through the API), no WebSockets on HTTP API (not needed).

Deploy health: without ALB target-group checks, ECS uses the **container health check** + deployment circuit breaker for rollback. Equivalent safety, one less paid component.

### 1.5 Fargate sizing

**1 task, ARM64 (Graviton), 0.25 vCPU / 1 GB, running 24/7 ≈ $8.5/mo.** No autoscaling, no scale-to-zero: production must answer immediately, and the always-on floor costs less than the complexity of anything cleverer. 1 GB (not 0.5) because it's a JVM sharing the task with the OTel collector sidecar (§3); ARM because it's ~20% cheaper and Kotlin/JVM runs natively — backend Dockerfile must build `linux/arm64` (dependency noted).

### 1.6 Cuts to the security tooling line — what stays and what waits

- **Keep**: CloudTrail (first trail free; S3 storage pennies), **GuardDuty** (~$3/mo at our event volume — cheap threat detection on a health-data account).
- **Defer**: Security Hub (~$10/mo of compliance-posture aggregation; with 1 account and checkov scanning all Terraform in CI, it's redundant *for now*). Risk: no continuous config-drift scoring — mitigated by everything being Terraform with plan review. Revisit at real-user launch.

### 1.7 Mobile pipeline: deleted

CEO builds and submits from his Mac (decision #9). Removes GitHub macOS runner minutes (~$40–80/mo), Fastlane signing infrastructure, and the paid GitHub tier pressure. CI for the app repo folder is lint + unit tests on Linux runners only (free tier).

---

## 2. Prometheus on AWS + local Grafana

### 2.1 Hosting: Amazon Managed Prometheus (AMP)

| Option | Cost/mo | Ops burden |
|---|---|---|
| Self-hosted Prometheus (2nd Fargate task 0.25/0.5 + EFS for TSDB) | ~$8–10 | Ours: upgrades, storage sizing, retention config, and a fiddly SSM tunnel path to reach it |
| **Amazon Managed Prometheus** | **~$2** | Zero |

AMP pricing: $0.90 per 10 M samples ingested. Our volume: ~500 active series scraped every 60 s ≈ 22 M samples/mo ≈ **$2**, storage negligible. AMP wins on both columns — cheaper *and* managed. `# ponytail: AMP; self-host only if series count ever makes AMP the expensive option (~>50M samples/mo it's still fine)`.

### 2.2 How the CEO's local Grafana reaches AMP securely

No tunnel needed, and no public *unauthenticated* endpoint exists: AMP's query endpoint is an AWS API endpoint — TLS + **SigV4-signed IAM requests only**, same security model as S3 or Secrets Manager. Grafana supports SigV4 natively on the Prometheus datasource.

Exact connection flow (CEO's Mac):

1. One-time: `brew install grafana awscli` and Identity Center gives the CEO a permission set `VitaMetricsReader` containing only `aps:QueryMetrics`, `aps:GetSeries`, `aps:GetLabels`, `aps:GetMetricMetadata` on the workspace ARN.
2. One-time: `aws configure sso` → profile `vita-metrics`.
3. Each session: `aws sso login --profile vita-metrics` (browser SSO, short-lived creds — no stored keys, ever).
4. Grafana → Prometheus datasource: URL = the AMP workspace query endpoint, Auth = **SigV4**, region = the deployment region, credentials = AWS profile `vita-metrics`.
5. `brew services start grafana` → `http://localhost:3000`. Dashboards JSON lives in `devops/services/grafana-dashboards/` so any machine can import them.

If the SSO-login-per-session friction ever annoys, the fallback is Tailscale to a tiny in-VPC proxy — but that's more moving parts for less security than SigV4. Not doing it.

### 2.3 OpenTelemetry: one collector path

One **ADOT collector sidecar** in the API task, one config file in the repo:

```
Kotlin app (OTel SDK / Java agent)
  ├─ traces  ─→ ADOT sidecar ─→ AWS X-Ray            (~$1/mo, sampled; 100k traces free)
  ├─ metrics ─→ ADOT sidecar ─→ AMP (remote_write)    (task role: aps:RemoteWrite only)
  └─ logs    ─→ stdout (JSON) ─→ awslogs driver ─→ CloudWatch Logs
```

Logs deliberately skip the collector: the ECS `awslogs` driver is zero-config and free of extra plumbing; the backend's structured-JSON + no-PII contract from the kickoff still applies. CloudWatch Logs remain the AI-diagnosable log store (Logs Insights via CLI). Alarms stay CloudWatch (5xx, latency, task crash-loop, RDS storage/CPU, SES bounce, budget) → SNS email to the CEO.

---

## 3. What we keep no matter what

- **KMS CMK encryption at rest**: RDS, S3, Secrets Manager, CloudWatch Logs. Key policy scoped to the specific service roles.
- **TLS 1.2+ in transit**: API GW ACM cert, `rds.force_ssl`, SES TLS.
- **Least-privilege IAM**: no IAM users, no long-lived keys anywhere. Humans via Identity Center SSO; CI via **GitHub OIDC** roles (plan-only role vs apply role); the ECS task role sees exactly its secrets/buckets/AMP write.
- **Plan-only CI, CEO-gated apply**: PR runs fmt/validate/tflint/checkov + `terraform plan` (read-only role). Apply is a separate `workflow_dispatch` job from `main` only, runnable only by the CEO, using the saved plan artifact. `prevent_destroy` on DB/S3/KMS.
- **Backups with tested restore**: RDS automated backups 14 d + AWS Backup cross-account copy to `management`; a restore rehearsal is a standing quarterly ticket — a backup that was never restored is a hope, not a backup.

---

## 4. Region: eu-west-1, region-agnostic Terraform

**eu-west-1 (Ireland)** over eu-central-1 (Frankfurt): Frankfurt runs ~5–10% higher on the lines that matter here (Fargate ~+7%, RDS t4g ~+9%, data transfer equal), and Ireland historically gets new AWS services first in Europe. Both are GDPR-equivalent EU locations. Difference at our size is ~$2–3/mo — Ireland wins, nothing else distinguishes them.

Region-agnostic pattern (the Brazil clause):

- **One variable**: `var.aws_region` is the only place a region is named; provider block reads it.
- **No hardcoded AZs**: `data.aws_availability_zones.available` + index slicing.
- **No hardcoded ARNs/partitions**: compose ARNs from `data.aws_partition`, `data.aws_caller_identity`, `var.aws_region`.
- **Regional service quirks behind modules**: anything region-sensitive (SES endpoints, AMP availability) is resolved inside a module, not in root config.
- **State layout**: `envs/prod-eu/` root with its own state key; a future `envs/prod-br/` is a new thin root reusing the same modules with different tfvars — spinning up Brazil is a copy of one small folder.
- **AMI/architecture**: none (Fargate), which is part of why this stays clean.

---

## 5. New monthly cost estimate (eu-west-1, USD, ±30%)

| Line item | $/mo | Sizing |
|---|---:|---|
| ECS Fargate API task (ARM, 0.25 vCPU / 1 GB, 24/7, incl. OTel sidecar) | 8.50 | 1 task, no autoscaling |
| API Gateway HTTP API + VPC Link | 0.10 | ~$1.11/M requests; VPC Link free |
| RDS PostgreSQL t4g.micro single-AZ + 20 GB gp3 (KMS) | 15.60 | backups ≤ DB size free |
| NAT gateway | 0 | eliminated (§1.2) |
| S3 (uploads/exports, SSE-KMS) + ECR | 2.00 | low volume |
| CloudWatch Logs + alarms | 3.00 | JSON logs, 400 d retention, Insights queries |
| Amazon Managed Prometheus | 2.00 | ~22 M samples/mo |
| X-Ray (sampled traces) | 1.00 | mostly inside free tier |
| Secrets Manager (4 secrets) + KMS (2 CMKs) | 3.60 | |
| Route 53 (zone + queries) | 1.50 | |
| SES (magic links) | 0.10 | |
| CloudTrail + audit S3 | 0.50 | first trail free |
| GuardDuty | 3.00 | low event volume |
| AWS Backup cross-account copy | 1.00 | snapshot storage in `management` |
| **Total AWS** | **~$42** | **vs ~$590 previously** |

Non-AWS: GitHub **Free** (private repo; apply gate via CEO-only `workflow_dispatch` — formal Environment approval rules would need Team at $4/mo, upgrade any time); Apple Developer $99/yr; Google Play $25 once; domain ~$15–45/yr. Claude API product usage remains a backend budget line with its own spend limit (§ setup guide).

### What was cut, and the risk each cut carries

| Cut | Saved/mo | Risk taken | Mitigation |
|---|---:|---|---|
| dev + staging environments | ~$236 | Nothing between laptop and prod — a bad deploy hits users | §6 discipline: Testcontainers CI gate, backward-compatible migrations, circuit-breaker auto-rollback |
| 2 environments' worth of org/tooling duplication | ~$50 | — | — |
| NAT gateways (×3) | ~$110 | App tier has public IPs (SG-locked, zero inbound) | Terraform-only SGs, checkov `0.0.0.0/0` guard, DB fully private |
| Aurora Sv2 → RDS t4g.micro single-AZ | ~$32 | AZ failure ⇒ ~1 h RTO; 1 GB RAM ceiling | PITR (minutes RPO); `multi_az`/`t4g.small` are tfvars flips |
| ALB → API GW HTTP API | ~$20 | 29 s timeout, container-level health checks | Async pattern for long AI work; ECS circuit breaker |
| Security Hub (kept GuardDuty) | ~$10 | No continuous compliance scoring | checkov in CI; revisit at public launch |
| Mobile CI (macOS runners, Fastlane) | ~$40–80 | Builds depend on one human + one Mac | CEO's explicit decision; document the manual build steps |
| Multi-AZ ECS (2 tasks) | ~$8.50 | Task/AZ death ⇒ minutes of downtime while ECS reschedules | Acceptable at 5 users |

## 6. Single-environment operational discipline

No staging means the pipeline and habits are the safety net:

1. **Local is the test environment**: `docker compose` with the exact prod PostgreSQL major version; backend integration tests run against Testcontainers PostgreSQL in CI — same engine, real SQL. Nothing merges red.
2. **Migrations are backward-compatible, always** (expand/contract): new code must run against the previous schema and previous code against the new schema. Never `DROP`/`RENAME` in the same release that stops using a column. CI check: migrations are append-only (existing migration files immutable) and apply cleanly from zero.
3. **Deploy order**: merge to `main` → build + push image (git SHA tag) → Flyway migration as a one-off ECS task → ECS rolling deploy with **deployment circuit breaker + auto-rollback** → automated smoke test (health + one real endpoint) → alarm watch window.
4. **Rollback is one command**: redeploy the previous image tag. The DB is never rolled back — forward fixes only, which is exactly why rule 2 is absolute.
5. **Deploys are small and frequent**; a deploy that scares us is too big. No deploys when the CEO is unreachable for the alarm email.
6. **Quarterly restore rehearsal** (standing ticket): restore the latest snapshot into a temp instance, verify, destroy.

## 7. Questions for the CEO

1. **Domain**: still open from kickoff — blocks SES verification, API hostname, and app bundle IDs (see setup guide).
2. **GitHub Free + CEO-only `workflow_dispatch` apply gate** ok, or do you want formal Environment approval reviews (GitHub Team, $4/mo)?
3. **Budget alarm threshold**: proposing a $60/mo AWS budget with alerts at 50/80/100% — confirm the number.
4. **Grafana access flow** (§2.2, `aws sso login` then open Grafana) acceptable?
5. Carried over from kickoff, still open: Anthropic DPA/zero-retention confirmation; data-retention windows for uploads/exports/logs.
