# DevOps Kickoff Proposal — Vita infrastructure, zero to production

> Phase 0 deliverable. Nothing here is provisioned; this is the plan for CEO review.
> Author: team-lead-devops. Date: 2026-07-12.

## Guiding principles

1. **Operational simplicity beats flexibility.** One small AI-driven team, no ops on-call rotation. Every choice below is the boring managed option unless there is a hard reason otherwise.
2. **100% Terraform** (CEO decision). Nothing clicked in the console; the repo is the source of truth.
3. **Health data = LGPD/GDPR sensitive.** Encryption everywhere, least privilege, auditable access, data residency decided up front.
4. **AI-operable.** Every pipeline, dashboard and log store must be queryable by an AI session via CLI/API, not just a human UI.

---

## 1. AWS architecture

### Compute — ECS Fargate (chosen)

| Option | Verdict |
|---|---|
| **ECS Fargate** | **Chosen.** No cluster to manage, no nodes to patch, per-task IAM roles, native ALB + CloudWatch integration, scales to zero-ish for dev. Terraform support is mature and simple. |
| EKS | Rejected. Kubernetes buys us nothing at this scale and costs a control plane ($73/mo/env) plus permanent operational overhead (upgrades, addons, RBAC). Classic over-engineering for a 1-service backend. |
| App Runner | Seriously considered — it is even simpler — but rejected: no VPC-native private networking without connectors, weaker Terraform/observability story, less control over deploy strategy, and we'd likely outgrow it (background jobs, workers for AI parsing queues). Fargate is nearly as simple and won't need a migration. |

Shape: one ECS service running the Kotlin API behind an **ALB**; a second Fargate service (or scheduled tasks) later for async work (PDF import parsing, exports) if the backend team wants a worker. Docker images in **ECR**.

### Database — Aurora PostgreSQL Serverless v2 (prod) / RDS PostgreSQL single-AZ (dev, staging)

- PostgreSQL is the safe default for this relational, log-entry-shaped data model; the backend team designs the schema with us.
- Prod: Aurora Serverless v2, min 0.5 ACU, Multi-AZ reader optional at launch (can start single writer + automated backups; add reader before GA if budget allows). Encryption at rest (KMS), automated backups 35 days, deletion protection on.
- Dev/staging: plain RDS PostgreSQL `db.t4g.micro`/`small`, single-AZ, 7-day backups. Same engine version as prod.
- Migrations: owned by backend (Flyway/Liquibase in the app); we provide the pipeline step and a guarded prod-migration gate.

### Networking

- One VPC per environment: 2 AZs, public subnets (ALB, NAT) + private subnets (ECS tasks, RDS). Single NAT gateway per env (dev/staging) — `# ponytail: single NAT, add second AZ NAT in prod only if an AZ outage of egress actually matters`.
- ALB terminates TLS (ACM certs), HTTPS only, HTTP→HTTPS redirect. Route 53 for DNS (`api.vita.app` style, domain TBD — CEO question).
- No VPN/bastion: DB access for humans/AI via **SSM Session Manager port forwarding** (auditable, no open ports).
- Egress to Claude API and Apple/Google endpoints via NAT; no inbound except ALB 443.

### Email delivery (magic links)

- **Amazon SES** — pennies at our volume, native IAM, no extra vendor to contract under LGPD. Dedicated configuration set + event destination (bounces/complaints → CloudWatch). Domain identity with DKIM/SPF/DMARC.
- Needs production access request (out of SES sandbox) — an early ticket, since AWS approval takes days.

### File storage (PDF imports, exports)

- **S3**, one bucket per purpose per env: `vita-{env}-uploads` (nutritionist PDFs, photos if backend stores them), `vita-{env}-exports` (generated PDFs).
- Presigned URLs for upload/download — the backend never proxies file bytes.
- SSE-KMS encryption, versioning on uploads, lifecycle: exports expire (e.g. 30 days), uploads retained per data-retention policy (CEO/legal question below).
- Block all public access on every bucket, enforced by an org-level control.

### Secrets management

- **AWS Secrets Manager** for credentials the app reads at runtime (DB password, Claude API key, OAuth client secrets), injected into ECS tasks as secrets — never env-var plaintext in task definitions committed to git.
- SSM Parameter Store (free tier) for non-secret config.
- Rotation: DB credentials via Secrets Manager native rotation; Claude API key rotated manually on a calendar reminder — `# ponytail: manual rotation, automate if key count grows`.

