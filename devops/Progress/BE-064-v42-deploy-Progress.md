# BE-064 — v4.2 backend prod deploy (image 5be5a54 → task-def vita:11, Flyway v014)

Asana: BE-064 (Vita backend board, gid `1217795455393573`), devops-executed. Deploy date 2026-08-24.
Baseline before this deploy: task-def `vita:10`, image `vita-api:05c5e6b`, Flyway **V012**.

## 1 · Image build + push

```
cd backend/services/vita-api && ./gradlew bootJar -x test     # BUILD SUCCESSFUL, 59 219 469 B fat jar
```
Tree at HEAD `5be5a54` (the v4.2 backend review-fix commit) — the tag names the deployed code.

Same recipe as vita:10, no new gotchas: scoped `DOCKER_CONFIG` with `cliPluginsExtraDirs` (the host
`credsStore: desktop` hangs non-interactively), staged minimal context (jar + `Dockerfile.runtime` copied
to a scratch dir, because `.dockerignore` excludes `build/`), and **`--provenance=false --sbom=false`**
so buildx emits a plain manifest instead of an OCI image index.

```
docker buildx build --platform linux/arm64 --provenance=false --sbom=false \
  -f <ctx>/Dockerfile.runtime -t 201261380352.dkr.ecr.eu-west-1.amazonaws.com/vita-api:5be5a54 --push <ctx>
```

Verified with `aws ecr describe-images` + `buildx imagetools inspect`:
- tag `vita-api:5be5a54`
- **digest `sha256:8b8657fef7c7e98fdabc49ca22eb453eeffb8211594b1be3fff4dc8b50b1341b`**
- 151 937 403 B · `linux/arm64` · entrypoint `["java","-jar","app.jar"]`
- **`application/vnd.docker.distribution.manifest.v2+json`**, single arch — the flags did their job on the
  first push this time, so no delete-and-repush dance.

## 2 · Migration gate — V013 + V014 are expand-only

Both are `CREATE TABLE` + seed `INSERT` only (`food`/`food_alias`/`food_estimate_cache`,
`exercise`/`exercise_muscle`/`exercise_estimate_cache`, plus `CREATE EXTENSION IF NOT EXISTS pg_trgm`).
Nothing dropped, nothing altered, no user table touched — **no CEO drop/recreate approval needed**.
The seeds are public reference data in plaintext; no user column exists to encrypt (ADR-0020).

## 3 · Terraform

Diff = **one line**, `envs/prod-eu/variables.tf`: `app_image_tag "05c5e6b" → "5be5a54"`. Nothing else.

`terraform plan` → **1 to add, 1 to change, 1 to destroy**, exactly:
```
['update']            module.ecs.aws_ecs_service.this
['delete', 'create']  module.ecs.aws_ecs_task_definition.this
```
The only forcing diff inside the task definition is the image
(`…/vita-api:05c5e6b` → `…/vita-api:5be5a54`); the rest of the container-definition diff is the usual
AWS-normalized empty collections (`systemControls: []`, `volumesFrom: []`, `hostPort`). Only warning is the
pre-existing `failure_threshold` deprecation on `aws_service_discovery_service`. Identical shape to vita:10.

`terraform apply` → applied; `aws ecs wait services-stable` then polled to
**rollout `COMPLETED`, 1 deployment, 1/1 running, task-def `vita:11`**, `vita:10` drained (~2.5 min).

## 4 · Boot evidence (`/ecs/vita`, eu-west-1)

```
DbMigrate : Migrating schema "public" to version "013 - food tables"
DbMigrate : Migrating schema "public" to version "014 - exercise tables"
DbMigrate : Successfully applied 2 migrations to schema "public", now at version v014 (00:01.484s)
VitaApiApplicationKt : Started VitaApiApplicationKt in 77.193 seconds
ExerciseLookup : seed table=exercise rows=915 muscles=2534 aliases=53
FoodLookup     : seed table=food rows=592 aliases=74
```
`GET /health` (API GW root) → `{"status":"up"}` **200**.

## 5 · Prod probes (all green)

Probe account `probe-be064-20260824@example.com`, created through the magic-link flow: SES sandbox rejects
the unverified recipient → the BE-033 fail-safe logs the https link (as designed) → `POST
/auth/magic-link/verify` → JWT. **The CEO's real account was never read or written** — every probe below is
on the probe JWT.

