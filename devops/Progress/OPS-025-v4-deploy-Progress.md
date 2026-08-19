# OPS-025 (+ BE-052) — V4 backend prod deploy (image 05c5e6b → task-def vita:10, Flyway v012)

Asana: OPS-025 (Vita devops board) + BE-052 (image build, devops-executed). Deploy date 2026-08-19.
Baseline before this deploy: task-def `vita:9`, image `vita-api:2ca6def`, Flyway **V009**.

## 1 · BE-052 — image build + push

```
cd backend/services/vita-api && ./gradlew bootJar -x test        # BUILD SUCCESSFUL, 59 MB fat jar
```
Backend tree is at HEAD `05c5e6b` (the later commit `c2806f8` touches **0 backend files** — verified with
`git show --name-only c2806f8 | grep -c '^backend/'` → 0), so the tag `05c5e6b` names the deployed code.

Docker (recurring gotchas, same as 18c/BE-046):
- scoped `DOCKER_CONFIG` (host `credsStore: desktop` hangs non-interactively) with
  `cliPluginsExtraDirs: ["~/.docker/cli-plugins"]` so buildx resolves;
- staged **minimal context** (`.dockerignore` excludes `build/`): jar + `Dockerfile.runtime` copied to a
  scratch dir, built there.

```
docker buildx build --platform linux/arm64 --provenance=false --sbom=false \
  -f <ctx>/Dockerfile.runtime -t 201261380352.dkr.ecr.eu-west-1.amazonaws.com/vita-api:05c5e6b --push <ctx>
```

**New gotcha, worth keeping.** The first push (no flags) produced an **OCI image index**
(`application/vnd.oci.image.index.v1+json`) with an attestation manifest — buildx's current default —
whereas every previously deployed image is a plain `docker.distribution.manifest.v2+json`. Rather than
gamble on the Fargate pull during rollout, the index was deleted (`ecr batch-delete-image`, the image was
seconds old and referenced by nothing) and re-pushed with `--provenance=false --sbom=false`. ECR tag
immutability means you must delete before re-pushing the same tag. **Always pass those two flags.**

Result (verified with `aws ecr describe-images` + `buildx imagetools inspect`):
- tag `vita-api:05c5e6b`
- **digest `sha256:cda12085427c6225ba5884fbcd44d95aea5377479cbdc22e3bd0699900cc8fee`**
- 151 752 813 B, `linux/arm64`, entrypoint `["java","-jar","app.jar"]`, manifest v2 (single arch).

## 2 · Migration gate — V010 + V012 are expand-only

- `V010__log_entry_weight_type.sql` — drops and re-adds `log_entry_type_check` **widened** to include
  `weight`. Widening a CHECK is expand-only (no data can violate the new constraint).
- `V012__user_settings.sql` — `CREATE TABLE user_settings` (user_id PK FK ON DELETE CASCADE,
  `settings_enc bytea`, `updated_at`). New table only.
- **V011 does not exist.** Flyway ignores version gaps by default; verified locally — the boot log reads
  `Successfully applied 11 migrations … now at version v012` with the sequence `…009 → 010 → 012`.
- No `spring.flyway.*` overrides anywhere in `src/main/resources` → stock Spring Boot defaults,
  Flyway **11.14.1** (read out of the fat jar).
- **No destructive change → no CEO drop/recreate approval needed this round.**

## 3 · Rollback rehearsal (done BEFORE the apply) — PASS

Local `docker compose up -d postgres`, fresh DB `rehearse`:
1. Booted the **new** jar against it → applied V001…V012, `now at version v012`, app started.
2. Booted the **same** jar with `--spring.flyway.locations=filesystem:<dir with V001..V009 only>` —
   this reproduces exactly the migration set the old image (`2ca6def`) resolves:
```
DbValidate : Successfully validated 11 migrations
DbMigrate  : Current version of schema "public": 012
DbMigrate  : WARN Schema "public" has a version (012) that is newer than the latest available migration (009) !
DbMigrate  : Schema "public" is up to date. No migration necessary.
Started VitaApiApplicationKt in 2.895 seconds
```
**Verdict: rollback is safe.** Flyway 11's default `ignoreMigrationPatterns = *:future:ignore` downgrades
future migrations to a WARN — no `ignoreMigrationPatterns` override needed (unlike the note the OPS-024
precedent allowed for). Rollback procedure stays the one-liner:
`app_image_tag = "2ca6def"` + `terraform apply`.

*Honest caveat (not tested, ~minutes of exposure in a real rollback):* rows the new image writes that the old
one has no concept of — `log_entry.type = 'weight'` and the `user_settings` table — would be read back by the
old image's list path. The schema tolerates it; whether the old deserializer skips or errors on a `weight`
row was not exercised (time-boxed). If a rollback is ever needed *after* a weight entry exists, delete the
weight rows first. Cheap and unlikely — no real user has one.

## 4 · Terraform

Diff = **one line**, `envs/prod-eu/variables.tf`: `app_image_tag "2ca6def" → "05c5e6b"`. Nothing else.

