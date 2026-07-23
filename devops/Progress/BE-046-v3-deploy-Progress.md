# BE-046 — V3 backend prod deploy (Terraform reconcile, image 2ca6def → vita:9)

Asana: BE-046 (Vita backend board). DevOps-executed deploy of the V3 backend round
(BE-043/044/045 + review fixes). Deploy date 2026-07-23.

## What shipped
- **Image:** built arm64 from the committed HEAD `2ca6def` (backend identical to c3e3bcd):
  host `./gradlew bootJar -x test` → 59 MB fat jar → `Dockerfile.runtime` over a staged
  minimal context (the `.dockerignore` excludes `build/`, so jar + Dockerfile were copied
  into a scratch dir and built there) → `docker buildx build --platform linux/arm64 --push`.
  - ECR `vita-api:2ca6def`, **digest `sha256:20be0ebacd01b5c5a744eab5011f9efb2b2256d81e48aa417e971be551391e76`**,
    ~152 MB, config confirmed `arch=arm64 os=linux`.
  - Docker gotchas reused from session 18c: scoped `DOCKER_CONFIG` (host `credsStore: desktop`
    hangs non-interactively) with `cliPluginsExtraDirs` pointing at `~/.docker/cli-plugins`
    so buildx resolves.

## Terraform
- Single change: `envs/prod-eu/variables.tf` `app_image_tag` `b56e2f5` → `2ca6def`.
  TF was already reconciled by OPS-024 (PUBLIC_BASE_URL wired, no CLI drift), so the plan was clean.
- **Plan: 1 add / 1 change / 1 destroy** = task-def replacement (only forcing diff = the image
  tag) + ECS service update to the new revision + deregister of the old rev. NOTHING else
  (no RDS / SSM / security-group / SES / apigw resource changes — the only apigw line was a
  pre-existing `failure_threshold` deprecation warning). Applied.
- **Task-def now `vita:9`.** Rollout COMPLETED, 1/1 running, old vita:8 drained.

## Verification (live prod)
- `GET /health` → `{"status":"up"}` 200.
- **V009 applied on boot** (CloudWatch `/ecs/vita`):
  `Successfully applied 1 migration to schema "public", now at version v009` (plan_parse_job,
  expand-only new table).
- **Prod probe — full v3 async import end-to-end (the acceptance proof):**
  1. Magic link for a disposable probe email (`probe-be046@vita-probe.test`) → SES sandbox
     403 for the unverified recipient → BE-033 fail-safe logged `.../v1/auth/link?token=…`
     (as designed) → verify → session.
  2. `POST /v1/uploads` → presigned S3 PUT → `PUT` the real `docs/v3/design_handoff_vita_v3/meal-plan.pdf` → **HTTP 200**.
  3. `POST /v1/parse/eating-plan {fileRef}` → **202 + jobId** `9dc0b8e1-…`.
  4. Polled `GET /parse/eating-plan/jobs/{jobId}` every 3 s → `done` after **~3.2 min**.
  5. `GET /plan` → **status `review`**, **5 meals**, **4 options**, hydration **2500 ml**,
     **3 supplements** (Creatina / Ômega-3 / Vitamina D), **dailyTotals 1716 kcal / P 188.6 /
     C 153.4 / F 47.9** — the whole §6.1 table held. **42 items, ids `it-1`…`it-42`**, every
     base+option item has portion bounds `{min,max,step}` (it-1 Banana → 0/3/1). **308 swap
     options**, all `{name,quantity?,unit?,grams?}` with **no bounds** (à-vontade swaps → no
     bounds property holds).
  6. **Parse cost INFO line queryable** (Logs Insights):
     `PlanParseService : parse plan=eating outcome=ok inputTokens=32822 outputTokens=16884`
     — outputTokens **16884**, under the 20480 cap (~17% headroom).

Probe account + parsed plan left in prod DB (disposable per A2).

## Cost
No infra delta — same 1 Fargate task, same footprint. Prod stays ~$19/mo (RDS free tier).
Each real v3 eating-plan parse spends ~$0.30–0.34 on Claude (Sonnet-class, ~33k in / ~17k out).