| # | Probe | Result |
|---|---|---|
| a | `POST /v1/plan`, backend-plan §1.1 hand-built body | **201** — `m-1`/`m-2`, `it-1`/`it-2`, Oats `portion {0,120,10}`, Egg `{0,4,1}`, **empty Supper preserved as `items: []`** (D1 live), `kcal 235`/`kcalEstimated true` + `155`/`false` echoed, `status: "ready"` |
| a′ | `GET /v1/plan` (probe only) | meals array identical to the POST response |
| b | `POST /v1/program` + `GET` | **201** — `durationMin: 30` + `wholeBody: true` on Muay thai, **`traps` survives as its own muscle** on Face pull (D6 alias drop live), unmapped "Pole dance" left bare, derived `muscles` mirror emitted by the normalizer |
| c | `POST /v1/estimate/food-kcal`, 12 PT-BR staples | **200 in 2.27 s**, all 12 non-null, all multiples of 5: aveia 60 g **235**, pão francês 1 un **150**, leite integral 200 ml **120**, feijão carioca 100 g **75**, arroz 100 g **130**, água 500 ml **5**, banana 1 un **90**, frango grelhado 100 g **160**, batata doce 150 g **115**, tapioca 50 g **175**, queijo minas 30 g **80**, azeite 10 ml **90**. Log: `estimate kind=food items=12 tableHits=11 cacheHits=0 misses=1 answered=12 inputTokens=960 outputTokens=48` |
| d | the same 12 again | **198 ms**, byte-identical numbers, `tableHits=11 cacheHits=1 misses=0 inputTokens=0 outputTokens=0` — write-back cache confirmed: every miss is a miss exactly once |
| e | `POST /v1/estimate/exercise-muscles ["squat","pole dance"]` | squat → quads/glutes **primary**, core secondary, **`estimated: false`** (catalog); pole dance → `muscleRoles: []`, **`estimated: true`**. Log: `catalogHits=1 misses=1 in/out 1040/52` |
| f | `POST /v1/estimate/workout-kcal`, 4-exercise days | all-catalog day (squat 4×8, bench 4×10, deadlift 3×5, plank 5 min) → **155 kcal in 425 ms**, `model=false`, **zero tokens**; day with an unknown name (squat, bench, Muay thai 30 min, Pole dance 20 min) → **520 kcal in 8.2 s**, one call for the whole day, `catalogHits=3 misses=1 model=true in/out 855/35`. Both integer multiples of 5 |

The C1 review fix is visibly holding in prod: **arroz = 130**, not the raw-grain 358 the pre-fix fuzzy matcher
returned. Water floors at 5 as specified rather than 0.

**One observation, not a failure** (relayed to the app team on BE-063): the model answered pole dance with
`wholeBody: true` *and* an empty `muscleRoles`. Harmless — an empty list already means "not mapped" and the app
renders that unchanged — but `wholeBody` can be `true` with no roles, so no client should treat the two as
coupled.

**Cleanup:** no entries were created, so nothing to delete. The probe account, its hand-built plan and its
program stay in the prod DB per the A2 precedent (OPS-025/BE-046 did the same).

## 6 · Cost

No infra delta — same single Fargate task. Prod stays **≈ $19/mo** (RDS free tier), **≈ $34/mo** when the
12-month free tier lapses. The estimation layer's marginal cost measured live: a 12-item pass with one miss
was 960 in / 48 out tokens on `claude-haiku-4-5` (≈ $0.001), and the repeat pass cost **zero** — the cache
makes a name free forever after its first miss. Well inside the $40 budget alarm.

## 7 · Rollback (if needed)

`envs/prod-eu/variables.tf` → `app_image_tag = "05c5e6b"` → `terraform plan` (expect 1/1/1) → `apply`.
Not re-rehearsed this round: V013/V014 are pure additions, so the old image simply never queries those tables,
and Flyway's default `ignoreMigrationPatterns = *:future:ignore` boots it against a v014 schema (rehearsed in
full for the V010/V012 pair in OPS-025 §3). No data written by the new image is unreadable to the old one —
the estimate endpoints persist nothing user-owned.

## 8 · Left dirty for the orchestrator to commit

- `devops/services/terraform/envs/prod-eu/variables.tf` (the tag bump)
- `devops/Progress/BE-064-v42-deploy-Progress.md` (this file)
- `devops/Next_session.md`