`terraform plan` → **1 to add, 1 to change, 1 to destroy**, exactly:
```
['update']            module.ecs.aws_ecs_service.this
['delete', 'create']  module.ecs.aws_ecs_task_definition.this
```
The only forcing diff inside the task definition is the image
(`…/vita-api:2ca6def` → `…/vita-api:05c5e6b`); the rest of the container-definition diff is AWS-normalized
empty collections (`mountPoints: []`, `systemControls: []`, `hostPort`) that ECS re-adds on registration —
same cosmetic noise as BE-046. Only warning: the pre-existing `failure_threshold` deprecation on
`aws_service_discovery_service`.

`terraform apply` → `Apply complete! Resources: 1 added, 1 changed, 1 destroyed.`
Rollout polled to stable: **task-def `vita:10`**, PRIMARY `COMPLETED`, 1/1 running, `vita:9` drained
(2 deployments → 1 at 16:02, ~4 min).

## 5 · Prod probes (all green)

| # | Probe | Result |
|---|---|---|
| 1 | `GET /health` | `{"status":"up"}` **200** |
| 2 | Flyway boot line | `Successfully applied 2 migrations to schema "public", now at version v012` |
| 3 | `GET /v1/privacy` (no auth) | **200**, `text/html;charset=UTF-8`, 3 243 B |
| 4 | Magic link (disposable probe `probe-ops025@vita-probe.test`) | 202 → SES sandbox rejects the unverified recipient → BE-033 fail-safe logs the https link (as designed) → `POST /auth/magic-link/verify` **200** (accessToken/refreshToken/expiresIn) |
| 5 | `POST /entries` weight, `Idempotency-Key: weight:2026-08-19` | **201**, `detail:{kg:78.4}`, `source:"user"` |
| 6 | `GET /entries?type=weight` | 200, the row, detail verbatim |
| 7 | `PATCH /entries/{id}` `{kg:77.9}` | **200**, detail updated, `updatedAt` bumped |
| 8 | Idempotency: same key + **different** body | **409** (correct per contract); same key + identical body → **200 same id** (`db9aea61…`) |
| 9 | `POST /entries` meal `planMealId:"m-3"`, `planStatus:"skipped"`, `items:[]` | **201** — empty items accepted (0.8.0 minItems 0), totals zeroed |
| 10 | `GET /entries/{id}` readback | verbatim: `{"title":"Almoço","items":[],"totals":{0,0,0,0},"planMealId":"m-3","planStatus":"skipped"}` |
| 11 | `GET /v1/me/settings` (fresh user) | 200 `{}` |
| 12 | `PUT` then `GET /v1/me/settings` | 200 / 200, opaque blob round-trips byte-identical (`{"settings":{"recapStartHour":21,"habits":["water"],"probe":"ops025"}}`) |
| 13 | **PDF money path** vs the real `docs/v4/meal-plan.pdf` | `POST /uploads` 200 → presigned `PUT` **200** → `POST /parse/eating-plan` **202** jobId `774ba1ee…` → poll `{"state":"done"}` (~2.5 min) → `GET /plan` **200 status `review`**: **5 meals, ids `m-1`…`m-5`**, 4 options, 42 items, hydration 2500 ml, 3 supplements, dailyTotals **1716 / 188.6 / 153.4 / 47.9** — identical to the v3 baseline **plus** the new stable meal ids |
| 14 | Plan-aware capture `POST /parse/text` "almocei como planejado mas troquei o milho por batata doce" | **200** → 1 meal draft, **`planMealId: "m-3"`, `planStatus: "adjusted"`**, full composition with `replacesItemId` on every item — the swap resolved to **`Batata doce cozida no vapor` replaces `it-3`** (the corn) |
| 15 | Parse cost INFO lines queryable | plan: `parse plan=eating outcome=ok inputTokens=32822 outputTokens=15972` (under the 20480 cap); capture: `parse capture=text outcome=success plan=true inputTokens=3491 outputTokens=574` |

Probe note: the job poll field is **`state`** (`{"state":"done","failureReason":null}`), not `status` — a
poll loop keyed on `status` silently reads `None` forever. Recorded here so the next probe script gets it right.

**Cleanup:** the 3 probe entries DELETEd (204 each; `GET /entries` → 0 items). The disposable probe account
and its parsed plan stay in the prod DB, per the A2 precedent (BE-046 did the same).

## 6 · Cost

No infra delta — same single Fargate task, same footprint. Prod stays **≈ $19/mo** (RDS free tier),
**≈ $34/mo** when the 12-month free tier lapses. Each real eating-plan parse ≈ $0.30–0.34 of Claude tokens;
a plan-aware text capture ≈ 3.5k in / 0.6k out (rounding error).

## 7 · Rollback (if needed)

`envs/prod-eu/variables.tf` → `app_image_tag = "2ca6def"` → `terraform plan` (expect 1/1/1) → `apply`.
Rehearsed above: the old migration set boots clean against a v012 schema. Delete any `weight` entries first
(see §3 caveat).

## 8 · Left dirty for the orchestrator to commit

- `devops/services/terraform/envs/prod-eu/variables.tf` (the tag bump)
- `devops/Progress/OPS-025-v4-deploy-Progress.md` (this file)
- `devops/Next_session.md`
