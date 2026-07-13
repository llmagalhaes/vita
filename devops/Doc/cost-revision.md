# Cost Revision — single production environment, ~5 users

> Revises `kickoff-proposal.md` per CEO decisions of 2026-07-13 (items 4, 5, 6, 9, 10, 12 in `docs/ceo-decisions.md`).
> **Amended 2026-07-13 per Round 3 decisions**: domain purchase deferred (placeholder DNS, §1.8), GitHub Free apply gate (§3.1), budgets $40 AWS / $10 Claude, free tier maximized (§5).
> Author: team-lead-devops. Date: 2026-07-13. Documents only — nothing provisioned.

**New reality**: production only (all pre-prod testing is local), ~5 initial users, cost is the top priority, security/encryption never bends. Region: Europe, region-agnostic Terraform. Grafana runs only on the CEO's Mac. No mobile build pipeline. No domain yet.

**Result: ~$16/mo year 1 (free tier), ~$37/mo year 2+ (±30%) — under the $40 budget alarm — vs the previous ~$590/mo.**

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

- Cost: ~$1.11 per **million** requests in EU. At 5 users: cents (first 1 M req/mo free for 12 months).
- TLS: the **default `https://<api-id>.execute-api.<region>.amazonaws.com` endpoint** (AWS-managed cert, TLS 1.2+). No custom domain until one is bought (§1.8) — then it's an ACM cert + one `aws_apigatewayv2_domain_name` resource, no re-architecture.
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

### 1.8 Placeholder DNS — domain purchase deferred (Round 3 decision #1)

No domain in v1. What replaces each thing a domain would have given us:

| Need | Placeholder solution | Cost |
|---|---|---:|
| API hostname | Default `execute-api` URL. App reads the base URL from build config — swapping in a custom domain later is a config change + app update | $0 |
| Email sender/recipients | **SES stays in sandbox.** Sender = CEO's verified email address; recipients = the ~5 testers' addresses as verified identities (Terraform `aws_ses_email_identity`; each tester clicks one verification email). No production-access request | $0 |
| Magic-link open-the-app | Email links to an https route **on the backend itself** (e.g. `GET /auth/open?token=…` behind the same API GW) which 302-redirects to the custom scheme `vita://auth?token=…`, with a tiny HTML fallback ("open the Vita app"). No S3/CloudFront needed — the backend is already there | $0 |
| Bundle ID / package name | **Must not derive from the future domain.** Reverse-DNS of something the CEO permanently controls, e.g. `com.lucasmagalhaes.vita` — Apple/Google don't verify domain ownership for identifiers. Unblocks store enrollment now | $0 |

Sandbox limits, all fine at our size: recipients must be verified, max 200 emails/24 h, 1 msg/s.

Honest risks of this setup (also in ADR-0009):
- **Custom-scheme links are not verified**: on Android, any installed app can claim `vita://` (universal/app links require a domain). Mitigation: magic-link tokens are single-use + short TTL, and the audience is 5 known testers. Fixed automatically when the domain arrives (universal links).
- **Every new tester needs a manual SES identity verification** before receiving mail — onboarding friction, acceptable at 5.
- **The `execute-api` URL is coupled to the API resource's lifecycle**: if the API GW is ever destroyed/recreated, the URL changes and shipped apps break until updated. Mitigation: `prevent_destroy` on the API, and the app treats the base URL as config.

`# ponytail: redirect route on the backend, not S3/CloudFront — one less thing; revisit only if the redirect must outlive backend deploys`

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

