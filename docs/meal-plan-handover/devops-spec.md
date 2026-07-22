# Meal-plan/workout-plan — DevOps spec (2026-07-22)

Team: devops. Binding architecture: `docs/meal-plan-handover/DESIGN-SPEC.md`. This round is
intentionally light for devops: **no new AWS resources, no structural Terraform**. One ticket:
**OPS-024** (deploy + verify runbook, incl. a Terraform drift reconcile found during recon).

## 1. Scope confirmation — nothing structural

- The overlay storage is one new Flyway migration (**V008**, backend-owned) that **rides the
  next backend image** on the existing ECS/RDS pipeline. Flyway runs on task boot, exactly like
  V001–V007 did. No RDS change, no new SSM params, no IAM change (overlay rows live in the
  existing RDS DB, encrypted app-side with the per-user DEK — same KMS posture as `eating_plan.doc_enc`).
- `PUT /plan/portions` + `GET /plan` extensions are app-level routes behind the existing
  API GW `$default` proxy — no API GW change.
- No mobile pipeline (CEO directive: manual builds from the Mac). App-side DoD (fresh APK,
  prod URL baked) is the app team's runbook, not infra.
- **Cost delta: $0/mo infra.** Claude cost delta from the bigger eating-plan prompt (per-item
  micros + `PlanItem.id`/`portion` in the tool schema): rough 1.5–2× output tokens per
  eating-plan parse; at ~5 users on Haiku (text) / Sonnet (PDF) this is **< $1/mo**. Monthly
  total stays ≈ $19 (≈ $34 after RDS free tier).

## 2. Finding from recon — Terraform is 3 releases behind live (MUST fix in this deploy)

Sessions 15–16b deployed `vita:5→7` as **CLI task-def clones** (images `be033/be034/be035`),
while Terraform still holds `app_image_tag = "909262c"` (`envs/prod-eu/variables.tf:25`) and
its `environment` block (`modules/ecs/main.tf:230`) lacks `PUBLIC_BASE_URL` (added live in
`vita:7` for BE-035). Terraform owns the deploy (`ignore_changes` removed in session 8) — so
**any naive `terraform apply` today rolls prod back three backend releases.** The meal-plan
deploy goes through Terraform and re-converges state as a side effect:

1. `modules/ecs/main.tf`: add `{ name = "PUBLIC_BASE_URL", value = var.public_base_url }` to
   `environment` + a `public_base_url` variable. Note: the app's `application.yaml` default is
   the same eu URL, so this is explicitness + region-agnosticism (a Brazil stand-up would
   otherwise silently get the eu default), not a behavior change in prod-eu.
2. `envs/prod-eu/main.tf`: wire `public_base_url = trimsuffix(module.apigw.api_endpoint, "/")`
   (apigw → ecs is already the dependency direction via the Cloud Map SDS ARN — no cycle;
   `trimsuffix` because the stage `invoke_url` carries a trailing slash and the backend
   concatenates `/v1/auth/link…`).
3. `terraform apply -var app_image_tag=<meal-plan image tag>` → registers `vita:8` and rolls
   the service. Expected plan: **task-def replace + service update only** (the plan diff vs the
   drifted `vita:7` is large but must contain no destroy of anything except the old task-def rev).

## 3. Deploy runbook (from this machine, backend image already in ECR)

Image build/push is the backend recipe (unchanged): `backend/services/vita-api/Dockerfile`,
`docker buildx build --platform linux/arm64`, push to ECR `vita-api` (acct 201261380352,
eu-west-1), tag = committed git SHA. Docker credStore gotcha: use a scoped `DOCKER_CONFIG` dir
with the ECR token inline (`credsStore: "desktop"` hangs non-interactively).

Then, in `devops/services/terraform/envs/prod-eu`: the §2 reconcile, `terraform plan` (review
diff — no destroys beyond old task-def), `apply`, then:

```
aws ecs wait services-stable --cluster vita --services vita --region eu-west-1
```

Watch boot logs for Flyway: `/ecs/vita` must show `Migrating schema … to version "008"` /
`Successfully applied 1 migration` (first boot only) and NO migration error.

## 4. Verify runbook (live probes, post-deploy)

Auth for probes (recipe proven in OPS-022, still valid post-SES): use a **probe address that
SES sandbox rejects** (e.g. `vita-probe-YYYYMMDD@example.com`) — the SES denial triggers the
BE-033 fail-safe, which logs the link (the 2026-07-21 `gmail.coml` incident confirmed this
path live). Then:

1. `POST /v1/auth/magic-link {"email":"<probe>"}` → 202 (rate limit: 3/email/15 min).
2. Fish the token: `aws logs filter-log-events --log-group-name /ecs/vita --region eu-west-1
   --start-time $(($(date +%s000) - 600000)) --filter-pattern '"Magic link"'
   --query 'events[-1].message' --output text`
3. `POST /v1/auth/magic-link/verify {"token":…}` → JWT.

Feature probe sequence (base `https://y9d7tlqsnl.execute-api.eu-west-1.amazonaws.com`), with
expected values pinned to the DESIGN-SPEC bounds heuristic:

| # | Call | Assert |
|---|------|--------|
| 1 | `GET /v1/health` | 200 `{"status":"up"}` |
| 2 | `POST /v1/plan` with the 2-item probe doc below | 201; every item carries a server `id`; eggs `portion == {min:0,max:4,step:1}` (countable: `0..max(2×2, 2+2)` step 1); latte `portion == {min:0,max:400,step:50}` (ml: `0..2×200`, step 50) |
| 3 | `GET /v1/plan` | 200; same ids; no/empty `portions` map |
| 4 | `PUT /v1/plan/portions {"<eggsId>": 3}` | 2xx (exact code per backend v0.6.0 spec; idempotent — repeat = same result) |
| 5 | `GET /v1/plan` | `portions == {"<eggsId>": 3}` |
| 6 | `PUT /v1/plan/portions {"nonexistent-id": 1}` | **422** (unknown itemId rejected) |
| 7 | `POST /v1/plan` (same doc again → new version) | 201; then `GET /v1/plan` → `portions` absent/empty (**reset-on-new-version**, CEO decision #1) and fresh ids |
| 8 | `GET /v1/plan/history` | previous version present, unchanged (frozen) |
| 9 | (cleanup, optional) `DELETE /v1/me` with the probe JWT | 7-day crypto-shred scheduled — keeps prod tidy |

Probe doc (contract field names verified against `vita-api-v0.yaml` `MacroTotals`):

```json
{ "summary": "probe plan - 2 items", "meals": [ { "name": "Breakfast", "time": "07:30",
  "items": [
    { "name": "Scrambled eggs", "quantity": 2, "unit": "egg",
      "nutritionPerUnit": { "kcal": 95, "proteinG": 6.5, "carbsG": 0.8, "fatG": 7 } },
    { "name": "Latte", "quantity": 200, "unit": "ml",
      "nutritionPerUnit": { "kcal": 0.55, "proteinG": 0.033, "carbsG": 0.05, "fatG": 0.018 } } ] } ] }
```

(If the backend spec adds `microsPerUnit` to the probe items, extend the doc accordingly — the
assertions above don't depend on it.)

## 5. CloudWatch checks (incl. parse cost after the bigger prompt)

- **Errors**: Logs Insights on `/ecs/vita`, 24 h after rollout:
  `fields @timestamp, @message | filter @message like /ERROR|Exception/ | sort @timestamp desc | limit 50`
  — expect no new recurring error class (esp. no Flyway/crypto/portions stack traces).
- **Parse health**: watch for 422 upticks on `/v1/parse/eating-plan` after the prompt grows.
  Two known ceilings to watch (backend-owned config, flagged in cross-team notes):
  `plan-max-output-tokens: 2048` (truncation risk with per-item micros on many-item plans) and
  `plan-timeout-seconds: 25` vs the API GW 29 s hard ceiling (bigger prompt = slower call).
- **Parse cost**: `ParseMetrics` records token counters to a **SimpleMeterRegistry — in-memory,
  not exported anywhere** (OPS-015/observability backlog: AMP + Prometheus registry). So there is
  no CloudWatch cost metric today. **Cross-team ask (backend, one line):** log the existing
  counter values at INFO per eating-plan parse — e.g.
  `parse plan=eating outcome={} inputTokens={} outputTokens={}` — then cost is queryable:
  `filter @message like /parse plan=eating/ | stats sum(inputTokens), sum(outputTokens) by bin(1d)`.
  Fallback if backend declines: manual Anthropic-console usage check before/after (not
  AI-queryable — noted as the gap OPS-015 will close properly).

## 6. Rollback

`aws ecs update-service --cluster vita --service vita --task-definition vita:7 --region eu-west-1`
(previous rev; or `terraform apply -var app_image_tag=be035` once §2 lands, keeping TF as owner).

**Additive-migration compatibility claim — verification status:** the DESIGN-SPEC describes the
overlay storage as new per-user, plan-version-scoped encrypted storage; ADR-0002 mandates
expand-only migrations and V004 (the plans tables) followed it. A **new table** is invisible to
the old image's code → rollback-safe. Two caveats, both handled in OPS-024:

1. The backend spec (`backend-spec.md`) was being written in parallel with this one — the
   cross-team consistency check MUST confirm V008 is **CREATE TABLE only (no ALTER of
   `eating_plan`, no NOT NULL column without default on existing tables)**. If it isn't, this
   rollback claim is void and must be re-reviewed.
2. Code-invisible ≠ Flyway-invisible: the old image's Flyway boots against a DB whose
   `flyway_schema_history` contains a version it doesn't know (future-migration validation).
   Don't trust defaults from memory — **rehearse locally before deploying**: apply V008 to a
   local compose Postgres, boot the CURRENT prod image (`vita-api:be035`) against it, confirm
   clean boot. Evidence goes in the OPS-024 ledger. If it fails validation, the fix is a
   one-line `spring.flyway.ignore-migration-patterns: "*:future"` — a backend change to
   request BEFORE the deploy, not after a broken rollback.

## 7. Engineering choices made here (not CEO questions)

- Deploy via Terraform (not another CLI clone) to re-converge 3 sessions of task-def drift —
  keeps "Terraform owns the deploy" true instead of decorative.
- `PUBLIC_BASE_URL` wired from `module.apigw.api_endpoint` (region-agnostic) rather than left
  to the app-yaml default that hardcodes the eu URL.
- Probe uses an SES-sandbox-rejected address to fish the link from CloudWatch — deterministic,
  never touches the CEO inbox, exercises the BE-033 fail-safe on purpose.
- Parse-cost visibility = one INFO log line + Logs Insights now; real metrics pipeline stays
  in the OPS-015/observability ticket (AMP workspace, ADOT remote_write, local Grafana).

## Dependencies on other teams

- **Backend**: V008 migration must be CREATE-only (see §6.1); the one-line token-usage INFO
  log (§5); confirm/adjust `plan-max-output-tokens` for the bigger prompt; `PUT /plan/portions`
  success code fixed in their spec (probe step 4 follows it).
- **App**: none (APK build is app-team runbook; no store pipeline by CEO directive).

## Questions for the CEO

None from devops this round. (Carried, unrelated: S3 uploads 30-day lifecycle;
google-/apple-client-config placeholders; SES production access.)