---

## 2. Environments & Terraform

### Account structure

**Proposal: AWS Organizations with 4 accounts** — `management` (org root, billing), `dev`, `staging`, `prod`. Account = the real blast-radius and LGPD isolation boundary; IAM-only separation inside one account is where small teams get burned. Centralized CloudTrail + SSO (IAM Identity Center) from the management account. If the CEO prefers to start lighter, dev+staging can share one account, but prod is always its own account.

### Terraform layout

```
devops/services/terraform/
├── modules/            # network, ecs-service, database, dns, observability...
├── envs/
│   ├── dev/            # thin root module per env: main.tf + terraform.tfvars
│   ├── staging/
│   └── prod/
└── bootstrap/          # state buckets, org accounts, OIDC roles (run once)
```

- **State**: S3 backend with native lockfile locking (S3 lock, no DynamoDB table needed on recent Terraform), one state bucket per account, versioned + encrypted.
- Envs differ only by tfvars (sizes, counts, domain), never by divergent code.
- Pinned provider/Terraform versions; `terraform fmt`/`validate`/`tflint` + **checkov** security scan in CI.

### How an AI agent changes infra safely

1. Agent edits Terraform in a branch, opens a PR.
2. CI runs fmt/validate/lint/checkov and **`terraform plan` only**, posting the plan as a PR comment. CI role has **read-only + plan** permissions.
3. **Apply is a separate, manually-triggered job** gated by GitHub Environment protection: the CEO (or orchestrator relaying CEO approval) approves the environment deployment. The apply role is assumable only by that protected job via OIDC — no long-lived AWS keys anywhere.
4. Prod applies additionally require the PR to be merged (apply from `main` only) and the plan artifact to match (`plan -out` + `apply plan.bin`).
5. Destructive operations (`destroy`, resource replacement of stateful things) are called out in the PR description by convention and blocked by `prevent_destroy` on DB/S3/KMS.

---

## 3. CI/CD

### Platform — GitHub Actions (chosen)

Justification: the repo lives on GitHub (assumed — CEO question if not); native OIDC to AWS (no stored cloud keys); Environments give us the approval gates above; macOS runners for iOS builds; the AI agents already speak `gh` CLI fluently, which matters for an AI-operated company. Alternatives (GitLab CI, CircleCI, Buildkite) add a vendor without adding capability.

### Backend pipeline

- **PR**: Gradle build, unit + integration tests (Testcontainers PostgreSQL), ktlint/detekt, Docker build (no push).
- **Merge to main**: build + push image to ECR (tagged by git SHA), deploy to **dev** automatically, run smoke tests.
- **Staging**: automatic promotion of the same image after dev smoke passes.
- **Prod**: manual approval gate (GitHub Environment), then ECS rolling deploy (min healthy 100%, circuit breaker on with auto-rollback). DB migrations run as a one-off ECS task before the service update.

### Mobile pipeline (stack TBD by app team — pipeline shape is stack-agnostic)

- **PR**: build, unit tests, lint.
- **Main**: versioned build → **TestFlight** (iOS) and **Play Console internal track** (Android) via **Fastlane** (works for native, Flutter, RN, KMP alike).
- Signing: certificates/profiles in Fastlane match with an encrypted private repo or S3 bucket; Play upload key in Secrets Manager; App Store Connect API key likewise.
- iOS builds on GitHub-hosted macOS runners (the main mobile CI cost driver).
- Store release (production track / App Store review submission) always manual, CEO-approved.

### Contract checks

- OpenAPI contract in `docs/contracts/` linted (spectral) and diffed on PR — breaking-change detection wired into both backend and app pipelines.

---

## 4. Observability

Bias: **CloudWatch-native**, because it is Terraformable, has zero extra vendors under LGPD, and is fully queryable via AWS CLI — which is exactly what an AI diagnostic session needs.