- **KMS CMK encryption at rest**: RDS, S3, secrets, CloudWatch Logs — **one data CMK** (was two; at this scale one key policy scoped to the specific service roles covers it, −$1/mo). Split keys later if audit scope ever demands it.
- **Secrets**: **SSM Parameter Store SecureString** (standard tier, free, KMS-encrypted, native ECS injection) instead of Secrets Manager (−$1.60/mo). We lose managed rotation — the Anthropic key is rotated manually anyway. `# ponytail: SSM SecureString; move to Secrets Manager if we ever need automatic rotation`
- **TLS 1.2+ in transit**: API GW default endpoint (AWS-managed cert), `rds.force_ssl`, SES TLS.
- **Least-privilege IAM**: no IAM users, no long-lived keys anywhere. Humans via Identity Center SSO; CI via **GitHub OIDC** roles (plan-only role vs apply role); the ECS task role sees exactly its parameters/buckets/AMP write.
- **Plan-only CI, CEO-gated apply** on GitHub Free — design in §3.1. `prevent_destroy` on DB/S3/KMS/API GW.
- **Backups with tested restore**: RDS automated backups 14 d + AWS Backup cross-account copy to `management`; a restore rehearsal is a standing quarterly ticket — a backup that was never restored is a hope, not a backup.
- **Budgets as enforcement**: AWS Budget **$40/mo** (management account, consolidated) with email alerts at 50/80/100%; **Claude API $10/mo** as a hard spend limit in the Anthropic console (the API stops, it doesn't overspend) — backend also emits token-usage metrics to AMP so the Grafana dashboard shows approach before the wall.

### 3.1 GitHub Free apply gate (Round 3 decision #4)

No paid Environment approvals. The gate is built from what Free gives us:

1. **Plan on PR**: fmt/validate/tflint/checkov + `terraform plan` under the **plan role** (read-only, trust policy `sub` scoped to `repo:<owner>/vita:pull_request`).
2. **Plan on `main`**: after merge, a plan job runs on `main` and uploads the plan file as a **workflow artifact**.
3. **Apply = CEO-triggered `workflow_dispatch`** on `apply.yml`, input = the run ID of step 2. It downloads that exact artifact and runs `terraform apply saved.tfplan` — if state drifted since the plan, Terraform refuses the stale plan. No re-plan inside apply, so what the CEO saw is what runs.
4. **OIDC apply role locked to that workflow**: GitHub's `sub` claim is customized to include `job_workflow_ref`, so the apply role's trust policy matches only `repo:<owner>/vita` + `ref:refs/heads/main` + workflow file `.github/workflows/apply.yml`. A PR branch, a fork, or any other workflow cannot assume it. On a private repo, only collaborators (the CEO) can trigger `workflow_dispatch` at all.
5. **Branch protection caveat, stated honestly**: enforced branch-protection/rulesets on **private** repos require a paid plan. On Free the compensating controls are: sole collaborator, the PR-plan-review habit, and the fact that the apply role only works from `main` via the pinned workflow. If a second human collaborator ever joins, that's the moment to pay for Team ($4/mo) and turn real protection on.

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

New AWS account = 12 months of free tier on exactly the lines that dominate here (RDS t4g.micro 750 h/mo, 20 GB storage + 20 GB backup, 1 M API GW requests, 5 GB S3, 500 MB ECR) plus always-free allowances (CloudWatch 10 alarms + 5 GB log ingest, SNS 1 k emails, X-Ray 100 k traces, SSM standard parameters, first CloudTrail trail).

| Line item | Year 1 (free tier) | Year 2+ | Sizing / free-tier note |
|---|---:|---:|---|
| ECS Fargate API task (ARM, 0.25 vCPU / 1 GB, 24/7, incl. ADOT sidecar) | 8.50 | 8.50 | no Fargate free tier |
| API Gateway HTTP API + VPC Link | 0.00 | 0.10 | 1 M req/mo free 12 mo; VPC Link free |
| RDS PostgreSQL t4g.micro single-AZ + 20 GB gp3 (KMS) | 0.00 | 15.60 | 750 h + 20 GB storage + 20 GB backup free 12 mo |
| NAT gateway | 0 | 0 | eliminated (§1.2) |
| S3 (uploads/exports, SSE-KMS) + ECR | 0.20 | 2.00 | 5 GB S3 + 500 MB ECR free 12 mo |
| CloudWatch Logs + alarms + SNS email | 0.50 | 3.00 | 5 GB ingest, 10 alarms, 1 k emails always free |
| Amazon Managed Prometheus | 2.00 | 2.00 | ~22 M samples/mo, no free tier |
| X-Ray (sampled traces) | 0.00 | 0.00 | 100 k traces/mo **always** free — we sample under that |
| Secrets: SSM Parameter Store SecureString | 0.00 | 0.00 | standard tier always free (was Secrets Manager $1.60) |
| KMS (1 data CMK) | 1.00 | 1.00 | was 2 CMKs; one scoped key suffices |
| Route 53 | — | — | deferred with the domain (§1.8); +~$0.50/zone when bought |
| SES (magic links, sandbox) | 0.00 | 0.10 | 3 k msgs/mo free 12 mo; pennies after |
| CloudTrail + audit S3 | 0.30 | 0.50 | first trail free |
| GuardDuty | 3.00 | 3.00 | 30-day trial, then ~$3 at our volume |
| AWS Backup cross-account copy | 0.50 | 1.00 | snapshot storage in `management` |
| **Total AWS** | **~$16** | **~$37** | **budget alarm $40 — headroom ~$24 / ~$3** |

Trims vs the earlier ~$42: Route 53 deferred (−$1.50), Secrets Manager → SSM (−$1.60), 2 CMKs → 1 (−$1.00), X-Ray recognized as always-free at our volume (−$1.00).

Non-AWS: GitHub **Free** (gate design §3.1); Apple Developer $99/yr; Google Play $25 once; domain **deferred** (~$15–45/yr when bought). Claude API: hard $10/mo limit in the Anthropic console, zero-retention arrangement on the key.

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
| Domain + Route 53 (deferred) | ~$1.50 + $15–45/yr | Unverified `vita://` deep links; SES sandbox friction per tester; app coupled to the `execute-api` URL | §1.8: single-use short-TTL tokens, `prevent_destroy` on the API, base URL as app config |
| Secrets Manager → SSM SecureString | ~$1.60 | No managed rotation | Keys rotated manually anyway; swap back if rotation is ever needed |
| Paid GitHub Environment approvals | $4 | No enforced branch protection on a Free private repo | §3.1: sole collaborator, OIDC apply role pinned to `apply.yml`@`main`, stale-plan refusal |

## 6. Single-environment operational discipline

No staging means the pipeline and habits are the safety net:

1. **Local is the test environment**: `docker compose` with the exact prod PostgreSQL major version; backend integration tests run against Testcontainers PostgreSQL in CI — same engine, real SQL. Nothing merges red.
2. **Migrations are backward-compatible, always** (expand/contract): new code must run against the previous schema and previous code against the new schema. Never `DROP`/`RENAME` in the same release that stops using a column. CI check: migrations are append-only (existing migration files immutable) and apply cleanly from zero.
3. **Deploy order**: merge to `main` → build + push image (git SHA tag) → Flyway migration as a one-off ECS task → ECS rolling deploy with **deployment circuit breaker + auto-rollback** → automated smoke test (health + one real endpoint) → alarm watch window.
4. **Rollback is one command**: redeploy the previous image tag. The DB is never rolled back — forward fixes only, which is exactly why rule 2 is absolute.
5. **Deploys are small and frequent**; a deploy that scares us is too big. No deploys when the CEO is unreachable for the alarm email.
6. **Quarterly restore rehearsal** (standing ticket): restore the latest snapshot into a temp instance, verify, destroy.

## 7. Questions for the CEO

Round 3 answered the big ones (domain deferred → §1.8; GitHub Free gate → §3.1; budgets $40/$10; zero-retention confirmed). Still open:

1. **Bundle ID / package name**: proposing `com.lucasmagalhaes.vita` (permanent, not domain-derived per your directive) — confirm before the first store upload, it's immutable.
2. **Domain trigger**: what event makes us buy it — first non-tester user, Android launch (verified app links), or a date? The switch list lives in the setup guide ("When we buy the domain").
3. Data-retention windows for uploads/exports/logs (carried over; defaulting to 400 d logs, 90 d exports unless you object).