- **Logs**: ECS → CloudWatch Logs, JSON structured logging (backend team contract: request id, user id hash, route, latency). Queried via **CloudWatch Logs Insights** — an AI session runs `aws logs start-query` and reads results, no UI needed. Retention: 30d dev/staging, 400d prod (audit-relevant).
- **Metrics**: ECS/ALB/RDS built-ins + application metrics via **CloudWatch EMF** (embedded metric format — no agent, no Prometheus stack). Key metrics: request latency p50/p95/p99, error rate, AI-parse latency and Claude API error/429 rate, SES bounce rate, DB connections/ACU.
- **Traces**: **AWS X-Ray** via OpenTelemetry SDK in the Kotlin app + ADOT sidecar. `# ponytail: X-Ray over a full Grafana/Tempo stack; revisit if trace UX becomes a bottleneck`.
- **Dashboards**: Terraform-defined CloudWatch dashboards per env (API health, DB, AI-calls, email). Being code, an AI session can read the dashboard definition and pull each widget's data via API.
- **Alerts**: CloudWatch Alarms → SNS → email (CEO) + a webhook the orchestrator can poll. Starter set: 5xx rate, p99 latency, ECS task crash-loop, RDS CPU/storage/ACU ceiling, SES bounce/complaint rate, Claude API sustained error rate, monthly **AWS Budget alarms** per account.
- **Runbook convention**: every alarm description links to `devops/Doc/runbooks/<alarm>.md` so a fresh AI session can act on a page without archaeology.

---

## 5. Security & compliance

- **IAM**: no IAM users, no long-lived keys. Humans via Identity Center SSO; CI via GitHub OIDC roles (plan-only vs apply, per env); each ECS service gets its own task role scoped to exactly its buckets/secrets/queues. Permission boundaries on CI roles.
- **Encryption in transit**: TLS 1.2+ everywhere — ALB HTTPS only, RDS `require_ssl`, SES TLS. Internal ALB→task traffic stays inside private subnets.
- **Encryption at rest**: customer-managed KMS keys (per env) for RDS, S3, Secrets Manager, CloudWatch Logs. Key policies restrict decrypt to the specific service roles.
- **Audit**: CloudTrail (org-wide, all regions) → central S3, object lock; GuardDuty + Security Hub (foundational standard) on all accounts; access to prod data is always via auditable paths (SSM sessions logged).
- **LGPD/GDPR posture**:
  - Data residency: single region hosting all user data — see region question below (São Paulo vs US/EU).
  - Data minimization is product-native ("name and email — nothing else" at sign-in); infra adds: user-id pseudonymization in logs (no PII in log lines — backend contract), export/delete support (backend feature; infra guarantees S3 object deletion + backup expiry honor it).
  - Claude API is an international transfer of health-adjacent text — flagged in the privacy policy; we send no direct identifiers in prompts (backend contract). Zero-data-retention / DPA with Anthropic to be confirmed (CEO/legal question).
  - Records of processing + subprocessor list (AWS, Anthropic, Apple, Google) — doc deliverable in Phase 1.
- **Backups/DR**: RDS automated backups (35d prod) + AWS Backup plan with cross-account copy of prod snapshots (ransomware/account-compromise protection). S3 versioning. DR target: **restore-from-backup in-region**, RPO ≤ 24h (point-in-time restore gives minutes in practice), RTO ~4h via Terraform re-apply + restore. No multi-region active setup — not justified at this scale.

---

## 6. Monthly cost estimate (USD, on-demand, rough ±30%)

| Item | Dev | Staging | Prod | Notes |
|---|---:|---:|---:|---|
| ECS Fargate (API) | 10 | 18 | 72 | dev/staging 1×0.25vCPU/0.5GB (staging 0.5/1); prod 2×0.5vCPU/1GB |
| ALB | 20 | 20 | 25 | ~$16 base + LCU |
| RDS / Aurora | 13 | 26 | 130 | t4g.micro / t4g.small / Aurora Sv2 ~1 ACU avg + storage/backup |
| NAT gateway | 35 | 35 | 40 | $32 base + processing; the classic silent cost driver |
| S3 + ECR | 3 | 3 | 10 | low volume at launch |
| CloudWatch (logs, metrics, dashboards, alarms) | 10 | 10 | 40 | prod includes Insights queries + custom metrics |
| Secrets Manager + KMS | 8 | 8 | 12 | ~6 secrets + 2 CMKs per env |
| SES | — | 1 | 2 | magic links are cheap |
| Route 53 + ACM | 2 | 1 | 2 | hosted zone + queries; ACM free |
| GuardDuty + Security Hub + CloudTrail | 5 | 5 | 15 | scales with API event volume |
| X-Ray | 1 | 2 | 5 | sampled |
| **Subtotal AWS** | **~107** | **~129** | **~353** | |

**AWS total: ~$590/mo** (~$490 if dev+staging share a NAT/account as a cost lever).
Non-AWS: GitHub Team ~$20/mo + Actions macOS minutes (~$40–80/mo once mobile CI is busy); Apple Developer $99/yr; Google Play $25 once. **Claude API product usage is a backend-team cost line, not included here** — it will likely dwarf infra at scale and needs its own budget line.

Biggest levers if the ceiling is tight: NAT gateways (~$110/mo of the total — VPC endpoints or fck-nat can cut this), Aurora → plain RDS in prod (−$60), shared dev/staging account.

---

## 7. Delivery waves

**Wave 0 — Foundations** (unblocks everyone)
- OPS: AWS org + accounts, SSO, Terraform bootstrap (state, OIDC roles), billing alarms, CI skeleton (lint/plan on PR), SES production access request.

**Wave 1 — Dev environment end-to-end**
- OPS: dev VPC/ALB/ECS/RDS/S3/secrets modules; backend "hello world" container deployed via pipeline; CloudWatch logging baseline; ECR.

**Wave 2 — Real backend on dev + staging**
- OPS: DB migrations step, Secrets wiring for Claude API key, SES magic-link sending from dev/staging, presigned-URL buckets, staging env stamped from the same modules, contract-lint CI.

**Wave 3 — Mobile CI + observability**
- OPS: Fastlane pipelines → TestFlight/Play internal, signing management, dashboards + alarm set + runbook skeletons, X-Ray tracing, Logs Insights saved queries for AI diagnosis.

**Wave 4 — Production & hardening**
- OPS: prod account env (Aurora, Multi-AZ decisions), GuardDuty/Security Hub/CloudTrail org rollout, AWS Backup cross-account copies, DR restore rehearsal, security review (exposed surface, IAM audit, checkov clean), load smoke test, go-live checklist.

**Wave 5 — Post-launch ops**
- OPS: cost review vs estimate, alarm tuning from real traffic, backup/restore drill cadence, LGPD docs finalized (subprocessors, retention automation).

---

## 8. Dependencies on other teams

- **Backend**: framework + JVM/Gradle version and Dockerfile ownership; health-check endpoint; structured JSON logging + no-PII-in-logs contract; DB schema & migration tool choice; OTel instrumentation; queue/worker needs (yes/no) for PDF/photo parsing; SES vs their own email templating boundary.
- **App**: stack choice (determines exact build steps, but Fastlane shape holds); bundle IDs / app names for TestFlight & Play setup; deep-link domain for magic links (needs Route 53 + associated-domains files served somewhere — likely S3/CloudFront).
- **Backend + App jointly**: OpenAPI contract in `docs/contracts/` before Wave 2 deploys anything real.
- **Orchestrator/CEO**: Apple Developer + Google Play accounts created (human-only steps); domain purchase; GitHub org/repo settings admin.

## 9. Questions for the CEO

1. **Region / data residency**: users presumably in Brazil — host in `sa-east-1` (São Paulo: best LGPD story + latency, ~20–30% pricier, occasional service lag) or `us-east-1` (cheapest, all services, but international data transfer under LGPD)? My default recommendation: **sa-east-1** for a health product with Brazilian users.
2. **Budget ceiling**: is ~$590/mo AWS (plus CI/store fees, plus Claude API usage) acceptable for dev+staging+prod? If the ceiling is lower, I'll apply the levers in §6.
3. **Account structure**: approve the 4-account AWS Organization (management/dev/staging/prod)? Requires 4 root emails (aliases of one inbox work).
4. **Domain**: what is the product domain (e.g. `vita.app`, `getvita.com.br`)? Needs purchase before Wave 1 DNS work.
5. **GitHub**: confirm GitHub as the repo host and approve GitHub Actions + a paid Team plan (needed for environment protection rules on private repos).
6. **Anthropic DPA / data retention**: can we confirm a zero-retention or DPA arrangement for Claude API traffic containing health-adjacent text? Legal-adjacent; affects the privacy policy.
7. **Data retention policy**: how long do we keep raw uploaded PDFs/photos after parsing, and log data? Drives S3 lifecycle + backup expiry (my defaults: uploads 90d, exports 30d, prod logs 400d).
8. **Apple/Google developer accounts**: who creates them (human-only steps with payment + identity verification)? Blocking for Wave 3.
